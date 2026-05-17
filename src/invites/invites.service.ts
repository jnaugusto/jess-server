import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { eq, and, isNull, desc, gt } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { driverInvites, drivers, users, userSettings } from '../database/schema';
import { MailService } from '../common/mail/mail.service';
import { InviteDriverDto } from '../drivers/dto/invite-driver.dto';
import { env } from '../env';

@Injectable()
export class InvitesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly authService: AuthService,
  ) {}

  async listPending(userId: string) {
    return this.db.db
      .select()
      .from(driverInvites)
      .where(
        and(
          eq(driverInvites.ownerUserId, userId),
          isNull(driverInvites.acceptedAt),
          isNull(driverInvites.revokedAt),
        ),
      )
      .orderBy(desc(driverInvites.createdAt));
  }

  async createInvite(userId: string, inviterName: string, dto: InviteDriverDto) {
    if (dto.mode === 'email' && !dto.email) {
      throw new BadRequestException('Email is required when mode is "email".');
    }

    // Auto-generate driver code if not provided (e.g. DRV-01, DRV-02, …)
    if (!dto.code) {
      const existingCodes = await this.db.db
        .select({ code: drivers.code })
        .from(drivers)
        .where(eq(drivers.ownerUserId, userId));
      const used = new Set(existingCodes.map((r) => r.code).filter(Boolean));
      let n = 1;
      while (used.has(`DRV-${String(n).padStart(2, '0')}`)) n++;
      dto.code = `DRV-${String(n).padStart(2, '0')}`;
    }

    const token = crypto.randomUUID();
    const expiresAt = this.computeExpiry(dto.expiresIn);
    const id = crypto.randomUUID();

    const [invite] = await this.db.db
      .insert(driverInvites)
      .values({
        id,
        ownerUserId: userId,
        email: dto.email,
        fullName: dto.fullName,
        code: dto.code,
        assignedVehicleId: dto.assignedVehicleId,
        role: dto.role,
        message: dto.message,
        mode: dto.mode,
        token,
        expiresAt,
      })
      .returning();

    const acceptUrl = `${env.PUBLIC_WEB_URL}/invite/${token}`;

    if (dto.mode === 'email' && dto.email) {
      await this.mail.sendDriverInvite({
        to: dto.email,
        inviterName,
        fullName: dto.fullName,
        code: dto.code,
        acceptUrl,
        message: dto.message,
        expiresInLabel: dto.expiresIn ?? '7d',
      });
    }

    return { id: invite.id, token, url: acceptUrl };
  }

  async resendInvite(userId: string, inviterName: string, inviteId: string) {
    const [invite] = await this.db.db
      .select()
      .from(driverInvites)
      .where(
        and(eq(driverInvites.id, inviteId), eq(driverInvites.ownerUserId, userId)),
      )
      .limit(1);

    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.acceptedAt) throw new BadRequestException('Invite already accepted.');
    if (invite.revokedAt) throw new BadRequestException('Invite was revoked.');
    if (!invite.email) throw new BadRequestException('No email on this invite.');

    const acceptUrl = `${env.PUBLIC_WEB_URL}/invite/${invite.token}`;

    await this.mail.sendDriverInvite({
      to: invite.email,
      inviterName,
      fullName: invite.fullName,
      code: invite.code,
      acceptUrl,
      message: invite.message ?? undefined,
      expiresInLabel: 'remaining time',
    });

    return { success: true };
  }

  async revokeInvite(userId: string, inviteId: string) {
    const [invite] = await this.db.db
      .update(driverInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(driverInvites.id, inviteId), eq(driverInvites.ownerUserId, userId)),
      )
      .returning();
    if (!invite) throw new NotFoundException('Invite not found.');
    return invite;
  }

  /**
   * Mark an invite as opened (first click of the invite link).
   * Called when the driver visits the invite URL — even before they have an account.
   * Sets openedAt once; subsequent calls are idempotent.
   */
  async openInvite(token: string) {
    const [invite] = await this.db.db
      .select()
      .from(driverInvites)
      .where(eq(driverInvites.token, token))
      .limit(1);

    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.revokedAt) throw new GoneException('Invite has been revoked.');
    if (invite.expiresAt < new Date()) throw new GoneException('Invite has expired.');
    if (invite.acceptedAt) throw new GoneException('Invite already accepted.');

    if (!invite.openedAt) {
      await this.db.db
        .update(driverInvites)
        .set({ openedAt: new Date() })
        .where(eq(driverInvites.id, invite.id));
    }

    return {
      id: invite.id,
      fullName: invite.fullName,
      email: invite.email ?? null,
      code: invite.code,
      role: invite.role,
      message: invite.message,
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * Check the status of an email address for the driver app login flow.
   *
   * Returns:
   *  - { status: 'existing' }  — has an account + driver record → show password field
   *  - { status: 'invited', inviteToken, ownerName } — pending invite, no account yet → show create-password
   *  - { status: 'none' }  — no invite found → show error
   */
  async checkEmailStatus(email: string): Promise<
    | { status: 'existing' }
    | { status: 'invited'; inviteToken: string; ownerName: string }
    | { status: 'none' }
  > {
    const normalizedEmail = email.toLowerCase().trim();

    // Does a user account exist for this email?
    const [user] = await this.db.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (user) {
      // Account exists → always sign in, regardless of how many fleets they're in.
      // The fleet selector shown before tracking handles which context to use.
      // Fleet owners who have no driver record will be rejected at sign-in by the
      // driver-only guard on POST /drivers/sign-in.
      return { status: 'existing' };
    }

    // No account yet — look for a valid pending invite for this email.
    const [invite] = await this.db.db
      .select({
        token: driverInvites.token,
        ownerUserId: driverInvites.ownerUserId,
      })
      .from(driverInvites)
      .where(
        and(
          eq(driverInvites.email, normalizedEmail),
          isNull(driverInvites.acceptedAt),
          isNull(driverInvites.revokedAt),
          gt(driverInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invite) return { status: 'none' };

    // Prefer the org name the owner set in settings; fall back to their display name.
    const [settings] = await this.db.db
      .select({ orgName: userSettings.orgName })
      .from(userSettings)
      .where(eq(userSettings.userId, invite.ownerUserId))
      .limit(1);

    const [owner] = await this.db.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, invite.ownerUserId))
      .limit(1);

    const ownerName = settings?.orgName || owner?.name || 'your fleet';

    return { status: 'invited', inviteToken: invite.token, ownerName };
  }

  async lookupByToken(token: string) {
    const [invite] = await this.db.db
      .select()
      .from(driverInvites)
      .where(eq(driverInvites.token, token))
      .limit(1);

    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.revokedAt) throw new GoneException('Invite has been revoked.');
    if (invite.expiresAt < new Date()) throw new GoneException('Invite has expired.');
    if (invite.acceptedAt) throw new GoneException('Invite already accepted.');

    return {
      id: invite.id,
      fullName: invite.fullName,
      email: invite.email ?? null,
      code: invite.code,
      role: invite.role,
      message: invite.message,
      expiresAt: invite.expiresAt,
    };
  }

  /** Create a Better Auth account and accept the invite in one shot. */
  async registerAndAccept(token: string, password: string) {
    // 1. Validate invite
    const [invite] = await this.db.db
      .select()
      .from(driverInvites)
      .where(eq(driverInvites.token, token))
      .limit(1);

    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.revokedAt) throw new GoneException('Invite has been revoked.');
    if (invite.expiresAt < new Date()) throw new GoneException('Invite has expired.');
    if (invite.acceptedAt) throw new GoneException('Invite already accepted.');
    if (!invite.email) {
      throw new BadRequestException(
        'This invite has no email address. Contact your fleet owner.',
      );
    }

    // 2. Create Better Auth account (handles password hashing, session creation)
    let signUpData: { token: string | null; user: { id: string } };
    try {
      signUpData = (await (this.authService.api as any).signUpEmail({
        body: { email: invite.email, password, name: invite.fullName },
        asResponse: false,
      })) as { token: string | null; user: { id: string } };
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status === 422 || status === 409) {
        throw new ConflictException(
          'An account with this email already exists. Try signing in instead.',
        );
      }
      throw new InternalServerErrorException('Failed to create account. Please try again.');
    }

    const newUserId = signUpData.user.id;

    // 3. Guard against duplicate registration for the same fleet.
    await this.assertNotAlreadyInThisFleet(newUserId, invite.ownerUserId);

    // 4. Create driver record + mark invite accepted — one transaction
    const driverId = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(drivers).values({
        id: driverId,
        ownerUserId: invite.ownerUserId,
        driverUserId: newUserId,
        fullName: invite.fullName,
        code: invite.code,
        status: 'active',
        assignedVehicleId: invite.assignedVehicleId,
      });

      await tx
        .update(driverInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: newUserId })
        .where(eq(driverInvites.id, invite.id));
    });

    // Resolve the fleet name for the welcome screen.
    const [settings] = await this.db.db
      .select({ orgName: userSettings.orgName })
      .from(userSettings)
      .where(eq(userSettings.userId, invite.ownerUserId))
      .limit(1);

    const [owner] = await this.db.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, invite.ownerUserId))
      .limit(1);

    const ownerName = settings?.orgName || owner?.name || 'your fleet';

    return { sessionToken: signUpData.token, driverId, ownerName };
  }

  async acceptInvite(token: string, acceptingUserId: string) {
    const [invite] = await this.db.db
      .select()
      .from(driverInvites)
      .where(eq(driverInvites.token, token))
      .limit(1);

    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.revokedAt) throw new GoneException('Invite has been revoked.');
    if (invite.expiresAt < new Date()) throw new GoneException('Invite has expired.');
    if (invite.acceptedAt) throw new GoneException('Invite already accepted.');

    await this.assertNotAlreadyInThisFleet(acceptingUserId, invite.ownerUserId);

    const driverId = crypto.randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(drivers).values({
        id: driverId,
        ownerUserId: invite.ownerUserId,
        driverUserId: acceptingUserId,
        fullName: invite.fullName,
        code: invite.code,
        status: 'active',
        assignedVehicleId: invite.assignedVehicleId,
      });

      await tx
        .update(driverInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: acceptingUserId })
        .where(eq(driverInvites.id, invite.id));
    });

    return { driverId };
  }

  /** Throws if the user is already a driver in this specific fleet (owner). */
  private async assertNotAlreadyInThisFleet(userId: string, ownerUserId: string): Promise<void> {
    const [existing] = await this.db.db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.driverUserId, userId), eq(drivers.ownerUserId, ownerUserId)))
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'You are already a driver in this fleet.',
      );
    }
  }

  private computeExpiry(expiresIn?: string): Date {
    const now = new Date();
    switch (expiresIn) {
      case '24h':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      case 'never':
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      case '7d':
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }
}

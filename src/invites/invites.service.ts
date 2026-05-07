import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { driverInvites, drivers } from '../database/schema';
import { MailService } from '../common/mail/mail.service';
import { InviteDriverDto } from '../drivers/dto/invite-driver.dto';
import { env } from '../env';

@Injectable()
export class InvitesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
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
      code: invite.code,
      role: invite.role,
      message: invite.message,
      expiresAt: invite.expiresAt,
    };
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

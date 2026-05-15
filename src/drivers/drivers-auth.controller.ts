import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, AuthService } from '@thallesp/nestjs-better-auth';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { drivers, users } from '../database/schema';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Driver-specific sign-in endpoint for the mobile app.
 *
 * Wraps Better Auth's standard sign-in with one extra guard:
 * the authenticated user must have a driver record. Fleet owners
 * (who only appear as ownerUserId in the drivers table) are rejected
 * so they can't accidentally log in to the driver app.
 */
@ApiTags('drivers-auth')
@Controller('auth/driver')
export class DriversAuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('sign-in')
  @ApiOperation({ summary: 'Driver-only sign-in for the mobile app' })
  @ResponseMessage('Signed in.')
  async signIn(@Body() body: { email: string; password: string }) {
    // ── Step 1: pre-flight driver check ────────────────────────────────────
    // If the email belongs to an existing user who is NOT a driver, reject
    // before even touching the password — no session is created that would
    // need to be cleaned up.
    const [existingUser] = await this.db.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase().trim()))
      .limit(1);

    if (existingUser) {
      const [driverRecord] = await this.db.db
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.driverUserId, existingUser.id))
        .limit(1);

      if (!driverRecord) {
        throw new ForbiddenException(
          'This app is for drivers only. Please use the web dashboard to manage your fleet.',
        );
      }
    }

    // ── Step 2: let Better Auth validate credentials + create session ───────
    let signInData: { token: string | null; user: { id: string; name: string; email: string } };
    try {
      signInData = (await (this.authService.api as any).signInEmail({
        body: { email: body.email, password: body.password },
        asResponse: false,
      })) as typeof signInData;
    } catch {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return {
      token: signInData.token,
      user: {
        id: signInData.user.id,
        name: signInData.user.name,
        email: signInData.user.email,
      },
    };
  }
}

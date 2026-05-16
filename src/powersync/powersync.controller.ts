import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import { PowerSyncService, PowerSyncTransaction } from './powersync.service';

@ApiTags('powersync')
@UseGuards(AuthGuard)
@Controller('powersync')
export class PowerSyncController {
  private readonly logger = new Logger(PowerSyncController.name);

  constructor(private readonly powerSyncService: PowerSyncService) {}

  @Get('token')
  @ApiOperation({ summary: 'Get a temporary PowerSync JWT' })
  async getToken(@Session() session: UserSession) {
    const userId = session.user.id;
    const token = await this.powerSyncService.generateToken(userId);
    return { token };
  }

  @SkipThrottle()
  @Post('upload')
  @ApiOperation({ summary: 'Upload local changes from PowerSync' })
  async upload(@Body() body: PowerSyncTransaction, @Session() session: UserSession) {
    const userId = session.user.id;
    try {
      await this.powerSyncService.handleUpload(userId, body);
    } catch (e) {
      this.logger.error(
        `Upload failed for user ${userId}: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e.stack : undefined,
      );
      throw e;
    }
    return { success: true };
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { PowerSyncService, PowerSyncTransaction } from './powersync.service';

@ApiTags('powersync')
@UseGuards(AuthGuard)
@Controller('powersync')
export class PowerSyncController {
  constructor(private readonly powerSyncService: PowerSyncService) {}

  @Get('token')
  @ApiOperation({ summary: 'Get a temporary PowerSync JWT' })
  async getToken(@Session() session: UserSession) {
    const userId = session.user.id;
    const token = await this.powerSyncService.generateToken(userId);
    return { token };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload local changes from PowerSync' })
  async upload(@Body() body: PowerSyncTransaction, @Session() session: UserSession) {
    const userId = session.user.id;
    await this.powerSyncService.handleUpload(userId, body);
    return { success: true };
  }
}

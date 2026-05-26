import { Body, Controller, Delete, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PushService } from './push.service';

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

@UseGuards(AuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@Session() session: UserSession, @Body() body: unknown) {
    const { endpoint, keys } = SubscribeSchema.parse(body);
    await this.pushService.subscribe(session.user.id, endpoint, keys.p256dh, keys.auth);
    return { success: true };
  }

  @Delete('subscribe')
  @HttpCode(200)
  async unsubscribe(@Session() session: UserSession, @Body() body: unknown) {
    const { endpoint } = UnsubscribeSchema.parse(body);
    await this.pushService.unsubscribe(session.user.id, endpoint);
    return { success: true };
  }
}

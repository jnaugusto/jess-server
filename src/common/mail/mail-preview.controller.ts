import { Body, Controller, ForbiddenException, Post, Res } from '@nestjs/common';
import { Public } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { MailService } from './mail.service';

/**
 * Developer-only endpoint that renders an email template and returns the raw
 * HTML so the web dashboard can show a live preview without sending anything.
 *
 * Blocked in production at runtime.
 */
@Controller('dev/email-preview')
export class MailPreviewController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Post('invite')
  async invite(
    @Body()
    body: {
      inviterName: string;
      fullName: string;
      acceptUrl: string;
      message?: string;
      expiresInLabel: string;
    },
    @Res() res: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Email preview is not available in production.');
    }

    const html = await this.mail.renderDriverInvite(body);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

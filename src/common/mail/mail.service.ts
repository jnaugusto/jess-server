import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from '../../env';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor() {
    if (env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY);
    }
  }

  async sendDriverInvite(opts: {
    to: string;
    inviterName: string;
    fullName: string;
    code: string;
    acceptUrl: string;
    message?: string;
    expiresInLabel: string;
  }) {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not configured — skipping email send');
      return null;
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom: 8px;">You've been invited to Meridian</h2>
        <p><strong>${opts.inviterName}</strong> invited you to join as a driver.</p>
        <table style="margin: 16px 0; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Name</td><td>${opts.fullName}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Code</td><td>${opts.code}</td></tr>
        </table>
        ${opts.message ? `<p style="background: #f5f5f5; padding: 12px; border-radius: 8px; font-style: italic;">"${opts.message}"</p>` : ''}
        <a href="${opts.acceptUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">Accept Invite</a>
        <p style="color: #999; font-size: 12px;">This invite expires in ${opts.expiresInLabel}.</p>
      </div>
    `;

    return this.resend.emails.send({
      from: env.RESEND_FROM,
      to: opts.to,
      subject: `${opts.inviterName} invited you to Meridian`,
      html,
    });
  }
}

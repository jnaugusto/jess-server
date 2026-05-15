import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from '../../env';
import { TemplateService } from '../../template/template.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor(private readonly templates: TemplateService) {
    if (env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY);
    }
  }

  // ── Public send methods ────────────────────────────────────────────────────

  async sendDriverInvite(opts: {
    to: string;
    inviterName: string;
    fullName: string;
    code: string;
    acceptUrl: string;
    message?: string;
    expiresInLabel: string;
  }) {
    const subject = `${opts.inviterName} invited you to Meridian`;
    const html = await this.renderDriverInvite(opts);
    return this.sendEmail(opts.to, subject, html);
  }

  /** Render the driver invite email without sending — used by the preview endpoint. */
  async renderDriverInvite(opts: {
    inviterName: string;
    fullName: string;
    acceptUrl: string;
    message?: string | null;
    expiresInLabel: string;
  }): Promise<string> {
    return this.renderEmail('email/invite', {
      subject: `${opts.inviterName} invited you to Meridian`,
      fullName: opts.fullName,
      inviterName: opts.inviterName,
      acceptUrl: opts.acceptUrl,
      message: opts.message ?? null,
      expiresInLabel: opts.expiresInLabel,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Render a Handlebars email template with the shared email layout.
   * `year` is injected automatically so templates don't have to ask for it.
   */
  private async renderEmail(
    template: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    return this.templates.render(
      template,
      { ...data, year: new Date().getFullYear() },
      { layout: 'layouts/email' },
    );
  }

  /**
   * Send a pre-rendered HTML email via Resend.
   * Handles the guard check, error logging, and success logging in one place.
   */
  private async sendEmail(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not configured — skipping email send');
      return null;
    }

    const { data, error } = await this.resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(`Resend failed to ${to}: ${JSON.stringify(error)}`);
      return null;
    }

    this.logger.log(`Email sent → ${to} (id: ${data?.id})`);
    return data;
  }
}

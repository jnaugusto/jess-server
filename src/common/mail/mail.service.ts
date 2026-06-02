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

  /**
   * Fetch a received (inbound) email's full content by id. The Resend
   * `email.received` webhook only delivers metadata, so the body (html/text)
   * must be retrieved separately via the Received Emails API.
   */
  async fetchReceivedEmail(id: string): Promise<{
    from?: string;
    to?: string[];
    subject?: string;
    html?: string;
    text?: string;
  } | null> {
    if (!env.RESEND_API_KEY) return null;
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${id}`, {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      if (!res.ok) {
        this.logger.warn(`Received-email fetch failed (${res.status}) for id ${id}`);
        return null;
      }
      return (await res.json()) as {
        from?: string;
        to?: string[];
        subject?: string;
        html?: string;
        text?: string;
      };
    } catch (err) {
      this.logger.error(`Received-email fetch error for id ${id}: ${(err as Error).message}`);
      return null;
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
    const subject = `${opts.inviterName} invited you to Tarales`;
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
      subject: `${opts.inviterName} invited you to Tarales`,
      fullName: opts.fullName,
      inviterName: opts.inviterName,
      acceptUrl: opts.acceptUrl,
      message: opts.message ?? null,
      expiresInLabel: opts.expiresInLabel,
    });
  }

  /**
   * Forward an inbound email (received via the Resend inbound webhook) to the
   * configured destination inbox. Reply-to is set to the original sender so a
   * reply from the inbox goes straight back to them.
   */
  async forwardInbound(opts: {
    from?: string;
    originalTo?: string;
    subject?: string;
    html?: string;
    text?: string;
  }) {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not configured — skipping inbound forward');
      return null;
    }

    const escape = (s = '') =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const subject = opts.subject?.trim() || '(no subject)';
    const meta =
      `<p style="color:#888;font-size:12px;margin:0 0 12px;">Forwarded from jnaugusto.com — from: ${escape(opts.from)}` +
      `${opts.originalTo ? ` · to: ${escape(opts.originalTo)}` : ''}</p>` +
      `<hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;"/>`;
    const body =
      opts.html ??
      (opts.text
        ? `<pre style="white-space:pre-wrap;font-family:sans-serif;">${escape(opts.text)}</pre>`
        : '<p>(no content)</p>');

    const { data, error } = await this.resend.emails.send({
      from: env.CONTACT_FROM,
      to: env.CONTACT_FORWARD_TO,
      replyTo: opts.from || undefined,
      subject: `[jnaugusto] ${subject}`,
      html: meta + body,
      text: opts.text,
    });

    if (error) {
      this.logger.error(`Resend failed to forward inbound mail: ${JSON.stringify(error)}`);
      return null;
    }

    this.logger.log(`Forwarded inbound mail → ${env.CONTACT_FORWARD_TO} (id: ${data?.id})`);
    return data;
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

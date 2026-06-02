import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { MailService } from '../common/mail/mail.service';
import { env } from '../env';

type InboundData = {
  email_id?: string;
  from?: string | { address?: string; email?: string; name?: string };
  to?: string | string[] | { address?: string };
  subject?: string;
  html?: string;
  text?: string;
};

type InboundPayload = { type?: string; data?: InboundData };

/**
 * Verify a Resend (Svix) webhook signature against the raw request body.
 * Returns true if any provided v1 signature matches.
 */
function verifySvixSignature(
  secret: string,
  headers: Record<string, string | string[] | undefined>,
  payload: string,
): boolean {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (typeof id !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  // Header is a space-separated list of "v1,<base64sig>" entries.
  return signature.split(' ').some((entry) => {
    const sig = entry.split(',')[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

@ApiExcludeController()
@Controller('webhooks')
export class InboundController {
  private readonly logger = new Logger(InboundController.name);

  constructor(private readonly mail: MailService) {}

  @Post('resend-inbound')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});

    if (env.RESEND_WEBHOOK_SECRET) {
      if (!verifySvixSignature(env.RESEND_WEBHOOK_SECRET, headers, raw)) {
        this.logger.warn('Rejected inbound webhook — invalid signature');
        throw new UnauthorizedException('Invalid signature');
      }
    } else {
      this.logger.warn('RESEND_WEBHOOK_SECRET not set — skipping signature verification');
    }

    const payload = (req.body ?? {}) as InboundPayload;
    const type = payload.type ?? 'unknown';
    this.logger.log(`Inbound webhook received: ${type}`);

    // Only forward actual inbound received events; ack everything else.
    if (type !== 'unknown' && !/received|inbound/i.test(type)) {
      return { ok: true, ignored: type };
    }

    const data = payload.data ?? {};

    // The email.received webhook delivers metadata only. If the body is not
    // present inline, fetch the full message via the Received Emails API.
    let full = data;
    if (!data.html && !data.text && data.email_id) {
      const fetched = await this.mail.fetchReceivedEmail(data.email_id);
      if (fetched) full = { ...data, ...fetched };
    }

    const from =
      typeof full.from === 'string' ? full.from : (full.from?.address ?? full.from?.email);
    const to = Array.isArray(full.to)
      ? full.to.join(', ')
      : typeof full.to === 'string'
        ? full.to
        : full.to?.address;

    try {
      await this.mail.forwardInbound({
        from,
        originalTo: to,
        subject: full.subject,
        html: full.html,
        text: full.text,
      });
    } catch (err) {
      this.logger.error('Failed to forward inbound mail', err as Error);
      // Still ack so Resend doesn't hammer retries on a transient send failure.
    }

    return { ok: true };
  }
}

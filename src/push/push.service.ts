import { Injectable, Logger } from '@nestjs/common';
import { buildPushHTTPRequest } from '@pushforge/builder';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { pushSubscriptions } from '../database/schema';
import { env } from '../env';

export interface PushNotification {
  title: string;
  body: string;
  /** URL to open on click (default: /live) */
  url?: string;
  /** Icon path relative to the web root (default: /icon-192.png) */
  icon?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Register or refresh a browser push subscription for a user. */
  async subscribe(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
  ): Promise<void> {
    await this.db.db
      .insert(pushSubscriptions)
      .values({ id: randomUUID(), userId, endpoint, p256dh, auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh, auth },
      });
    this.logger.log(`Push subscription registered for user ${userId}`);
  }

  /** Remove a push subscription for a user. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  }

  /**
   * Send a push notification to all subscriptions belonging to userId.
   * Expired subscriptions (HTTP 410) are automatically cleaned up.
   */
  async notify(userId: string, notification: PushNotification): Promise<void> {
    const subs = await this.db.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subs.length === 0) return;

    let privateJWK: JsonWebKey;
    try {
      privateJWK = JSON.parse(env.VAPID_PRIVATE_KEY_JWK) as JsonWebKey;
    } catch {
      this.logger.error('VAPID_PRIVATE_KEY_JWK is not valid JSON — push aborted');
      return;
    }

    const adminContact = `mailto:${env.RESEND_FROM}`;

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message: {
            payload: {
              title: notification.title,
              body: notification.body,
              icon: notification.icon ?? '/icon-192.png',
              url: notification.url ?? '/live',
            },
            adminContact,
          },
        });

        const res = await fetch(endpoint, { method: 'POST', headers, body });

        if (res.status === 410 || res.status === 404) {
          // Subscription expired — clean up silently
          await this.db.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint));
          return;
        }

        if (!res.ok && res.status !== 201) {
          throw new Error(`Push service returned ${res.status}`);
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(
        `${failed.length}/${subs.length} push notification(s) failed for user ${userId}`,
      );
    }
  }
}

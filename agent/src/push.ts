/**
 * DevBridge Agent — Web Push (VAPID)
 */
import webPush, { PushSubscription } from 'web-push';

interface PushPayload {
  title: string;
  body: string;
  data?: unknown;
}

export class PushService {
  private subscriptions = new Map<string, PushSubscription>();
  private ready = false;

  constructor() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL ?? 'mailto:devbridge@localhost';

    if (pub && priv) {
      webPush.setVapidDetails(email, pub, priv);
      this.ready = true;
      console.log('[Push] VAPID keys loaded ✓');
    } else {
      console.warn('[Push] VAPID keys not configured — push notifications disabled');
    }
  }

  subscribe(sub: PushSubscription): void {
    const key = sub.endpoint;
    this.subscriptions.set(key, sub);
    console.log(`[Push] Subscription registered (${this.subscriptions.size} total)`);
  }

  unsubscribe(endpoint: string): void {
    this.subscriptions.delete(endpoint);
  }

  async send(payload: PushPayload): Promise<void> {
    if (!this.ready || this.subscriptions.size === 0) return;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.allSettled(
      [...this.subscriptions.entries()].map(async ([key, sub]) => {
        try {
          await webPush.sendNotification(sub, body);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            dead.push(key);
          } else {
            console.error('[Push] Send error:', err);
          }
        }
      })
    );

    dead.forEach((k) => this.subscriptions.delete(k));
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  }
}

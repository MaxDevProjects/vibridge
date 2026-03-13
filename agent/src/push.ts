/**
 * DevBridge Agent — Web Push (VAPID)
 */
import fs from 'fs'
import path from 'path'
import webPush, { PushSubscription } from 'web-push'

interface PushPayload {
  title: string
  body: string
  data?: unknown
}

export class PushService {
  private subscriptions = new Map<string, PushSubscription>()
  private ready = false
  private readonly subscriptionsFilePath: string

  constructor(dataDir = process.env.DATA_DIR ?? '/tmp/devbridge') {
    this.subscriptionsFilePath = path.join(dataDir, 'push-subscriptions.json')
    this.loadSubscriptions()

    const pub = process.env.VAPID_PUBLIC_KEY
    const priv = process.env.VAPID_PRIVATE_KEY
    const email = process.env.VAPID_EMAIL ?? 'mailto:devbridge@localhost'

    if (pub && priv) {
      webPush.setVapidDetails(email, pub, priv)
      this.ready = true
      console.log('[Push] VAPID keys loaded ✓')
    } else {
      console.warn('[Push] VAPID keys not configured — push notifications disabled')
    }
  }

  subscribe(sub: PushSubscription): void {
    const key = String(sub.endpoint ?? '').trim()
    if (!key) return
    this.subscriptions.set(key, sub)
    this.saveSubscriptions()
    console.log(`[Push] Subscription registered (${this.subscriptions.size} total)`)
  }

  unsubscribe(endpoint: string): void {
    const key = String(endpoint ?? '').trim()
    if (!key) return
    this.subscriptions.delete(key)
    this.saveSubscriptions()
  }

  async send(payload: PushPayload): Promise<void> {
    if (!this.ready || this.subscriptions.size === 0) return

    const body = JSON.stringify(payload)
    const dead: string[] = []

    await Promise.allSettled(
      [...this.subscriptions.entries()].map(async ([key, sub]) => {
        try {
          await webPush.sendNotification(sub, body)
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 410 || statusCode === 404) {
            dead.push(key)
          } else {
            console.error('[Push] Send error:', err)
          }
        }
      }),
    )

    if (dead.length > 0) {
      dead.forEach((k) => this.subscriptions.delete(k))
      this.saveSubscriptions()
    }
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? ''
  }

  private loadSubscriptions(): void {
    try {
      if (!fs.existsSync(this.subscriptionsFilePath)) return
      const raw = fs.readFileSync(this.subscriptionsFilePath, 'utf8')
      if (!raw.trim()) return
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      for (const item of parsed) {
        const sub = item as Partial<PushSubscription>
        const endpoint = String(sub.endpoint ?? '').trim()
        if (!endpoint) continue
        this.subscriptions.set(endpoint, sub as PushSubscription)
      }
      console.log(`[Push] Subscriptions restored: ${this.subscriptions.size}`)
    } catch (err) {
      console.warn('[Push] Failed to load subscriptions:', err)
    }
  }

  private saveSubscriptions(): void {
    try {
      const dir = path.dirname(this.subscriptionsFilePath)
      fs.mkdirSync(dir, { recursive: true })
      const subscriptions = [...this.subscriptions.values()]
      fs.writeFileSync(this.subscriptionsFilePath, JSON.stringify(subscriptions, null, 2), 'utf8')
    } catch (err) {
      console.warn('[Push] Failed to save subscriptions:', err)
    }
  }
}

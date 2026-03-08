/**
 * DevBridge PWA — Service Worker
 * Uses vite-plugin-pwa injectManifest strategy.
 * Handles: precaching, offline fallback, Web Push notifications.
 */
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precache all build assets injected by vite-plugin-pwa
// self.__WB_MANIFEST must appear literally — workbox-build replaces it at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: 'navigation', networkTimeoutSeconds: 3 })
  )
);

// API responses — network first, short timeout
registerRoute(
  ({ url }) => url.pathname.startsWith('/api'),
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 5 })
);

// Static assets — cache first
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style',
  new CacheFirst({ cacheName: 'assets' })
);

// ── Web Push ────────────────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; data?: unknown };
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: 'DevBridge', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'DevBridge', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload.data,
      ...({
        actions: [
          { action: 'reply', title: 'Reply' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      } as unknown as NotificationOptions),
    } as NotificationOptions)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow('/chat');
      })
  );
});

// Skip waiting immediately on update
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string })?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

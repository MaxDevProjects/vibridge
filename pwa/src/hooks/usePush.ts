/**
 * DevBridge PWA — Web Push subscription hook
 */
import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../types';
import { agentBaseUrl } from '../settings';

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function usePush(settings: Settings) {
  const [state, setState] = useState<PushState>('unsubscribed');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
    }
  }, []);

  const subscribe = useCallback(async (vapidPublicKey: string) => {
    if (!('serviceWorker' in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState('denied');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      const base = agentBaseUrl(settings);
      await fetch(`${base}/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.pairingToken ?? ''}`,
        },
        body: JSON.stringify(sub.toJSON()),
      });

      setState('subscribed');
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
    }
  }, [settings]);

  return { state, subscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

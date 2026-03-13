import type { Ref } from 'vue'

interface PushPublicKeyResponse {
  publicKey?: string
}

const isSupported = ref(false)
const permission = ref<NotificationPermission>('default')
const isSubscribed = ref(false)
const isLoading = ref(false)
const error = ref('')

let initialized = false

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function resolveAgentBaseUrl(): string {
  if (import.meta.server) return ''

  const bridge = useDevBridge()
  const active = normalizeBaseUrl(String(bridge.activeUrl.value ?? ''))
  if (/^https?:\/\//i.test(active)) return active

  const stored = normalizeBaseUrl(localStorage.getItem('vb:agentUrl') ?? '')
  if (/^https?:\/\//i.test(stored)) return stored

  const config = useRuntimeConfig()
  const host = window.location.hostname || String(config.public.agentHost)
  const port = String(config.public.agentPort || '3333')
  return `http://${host}:${port}`
}

function authHeaders(): HeadersInit {
  const bridge = useDevBridge()
  const token = bridge.token.value
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker non supporté par ce navigateur')
  }

  try {
    return await navigator.serviceWorker.register('/nuxt-ui/sw.js')
  } catch {
    return navigator.serviceWorker.register('/sw.js')
  }
}

async function refresh() {
  if (!import.meta.client || !isSupported.value) {
    isSubscribed.value = false
    return
  }

  try {
    const registration = await getRegistration()
    const current = await registration.pushManager.getSubscription()
    isSubscribed.value = Boolean(current)
  } catch {
    isSubscribed.value = false
  }
}

async function fetchPublicKey(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/push/public-key`, {
    headers: {
      ...authHeaders(),
      'Cache-Control': 'no-store',
    },
  })

  if (!res.ok) {
    throw new Error(`Impossible de récupérer la clé VAPID (${res.status})`)
  }

  const data = await res.json() as PushPublicKeyResponse
  const key = String(data.publicKey ?? '').trim()
  if (!key) {
    throw new Error('Clé VAPID manquante côté agent')
  }
  return key
}

async function subscribe(): Promise<boolean> {
  if (!import.meta.client) return false

  isLoading.value = true
  error.value = ''

  try {
    if (!isSupported.value) {
      throw new Error('Push notifications non supportées sur ce navigateur')
    }

    if (permission.value === 'denied') {
      throw new Error('Notifications refusées. Activez-les dans les paramètres du navigateur.')
    }

    const requested = await Notification.requestPermission()
    permission.value = requested
    if (requested !== 'granted') {
      throw new Error('Permission notifications refusée.')
    }

    const baseUrl = resolveAgentBaseUrl()
    if (!baseUrl) {
      throw new Error('URL agent introuvable pour enregistrer l’abonnement push')
    }

    const vapidPublicKey = await fetchPublicKey(baseUrl)
    const registration = await getRegistration()

    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    const res = await fetch(`${baseUrl}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(subscription),
    })

    if (!res.ok) {
      throw new Error(`Échec enregistrement abonnement push (${res.status})`)
    }

    isSubscribed.value = true
    return true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    return false
  } finally {
    isLoading.value = false
  }
}

async function unsubscribe(): Promise<boolean> {
  if (!import.meta.client) return false

  isLoading.value = true
  error.value = ''

  try {
    if (!isSupported.value) {
      isSubscribed.value = false
      return true
    }

    const registration = await getRegistration()
    const subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      isSubscribed.value = false
      return true
    }

    const baseUrl = resolveAgentBaseUrl()
    if (baseUrl) {
      await fetch(`${baseUrl}/push/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {})
    }

    await subscription.unsubscribe()
    isSubscribed.value = false
    return true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    return false
  } finally {
    isLoading.value = false
  }
}

async function init() {
  if (!import.meta.client || initialized) return
  initialized = true

  isSupported.value = 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  permission.value = isSupported.value ? Notification.permission : 'default'

  if (isSupported.value) {
    await refresh()
  }
}

export function usePushNotifications(): {
  isSupported: Readonly<Ref<boolean>>
  permission: Readonly<Ref<NotificationPermission>>
  isSubscribed: Readonly<Ref<boolean>>
  isLoading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string>>
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<boolean>
  refresh: () => Promise<void>
} {
  onMounted(() => {
    void init()
  })

  return {
    isSupported: readonly(isSupported),
    permission: readonly(permission),
    isSubscribed: readonly(isSubscribed),
    isLoading: readonly(isLoading),
    error: readonly(error),
    subscribe,
    unsubscribe,
    refresh,
  }
}

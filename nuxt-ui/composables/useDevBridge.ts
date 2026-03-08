/**
 * useDevBridge — transport composable
 * Supports both local agent mode and relay mode.
 */

export type BridgeStatus = 'connecting' | 'connected' | 'disconnected'
export type BridgeMode = 'local' | 'relay'
export type BridgeAuthError = 'invalid_token' | null

export interface WsMessage {
  type: string
  text?: string
  tool?: string
  isQuestion?: boolean
  path?: string
  event?: string
  [key: string]: unknown
}

export interface RelayState {
  enabled: boolean
  relayUrl: string
  sessionId: string
  pairingCode: string
  qrUrl: string
  agentToken: string
  expiresAt: number
  status: 'waiting' | 'paired' | 'closed'
  agentConnected: boolean
  mobileConnected: boolean
  connected: boolean
  lastError: string | null
}

export interface AgentStatus {
  ok: boolean
  adapters: Array<{ id: string; label: string; active: boolean; available?: boolean; reason?: string | null }>
  activeAdapter: string | null
  ideState?: {
    workspaceFolders?: string[]
    activeFile?: string | null
    activeLanguage?: string | null
    activeTerminal?: string | null
    terminals?: Array<{ name: string; shellIntegration?: boolean; cwd?: string | null }>
    updatedAt?: number
  } | null
  previewUrl?: string | null
  fileTree?: unknown
  relay?: RelayState | null
  timestamp: number
}

interface RelaySessionResponse {
  id: string
  status: 'waiting' | 'paired' | 'closed'
  label?: string | null
  workspaceFolders: string[]
  createdAt: number
  expiresAt: number
  agentConnected: boolean
  mobileConnected: boolean
  history: Array<Record<string, unknown>>
}

const status = ref<BridgeStatus>('disconnected')
const mode = ref<BridgeMode>('local')
const agentStatus = ref<AgentStatus | null>(null)
const token = ref<string | null>(null)
const authError = ref<BridgeAuthError>(null)
const relaySessionId = ref('')
const relayUrl = ref('')
const listeners = new Set<(msg: WsMessage) => void>()

let ws: WebSocket | null = null
let retryDelay = 1_000
let retryTimer: ReturnType<typeof setTimeout> | null = null
let _baseUrl = ''

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  return trimmed.replace(/\/+$/, '')
}

function buildLocalBaseUrl(): string {
  if (import.meta.server) return ''
  const stored = localStorage.getItem('vb:agentUrl')
  if (stored) return normalizeBaseUrl(stored)
  const config = useRuntimeConfig()
  const host = window.location.hostname || String(config.public.agentHost)
  return `http://${host}:${config.public.agentPort}`
}

function inferRelayUrl(): string {
  if (import.meta.server) return ''
  const stored = localStorage.getItem('vb:relayUrl')
  if (stored) return normalizeRelayBaseUrl(stored)
  const config = useRuntimeConfig()
  return normalizeRelayBaseUrl(String(config.public.relayUrl ?? ''))
}

function normalizeRelayBaseUrl(value: string): string {
  const normalized = normalizeBaseUrl(value)
  if (!normalized || import.meta.server) return normalized
  try {
    const candidate = new URL(normalized)
    const currentHost = window.location.hostname
    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(candidate.hostname)
    const currentIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(currentHost)
    if (isLoopback && !currentIsLoopback) return ''
  } catch {
    return ''
  }
  return normalized
}

function storageSet(nextMode: BridgeMode, nextBaseUrl: string, nextToken: string, nextSessionId = '') {
  localStorage.setItem('vb:bridgeMode', nextMode)
  localStorage.setItem('vb:token', nextToken)
  if (nextMode === 'relay') {
    localStorage.setItem('vb:relayUrl', nextBaseUrl)
    localStorage.setItem('vb:relaySessionId', nextSessionId)
  } else {
    localStorage.setItem('vb:agentUrl', nextBaseUrl)
  }
}

function clearStoredSession() {
  if (import.meta.server) return
  localStorage.removeItem('vb:bridgeMode')
  localStorage.removeItem('vb:token')
  localStorage.removeItem('vb:relayUrl')
  localStorage.removeItem('vb:relaySessionId')
  localStorage.removeItem('vb:agentUrl')
  token.value = null
  relaySessionId.value = ''
  relayUrl.value = ''
  mode.value = 'local'
  agentStatus.value = null
  disconnect()
}

function normalizeIncoming(msg: WsMessage): WsMessage {
  if (msg.source && msg.sessionId && typeof msg.type === 'string') {
    const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : {}
    return {
      ...payload,
      ...msg,
      type: String(msg.type),
      text: typeof msg.text === 'string' ? msg.text : typeof payload.text === 'string' ? payload.text : undefined,
      tool: typeof msg.tool === 'string' ? msg.tool : typeof payload.tool === 'string' ? payload.tool : undefined,
      target: typeof msg.target === 'string' ? msg.target : typeof payload.target === 'string' ? payload.target : undefined,
    }
  }
  return msg
}

function applyStatusSnapshot(snapshot: Partial<AgentStatus>) {
  agentStatus.value = {
    ok: true,
    adapters: Array.isArray(snapshot.adapters) ? snapshot.adapters : agentStatus.value?.adapters ?? [],
    activeAdapter: typeof snapshot.activeAdapter === 'string' || snapshot.activeAdapter === null
      ? snapshot.activeAdapter
      : agentStatus.value?.activeAdapter ?? null,
    ideState: snapshot.ideState ?? agentStatus.value?.ideState ?? null,
    previewUrl: snapshot.previewUrl ?? agentStatus.value?.previewUrl ?? null,
    relay: snapshot.relay ?? agentStatus.value?.relay ?? null,
    timestamp: typeof snapshot.timestamp === 'number' ? snapshot.timestamp : Date.now(),
  }
}

function emit(msg: WsMessage) {
  const normalized = normalizeIncoming(msg)

  if (normalized.type === 'status_snapshot') {
    const payload = typeof normalized.payload === 'object' && normalized.payload ? normalized.payload as Partial<AgentStatus> : normalized as Partial<AgentStatus>
    applyStatusSnapshot(payload)
  }

  if (normalized.type === 'peer_status') {
    agentStatus.value = {
      ok: true,
      adapters: agentStatus.value?.adapters ?? [],
      activeAdapter: agentStatus.value?.activeAdapter ?? null,
      ideState: agentStatus.value?.ideState ?? null,
      previewUrl: agentStatus.value?.previewUrl ?? null,
      relay: {
        ...(agentStatus.value?.relay ?? {
          enabled: true,
          relayUrl: relayUrl.value,
          sessionId: relaySessionId.value,
          pairingCode: '',
          qrUrl: '',
          agentToken: '',
          expiresAt: 0,
          status: 'waiting',
          connected: true,
          lastError: null,
        }),
        agentConnected: Boolean(normalized.agentConnected),
        mobileConnected: Boolean(normalized.mobileConnected),
      },
      timestamp: Date.now(),
    }
  }

  if (normalized.type === 'relay_session') {
    const payload = typeof normalized.payload === 'object' && normalized.payload ? normalized.payload as RelayState : null
    if (payload) {
      applyStatusSnapshot({ relay: payload, timestamp: Date.now() })
    }
  }

  listeners.forEach((fn) => fn(normalized))
}

function handleWsMessage(ev: MessageEvent) {
  let msg: WsMessage
  try {
    msg = JSON.parse(ev.data as string) as WsMessage
  } catch {
    return
  }

  if (msg.type === 'auth_fail') {
    authError.value = (msg.reason as BridgeAuthError) ?? 'invalid_token'
    disconnect()
    return
  }

  if (msg.type === 'auth_ok') {
    authError.value = null
    status.value = 'connected'
    retryDelay = 1_000

    if (mode.value === 'relay' && Array.isArray(msg.history)) {
      for (const entry of msg.history as WsMessage[]) {
        emit(entry)
      }
    }

    void fetchAgentStatus()
    listeners.forEach((fn) => fn(msg))
    return
  }

  emit(msg)
}

function connect() {
  if (import.meta.server) return
  const t = token.value
  if (!t) {
    status.value = 'disconnected'
    return
  }

  _baseUrl = mode.value === 'relay' ? inferRelayUrl() : buildLocalBaseUrl()
  if (!_baseUrl) {
    status.value = 'disconnected'
    return
  }

  const wsUrl = _baseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws'
  status.value = 'connecting'
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    const authPayload = mode.value === 'relay'
      ? { type: 'auth', token: t }
      : { type: 'auth', token: t }
    ws?.send(JSON.stringify(authPayload))
  }

  ws.onmessage = handleWsMessage
  ws.onclose = (ev) => {
    status.value = 'disconnected'
    ws = null
    // Code 1008 = server rejected auth (even if auth_fail message was lost in transit)
    if (ev.code === 1008) authError.value = 'invalid_token'
    // Don't retry if auth was explicitly rejected
    if (authError.value) return
    retryDelay = Math.min(retryDelay * 2, 30_000)
    retryTimer = setTimeout(connect, retryDelay)
  }
  ws.onerror = () => ws?.close()
}

function disconnect() {
  if (retryTimer) clearTimeout(retryTimer)
  ws?.close()
  ws = null
  status.value = 'disconnected'
}

function send(data: unknown) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

async function fetchRelayStatus() {
  if (!relaySessionId.value || !token.value) return
  try {
    const res = await fetch(`${inferRelayUrl()}/api/relay/sessions/${relaySessionId.value}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (!res.ok) return
    const data = await res.json() as RelaySessionResponse
    applyStatusSnapshot({
      ok: true,
      ideState: agentStatus.value?.ideState ?? {
        workspaceFolders: data.workspaceFolders,
      },
      relay: {
        ...(agentStatus.value?.relay ?? {
          enabled: true,
          relayUrl: inferRelayUrl(),
          sessionId: data.id,
          pairingCode: '',
          qrUrl: '',
          agentToken: '',
          expiresAt: data.expiresAt,
          connected: status.value === 'connected',
          lastError: null,
        }),
        status: data.status,
        agentConnected: data.agentConnected,
        mobileConnected: data.mobileConnected,
      },
      timestamp: Date.now(),
    })

    for (const entry of data.history) emit(entry as WsMessage)
  } catch {
    // ignore transient relay fetch errors
  }
}

async function fetchLocalStatus() {
  try {
    const res = await fetch(`${_baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (!res.ok) return
    agentStatus.value = await res.json() as AgentStatus
  } catch {
    // ignore transient local fetch errors
  }
}

async function fetchAgentStatus() {
  if (mode.value === 'relay') {
    await fetchRelayStatus()
    return
  }
  await fetchLocalStatus()
}

async function pairAt(baseUrl: string, code: string): Promise<boolean> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  try {
    const res = await fetch(`${normalizedBaseUrl}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) return false
    const { token: t } = await res.json() as { token: string }
    mode.value = 'local'
    storageSet('local', normalizedBaseUrl, t)
    token.value = t
    relaySessionId.value = ''
    _baseUrl = normalizedBaseUrl
    connect()
    return true
  } catch {
    return false
  }
}

async function pair(host: string, port: string, code: string): Promise<boolean> {
  return pairAt(`http://${host}:${port}`, code)
}

async function pairRelay(baseUrl: string, sessionId: string, pairingCode: string): Promise<boolean> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  try {
    const res = await fetch(`${normalizedBaseUrl}/api/relay/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, pairingCode }),
    })
    if (!res.ok) return false
    const { mobileToken } = await res.json() as { mobileToken: string }
    mode.value = 'relay'
    relayUrl.value = normalizedBaseUrl
    relaySessionId.value = sessionId
    storageSet('relay', normalizedBaseUrl, mobileToken, sessionId)
    token.value = mobileToken
    _baseUrl = normalizedBaseUrl
    connect()
    return true
  } catch {
    return false
  }
}

/**
 * Directly connect using a pre-issued short-lived JWT (from the QR code).
 * No pairing-code exchange required — the token is already valid.
 */
function connectWithToken(agentBaseUrl: string, preIssuedToken: string): void {
  const normalizedBaseUrl = normalizeBaseUrl(agentBaseUrl)
  mode.value = 'local'
  storageSet('local', normalizedBaseUrl, preIssuedToken)
  token.value = preIssuedToken
  relaySessionId.value = ''
  _baseUrl = normalizedBaseUrl
  connect()
}

export function useDevBridge() {
  onMounted(() => {
    if (token.value || status.value !== 'disconnected') return
    const storedToken = localStorage.getItem('vb:token')
    const storedMode = localStorage.getItem('vb:bridgeMode')
    const storedRelayUrl = localStorage.getItem('vb:relayUrl')
    const storedSessionId = localStorage.getItem('vb:relaySessionId')

    if (!storedToken) return

    token.value = storedToken
    if (storedMode === 'relay' && storedRelayUrl && storedSessionId) {
      mode.value = 'relay'
      relayUrl.value = normalizeBaseUrl(storedRelayUrl)
      relaySessionId.value = storedSessionId
    } else {
      mode.value = 'local'
    }
    connect()
  })

  return {
    status: readonly(status),
    mode: readonly(mode),
    agentStatus: readonly(agentStatus),
    token: readonly(token),
    relaySessionId: readonly(relaySessionId),
    relayUrl: readonly(relayUrl),

    authError: readonly(authError),

    connect,
    disconnect,
    send,
    pair,
    pairAt,
    pairRelay,
    connectWithToken,
    clearStoredSession,
    fetchAgentStatus,

    onMessage(fn: (msg: WsMessage) => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

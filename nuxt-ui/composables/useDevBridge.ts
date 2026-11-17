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
  workspaceId?: string
  [key: string]: unknown
}

export interface ConnectedWorkspace {
  id: string
  name: string
  path?: string
  active: boolean
  connected?: boolean
}

export interface RelaySessionListItem {
  id: string
  workspaceId: string
  label: string
  createdAt: number
  expiresAt: number
  status: 'waiting' | 'paired' | 'closed'
  agentConnected: boolean
  mobileConnected: boolean
  workspaces?: ConnectedWorkspace[]
}

interface WorkspaceSnapshot {
  workspaceId: string
  ideState?: AgentStatus['ideState']
  previewUrl?: string | null
  fileTree?: unknown
  adapters?: AgentStatus['adapters']
  activeAdapter?: string | null
  timestamp: number
}

export interface RelayState {
  enabled: boolean
  relayUrl: string
  sessionId: string
  pairingCode: string
  qrUrl: string
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
  workspaceId?: string | null
  status: 'waiting' | 'paired' | 'closed'
  label?: string | null
  workspaceFolders: string[]
  createdAt: number
  expiresAt: number
  agentConnected: boolean
  mobileConnected: boolean
  workspaces?: ConnectedWorkspace[]
  workspaceSnapshots?: WorkspaceSnapshot[]
  history: Array<Record<string, unknown>>
}

const status = ref<BridgeStatus>('disconnected')
const mode = ref<BridgeMode>('local')
const agentStatus = ref<AgentStatus | null>(null)
const token = ref<string | null>(null)
const authError = ref<BridgeAuthError>(null)
const relaySessionId = ref('')
const relayUrl = ref('')
const activeUrl = ref<string>('')
const latencyMs = ref<number | null>(null)
const relayWorkspaces = ref<ConnectedWorkspace[]>([])
const relaySessions = ref<RelaySessionListItem[]>([])
const activeWorkspaceId = ref('')
const deliveryNotice = ref<{ status: 'pending' | 'received' | 'error'; text: string } | null>(null)
const seenRelayEvents = new Set<string>()
const pendingDelivery = new Map<string, ReturnType<typeof setTimeout>>()
let latestDeliveryId = ''
let connectGeneration = 0
let connectDeadline: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(msg: WsMessage) => void>()

let ws: WebSocket | null = null
let retryDelay = 1_000
let retryTimer: ReturnType<typeof setTimeout> | null = null
let _baseUrl = ''
const RELAY_WORKSPACE_STORAGE_PREFIX = 'vb:relayWorkspace:'
const RELAY_SESSION_TOKEN_STORAGE_KEY = 'vb:relaySessionTokens'

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
  // Priority: explicitly paired relay URL → network config (settings field) → runtime config (env)
  const stored = localStorage.getItem('vb:relayUrl')
  if (stored) return normalizeRelayBaseUrl(stored)
  // Read relay URL from useNetworkConfig (stored under vb:network, editable in Settings)
  try {
    const raw = localStorage.getItem('vb:network')
    if (raw) {
      const net = JSON.parse(raw) as { relayUrl?: string }
      if (net.relayUrl) return normalizeRelayBaseUrl(net.relayUrl)
    }
  } catch { /* ignore */ }
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

function relayCredentialKey(baseUrl: string): string {
  return `${RELAY_SESSION_TOKEN_STORAGE_KEY}:${normalizeBaseUrl(baseUrl)}`
}

function readRelaySessionTokenMap(baseUrl = inferRelayUrl()): Record<string, string> {
  if (import.meta.server) return {}
  try {
    const raw = localStorage.getItem(relayCredentialKey(baseUrl))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

function persistRelaySessionToken(sessionId: string, sessionToken: string, baseUrl = inferRelayUrl()) {
  if (import.meta.server || !sessionId || !sessionToken) return
  const tokens = readRelaySessionTokenMap(baseUrl)
  tokens[sessionId] = sessionToken
  localStorage.setItem(relayCredentialKey(baseUrl), JSON.stringify(tokens))
}

function resolveRelaySessionToken(sessionId: string): string {
  if (!sessionId) return ''
  if (relaySessionId.value === sessionId && token.value) return token.value
  const stored = readRelaySessionTokenMap()
  return stored[sessionId] ?? ''
}

function workspaceStorageKey(sessionId = relaySessionId.value): string {
  return `${RELAY_WORKSPACE_STORAGE_PREFIX}${sessionId}`
}

function persistActiveWorkspace(nextWorkspaceId: string) {
  if (import.meta.server || !relaySessionId.value) return
  if (!nextWorkspaceId) {
    localStorage.removeItem(workspaceStorageKey())
    return
  }
  localStorage.setItem(workspaceStorageKey(), nextWorkspaceId)
}

function resolveStoredWorkspace(sessionId = relaySessionId.value): string {
  if (import.meta.server || !sessionId) return ''
  return localStorage.getItem(workspaceStorageKey(sessionId)) ?? ''
}

function setActiveWorkspace(nextWorkspaceId: string) {
  if (activeWorkspaceId.value !== nextWorkspaceId && mode.value === 'relay' && agentStatus.value) {
    agentStatus.value = {
      ...agentStatus.value, adapters: [], activeAdapter: null, ideState: null, previewUrl: null, fileTree: undefined,
    }
  }
  activeWorkspaceId.value = nextWorkspaceId
  relayWorkspaces.value = relayWorkspaces.value.map(workspace => ({
    ...workspace,
    active: workspace.id === nextWorkspaceId,
  }))
  persistActiveWorkspace(nextWorkspaceId)
}

function syncRelayWorkspaces(nextWorkspaces: ConnectedWorkspace[]) {
  relayWorkspaces.value = nextWorkspaces
  const storedWorkspaceId = resolveStoredWorkspace()
  const preferredWorkspaceId = storedWorkspaceId
    || nextWorkspaces.find(workspace => workspace.active)?.id
    || nextWorkspaces[0]?.id
    || ''
  setActiveWorkspace(preferredWorkspaceId)
}

function upsertRelayWorkspace(nextWorkspace: ConnectedWorkspace) {
  const workspaces = relayWorkspaces.value.filter(workspace => workspace.id !== nextWorkspace.id)
  workspaces.push(nextWorkspace)
  syncRelayWorkspaces(workspaces)
}

function removeRelayWorkspace(workspaceId: string) {
  relayWorkspaces.value = relayWorkspaces.value.map(workspace => workspace.id === workspaceId
    ? { ...workspace, connected: false }
    : workspace)
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
  relayWorkspaces.value = []
  relaySessions.value = []
  activeWorkspaceId.value = ''
  mode.value = 'local'
  agentStatus.value = null
  _baseUrl = ''
  activeUrl.value = ''
  latencyMs.value = null
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
      workspaceId: typeof msg.workspaceId === 'string'
        ? msg.workspaceId
        : typeof msg.workspace_id === 'string'
          ? msg.workspace_id as string
          : typeof payload.workspaceId === 'string'
            ? payload.workspaceId
            : typeof payload.workspace_id === 'string'
              ? payload.workspace_id as string
              : undefined,
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
    fileTree: snapshot.fileTree ?? agentStatus.value?.fileTree,
    relay: snapshot.relay ?? agentStatus.value?.relay ?? null,
    timestamp: typeof snapshot.timestamp === 'number' ? snapshot.timestamp : Date.now(),
  }
}

function emit(msg: WsMessage) {
  const normalized = normalizeIncoming(msg)
  if (mode.value === 'relay' && normalized.sessionId && normalized.sessionId !== relaySessionId.value) return
  if (normalized.workspaceId && normalized.workspaceId !== activeWorkspaceId.value && mode.value === 'relay') return
  if (mode.value === 'relay' && typeof normalized.id === 'string' && normalized.source === 'agent' && isReplayable(normalized)) {
    if (seenRelayEvents.has(normalized.id)) return
    seenRelayEvents.add(normalized.id)
    if (seenRelayEvents.size > 256) seenRelayEvents.delete(seenRelayEvents.values().next().value!)
  }

  if (normalized.type === 'terminal_unavailable') {
    latestDeliveryId = ''
    deliveryNotice.value = { status: 'error', text: 'Le terminal sélectionné a été fermé dans VS Code.' }
  }

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

  if (normalized.type === 'workspace_connected' && typeof normalized.workspace_id === 'string') {
    upsertRelayWorkspace({
      id: normalized.workspace_id,
      name: typeof normalized.workspace_name === 'string' ? normalized.workspace_name : normalized.workspace_id,
      active: normalized.workspace_id === activeWorkspaceId.value,
      connected: true,
    })
  }

  if (normalized.type === 'workspace_disconnected' && typeof normalized.workspace_id === 'string') {
    removeRelayWorkspace(normalized.workspace_id)
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

  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return
  if (msg.type === 'message_ack' && !msg.source) {
    if (typeof msg.request_id !== 'string') return
    const timer = pendingDelivery.get(msg.request_id)
    if (!timer) return
    clearTimeout(timer)
    pendingDelivery.delete(msg.request_id)
    if (msg.request_id !== latestDeliveryId) return
    if (msg.status === 'received') {
      deliveryNotice.value = { status: 'received', text: 'Reçu par l’agent' }
    } else if (msg.status === 'unconfirmed') {
      deliveryNotice.value = { status: 'error', text: 'Réception inconnue. Vérifie la commande dans VS Code avant de la renvoyer.' }
    } else {
      deliveryNotice.value = {
        status: 'error',
        text: msg.reason === 'workspace_unavailable' ? 'Le workspace sélectionné est indisponible.' : 'La commande a été refusée par ViBridge.',
      }
    }
    return
  }

  if (msg.type === 'auth_fail') {
    authError.value = (msg.reason as BridgeAuthError) ?? 'invalid_token'
    disconnect()
    return
  }

  if (msg.type === 'auth_ok') {
    if (mode.value === 'relay' && (msg.role !== 'mobile' || msg.sessionId !== relaySessionId.value)) {
      authError.value = 'invalid_token'
      disconnect()
      return
    }
    if (connectDeadline) clearTimeout(connectDeadline)
    authError.value = null
    status.value = 'connected'
    retryDelay = 1_000

    if (mode.value === 'relay' && Array.isArray(msg.workspaces)) {
      syncRelayWorkspaces((msg.workspaces as ConnectedWorkspace[]).map(workspace => ({
        id: String(workspace.id),
        name: String(workspace.name ?? workspace.id),
        path: typeof workspace.path === 'string' ? workspace.path : undefined,
        active: Boolean(workspace.active),
        connected: workspace.connected,
      })))
    }
    if (mode.value === 'relay' && Array.isArray(msg.history)) {
      for (const entry of msg.history as WsMessage[]) {
        if (isReplayable(entry)) emit(entry)
      }
    }

    void fetchAgentStatus()
    listeners.forEach((fn) => fn(msg))
    return
  }

  emit(msg)
}

function isReplayable(entry: WsMessage): boolean {
  return ['output', 'ai_message', 'message', 'chat', 'chat_response', 'notification'].includes(entry.type)
}

async function connect() {
  if (import.meta.server || ws || status.value === 'connecting') return
  const generation = ++connectGeneration
  const t = token.value
  if (!t) {
    status.value = 'disconnected'
    return
  }

  status.value = 'connecting'

  // ── Secure-context guard ──────────────────────────────────────
  // When the PWA is served over HTTPS, ws:// to a local agent is
  // blocked by Mixed Content policy. Force relay-only in that case.
  const isSecureContext = import.meta.client && window.location.protocol === 'https:'

  // If in HTTPS context and _baseUrl still points to a plain http:// address
  // (stale from a previous local session), discard it so we re-resolve via relay.
  if (isSecureContext && _baseUrl && /^http:\/\//i.test(_baseUrl)) {
    console.warn('[DevBridge] Dropping stale http:// baseUrl in HTTPS context:', _baseUrl)
    _baseUrl = ''
  }

  // Resolve which base URL to use:
  // • If already set (by pairAt / connectWithToken), use it directly.
  // • Relay mode OR secure context: use relay URL.
  // • Otherwise: auto-detect the first reachable candidate.
  if (!_baseUrl) {
    if (mode.value === 'relay' || isSecureContext) {
      const relayBaseUrl = inferRelayUrl()
      if (relayBaseUrl) {
        _baseUrl = relayBaseUrl
        mode.value = 'relay'
      } else {
        // Relay not configured yet — cannot connect from HTTPS context
        status.value = 'disconnected'
        console.warn('[DevBridge] HTTPS context but no relay URL set — cannot connect via ws://')
        return
      }
    } else {
      const { detectBestUrl } = useNetworkConfig()
      const result = await detectBestUrl()
      if (generation !== connectGeneration || token.value !== t) return
      if (!result) {
        status.value = 'disconnected'
        retryDelay = Math.min(retryDelay * 2, 30_000)
        retryTimer = setTimeout(() => void connect(), retryDelay)
        return
      }
      _baseUrl = result.url
      latencyMs.value = result.ms
    }
  }

  activeUrl.value = _baseUrl
  const wsUrl = _baseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws'
  let socket: WebSocket
  try {
    socket = new WebSocket(wsUrl)
  } catch {
    status.value = 'disconnected'
    return
  }
  ws = socket
  connectDeadline = setTimeout(() => {
    if (ws === socket && status.value === 'connecting') socket.close()
  }, 10_000)
  socket.onopen = () => {
    if (ws === socket) socket.send(JSON.stringify({ type: 'auth', token: t }))
  }
  socket.onmessage = ev => { if (ws === socket) handleWsMessage(ev) }
  socket.onclose = ev => {
    if (ws !== socket) return
    if (connectDeadline) clearTimeout(connectDeadline)
    ws = null
    status.value = 'disconnected'
    interruptDelivery()
    if (ev.code === 4401 || ev.code === 4404) authError.value = 'invalid_token'
    if (authError.value) return
    retryDelay = Math.min(retryDelay * 2, 30_000)
    retryTimer = setTimeout(() => void connect(), retryDelay * (0.75 + Math.random() * 0.25))
  }
  socket.onerror = () => { if (ws === socket) socket.close() }
}

function interruptDelivery() {
  for (const timeout of pendingDelivery.values()) clearTimeout(timeout)
  if (pendingDelivery.has(latestDeliveryId)) {
    deliveryNotice.value = { status: 'error', text: 'Connexion interrompue. Vérifie dans VS Code si la commande a été reçue.' }
  }
  pendingDelivery.clear()
}

function disconnect() {
  connectGeneration++
  if (retryTimer) clearTimeout(retryTimer)
  if (connectDeadline) clearTimeout(connectDeadline)
  const socket = ws
  ws = null
  socket?.close()
  status.value = 'disconnected'
  interruptDelivery()
}

const RELAY_COMMANDS_WITH_FEEDBACK = new Set([
  'message', 'chat', 'adapter_toggle', 'action', 'notif_response',
  'open_project', 'focus_terminal', 'create_terminal', 'start_cli', 'kill_cli',
])

function send(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const frame = { ...(data as Record<string, unknown>) }
  const tracked = mode.value === 'relay'
    ? RELAY_COMMANDS_WITH_FEEDBACK.has(String(frame.type))
    : frame.type === 'message' || frame.type === 'chat'
  if (status.value !== 'connected' || ws?.readyState !== WebSocket.OPEN) {
    if (tracked) deliveryNotice.value = { status: 'error', text: 'ViBridge est déconnecté. La commande n’a pas été envoyée.' }
    return false
  }
  if (mode.value === 'relay' && activeWorkspaceId.value && typeof frame.workspace_id !== 'string') {
    frame.workspace_id = activeWorkspaceId.value
  }
  if (tracked) {
    if (pendingDelivery.size >= 64) {
      deliveryNotice.value = { status: 'error', text: 'Trop de commandes sont en attente de réception.' }
      return false
    }
    const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
    latestDeliveryId = id
    frame.request_id = id
    deliveryNotice.value = { status: 'pending', text: 'En attente de réception par l’agent' }
    pendingDelivery.set(id, setTimeout(() => {
      pendingDelivery.delete(id)
      if (latestDeliveryId === id) deliveryNotice.value = {
        status: 'error',
        text: 'Réception inconnue. Vérifie la commande dans VS Code avant de la renvoyer.',
      }
    }, 7_000))
  }
  ws.send(JSON.stringify(frame))
  return true
}

export function useBridgeDeliveryNotice() {
  return { notice: readonly(deliveryNotice), dismiss: () => { deliveryNotice.value = null } }
}

async function fetchRelayStatus() {
  const sessionId = relaySessionId.value
  const credential = token.value
  if (!sessionId || !credential) return
  try {
    const res = await fetch(`${inferRelayUrl()}/api/relay/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${credential}` },
    })
    if (!res.ok) return
    const data = await res.json() as RelaySessionResponse
    if (sessionId !== relaySessionId.value || credential !== token.value) return
    applyStatusSnapshot({
      ok: true,
      ideState: agentStatus.value?.ideState ?? null,
      relay: {
        ...(agentStatus.value?.relay ?? {
          enabled: true,
          relayUrl: inferRelayUrl(),
          sessionId: data.id,
          pairingCode: '',
          qrUrl: '',
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
    syncRelayWorkspaces(Array.isArray(data.workspaces) ? data.workspaces.map(workspace => ({
      id: String(workspace.id),
      name: String(workspace.name ?? workspace.id),
      path: typeof workspace.path === 'string' ? workspace.path : undefined,
      active: Boolean(workspace.active),
      connected: workspace.connected,
    })) : [])

    const snapshots = Array.isArray(data.workspaceSnapshots) ? data.workspaceSnapshots : []
    const selectedSnapshot = snapshots.find(snapshot => snapshot.workspaceId === activeWorkspaceId.value)
    if (selectedSnapshot) {
      applyStatusSnapshot({
        adapters: Array.isArray(selectedSnapshot.adapters) ? selectedSnapshot.adapters : agentStatus.value?.adapters ?? [],
        activeAdapter: typeof selectedSnapshot.activeAdapter === 'string' || selectedSnapshot.activeAdapter === null
          ? selectedSnapshot.activeAdapter
          : agentStatus.value?.activeAdapter ?? null,
        ideState: selectedSnapshot.ideState ?? agentStatus.value?.ideState ?? null,
        previewUrl: typeof selectedSnapshot.previewUrl === 'string' || selectedSnapshot.previewUrl === null
          ? selectedSnapshot.previewUrl
          : agentStatus.value?.previewUrl ?? null,
        fileTree: selectedSnapshot.fileTree ?? agentStatus.value?.fileTree,
        timestamp: typeof selectedSnapshot.timestamp === 'number' ? selectedSnapshot.timestamp : Date.now(),
      })
    }

    for (const entry of data.history as WsMessage[]) if (isReplayable(entry)) emit(entry)
  } catch {
    // ignore transient relay fetch errors
  }
}

async function fetchRelaySessions() {
  if (!token.value) return
  const baseUrl = inferRelayUrl()
  if (!baseUrl) return
  try {
    const requestedToken = token.value
    const credentials = { ...readRelaySessionTokenMap(baseUrl), [relaySessionId.value]: requestedToken }
    const responses = await Promise.allSettled(Object.values(credentials).filter(Boolean).map(async sessionToken => {
      const res = await fetch(`${baseUrl}/api/relay/sessions`, { headers: { Authorization: `Bearer ${sessionToken}` }, signal: AbortSignal.timeout(5_000) })
      if (!res.ok) return []
      const data = await res.json() as { sessions?: RelaySessionListItem[] }
      return Array.isArray(data.sessions) ? data.sessions : []
    }))
    if (token.value !== requestedToken || inferRelayUrl() !== baseUrl) return
    const unique = new Map<string, RelaySessionListItem>()
    for (const result of responses) {
      if (result.status !== 'fulfilled') continue
      for (const session of result.value) unique.set(session.id, session)
    }
    const sessions = [...unique.values()].map(session => ({
      id: String(session.id),
      workspaceId: String(session.workspaceId ?? session.label ?? session.id),
      label: String(session.label ?? session.workspaceId ?? session.id),
      createdAt: Number(session.createdAt ?? 0),
      expiresAt: Number(session.expiresAt ?? 0),
      status: String(session.status ?? 'waiting') as RelaySessionListItem['status'],
      agentConnected: Boolean(session.agentConnected),
      mobileConnected: Boolean(session.mobileConnected),
      workspaces: Array.isArray(session.workspaces) ? session.workspaces.map(workspace => ({
        id: String(workspace.id),
        name: String(workspace.name ?? workspace.id),
        path: typeof workspace.path === 'string' ? workspace.path : undefined,
        active: Boolean(workspace.active),
        connected: workspace.connected,
      })) : [],
    }))
    relaySessions.value = sessions
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
  return pairLocal(baseUrl, { code })
}

async function pairLocal(baseUrl: string, credential: { code: string } | { qrToken: string }): Promise<boolean> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  try {
    const res = await fetch(`${normalizedBaseUrl}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
    })
    if (!res.ok) return false
    const { token: t } = await res.json() as { token: string }
    disconnect()
    authError.value = null
    mode.value = 'local'
    storageSet('local', normalizedBaseUrl, t)
    token.value = t
    relaySessionId.value = ''
    _baseUrl = normalizedBaseUrl
    void connect()
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
    disconnect()
    authError.value = null
    agentStatus.value = null
    mode.value = 'relay'
    relayUrl.value = normalizedBaseUrl
    relaySessionId.value = sessionId
    relayWorkspaces.value = []
    relaySessions.value = []
    activeWorkspaceId.value = ''
    storageSet('relay', normalizedBaseUrl, mobileToken, sessionId)
    persistRelaySessionToken(sessionId, mobileToken, normalizedBaseUrl)
    token.value = mobileToken
    _baseUrl = normalizedBaseUrl
    void connect()
    return true
  } catch {
    return false
  }
}

function connectWithToken(agentBaseUrl: string, preIssuedToken: string): Promise<boolean> {
  return pairLocal(agentBaseUrl, { qrToken: preIssuedToken })
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

    // On HTTPS, always force relay mode regardless of what was stored
    const isSecureContext = window.location.protocol === 'https:'
    if (isSecureContext || (storedMode === 'relay' && storedRelayUrl && storedSessionId)) {
      mode.value = 'relay'
      if (storedRelayUrl) relayUrl.value = normalizeBaseUrl(storedRelayUrl)
      if (storedSessionId) relaySessionId.value = storedSessionId
      if (storedSessionId) activeWorkspaceId.value = resolveStoredWorkspace(storedSessionId)
    } else {
      mode.value = 'local'
    }
    void connect()
  })

  async function switchRelaySession(sessionId: string): Promise<boolean> {
    if (mode.value !== 'relay' || !sessionId || sessionId === relaySessionId.value) return true
    const nextToken = resolveRelaySessionToken(sessionId)
    if (!nextToken) return false
    disconnect()
    authError.value = null
    agentStatus.value = null
    relaySessionId.value = sessionId
    token.value = nextToken
    relayWorkspaces.value = []
    activeWorkspaceId.value = resolveStoredWorkspace(sessionId)
    storageSet('relay', inferRelayUrl(), nextToken, sessionId)
    _baseUrl = inferRelayUrl()
    await fetchRelaySessions()
    void connect()
    return true
  }

  return {
    status: readonly(status),
    mode: readonly(mode),
    agentStatus: readonly(agentStatus),
    token: readonly(token),
    relaySessionId: readonly(relaySessionId),
    relayUrl: readonly(relayUrl),
    activeUrl: readonly(activeUrl),
    latencyMs: readonly(latencyMs),
    relayWorkspaces: readonly(relayWorkspaces),
    relaySessions: readonly(relaySessions),
    activeWorkspaceId: readonly(activeWorkspaceId),
    chatHistoryKey: computed(() => token.value
      ? resolveChatHistoryKey(mode.value, mode.value === 'relay' ? relayUrl.value : activeUrl.value, relaySessionId.value, activeWorkspaceId.value)
      : ''),
    activeWorkspace: computed(() => relayWorkspaces.value.find(workspace => workspace.id === activeWorkspaceId.value) ?? null),

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
    fetchRelaySessions,
    setActiveWorkspace,
    switchRelaySession,

    onMessage(fn: (msg: WsMessage) => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

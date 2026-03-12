import http from 'http'
import { randomUUID } from 'crypto'
import express, { Request, Response, NextFunction } from 'express'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { RelayAuth } from './auth'
import { RelayStore } from './store'
import type { ConnectedWorkspace, RelayRole, SessionClaims, WorkspaceSnapshot } from './types'

interface RelayServerOptions {
  port: number
  publicBaseUrl: string
  uiBaseUrl: string
  auth: RelayAuth
  store: RelayStore
  sessionTtlMs: number
}

interface AuthenticatedSocket extends WebSocket {
  claims?: SessionClaims
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
}

interface SessionPeers {
  mobile: AuthenticatedSocket | null
  agents: Map<string, AuthenticatedSocket>
  activeWorkspaceId: string | null
}

interface PendingAgentRequest {
  resolve: (payload: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function createRelayServer(options: RelayServerOptions) {
  const app = express()
  const { auth, store, publicBaseUrl, uiBaseUrl, sessionTtlMs } = options
  const peers = new Map<string, SessionPeers>()
  const workspaceSnapshots = new Map<string, Map<string, WorkspaceSnapshot>>()
  const pendingAgentRequests = new Map<string, PendingAgentRequest>()

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })
  app.use(express.json())

  const requireSessionAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    const claims = auth.verify(token)
    if (!claims) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    ;(req as Request & { claims?: SessionClaims }).claims = claims
    next()
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/workspaces', (req, res) => {
    const token = String(req.query.token ?? '').trim()
    const claims = auth.verify(token)
    if (!claims) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    res.json(listConnectedWorkspaces(claims.sessionId))
  })

  app.get('/api/relay/sessions', (req, res) => {
    const token = String(req.query.token ?? '').trim()
    const claims = auth.verify(token)
    if (!claims) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const sessions = store.listSessions()
      .filter(session => session.expiresAt > Date.now())
      .map(session => {
        const sessionPeers = peers.get(session.id)
        return {
          id: session.id,
          workspaceId: session.workspaceId ?? session.label ?? session.id,
          label: session.label ?? session.workspaceId ?? session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          status: session.status,
          agentConnected: Boolean(sessionPeers?.agents.size),
          mobileConnected: Boolean(sessionPeers?.mobile),
          workspaces: listConnectedWorkspaces(session.id),
        }
      })

    const activeSessionId = claims.sessionId
    const ordered = sessions.sort((a, b) => {
      if (a.id === activeSessionId) return -1
      if (b.id === activeSessionId) return 1
      return a.label.localeCompare(b.label)
    })

    res.json({ sessions: ordered })
  })

  app.post('/api/relay/sessions', (req, res) => {
    const { label, workspaceId, workspaceFolders } = req.body as { label?: string; workspaceId?: string; workspaceFolders?: string[] }
    const expiresAt = Date.now() + sessionTtlMs
    const seedSessionId = `seed_${Date.now()}`
    const agentToken = auth.issueSessionToken(seedSessionId, 'agent')
    const session = store.createSession({
      label,
      workspaceId,
      workspaceFolders,
      agentToken,
      expiresAt,
    })
    const finalAgentToken = auth.issueSessionToken(session.id, 'agent')
    session.agentToken = finalAgentToken

    res.json({
      sessionId: session.id,
      workspaceId: session.workspaceId ?? null,
      pairingCode: session.pairingCode,
      agentToken: finalAgentToken,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
      qrUrl: `${uiBaseUrl.replace(/\/$/, '')}/?relay=1&sessionId=${encodeURIComponent(session.id)}&code=${encodeURIComponent(session.pairingCode)}`,
    })
  })

  app.post('/api/relay/pair', (req, res) => {
    const { sessionId, pairingCode } = req.body as { sessionId?: string; pairingCode?: string }
    if (!sessionId || !pairingCode) {
      res.status(400).json({ error: 'missing sessionId or pairingCode' })
      return
    }
    const mobileToken = auth.issueSessionToken(sessionId, 'mobile')
    const session = store.pair(sessionId, pairingCode, mobileToken)
    if (!session) {
      res.status(403).json({ error: 'invalid or expired pairing' })
      return
    }
    res.json({
      sessionId: session.id,
      mobileToken,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
    })
  })

  app.get('/api/relay/sessions/:sessionId', requireSessionAuth, (req, res) => {
    const sessionId = req.params.sessionId
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    if (claims.sessionId !== sessionId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    const session = store.getSession(sessionId)
    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const sessionPeers = peers.get(sessionId)
    res.json({
      id: session.id,
      workspaceId: session.workspaceId ?? null,
      status: session.status,
      label: session.label ?? null,
      workspaceFolders: session.workspaceFolders,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      agentConnected: Boolean(sessionPeers?.agents.size),
      mobileConnected: Boolean(sessionPeers?.mobile),
      workspaces: listConnectedWorkspaces(session.id),
      workspaceSnapshots: listWorkspaceSnapshots(session.id),
      history: session.history,
    })
  })

  app.get('/api/relay/sessions/:sessionId/files', requireSessionAuth, async (req, res) => {
    const sessionId = req.params.sessionId
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    if (claims.sessionId !== sessionId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const workspaceId = String(req.query.workspaceId ?? '').trim() || undefined
    const filePath = String(req.query.path ?? '').trim()

    if (!filePath) {
      const snapshot = workspaceId
        ? getSessionSnapshots(sessionId).get(workspaceId)
        : listWorkspaceSnapshots(sessionId)[0]
      res.json({ tree: snapshot?.fileTree ?? [] })
      return
    }

    try {
      const response = await requestAgentPayload(sessionId, workspaceId, 'relay_file_request', {
        path: filePath,
      })
      if (typeof response.error === 'string') {
        res.status(404).json({ error: response.error })
        return
      }
      res.json({
        path: String(response.path ?? filePath),
        content: String(response.content ?? ''),
      })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'relay file request failed' })
    }
  })

  const httpServer = http.createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  function getSessionPeers(sessionId: string): SessionPeers {
    const sessionPeers = peers.get(sessionId)
    if (sessionPeers) return sessionPeers
    const next: SessionPeers = {
      mobile: null,
      agents: new Map<string, AuthenticatedSocket>(),
      activeWorkspaceId: null,
    }
    peers.set(sessionId, next)
    return next
  }

  function getSessionSnapshots(sessionId: string): Map<string, WorkspaceSnapshot> {
    const existing = workspaceSnapshots.get(sessionId)
    if (existing) return existing
    const next = new Map<string, WorkspaceSnapshot>()
    workspaceSnapshots.set(sessionId, next)
    return next
  }

  function listConnectedWorkspaces(sessionId: string): ConnectedWorkspace[] {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return []
    return Array.from(sessionPeers.agents.entries()).map(([workspaceId, socket]) => ({
      id: workspaceId,
      name: socket.workspaceName || workspaceId,
      path: socket.workspacePath,
      active: sessionPeers.activeWorkspaceId === workspaceId,
    }))
  }

  function listWorkspaceSnapshots(sessionId: string): WorkspaceSnapshot[] {
    return Array.from(getSessionSnapshots(sessionId).values())
  }

  function updateWorkspaceSnapshot(
    sessionId: string,
    workspaceId: string,
    payload: Record<string, unknown>,
  ) {
    const snapshots = getSessionSnapshots(sessionId)
    const previous = snapshots.get(workspaceId)
    snapshots.set(workspaceId, {
      workspaceId,
      ideState: payload.ideState ?? previous?.ideState,
      previewUrl: typeof payload.previewUrl === 'string' || payload.previewUrl === null
        ? payload.previewUrl as string | null
        : previous?.previewUrl ?? null,
      fileTree: payload.fileTree ?? previous?.fileTree,
      adapters: payload.adapters ?? previous?.adapters,
      activeAdapter: typeof payload.activeAdapter === 'string' || payload.activeAdapter === null
        ? payload.activeAdapter as string | null
        : previous?.activeAdapter ?? null,
      timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    })
  }

  async function requestAgentPayload(
    sessionId: string,
    workspaceId: string | undefined,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const targetAgent = resolveTargetAgent(sessionId, workspaceId)
    if (!targetAgent || targetAgent.readyState !== WebSocket.OPEN) {
      throw new Error('workspace unavailable')
    }

    const requestId = randomUUID()
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAgentRequests.delete(requestId)
        reject(new Error('agent request timeout'))
      }, 5_000)
      pendingAgentRequests.set(requestId, { resolve, reject, timer })
    })

    targetAgent.send(JSON.stringify({
      type,
      request_id: requestId,
      ...payload,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    }))

    return response
  }

  function broadcastPeerStatus(sessionId: string) {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return
    const payload = JSON.stringify({
      type: 'peer_status',
      agentConnected: sessionPeers.agents.size > 0,
      mobileConnected: Boolean(sessionPeers.mobile),
    })
    if (sessionPeers.mobile?.readyState === WebSocket.OPEN) {
      sessionPeers.mobile.send(payload)
    }
    for (const peer of sessionPeers.agents.values()) {
      if (peer.readyState === WebSocket.OPEN) peer.send(payload)
    }
  }

  function sendWorkspaceEvent(sessionId: string, payload: Record<string, unknown>) {
    const mobile = peers.get(sessionId)?.mobile
    if (mobile?.readyState === WebSocket.OPEN) {
      mobile.send(JSON.stringify(payload))
    }
  }

  function registerAgentWorkspace(ws: AuthenticatedSocket, workspaceId: string, workspaceName: string, workspacePath?: string) {
    if (!ws.claims) return
    const sessionPeers = getSessionPeers(ws.claims.sessionId)
    const normalizedWorkspaceId = workspaceId.trim()
    if (!normalizedWorkspaceId) return

    if (ws.workspaceId && ws.workspaceId !== normalizedWorkspaceId) {
      sessionPeers.agents.delete(ws.workspaceId)
    }

    ws.workspaceId = normalizedWorkspaceId
    ws.workspaceName = workspaceName || normalizedWorkspaceId
    ws.workspacePath = workspacePath

    sessionPeers.agents.delete(normalizedWorkspaceId)
    sessionPeers.agents.set(normalizedWorkspaceId, ws)
    sessionPeers.activeWorkspaceId = normalizedWorkspaceId

    sendWorkspaceEvent(ws.claims.sessionId, {
      type: 'workspace_connected',
      workspace_id: normalizedWorkspaceId,
      workspace_name: ws.workspaceName,
    })
    broadcastPeerStatus(ws.claims.sessionId)
  }

  function resolveTargetAgent(sessionId: string, requestedWorkspaceId?: string): AuthenticatedSocket | null {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return null
    const explicitWorkspaceId = requestedWorkspaceId?.trim()
    if (explicitWorkspaceId) {
      return sessionPeers.agents.get(explicitWorkspaceId) ?? null
    }
    if (sessionPeers.activeWorkspaceId) {
      return sessionPeers.agents.get(sessionPeers.activeWorkspaceId) ?? null
    }
    const lastAgent = Array.from(sessionPeers.agents.values()).at(-1)
    return lastAgent ?? null
  }

  wss.on('connection', (ws: AuthenticatedSocket) => {
    ws.on('message', (raw: RawData) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        ws.close(1008, 'bad json')
        return
      }

      if (!ws.claims) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          ws.close(4401, 'unauthorized')
          return
        }
        const claims = auth.verify(msg.token)
        if (!claims) {
          ws.close(4401, 'unauthorized')
          return
        }
        const session = store.getSession(claims.sessionId)
        if (!session) {
          ws.close(4404, 'session not found')
          return
        }
        ws.claims = claims
        const sessionPeers = getSessionPeers(claims.sessionId)
        if (claims.role === 'mobile') {
          sessionPeers.mobile = ws
        }
        ws.send(JSON.stringify({
          type: 'auth_ok',
          role: claims.role,
          sessionId: claims.sessionId,
          workspaces: listConnectedWorkspaces(claims.sessionId),
          history: session.history,
        }))
        broadcastPeerStatus(claims.sessionId)
        return
      }

      const { sessionId, role } = ws.claims
      if (role === 'agent' && msg.type === 'agent_hello') {
        const workspaceId = typeof msg.workspace_id === 'string' ? msg.workspace_id : ''
        if (!workspaceId.trim()) return
        registerAgentWorkspace(
          ws,
          workspaceId,
          typeof msg.workspace_name === 'string' ? msg.workspace_name : workspaceId,
          typeof msg.workspace_path === 'string' ? msg.workspace_path : undefined,
        )
        return
      }

      if (role === 'agent' && msg.type === 'relay_file_response' && typeof msg.request_id === 'string') {
        const pending = pendingAgentRequests.get(msg.request_id)
        if (!pending) return
        clearTimeout(pending.timer)
        pendingAgentRequests.delete(msg.request_id)
        pending.resolve(msg)
        return
      }

      if (role === 'agent' && msg.type === 'status_snapshot') {
        const workspaceId = typeof msg.workspace_id === 'string'
          ? msg.workspace_id
          : ws.workspaceId
        const payload = typeof msg.payload === 'object' && msg.payload
          ? msg.payload as Record<string, unknown>
          : msg
        if (workspaceId) {
          updateWorkspaceSnapshot(sessionId, workspaceId, payload)
        }
      }

      const targetWorkspaceId = typeof msg.workspace_id === 'string'
        ? msg.workspace_id
        : role === 'agent'
          ? ws.workspaceId
          : undefined
      const envelope = store.append(sessionId, role, {
        type: String(msg.type ?? 'relay_message'),
        workspaceId: targetWorkspaceId,
        workspaceName: role === 'agent' ? ws.workspaceName : undefined,
        workspacePath: role === 'agent' ? ws.workspacePath : undefined,
        target: typeof msg.target === 'string' ? msg.target : undefined,
        tool: typeof msg.tool === 'string' ? msg.tool : undefined,
        text: typeof msg.text === 'string' ? msg.text : undefined,
        payload: msg.payload,
      })
      if (!envelope) {
        ws.close(4404, 'session not found')
        return
      }
      const sessionPeers = peers.get(sessionId)
      if (!sessionPeers) return
      if (role === 'agent') {
        if (sessionPeers.mobile?.readyState === WebSocket.OPEN) {
          sessionPeers.mobile.send(JSON.stringify(envelope))
        }
        return
      }
      const targetAgent = resolveTargetAgent(sessionId, targetWorkspaceId)
      if (targetAgent?.readyState === WebSocket.OPEN) {
        targetAgent.send(JSON.stringify(envelope))
      }
    })

    ws.on('close', () => {
      if (!ws.claims) return
      const sessionPeers = peers.get(ws.claims.sessionId)
      if (!sessionPeers) return
      if (ws.claims.role === 'mobile') {
        if (sessionPeers.mobile === ws) sessionPeers.mobile = null
      } else if (ws.workspaceId) {
        sessionPeers.agents.delete(ws.workspaceId)
        getSessionSnapshots(ws.claims.sessionId).delete(ws.workspaceId)
        sendWorkspaceEvent(ws.claims.sessionId, {
          type: 'workspace_disconnected',
          workspace_id: ws.workspaceId,
        })
        if (sessionPeers.activeWorkspaceId === ws.workspaceId) {
          sessionPeers.activeWorkspaceId = Array.from(sessionPeers.agents.keys()).at(-1) ?? null
        }
      }
      if (!sessionPeers.mobile && sessionPeers.agents.size === 0) {
        peers.delete(ws.claims.sessionId)
        workspaceSnapshots.delete(ws.claims.sessionId)
      } else {
        broadcastPeerStatus(ws.claims.sessionId)
      }
    })
  })

  return { app, httpServer, wss }
}

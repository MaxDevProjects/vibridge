import http from 'http'
import express, { Request, Response, NextFunction } from 'express'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { RelayAuth } from './auth'
import { RelayStore } from './store'
import type { RelayRole, SessionClaims } from './types'

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
}

export function createRelayServer(options: RelayServerOptions) {
  const app = express()
  const { auth, store, publicBaseUrl, uiBaseUrl, sessionTtlMs } = options
  const peers = new Map<string, Map<RelayRole, AuthenticatedSocket>>()

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
    res.json({ ok: true })
  })

  app.post('/api/relay/sessions', (req, res) => {
    const { label, workspaceFolders } = req.body as { label?: string; workspaceFolders?: string[] }
    const expiresAt = Date.now() + sessionTtlMs
    const seedSessionId = `seed_${Date.now()}`
    const agentToken = auth.issueSessionToken(seedSessionId, 'agent')
    const session = store.createSession({
      label,
      workspaceFolders,
      agentToken,
      expiresAt,
    })
    const finalAgentToken = auth.issueSessionToken(session.id, 'agent')
    session.agentToken = finalAgentToken

    res.json({
      sessionId: session.id,
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
      status: session.status,
      label: session.label ?? null,
      workspaceFolders: session.workspaceFolders,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      agentConnected: Boolean(sessionPeers?.get('agent')),
      mobileConnected: Boolean(sessionPeers?.get('mobile')),
      history: session.history,
    })
  })

  const httpServer = http.createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  function broadcastPeerStatus(sessionId: string) {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return
    const payload = JSON.stringify({
      type: 'peer_status',
      agentConnected: Boolean(sessionPeers.get('agent')),
      mobileConnected: Boolean(sessionPeers.get('mobile')),
    })
    for (const peer of sessionPeers.values()) {
      if (peer.readyState === WebSocket.OPEN) peer.send(payload)
    }
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
        const sessionPeers = peers.get(claims.sessionId) ?? new Map<RelayRole, AuthenticatedSocket>()
        sessionPeers.set(claims.role, ws)
        peers.set(claims.sessionId, sessionPeers)
        ws.send(JSON.stringify({
          type: 'auth_ok',
          role: claims.role,
          sessionId: claims.sessionId,
          history: session.history,
        }))
        broadcastPeerStatus(claims.sessionId)
        return
      }

      const { sessionId, role } = ws.claims
      const envelope = store.append(sessionId, role, {
        type: String(msg.type ?? 'relay_message'),
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
      const peerRole: RelayRole = role === 'agent' ? 'mobile' : 'agent'
      const peer = sessionPeers.get(peerRole)
      if (peer?.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(envelope))
      }
    })

    ws.on('close', () => {
      if (!ws.claims) return
      const sessionPeers = peers.get(ws.claims.sessionId)
      sessionPeers?.delete(ws.claims.role)
      if (sessionPeers && sessionPeers.size === 0) {
        peers.delete(ws.claims.sessionId)
      }
      broadcastPeerStatus(ws.claims.sessionId)
    })
  })

  return { app, httpServer, wss }
}

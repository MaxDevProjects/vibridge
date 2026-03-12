import { randomInt } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type { RelayEnvelope, RelayRole, RelaySession } from './types'

function makePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export class RelayStore {
  private sessions = new Map<string, RelaySession>()
  private historyLimit = 100

  createSession(input: { label?: string; workspaceId?: string; workspaceFolders?: string[]; agentToken: string; expiresAt: number }) {
    const session: RelaySession = {
      id: `sess_${uuidv4()}`,
      workspaceId: input.workspaceId,
      pairingCode: makePairingCode(),
      status: 'waiting',
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      label: input.label,
      workspaceFolders: input.workspaceFolders ?? [],
      agentToken: input.agentToken,
      mobileToken: null,
      history: [],
    }
    this.sessions.set(session.id, session)
    return session
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null
  }

  listSessions() {
    return Array.from(this.sessions.values())
  }

  findByToken(token: string, role: RelayRole): RelaySession | null {
    for (const session of this.sessions.values()) {
      if (role === 'agent' && session.agentToken === token) return session
      if (role === 'mobile' && session.mobileToken === token) return session
    }
    return null
  }

  pair(sessionId: string, code: string, mobileToken: string): RelaySession | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    if (session.expiresAt < Date.now()) return null
    if (session.pairingCode !== code) return null
    session.mobileToken = mobileToken
    session.status = 'paired'
    return session
  }

  append(sessionId: string, source: RelayEnvelope['source'], data: Omit<RelayEnvelope, 'id' | 'sessionId' | 'source' | 'ts'>) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    const envelope: RelayEnvelope = {
      id: uuidv4(),
      sessionId,
      source,
      ts: Date.now(),
      ...data,
    }
    session.history.push(envelope)
    if (session.history.length > this.historyLimit) {
      session.history.shift()
    }
    return envelope
  }

  pruneExpired(now = Date.now()) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId)
      }
    }
  }
}

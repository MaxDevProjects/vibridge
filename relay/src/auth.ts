import { randomUUID } from 'crypto'
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken'
import type { RelayRole, SessionClaims } from './types'

export class RelayAuth {
  constructor(private secret: string, private expiresInSeconds = 60 * 60 * 12) {}

  issueSessionToken(sessionId: string, role: RelayRole, expiresAt?: number): string {
    const ttl = expiresAt === undefined ? this.expiresInSeconds : Math.ceil((expiresAt - Date.now()) / 1000)
    const options: SignOptions = { algorithm: 'HS256', jwtid: randomUUID(), expiresIn: ttl }
    return jwt.sign({ sessionId, role }, this.secret as Secret, options)
  }

  verify(token: string): SessionClaims | null {
    try {
      const claims = jwt.verify(token, this.secret, { algorithms: ['HS256'] })
      if (typeof claims === 'string' || typeof claims.sessionId !== 'string' || typeof claims.exp !== 'number') return null
      if (claims.role !== 'agent' && claims.role !== 'mobile' && claims.role !== 'setup') return null
      return { sessionId: claims.sessionId, role: claims.role, exp: claims.exp }
    } catch {
      return null
    }
  }
}

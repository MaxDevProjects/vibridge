import jwt, { type Secret, type SignOptions } from 'jsonwebtoken'
import type { RelayRole, SessionClaims } from './types'

export class RelayAuth {
  constructor(private secret: string, private expiresInSeconds = 60 * 60 * 12) {}

  issueSessionToken(sessionId: string, role: RelayRole): string {
    const options: SignOptions = { expiresIn: this.expiresInSeconds }
    return jwt.sign({ sessionId, role } satisfies SessionClaims, this.secret as Secret, options)
  }

  verify(token: string): SessionClaims | null {
    try {
      return jwt.verify(token, this.secret) as SessionClaims
    } catch {
      return null
    }
  }
}

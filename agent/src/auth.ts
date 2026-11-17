/**
 * DevBridge Agent — Auth (JWT + ECDH pairing code)
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const jwtSecret = process.env.JWT_SECRET
if (process.env.NODE_ENV === 'production' && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error('Agent requires a JWT secret of at least 32 characters in production')
}
const SECRET = jwtSecret && jwtSecret.length >= 32 ? jwtSecret : crypto.randomBytes(32).toString('hex')
const TTL_SECONDS = 3600;

export class AuthService {
  private pairCode: string;
  private failures = 0;
  private retryAt = 0;
  private consumedQrTokens = new Map<string, number>();

  constructor() {
    // Generate a one-time 6-digit pairing code at startup
    this.pairCode = crypto.randomInt(100_000, 999_999).toString();
    console.log(`[Auth] Pairing code: ${this.pairCode}  (shown in QR on PWA)`);
  }

  getPairCode(): string {
    return this.pairCode;
  }

  verifyPairCode(code: string): boolean {
    const now = Date.now();
    if (this.retryAt <= now) {
      this.failures = 0;
      this.retryAt = now + 60_000;
    }
    if (this.failures >= 10) return false;
    const ok = code === this.pairCode;
    if (!ok) this.failures++;
    else this.failures = 0;
    if (ok) {
      // Rotate after first successful pair
      this.pairCode = crypto.randomInt(100_000, 999_999).toString();
    }
    return ok;
  }

  issueToken(): string {
    return jwt.sign({}, SECRET, { expiresIn: TTL_SECONDS });
  }

  /** Issue a time-limited local QR credential. */
  issueShortLivedToken(ttlSeconds = 600): string {
    return jwt.sign({ qr: true }, SECRET, { expiresIn: ttlSeconds, jwtid: crypto.randomUUID() });
  }

  consumeQrToken(token: string): boolean {
    try {
      const claims = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
      if (typeof claims !== 'object' || claims.qr !== true || typeof claims.jti !== 'string' || typeof claims.exp !== 'number') return false;
      const now = Date.now() / 1000;
      for (const [id, exp] of this.consumedQrTokens) {
        if (exp <= now) this.consumedQrTokens.delete(id);
      }
      if (this.consumedQrTokens.has(claims.jti)) return false;
      this.consumedQrTokens.set(claims.jti, claims.exp);
      return true;
    } catch {
      return false;
    }
  }

  verify(token: string): boolean {
    try {
      const claims = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
      return typeof claims === 'object' && claims.qr !== true && typeof claims.exp === 'number';
    } catch {
      return false;
    }
  }
}

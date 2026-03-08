/**
 * DevBridge Agent — Auth (JWT + ECDH pairing code)
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const TTL_SECONDS = 3600;

export class AuthService {
  private pairCode: string;

  constructor() {
    // Generate a one-time 6-digit pairing code at startup
    this.pairCode = crypto.randomInt(100_000, 999_999).toString();
    console.log(`[Auth] Pairing code: ${this.pairCode}  (shown in QR on PWA)`);
  }

  getPairCode(): string {
    return this.pairCode;
  }

  verifyPairCode(code: string): boolean {
    const ok = code === this.pairCode;
    if (ok) {
      // Rotate after first successful pair
      this.pairCode = crypto.randomInt(100_000, 999_999).toString();
    }
    return ok;
  }

  issueToken(): string {
    return jwt.sign({}, SECRET, { expiresIn: TTL_SECONDS });
  }

  /** Issue a short-lived token intended for QR-code auto-pairing (default 10 min). */
  issueShortLivedToken(ttlSeconds = 600): string {
    return jwt.sign({ qr: true }, SECRET, { expiresIn: ttlSeconds });
  }

  verify(token: string): boolean {
    try {
      jwt.verify(token, SECRET);
      return true;
    } catch {
      return false;
    }
  }
}

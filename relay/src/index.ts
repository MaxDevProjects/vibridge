import { randomBytes } from 'crypto'
import { createRelayServer } from './server'
import { RelayAuth } from './auth'
import { RelayStore } from './store'

const port = Number(process.env.RELAY_PORT ?? 4444)
const dbPath = process.env.RELAY_DB_PATH || '/data/relay.db'
const jwtSecret = process.env.RELAY_JWT_SECRET
if (process.env.NODE_ENV === 'production' && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error('Relay requires a JWT secret of at least 32 characters in production')
}
const resolvedJwtSecret = jwtSecret && jwtSecret.length >= 32 ? jwtSecret : randomBytes(32).toString('hex')
const publicBaseUrl = process.env.RELAY_PUBLIC_URL || `http://localhost:${port}`
// RELAY_UI_URL is the URL of the Nuxt UI where QR codes should point.
// Defaults to RELAY_PUBLIC_URL for single-domain setups.
const uiBaseUrl = process.env.RELAY_UI_URL || publicBaseUrl
const sessionTtlMs = Number(process.env.RELAY_SESSION_TTL_MS ?? 1000 * 60 * 60 * 12)

if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1_000 || sessionTtlMs > 2_147_483_647) {
  throw new Error('RELAY_SESSION_TTL_MS must be between 1 second and 24.8 days')
}

const auth = new RelayAuth(resolvedJwtSecret)
const store = new RelayStore(dbPath)
store.pruneExpired()
const { httpServer } = createRelayServer({
  port,
  publicBaseUrl,
  uiBaseUrl,
  auth,
  store,
  sessionTtlMs,
})

setInterval(() => {
  store.pruneExpired()
}, 60_000).unref()

httpServer.listen(port, () => {
  console.log(`[Relay] listening on http://0.0.0.0:${port}`)
  console.log(`[Relay] public base url: ${publicBaseUrl}`)
  console.log(`[Relay] sqlite db: ${dbPath}`)
})

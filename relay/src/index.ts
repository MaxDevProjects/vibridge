import { createRelayServer } from './server'
import { RelayAuth } from './auth'
import { RelayStore } from './store'

const port = Number(process.env.RELAY_PORT ?? 4444)
const jwtSecret = process.env.RELAY_JWT_SECRET || process.env.JWT_SECRET || 'devbridge-relay-dev-secret'
const publicBaseUrl = process.env.RELAY_PUBLIC_URL || `http://localhost:${port}`
const sessionTtlMs = Number(process.env.RELAY_SESSION_TTL_MS ?? 1000 * 60 * 60 * 12)

const auth = new RelayAuth(jwtSecret)
const store = new RelayStore()
const { httpServer } = createRelayServer({
  port,
  publicBaseUrl,
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
})

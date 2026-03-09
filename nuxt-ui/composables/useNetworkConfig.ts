/**
 * useNetworkConfig — persistent network topology config
 * Provides ordered candidate URLs and auto-detection for useDevBridge.
 *
 * Priority (mode=auto): mDNS → manual IP → relay
 */

export type NetworkMode = 'auto' | 'local' | 'relay'

export interface NetworkConfig {
  mode: NetworkMode
  manualIp: string
  manualPort: number
  relayUrl: string
}

export interface DetectResult {
  url: string
  ms: number
}

const STORAGE_KEY = 'vb:network'

const DEFAULT: NetworkConfig = {
  mode: 'auto',
  manualIp: '',
  manualPort: 3333,
  relayUrl: '',
}

// ── Module-level singleton ────────────────────────────────────
const config = ref<NetworkConfig>({ ...DEFAULT })
let _loaded = false

function ensureLoaded() {
  if (_loaded || import.meta.server) return
  _loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(config.value, JSON.parse(raw) as Partial<NetworkConfig>)
  } catch { /* ignore */ }
}

watch(
  config,
  (v) => {
    if (import.meta.server) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* ignore */ }
  },
  { deep: true },
)

// ── Candidate URL builders ────────────────────────────────────

function mdnsBase(): string { return 'http://devbridge.local:3333' }

function manualBase(): string {
  const { manualIp, manualPort } = config.value
  return manualIp ? `http://${manualIp}:${manualPort}` : ''
}

function relayBase(): string {
  return config.value.relayUrl ? config.value.relayUrl.replace(/\/+$/, '') : ''
}

function getCandidates(): string[] {
  ensureLoaded()
  const { mode } = config.value
  const relay = relayBase()
  const manual = manualBase()

  if (mode === 'relay') return relay ? [relay] : []
  if (mode === 'local') return manual ? [manual] : [mdnsBase()]

  // auto — try in order: mDNS → manual IP → relay
  const out: string[] = [mdnsBase()]
  if (manual) out.push(manual)
  if (relay) out.push(relay)
  return out
}

// ── Probing ───────────────────────────────────────────────────

async function testUrl(baseUrl: string): Promise<number | null> {
  if (!baseUrl || import.meta.server) return null
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    return res.ok ? Date.now() - start : null
  } catch {
    return null
  }
}

async function detectBestUrl(): Promise<DetectResult | null> {
  for (const url of getCandidates()) {
    const ms = await testUrl(url)
    if (ms !== null) {
      console.log(`[Network] Reachable: ${url} (${ms}ms)`)
      return { url, ms }
    }
  }
  return null
}

// ── Public API ────────────────────────────────────────────────

export function useNetworkConfig() {
  ensureLoaded()
  return { config, getCandidates, testUrl, detectBestUrl }
}

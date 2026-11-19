/**
 * Resolve a QR invitation from a URL fragment without performing pairing.
 * Supports the current base64url format and legacy percent-encoded links.
 */
export type PairingDisplayResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'origin' }

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

function decodeInvitation(value: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(value)) {
    return decodeBase64Url(value)
  }

  // Older versions passed a full percent-encoded URL through VS Code.
  // openExternal sometimes encoded its percent signs a second time.
  let candidate = value
  for (let i = 0; i < 2 && !/^https?:\/\//i.test(candidate); i += 1) {
    candidate = decodeURIComponent(candidate)
  }
  return candidate
}

export function resolvePairingDisplayInvitation(hash: string, pageOrigin: string): PairingDisplayResult {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const encoded = new URLSearchParams(fragment).get('invite') || ''
  if (!encoded) return { ok: false, reason: 'missing' }
  if (encoded.length > 8192) return { ok: false, reason: 'malformed' }

  let url: URL
  try {
    url = new URL(decodeInvitation(encoded))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, reason: 'malformed' }

  // Display pages may be embedded elsewhere, but should only render a QR for
  // an invitation to the same ViBridge origin.
  if (url.origin !== pageOrigin) return { ok: false, reason: 'origin' }

  const relay = url.searchParams.get('relay') === '1'
  const validRelay = relay
    && Boolean(url.searchParams.get('sessionId'))
    && /^\d{6}$/.test(url.searchParams.get('code') || '')
  const validLocal = !relay && Boolean(url.searchParams.get('token'))
  if (!validRelay && !validLocal) return { ok: false, reason: 'malformed' }

  return { ok: true, url: url.toString() }
}

const { once } = require('node:events')
const WebSocket = require('ws')
const { RelayAuth } = require('../dist/auth')
const { RelayStore } = require('../dist/store')
const { createRelayServer } = require('../dist/server')

async function fixture(t, sessionTtlMs = 60_000) {
  const auth = new RelayAuth('integration-tests-only')
  const store = new RelayStore(':memory:')
  const { httpServer, wss } = createRelayServer({
    port: 0, publicBaseUrl: 'http://localhost', uiBaseUrl: 'http://localhost',
    store, auth, sessionTtlMs,
  })
  httpServer.listen(0, '127.0.0.1')
  await once(httpServer, 'listening')
  t.after(async () => {
    for (const socket of wss.clients) socket.terminate()
    await Promise.all([new Promise(resolve => wss.close(resolve)), new Promise(resolve => httpServer.close(resolve))])
    store.close()
  })
  const base = `http://127.0.0.1:${httpServer.address().port}`
  const api = (path, { token, body, method } = {}) => fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const create = async () => (await api('/api/relay/sessions', { body: {} })).json()
  const pair = (session, code = session.pairingCode) => api('/api/relay/pair', {
    body: { sessionId: session.sessionId, pairingCode: code },
  })
  const dial = async () => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws')
    await once(ws, 'open')
    return ws
  }
  return { auth, store, api, create, pair, dial, wss }
}

function send(ws, frame) {
  ws.send(JSON.stringify(frame))
}

function next(ws, predicate, timeoutMs = 4_000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      ws.off('message', onMessage)
    }
    const onMessage = raw => {
      const value = JSON.parse(raw)
      if (predicate(value)) {
        cleanup()
        resolve(value)
      }
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('expected WebSocket message timed out'))
    }, timeoutMs)
    ws.on('message', onMessage)
  })
}

async function authenticate(ws, token) {
  const accepted = next(ws, msg => msg.type === 'auth_ok')
  send(ws, { type: 'auth', token })
  await accepted
  return ws
}

module.exports = { fixture, send, next, authenticate }

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { RelayStore } = require('../dist/store')
const { fixture } = require('./fixture.cjs')

test('a mobile credential exposes only its own session and no bearer tokens', async t => {
  const { create, pair, api } = await fixture(t)
  const first = await create()
  const second = await create()
  const { mobileToken } = await (await pair(first)).json()
  const other = await (await pair(second)).json()
  const response = await api('/api/relay/sessions', { token: mobileToken })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(body).sessions.map(item => item.id), [first.sessionId])
  for (const secret of [mobileToken, other.mobileToken, first.agentToken, second.agentToken]) assert.ok(!body.includes(secret))
  assert.equal((await api(`/api/relay/sessions/${second.sessionId}`, { token: mobileToken })).status, 403)
  assert.equal((await api(`/api/relay/sessions?token=${mobileToken}`)).status, 401)
})

test('setup credentials can claim an agent once and cannot authenticate sessions or sockets', async t => {
  const { api, pair, dial } = await fixture(t)
  const setup = await (await api('/api/onboarding/session', { body: {} })).json()
  assert.equal((await pair(setup)).status, 403)
  assert.equal((await api('/workspaces', { token: setup.setupToken })).status, 401)
  const ws = await dial()
  const closed = once(ws, 'close')
  ws.send(JSON.stringify({ type: 'auth', token: setup.setupToken }))
  assert.equal((await closed)[0], 4401)
  const claim = () => api('/api/onboarding/claim', { body: { setupToken: setup.setupToken, workspaceId: 'editor' } })
  assert.equal((await claim()).status, 200)
  assert.equal((await claim()).status, 409)
  assert.equal((await pair(setup)).status, 200)
})

test('pairing consumes the code and desktop re-pairing revokes the old credential', async t => {
  const { api, create, pair, dial } = await fixture(t)
  const session = await create()
  const response = await pair(session)
  assert.equal(response.status, 200)
  const { mobileToken } = await response.json()
  assert.equal((await pair(session)).status, 403)
  const ws = await dial()
  const reply = once(ws, 'message')
  ws.send(JSON.stringify({ type: 'auth', token: mobileToken }))
  assert.equal(JSON.parse((await reply)[0]).type, 'auth_ok')
  const renewed = await api('/api/relay/pairing-code', { token: session.agentToken, body: {} })
  assert.equal(renewed.status, 200)
  const { pairingCode } = await renewed.json()
  const closed = once(ws, 'close')
  assert.equal((await pair(session, pairingCode)).status, 200)
  assert.equal((await closed)[0], 4401)
  assert.equal((await api('/workspaces', { token: mobileToken })).status, 401)
})

test('the relay throttles repeated incorrect pairing codes', async t => {
  const { create, pair } = await fixture(t)
  const session = await create()
  const wrong = session.pairingCode === '000000' ? '000001' : '000000'
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await pair(session, wrong)).status, 403)
  }
  assert.equal((await pair(session)).status, 429)
})

test('signed but unissued or revoked credentials are rejected', async t => {
  const { auth, create, api, dial } = await fixture(t)
  const session = await create()
  const forged = auth.issueSessionToken(session.sessionId, 'agent')
  assert.equal((await api('/workspaces', { token: forged })).status, 401)
  const ws = await dial()
  const closed = once(ws, 'close')
  ws.send(JSON.stringify({ type: 'auth', token: forged }))
  assert.equal((await closed)[0], 4401)
})

test('an authenticated socket and HTTP access expire with the session', async t => {
  const { create, pair, dial, api } = await fixture(t, 550)
  const { mobileToken } = await (await pair(await create())).json()
  const ws = await dial()
  const reply = once(ws, 'message')
  ws.send(JSON.stringify({ type: 'auth', token: mobileToken }))
  assert.equal(JSON.parse((await reply)[0]).type, 'auth_ok')
  assert.equal((await once(ws, 'close'))[0], 4401)
  assert.equal((await api('/workspaces', { token: mobileToken })).status, 401)
})


test('remote command deduplication survives relay restarts and remains session-scoped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibridge-replay-'))
  const file = path.join(dir, 'relay.sqlite')
  try {
    const first = new RelayStore(file)
    const expiresAt = Date.now() + 60_000
    const one = first.createSession({ agentToken: 'agent-1', expiresAt })
    const two = first.createSession({ agentToken: 'agent-2', expiresAt })
    assert.equal(first.reserveRemoteCommand(one.id, 'same-id'), true)
    assert.equal(first.reserveRemoteCommand(one.id, 'same-id'), false)
    first.close()

    const restarted = new RelayStore(file)
    try {
      assert.equal(restarted.reserveRemoteCommand(one.id, 'same-id'), false)
      assert.equal(restarted.reserveRemoteCommand(two.id, 'same-id'), true)
      assert.equal(restarted.reserveRemoteCommand(one.id, 'new-id'), true)
      assert.equal(restarted.reserveRemoteCommand('missing-session', 'test-id'), false)
      assert.equal(restarted.reserveRemoteCommand(one.id, ''), false)
    } finally {
      restarted.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

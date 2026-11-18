const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const { fixture, send, next, authenticate } = require('./fixture.cjs')

async function connectedDevice(t) {
  const env = await fixture(t)
  const session = await env.create()
  const { mobileToken } = await (await env.pair(session)).json()
  const mobile = await authenticate(await env.dial(), mobileToken)
  const addAgent = async workspace => {
    const ws = await authenticate(await env.dial(), session.agentToken)
    const registered = next(mobile, msg => msg.type === 'workspace_connected' && msg.workspace_id === workspace)
    send(ws, { type: 'agent_hello', workspace_id: workspace })
    await registered
    return ws
  }
  return { ...env, session, mobileToken, mobile, addAgent }
}

test('commands route to the selected workspace and acknowledge the agent response', async t => {
  const { mobile, addAgent, store, session } = await connectedDevice(t)
  const editor = await addAgent('editor')
  const other = await addAgent('other')
  const wrongCommands = []
  other.on('message', raw => {
    const msg = JSON.parse(raw)
    if (msg.source === 'mobile') wrongCommands.push(msg)
  })

  const received = next(editor, msg => msg.type === 'message')
  const accepted = next(mobile, msg => msg.type === 'message_ack' && msg.request_id === 'command-1')
  send(mobile, {
    type: 'message', workspace_id: 'editor', target: 'terminal:Codex',
    text: 'hello', sendEnter: false, request_id: 'command-1',
  })
  const command = await received
  assert.equal(command.workspaceId, 'editor')
  assert.equal(command.target, 'terminal:Codex')
  assert.equal(command.payload.sendEnter, false)
  // Responses from another workspace, even with the correct ID, must be ignored.
  send(other, { type: 'relay_command_ack', request_id: command.request_id, ok: false })
  send(editor, { type: 'relay_command_ack', request_id: command.request_id, ok: true })
  assert.equal((await accepted).status, 'received')
  assert.deepEqual(wrongCommands, [])
  assert.equal(store.listHistory(session.sessionId).find(msg => msg.source === 'mobile').workspaceId, 'editor')

  for (const [id, workspace] of [['ambiguous', undefined], ['unknown', 'offline']]) {
    const rejected = next(mobile, msg => msg.type === 'message_ack' && msg.request_id === id)
    send(mobile, { type: 'message', text: 'must not execute', workspace_id: workspace, request_id: id })
    assert.equal((await rejected).reason, 'workspace_unavailable')
  }
  const spoof = next(mobile, msg => msg.type === 'message_ack' && msg.request_id === 'forged-control')
  send(mobile, { type: 'relay_file_request', request_id: 'forged-control', path: 'private.ts' })
  assert.equal((await spoof).reason, 'unsupported_command')
})

test('a replacement workspace keeps its registration when the stale socket closes', async t => {
  const { mobile, addAgent, api, mobileToken } = await connectedDevice(t)
  const stale = await addAgent('same')
  const closed = once(stale, 'close')
  const replacement = await addAgent('same')
  assert.equal((await closed)[0], 4410)
  const registered = await (await api('/workspaces', { token: mobileToken })).json()
  assert.equal(registered.find(workspace => workspace.id === 'same').connected, true)
  const incoming = next(replacement, msg => msg.type === 'start_cli')
  const accepted = next(mobile, msg => msg.request_id === 'start')
  send(mobile, { type: 'start_cli', workspace_id: 'same', cliId: 'codex', request_id: 'start' })
  const request = await incoming
  assert.equal(request.payload.cliId, 'codex')
  send(replacement, { type: 'relay_command_ack', request_id: request.request_id, ok: true })
  assert.equal((await accepted).status, 'received')
})

test('file responses are correlated with the destination socket and session', async t => {
  const { session, addAgent, mobileToken, create, dial, api } = await connectedDevice(t)
  const destination = await addAgent('editor')
  const other = await create()
  const intruder = await authenticate(await dial(), other.agentToken)
  const registered = next(intruder, msg => msg.type === 'peer_status' && msg.agentConnected)
  send(intruder, { type: 'agent_hello', workspace_id: 'editor' })
  await registered
  const inbound = next(destination, msg => msg.type === 'relay_file_request')
  const response = api(`/api/relay/sessions/${session.sessionId}/files?workspaceId=editor&path=main.ts`, { token: mobileToken })
  const req = await inbound
  send(intruder, { type: 'relay_file_response', request_id: req.request_id, content: 'forged' })
  send(destination, { type: 'relay_file_response', request_id: req.request_id, content: 'correct' })
  assert.equal((await (await response).json()).content, 'correct')
})

test('disconnecting an agent marks a command unconfirmed and never replays it to a new agent', async t => {
  const { mobile, addAgent, session, store } = await connectedDevice(t)
  const agent = await addAgent('editor')
  const incoming = next(agent, msg => msg.type === 'message')
  const failed = next(mobile, msg => msg.type === 'message_ack' && msg.request_id === 'disconnect')
  send(mobile, { type: 'message', text: 'pending', request_id: 'disconnect' })
  await incoming
  agent.terminate()
  assert.equal((await failed).status, 'unconfirmed')
  const replacement = await addAgent('editor')
  assert.equal(store.listHistory(session.sessionId).some(msg => msg.source === 'mobile'), false)
  const received = next(replacement, msg => msg.source === 'mobile')
  send(mobile, { type: 'message', text: 'new command', request_id: 'new' })
  assert.equal((await received).text, 'new command')
})

test('old agents cannot add their pairing secrets to current snapshots', async t => {
  const { mobile, addAgent } = await connectedDevice(t)
  const agent = await addAgent('editor')
  const snapshot = next(mobile, msg => msg.type === 'status_snapshot')
  send(agent, {
    type: 'status_snapshot', workspace_id: 'forged',
    payload: { adapters: [], relay: { agentToken: 'jwt', pairingCode: '123456', qrUrl: 'secret' } },
  })
  const value = await snapshot
  assert.equal(value.workspaceId, 'editor')
  assert.equal(value.payload.relay.agentToken, undefined)
  assert.equal(value.payload.relay.pairingCode, undefined)
  assert.equal(value.payload.relay.qrUrl, undefined)
})

test('invalid JSON shapes close their own socket without taking down the relay', async t => {
  const { dial, api } = await fixture(t)
  const ws = await dial()
  const closed = once(ws, 'close')
  ws.send('null')
  assert.equal((await closed)[0], 1008)
  assert.equal((await api('/health')).status, 200)
})


test('push registration is authorized and routed to the selected agent', async t => {
  const { mobileToken, addAgent, api } = await connectedDevice(t)
  const agent = await addAgent('editor')
  assert.equal((await api('/push/public-key?workspaceId=editor')).status, 401)

  const keyRequest = next(agent, msg => msg.type === 'relay_push_request' && msg.action === 'public_key')
  const keyResponse = api('/push/public-key?workspaceId=editor', { token: mobileToken })
  const keyMsg = await keyRequest
  send(agent, { type: 'relay_push_response', request_id: keyMsg.request_id, publicKey: 'test-vapid-key' })
  assert.equal((await (await keyResponse).json()).publicKey, 'test-vapid-key')

  const body = { endpoint: 'https://fcm.googleapis.com/test', keys: { auth: 'auth', p256dh: 'p256dh' } }
  const subscribeRequest = next(agent, msg => msg.type === 'relay_push_request' && msg.action === 'subscribe')
  const subscription = api('/push/subscribe?workspaceId=editor', { token: mobileToken, method: 'POST', body })
  const subscribeMsg = await subscribeRequest
  assert.equal(subscribeMsg.subscription.endpoint, body.endpoint)
  send(agent, { type: 'relay_push_response', request_id: subscribeMsg.request_id, ok: true })
  assert.equal((await subscription).status, 200)
})

test('extension dispatch evidence is distinct from agent receipt', async t => {
  const { mobile, addAgent, store, session } = await connectedDevice(t)
  const agent = await addAgent('editor')
  const observed = next(mobile, msg => msg.type === 'command_execution')
  send(agent, {
    type: 'command_execution',
    request_id: 'terminal-request-1',
    phase: 'dispatched',
    action: 'message',
    terminalId: 'terminal-123',
  })
  const event = await observed
  assert.equal(event.payload.phase, 'dispatched')
  assert.equal(event.payload.terminalId, 'terminal-123')
  assert.equal(store.listHistory(session.sessionId).some(entry => entry.type === 'command_execution'), true)
})

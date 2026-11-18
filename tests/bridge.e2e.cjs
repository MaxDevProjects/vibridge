const assert = require('node:assert/strict')
const { once } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const WebSocket = require('../relay/node_modules/ws')
const { RelayAuth } = require('../relay/dist/auth')
const { RelayStore } = require('../relay/dist/store')
const { createRelayServer } = require('../relay/dist/server')
const { send, next, authenticate } = require('../relay/tests/fixture.cjs')
const { RelayClient } = require('../agent/dist/relay-client')
const { MessageQueue } = require('../agent/dist/queue')
const { IpcServer } = require('../agent/dist/ipc')
const { AuthService } = require('../agent/dist/auth')
const { FileService } = require('../agent/dist/files')
const { ControlPolicy } = require('../agent/dist/control-policy')
const { IpcClient } = require('../extension/dist/ipcClient')

test('the mobile sends to the correct VS Code IPC client before and after relay reconnection', { timeout: 15_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibridge-e2e-'))
  const store = new RelayStore(':memory:')
  const auth = new RelayAuth('integration-tests-only')
  async function reservePort() {
    const listener = require('node:net').createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const port = listener.address().port
    await new Promise(resolve => listener.close(resolve))
    return port
  }
  const port = await reservePort()
  const ipcPort = await reservePort()
  const previousSecret = process.env.IPC_SHARED_SECRET
  const ipcToken = 'test-only-ipc-credential-32-characters'
  process.env.IPC_SHARED_SECRET = ipcToken
  const base = `http://127.0.0.1:${port}`
  const { httpServer, wss } = createRelayServer({
    port, publicBaseUrl: base, uiBaseUrl: base, store, auth, sessionTtlMs: 60_000,
  })
  httpServer.listen(port, '127.0.0.1')
  await once(httpServer, 'listening')

  const queue = new MessageQueue()
  const adapters = {
    list: () => [], active: () => null, getPreviewUrl: () => null,
    registerIpcAdapter() {}, unregister() {},
  }
  const workspace = { id: 'workstation', name: 'Workstation', path: directory, sessionFilePath: path.join(directory, 'session.json') }
  const socketPath = path.join(directory, 'ipc.sock')
  const ipc = new IpcServer(socketPath, adapters, queue, { send: async () => {} }, new AuthService(), workspace.id)
  const extension = new IpcClient({ kind: 'tcp', host: '127.0.0.1', port: ipcPort, token: ipcToken })
  const agent = new RelayClient({
    internalUrl: base, publicUrl: base, sessionLabel: workspace.name, workspaceFolders: [directory],
    workspace, adapters, ipc, queue, files: new FileService(directory),
    controlPolicy: new ControlPolicy({ VIBRIDGE_REMOTE_MODE: 'control' }),
  })
  let mobile
  try {
    await ipc.listen(ipcPort, false)
    const extensionConnected = once(extension, 'connected')
    extension.connect()
    await extensionConnected
    await agent.start()

    const id = agent.getState().sessionId
    const code = new URL(agent.getQrUrl()).searchParams.get('code')
    const response = await fetch(base + '/api/relay/pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id, pairingCode: code }),
    })
    assert.equal(response.status, 200)
    const { mobileToken } = await response.json()
    mobile = new WebSocket(base.replace('http:', 'ws:') + '/ws')
    await once(mobile, 'open')
    const initialState = next(mobile, msg =>
      (msg.type === 'auth_ok' && msg.workspaces.some(workspace => workspace.connected))
      || msg.type === 'workspace_connected',
    )
    await authenticate(mobile, mobileToken)
    await initialState

    async function deliver(requestId, text) {
      const injected = once(extension, 'inject_message')
      const ack = next(mobile, msg => msg.type === 'message_ack' && msg.request_id === requestId)
      send(mobile, {
        type: 'message', workspace_id: workspace.id, target: 'terminal:Codex',
        text, sendEnter: false, request_id: requestId,
      })
      const [command] = await injected
      assert.equal(command.text, text)
      assert.equal(command.target, 'terminal:Codex')
      assert.equal(command.sendEnter, false)
      assert.equal((await ack).status, 'received')
    }

    await deliver('before', 'first command')
    const reconnect = next(mobile, msg => msg.type === 'workspace_connected' && msg.workspace_id === workspace.id)
    const serverSideAgent = Array.from(wss.clients).find(peer => peer.workspaceId === workspace.id)
    assert.ok(serverSideAgent)
    serverSideAgent.terminate()
    await reconnect
    assert.equal(agent.getState().sessionId, id)
    await deliver('after', 'second command')
  } finally {
    if (previousSecret === undefined) delete process.env.IPC_SHARED_SECRET
    else process.env.IPC_SHARED_SECRET = previousSecret
    extension.disconnect()
    agent.stop()
    ipc.close()
    mobile?.terminate()
    for (const ws of wss.clients) ws.terminate()
    await Promise.all([
      new Promise(resolve => wss.close(resolve)),
      new Promise(resolve => httpServer.close(resolve)),
    ])
    store.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

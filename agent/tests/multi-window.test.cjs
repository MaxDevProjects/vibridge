const assert = require('node:assert/strict')
const { once } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { test } = require('node:test')
const { IpcServer } = require('../dist/ipc')

const pause = () => new Promise(resolve => setTimeout(resolve, 25))

test('two VS Code windows remain registered and commands never jump to another window', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibridge-windows-'))
  const sock = path.join(dir, 'ipc.sock')
  const adapters = {
    registerIpcAdapter() {},
    unregister() {},
  }
  const queue = { onOutput: () => () => {} }
  const server = new IpcServer(sock, adapters, queue, { send: async () => {} }, {}, 'workspace')
  await server.listen()
  t.after(() => {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const connect = async id => {
    const socket = net.createConnection(sock)
    await once(socket, 'connect')
    socket.write(JSON.stringify({ type: 'register', tool: 'vscode', label: 'VS Code', windowId: id }) + '\n')
    return socket
  }
  const a = await connect('window-a')
  const b = await connect('window-b')
  t.after(() => { a.destroy(); b.destroy() })
  await pause()
  assert.deepEqual(server.getWindows().map(window => window.id), ['window-a', 'window-b'])

  // A malicious/stale client cannot pretend its snapshot belongs to B.
  a.write(JSON.stringify({ type: 'ide_snapshot', windowId: 'window-b',
    workspaceFolders: ['/projects/a'], terminals: [{ id: 'terminal-a', name: 'bash' }] }) + '\n')
  b.write(JSON.stringify({ type: 'ide_snapshot', windowId: 'window-a',
    workspaceFolders: ['/projects/b'], terminals: [{ id: 'terminal-b', name: 'Codex' }] }) + '\n')
  await pause()
  assert.equal(server.getWindows().find(w => w.id === 'window-a').workspaceFolders[0], '/projects/a')
  assert.equal(server.getWindows().find(w => w.id === 'window-b').workspaceFolders[0], '/projects/b')

  // No implicit "last focused" fallback when more than one window is online.
  assert.equal(server.sendToExtension({ type: 'inject_message', text: 'unsafe ambiguity' }), false)
  const received = once(a, 'data')
  assert.equal(server.sendToExtension({
    type: 'inject_message', text: 'hello A', target: 'terminal:terminal-a', windowId: 'window-a'
  }), true)
  assert.match((await received)[0].toString(), /hello A/)
  assert.equal(server.sendToExtension({ type: 'inject_message', text: 'hello stale', windowId: 'not-connected' }), false)

  const closed = once(a, 'close')
  a.destroy()
  await closed
  await pause()
  assert.equal(server.getWindows().find(w => w.id === 'window-a').connected, false)
  assert.equal(server.getWindows().find(w => w.id === 'window-b').connected, true)
  assert.equal(server.sendToExtension({ type: 'inject_message', text: 'no stale target', windowId: 'window-a' }), false)
})

const assert = require('node:assert/strict')
const { test } = require('node:test')
const Module = require('node:module')
const fake = { window: { terminals: [] } }
const original = Module._load
let identity
try {
  Module._load = function (name, parent, isMain) {
    if (name === 'vscode') return fake
    return original.apply(this, arguments)
  }
  identity = require('../dist/terminalIdentity')
} finally {
  Module._load = original
}

test('terminal instance IDs disambiguate duplicate names and disappear with closed terminals', () => {
  const alpha = { name: 'Codex' }
  const beta = { name: 'Codex' }
  fake.window.terminals = [alpha, beta]
  const idAlpha = identity.getTerminalId(alpha)
  const idBeta = identity.getTerminalId(beta)
  assert.notEqual(idAlpha, idBeta)
  assert.equal(identity.getTerminalId(alpha), idAlpha)
  assert.equal(identity.findTerminal('terminal:' + idAlpha).terminal, alpha)
  assert.equal(identity.findTerminal('Codex').ambiguous, true)
  fake.window.terminals = [beta]
  assert.equal(identity.findTerminal('terminal:' + idAlpha).terminal, null)
  assert.equal(identity.findTerminal('Codex').terminal, beta)
})

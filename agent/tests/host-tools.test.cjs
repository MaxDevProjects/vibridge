const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { CliRegistry } = require('../dist/cliRegistry')

test('only locally declared host tools survive registry validation', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vibridge-host-tools-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const registry = new CliRegistry(folder)
  registry.replaceHostTools([
    { id: 'antigravity', name: 'Antigravity', command: 'agy', args: [], detected: true },
    { id: 'bad', name: 'Bad', command: 'agy;rm -rf /', detected: true },
    { id: 'nono', name: 'Bad arg', command: 'agy', args: ['unsafe\nnewline'], detected: true },
  ])
  assert.equal(registry.getById('host-antigravity').command, 'agy')
  assert.equal(registry.getById('host-bad'), undefined)
  assert.equal(registry.getById('host-nono'), undefined)
  registry.applyExtensionReport(['codex'])
  assert.equal(registry.getById('host-antigravity').detected, true)
  registry.replaceHostTools([])
  assert.equal(registry.getById('host-antigravity'), undefined)
})

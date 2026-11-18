const assert = require('node:assert/strict')
const { test } = require('node:test')
const { ControlPolicy } = require('../dist/control-policy')

test('remote control defaults to observation and refuses all state-changing actions', () => {
  const policy = new ControlPolicy({})
  assert.equal(policy.mode, 'observe')
  for (const action of ['message', 'chat', 'action', 'start_cli', 'create_terminal', 'kill_cli', 'open_project', 'configure_cli', 'notif_response']) {
    assert.equal(policy.authorize(action, { cliId: 'codex' }).allowed, false, action)
  }
  assert.equal(policy.authorize('list_projects').allowed, true)
})

test('control mode allows only explicitly listed CLIs and never grants remote administration', () => {
  const policy = new ControlPolicy({
    VIBRIDGE_REMOTE_MODE: 'control',
    VIBRIDGE_ALLOWED_CLIS: 'codex,claude-code',
  })
  assert.equal(policy.authorize('message').allowed, true)
  assert.equal(policy.authorize('start_cli', { cliId: 'codex' }).allowed, true)
  assert.equal(policy.authorize('start_cli', { cliId: 'custom-tool' }).allowed, false)
  assert.equal(policy.authorize('configure_cli').allowed, false)
  assert.equal(policy.authorize('action').allowed, false)
  assert.equal(policy.authorize('notif_response').allowed, false)
  assert.equal(policy.authorize('kill_cli').allowed, false)
  assert.equal(new ControlPolicy({
    VIBRIDGE_REMOTE_MODE: 'control',
    VIBRIDGE_ALLOW_TERMINAL_CLOSE: 'true',
  }).authorize('kill_cli').allowed, true)
})

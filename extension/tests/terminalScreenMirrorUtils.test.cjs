const test = require('node:test');
const assert = require('node:assert/strict');
const { validMirrorSession, boundedMirrorScreen, MIRROR_SCREEN_LIMIT } = require('../dist/terminalScreenMirrorUtils');

test('only UUID-derived tmux sessions may be reattached', () => {
  assert.equal(validMirrorSession('vibridge_' + 'a'.repeat(32)), true);
  assert.equal(validMirrorSession('vibridge_' + '0'.repeat(32)), true);
  assert.equal(validMirrorSession('vibridge_bash'), false);
  assert.equal(validMirrorSession('vibridge_' + 'z'.repeat(32)), false);
  assert.equal(validMirrorSession('vibridge_' + 'a'.repeat(32) + '; echo pwn'), false);
  assert.equal(validMirrorSession('../other'), false);
  assert.equal(validMirrorSession(''), false);
});

test('live screen snapshots are bounded and preserve the final visible text', () => {
  const output = 'working\rfinal response\n$ ';
  assert.equal(boundedMirrorScreen(output), 'workingfinal response\n$ ');
  assert.equal(boundedMirrorScreen('x'.repeat(MIRROR_SCREEN_LIMIT + 200)).length, MIRROR_SCREEN_LIMIT);
  assert.equal(boundedMirrorScreen('x'.repeat(MIRROR_SCREEN_LIMIT + 200)).endsWith('x'), true);
});

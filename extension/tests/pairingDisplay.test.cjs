const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPairingDisplayUrl } = require('../dist/pairingDisplay');

test('remote pairing opens the QR display without consuming the invitation', () => {
  const invite = 'https://vibridge.example/?relay=1&relayUrl=https%3A%2F%2Frelay.example&sessionId=abc&code=123456';
  const target = buildPairingDisplayUrl(invite);
  assert.ok(target);
  const display = new URL(target);
  assert.equal(display.origin, 'https://vibridge.example');
  assert.equal(display.pathname, '/pairing/display');
  assert.equal(display.search, '');
  assert.equal(new URLSearchParams(display.hash.slice(1)).get('invite'), invite);
});

test('local pairing uses the local UI, not a public relay', () => {
  const invite = 'http://devbridge.local:8080/?view=mobile&agentUrl=http%3A%2F%2Fdevbridge.local%3A3333&token=abc';
  const display = new URL(buildPairingDisplayUrl(invite));
  assert.equal(display.origin, 'http://devbridge.local:8080');
  assert.equal(new URLSearchParams(display.hash.slice(1)).get('invite'), invite);
});

test('invalid or non-web invitations are rejected', () => {
  assert.equal(buildPairingDisplayUrl('not-an-url'), null);
  assert.equal(buildPairingDisplayUrl('javascript:alert(1)'), null);
  assert.equal(buildPairingDisplayUrl('file:///tmp/pairing'), null);
});

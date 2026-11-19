const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPairingDisplayUrl } = require('../dist/pairingDisplay');

test('relay pairing uses a fragment with no percent encoding for external browsers', () => {
  const invitation = 'https://vibridge.example/?relay=1&relayUrl=https%3A%2F%2Fvibridge.example%2Frelay&sessionId=abc&code=123456';
  const target = buildPairingDisplayUrl(invitation);
  assert.ok(target);
  const display = new URL(target);
  assert.equal(display.origin, 'https://vibridge.example');
  assert.equal(display.pathname, '/pairing/display');
  assert.equal(display.search, '');
  assert.match(display.hash, /^#invite=[A-Za-z0-9_-]+$/);
  const encoded = new URLSearchParams(display.hash.slice(1)).get('invite');
  assert.equal(Buffer.from(encoded, 'base64url').toString('utf8'), invitation);
});

test('local pairing uses the local UI and preserves nested URL query parameters', () => {
  const invitation = 'http://devbridge.local:8080/?view=mobile&agentUrl=http%3A%2F%2Fdevbridge.local%3A3333&token=abc';
  const display = new URL(buildPairingDisplayUrl(invitation));
  assert.equal(display.origin, 'http://devbridge.local:8080');
  const encoded = new URLSearchParams(display.hash.slice(1)).get('invite');
  assert.equal(Buffer.from(encoded, 'base64url').toString('utf8'), invitation);
});

test('invalid or non-web invitations are rejected', () => {
  assert.equal(buildPairingDisplayUrl('not-an-url'), null);
  assert.equal(buildPairingDisplayUrl('javascript:alert(1)'), null);
  assert.equal(buildPairingDisplayUrl('file:///tmp/pairing'), null);
});

import { resolveChatHistoryKey } from '../../composables/useWorkspaceChatHistory'
import { activeProjectPath, projectName, projectIsActive, scopedProjectKey } from '../../composables/projectContext'
import assert from 'node:assert/strict'
import { resolvePairingDisplayInvitation } from '../../utils/pairingDisplayInvitation'
import { hasPairingInvitation } from '../../utils/pairingRoute'

import { formatTerminalMessage, splitTerminalInlineSegments } from '../../composables/formatTerminalMessage'
import { useQuickReplies } from '../../composables/useQuickReplies'
import { compactTerminalOutput, terminalConversationKey } from '../../composables/compactTerminalOutput'
import { findRestorableThread } from '../../utils/mobileThreadRecovery'

let failures = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}`)
    console.error(error)
  }
}

test('formatTerminalMessage strips ANSI and compresses blank lines', () => {
  const formatted = formatTerminalMessage('\u001b[31merror\u001b[0m\n\n\nnext')
  assert.equal(formatted.blocks.length, 1)
  assert.equal(formatted.blocks[0]?.type, 'text')
  assert.equal(formatted.blocks[0]?.lines[0]?.raw, 'error')
  assert.equal(formatted.blocks[0]?.lines[1]?.raw, '')
  assert.equal(formatted.blocks[0]?.lines[2]?.raw, 'next')
})

test('formatTerminalMessage detects fenced code blocks', () => {
  const formatted = formatTerminalMessage('before\n```ts\nconst x = 1\n```\nafter')
  assert.equal(formatted.blocks.length, 3)
  assert.equal(formatted.blocks[1]?.type, 'code')
  assert.equal(formatted.blocks[1]?.lines[0]?.raw, 'const x = 1')
})

test('formatTerminalMessage detects indented code blocks', () => {
  const formatted = formatTerminalMessage('intro\n    npm run dev\n    npm test\noutro')
  assert.equal(formatted.blocks.length, 3)
  assert.equal(formatted.blocks[1]?.type, 'code')
  assert.deepEqual(formatted.blocks[1]?.lines.map(line => line.raw), ['npm run dev', 'npm test'])
})

test('formatTerminalMessage marks long lines and provides preview', () => {
  const source = 'a'.repeat(90)
  const formatted = formatTerminalMessage(source)
  const line = formatted.blocks[0]?.lines[0]
  assert.equal(line?.isLong, true)
  assert.equal(line?.preview.length, 81)
  assert.equal(line?.preview.endsWith('…'), true)
})

test('splitTerminalInlineSegments highlights unix and relative paths', () => {
  const segments = splitTerminalInlineSegments('see /tmp/demo/file.ts and ./src/index.ts now')
  assert.deepEqual(
    segments.filter(segment => segment.type === 'path').map(segment => segment.text),
    ['/tmp/demo/file.ts', './src/index.ts'],
  )
})

test('useQuickReplies detects numbered choices', () => {
  const result = useQuickReplies('1. Oui\n2. Non\n3. Annuler')
  assert.equal(result.hasChoices, true)
  assert.deepEqual(result.choices.map(choice => choice.value), ['1', '2', '3'])
  assert.deepEqual(result.choices.map(choice => choice.label), ['Oui', 'Non', 'Annuler'])
})

test('useQuickReplies detects codex-style quoted numbered choices', () => {
  const result = useQuickReplies('> 1. Continue\n> 2. Stop')
  assert.equal(result.hasChoices, true)
  assert.deepEqual(result.choices.map(choice => choice.value), ['1', '2'])
})

test('useQuickReplies detects bracketed choices', () => {
  const result = useQuickReplies('[1] Retry / [2] Cancel\n[1] Retry\n[2] Cancel')
  assert.equal(result.hasChoices, true)
  assert.deepEqual(result.choices.map(choice => choice.value), ['1', '2'])
})

test('useQuickReplies detects yes-no shorthand', () => {
  const result = useQuickReplies('Continue? y/n')
  assert.equal(result.hasChoices, true)
  assert.deepEqual(result.choices.map(choice => choice.value), ['y', 'n'])
})

test('compactTerminalOutput ignores repeated spinner frames without inventing terminal success', () => {
  const state = compactTerminalOutput('\u001b[32mWorking...\u001b[0m\r⠁\r⠂\rCreated index.html\n')
  assert.equal(state.display, 'Created index.html')
  assert.equal(state.working, false)
})

test('compactTerminalOutput preserves only the last carriage-return state', () => {
  const state = compactTerminalOutput('Loading 1%\rLoading 30%\rDONE\n')
  assert.equal(state.display, 'DONE')
})

test('threads are isolated even if terminal names match', () => {
  const first = terminalConversationKey('sess-1', 'agent', 'window-1', 'terminal-1')
  const second = terminalConversationKey('sess-1', 'agent', 'window-2', 'terminal-1')
  const third = terminalConversationKey('sess-2', 'agent', 'window-1', 'terminal-1')
  assert.notEqual(first, second)
  assert.notEqual(first, third)
})

test('project path is derived from the live VS Code folder, not the agent identifier', () => {
  assert.equal(activeProjectPath({ workspaceFolders: ['/home/clower/projects/new-project'] }), '/home/clower/projects/new-project')
  assert.equal(projectName('/home/clower/projects/new-project/'), 'new-project')
  assert.equal(activeProjectPath({ workspaceFolders: [] }), '')
  assert.equal(projectIsActive('/home/clower/projects/new-project/', '/home/clower/projects/new-project'), true)
  assert.equal(projectIsActive('/home/clower/projects/old-project', '/home/clower/projects/new-project'), false)
})

test('chat and terminal selection storage is isolated between projects', () => {
  const base = resolveChatHistoryKey('relay', 'https://relay.example', 'session', 'editor')
  assert.notEqual(scopedProjectKey(base, '/home/projects/a'), scopedProjectKey(base, '/home/projects/b'))
  assert.equal(scopedProjectKey(base, '/home/projects/a/'), scopedProjectKey(base, '/home/projects/a'))
  assert.equal(scopedProjectKey('', '/home/projects/a'), '')
})


test('pairing display decodes base64url invitation without consuming it', () => {
  const invitation = 'https://vibridge.example/?relay=1&relayUrl=https%3A%2F%2Fvibridge.example%2Frelay&sessionId=abc&code=123456'
  const encoded = Buffer.from(invitation, 'utf8').toString('base64url')
  assert.deepEqual(
    resolvePairingDisplayInvitation(`#invite=${encoded}`, 'https://vibridge.example'),
    { ok: true, url: invitation },
  )
})

test('pairing display accepts older percent-encoded and double-encoded fragments', () => {
  const invitation = 'https://vibridge.example/?relay=1&relayUrl=https%3A%2F%2Fvibridge.example%2Frelay&sessionId=abc&code=123456'
  const legacy = `#${new URLSearchParams({ invite: invitation }).toString()}`
  const doubleEncoded = legacy.replace(/%/g, '%25')
  assert.deepEqual(resolvePairingDisplayInvitation(legacy, 'https://vibridge.example'), { ok: true, url: invitation })
  assert.deepEqual(resolvePairingDisplayInvitation(doubleEncoded, 'https://vibridge.example'), { ok: true, url: invitation })
})

test('pairing display rejects invalid, missing and cross-origin invitations', () => {
  const local = 'http://devbridge.local:8080/?token=secret&view=mobile'
  const encoded = Buffer.from(local, 'utf8').toString('base64url')
  assert.deepEqual(resolvePairingDisplayInvitation('', 'http://devbridge.local:8080'), { ok: false, reason: 'missing' })
  assert.deepEqual(resolvePairingDisplayInvitation('#invite=garbage', 'http://devbridge.local:8080'), { ok: false, reason: 'malformed' })
  assert.deepEqual(resolvePairingDisplayInvitation(`#invite=${encoded}`, 'https://vibridge.example'), { ok: false, reason: 'origin' })
  assert.deepEqual(resolvePairingDisplayInvitation(`#invite=${encoded}`, 'http://devbridge.local:8080'), { ok: true, url: local })
})


test('mobile chat recovers a terminal only with unique matching process and project', () => {
  const current = { key:'new', projectPath:'/work/we-june', label:'DevBridge 1', processId:1205, connected:true }
  const previous = { ...current, key:'old', connected:false, lastSeen:Date.now()-5000 }
  const hasHistory = (key:string) => key === 'old'
  assert.equal(findRestorableThread(current,[previous],[current],hasHistory),'old')
  assert.equal(findRestorableThread(current,[previous,{...previous,key:'other'}],[current],()=>true),null)
  assert.equal(findRestorableThread(current,[previous],[current,{...current,key:'another'}],hasHistory),null)
  assert.equal(findRestorableThread({...current,processId:320},[previous],[current],hasHistory),null)
  assert.equal(findRestorableThread({...current,projectPath:'/work/other'},[previous],[current],hasHistory),null)
  assert.equal(findRestorableThread({...current,processId:undefined},[previous],[current],hasHistory),null)
})

test('mobile chat can recover a previous active window after agent restart without guessing terminal names', () => {
  const live = { key:'new', projectPath:'/project', label:'bash', processId:1234, connected:true }
  const remembered = { ...live, key:'from-previous-restart', connected:true, lastSeen:Date.now()-10000 }
  assert.equal(findRestorableThread(live,[remembered],[live],()=>true),remembered.key)
  assert.equal(findRestorableThread(live,[{...remembered,lastSeen:Date.now()-25*3600*1000}],[live],()=>true),null)
  assert.equal(findRestorableThread(live,[{...remembered,processId:1235}],[live],()=>true),null)
  assert.equal(findRestorableThread(live,[{...remembered,recoveredTo:'other'}],[live],()=>true),null)
})

test('QR relay invitation must be processed before routing phones to /mobile', () => {
  assert.equal(hasPairingInvitation({
    relay: '1',
    sessionId: 'sess_abc',
    relayUrl: 'https://vibridge.example/relay',
    code: '123456',
  }), true)
  assert.equal(hasPairingInvitation({
    relay: ['1'],
    sessionId: ['sess_abc'],
    code: ['123456'],
  }), true)
  assert.equal(hasPairingInvitation({ view: 'mobile' }), false)
  assert.equal(hasPairingInvitation({ relay: '1', sessionId: 'sess_abc', code: '12345' }), false)
  assert.equal(hasPairingInvitation({ relay: '1', code: '123456' }), false)
})

test('local QR invitations are handled before automatic mobile navigation too', () => {
  assert.equal(hasPairingInvitation({ token: 'short', agentUrl: 'http://devbridge.local:3333' }), true)
  assert.equal(hasPairingInvitation({ host: 'devbridge.local', port: '3333', token: 'short' }), true)
  assert.equal(hasPairingInvitation({ host: 'devbridge.local', port: '3333', code: '123456' }), true)
  assert.equal(hasPairingInvitation({ token: 'short' }), false)
})

if (failures > 0) {
  process.exitCode = 1
} else {
  const first = resolveChatHistoryKey('relay', 'https://relay.example', 'session-a', 'editor')
  const second = resolveChatHistoryKey('relay', 'https://relay.example', 'session-b', 'editor')
  if (!first || first === second || resolveChatHistoryKey('relay', '', 'session-a', '') !== '') {
    throw new Error('Workspace chat storage needs a distinct session and workspace')
  }
  if (resolveChatHistoryKey('local', 'http://first', '', '') === resolveChatHistoryKey('local', 'http://second', '', '')) {
    throw new Error('Local chat storage needs a distinct agent origin')
  }
  console.log('PASS chat history is isolated by relay session, workspace and local agent')
  console.log('All unit tests passed.')
}


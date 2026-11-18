import { resolveChatHistoryKey } from '../../composables/useWorkspaceChatHistory'
import { activeProjectPath, projectName, projectIsActive, scopedProjectKey } from '../../composables/projectContext'
import assert from 'node:assert/strict'

import { formatTerminalMessage, splitTerminalInlineSegments } from '../../composables/formatTerminalMessage'
import { useQuickReplies } from '../../composables/useQuickReplies'

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


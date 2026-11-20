import { resolveChatHistoryKey } from '../../composables/useWorkspaceChatHistory'
import { activeProjectPath, projectName, projectIsActive, scopedProjectKey } from '../../composables/projectContext'
import assert from 'node:assert/strict'
import { resolvePairingDisplayInvitation } from '../../utils/pairingDisplayInvitation'
import { hasPairingInvitation } from '../../utils/pairingRoute'

import { formatTerminalMessage, splitTerminalInlineSegments } from '../../composables/formatTerminalMessage'
import { useQuickReplies } from '../../composables/useQuickReplies'
import { compactTerminalOutput, terminalConversationKey } from '../../composables/compactTerminalOutput'
import { findRestorableThread } from '../../utils/mobileThreadRecovery'
import { routeTerminalEvent } from '../../utils/routeTerminalEvent'
import { computeReentrySummary } from '../../utils/mobileReentry'
import { inferCliContext, availableActions, discoverSlashCommands,
  safeWorkspaceRelativePath, quotePosix } from '../../utils/terminalActionCatalog'
import { extractObservedTerminalNotes } from '../../utils/observedTerminalNotes'
import { selectReadingSource } from '../../utils/terminalReadingSource'
import { nextDeliveryStage, deliveryStatusText } from '../../utils/terminalDelivery'

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


test('mobile routes output to its exact terminal regardless of selected VS Code window', () => {
  const threads=[
    {key:'a',windowId:'window-a',terminalId:'term-1',connected:true},
    {key:'b',windowId:'window-b',terminalId:'term-1',connected:true},
    {key:'c',windowId:'window-c',terminalId:'term-2',connected:true},
  ]
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-b',tool:'terminal:term-1'},threads)?.key,'b')
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-c',terminalId:'term-2'},threads)?.key,'c')
  assert.equal(routeTerminalEvent({type:'ide_event',windowId:'window-a',terminalId:'term-1'},threads)?.key,'a')
  assert.equal(routeTerminalEvent({type:'notification',windowId:'window-a',terminalId:'term-1'},threads)?.key,'a')
})

test('mobile never guesses an output target from terminal names or ambiguous identities', () => {
  const threads=[
    {key:'old',windowId:'window-a',terminalId:'old-term',connected:false},
    {key:'live',windowId:'window-a',terminalId:'new-term',connected:true},
    {key:'other',windowId:'window-b',terminalId:'new-term',connected:true},
  ]
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-a',tool:'terminal:old-term'},threads),null)
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-a',tool:'bash'},threads),null)
  assert.equal(routeTerminalEvent({type:'output',terminalId:'new-term'},threads),null)
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-a'},threads),null)
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-a',tool:'terminal:new-term'},threads)?.key,'live')
  assert.equal(routeTerminalEvent({type:'output',windowId:'window-a',tool:'terminal:new-term'},[
    ...threads,{key:'duplicate',windowId:'window-a',terminalId:'new-term',connected:true}
  ]),null)
  assert.equal(routeTerminalEvent({type:'chat_response',windowId:'window-a',tool:'terminal:new-term'},threads),null)
})

test('live terminal screens must be routed only to the exact connected terminal', () => {
  const terminals = [
    {key:'a',windowId:'window-a',terminalId:'term-1',connected:true},
    {key:'b',windowId:'window-b',terminalId:'term-1',connected:true},
    {key:'offline',windowId:'window-c',terminalId:'term-2',connected:false},
  ]
  assert.equal(routeTerminalEvent({type:'terminal_screen',windowId:'window-a',terminalId:'term-1'},terminals)?.key,'a')
  assert.equal(routeTerminalEvent({type:'terminal_screen',windowId:'window-b',terminalId:'term-1'},terminals)?.key,'b')
  assert.equal(routeTerminalEvent({type:'terminal_screen',windowId:'window-c',terminalId:'term-2'},terminals),null)
  assert.equal(routeTerminalEvent({type:'terminal_screen',terminalId:'term-1'},terminals),null)
  assert.equal(routeTerminalEvent({type:'terminal_screen',windowId:'window-a',terminalId:'unknown'},terminals),null)
})


test('terminal notes extract explicit final bullets without inferring success', () => {
  const raw=[
    'Working...',
    '## Conclusion',
    '- La page accueil a été modernisée avec deux sections plus lisibles.',
    '- Tests de build réalisés, mais le résultat reste à vérifier.',
    '- La recette sur téléphone reste nécessaire avant la mise en production.',
    'Tip: NEW: Prevent sleep while running is now available',
  ].join('\n')
  const notes=extractObservedTerminalNotes(raw)
  assert.equal(notes.length,3)
  assert.equal(notes[0]?.source,'bullet')
  assert.equal(notes[0]?.text,'La page accueil a été modernisée avec deux sections plus lisibles.')
  assert.match(notes[2]?.text ?? '',/recette sur téléphone/)
  assert.equal(JSON.stringify(notes).includes('Tip'),false)
})

test('terminal notes can show literal project wrap-up sentences without inventing actions', () => {
  const raw=[
    'Les contrôles responsive aux quatre largeurs demandées ont été étudiés.',
    'Tout reste local sur feature/pre-recette-audrey : aucun commit, push ou déploiement.',
    'L’ouverture distante nécessitera les migrations après sauvegarde, la vérification des référentiels et SMTP,',
    'puis l’activation des demandes.',
    'Tip: NEW: Prevent sleep while running is now available.',
    'Worked for 14s',
  ].join('\n')
  const notes=extractObservedTerminalNotes(raw)
  assert.ok(notes.length>=2)
  const joined=notes.map(n=>n.text).join(' ')
  assert.match(joined,/aucun commit, push ou déploiement/i)
  assert.match(joined,/migrations après sauvegarde/i)
  assert.equal(joined.includes('Prevent sleep'),false)
  assert.equal(joined.includes('Worked for'),false)
  assert.equal(notes.every(note=>note.source==='excerpt'),true)
})

test('terminal notes keep no synthesized completion and exclude obvious secrets', () => {
  const raw=[
    '## Final',
    '- Mot de passe: password=TOP_SECRET_987654 ne doit pas être cité.',
    '- Le menu mobile fonctionne maintenant sur petits écrans.',
    '- Les tests restent à exécuter avant toute validation finale.',
  ].join('\n')
  const notes=extractObservedTerminalNotes(raw)
  assert.equal(notes.length,2)
  assert.ok(!JSON.stringify(notes).includes('TOP_SECRET'))
  assert.ok(!notes.some(note=>note.text.includes('Build réussi')))
  assert.deepEqual(extractObservedTerminalNotes('Working...'),[])
  assert.deepEqual(extractObservedTerminalNotes(''),[])
})


test('reentry stays invisible on first visit and when no new evidence arrived', () => {
  const entries = [{ ts: 200, kind: 'output' as const }]
  assert.equal(computeReentrySummary(0, entries), null)
  assert.equal(computeReentrySummary(200, entries), null)
  assert.equal(computeReentrySummary(250, entries), null)
})

test('reentry counts only outputs received after the last visit, never previous user messages', () => {
  const entries = [
    { ts: 100, kind: 'output' as const },
    { ts: 210, kind: 'user' as const },
    { ts: 250, kind: 'output' as const },
    { ts: 300, kind: 'status' as const },
    { ts: 350, kind: 'output' as const },
  ]
  const summary=computeReentrySummary(200,entries)
  assert.equal(summary?.outputCount,2)
  assert.equal(summary?.verifiedCount,0)
  assert.equal(summary?.attentionCount,0)
  assert.equal(summary?.latestAt,350)
})

test('reentry distinguishes fresh verified technical evidence from old or unverified activity', () => {
  const activity = {
    updatedAt: 400,
    items: [
      {kind:'build',status:'confirmed',updatedAt:150},
      {kind:'test',status:'confirmed',updatedAt:350},
      {kind:'test',status:'failed',updatedAt:390},
      {kind:'attention',status:'attention',updatedAt:400},
      {kind:'output',status:'observed',updatedAt:400},
    ],
  }
  const summary=computeReentrySummary(300,[],activity)
  assert.equal(summary?.outputCount,0)
  assert.equal(summary?.verifiedCount,1)
  assert.equal(summary?.attentionCount,2)
  assert.equal(summary?.latestAt,400)
  assert.equal(computeReentrySummary(400,[],activity),null)
})

test('reentry never invents success from a CLI claim or a merely observed output', () => {
  const summary=computeReentrySummary(500,[],{
    updatedAt:600,
    items:[{kind:'command',status:'observed',updatedAt:600}],
  })
  assert.equal(summary?.verifiedCount,0)
  assert.equal(summary?.attentionCount,0)
})


test('quick actions are scoped to the actual CLI, never leak shell commands into Codex', () => {
  assert.equal(inferCliContext('Codex CLI'),'codex')
  assert.equal(inferCliContext('Claude Code'),'claude')
  assert.equal(inferCliContext('bash'),'shell')
  assert.equal(inferCliContext('ViBridge suivi 1'),'unknown')
  assert.equal(availableActions('codex').some(a=>a.command==='ls -la'),false)
  assert.equal(availableActions('shell').some(a=>a.command==='ls -la'),true)
  assert.equal(availableActions('unknown').length,0)
})

test('observed slash commands do not treat URLs, arbitrary text or slash filesystem paths as commands',()=>{
  const input=[
    'https://example.com/status',
    '/help  Afficher les commandes',
    '  /status    Statut du projet',
    '/tmp/a.txt',
    'some/thing',
    '/compact : Compression',
    '/help  Dupliqué',
  ].join('\n')
  assert.deepEqual(discoverSlashCommands(input),['/help','/status','/compact'])
  assert.equal(availableActions('codex',['/help','/new-feature']).filter(a=>a.command==='/help').length,1)
  assert.ok(availableActions('codex',['/new-feature']).some(a=>a.command==='/new-feature'))
})

test('file actions reject traversal and quote paths without injecting shell syntax',()=>{
  assert.equal(safeWorkspaceRelativePath('src/pages'),true)
  assert.equal(safeWorkspaceRelativePath('../secrets'),false)
  assert.equal(safeWorkspaceRelativePath('/etc'),false)
  assert.equal(safeWorkspaceRelativePath('src/../secrets'),false)
  assert.equal(safeWorkspaceRelativePath('src\\other'),false)
  assert.equal(quotePosix("/home/me/project's files"),"'\/home\/me\/project'\\''s files'")
})


test('local AI reading is available from a monitored tmux screen without chat output',()=>{
 const screen={key:'screen:thread-one',ts:200,text:'The deployment is pending review and manual verification of database migrations.'}
 assert.deepEqual(selectReadingSource(null,screen),{...screen,kind:'screen'})
})

test('local AI reading selects the latest real evidence across a screen and terminal output',()=>{
 const output={key:'output-1',ts:400,text:'Tests were executed; database migration must still be checked before the preview.'}
 const olderScreen={key:'screen:thread-one',ts:300,text:'The old tmux screen does not reflect the latest completion state anymore.'}
 assert.equal(selectReadingSource(output,olderScreen)?.kind,'output')
 assert.equal(selectReadingSource(output,{...olderScreen,ts:500})?.kind,'screen')
})

test('local AI reading does not offer a misleading analysis for an empty or short output',()=>{
 assert.equal(selectReadingSource({key:'empty',ts:10,text:'\u001b[31m>\u001b[0m'},null),null)
 assert.equal(selectReadingSource(null,{key:'screen',ts:200,text:'Waiting...'}),null)
})
test('terminal delivery differentiates relay, tmux input and observed screen without false completion',()=>{
 assert.equal(nextDeliveryStage('sent','agent_received'),'agent_received')
 assert.equal(nextDeliveryStage('agent_received','keys_sent'),'keys_sent')
 assert.equal(nextDeliveryStage('keys_sent','agent_received'),'keys_sent')
 assert.equal(nextDeliveryStage('keys_sent','screen_observed'),'screen_observed')
 assert.equal(nextDeliveryStage('screen_observed','agent_received'),'screen_observed')
 assert.equal(nextDeliveryStage('sent','rejected'),'rejected')
 assert.match(deliveryStatusText('keys_sent'),/non confirmée/)
 assert.match(deliveryStatusText('unconfirmed'),/doublons/)
 assert.match(deliveryStatusText('rejected','terminal_input_unconfirmed'),/champ Codex/)
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


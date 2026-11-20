const test=require('node:test')
const assert=require('node:assert/strict')
const {workspaceOwnsSession,isValidCliSessionId}=require('../dist/cliSessionIndex')
const {filterPrivateTerminalText,interpretModelOutput}=require('../dist/localInterpreter')
const {LOCAL_READOUT_GRAMMAR,observedExcerpts}=require('../dist/localReadoutContract')

test('CLI sessions are scoped to the currently selected workspace',()=>{
  assert.equal(workspaceOwnsSession('/home/test/work','/home/test/work'),true)
  assert.equal(workspaceOwnsSession('/home/test/work','/home/test/work/src'),true)
  assert.equal(workspaceOwnsSession('/home/test/work','/home/test/work-other'),false)
  assert.equal(workspaceOwnsSession('/home/test/work','/etc'),false)
  assert.equal(workspaceOwnsSession('/home/test/work','/home/test/work/../other'),false)
  assert.equal(isValidCliSessionId('550e8400-e29b-41d4-a716-446655440000'),true)
  assert.equal(isValidCliSessionId('550e8400; rm -rf /'),false)
})

test('local readout redacts common secrets and rejects invented evidence',()=>{
  const source=filterPrivateTerminalText([
    'Tests were run and require manual verification.',
    'token=FAKE_SECRET_TOKEN_123456789123',
    'password=SUPER_DUPER_SECRET_VALUE',
    'The site was NOT deployed. Verify DNS later.',
  ].join('\n'))
  assert.equal(source.includes('FAKE_SECRET_TOKEN_123456789123'),false)
  assert.equal(source.includes('SUPER_DUPER_SECRET_VALUE'),false)
  const result=interpretModelOutput(JSON.stringify({
    title:'Déploiement ACHILE',items:[
      {text:'Codex annonce aucun déploiement',evidence:'The site was NOT deployed.',category:'announced'},
      {text:'Tous les tests sont verts',evidence:'All unit tests passed',category:'announced'},
      {text:'Vérifier plus tard',evidence:'Verify DNS later.',category:'remaining'},
    ],
  }),source)
  assert.equal(result.items.length,2)
  assert.equal(result.items[0].category,'announced')
  assert.equal(result.items[1].category,'remaining')
  assert.equal(result.engine,'local-model')
})

test('local model parser never trusts a fragment that is not literal evidence',()=>{
  assert.throws(()=>interpretModelOutput('not JSON','example text'),/invalid_model_output/)
  const output=interpretModelOutput('{"title":"x","items":[{"text":"OK","evidence":"invented proof","category":"announced"}]}','Actual source text is unrelated.')
  assert.equal(output.items.length,0)
})

test('local model rejects echoed schema instead of displaying prompt as analysis',()=>{
 const source='git diff --check OK ; CSS braces OK ; all generated files still require verification.'
 const echoed='Tu reformates une sortie de terminal. Schema: {"title":"thème en français, 6 mots maximum","items":[{"text":"fait annoncé ou étape restante, 12 mots max","evidence":"extrait LITTÉRAL de SOURCE d’au moins 12 caractères","category":"announced"}]}'
 assert.throws(()=>interpretModelOutput(echoed,source),/invalid_model_output/)
 assert.throws(()=>interpretModelOutput('{"title":"thème en français, 6 mots maximum","items":[]}',source),/invalid_model_output/)
 assert.throws(()=>interpretModelOutput('console output then {"title":"Résultat vérifié","items":[]}',source),/invalid_model_output/)
})
test('local model retains strict grounded extracts with real title',()=>{
 const source='git diff --check OK ; CSS braces OK ; all generated files still require verification.'
 const result=interpretModelOutput(JSON.stringify({
  title:'Contrôles CSS annoncés',items:[
   {text:'Le terminal signale un contrôle diff correct.',evidence:'git diff --check OK',category:'announced'},
   {text:'Tests fictifs',evidence:'All tests passed',category:'announced'}
  ]
 }),source)
 assert.equal(result.title,'Contrôles CSS annoncés')
 assert.equal(result.items.length,1)
 assert.equal(result.items[0].evidence,'git diff --check OK')
})

test('llama.cpp grammar enforces the expected JSON object keys and limits items',()=>{
 assert.match(LOCAL_READOUT_GRAMMAR,/^root ::= /)
 assert.match(LOCAL_READOUT_GRAMMAR,/\\\"title\\\"/)
 assert.match(LOCAL_READOUT_GRAMMAR,/\\\"evidence\\\"/)
 assert.match(LOCAL_READOUT_GRAMMAR,/\\\"uncertain\\\"/)
 assert.ok(!LOCAL_READOUT_GRAMMAR.includes('thème en français'))
})
test('fallback returns exact, honest terminal excerpts when model cannot produce JSON',()=>{
 const source=[
  '> ok sur desktop il faut sortir le widget totalement',
  '• Je vérifie que le breakpoint mobile continue bien à fonctionner.',
  '• Widget en position: fixed; sur desktop uniquement.',
  'Worked for 23s • Jul 26 at 11:51',
 ].join('\n')
 const items=observedExcerpts(source)
 assert.equal(items.length,2)
 assert.equal(items[0].category,'uncertain')
 for(const item of items){
  assert.ok(source.includes(item.evidence))
  assert.equal(item.text,item.evidence)
 }
 assert.ok(!items.some(item=>item.text.includes('Worked for')))
})
test('fallback refuses to reflect redacted credentials as apparently useful evidence',()=>{
 const source=[
  '• password=ABCD1234567890',
  '• [SECRET_REDACTED] ',
  '• Une action reste à vérifier manuellement.',
 ].join('\n')
 const items=observedExcerpts(source)
 assert.equal(items.length,1)
 assert.match(items[0].text,/Une action reste/)
 assert.ok(!items[0].text.includes('SECRET'))
})

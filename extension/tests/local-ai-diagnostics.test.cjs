const test=require('node:test')
const assert=require('node:assert/strict')
const { findLocalExecutable, diagnoseLocalAi }=require('../dist/localAiDiagnostics')

test('preflight distinguishes reachable commands from missing model tools',async()=>{
 assert.equal(await findLocalExecutable(process.execPath),true)
 assert.equal(await findLocalExecutable('not-a-real-llama-binary-0092','/bin:/usr/bin'),false)
})
test('preflight is safe to run without a model or inference binary',async()=>{
 const lines=await diagnoseLocalAi({
  enabled:false,
  binary:'/not-installed/llama-cli',
  modelPath:'/not-installed/private-path.gguf',
  memoryMb:1024,reserveMb:512,threads:2,
 })
 const diagnostic=lines.join('\n')
 assert.match(diagnostic,/Modèle activé.*non/)
 assert.match(diagnostic,/llama-cli accessible.*non/)
 assert.match(diagnostic,/Modèle GGUF lisible.*non/)
 assert.ok(!diagnostic.includes('/not-installed/private-path.gguf'))
 assert.ok(!diagnostic.includes('/not-installed/llama-cli'))
})

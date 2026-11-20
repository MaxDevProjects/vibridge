const test=require('node:test')
const assert=require('node:assert/strict')
const {boundedResources,parseLinuxMemoryAvailable,parseLinuxRssMb,modelFitsBudget}
  =require('../dist/aiResourceGovernor')

test('resource budgets are conservative and capped',()=>{
  assert.deepEqual(boundedResources({memoryMb:99999,threads:40,reserveMb:1,timeoutMs:999999}),{
    memoryMb:2048,threads:3,reserveMb:256,timeoutMs:60000
  })
  assert.equal(boundedResources({memoryMb:1024,threads:2}).memoryMb,1024)
  assert.equal(boundedResources({memoryMb:1024,threads:2}).threads,2)
})

test('Linux available memory and RSS are parsed in MiB',()=>{
  assert.equal(parseLinuxMemoryAvailable('MemTotal: 8192000 kB\nMemAvailable: 2097152 kB\n'),2048)
  assert.equal(parseLinuxRssMb('Name: llama-cli\nVmRSS: 530432 kB\n'),518)
  assert.equal(parseLinuxMemoryAvailable('MemFree: 2000 kB\n'),null)
  assert.equal(parseLinuxRssMb('VmSize: 2000 kB\n'),null)
})

test('oversized models are not accepted under a small memory budget',()=>{
  assert.equal(modelFitsBudget(600*1024*1024,1024),true)
  assert.equal(modelFitsBudget(980*1024*1024,1024),false)
  assert.equal(modelFitsBudget(400*1024*1024,384),false)
})

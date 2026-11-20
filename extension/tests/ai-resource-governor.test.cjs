const test=require('node:test')
const assert=require('node:assert/strict')
const {boundedResources,parseLinuxMemoryAvailable,parseLinuxRssMb,modelFitsBudget,categorizeLocalAiProcessFailure,parseLinuxCpuTimes,cpuUtilization}
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

test('local inference failures are classified without disclosing terminal stderr',()=>{
 assert.equal(categorizeLocalAiProcessFailure(127,''),'ai_binary_unavailable')
 assert.equal(categorizeLocalAiProcessFailure(1,'error: unknown option --no-display-prompt'),'ai_cli_option_unsupported')
 assert.equal(categorizeLocalAiProcessFailure(1,'failed to load model from file'),'ai_model_load_failed')
 assert.equal(categorizeLocalAiProcessFailure(1,'cannot allocate memory'),'ai_model_memory_error')
 assert.equal(categorizeLocalAiProcessFailure(1,'private source context must never appear here'),'local_inference_failed')
})

test('CPU admission reads real processor utilization, not Linux load average',()=>{
  // Simulate high load average (>6 on 4 cores), with only 25% actual CPU.
  // This used to be refused by comparing load average directly with cores.
  const start=parseLinuxCpuTimes('cpu 1000 0 500 3000 200 100 0 0 0 0\n')
  const end=parseLinuxCpuTimes('cpu 1150 0 600 3600 250 100 0 0 0 0\n')
  assert.ok(start&&end)
  const utilization=cpuUtilization(start,end)
  assert.ok(utilization!==null && utilization<0.92)
  assert.ok(utilization!==null && utilization>0.20)
})

test('CPU admission guards sustained fully busy processors and ignores iowait',()=>{
  const idle={total:1000,idle:800}
  assert.equal(cpuUtilization(idle,{total:2000,idle:800}),1)
  assert.equal(cpuUtilization(idle,{total:2000,idle:1800}),0)
  assert.equal(cpuUtilization(idle,{total:800,idle:800}),null)
  const parsed=parseLinuxCpuTimes('cpu 10 20 30 40 50 60 70 80 90 100\n')
  assert.deepEqual(parsed,{total:360,idle:90})
  assert.equal(parseLinuxCpuTimes('not cpu stats'),null)
})

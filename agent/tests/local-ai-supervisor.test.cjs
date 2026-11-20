const test = require('node:test')
const assert = require('node:assert/strict')
const {LocalAiSupervisor,localAiSettings} = require('../dist/localAiSupervisor')

const job=(requestId,windowId='window-01',terminalId='term-01')=>({
  requestId,windowId,terminalId,excerpt:'Observed terminal output of sufficient size for safe local interpretation.'
})

test('supervisor serializes across windows, queues bounded work, matches request IDs',()=>{
  const dispatched=[],events=[]
  const supervisor=new LocalAiSupervisor(
    message=>{dispatched.push(message);return true},
    event=>events.push(event),
    {maxQueued:1,maxRuntimeMs:60000},
  )
  assert.equal(supervisor.enqueue(job('request-01','window-01')),true)
  assert.equal(supervisor.enqueue(job('request-02','window-02')),true)
  assert.equal(supervisor.enqueue(job('request-03','window-03')),false)
  assert.equal(dispatched.length,1)
  assert.equal(events.find(e=>e.request_id==='request-02'&&e.state==='queued')?.position,1)
  assert.equal(dispatched[0].resourceLimits.memoryMb,1024)
  assert.equal(dispatched[0].resourceLimits.threads,2)
  assert.equal(supervisor.complete('window-02',{request_id:'request-01',terminalId:'term-01',ok:true}),false)
  assert.equal(dispatched.length,1)
  assert.equal(supervisor.complete('window-01',{request_id:'request-01',terminalId:'term-01',ok:true,readout:{title:'ok',items:[]}}),true)
  assert.equal(dispatched.length,2)
  assert.equal(dispatched[1].request_id,'request-02')
  assert.equal(supervisor.complete('window-02',{request_id:'request-02',terminalId:'term-01',ok:false,error:'host_memory_busy'}),true)
  assert.equal(events.filter(e=>e.type==='terminal_interpret_result').length,2)
  supervisor.shutdown()
})

test('disconnect cancels orphan queue without executing a different workspace job',()=>{
  const sent=[],events=[]
  const supervisor=new LocalAiSupervisor(
    message=>{sent.push(message);return true},
    event=>events.push(event),
  )
  assert.equal(supervisor.enqueue(job('request-11','window-01')),true)
  assert.equal(supervisor.enqueue(job('request-12','window-02')),true)
  supervisor.disconnectWindow('window-02')
  assert.equal(events.find(e=>e.request_id==='request-12'&&e.error==='host_window_disconnected')?.ok,false)
  assert.equal(supervisor.complete('window-01',{request_id:'request-11',terminalId:'term-01',ok:false}),true)
  assert.equal(sent.length,1)
  supervisor.shutdown()
})

test('a dispatcher refusal does not leave the coordinator locked',()=>{
  const events=[]
  const supervisor=new LocalAiSupervisor(()=>false,event=>events.push(event))
  assert.equal(supervisor.enqueue(job('request-21')),true)
  assert.equal(supervisor.enqueue(job('request-22')),true)
  assert.equal(events.filter(e=>e.error==='ai_host_unavailable').length,2)
  supervisor.shutdown()
})

test('agent-level budgets are bounded and do not trust arbitrary environment values',()=>{
  const settings=localAiSettings({
    VIBRIDGE_AI_MEMORY_MB:'99999',VIBRIDGE_AI_THREADS:'15',
    VIBRIDGE_AI_MAX_QUEUE:'9999',VIBRIDGE_AI_RESERVE_MB:'-1',
  })
  assert.equal(settings.memoryLimitMb,2048)
  assert.equal(settings.cpuThreads,3)
  assert.equal(settings.maxQueued,5)
  assert.equal(settings.reserveFreeMb,256)
})

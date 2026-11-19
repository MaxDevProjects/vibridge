const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityEngine } = require('../dist/activity/engine');

function fixture() {
  let time = 1000;
  const updates = [];
  const engine = new ActivityEngine(update => updates.push(update), () => time);
  return { engine, updates, tick: (ms) => { time += ms; } };
}

test('build is green only after exit code 0 and keeps no raw command arguments', () => {
  const {engine,updates} = fixture();
  const input = {windowId:'window-a',terminalId:'terminal-a',executionId:'exec-1',
    commandLine:'npm run build --secret=TOP_SECRET_TOKEN'};
  engine.started(input);
  assert.equal(updates.at(-1).items[0].label,'Build en cours');
  assert.equal(updates.at(-1).items[0].status,'running');
  engine.finished({...input,exitCode:0});
  const item = updates.at(-1).items[0];
  assert.equal(item.status,'confirmed');
  assert.equal(item.evidence,'shell_exit_0');
  assert.equal(item.exitCode,0);
  assert.equal(item.label,'Build réussi');
  assert.equal(JSON.stringify(engine.snapshot()).includes('TOP_SECRET_TOKEN'),false);
});

test('shell completion without an exit code never becomes green', () => {
  const {engine} = fixture();
  const input = {windowId:'a',terminalId:'b',executionId:'x',commandLine:'npm test'};
  engine.started(input);
  engine.finished(input);
  const item=engine.snapshot()[0].items[0];
  assert.equal(item.status,'observed');
  assert.equal(item.evidence,'shell_finished_unverified');
  assert.equal(item.exitCode,undefined);
});

test('nonzero exit code is a command failure, not a project-level conclusion', () => {
  const {engine} = fixture();
  engine.started({windowId:'a',terminalId:'b',executionId:'x',commandLine:'npx vitest run'});
  engine.finished({windowId:'a',terminalId:'b',executionId:'x',exitCode:1});
  const item=engine.snapshot()[0].items[0];
  assert.equal(item.status,'failed');
  assert.equal(item.exitCode,1);
  assert.equal(item.kind,'test');
});

test('an unrelated finish event must never confirm another command', () => {
  const {engine} = fixture();
  engine.started({windowId:'window-1',terminalId:'term-1',executionId:'run-a',commandLine:'npm run build'});
  engine.started({windowId:'window-1',terminalId:'term-1',executionId:'run-b',commandLine:'npm test'});
  engine.finished({windowId:'window-1',terminalId:'term-1',executionId:'run-absent',exitCode:0});
  engine.finished({windowId:'window-1',terminalId:'term-1',exitCode:0});
  assert.deepEqual(engine.snapshot()[0].items.map(i=>i.status), ['running','running']);
  engine.finished({windowId:'window-1',terminalId:'term-1',executionId:'run-b',exitCode:0});
  assert.deepEqual(engine.snapshot()[0].items.map(i=>i.status), ['running','confirmed']);
});

test('same terminal IDs in different windows have separate activity', () => {
  const {engine} = fixture();
  engine.started({windowId:'window-1',terminalId:'term',executionId:'run-a',commandLine:'npm test'});
  engine.started({windowId:'window-2',terminalId:'term',executionId:'run-b',commandLine:'npm run build'});
  engine.finished({windowId:'window-1',terminalId:'term',executionId:'run-a',exitCode:0});
  const data=engine.snapshot();
  assert.equal(data.find(s=>s.windowId==='window-1').items[0].status,'confirmed');
  assert.equal(data.find(s=>s.windowId==='window-2').items[0].status,'running');
});

test('observations and attention are not reported as successful commands', () => {
  const {engine,updates,tick} = fixture();
  engine.output({windowId:'window-a',terminalId:'term-a'},'screen');
  engine.output({windowId:'window-a',terminalId:'term-a'},'screen');
  assert.equal(updates.length,1);
  tick(30001);
  engine.output({windowId:'window-a',terminalId:'term-a'},'screen');
  assert.equal(updates.length,2);
  engine.possibleQuestion({windowId:'window-a',terminalId:'term-a'});
  assert.equal(engine.snapshot()[0].items[1].status,'attention');
  assert.equal(engine.snapshot()[0].items[0].status,'observed');
});

test('terminal closing never claims an unfinished CLI succeeded', () => {
  const {engine} = fixture();
  engine.started({windowId:'win',terminalId:'term',executionId:'e',commandLine:'npm run build'});
  engine.closed({windowId:'win',terminalId:'term'});
  assert.equal(engine.snapshot()[0].items[0].status,'observed');
  assert.equal(engine.snapshot()[0].items[0].evidence,'terminal_closed');
});

test('invalid identities are dropped and state remains bounded', () => {
  const {engine} = fixture();
  engine.started({windowId:'',terminalId:'valid',commandLine:'npm test'});
  assert.equal(engine.snapshot().length,0);
  for(let i=0;i<70;i++) engine.started({
    windowId:'w'+i,terminalId:'t'+i,executionId:'e'+i,commandLine:'echo secret=PLEASE_DO_NOT_LEAK'});
  assert.equal(engine.snapshot().length,60);
  assert.equal(JSON.stringify(engine.snapshot()).includes('PLEASE_DO_NOT_LEAK'),false);
});

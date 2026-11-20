const test=require('node:test')
const assert=require('node:assert/strict')
const {ownedTmuxInputCommands}=require('../dist/terminalScreenMirrorUtils')
const session='vibridge_'+'a'.repeat(32)
test('tmux owned input sends literal user text and a distinct Enter',()=>{
 assert.deepEqual(ownedTmuxInputCommands(session,'Ok go dans l ordre préconisé',true),[
  ['send-keys','-l','-t',session,'--','Ok go dans l ordre préconisé'],
  ['send-keys','-t',session,'Enter'],
 ])
 assert.equal(ownedTmuxInputCommands(session,'help',false).length,1)
})
test('tmux never accepts unowned session names or control sequences',()=>{
 assert.throws(()=>ownedTmuxInputCommands('system','hello',true),/invalid_mirror_session/)
 assert.throws(()=>ownedTmuxInputCommands(session,'first\nsecond',true),/unsupported_tmux_input/)
 assert.throws(()=>ownedTmuxInputCommands(session,'\u001b[31m',true),/unsupported_tmux_input/)
 assert.throws(()=>ownedTmuxInputCommands(session,'',true),/unsupported_tmux_input/)
})

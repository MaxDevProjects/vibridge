const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RelayStore } = require('../dist/store');

test('workspace activity snapshots survive mobile reconnects and preserve data on partial IDE updates', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vibridge-activity-'));
  let db;
  try {
    const file=path.join(dir,'relay.sqlite');
    db=new RelayStore(file);
    const session=db.createSession({ agentToken:'dummy-agent-token', workspaceId:'workspace-a',
      expiresAt:Date.now()+60_000 });
    const activities=[{
      windowId:'window-a', terminalId:'term-1',updatedAt:1100,
      items:[{id:'run-1',kind:'build',label:'Build réussi',status:'confirmed',
        evidence:'shell_exit_0',exitCode:0,updatedAt:1100}]
    }];
    db.upsertWorkspaceSnapshot(session.id,'workspace-a',{
      windows:[{id:'window-a',connected:true}],activities,timestamp:1100
    });
    assert.deepEqual(db.getWorkspaceSnapshot(session.id,'workspace-a').activities,activities);
    db.upsertWorkspaceSnapshot(session.id,'workspace-a',{
      focusedWindowId:'window-a',timestamp:1200
    });
    assert.deepEqual(db.listWorkspaceSnapshots(session.id)[0].activities,activities);
    db.close();
    db=null;
    const reopened=new RelayStore(file);
    db=reopened;
    assert.deepEqual(db.listWorkspaceSnapshots(session.id)[0].activities,activities);
  } finally {
    if(db)db.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

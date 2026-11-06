'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('planning drafts use RAM, full player plans persist one batch, and legacy journals compact losslessly',{timeout:45000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage();await page.goto(fixture.url);await page.locator('.game-tile').first().waitFor();
  const result=await page.evaluate(async()=>{
   const E=TabletopCore,store=new PlayroomNetworkSessionStore({name:'checkpoint-browser'}),session=new TabletopSession(E,'mage-brawl',{seed:17,actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:'P'+i}))});
   await store.create({sessionId:'checkpoints',room:{id:'checkpoint-room',game:{id:session.game,version:session.packVersion}},session});
   let writes=0,reads=0;const transaction=store.transaction;store.transaction=function(stores,mode,run){mode==='readwrite'?writes++:reads++;return transaction.call(this,stores,mode,run);};
   const authority=new SessionAuthority(session,{sessionId:'checkpoints',persistence:{commit:r=>store.commit(r),commitBatch:r=>store.commitBatch(r),recordReceipt:r=>store.recordReceipt(r)}}),connection=authority.connect(0),command=id=>PlayroomProtocol.command(connection.snapshot(),connection.snapshot().actions.find(a=>a.type==='plan'),'checkpoint-'+id);
   const draftCommand=command('draft'),draft=await connection.dispatch(draftCommand),afterDraft={writes,reads,revision:session.current.move,draft:!!draft.draft};await connection.dispatch(draftCommand);const duplicateWrites=writes;
   const finish=await connection.dispatch(command('finish')),afterFinish={writes,revision:session.current.move,ok:finish.ok};authority.dispose();const loaded=await store.load('checkpoints',E,TabletopSession);store.close();
   E.register({id:'compact-browser',name:'Compact',min:2,max:2,presets:[{id:'basic'}],create(s){s.data={counter:0,frames:Array.from({length:400},(_,i)=>({cell:i,art:'unchanged artwork'}))};},legal(){return [{type:'tick'}];},apply(s){s.data.counter++;for(let i=0;i<7;i++)E.event(s,'step '+i,s.turn,'action');s.turn=1-s.turn;}});
   const legacy=new PlayroomNetworkSessionStore({name:'compact-browser'}),game=new TabletopSession(E,'compact-browser',{players:[{name:'A'},{name:'B'}]});await legacy.create({sessionId:'legacy',room:{id:'legacy-room',game:{id:game.game,version:game.packVersion}},session:game});
   for(let i=1;i<=8;i++){const viewer=game.current.turn;game.act(viewer,{type:'tick'});await legacy.commit({sessionId:'legacy',previousRevision:i-1,nextState:game.current,viewer,commandId:'legacy-'+i,signature:'legacy-'+i,receipt:{ok:true,code:'OK',commandId:'legacy-'+i,revision:i}});}
   await legacy.transaction(['sessions'],'readwrite',tx=>{const q=tx.objectStore('sessions').get('legacy');q.onsuccess=()=>tx.objectStore('sessions').put({...q.result,eventStorage:'delta-v1'});});
   const before=await legacy.readPrivate('legacy'),old=await legacy.load('legacy',E,TabletopSession);await legacy.compact('legacy',old.session);const after=await legacy.readPrivate('legacy'),fresh=await legacy.load('legacy',E,TabletopSession);legacy.close();
   return {afterDraft,duplicateWrites,afterFinish,reloadedRevision:loaded.revision,receipts:loaded.receipts.length,beforeBytes:JSON.stringify(before.steps).length,afterBytes:JSON.stringify(after.steps).length,identical:JSON.stringify(old.session.export())===JSON.stringify(fresh.session.export()),newFormat:after.record.eventStorage,needsCompaction:fresh.compactNeeded};
  });
  assert.deepEqual(result.afterDraft,{writes:0,reads:0,revision:1,draft:true});assert.equal(result.duplicateWrites,0);assert.deepEqual(result.afterFinish,{writes:1,revision:2,ok:true});assert.equal(result.reloadedRevision,2);assert.equal(result.receipts,2);assert(result.afterBytes<result.beforeBytes/10);assert.equal(result.identical,true);assert.equal(result.newFormat,'delta-v2');assert.equal(result.needsCompaction,false);
 }finally{await browser.close();await fixture.close();}
});
test('Table public commands survive IndexedDB reload with player receipts and public duplicate ACKs',{timeout:30000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext(),page=await context.newPage();await page.goto(fixture.url);await page.waitForFunction(()=>!!globalThis.PlayroomAccountUI?.service);
  const before=await page.evaluate(async()=>{
   const commit=IDBTransaction.prototype.commit;let explicitCommits=0;IDBTransaction.prototype.commit=function(){explicitCommits++;return commit.call(this);};
   const store=new PlayroomNetworkSessionStore({name:'playroom-table-journal-test'});
   const session=new TabletopSession(TabletopCore,'tictactoe',{seed:'TABLE-PRIVATE-SEED',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]});
   await store.create({sessionId:'table-browser',room:{id:'table-room',name:'Table',game:{id:session.game,version:session.packVersion}},session});
   const authority=new SessionAuthority(session,{sessionId:'table-browser',authorityEpoch:'before-reload',persistence:{commit:entry=>store.commit(entry),recordReceipt:entry=>store.recordReceipt(entry)}});
   const table=authority.connectTable([0,1]),command=PlayroomProtocol.command(table.snapshot(),{type:'place',cell:4},'table-place');
   const receipt=await table.dispatch(command);sessionStorage.setItem('table-test-command',JSON.stringify(command));
   const out={ok:receipt.ok,revision:authority.revision,viewer:receipt.snapshot.viewer,role:receipt.snapshot.role,explicitCommits};authority.dispose();IDBTransaction.prototype.commit=commit;return out;
  });
  assert.deepEqual(before,{ok:true,revision:1,viewer:-1,role:'table',explicitCommits:1});await page.reload();
  const after=await page.evaluate(async()=>{
   const store=new PlayroomNetworkSessionStore({name:'playroom-table-journal-test'}),saved=await store.load('table-browser',TabletopCore,TabletopSession);
   const authority=new SessionAuthority(saved.session,{sessionId:saved.sessionId,authorityEpoch:'after-reload',restoredReceipts:saved.receipts,persistence:{commit:entry=>store.commit(entry),recordReceipt:entry=>store.recordReceipt(entry)}});
   try{
    const table=authority.connectTable([0,1]),receipt=await table.dispatch(JSON.parse(sessionStorage.getItem('table-test-command'))),frame=table.history(0);
    return {duplicate:receipt.duplicate,revision:authority.revision,steps:saved.session.states.length,
     receiptActor:saved.receipts[0].viewer,viewer:receipt.snapshot.viewer,role:receipt.snapshot.role,
     cell:receipt.snapshot.state.scene.cells[4].owner,historyActions:frame.state.scene.interactions.length,
     secret:JSON.stringify(receipt).includes('TABLE-PRIVATE-SEED')};
   }finally{authority.dispose();}
  });
  assert.deepEqual(after,{duplicate:true,revision:1,steps:2,receiptActor:0,viewer:-1,role:'table',cell:0,historyActions:0,secret:false});
 }finally{await browser.close();await fixture.close();}
});
const fixture=()=>{
  const E=globalThis.TabletopCore;
  E.register({id:'network-store-fixture',name:'Network store fixture',min:2,max:2,presets:[{id:'basic'}],
    create(s){s.data={counter:0,secret:'KEEP-PRIVATE'};},
    legal(){return [{type:'tick',label:'Tick'}];},
    apply(s,actor){s.data.counter++;E.event(s,'step '+actor,actor,'action');s.turn=1-actor;},
    project(out){delete out.data.secret;}});
};
test('LAN-01 persists initial session, full history and atomic receipts across host reload',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await page.goto(url);
      const result=await page.evaluate(async()=>{
        const E=TabletopCore;
        E.register({id:'network-store-fixture',name:'Network store fixture',min:2,max:2,presets:[{id:'basic'}],
          create(s){s.data={counter:0,secret:'KEEP-PRIVATE'};},legal(){return [{type:'tick',label:'Tick'}];},
          apply(s,actor){s.data.counter++;E.event(s,'step '+actor,actor,'action');s.turn=1-actor;},
          project(out){delete out.data.secret;}});
        const Store=PlayroomNetworkSessionStore,store=new Store({name:'playroom-lan01-browser-test'});
        const session=new TabletopSession(E,'network-store-fixture',{players:[{name:'A'},{name:'B'}]});
        const room={id:'r-test',name:'Browser test',game:{id:session.game,version:session.packVersion}};
        await store.create({sessionId:'session-test',room,session});
        const authority=new SessionAuthority(session,{sessionId:'session-test',persistence:{
          commit:entry=>store.commit(entry),recordReceipt:entry=>store.recordReceipt(entry),setControl:entry=>store.setControl(entry)
        }});
        const actor0=authority.connect(0),actor1=authority.connect(1),pub=authority.connect(-1);
        const command0=PlayroomProtocol.command(actor0.snapshot(),{type:'tick'},'cmd-0');
        const a=await actor0.dispatch(command0);
        const duplicate=await actor0.dispatch(command0);
        const command1=PlayroomProtocol.command(actor1.snapshot(),{type:'tick'},'cmd-1');
        const b=await actor1.dispatch(command1);
        const pause=PlayroomProtocol.command(actor1.snapshot(),{type:'session-pause',paused:true,expectedControlRevision:0},'pause-1');const paused=await actor1.dispatch(pause);if(!paused.ok)throw Error(paused.code);
        const publicText=JSON.stringify(pub.snapshot());
        authority.dispose();store.close();
        return {a:a.ok,b:b.ok,duplicate:duplicate.duplicate,revision:session.current.move,publicText};
      });
      assert.equal(result.a,true);assert.equal(result.b,true);
      assert.equal(result.duplicate,true);assert.equal(result.revision,2);
      assert.ok(!result.publicText.includes('KEEP-PRIVATE'));
      await page.reload();
      const restored=await page.evaluate(async()=>{
        const E=TabletopCore;
        E.register({id:'network-store-fixture',name:'Network store fixture',min:2,max:2,presets:[{id:'basic'}],
          create(s){s.data={counter:0,secret:'KEEP-PRIVATE'};},legal(){return [{type:'tick',label:'Tick'}];},
          apply(s,actor){s.data.counter++;E.event(s,'step '+actor,actor,'action');s.turn=1-actor;},
          project(out){delete out.data.secret;}});
        const store=new PlayroomNetworkSessionStore({name:'playroom-lan01-browser-test'}),
          loaded=await store.load('session-test',E,TabletopSession),listed=await store.list();
        const out={revision:loaded.revision,states:loaded.session.states.length,events:loaded.session.current.events.length,
          counter:loaded.session.current.data.counter,secret:loaded.session.current.data.secret,receipts:loaded.receipts.length,
          list:listed.length,version:loaded.session.packVersion,paused:loaded.paused,controlRevision:loaded.controlRevision};
        const next=loaded.session.prepare(0,{type:'tick'});
        let duplicateRejected=false;
        try{await store.commit({sessionId:'session-test',previousRevision:2,nextState:next,viewer:0,
          commandId:'cmd-0',signature:'changed-payload',receipt:{ok:true,revision:3,commandId:'cmd-0'}});}
        catch(_){duplicateRejected=true;}
        out.duplicateRejected=duplicateRejected;
        out.remainingRevision=(await store.load('session-test',E,TabletopSession)).revision;
        await store.create({sessionId:'neighbor',room:{id:'other-room',name:'Neighbor',game:{id:'network-store-fixture',version:'0.1.0'}},session:new TabletopSession(E,'network-store-fixture',{players:[{name:'X'},{name:'Y'}]})});
        await store.remove('session-test');out.remaining=(await store.list()).map(x=>x.sessionId);
        const db=await store.open();out.deletedRows=await new Promise((resolve,reject)=>{const tx=db.transaction(['steps','receipts'],'readonly'),a=tx.objectStore('steps').index('sessionId').count('session-test'),b=tx.objectStore('receipts').index('sessionId').count('session-test');tx.oncomplete=()=>resolve(a.result+b.result);tx.onabort=()=>reject(tx.error);});
        out.neighborRevision=(await store.load('neighbor',E,TabletopSession)).revision;
        store.close();return out;
      });
      assert.deepEqual(restored,{revision:2,states:3,events:3,counter:2,secret:'KEEP-PRIVATE',
        receipts:3,list:1,version:'0.1.0',paused:true,controlRevision:1,duplicateRejected:true,remainingRevision:2,remaining:['neighbor'],deletedRows:0,neighborRevision:0});
    }finally{await context.close();await browser.close();await close();}
  });

test('LAN-01 restores guest room identity and persisted rotated token after host reload',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await page.goto(url);
      const joined=await page.evaluate(async()=>{
        const E=TabletopCore;
        E.register({id:'network-store-fixture',name:'Network store fixture',min:2,max:2,presets:[{id:'basic'}],
          create(s){s.data={counter:0,secret:'KEEP-PRIVATE'};},legal(){return [{type:'tick',label:'Tick'}];},
          apply(s,actor){s.data.counter++;E.event(s,'step '+actor,actor,'action');s.turn=1-actor;},
          project(out){delete out.data.secret;}});
        let time=1000;const rooms=new PlayroomMultiplayer.RoomService({clock:()=>time}),host=rooms.create({
          name:'Stored room',game:{id:'network-store-fixture',version:'0.1.0',name:'Fixture'},
          host:{id:'host-1',nickname:'A'},constraints:{min:2,max:2}}),link=rooms.connection(host.id);
        const join=link.dispatch({type:'join',nickname:'B'}),participantId=join.snapshot.participantId;
        link.dispatch({type:'claim-seat',seatId:'seat-2'});rooms.setReady(host.id,'host-1',true);
        rooms.setReady(host.id,participantId,true);rooms.beginCountdown(host.id,'host-1');time=5000;rooms.tick(host.id);
        const session=new TabletopSession(E,'network-store-fixture',{players:[{name:'A'},{name:'B'}]});
        const store=new PlayroomNetworkSessionStore({name:'playroom-lan01-room-restore-test'});
        await store.create({sessionId:'identity-1',room:rooms.snapshot(host.id),session,
          recovery:rooms.exportRecovery(host.id),packDigest:'sha256:'+'a'.repeat(64)});
        rooms.setResumeDurability(host.id,entry=>store.rotateResumeToken({sessionId:'identity-1',...entry}));
        link.close();
        const returned=await rooms.connection(host.id).dispatch({type:'resume',participantId,resumeToken:join.resumeToken});
        const listed=JSON.stringify(await store.list());
        store.close();
        return {roomId:host.id,participantId,original:join.resumeToken,rotated:returned.resumeToken,
          leaked:listed.includes(join.resumeToken)||listed.includes(returned.resumeToken)};
      });
      assert.equal(joined.leaked,false);assert.notEqual(joined.original,joined.rotated);
      await page.reload();
      const restored=await page.evaluate(async ({participantId,token,roomId})=>{
        const E=TabletopCore;
        E.register({id:'network-store-fixture',name:'Network store fixture',min:2,max:2,presets:[{id:'basic'}],
          create(s){s.data={counter:0,secret:'KEEP-PRIVATE'};},legal(){return [{type:'tick',label:'Tick'}];},
          apply(s,actor){s.data.counter++;E.event(s,'step '+actor,actor,'action');s.turn=1-actor;},
          project(out){delete out.data.secret;}});
        const store=new PlayroomNetworkSessionStore({name:'playroom-lan01-room-restore-test'}),
          restored=await store.load('identity-1',E,TabletopSession),rooms=new PlayroomMultiplayer.RoomService();
        rooms.restoreRecovery(restored.recovery,{hostId:'host-1'});
        rooms.setResumeDurability(roomId,entry=>store.rotateResumeToken({sessionId:'identity-1',...entry}));
        const lobby=rooms.snapshot(roomId),connection=rooms.connection(roomId);
        const resumed=await connection.dispatch({type:'resume',participantId,resumeToken:token});
        const after=await store.load('identity-1',E,TabletopSession);
        store.close();
        return {revision:restored.revision,phase:lobby.phase,connectedBefore:lobby.participants.find(p=>p.id===participantId).connected,
          seat:lobby.seats[1].participantId,restored:resumed.resumed,connectedAfter:resumed.snapshot.room.participants.find(p=>p.id===participantId).connected,
          newToken:resumed.resumeToken,newDiskToken:after.recovery.tokens[0].token,
          leak:JSON.stringify(lobby).includes(token)||JSON.stringify(resumed.snapshot).includes(token)};
      },{participantId:joined.participantId,token:joined.rotated,roomId:joined.roomId});
      assert.deepEqual({...restored,newToken:'REDACTED',newDiskToken:'REDACTED'},
        {revision:0,phase:'playing',connectedBefore:false,seat:joined.participantId,
          restored:true,connectedAfter:true,newToken:'REDACTED',newDiskToken:'REDACTED',leak:false});
      assert.equal(restored.newToken,restored.newDiskToken);
    }finally{await context.close();await browser.close();await close();}
  });

test('LAN-01 Web Lock rejects a second host tab and releases ownership after reload',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),first=await context.newPage(),second=await context.newPage();
    try{
      await Promise.all([first.goto(url),second.goto(url)]);
      const firstResult=await first.evaluate(async()=>{
        globalThis.__lan01LockRelease=await new PlayroomNetworkSessionStore().acquireHostLock('same-session');
        return !!globalThis.__lan01LockRelease;
      });
      assert.equal(firstResult,true);
      const blocked=await second.evaluate(async()=>{
        try{await new PlayroomNetworkSessionStore().acquireHostLock('same-session');return false;}
        catch(error){return /другой вкладке/.test(error.message);}
      });
      assert.equal(blocked,true);
      // Browser-managed lock is released when its owner navigates away.
      await first.reload();
      const acquired=await second.evaluate(async()=>{
        const release=await new PlayroomNetworkSessionStore().acquireHostLock('same-session');
        release();return true;
      });
      assert.equal(acquired,true);
    }finally{await context.close();await browser.close();await close();}
  });

test('replacement roster commits atomically without changing the existing game journal',{timeout:30000},async()=>{
  const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext(),page=await context.newPage();
  try{
    await page.goto(url);await page.evaluate(fixture);
    const result=await page.evaluate(async()=>{
      let now=1000;const rooms=new PlayroomMultiplayer.RoomService({clock:()=>now});
      const room=rooms.create({host:{id:'roster-host',nickname:'A'},name:'Roster',game:{id:'network-store-fixture',version:'0.1.0',name:'Fixture'},constraints:{min:2,max:4}});
      rooms.join(room.id,{id:'old-player',nickname:'B'});rooms.claimSeat(room.id,'old-player','seat-4');rooms.setReady(room.id,'roster-host',true);rooms.setReady(room.id,'old-player',true);rooms.beginCountdown(room.id,'roster-host');now=5000;rooms.tick(room.id);
      const store=new PlayroomNetworkSessionStore({name:'rc12-roster-test'}),session=new TabletopSession(TabletopCore,'network-store-fixture',{players:[{name:'A'},{name:'B'}]});
      await store.create({sessionId:'roster-match',room:rooms.snapshot(room.id),session,recovery:rooms.exportRecovery(room.id),packDigest:'sha256:'+'b'.repeat(64)});
      const authority=new SessionAuthority(session,{sessionId:'roster-match',persistence:{commit:row=>store.commit(row),recordReceipt:row=>store.recordReceipt(row)}}),client=authority.connect(0);
      const receipt=await client.dispatch(PlayroomProtocol.command(client.snapshot(),{type:'tick'},'roster-move'));if(!receipt.ok)throw Error(receipt.code);authority.dispose();
      const before=await store.load('roster-match',TabletopCore,TabletopSession),restored=new PlayroomMultiplayer.RoomService();
      restored.restoreRecovery(before.recovery,{hostId:'roster-host',collect:true,sessionId:'roster-match',revision:1});restored.kick(room.id,'roster-host','old-player');restored.join(room.id,{id:'new-player',nickname:'C'});restored.claimSeat(room.id,'new-player','seat-4');restored.acceptReplacement(room.id,'new-player');
      const payload={sessionId:'roster-match',room:restored.snapshot(room.id),recovery:restored.exportRecovery(room.id),revision:1};await store.saveRoster(payload);
      const saved=await store.load('roster-match',TabletopCore,TabletopSession),rejected=[];
      for(const mutate of [p=>p.revision=0,p=>p.room.ownerId='other',p=>p.recovery.room.ownerId='other',p=>p.recovery.room.game.version='wrong',p=>{p.room.recovery.revision=0;p.recovery.room.recovery.revision=0;}]){
        const malformed=structuredClone(payload);mutate(malformed);try{await store.saveRoster(malformed);rejected.push(false);}catch(_){rejected.push(true);}
      }
      // A roster captured before a concurrent resume must not restore the old
      // token after the rotation has durably completed.
      const oldToken=payload.recovery.tokens.find(t=>t.participantId==='new-player').token;
      const rotatedToken=(oldToken[0]==='a'?'b':'a')+oldToken.slice(1),expires=Date.now()+120000;
      await store.rotateResumeToken({sessionId:'roster-match',participantId:'new-player',previousToken:oldToken,nextToken:rotatedToken,previousExpiresAt:expires});
      await store.saveRoster(payload);
      store.close();const disk=new PlayroomNetworkSessionStore({name:'rc12-roster-test'}),after=await disk.load('roster-match',TabletopCore,TabletopSession);
      const nextRooms=new PlayroomMultiplayer.RoomService(),next=nextRooms.restoreRecovery(after.recovery,{hostId:'roster-host',collect:true,sessionId:'roster-match',revision:1});
      const out={rejected,sameGame:JSON.stringify(after.session.states)===JSON.stringify(before.session.states)&&JSON.stringify(after.session.options)===JSON.stringify(before.session.options)&&after.session.createdAt===before.session.createdAt,sameReceipts:JSON.stringify(after.receipts)===JSON.stringify(before.receipts),stableIndex:next.seats[3].playerIndex,participant:next.seats[3].participantId,oldToken:after.recovery.tokens.some(t=>t.participantId==='old-player'),newToken:after.recovery.tokens.some(t=>t.participantId==='new-player'),replacement:next.participants.find(p=>p.id==='new-player').replacement.accepted,revision:after.revision,rosterUnchanged:JSON.stringify(saved.room)===JSON.stringify(after.room)};
      const rotated=after.recovery.tokens.find(t=>t.participantId==='new-player');
      out.rotationPreserved=rotated.token===rotatedToken&&rotated.previousToken===oldToken&&rotated.previousExpiresAt===expires;
      nextRooms.kick(room.id,'roster-host','new-player');
      await disk.saveRoster({sessionId:'roster-match',room:nextRooms.snapshot(room.id),recovery:nextRooms.exportRecovery(room.id),revision:1});
      out.removalRevoked=!(await disk.load('roster-match',TabletopCore,TabletopSession)).recovery.tokens.some(t=>t.participantId==='new-player');
      await disk.remove('roster-match');disk.close();return out;
    });
    assert.deepEqual(result,{rejected:[true,true,true,true,true],sameGame:true,sameReceipts:true,stableIndex:1,participant:'new-player',oldToken:false,newToken:true,replacement:true,revision:1,rosterUnchanged:true,rotationPreserved:true,removalRevoked:true});
  }finally{await context.close();await browser.close();await close();}
});

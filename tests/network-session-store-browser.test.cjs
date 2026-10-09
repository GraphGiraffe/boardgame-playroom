'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
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
          commit:entry=>store.commit(entry),recordReceipt:entry=>store.recordReceipt(entry)
        }});
        const actor0=authority.connect(0),actor1=authority.connect(1),pub=authority.connect(-1);
        const command0=PlayroomProtocol.command(actor0.snapshot(),{type:'tick'},'cmd-0');
        const a=await actor0.dispatch(command0);
        const duplicate=await actor0.dispatch(command0);
        const command1=PlayroomProtocol.command(actor1.snapshot(),{type:'tick'},'cmd-1');
        const b=await actor1.dispatch(command1);
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
          list:listed.length,version:loaded.session.packVersion};
        const next=loaded.session.prepare(0,{type:'tick'});
        let duplicateRejected=false;
        try{await store.commit({sessionId:'session-test',previousRevision:2,nextState:next,viewer:0,
          commandId:'cmd-0',signature:'changed-payload',receipt:{ok:true,revision:3,commandId:'cmd-0'}});}
        catch(_){duplicateRejected=true;}
        out.duplicateRejected=duplicateRejected;
        out.remainingRevision=(await store.load('session-test',E,TabletopSession)).revision;
        store.close();return out;
      });
      assert.deepEqual(restored,{revision:2,states:3,events:3,counter:2,secret:'KEEP-PRIVATE',
        receipts:2,list:1,version:'0.1.0',duplicateRejected:true,remainingRevision:2});
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
          recovery:rooms.exportRecovery(host.id)});
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

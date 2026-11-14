'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('projected journals are pooled on disk and legacy frames migrate atomically without losing history',{timeout:60000},async()=>{
 const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto(url);
  const result=await page.evaluate(async()=>{
   const store=new PlayroomNetworkClientHistory({name:'pooled-client-history'}),journal=Array.from({length:80},(_,id)=>({id,text:'event '+id+'x'.repeat(1000)})),mk=revision=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',viewer:0,game:'uno',packVersion:'0.6.7',revision,state:{move:revision,game:'uno',packVersion:'0.6.7',players:[{name:'A'},{name:'B'}],firstPlayer:1,preset:'classic',turn:1,timeline:{turn:80},events:journal.slice(0,revision+1)},events:journal.slice(0,revision+1)}),key=PlayroomNetworkClientHistory.id('room','guest','s');
   // Preview.8 records, including holes, coexist with new snapshots.
   await store.tx(['matches','frames'],'readwrite',tx=>{tx.objectStore('matches').put({id:key,sessionId:'s',viewer:0,game:'uno',packVersion:'0.6.7',revision:79});for(let i=0;i<80;i+=2)tx.objectStore('frames').put({id:key,revision:i,frame:PlayroomNetworkClientHistory.frame(mk(i))});});
   for(let i=79;i>=0;i-=2)await store.save({roomId:'room',participantId:'guest',snapshot:mk(i)});
   const expected=journal.map((_,i)=>PlayroomNetworkClientHistory.frame(mk(i))),before=JSON.stringify(expected),saved=await store.read(key);
   const raw=await store.tx(['matches','frames','events'],'readonly',(tx,done)=>{const data={};tx.objectStore('events').index('id').getAll(key).onsuccess=e=>data.events=e.target.result;tx.objectStore('matches').get(key).onsuccess=e=>data.match=e.target.result;tx.objectStore('frames').index('id').getAll(key).onsuccess=e=>data.frames=e.target.result;done(data);});
   const twins={...mk(0),sessionId:'twins',state:{...mk(0).state,players:[{name:'Alex'},{name:'Alex'}]}};
   const twinsKey=await store.save({roomId:'room',participantId:'guest',snapshot:twins,participants:[{nickname:'Alex'},{nickname:'Alex'}]});
   const twinSummary=(await store.list()).find(v=>v.id===twinsKey);if(JSON.stringify(twinSummary.participants.map(p=>p.playerIndex))!=='[0,1]')throw Error('duplicate nicknames must not collapse seats');await store.remove(twinsKey);
   const list=await store.list();if(list[0].firstPlayer!==1||list[0].turn!==1||list[0].presetId!=='classic')throw Error('latest summary must survive older backfill');
   await store.tx(['matches'],'readwrite',tx=>{const r=tx.objectStore('matches').get(key);r.onsuccess=()=>{const old={...r.result};delete old.firstPlayer;delete old.presetId;tx.objectStore('matches').put(old);};});
   const repaired=await store.list();if(repaired[0].firstPlayer!==1||repaired[0].presetId!=='classic')throw Error('legacy list must recover first-player from one local frame');store.close();const reopened=new PlayroomNetworkClientHistory({name:'pooled-client-history'}),again=await reopened.read(key);await reopened.remove(key);const empty=await reopened.list();reopened.close();
   return {exact:JSON.stringify(saved.frames)===before,reloaded:JSON.stringify(again.frames)===before,compact:JSON.stringify(raw).length<before.length/10,pool:raw.events.length,allCompact:raw.frames.every(row=>row.frame.encoding==='event-pool-v1'),noPoolInList:!('eventPool' in list[0]),removed:empty.length===0,received:saved.receivedRevision};
  });assert.deepEqual(result,{exact:true,reloaded:true,compact:true,pool:80,allCompact:true,noPoolInList:true,removed:true,received:79});
 }finally{await browser.close();await close();}
});
test('guest browser reload preserves only personal projected frames, without host secrets',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await page.goto(url);
      await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-browser-personal'});
        const mk=(revision,epoch='epoch-old')=>({kind:'snapshot',protocolVersion:3,sessionId:'session-1',authorityEpoch:epoch,
          revision,viewer:1,game:'uno',packVersion:'0.2.1',state:{move:revision,game:'uno',packVersion:'0.2.1',
            players:[{name:'Host'},{name:'Guest'}],data:{hands:[null,[{id:'OWN-CARD'}]],secret:'NONE'}},
          events:[],actions:[{type:'play'}],resumeToken:'HIDDEN-BEARER',recovery:{tokens:[{token:'HOST-TOKEN'}]}});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',transportMode:'online',cloudRoomId:'cloud-room-a',accountId:'account-a',snapshot:mk(0)});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',snapshot:mk(1)});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',snapshot:mk(1)});
        store.close();
      });
      await page.reload();
      const actual=await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-browser-personal'}),list=await store.list();
        const saved=await store.read(list[0].id);
        let rejected=false;try{
          await store.save({roomId:'room-a',participantId:'guest-a',snapshot:{...saved.frames[1],kind:'snapshot',viewer:0,protocolVersion:3}});
        }catch(_){rejected=true;}
        const all=JSON.stringify(saved);store.close();
        return {cloudRoomId:saved.cloudRoomId,accountId:saved.accountId,transportMode:list[0]?.transportMode,count:list.length,role:list[0]?.role,revision:list[0]?.revision,frames:list[0]?.savedFrames,
          room:list[0]?.name,viewer:saved.frames[1].viewer,rejected,
          own:all.includes('OWN-CARD'),leak:all.includes('HIDDEN-BEARER')||all.includes('HOST-TOKEN')||all.includes('"actions"')};
      });
      assert.deepEqual(actual,{cloudRoomId:'cloud-room-a',accountId:'account-a',transportMode:'online',count:1,role:'client',revision:1,frames:2,room:'Друзья',viewer:1,
        rejected:true,own:true,leak:false});
    }finally{await context.close();await browser.close();await close();}
  });

test('reusing a room for UNO then Checkers retains two isolated guest archives across browser reload',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await page.goto(url);
      await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-separate-match-archives'});
        const mk=(sessionId,game,rev)=>({kind:'snapshot',protocolVersion:3,sessionId,authorityEpoch:'epoch-'+sessionId,
          revision:rev,viewer:1,game,packVersion:'0.1.0',state:{move:rev,game,packVersion:'0.1.0',
            players:[{name:'Host'},{name:'Guest'}],data:{hand:'OWN-VIEW-ONLY'}}});
        // The obsolete format from earlier RC7-UX builds is preserved as an
        // independently readable record, not interpreted as a different game.
        const db=await store.open();
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(['matches','frames'],'readwrite');
          tx.objectStore('matches').put({id:'room|guest',roomId:'room',participantId:'guest',sessionId:'legacy',viewer:1,
            game:'uno',packVersion:'0.1.0',role:'client',revision:0,updatedAt:1});
          tx.objectStore('frames').put({id:'room|guest',revision:0,frame:{sessionId:'legacy',game:'uno',revision:0}});
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        });
        await store.save({roomId:'room',participantId:'guest',snapshot:mk('uno-1','uno',0)});
        await store.save({roomId:'room',participantId:'guest',snapshot:mk('uno-1','uno',1)});
        await store.save({roomId:'room',participantId:'guest',snapshot:mk('checkers-2','checkers',0)});
        store.close();
      });
      await page.reload();
      const state=await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-separate-match-archives'}),list=await store.list();
        const items=await Promise.all(list.map(x=>store.read(x.id)));store.close();
        return items.map(x=>({id:x.id,sessionId:x.sessionId,game:x.game,frames:x.frames.map(f=>f.revision),
          frameGames:x.frames.map(f=>f.game)}));
      });
      assert.equal(state.length,3);
      assert.deepEqual(state.find(x=>x.sessionId==='uno-1')?.frameGames,['uno','uno']);
      assert.deepEqual(state.find(x=>x.sessionId==='checkers-2')?.frameGames,['checkers']);
      assert.deepEqual(state.find(x=>x.sessionId==='legacy')?.frameGames,['uno']);
      assert.equal(new Set(state.map(x=>x.id)).size,3);
      const deleted=await page.evaluate(async()=>{const store=new PlayroomNetworkClientHistory({name:'lan-02-separate-match-archives'});await store.remove('room|guest');const list=await store.list();const db=await store.open(),frames=await new Promise((resolve,reject)=>{const tx=db.transaction('frames'),r=tx.objectStore('frames').index('id').count('room|guest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});store.close();return {sessions:list.map(x=>x.sessionId).sort(),frames};});
      assert.deepEqual(deleted,{sessions:['checkers-2','uno-1'],frames:0});
    }finally{await context.close();await browser.close();await close();}
  });

test('incremental history fills holes only, persists independent cursors and rejects stale connection frames',{timeout:60000},async()=>{
 const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto(url);
  const result=await page.evaluate(async()=>{
   const store=new PlayroomNetworkClientHistory({name:'incremental-016'});
   const mk=revision=>({kind:'history',protocolVersion:3,sessionId:'s',authorityEpoch:'e',viewer:0,game:'g',packVersion:'1',revision,state:{move:revision,game:'g',packVersion:'1',players:[]}});
   const options={roomId:'room',participantId:'p'},key=PlayroomNetworkClientHistory.id('room','p','s');
   await store.save({...options,snapshot:mk(0)});await store.save({...options,snapshot:mk(3)});
   const before=await store.progress(key,3),calls=[];
   await store.backfill({...options,snapshot:mk(3),transport:{history:async i=>{calls.push(i);return mk(i);}}});
   await store.mark(key,'presentedRevision',3);await store.mark(key,'reviewedRevision',2);await store.mark(key,'reviewedRevision',1);
   await store.mark(key,'presentedRevision',1);await store.save({...options,snapshot:mk(4)});
   let rejected=false;try{await store.backfill({...options,snapshot:mk(5),transport:{history:async i=>({...mk(i),viewer:1})}});}catch(_){rejected=true;}
   let active=true;await store.backfill({...options,snapshot:mk(5),isCurrent:()=>active,transport:{history:async i=>{active=false;return mk(i);}}});
   store.close();const reopened=new PlayroomNetworkClientHistory({name:'incremental-016'}),saved=await reopened.read(key);reopened.close();
   return {before,calls,rejected,received:saved.receivedRevision,presented:saved.presentedRevision,reviewed:saved.reviewedRevision,frames:saved.frames.map(f=>f.revision)};
  });
  assert.deepEqual(result,{before:{receivedRevision:0,missing:[1,2]},calls:[1,2],rejected:true,received:4,presented:3,reviewed:1,frames:[0,1,2,3,4]});
 }finally{await browser.close();await close();}
});

test('cloud replay replacement keeps its match ID and updates frames atomically',{timeout:30000},async()=>{
 const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto(url);const result=await page.evaluate(async()=>{
  const store=new PlayroomNetworkClientHistory({name:'replace-cloud-replay'}),frame=revision=>({revision,viewer:0,game:'uno',packVersion:'0.6.7',state:{move:revision,game:'uno',packVersion:'0.6.7',players:[{name:'A'},{name:'B'}],events:[]},events:[]}),source={game:'uno',packVersion:'0.6.7',viewer:0,createdAt:1,updatedAt:2,frames:[frame(0)]};
  const key=await store.importPortable(source,'Cloud'),next={...source,updatedAt:3,frames:[frame(0),frame(1)]};await store.replacePortable(key,next,'Cloud');const row=await store.read(key),count=(await store.list()).length;let rejected=false;try{await store.replacePortable(key,{...next,viewer:1,frames:next.frames.map(f=>({...f,viewer:1}))},'Wrong viewer');}catch{rejected=true;}
  const unchanged=(await store.read(key)).frames.length;store.close();return {key:row.id===key,count,frames:row.frames.length,last:row.frames.at(-1).revision,rejected,unchanged};
 });assert.deepEqual(result,{key:true,count:1,frames:2,last:1,rejected:true,unchanged:2});
 }finally{await browser.close();await close();}
});

test('live history reads received and persisted projections locally and fetches each hole once',{timeout:60000},async()=>{
 const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto(url);
 const result=await page.evaluate(async()=>{
  const store=new PlayroomNetworkClientHistory({name:'local-history-cache-021'}),key=PlayroomNetworkClientHistory.id('r','p','s');let calls=0,bytes=0;
  const mk=revision=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',role:'player',viewer:0,game:'uno',packVersion:'1',revision,historyLength:5,state:{move:revision,game:'uno',packVersion:'1',players:[],scene:{players:[]}},events:[{id:revision,revision,text:'event '+revision,transfer:{from:'hand',to:'discard'}}],cues:[{eventId:revision,sound:'play'}],effects:[{revision,from:'hand',to:'discard'}]});
  await store.save({roomId:'r',participantId:'p',snapshot:mk(0)});await store.save({roomId:'r',participantId:'p',snapshot:mk(1)});
  store.close();
  const transport={history:async i=>{calls++;const frame={...mk(i),kind:'history'};bytes+=JSON.stringify(frame).length;return frame;}};
  const options={readHistory:i=>store.readFrame(key,i),writeHistory:snapshot=>store.save({roomId:'r',participantId:'p',snapshot})};
  const client=new PlayroomSessionClient(transport,options);client.accept(mk(3));client.accept(mk(4));
  for(let pass=0;pass<3;pass++)for(const i of [0,1,3,4])await client.history(i);
  const before={calls,bytes},a=client.history(2),b=client.history(2);await Promise.all([a,b]);await client.history(2);
  const sync=new PlayroomHistorySyncService({store,key:()=>key,current:()=>true});
  await sync.backfill(mk(4),transport,{roomId:'r',participantId:'p'},i=>client.history(i));
  const holeCalls=calls,holeBytes=bytes;
  client.close();store.close();
  const reopened=new PlayroomSessionClient({history(){throw Error('offline');}},options);reopened.accept(mk(4));
  const old=await reopened.history(2),missing=await store.readFrame(key,99),saved=await store.read(key);reopened.close();store.close();
  return {before,holeCalls,holeBytes,role:old.role,events:old.events,retainedEffects:old.effects.length,actions:old.actions.length,missing,frames:saved.frames.length};
 });
 assert.deepEqual(result.before,{calls:0,bytes:0});assert.equal(result.holeCalls,1);assert(result.holeBytes>0);assert.equal(result.role,'player');assert.equal(result.retainedEffects,1);assert.equal(result.actions,0);assert.equal(result.missing,null);assert.equal(result.frames,5);assert.deepEqual(result.events,[{id:2,revision:2,text:'event 2',transfer:{from:'hand',to:'discard'}}]);
 }finally{await browser.close();await close();}
});

test('append-only event batches rollback atomically, recover writer conflicts and remove event records',{timeout:60000},async()=>{
 const {url,close}=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto(url);const result=await page.evaluate(async()=>{
  const name='append-only-batch-021',store=new PlayroomNetworkClientHistory({name}),other=new PlayroomNetworkClientHistory({name}),context={roomId:'room',participantId:'guest'},key=PlayroomNetworkClientHistory.id('room','guest','s');
  const mk=revision=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',viewer:0,role:'player',game:'fixture',packVersion:'1',revision,state:{move:revision,game:'fixture',packVersion:'1',players:[{name:'A'}]},events:Array.from({length:revision+1},(_,id)=>({id,revision:id,text:'e'+id}))});
  const db=await store.open(),proto=Object.getPrototypeOf(db.transaction('events').objectStore('events')),put=proto.put;let failed=false;
  proto.put=function(...args){if(this.name==='events'&&!failed){failed=true;throw Error('injected event write failure');}return put.apply(this,args);};
  let rejected=false;try{await store.saveBatch(context,[mk(0),mk(1)]);}catch(_){rejected=true;}finally{proto.put=put;}
  const rolledBack=await store.read(key)===null;const original=mk(0),job=store.saveBatch(context,[original,mk(1)]);original.events[0].text='mutated-after-save';await job;if((await store.readFrame(key,0)).events[0].text!=='e0')throw Error('pending write must own its input');await other._eventWriter(key);
  await store.save({...context,snapshot:mk(2)});await other.save({...context,snapshot:mk(3)});
  const saved=await store.read(key),progress=await store.progress(key,3),raw=await store.tx(['events','matches'],'readonly',(tx,done)=>{const data={};tx.objectStore('events').index('id').count(key).onsuccess=e=>data.events=e.target.result;tx.objectStore('matches').get(key).onsuccess=e=>data.match=e.target.result;done(data);});
  await store.remove(key);const remaining=await store.tx(['events'],'readonly',(tx,done)=>{tx.objectStore('events').index('id').count(key).onsuccess=e=>done(e.target.result);});store.close();other.close();
  return {rejected,rolledBack,frames:saved.frames.length,events:raw.events,poolInMetadata:'eventPool' in raw.match,received:progress.receivedRevision,missing:progress.missing,remaining};
 });assert.deepEqual(result,{rejected:true,rolledBack:true,frames:4,events:4,poolInMetadata:false,received:3,missing:[],remaining:0});
 }finally{await browser.close();await close();}
});

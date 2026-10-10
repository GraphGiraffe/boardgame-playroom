'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('guest browser reload preserves only personal projected frames, without host secrets',
  {timeout:60000},async()=>{
    const {url,close}=await serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await page.goto(url);
      await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-browser-personal'});
        const mk=(revision,epoch='epoch-old')=>({kind:'snapshot',protocolVersion:1,sessionId:'session-1',authorityEpoch:epoch,
          revision,viewer:1,game:'uno',packVersion:'0.2.1',state:{move:revision,game:'uno',packVersion:'0.2.1',
            players:[{name:'Host'},{name:'Guest'}],data:{hands:[null,[{id:'OWN-CARD'}]],secret:'NONE'}},
          events:[],actions:[{type:'play'}],resumeToken:'HIDDEN-BEARER',recovery:{tokens:[{token:'HOST-TOKEN'}]}});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',snapshot:mk(0)});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',snapshot:mk(1)});
        await store.save({roomId:'room-a',participantId:'guest-a',roomName:'Друзья',snapshot:mk(1)});
        store.close();
      });
      await page.reload();
      const actual=await page.evaluate(async()=>{
        const store=new PlayroomNetworkClientHistory({name:'lan-02-browser-personal'}),list=await store.list();
        const saved=await store.read(list[0].id);
        let rejected=false;try{
          await store.save({roomId:'room-a',participantId:'guest-a',snapshot:{...saved.frames[1],kind:'snapshot',viewer:0,protocolVersion:1}});
        }catch(_){rejected=true;}
        const all=JSON.stringify(saved);store.close();
        return {count:list.length,role:list[0]?.role,revision:list[0]?.revision,frames:list[0]?.savedFrames,
          room:list[0]?.name,viewer:saved.frames[1].viewer,rejected,
          own:all.includes('OWN-CARD'),leak:all.includes('HIDDEN-BEARER')||all.includes('HOST-TOKEN')||all.includes('"actions"')};
      });
      assert.deepEqual(actual,{count:1,role:'client',revision:1,frames:2,room:'Друзья',viewer:1,
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
        const mk=(sessionId,game,rev)=>({kind:'snapshot',protocolVersion:1,sessionId,authorityEpoch:'epoch-'+sessionId,
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

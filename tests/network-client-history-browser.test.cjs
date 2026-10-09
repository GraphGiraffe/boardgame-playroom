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

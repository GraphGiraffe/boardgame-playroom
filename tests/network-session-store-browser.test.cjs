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
        const next=loaded.session.prepare(0,{type:'tick'});let duplicateRejected=false;
        try{await store.commit({sessionId:'session-test',previousRevision:2,nextState:next,viewer:0,
          commandId:'cmd-0',signature:'changed-payload',receipt:{ok:true,revision:3,commandId:'cmd-0'}});}
        catch(_){duplicateRejected=true;}
        out.duplicateRejected=duplicateRejected;
        out.remainingRevision=(await store.load('session-test',E,TabletopSession)).revision;
        store.close();return out;
      });
      assert.deepEqual(restored,{revision:2,states:3,events:2,counter:2,secret:'KEEP-PRIVATE',
        receipts:2,list:1,version:'0.1.0',duplicateRejected:true,remainingRevision:2});
    }finally{await context.close();await browser.close();await close();}
  });

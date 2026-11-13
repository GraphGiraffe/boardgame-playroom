'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
test('Mage Brawl WebRTC: concurrent private plans, bot settings and public Table',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const pages=[],errors=[],providers=[];const sync=require('./account-sync-fixture.cjs');
  for(const name of ['Анна','Борис','Стол']){const ctx=await browser.newContext({viewport:{width:1000,height:780},playroomProfile:false}),p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));providers.push(await sync.installFetch(ctx,sync(async route=>route.fulfill({status:200,json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}}))));await p.goto(server.url);await p.locator('#profile-form [name=playerName]').fill(name);await p.locator('#profile-form').evaluate(f=>f.requestSubmit());await p.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('mage-brawl',false));pages.push(p);}
  const [host,phone,table]=pages;
  await host.locator('[data-start="mage-brawl"]').click();await host.locator('[data-game-mode=network]').click();await host.locator('[data-room-auto-start]').uncheck();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,preset:'teams',options:{...r.rules.options,actionsPerTurn:'1',extraLives:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'bot',nickname:'Тактик'});b.renderLobby();});
  async function join(page){
   await host.evaluate(()=>PlayroomNetworkLibrary.showManualInvite());await host.locator('#net-host-token').waitFor({state:'attached'});const offer=await host.locator('#net-host-token').inputValue();
   await page.evaluate(()=>PlayroomNetworkLibrary.showManualJoin());await page.locator('#modal-root>[data-surface-state=active] [data-nearby-method=text]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-token').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('#net-client-token')?.value?.length);await host.locator('#modal-root>[data-surface-state=active] [role=tab][data-nearby-direction=receive]').click();await host.locator('#modal-root>[data-surface-state=active] [data-nearby-method=text]').click();await host.locator('#net-host-answer textarea[name=answer]').fill(await page.locator('#net-client-token').inputValue());await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator('.lobby-shell').waitFor();await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());
  }
  await join(phone);await phone.locator('[data-net-seat]:not([disabled])').first().click();await join(table);const tableId=await table.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);await table.locator(`[data-room-person="${tableId}"]`).click();await table.locator('[data-net-action=table]').click();
  await phone.locator('[data-bot-settings]').click();await phone.locator('.choice021-advanced>summary').click();assert.equal(await phone.locator('#bot-settings-form [name=nickname]').isDisabled(),true);assert.equal(await phone.locator('[form=bot-settings-form]').count(),0);await phone.locator('.modal [data-command=close-modal]').click();
  await host.locator('[data-bot-settings]').click();await host.locator('.choice021-advanced>summary').click();await host.locator('#bot-settings-form [value=tactician]').check();await host.locator('#bot-settings-form [name=botLevel][value="2"]').check();await host.locator('.choice021-advanced>summary').click();await host.locator('[form=bot-settings-form]').click();
  await phone.locator('[data-bot-settings]').waitFor();await phone.locator('[data-bot-settings]').click();assert.equal(await phone.locator('#bot-settings-form [name=difficulty]').inputValue(),'2');await phone.locator('.modal [data-command=close-modal]').click();
  await host.locator('[data-command=lobby-ready]').click();await phone.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
  await phone.locator('.network-game .mage-grid').waitFor();await table.locator('.network-game[data-viewer="-1"] .mage-grid').waitFor();
  assert.equal(await table.locator('.mage-card').count(),0);assert.equal(await table.locator('.mage-controls [data-action]').count(),0);
  for(const page of [host,phone]){assert.equal(await page.locator('.self-player .mage-team-lives').count(),1);assert.equal(await page.locator('.self-player [data-shrink-capacity="4"]').count(),1);}assert.equal(await table.locator('.mage-team-lives').count(),0);
  await host.locator('.mage-controls [data-action]').click();await host.waitForFunction(()=>[...document.querySelectorAll('.mage-controls [data-action]')].some(b=>b.getAttribute('aria-label')==='Изменить план'));
  assert.equal(await phone.locator('.mage-controls [data-action]').getAttribute('aria-label'),'Готово');assert.equal(await table.locator('.mage-revealed').count(),0,'public Table has no concealed plans');
  // Observe all screens before submission: a short public reveal may finish
  // on one screen while a sequential locator wait is still reading another.
  await Promise.all(pages.map(page=>page.evaluate(()=>{window.seenMageReveal=false;window.mageRevealObserver=new MutationObserver(()=>{if(document.querySelector('.mage-revealed'))window.seenMageReveal=true;});mageRevealObserver.observe(document.querySelector('#app'),{subtree:true,childList:true});})));
  await host.locator('.mage-controls [data-action]').click();await host.locator('.mage-controls [data-action]').click();await phone.locator('.mage-controls [data-action]').click();
  await Promise.all(pages.map(page=>page.waitForFunction(()=>window.seenMageReveal)));
  const observed=await Promise.all(pages.map(page=>page.evaluate(()=>{mageRevealObserver.disconnect();return {seen:seenMageReveal,present:!!document.querySelector('.mage-revealed')};})));assert(observed.every(v=>v.seen));console.log(JSON.stringify({publicReveal:observed}));
  assert.equal(await table.locator('.mage-card').count(),0);assert.deepEqual(errors,[]);assert(providers.every(p=>p.nativeSupabaseRequests===0));
 }finally{await browser?.close();await server.close();}
});

test('Mage planning uses matching corner tokens and starts each public round without generic effects',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 const sync=require('./account-sync-fixture.cjs'),provider=await sync.installFetch(context,sync(async route=>route.fulfill({json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}})));
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'round-owner',name:'Иван'}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:true,uiSounds:true,animationSpeed:'fast',tutorialsEnabled:false}));});await page.goto(server.url);await page.locator('.game-tile').first().waitFor();
  await page.evaluate(async()=>{
   window.roundTrace={sounds:[],captures:[]};const bridge=PlayroomAppBridge;window.PlayroomAppBridge={...bridge,audio:{registerPack(){},prepare:async()=>true,play:ids=>{roundTrace.sounds.push(...ids);},batch:async ids=>{roundTrace.sounds.push(...ids);},busy:false,uiEnabled:true}};const capture=PlayroomGameFlow.GameFlow.prototype.capture;PlayroomGameFlow.GameFlow.prototype.capture=function(options){roundTrace.captures.push(options.action?.type);return capture.call(this,options);};
   const packs=PlayroomAppBridge.packs,m=PlayroomInstalledPacks.find(p=>p.manifest.id==='mage-brawl').manifest;packs.activate(m.id,m.version);const session=new TabletopSession(TabletopCore,m.id,{seed:17,actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:i?'P'+i:'Иван'}))}),authority=new SessionAuthority(session),ports=Array.from({length:8},(_,i)=>authority.connect(i)),client=new PlayroomSessionClient(PlayroomLocalTransport(ports[0]));await client.refresh();document.querySelector('#app').innerHTML='';const mount=PlayroomSharedViews.mount(client,packs.exportView(m.id,m.version));window.roundFixture={session,authority,ports,client,mount};
  });
  await page.evaluate(async()=>{const f=roundFixture;await f.client.send(f.client.snapshot.actions.find(c=>c.type==='plan'));});await page.locator('.mage-plan-locked').waitFor();
  for(const viewport of [{width:384,height:782},{width:797,height:282},{width:384,height:782}]){
   await page.setViewportSize(viewport);const tokens=await page.evaluate(()=>{const read=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,width:r.width,height:r.height,left:r.left-p.left,top:r.top-p.top,text:e.textContent.trim()};};return {card:read(document.querySelector('.mage-plan-order')),type:read(document.querySelector('.shared-action-marker'))};});
   assert.equal(tokens.type.background,tokens.card.background);assert.equal(tokens.type.color,tokens.card.color);assert.equal(tokens.type.width,tokens.card.width);assert.equal(tokens.type.height,tokens.card.height);assert(tokens.type.left>=0&&tokens.type.left<5);assert(tokens.type.top>=0&&tokens.type.top<5);assert.equal(tokens.type.text,'1');
  }
  await page.evaluate(async()=>{const f=roundFixture;await f.client.send(f.client.snapshot.actions.find(c=>c.type==='plan'));});
  const rounds=await page.evaluate(async()=>{
   const f=roundFixture,E=TabletopCore,result=[];
   for(let boundary=0;boundary<2;boundary++){
    while(true){const before=f.session.current,w=E.decisionWindow(before),actor=w?.participants.find(i=>!w.ready.includes(i))??before.turn,port=f.ports[actor],snapshot=port.snapshot(),action=snapshot.actions.find(c=>c.type!=='unready');if(!action)throw Error('No command');roundTrace.sounds=[];roundTrace.captures=[];const reply=await port.dispatch(PlayroomProtocol.command(snapshot,action,crypto.randomUUID()));if(!reply.ok)throw Error(reply.code);await new Promise(resolve=>requestAnimationFrame(resolve));let wait=0;while(Number(document.querySelector('.network-game')?.dataset.revision)!==f.session.current.move||document.querySelector('.app-game-layout')?.getAttribute('aria-busy')==='true'||PlayroomPublicSequence.playing(document.querySelector('#app'))){if(++wait>1500)throw Error('Presentation did not settle');await new Promise(resolve=>setTimeout(resolve,10));}if(f.session.current.data.round===before.data.round)continue;
     await new Promise(resolve=>setTimeout(resolve,0));await PlayroomPublicSequence.whenIdle(document.querySelector('#app'));await new Promise(resolve=>setTimeout(resolve,0));result.push({round:f.session.current.data.round,sounds:[...roundTrace.sounds],captures:[...roundTrace.captures]});break;
    }
   }return result;
  });
  for(const row of rounds){assert(!row.sounds.includes('move'),JSON.stringify(row));assert(row.sounds.includes('mage.reveal'),JSON.stringify(row));assert.deepEqual(row.captures,[],JSON.stringify(row));}
  assert.deepEqual(errors,[]);assert.equal(provider.nativeSupabaseRequests,0);console.log(JSON.stringify({rounds}));
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage eliminated player sees every queued bot round and immediate local rotations',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));
 try{
  await page.goto(server.url);await page.waitForFunction(()=>globalThis.PlayroomAppBridge&&globalThis.PlayroomInstalledPacks?.length);
  const observed=await page.evaluate(async()=>{
   const E=TabletopCore,packs=PlayroomAppBridge.packs,m=PlayroomInstalledPacks.find(p=>p.manifest.id==='mage-brawl').manifest;packs.activate(m.id,m.version);
   window.PlayroomAppBridge={...PlayroomAppBridge,gameOptions:()=>({animationSpeed:'fast',tutorialsEnabled:false}),audio:{registerPack(){},batch:async()=>{},play(){}}};
   let session=new TabletopSession(E,m.id,{seed:17,actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:'P'+i,bot:i>0}))});
   let authority=new SessionAuthority(session),client=new PlayroomSessionClient(PlayroomLocalTransport(authority.connect(0)));await client.refresh();document.querySelector('#app').innerHTML='';let mount=PlayroomSharedViews.mount(client,packs.exportView(m.id,m.version));mount.render();
   const rotate=document.querySelector('.mage-rotate:last-child'),paint=document.querySelector('.mage-card:not(.mage-plan-locked) .mage-spell-paint'),press=rotate.animate([{opacity:1},{opacity:.9}],{duration:60000});press.pause();rotate.click();
   const rotation={degrees:document.querySelector('.mage-card:not(.mage-plan-locked)').style.getPropertyValue('--mage-direction'),transition:getComputedStyle(paint).transitionDuration,press:press.playState};press.cancel();mount.destroy();
   while(session.current.status==='playing'&&session.current.data.players[0].lives){const s=session.current,w=E.decisionWindow(s),id=w?.participants.find(i=>!w.ready.includes(i))??s.turn,action=E.botAction(s,id);if(!action||s.move>4000)throw Error('simulation stopped');session.act(id,action);}
   authority.dispose();const initial=session.initialSave(),checkpoint=TabletopSession.storageState(E,session.current),actions=JSON.parse(session.serialize()).actions;
   session=TabletopSession.restoreCheckpoint(E,{initial,checkpoint:{state:checkpoint,fingerprint:PlayroomSessionCodec.fingerprint(checkpoint)},actions,updatedAt:session.updatedAt});authority=new SessionAuthority(session);client=new PlayroomSessionClient(PlayroomLocalTransport(authority.connect(0)));await client.refresh();mount=PlayroomSharedViews.mount(client,packs.exportView(m.id,m.version));mount.render();
   const restoredRevision=session.current.move,apply=E.applyAction;let replayCalls=0;E.applyAction=(...args)=>{replayCalls++;return apply(...args);};
   const plans=[],health=[],play=PlayroomPlanPlayer.prototype.play;
   PlayroomPlanPlayer.prototype.play=function(plan,ports){
    const fresh=this.run?.plan.id!==plan.id,group=ports.group;
    if(plan.id.includes('mage:'))ports={...ports,group(index,value,context){const result=group?.(index,value,context);const expected=client.snapshot.state.scene.plan;
     // Inspect only the plan whose snapshot is currently available here.
     if(plan.id.includes(expected.id))for(const [i,p]of expected.scenes[value.scene].state.players.entries()){const node=document.querySelector('.player-panel[data-player-index="'+i+'"] [data-score-id="health"]');health.push({expected:p.health,actual:Number(node.title.match(/\d+/)?.[0])});}return result;}};
    const out=play.call(this,plan,ports);if(fresh&&plan.id.includes('mage:')){const row={id:plan.id};plans.push(row);out.then(r=>row.status=r.status);}return out;
   };
   const rounds=[];
   for(let i=0;i<1000&&session.current.status==='playing';i++){const s=session.current,w=E.decisionWindow(s),id=w?.participants.find(i=>!w.ready.includes(i))??s.turn,action=E.botAction(s,id);if(!action)throw Error('no bot command');authority.actBot(id,action);if(session.current.data.round!==s.data.round){rounds.push(session.current.data.round);session.states;}await new Promise(r=>setTimeout(r,0));if(rounds.length===3)break;}
   const end=performance.now()+45000;while(performance.now()<end&&(Number(document.querySelector('.network-game')?.dataset.revision)!==session.current.move||document.querySelector('.app-game-layout')?.getAttribute('aria-busy')==='true'||PlayroomPublicSequence.playing(document.querySelector('#app'))))await new Promise(r=>setTimeout(r,30));
   E.applyAction=apply;const result={rotation,rounds,plans,health,replayCalls,restoredRevision,revision:session.current.move,shown:Number(document.querySelector('.network-game')?.dataset.revision),playing:PlayroomPublicSequence.playing(document.querySelector('#app')),lives:session.current.data.players[0].lives};mount.destroy();authority.dispose();PlayroomPlanPlayer.prototype.play=play;
   while(session.current.status==='playing'){const s=session.current,w=E.decisionWindow(s),id=w?.participants.find(i=>!w.ready.includes(i))??s.turn;if(s.move>4000)throw Error('terminal simulation stopped');session.act(id,E.botAction(s,id));}
   const saved=session.export(),boundary=saved.states.findLastIndex((s,i)=>i>0&&s.data.round!==saved.states[i-1].data.round);saved.states=saved.states.slice(0,boundary);
   const terminal=TabletopSession.restore(E,saved),lastAuthority=new SessionAuthority(terminal),lastClient=new PlayroomSessionClient(PlayroomLocalTransport(lastAuthority.connect(0)));await lastClient.refresh();const lastMount=PlayroomSharedViews.mount(lastClient,packs.exportView(m.id,m.version));lastMount.render();
   for(let i=0;i<50&&terminal.current.status==='playing';i++){const s=terminal.current,w=E.decisionWindow(s),id=w?.participants.find(i=>!w.ready.includes(i))??s.turn;lastAuthority.actBot(id,E.botAction(s,id));await new Promise(r=>setTimeout(r,0));}
   result.terminal={status:terminal.current.status,playing:PlayroomPublicSequence.playing(document.querySelector('#app')),earlyResult:!!document.querySelector('.result-modal')};
   const deadline=performance.now()+20000;while(!document.querySelector('.result-modal')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,30));result.terminal.results=!!document.querySelector('.result-modal');result.terminal.settled=!PlayroomPublicSequence.playing(document.querySelector('#app'));lastMount.destroy();lastAuthority.dispose();return result;
  });
  assert.equal(observed.lives,0);assert.equal(observed.rounds.length,3);assert.equal(observed.shown,observed.revision);assert.equal(observed.playing,false);
  assert(observed.replayCalls<=2*observed.revision-observed.restoredRevision,'restored history only extends new commands: '+observed.replayCalls);assert.equal(observed.plans.length,3);assert(observed.plans.every(p=>p.status==='complete'),JSON.stringify(observed.plans));assert(observed.health.length>0);assert(observed.health.every(p=>p.expected===p.actual),JSON.stringify(observed.health.filter(p=>p.expected!==p.actual)));
  assert.equal(observed.terminal.status,'finished');assert.equal(observed.terminal.playing,true);assert.equal(observed.terminal.earlyResult,false);assert.equal(observed.terminal.results,true);assert.equal(observed.terminal.settled,true);
  assert.equal(observed.rotation.press,'paused');assert.equal(observed.rotation.transition,'0s');assert.equal(observed.rotation.degrees,'90deg');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({rounds:observed.rounds,plans:observed.plans.map(p=>p.status),healthChecks:observed.health.length,replayCalls:observed.replayCalls,rotation:observed.rotation,terminal:observed.terminal}));
 }finally{await context.close();await browser.close();await server.close();}
});

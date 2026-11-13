'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const TestUI=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
const mageEvidence=name=>process.env.MAGE_EVIDENCE_DIR?path.resolve(process.env.MAGE_EVIDENCE_DIR,name):path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23',name);
if(process.env.MAGE_EVIDENCE_DIR)fs.mkdirSync(process.env.MAGE_EVIDENCE_DIR,{recursive:true});
async function openMageFixture(page,url){
 if(!process.env.MAGE_LOOT_ARTIFACT)return page.goto(url);
 const artifact=process.env.MAGE_LOOT_ARTIFACT.startsWith('file:')?require('node:url').fileURLToPath(process.env.MAGE_LOOT_ARTIFACT):path.resolve(process.env.MAGE_LOOT_ARTIFACT);
 const body=fs.readFileSync(artifact),hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 await page.route('**/*',route=>route.abort());
 await page.route(url,route=>route.fulfill({status:200,contentType:'text/html',body}));
 const response=await page.goto(url),servedSha256=hash(await response.body());assert.equal(servedSha256,hash(body),'actual compiled Mage document');
 console.log(JSON.stringify({mageArtifact:{sha256:servedSha256,engine:page.context().browser().browserType().name(),version:page.context().browser().version()}}));
 return response;
}

test('Mage Brawl browser: bot drafts, modal footer, responsive table, hotseat privacy and round playback',{timeout:90000},async t=>{
 const server=await serveBrowserFixture(root);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const scenario=process.env.PLAYROOM_SCENARIO&&new RegExp(process.env.PLAYROOM_SCENARIO);let matched=0;
  const check=async(name,run)=>{if(scenario&&!scenario.test(name))return;matched++;await t.test(name,run);};
  for(const [width,height,n] of [[360,640,8],[390,844,2],[390,844,8],[844,390,2],[844,390,8],[820,1180,8],[1180,820,8],[1440,900,8]])await check(`${width}x${height}, ${n} players`,async()=>{
   const ctx=await browser.newContext({viewport:{width,height},playroomProfile:false}),p=await ctx.newPage(),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));await ctx.addInitScript(()=>localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,autoPass:false})));const sync=require('./account-sync-fixture.cjs'),provider=await sync.installFetch(ctx,sync(async route=>route.fulfill({status:200,json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}})));
   try{
    await openMageFixture(p,server.url);await p.locator('#profile-form [name=playerName]').fill('Анна');await p.locator('#profile-form button[type=submit]').click();await p.locator('[data-start="mage-brawl"]').click();await p.locator('[data-game-mode=hotseat]').click();
    await p.locator('[data-bot-settings]').first().click();await TestUI.activeSurface(p).locator('#bot-settings-form .choice021-advanced>summary').click();await TestUI.activeSurface(p).locator('#bot-settings-form [name=strategy][value=fighter]').check();await TestUI.activeSurface(p).locator('#bot-settings-form [name=nickname]').fill('Боец');await p.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();
    assert.equal(await p.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.bot).botSettings),undefined,'cancel does not commit');
    await p.locator('[data-bot-settings]').first().click();await TestUI.activeSurface(p).locator('#bot-settings-form .choice021-advanced>summary').click();await TestUI.activeSurface(p).locator('#bot-settings-form [name=strategy][value=fighter]').check();await TestUI.activeSurface(p).locator('#bot-settings-form [name=botLevel][value="0"]').check();
    const levelValue=TestUI.activeSurface(p).locator('#bot-settings-form [name=difficulty]');
    for(const [level,label] of [[0,'Лёгкий'],[1,'Средний'],[2,'Сложный']]){const choice=TestUI.activeSurface(p).getByRole('radio',{name:label,exact:true});await choice.check();assert.equal(await levelValue.inputValue(),String(level));assert.equal(await choice.isChecked(),true);assert.equal(await TestUI.activeSurface(p).locator('.choice021-levels input:checked').count(),1);}
    await TestUI.activeSurface(p).getByRole('radio',{name:'Лёгкий',exact:true}).check();await TestUI.activeSurface(p).locator('#bot-settings-form .choice021-advanced>summary').click();
    const apply=await TestUI.activeSurface(p).locator('[form=bot-settings-form]').boundingBox();assert(apply.y>=0&&apply.y+apply.height<=height,'primary save stays reachable in the compact bot panel');
    await TestUI.activeSurface(p).locator('[form=bot-settings-form]').click();assert.deepEqual(await p.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.bot).botSettings),{strategy:'fighter',difficulty:'easy'});
    if(n>2)await p.evaluate(n=>{const b=PlayroomAppBridge,r=b.room();for(let i=2;i<n;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'bot',nickname:'Бот '+i});b.renderLobby();},n);
    await p.locator('[data-command=lobby-start]').click();await p.locator('.mage-grid').waitFor();assert.equal(await p.locator('.mage-grid').count(),1);assert.equal(await p.locator('.scene-hint[role=alert]').count(),0);await p.locator('.mage-hand [data-command=card-help]').click();assert.equal(await p.locator('#modal-root h2').count(),1);await p.locator('#modal-root [data-command=close-modal]').click();
    const before=await p.locator('.mage-card').first().innerHTML();await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();assert.notEqual(await p.locator('.mage-card').first().innerHTML(),before,'action changes every card face');await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();assert(await p.locator('.mage-card').evaluateAll(cards=>cards.every(c=>c.style.getPropertyValue('--mage-direction')==='90deg')));
    const geometry=await p.evaluate(()=>{const grid=document.querySelector('.mage-grid').getBoundingClientRect(),cell=document.querySelector('.mage-cell').getBoundingClientRect(),card=document.querySelector('.mage-card').getBoundingClientRect(),ready=document.querySelector('.mage-ready').getBoundingClientRect();return {grid:{x:grid.x,y:grid.y,right:grid.right,bottom:grid.bottom,width:grid.width,height:grid.height},cell:{width:cell.width,height:cell.height},card:{width:card.width,height:card.height},ready:{y:ready.y,bottom:ready.bottom}};});
    const out=path.resolve(root,'../tmp_files/mage-brawl/screenshots');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`${width}x${height}-${n}.png`)});
    assert(geometry.grid.width>80&&geometry.grid.height>80,'arena has usable nonzero space: '+JSON.stringify(geometry));assert(Math.abs(geometry.cell.width-geometry.cell.height)<2,'square cells');assert(Math.abs(geometry.card.width-geometry.card.height)<3,'square cards');assert(geometry.grid.x>=-1&&geometry.grid.right<=width+1&&geometry.grid.bottom<=height+1,'arena fits viewport');assert(geometry.ready.y>=0&&geometry.ready.bottom<=height,'ready reachable');
    const rotation=await p.locator('.mage-rotate').first().boundingBox();assert.equal(rotation.width,28);assert.equal(rotation.height,28);
    const hand=await p.locator('.mage-hand .hand-track').evaluate(t=>({width:t.clientWidth,scroll:t.scrollWidth,height:t.clientHeight,scrollHeight:t.scrollHeight}));assert(hand.scroll<=hand.width+1&&hand.scrollHeight<=hand.height+1,'hand fits without redundant scrolling: '+JSON.stringify(hand));assert.equal(await p.locator('[data-view-range=mageAction],.public-sequence-controls').count(),0);assert.deepEqual(errors,[]);
   }finally{assert.equal(provider.nativeSupabaseRequests,0);await ctx.close();}
  });
  await check('two humans, closed choices and automatic phases',async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false}),p=await ctx.newPage();p.setDefaultTimeout(8000);await ctx.addInitScript(()=>localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,autoPass:false})));const sync=require('./account-sync-fixture.cjs'),provider=await sync.installFetch(ctx,sync(async route=>route.fulfill({status:200,json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}})));
   try{await openMageFixture(p,server.url);await p.locator('#profile-form [name=playerName]').fill('Анна');await p.locator('#profile-form button[type=submit]').click();await p.locator('[data-start="mage-brawl"]').click();await p.locator('[data-game-mode=hotseat]').click();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Борис'});b.renderLobby();});await p.locator('[data-command=lobby-start]').click();await p.locator('[data-command=unlock]').click();
    await p.locator('.mage-controls [data-action]').click();await p.locator('[data-decision-player="1"]').click();await p.locator('[data-command=unlock]').waitFor();assert.equal(await p.locator('.mage-card').count(),0,'curtain DOM contains no private hand');await p.locator('[data-command=unlock]').click();
    await p.locator('[data-decision-player="0"]').click();await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.mage-controls [data-action]').getAttribute('aria-label'),'Изменить план');await p.locator('.mage-controls [data-action]').click();await p.locator('.mage-controls [data-action]').click();await p.locator('[data-decision-player="1"]').click();await p.locator('[data-command=unlock]').click();await p.locator('.mage-controls [data-action]').click();await p.locator('[data-public-sequence]').waitFor();
    if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.public-sequence-controls').count(),0);await p.waitForFunction(()=>!document.querySelector('.is-public-playback'),null,{timeout:30000});assert.equal(await p.locator('[data-public-frame]:visible').count(),1);
   }finally{assert.equal(provider.nativeSupabaseRequests,0);await ctx.close();}
  });
  assert(matched>0,'PLAYROOM_SCENARIO matched no scenarios: '+process.env.PLAYROOM_SCENARIO);
 }finally{await browser?.close();await server.close();}
});

test('Mage lost hand keeps its geometry without an empty action slot or phantom scrollbar',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true,serviceWorkers:'block'}),p=await context.newPage(),errors=[],reports=[];p.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));
 try{
  await openMageFixture(p,server.url);await p.waitForFunction(()=>globalThis.PlayroomAppBridge&&globalThis.PlayroomInstalledPacks?.length);
  for(const viewport of [{width:390,height:800},{width:797,height:282}]){
   await p.setViewportSize(viewport);
   await p.evaluate(()=>{window.handSession=new TabletopSession(TabletopCore,'mage-brawl',{seed:17,actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:'P'+i,bot:i>0}))});window.handOriginal=handSession.current;
    window.handDraw=state=>{const projected=TabletopCore.project(state,0),actions=TabletopCore.legalActions(state,0),regions=new Map(),host=document.querySelector('#app');PlayroomPublicSequence.setMode(host,'still');const kept=PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'empty-hand-regression',network:true,gameName:'Стихийная потасовка',state:projected,viewer:0,actions,scene:PlayroomViews.render(projected,0,actions,{renderOwner:handSession,regionSink:regions})}),{fragments:regions});if(!kept)PlayroomGameScreen.layoutScene(host);};
    window.handMeasure=()=>{const own=document.querySelector('.layout-self'),field=document.querySelector('.layout-field').getBoundingClientRect(),card=own.querySelector('.player-panel').getBoundingClientRect();return {height:own.getBoundingClientRect().height,client:own.clientHeight,scroll:own.scrollHeight,overflow:getComputedStyle(own).overflowY,handReserve:own.querySelector('.layout-hand')?.getBoundingClientRect().height||0,emptyActions:!!own.querySelector('.layout-actions'),buttons:[...own.querySelectorAll('button[data-action],button[data-view-key]')].filter(button=>!button.disabled&&!button.closest('[inert]')).length,privateCards:own.querySelectorAll('.mage-card').length,field:field.toJSON(),card:card.toJSON()};};handDraw(handOriginal);});
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const alive=await p.evaluate(()=>handMeasure());
   for(const kind of ['life-lost','eliminated','repeated']){
    await p.evaluate(kind=>{if(kind!=='repeated')while(handSession.current.status==='playing'&&(kind==='life-lost'?handSession.current.data.players[0].pos:handSession.current.data.players[0].lives)){const s=handSession.current,w=TabletopCore.decisionWindow(s),actor=w?.participants.find(i=>!w.ready.includes(i))??s.turn;if(s.move>4000)throw Error('simulation limit');handSession.act(actor,TabletopCore.botAction(s,actor));}handDraw(handSession.current);},kind);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const value=await p.evaluate(()=>handMeasure());reports.push({viewport,kind,alive,value});
    assert.equal(value.emptyActions,false,'no empty action wrapper after '+kind);assert(value.scroll<=value.client+1,'no empty scrolling: '+JSON.stringify({viewport,kind,value}));assert.equal(value.overflow,'auto','real controls still use the normal scroll policy');assert.equal(value.height,alive.height);assert.equal(value.handReserve,alive.handReserve);assert.equal(value.buttons,0);assert.equal(value.privateCards,0,'reserved hand contains no private physical cards');assert(Math.abs(value.field.width-alive.field.width)<1&&Math.abs(value.field.height-alive.field.height)<1,'field geometry stays fixed');
   }
   await p.evaluate(()=>handDraw(handOriginal));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const restored=await p.evaluate(()=>handMeasure());assert(restored.buttons>0,'real hand controls return');assert.equal(restored.height,alive.height);assert(restored.scroll<=restored.client+1);
  }
  assert.deepEqual(errors,[]);if(process.env.MAGE_EVIDENCE_DIR)fs.writeFileSync(mageEvidence('empty-hand.json'),JSON.stringify({reports,errors},null,2));
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage turn overviews show both steps and history skips all readiness revisions',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,isMobile:true,serviceWorkers:'block'}),p=await context.newPage(),errors=[],reports=[];p.on('pageerror',e=>errors.push(e.message));
 await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));
 const advance=async ms=>{await p.evaluate(()=>{for(const a of document.getAnimations())if(Number.isFinite(a.effect.getTiming().iterations)&&['running','paused'].includes(a.playState))a.finish();});await p.clock.runFor(ms);};
 try{
  await openMageFixture(p,server.url);await p.waitForFunction(()=>globalThis.PlayroomAppBridge&&globalThis.PlayroomInstalledPacks?.length);
  await p.evaluate(()=>{PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);window.PlayroomAppBridge={...PlayroomAppBridge,gameOptions:()=>({animationSpeed:'normal',tutorialsEnabled:false}),audio:{registerPack(){},batch:async()=>{},play(){}}};
   const s=new TabletopSession(TabletopCore,'mage-brawl',{seed:17,actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:'Игрок '+i}))});
   while(s.current.data.round===1){const w=TabletopCore.decisionWindow(s.current),actor=w.participants.find(i=>!w.ready.includes(i));s.act(actor,TabletopCore.botAction(s.current,actor));}window.overviewSaved=s.export();
  });
  await p.clock.install();
  for(const viewport of [{width:384,height:782},{width:797,height:282},{width:384,height:782}]){
   await p.setViewportSize(viewport);
   const expected=await p.evaluate(async()=>{const session=TabletopSession.restore(TabletopCore,overviewSaved),authority=new SessionAuthority(session),client=new PlayroomSessionClient(PlayroomLocalTransport(authority.connect(0)));await client.refresh();document.querySelector('#app').innerHTML='';const pack=PlayroomAppBridge.packs.exportView('mage-brawl',session.packVersion);const withEmpty={...pack,view:pack.view.replace('const plan=s.scene.plan;',"const plan={...s.scene.plan,scenes:s.scene.plan.scenes.map(scene=>scene.kind==='turn-reveal'?{...scene,phases:scene.phases.map(p=>({...p,cards:p.cards.filter(c=>![0,7].includes(c.actor))}))}:scene)};")};const mount=PlayroomSharedViews.mount(client,withEmpty);mount.render();await mount.openHistory(0);window.overviewFixture={session,authority,client,mount};return {revision:session.current.move,groups:client.snapshot.state.scene.plan.groups,overviews:client.snapshot.state.scene.plan.scenes.filter(s=>s.kind==='turn-reveal').map(s=>s.phases.flatMap(p=>p.cards.map(c=>c.actor)))};});
   await p.locator('[data-command=replay-play]').click();await advance(101);await p.locator('[data-round-step="1"]').waitFor();
   assert.equal(Number(await p.locator('#replay-range').inputValue()),expected.revision,'one replay step skips every human/bot draft and ready revision');
   for(const step of [1,2]){
    if(step===2){let attempts=0;while(!await p.locator('[data-round-step="2"]').count()){if(++attempts>30)throw Error('second overview missing');await advance(750);}}
    const value=await p.locator('[data-round-step="'+step+'"]').evaluate(n=>{const r=n.getBoundingClientRect(),cards=[...n.querySelectorAll('[data-round-player]')].map(c=>({actor:Number(c.dataset.roundPlayer),rect:c.getBoundingClientRect().toJSON()}));const probe=document.createElement('div');probe.className='mage-phase-reveal';probe.style.visibility='hidden';probe.innerHTML='<div class="mage-phase-player"><div class="mage-phase-card"></div></div>';n.parentElement.append(probe);const phaseSize=probe.querySelector('.mage-phase-card').getBoundingClientRect().width;probe.remove();const first=n.querySelector('[data-round-player]'),last=[...n.querySelectorAll('[data-round-player]')].at(-1);n.scrollTop=0;const firstVisible=!first||first.getBoundingClientRect().top>=r.top-1;n.scrollTop=n.scrollHeight;const lastVisible=!last||last.getBoundingClientRect().bottom<=r.bottom+1;n.scrollTop=0;return {boxes:[n,n.querySelector('.mage-round-players'),n.querySelector('.mage-round-player'),n.querySelector('.mage-phase-card')].map(x=>({rect:x.getBoundingClientRect().toJSON(),width:getComputedStyle(x).width,height:getComputedStyle(x).height,container:getComputedStyle(x).containerType})),heading:n.querySelector('strong').textContent,duration:n.closest('[data-public-sequence]').style.getPropertyValue('--sequence-duration'),chosen:[...n.querySelectorAll('[data-round-choice=true]')].map(c=>Number(c.dataset.roundPlayer)),slots:[...n.querySelectorAll('[data-round-player]')].map(x=>({actor:Number(x.dataset.roundPlayer),name:x.firstElementChild.getBoundingClientRect().toJSON(),card:x.querySelector('.mage-phase-card').getBoundingClientRect().toJSON(),empty:x.dataset.roundChoice==='false',text:x.querySelector('.mage-phase-card').textContent.trim()})),metadata:[...n.querySelectorAll('.mage-reveal-meta')].map(m=>[...m.children].map(c=>c.className)),actors:cards.map(c=>c.actor),overflow:n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1,contained:cards.every(c=>c.rect.left>=r.left-1&&c.rect.right<=r.right+1&&c.rect.top>=r.top-1&&c.rect.bottom<=r.bottom+1),phaseSize,cardSizes:[...n.querySelectorAll('.mage-phase-card')].map(c=>c.getBoundingClientRect().width),reachable:firstVisible&&lastVisible};});
    assert.equal(value.heading,'Раунд 1 · Ход '+(step===1?'I':'II'));assert.equal(value.duration,'1500ms');assert.deepEqual(value.actors,[0,1,2,3,4,5,6,7]);assert.deepEqual(value.chosen,[...expected.overviews[step-1]].filter(i=>![0,7].includes(i)).sort((a,b)=>a-b));assert(value.metadata.every(m=>JSON.stringify(m)===JSON.stringify(['mage-reveal-type','mage-card-facing','mage-reveal-element'])));assert.equal(value.overflow,false,JSON.stringify({viewport,value}));assert.equal(value.contained,true);assert(value.cardSizes.every(size=>size>=32&&size<=112),'overview cards fit field: '+JSON.stringify({viewport,value}));assert.equal(value.reachable,true,JSON.stringify({viewport,step,value}));for(const slot of value.slots){const peer=value.slots.find(p=>!p.empty&&Math.abs(p.card.y-slot.card.y)<1);assert(peer,'empty and chosen slots share card row');assert(Math.abs(peer.name.y-slot.name.y)<1,'names share baseline');assert(Math.abs(peer.card.width-slot.card.width)<1);if(slot.empty)assert.equal(slot.text,'—');}reports.push({viewport,step,...value});
    if(step===1)await advance(1500);
   }
   await p.evaluate(()=>{overviewFixture.mount.destroy();overviewFixture.authority.dispose();});
  }
  assert.deepEqual(errors,[]);if(process.env.MAGE_EVIDENCE_DIR)fs.writeFileSync(mageEvidence('turn-overviews.json'),JSON.stringify({reports,errors},null,2));console.log(JSON.stringify({overviewScreens:reports.length,historySkippedReadiness:true,errors}));
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage local history opens the round overview without planning waits',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));
 try{
  await context.addInitScript(()=>localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'normal',tutorialsEnabled:false})));
  await openMageFixture(p,server.url);await p.waitForFunction(()=>globalThis.PlayroomAppBridge&&globalThis.PlayroomInstalledPacks?.length);
  const revision=await p.evaluate(async()=>{const s=new TabletopSession(TabletopCore,'mage-brawl',{seed:17,mode:'solo',actionsPerTurn:'2',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:8},(_,i)=>({name:'P'+i,bot:i>0}))});while(s.current.data.round===1){const w=TabletopCore.decisionWindow(s.current),actor=w.participants.find(i=>!w.ready.includes(i));s.act(actor,TabletopCore.botAction(s.current,actor));}await PlayroomAppBridge.saveLibrary.activateAsync(s,'overview-local');return s.current.move;});
  await p.reload();await p.locator('[data-hub-page=sessions]').click();await p.locator('.saved-game[data-saved-actions-toggle]').first().click();await p.locator('[data-history-id]:visible').first().click();await p.locator('#replay-range').waitFor();
  await p.clock.install();await p.locator('[data-command=replay-play]').click();await p.clock.runFor(251);await p.locator('[data-round-step="1"]').waitFor();assert.equal(Number(await p.locator('#replay-range').inputValue()),revision);assert.equal(await p.locator('[data-round-step="1"]>strong').innerText(),'Раунд 1 · Ход I');assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage Brawl playback: first render, player health, sounds, final callback and reduced motion',{timeout:30000},async()=>{
 // Playwright's JS clock does not advance the browser compositor clock.
 const advance=async(page,ms)=>{await page.evaluate(()=>{for(const a of document.getAnimations())if(Number.isFinite(a.effect.getTiming().iterations)&&['running','paused'].includes(a.playState))a.finish();});await page.clock.runFor(ms);await new Promise(resolve=>setTimeout(resolve,10));};
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false}),p=await ctx.newPage();
  await ctx.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-playback-owner',name:'Анна',createdAt:1,updatedAt:1})));
  await openMageFixture(p,server.url);await p.locator('[data-start="mage-brawl"]').first().waitFor({state:'attached'});await p.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('mage-brawl',false));p.setDefaultTimeout(7000);if(await p.locator('#profile-form').count()){await p.locator('#profile-form [name=playerName][name=playerName]').fill('Анна');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());}await p.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('mage-brawl',false));
  await p.evaluate(async()=>{const session=new TabletopSession(TabletopCore,'mage-brawl',{seed:17,mode:'solo',actionsPerTurn:'1',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:4},(_,i)=>({name:i?'Бот '+i:'Анна',bot:i>0}))});await PlayroomAppBridge.saveLibrary.activateAsync(session,'mage-playback-local');});
  await p.reload();await p.locator('.game-tile').first().waitFor();
  await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
  await p.evaluate(()=>{
   window.PlayroomAppBridge={...PlayroomAppBridge,audio:{batch:()=>Promise.resolve(),play:()=>Promise.resolve()}};
   const prepare=TabletopSession.prototype.prepare,act=SessionAuthority.prototype.actBot;window.botTempo=[];
   TabletopSession.prototype.prepare=function(actor,action){if(this.game==='mage-brawl')window.tempoSession=this;return prepare.call(this,actor,action);};
   SessionAuthority.prototype.actBot=function(actor,action){botTempo.push({at:Date.now(),round:window.tempoSession?.current.data.round,playing:!!document.querySelector('.is-public-playback'),sequence:document.querySelector('[data-public-sequence]')?.dataset.publicSequence});return act.call(this,actor,action);};
  });
  await p.locator('[data-hub-page=sessions]').click();await p.locator('.saved-game[data-saved-actions-toggle]').first().click();await p.locator('[data-resume-id]:visible').first().click();await p.locator('.mage-controls').waitFor();
  await p.evaluate(()=>{window.readyNode=document.querySelector('.mage-ready');window.readyMutations=[];window.readyObserver=new MutationObserver(rs=>readyMutations.push(...rs.filter(r=>r.target===readyNode&&['disabled','class','aria-pressed'].includes(r.attributeName)).map(r=>r.attributeName)));readyObserver.observe(document.querySelector('.mage-controls'),{attributes:true,subtree:true,childList:true});});
  await p.clock.runFor(900);
  assert.equal(await p.evaluate(()=>botTempo.length),3);assert.equal(await p.evaluate(()=>new Set(botTempo.map(t=>t.at)).size),1,'all bots ready in one timer callback');assert.equal(await p.evaluate(()=>readyNode===document.querySelector('.mage-ready')&&!readyNode.disabled),true,'other bots never remove or disable Ready');assert.deepEqual(await p.evaluate(()=>readyMutations),[],'bot readiness does not flash own Ready');
  await p.evaluate(()=>window.liveTempoSession=tempoSession);if(await p.locator('#toast.show [data-command=dismiss-notice]').isVisible())await p.locator('#toast.show [data-command=dismiss-notice]').click();await p.locator('[data-game-menu]').click();await p.locator('[data-game-menu-action][data-command=history]').click();
  await p.locator('#replay-range').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await p.locator('.game-frame-title h1').innerText(),'История партии');assert.equal(await p.locator('#replay-range').inputValue(),'3','history skips intermediate bot confirmations');
  assert.equal(await p.locator('.opponent-hand.is-ready').count(),3,'all bots are ready together in history');
  if(await p.locator('#toast.show [data-command=dismiss-notice]').isVisible())await p.locator('#toast.show [data-command=dismiss-notice]').click();await p.locator('.game-frame-header [data-command=history-close]').click();
  // Commit as the human capability; bots must wait until this round has been shown.
  await p.locator('.mage-ready').click();await p.waitForFunction(()=>!!document.querySelector('.is-public-playback'));
  await p.evaluate(()=>{window.botCountAtPlayback=botTempo.length;});
  await p.clock.runFor(1000);assert.equal(await p.evaluate(()=>botTempo.length===botCountAtPlayback),true,'bots do not overwrite a round while it is being shown');
  for(let i=0;i<20;i++)await advance(p,1000);const trace=await p.evaluate(()=>botTempo);assert(trace.length>3,'bots resume after the presentation: '+JSON.stringify(await p.evaluate(()=>({round:tempoSession.current.data.round,status:tempoSession.current.status,phase:tempoSession.current.data.phase,turn:tempoSession.current.turn,paused:!!document.querySelector('.pause-cover'),actions:tempoSession.current.players.map((_,i)=>TabletopCore.legalActions(tempoSession.current,i).length),frame:document.querySelector('[data-public-frame]:not([hidden])')?.dataset.publicFrame,count:document.querySelectorAll('[data-public-frame]').length,animations:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,end:a.effect.getComputedTiming().endTime}))}))));assert(trace.every(t=>!t.playing),'bot-only play respects the same presentation boundary');assert(trace.slice(3).every(t=>t.at>trace[0].at),'later rounds wait for playback');await ctx.close();
  for(const [mode,reduced] of [['normal',false],['fast',false],['instant',false],['normal',true]]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false}),p=await ctx.newPage();p.setDefaultTimeout(5000);await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await ctx.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-playback-fixture',name:'Анна',createdAt:1,updatedAt:1})));await openMageFixture(p,server.url);await p.evaluate(()=>PlayroomPacksReady);await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
  const initial=await p.evaluate(mode=>{
   const E=TabletopCore;let s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'}]}),d=s.data;
   d.board=Array(16).fill('ground');d.board[0]=d.board[15]='base';d.shrink=null;
   Object.assign(d.players[0],{pos:[1,1],hand:['earth','air','water']});Object.assign(d.players[1],{pos:[1,2],hand:['fire','earth','water']});d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:3},(_,i)=>({id:'card:'+(e*3+i),element})));for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);
   s=E.applyAction(s,0,{type:'plan',cardId:s.data.players[0].hand.find(c=>c.element==='earth').id,element:'earth',action:'attack',direction:1});s=E.applyAction(s,1,{type:'plan',cardId:s.data.players[1].hand.find(c=>c.element==='fire').id,element:'fire',action:'attack',direction:0});
   window.magePlaybackFixture={s,bytes:JSON.stringify(s),sounds:[],done:0};
   const host=document.querySelector('#app');host.innerHTML='<section class="scene" data-animation-speed="'+mode+'">'+PlayroomViews.render(E.project(s,0),0,E.legalActions(s,0),{})+'</section>';
   const first=host.querySelector('[data-public-frame]:not([hidden])'),health=host.querySelector('.player-panel[data-player-index="1"] [data-score-id="health"]');
   const result={index:+first.dataset.publicFrame,health:health.title,finalHealth:s.data.players[1].health,firstPlans:s.data.frames[0].plans,firstHands:s.data.frames[0].players.map(p=>p.handCount)};
   window.PlayroomAppBridge={...PlayroomAppBridge,audio:{play:(ids,pack)=>magePlaybackFixture.sounds.push({ids,pack})}};
   const scheduler=new PlayroomPresentationScheduler();PlayroomPublicSequence.setMode(host,'live');PlayroomPublicSequence.useExecutor(host,scheduler);window.phaseClock=scheduler.track('public-sequence');
   PlayroomPublicSequence.bind(host);PlayroomPublicSequence.defer(host,()=>magePlaybackFixture.done++);
   return result;
  },mode);
  assert.equal(initial.index,0,'HTML already shows the original frame before bind');assert.equal(initial.health,'Здоровье: 3');assert.equal(initial.finalHealth,1);assert.equal(initial.firstPlans,undefined);assert.deepEqual(initial.firstHands,[3,3]);
  if(mode==='normal'&&!reduced){
   assert.equal(await p.locator('.public-sequence').evaluate(n=>n.style.getPropertyValue('--sequence-duration')),'1500ms');
   await advance(p,1500);await advance(p,750); // Complete reveal before the attack.
   const repeated=await p.evaluate(()=>{
    const h=document.querySelector('#app'),f=()=>h.querySelector('[data-public-frame]:not([hidden])'),before=f(),projectile=before.querySelector('.mage-projectile'),panel=h.querySelector('.player-panel[data-player-index="1"]'),child=panel.firstElementChild;
    const animation=projectile?.getAnimations()[0],hidden=[];
    const observer=new MutationObserver(records=>hidden.push(...records.filter(r=>r.target===before&&r.attributeName==='hidden')));observer.observe(h,{attributes:true,subtree:true});
    const s=magePlaybackFixture.s,E=TabletopCore;
    for(let i=0;i<3;i++){PlayroomGameScreen.update(h,'<section class="scene" data-animation-speed="normal">'+PlayroomViews.render(E.project(s,0),0,E.legalActions(s,0),{})+'</section>');PlayroomPublicSequence.bind(h);}
    hidden.push(...observer.takeRecords().filter(r=>r.target===before&&r.attributeName==='hidden'));observer.disconnect();
    return {index:f().dataset.publicFrame,sameFrame:f()===before,hidden: hidden.length,sameAnimation:!!animation&&projectile.getAnimations()[0]===animation,samePlayerChild:panel.firstElementChild===child,sounds:magePlaybackFixture.sounds.length};
   });
   assert.equal(repeated.index,'2');assert(repeated.sameFrame&&repeated.sameAnimation&&repeated.samePlayerChild,'redraw retains active effects and player nodes: '+JSON.stringify(repeated));assert.equal(repeated.hidden,0,'same-frame redraw never hides/restarts the effect');assert.equal(repeated.sounds,3,'redraw does not repeat reveal/attack audio');
   const paused=await p.evaluate(async()=>{
    phaseClock.pause();const a=document.querySelector('[data-public-frame]:not([hidden]) .mage-projectile').getAnimations()[0];
    await a.ready;window.phaseAnimation=a;return {time:a.currentTime,frame:document.querySelector('[data-public-frame]:not([hidden])').dataset.publicFrame};
   });
   await p.clock.runFor(2000);
   assert.deepEqual(await p.evaluate(()=>({time:phaseAnimation.currentTime,frame:document.querySelector('[data-public-frame]:not([hidden])').dataset.publicFrame})),paused,'pause freezes CSS effect and phase together');
   assert.equal(await p.evaluate(()=>{phaseClock.setRate(2);const rate=phaseAnimation.playbackRate;phaseClock.resume();return rate;}),2);

  }
  if(!reduced&&mode!=='instant'){assert.equal(await p.locator('.public-sequence-controls').count(),0);if(mode==='fast'){assert.equal(await p.locator('.public-sequence').evaluate(n=>n.style.getPropertyValue('--sequence-duration')),'1500ms');await p.clock.runFor(843);assert.equal(await p.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),'0');await p.clock.runFor(1);assert.equal(await p.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),'1');for(let i=0;i<await p.locator('[data-public-sequence]').evaluate(n=>JSON.parse(n.dataset.presentationPlan).final+1);i++)await advance(p,1000);}else for(let i=0;i<await p.locator('[data-public-sequence]').evaluate(n=>JSON.parse(n.dataset.presentationPlan).final+1);i++)await advance(p,1000);
   assert.equal(await p.evaluate(()=>magePlaybackFixture.done),1);
   const sounds=await p.evaluate(()=>magePlaybackFixture.sounds);assert(sounds.some(s=>s.pack==='mage-brawl'&&s.ids[0]==='mage.earth'));assert(sounds.some(s=>s.ids[0]==='mage.reveal'));
  }else {assert.equal(await p.evaluate(()=>magePlaybackFixture.sounds.length),0);assert.equal(await p.locator('.is-public-playback').count(),0,'instant/reduced playback has no wait');}
  assert.equal(await p.locator('.player-panel[data-player-index="1"] [data-score-id=health]').getAttribute('title'),'Здоровье: 1');assert(await p.evaluate(()=>JSON.stringify(magePlaybackFixture.s)===magePlaybackFixture.bytes),'playback never mutates rules');
  const redraw=await p.evaluate(()=>{
   const s=magePlaybackFixture.s,E=TabletopCore,h=document.querySelector('#app'),result=[];
   for(const direction of [0,1,2,3]){
    const ui={viewState:{mageCardId:s.data.players[0].hand.find(c=>c.element==='air')?.id,mageAction:'movement',mageDirection:direction}};
    PlayroomGameScreen.update(h,'<section class="scene">'+PlayroomViews.render(E.project(s,0),0,E.legalActions(s,0),ui)+'</section>');PlayroomPublicSequence.bind(h);
    const shown=h.querySelector('[data-public-frame]:not([hidden])'),last=h.querySelector('[data-public-frame]:last-child');
    result.push({live:shown===last,hidden:h.querySelector('.app-game-layout').classList.contains('is-public-playback'),previews:shown.querySelectorAll('.mage-preview').length,expected:E.project(s,0).data.previews.find(p=>p.command.element==='air'&&p.command.action==='movement'&&p.command.direction===direction)?.cells.length||0});
   }return result;
  });
  assert(redraw.every(r=>r.live&&!r.hidden&&r.previews===r.expected),'second-round rotation preserves live board, hand and current highlights: '+JSON.stringify(redraw));await ctx.close();
 }}finally{await browser.close();await server.close();}
});

test('Mage Brawl loot view: Akulina dialog, sequential recipients and private square backs',{timeout:25000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(4000);await ctx.addInitScript(()=>localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,autoPass:false})));await openMageFixture(p,server.url);await p.locator('[data-start="mage-brawl"]').first().waitFor({state:'attached'});await p.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('mage-brawl',false));p.setDefaultTimeout(7000);
  // Real local screen lifecycle: controls, a full round, hotseat and history.
  await p.locator('[data-start="mage-brawl"]').click();await p.locator('[data-game-mode=hotseat]').click();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Борис'});b.renderLobby();});await TestUI.activeSurface(p).locator('[data-command=room-rules]').click();assert.equal(await p.locator('[name=firstPlayerMode]').count(),0,'no first player option');assert.equal(await TestUI.activeSurface(p).locator('input[name=seatOrder]').count(),2,'seat order options remain');await TestUI.activeSurface(p).locator('.modal-head [data-command=close-modal]').click();await p.locator('[data-command=lobby-start]').click();await p.locator('[data-command=unlock]').click();
  assert.deepEqual(errors,[]);
  await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();
  await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();
  const movementDiagram=await p.locator('.mage-card').first().locator('template').innerHTML();
  await p.locator('[data-view-key=mageAction][data-view-value=movement]').click();assert.notEqual(await p.locator('.mage-card').first().locator('template').innerHTML(),movementDiagram,'help template updates on action switch');
  await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();assert.equal(await p.locator('.mage-card').first().locator('template').innerHTML(),movementDiagram);
  await p.locator('[data-command=card-help]').click();assert.equal(await p.locator('.mage-memo-table tbody tr').count(),4);assert.equal(await p.locator('.mage-memo-table .mage-action-diagram').count(),12,'memo shows all four elements and all three actions');assert.equal(await p.locator('.mage-memo-order svg').count(),1);assert(await p.locator('.mage-memo-table td').evaluateAll(cells=>cells.every(cell=>cell.getAttribute('aria-label')&&!/action-help\./.test(cell.getAttribute('aria-label')))));assert.equal(await p.locator('.mage-memo-table .mage-action-diagram [stroke-width]').first().evaluate(n=>getComputedStyle(n).strokeWidth),'1.5px');await p.screenshot({path:mageEvidence('help.png')});await p.locator('#modal-root [data-command=close-modal]').click();
  for(const c of await p.locator('.mage-card').all()){await c.click();assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'90deg');}
  assert.equal(await p.locator('.player-panel.is-turn,[aria-current=true],.turn-label').count(),0,'simultaneous preparation has no turn marker');
  await p.locator('.mage-controls [data-action]').click();await p.locator('[data-decision-player="1"]').click();await p.locator('[data-command=unlock]').click();
  assert.equal(await p.locator('.player-panel.is-turn,[aria-current=true],.turn-start-flash,.turn-label').count(),0,'ready does not transfer a turn');assert(await p.locator('.player-panel.is-ready[data-player-index="0"]').count()>0,'ready participant is highlighted');
  assert.equal(await p.evaluate(()=>{const n=document.querySelector('.player-panel.is-ready'),before=getComputedStyle(n).backgroundColor;n.classList.remove('is-ready');n.classList.add('is-turn');const after=getComputedStyle(n).backgroundColor;n.classList.remove('is-turn');n.classList.add('is-ready');return before===after;}),true,'ready uses the active player green');
  await p.screenshot({path:mageEvidence('ready.png')});
  await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();await p.locator('[data-view-key=mageDirection][data-view-value="2"]').click();await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();await p.locator('.mage-controls [data-action]').click();
  if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();await p.waitForFunction(()=>document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.is-public-playback'));
  if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();
  if(await p.locator('.self-player').getAttribute('data-player-index')!=='0'){assert.equal(await p.locator('[data-decision-player="0"]').count(),1,'next round restores native player selection after public playback');await p.locator('[data-decision-player="0"]').click();await p.locator('[data-command=unlock]').click();}
  assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'90deg','direction survives round and hotseat');
  const rotation=await p.evaluate(()=>{const samples=[],costs={};for(const [obj,key] of [[TabletopCore,'project'],[PlayroomViews,'render'],[PlayroomGameScreen,'update'],[PlayroomGameScreen,'layoutScene']]){const fn=obj[key];obj[key]=function(...args){const t=performance.now();try{return fn.apply(this,args)}finally{const c=costs[key]||(costs[key]={calls:0,ms:0});c.calls++;c.ms+=performance.now()-t;}};}for(let i=0;i<8;i++){const b=document.querySelector('.mage-rotate:last-child'),t=performance.now();b.click();document.querySelector('.mage-grid').getBoundingClientRect();samples.push(performance.now()-t);}return {samples,costs};});fs.writeFileSync(mageEvidence('rotation-timings.json'),JSON.stringify(rotation));
  await p.locator('[data-game-menu]').click();await p.locator('[data-game-menu-action][data-command=history]').click();assert.equal(await p.locator('.mage-hand,.mage-loot-hand,.mage-ready,.mage-rotate,.mage-action-switch,.mage-facing,.mage-preview').count(),0,'history has no private choice UI');
  await p.locator('.game-frame-header [data-command=history-close]').click();if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'810deg','history preserves continuous live orientation after two complete rotations');
  const result=await p.evaluate(()=>{
   const E=TabletopCore;let s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]}),d=s.data;
   d.board=Array(36).fill('ground');d.board[0]=d.board[35]='base';d.shrink=null;
   [[2,2],[2,1],[2,3]].forEach((pos,i)=>Object.assign(d.players[i],{pos,health:3,maxHand:i?3:8,hand:i?['earth']:['water','fire','air','earth','water','fire','air','earth']}));d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:4},(_,i)=>({id:'card:'+(e*4+i),element})));d.discard=[];for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);
   window.finalLootSource=JSON.parse(JSON.stringify(s));finalLootSource.data.players[0].lives=1;
   [{element:'water',direction:0},{element:'earth',direction:1},{element:'earth',direction:3}].forEach((c,i)=>s=E.applyAction(s,i,{type:'plan',cardId:s.data.players[i].hand.find(card=>card.element===c.element).id,action:'attack',...c}));
   window.lootRewardIds=s.data.loot[0].cards.map(card=>card.id);window.lootFixture={s,viewer:1,commits:[],viewState:{}};const host=document.querySelector('#app');
   window.renderLoot=()=>{const f=lootFixture,projected=E.project(f.s,f.viewer),actions=E.legalActions(f.s,f.viewer);PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'loot-dialog',gameName:'Битва магов',state:projected,viewer:f.viewer,actions,scene:PlayroomViews.render(projected,f.viewer,actions,{viewState:f.viewState||{}})}));PlayroomPublicSequence.bind(host);PlayroomGameScreen.layoutScene(host);};renderLoot();
   // Historical frames are authored lazily; only the current frame is mounted.
   const authoredFrames=JSON.parse(host.querySelector('[data-public-frame-bank]').content.textContent).map(record=>{const fragment=document.createElement('template');fragment.innerHTML=record.markup;return fragment.content;});
   const simultaneous=authoredFrames.map(f=>f.querySelectorAll('.mage-attack-earth').length).filter(Boolean),reveals=authoredFrames.flatMap(f=>[...f.querySelectorAll('.mage-phase-cards')].map(n=>n.children.length));
   const outsider=document.createElement('div');outsider.innerHTML=PlayroomViews.render(E.project(s,2),2,E.legalActions(s,2),{});const outsiderChoices=outsider.querySelectorAll('.mage-loot-hand').length;
   outsider.innerHTML=PlayroomViews.render(E.project(s,-1),-1,[],{surface:'table'});const publicChoices=outsider.querySelectorAll('.mage-loot-hand').length;
   window.lootTargets=new PlayroomPlayerTarget({root:()=>host,actions:()=>E.legalActions(lootFixture.s,lootFixture.viewer),commit:c=>{const f=lootFixture;f.commits.push({actor:f.viewer,index:c.index});f.s=E.applyAction(f.s,f.viewer,c);f.viewer=f.s.data.loot?.[0]?.recipients[0]??f.viewer;renderLoot();}});
   host.addEventListener('click',e=>{const t=e.target.closest('.mage-loot-hand [data-player-target]');if(t){e.stopPropagation();lootTargets.tap(Number(t.dataset.playerTarget));}});
   return {simultaneous,reveals,outsiderChoices,publicChoices,inlineCards:host.querySelectorAll('.mage-loot-card').length};
  });
  assert.deepEqual(result.simultaneous,[2]);assert(result.reveals.includes(2));assert.equal(result.outsiderChoices,0);assert.equal(result.publicChoices,0);assert.equal(result.inlineCards,0);
  const open=p.locator('.mage-loot-hand [data-player-target]'),dialog=p.locator('dialog.card-choice-dialog');await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),7);assert.equal(await dialog.locator('.card-back-art').count(),7);assert.equal(await dialog.locator('[data-card-help-art]').count(),0);
  for(const [width,height] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const box=await dialog.boundingBox(),card=await dialog.locator('[data-card-index]').first().boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'dialog fits viewport');assert.equal(card.width,card.height,'square loot backs');await p.screenshot({path:mageEvidence(`${width}x${height}.png`)});}
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{window.qaBackdropClicks=0;window.qaBackdropPointers=[];const button=document.createElement('button');button.id='qa-under-dialog';button.textContent='Underlying test action';button.style.cssText='position:fixed;left:0;top:0;width:12px;height:12px;margin:0;padding:0;border:0;opacity:0;z-index:2147483647';button.onclick=()=>qaBackdropClicks++;document.body.append(button);document.addEventListener('pointerdown',event=>{if(event.clientX===4&&event.clientY===4)qaBackdropPointers.push({trusted:event.isTrusted,type:event.pointerType,target:event.target.tagName});},true);});
  const modalBox=await dialog.boundingBox();assert(modalBox.x>4||modalBox.y>4,'native backdrop point is outside the modal');
  await p.mouse.click(modalBox.x+5,modalBox.y+5);assert.equal(await dialog.count(),1,'blank space inside the dialog is not the backdrop');
  await p.touchscreen.tap(4,4);
  const touchBackdrop=await p.evaluate(()=>({dialogs:document.querySelectorAll('dialog.card-choice-dialog').length,commits:lootFixture.commits.length,underlyingClicks:qaBackdropClicks,pointers:qaBackdropPointers}));fs.writeFileSync(mageEvidence('backdrop-touch.json'),JSON.stringify(touchBackdrop,null,2));
  assert.equal(touchBackdrop.dialogs,0,'native touch outside the card dialog dismisses it');assert.equal(touchBackdrop.commits,0);assert.equal(touchBackdrop.underlyingClicks,0,'dismissal touch does not activate the underlying control');
  await p.locator('#qa-under-dialog').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>qaBackdropClicks),1,'keyboard activation remains independent');
  await open.click();await p.mouse.click(4,4);assert.equal(await dialog.count(),0,'mouse backdrop dismisses the dialog');assert.equal(await p.evaluate(()=>qaBackdropClicks),1,'dismissal mouse click does not pass through');
  await p.mouse.click(4,4);assert.equal(await p.evaluate(()=>qaBackdropClicks),2,'a fresh pointer gesture is not swallowed');
  await p.evaluate(()=>document.querySelector('#qa-under-dialog').remove());await open.click();await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await p.evaluate(()=>lootFixture.commits.length),0);await open.click();
  await dialog.locator('.card-choice-heading button').click();assert.equal(await dialog.count(),0);assert.equal(await p.evaluate(()=>lootFixture.commits.length),0,'closing does not choose');await open.click();await dialog.locator('[data-card-index="1"]').click();assert.deepEqual(await p.evaluate(()=>lootFixture.commits),[{actor:1,index:1}]);assert.equal(await dialog.count(),0);
  await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),6);await dialog.locator('[data-card-index="0"]').click();assert.deepEqual(await p.evaluate(()=>lootFixture.commits),[{actor:1,index:1},{actor:2,index:0}]);assert.equal(await dialog.count(),0);assert.equal(await open.count(),0);
  assert.equal(await p.evaluate(()=>lootFixture.s.data.players[0].hand.length),0,'victim discards the unclaimed accumulated cards');assert.equal(await p.evaluate(()=>[...lootFixture.s.data.deck,...lootFixture.s.data.discard].filter(card=>lootRewardIds.slice(2).includes(card.id)).length),5,'all five unclaimed cards return to the common pool after round reshuffle');
  await p.evaluate(()=>{window.retainedLootState=lootFixture.s;let s=finalLootSource;[{element:'water',direction:0},{element:'earth',direction:1},{element:'earth',direction:3}].forEach((c,i)=>s=TabletopCore.applyAction(s,i,{type:'plan',cardId:s.data.players[i].hand.find(card=>card.element===c.element).id,action:'attack',...c}));lootFixture.s=s;lootFixture.viewer=1;renderLoot();});
  for(const count of [7,6]){await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),count);await dialog.locator('[data-card-index="0"]').click();}
  assert.deepEqual(await p.evaluate(()=>lootFixture.s.data.players.map(p=>p.hand.length)),[0,2,2],'final death also transfers one chosen card to each killer and replaces played cards');
  await p.evaluate(()=>{lootFixture.s=retainedLootState;renderLoot();});
  await p.evaluate(()=>{lootFixture.viewer=0;renderLoot();});
  assert(await p.locator('.mage-cell.is-playable[data-action]').count()>0,'only the respawning player sees highlighted legal bases');
  assert.equal(await p.locator('.mage-controls').innerText(),'');
  await p.evaluate(()=>{lootFixture.viewer=1;renderLoot();});assert.equal(await p.locator('.mage-cell.is-playable[data-action]').count(),0,'other players do not see base selection');
  await p.evaluate(()=>{const f=lootFixture,E=TabletopCore;f.s=E.applyAction(f.s,f.s.turn,E.legalActions(f.s,f.s.turn)[0]);f.viewer=0;renderLoot();});
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const handGeometry=await p.locator('.mage-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,id:n.dataset.entity,cls:n.className,parent:n.parentElement.className,transform:getComputedStyle(n).transform};}));fs.writeFileSync(mageEvidence('hand-geometry.json'),JSON.stringify(handGeometry));assert.equal(new Set(handGeometry.map(r=>r.y)).size,2,'selected card is lifted, all others share one row');assert.equal(new Set(handGeometry.map(r=>r.id)).size,8);assert(handGeometry.at(-1).right<=390);assert(handGeometry.some((r,i)=>i>0&&r.x<handGeometry[i-1].right),'ordinary cards overlap instead of wrapping');assert(handGeometry[1].x>=handGeometry[0].right,'selected first card stays fully exposed');
  const copies=await p.evaluate(()=>{const f=lootFixture,hand=f.s.data.players[f.viewer].hand,index=hand.findIndex((e,i)=>hand.findIndex(c=>c.element===e.element)!==i);f.viewState.mageCardId=hand[index].id;renderLoot();return {id:f.viewState.mageCardId,index};});assert.equal(await p.locator('.mage-card.is-selected').count(),1);assert.equal(await p.locator('.mage-card.is-selected').getAttribute('data-entity'),'card-'+copies.id);
  assert.equal(await p.locator('.mage-card').count(),8,'respawn refills the earned maximum after two cards were looted');await p.screenshot({path:mageEvidence('respawn-hand.png')});
  assert.equal(await p.locator('.player-hand').count(),0,'opponent hands are omitted');
  // Reserve life becomes a crown, followed by health; private choice previews rotate together.
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await p.evaluate(()=>{const f=lootFixture;f.s=TabletopCore.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]});f.viewer=2;const d=f.s.data;d.board=Array(d.size*d.size).fill('ground');d.board[0]=d.board[d.board.length-1]='base';d.board[1]='wall';d.board[2]='falling_floor';d.board[3]='spikes';d.startingBases=[[0,0],[d.size-1,d.size-1],[2,2]];d.players[0].pos=[0,0];d.players[1].pos=[d.size-1,d.size-1];Object.assign(d.players[2],{pos:[2,2],hand:['air','earth','water','fire']});d.players[0].hand=['earth'];d.players[1].hand=['water'];d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:4},(_,i)=>({id:'card:'+(e*4+i),element})));d.discard=[];for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);f.viewState={mageCardId:d.players[f.viewer].hand.find(c=>c.element==='air').id,mageAction:'movement',mageDirection:0};renderLoot();});
  const own=p.locator('.player-panel[data-player-index="2"]'),scores=own.locator('.player-details');
  assert.equal(await p.locator('.mage-scene .player-turn-position,.mage-scene .player-medallion.is-first,.player-heading-counter').count(),0);
  assert.equal(await scores.locator('.token-meeple .counter-token:not(.is-empty)').count(),1);
  assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),3);
  assert.equal(await scores.locator('.token-crown').count(),0);
  assert.equal(await own.locator('.player-heading>strong').innerText(),'C');
  assert.equal(await own.locator('.player-heading .token-heart').count(),0);assert.equal(await own.locator('.player-heading .token-meeple').count(),0);
  assert.deepEqual(await own.locator('.player-scores').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','lives','health']);
  await p.evaluate(()=>{Object.assign(lootFixture.s.data.players[2],{health:1,maxHand:6,kills:3});renderLoot();});
  assert.equal(await own.getAttribute('data-hand-count'),'6','card counter always shows the earned limit');
  assert.equal(await scores.locator('[data-score-id=kills]').count(),0);
  const hearts=await scores.locator('.counter-token').evaluateAll(nodes=>nodes.filter(n=>n.closest('[data-score-id=health]')).map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width,empty:n.classList.contains('is-empty'),opacity:getComputedStyle(n).opacity})));
  assert.deepEqual(hearts.map(h=>h.empty),[false,true,true]);assert(Math.abs(hearts[1].x-hearts[0].x-hearts[0].width*.46)<.1);assert.equal(hearts[2].opacity,'1');
  const tokenHearts=await p.locator('.mage-piece[data-mage-player="2"] [data-mage-token-health] .piece-indicator').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width,empty:n.classList.contains('is-empty'),opacity:getComputedStyle(n).opacity})));assert.deepEqual(tokenHearts.map(h=>h.empty),[false,true,true]);assert(tokenHearts[1].x-tokenHearts[0].x>tokenHearts[0].w);assert.equal(tokenHearts[1].opacity,'1');
  await p.evaluate(()=>{lootFixture.s.data.players[2].health=3;lootFixture.s.data.shrink=lootFixture.s.data.round;renderLoot();});
  assert.equal(await p.locator('.mage-warning').count(),0);assert.equal(await p.locator('.mage-risk').count(),20);
  assert.notEqual(await p.locator('.mage-risk').first().evaluate(n=>getComputedStyle(n,'::after').backgroundColor),'rgba(0, 0, 0, 0)');

  const beforeShrink=await p.locator('.mage-cell').first().boundingBox();
  await p.evaluate(()=>{const d=lootFixture.s.data;d.players[0].pos=[1,1];d.players[1].pos=[4,4];d.inset=1;d.shrink=null;renderLoot();});
  assert.equal(await p.locator('.mage-cell').count(),16,'removed ring does not reserve space');
  assert((await p.locator('.mage-cell').first().boundingBox()).width>beforeShrink.width*1.4,'remaining cells grow');
  assert.equal(await p.locator('.mage-piece[data-mage-player="2"]').evaluate(n=>n.style.getPropertyValue('--col')),'1','global positions map into cropped board');
  await p.screenshot({path:mageEvidence('shrunk-arena.png')});
  await p.evaluate(()=>{const d=lootFixture.s.data;d.inset=0;d.players[0].pos=[0,0];d.players[1].pos=[5,5];renderLoot();});
  const firstReserve=()=>scores.evaluate(n=>{const a=[...n.querySelectorAll('.token-meeple,.token-crown,.token-heart')];return a.map(x=>x.className);});
  assert.match((await firstReserve())[0],/token-meeple/);assert.match((await firstReserve())[1],/token-heart/);
  await p.evaluate(()=>{Object.assign(lootFixture.s.data.players[2],{lives:1,ultimate:1});renderLoot();});
  assert.equal(await scores.locator('.token-crown .counter-token').count(),0,'live ultimate reserve uses the avatar badge');assert.equal(await own.locator('.player-avatar-label [data-ui-icon=host]').count(),1);assert.match(await own.locator('.player-avatar-label').getAttribute('aria-label'),/: 1$/);assert.equal(await own.locator('.player-avatar-label.has-multiplier').count(),0);assert.equal(await scores.locator('.token-meeple .is-empty').count(),1);assert.match((await firstReserve())[0],/token-meeple/);
  assert.equal(await p.locator('.mage-token .mage-ultimate').count(),1);assert.equal(await p.locator('.mage-token').evaluateAll(nodes=>nodes.some(n=>/\d/.test(n.textContent))),false);
  const switches=p.locator('.mage-action-switch button');assert.equal(await switches.count(),3);assert.deepEqual(await switches.allTextContents(),['','','']);assert.deepEqual(await switches.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))),['Движение','Атака','Ультимейт']);assert.equal(await switches.locator('svg').count(),3);
  for(const [element,color] of Object.entries({air:'#729d98',earth:'#aa844b',water:'#508fa9',fire:'#cb7054'})){
   await p.evaluate(e=>{lootFixture.viewState.mageCardId=lootFixture.s.data.players[lootFixture.viewer].hand.find(c=>c.element===e).id;renderLoot();},element);
   assert(await p.locator('.mage-preview').count()>0,element+' previews');
   assert.equal(await p.locator('.mage-preview').first().evaluate(n=>getComputedStyle(n).getPropertyValue('--mage-selected').trim()),color);
   assert.equal(await p.locator('.mage-selected-token').evaluate(n=>getComputedStyle(n).getPropertyValue('--color-interaction-selected').trim()),'#dfb83d');
   assert.equal(await p.locator('.mage-facing').count(),1);
  }
  for(let direction=0;direction<4;direction++){
   await p.evaluate(d=>{lootFixture.viewState.mageDirection=d;renderLoot();},direction);
   assert.equal(await p.locator('.mage-facing').evaluate(n=>n.style.getPropertyValue('--mage-direction')),direction*90+'deg');
   assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),direction*90+'deg');
  }
  await p.evaluate(()=>{lootFixture.viewState={mageCardId:lootFixture.s.data.players[lootFixture.viewer].hand.find(c=>c.element==='air').id,mageAction:'movement',mageDirection:1};renderLoot();});assert.equal(await p.locator('.mage-facing').evaluate(n=>n.style.getPropertyValue('--mage-direction')),'135deg');assert.equal(await p.locator('.mage-card').first().locator('.mage-card-facing').evaluate(n=>n.style.getPropertyValue('--mage-bearing')),'135deg');
  assert.equal(await p.evaluate(()=>{const f=lootFixture,n=document.createElement('div');n.innerHTML=PlayroomViews.render(TabletopCore.project(f.s,f.viewer),f.viewer,TabletopCore.legalActions(f.s,f.viewer),{replay:true,hotseat:true});return n.querySelectorAll('.mage-hand,.mage-loot-hand,.mage-facing,.mage-preview,[data-decision-player],[data-action]').length;}),0,'replay ignores even supplied legal choices');
  assert.equal(await p.evaluate(()=>{const n=document.createElement('div');n.innerHTML=PlayroomViews.render(TabletopCore.project(lootFixture.s,-1),-1,[],{surface:'table'});return n.querySelectorAll('.mage-facing,.mage-selected-token').length;}),0);
  const baseArt=await p.locator('.tile-base').evaluateAll(nodes=>nodes.map(n=>({color:getComputedStyle(n.querySelector('[data-base-color]')).fill,center:getComputedStyle(n.querySelector('circle:last-child')).fill})));
  assert(baseArt.every(b=>b.center==='rgb(255, 254, 248)'),'white base centers');assert.notEqual(baseArt[0].color,baseArt[1].color,'distinct muted starting colors');
  const pawnColors=await p.locator('.mage-token').evaluateAll(nodes=>[0,1].map(i=>getComputedStyle(nodes[i]).backgroundColor));baseArt.forEach((b,i)=>assert.notEqual(b.color,pawnColors[i],'bases are muted relative to pawns'));
  const baseColors=await p.locator('.tile-base').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n.querySelector('[data-base-color]')).fill));
  await p.evaluate(()=>{lootFixture.s.data.players[0].pos=[1,0];lootFixture.s.data.players[1].pos=[0,0];renderLoot();});assert.deepEqual(await p.locator('.tile-base').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n.querySelector('[data-base-color]')).fill)),baseColors,'empty and foreign-occupied bases retain start colors');
  await p.evaluate(()=>{lootFixture.s.players.forEach(p=>p.name='Александр Оченьдлинноеимя');renderLoot();});
  for(const [width,height] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const hand=await p.locator('.mage-hand .hand-track').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight}));assert(hand.scroll<=hand.width+1&&hand.scrollHeight<=hand.height+1,'direction markers fit hand: '+JSON.stringify(hand));const rows=await p.locator('.player-heading').evaluateAll(ns=>ns.map(n=>{const name=n.querySelector('strong'),r=n.getBoundingClientRect(),b=name.getBoundingClientRect();return {fits:b.right<=r.right+1,height:b.height,row:r.height,ellipsis:getComputedStyle(name).textOverflow,nowrap:getComputedStyle(name).whiteSpace};}));assert.equal(rows.length,3,'all player names remain readable through resize');assert(rows.every(r=>r.fits&&r.height<=r.row&&r.ellipsis==='ellipsis'&&r.nowrap==='nowrap'),JSON.stringify(rows));await p.screenshot({path:mageEvidence(`terrain-${width}x${height}.png`)});}
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.evaluate(()=>{lootFixture.viewState.mageAction='movement';lootFixture.viewState.mageDirection=0;renderLoot();});await p.screenshot({path:mageEvidence('movement-directions.png')});
  await p.evaluate(()=>{lootFixture.viewState.mageAction='attack';renderLoot();});await p.screenshot({path:mageEvidence('attack-directions.png')});
  await p.evaluate(()=>{lootFixture.s.data.players[2].ultimate=0;renderLoot();});assert.equal(await switches.count(),2);assert.equal(await scores.locator('.token-meeple .is-empty').count(),1);assert.equal(await scores.locator('.token-crown').count(),0);assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),3);
  // Consecutive renders reuse DOM and sequence templates, just like the actual app.
  for(const [health,lives,ultimate] of [[3,2,0],[2,2,0],[0,1,1],[3,1,1],[1,1,0],[0,0,0]]){
   await p.evaluate(([health,lives,ultimate])=>{const f=lootFixture,d=f.s.data;Object.assign(d.players[2],{health,lives,ultimate,pos:health?[2,2]:null});const q=TabletopCore.project(f.s,f.viewer).data;d.frames=[{board:q.board,inset:q.inset,players:q.players.map(({health,lives,ultimate,handCount,maxHand,kills,pos})=>({health,lives,ultimate,handCount,maxHand,kills,pos})),phase:'start'}];renderLoot();},[health,lives,ultimate]);
   assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),health,'rerendered health '+[health,lives,ultimate]);assert.equal(await scores.locator('.token-meeple .counter-token:not(.is-empty)').count(),lives>1?1:0,'rerendered spare life');assert.equal(await own.locator('.player-avatar-label').count(),ultimate>0?1:0,'rerendered ultimate');if(ultimate>0)assert.match(await own.locator('.player-avatar-label').getAttribute('aria-label'),/: 1$/);
  }
  const resultMetric=await p.evaluate(()=>{const E=TabletopCore,s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'}]});s.data.round=26;Object.assign(s.data.players[0],{lives:1});Object.assign(s.data.players[1],{health:0,lives:0,pos:null,eliminatedRound:25});E.complete(s,[0]);const projected=E.project(s,0);document.querySelector('#app').innerHTML=PlayroomGameScreen.resultMarkup({state:projected,viewer:0,gameName:'Битва магов'});return projected.result.metrics.find(m=>m.id==='survival').values;});
  assert.deepEqual(resultMetric,[26,25]);assert.deepEqual(await p.locator('.result-person').first().locator('.result-core-counters').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills','lives','health']);assert.equal(await p.locator('.result-person .token-heart.is-overlapping').count(),2);assert.equal(await p.locator('.result-awards .is-first').count(),0,'Mage Brawl results have no first-player token');assert((await p.locator('.result-person').allTextContents()).some(t=>t.includes('Выживание: 26')));await p.screenshot({path:mageEvidence('result.png')});
  // The same controller retains Akulina's portrait geometry and real command.
  await p.evaluate(()=>{lootTargets.destroy();const E=TabletopCore,s=E.createGame('oldmaid',{seed:17,players:[{name:'A'},{name:'B'}]}),viewer=s.turn,actions=E.legalActions(s,viewer),host=document.querySelector('#app');host.innerHTML=PlayroomViews.render(E.project(s,viewer),viewer,actions,{});window.oldmaidTarget=new PlayroomPlayerTarget({root:()=>host,actions:()=>actions,commit:()=>{}});oldmaidTarget.tap(actions[0].target);});
  assert.equal(await p.locator('.player-turn-position').count(),2,'other games retain order positions');assert(await p.locator('.player-panel.is-turn').count()>0,'sequential games retain active player');const portrait=await dialog.locator('[data-card-index]').first().boundingBox();assert(portrait.height>portrait.width);await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Mage Brawl elemental effects: routes, attacks, damage, death, fall and killer panels',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await openMageFixture(p,server.url);await p.locator('[data-start="mage-brawl"]').first().waitFor({state:'attached'});await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
  await p.evaluate(()=>{
   window.PlayroomAppBridge={...PlayroomAppBridge,audio:{batch:()=>Promise.resolve(),play:()=>Promise.resolve()}};
   window.showMageEffect=(kind,element='air')=>{
    const E=TabletopCore,players=[{name:'A'},{name:'B'}];let s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players}),d=s.data;
    d.board=Array(16).fill('ground');d.board[0]=d.board[15]='base';d.shrink=kind==='shrink'?1:null;
    let a=[1,1],b=[1,2],action=kind==='move'?'movement':'attack',direction=1;
    if(kind==='move'){a=[2,0];b=[0,3];}if(kind==='fall'){a=[1,2];b=[1,3];}if(kind==='shrink'){a=[2,2];b=[0,2];element='earth';action='movement';}
    Object.assign(d.players[0],{pos:a,hand:[element]});Object.assign(d.players[1],{pos:b,health:kind==='death'?1:3,hand:['earth','water']});
    d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:3},(_,i)=>({id:'card:'+(e*3+i),element})));d.discard=[];for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);
    s=E.applyAction(s,0,{type:'plan',cardId:s.data.players[0].hand.find(c=>c.element===element).id,element,action,direction});s=E.applyAction(s,1,{type:'plan',cardId:s.data.players[1].hand.find(c=>c.element==='earth').id,element:'earth',action:'movement',direction:0});
    const projected=E.project(s,-1),host=document.querySelector('#app');host.innerHTML='';PlayroomPublicSequence.bind(host);host.innerHTML=PlayroomGameScreen.render({layoutId:'effects:'+kind+element,gameName:'Битва магов',state:projected,viewer:-1,actions:[],scene:PlayroomViews.render(projected,-1,[],{surface:'table'})});PlayroomGameScreen.layoutScene(host);
    const bank=host.querySelector('[data-public-frame-bank]'),records=bank?JSON.parse(bank.content.textContent):[...host.querySelectorAll('[data-public-frame]')].map(f=>({markup:f.innerHTML,duration:Number(f.dataset.frameDuration)||650})),status=kind==='damage'?'damage':kind==='death'?'death':'fall';
    const index=records.findIndex(record=>{const f=document.createElement('template');f.innerHTML=record.markup;return kind==='shrink'||kind==='fall'||kind==='death'||kind==='damage'?f.content.querySelector(`.mage-token[data-public-feedback~="${status}"]`):kind==='move'?f.content.querySelector('.mage-trail'):f.content.querySelector('.mage-attack-'+element);});
    const durations=records.slice(0,index).map(f=>f.duration||650);
    // Select the real generated public frame through the existing playback clock.
    window.mageEffectFixture={s,index,bytes:JSON.stringify(s)};
    return {index,durations};
   };
  });
  async function show(kind,element){
   const {index,durations}=await p.evaluate(([k,e])=>showMageEffect(k,e),[kind,element]);assert(index>=0,kind+':'+element);for(const duration of durations){await p.evaluate(()=>document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).forEach(a=>a.finish()));await p.clock.runFor(duration+1);}
   assert.equal(await p.locator('[data-public-frame]:visible').getAttribute('data-public-frame'),String(index));
   await p.evaluate(()=>document.querySelector('.mage-scene').getAnimations({subtree:true}).forEach(a=>{a.currentTime=Number(a.effect.getTiming().duration)*.65;a.pause();}));
  }
  for(const element of ['air','earth','water','fire']){
   await show('attack',element);assert.equal(await p.locator(`[data-public-frame]:visible .mage-attack-${element}`).count()>0,true,element+' has its own effect');assert(await p.locator('[data-public-frame]:visible .mage-attacks').evaluate(el=>Number(getComputedStyle(el).zIndex)>Number(getComputedStyle(el.parentElement.querySelector('.mage-pieces')).zIndex)));
   if(element==='fire'){
    const ownership=await p.evaluate(()=>{const h=document.querySelector('#app'),display=h.querySelector('[data-public-display]'),marker=document.createElement('span');marker.dataset.ownedEffect='true';display.append(marker);const s=mageEffectFixture.s,E=TabletopCore;PlayroomGameScreen.update(h,PlayroomGameScreen.render({layoutId:'effects:attackfire',gameName:'Битва магов',state:E.project(s,-1),viewer:-1,actions:[],scene:PlayroomViews.render(E.project(s,-1),-1,[],{surface:'table'})}));PlayroomPublicSequence.bind(h);const retained=marker.isConnected&&marker.parentElement===h.querySelector('[data-public-display]');marker.remove();return retained;});
    assert(ownership,'public player retains its live effect subtree across a passive shell patch');
   }
   if(!process.env.MAGE_SKIP_SCREENSHOTS)await p.screenshot({path:mageEvidence(`attack-${element}.png`)});
  }
  for(const element of ['air','water','fire']){
   await show('move',element);assert.equal(await p.locator('[data-public-frame]:visible .mage-trail').count(),1);assert.equal(await p.locator('[data-public-frame]:visible .mage-moving').count(),1);
   const geometry=await p.locator('[data-public-frame]:visible .mage-piece[data-mage-player="0"]').evaluate(el=>({width:el.getBoundingClientRect().width,left:el.offsetLeft,grid:el.closest('.mage-grid').getBoundingClientRect().width}));assert(geometry.width>10&&geometry.width<geometry.grid/3);
  }
  for(const kind of ['damage','death','fall','shrink']){
   await show(kind,kind==='fall'?'air':kind==='damage'?'water':'earth');
   const status=kind==='damage'?'damage':kind==='death'?'death':'fall';
   assert.equal(await p.locator(`[data-public-frame]:visible .mage-token[data-public-feedback~="${status}"]`).count(),1);
   assert.equal(await p.locator(`.player-panel[data-player-index="1"][data-public-feedback~="${status}"]`).count(),1);
   if(kind==='death'||kind==='fall')assert.equal(await p.locator('.player-panel[data-player-index="0"][data-public-feedback~="killer"]').count(),1);
   if(kind==='fall'){const out=await p.evaluate(()=>mageEffectFixture.s.data.frames.flatMap(f=>f.outcomes||[]).find(o=>o.fall));assert.deepEqual(out.at,[1,4]);}
   const expected=await p.evaluate(()=>{const f=mageEffectFixture.s.data.frames.find(f=>f.outcomes?.some(o=>o.player===1));return f.players[1];});
   const token=p.locator('[data-public-frame]:visible .mage-piece[data-mage-player="1"] [data-mage-token-health]');assert.equal(await token.locator('.piece-indicator').count(),3);assert.equal(await token.locator('.piece-indicator:not(.is-empty)').count(),expected.health,kind+' token matches public HP');
   const panel=p.locator('.player-panel[data-player-index="1"]');assert.equal(await panel.locator('.token-heart .counter-token:not(.is-empty)').count(),expected.health,kind+' health follows damage frame');assert.equal(await panel.locator('.token-meeple .counter-token:not(.is-empty)').count(),expected.lives>1?1:0);assert.equal(await panel.locator('.player-avatar-label').count(),expected.ultimate>0?1:0);
   if(!process.env.MAGE_SKIP_SCREENSHOTS)await p.screenshot({path:mageEvidence(`${kind}.png`)});
   for(let i=0;i<30;i++){await p.evaluate(()=>{for(const a of document.getAnimations())if(Number.isFinite(a.effect.getTiming().iterations)&&['running','paused'].includes(a.playState))a.finish();});await p.clock.runFor(1000);await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(await p.locator('.player-panel[data-public-feedback]:not([data-public-feedback=""])').count(),0,'feedback clears on live frame');
   assert(await p.evaluate(()=>JSON.stringify(mageEffectFixture.s)===mageEffectFixture.bytes));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Mage Brawl stacked counters: lost lives, crown counts, layers and results',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-counters-owner',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({tutorialsEnabled:false,animationSpeed:'instant'}));});await openMageFixture(p,server.url);if(await p.locator('#profile-form').count()){await p.locator('#profile-form [name=playerName]').fill('Иван');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());}await p.locator('[data-start="mage-brawl"]').click();await p.locator('[data-game-mode=hotseat]').click();await p.locator('[data-command=lobby-start]').click();await p.locator('.mage-grid').waitFor();
 await p.evaluate(()=>{const E=TabletopCore,s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:Array.from({length:8},(_,i)=>({name:['Иван','Алиса','Борис','Мария','Артём','Ольга','Лев','Ника'][i],bot:i>0,botSettings:{difficulty:['easy','medium','hard'][Math.max(0,i-1)%3]},isHost:i===0,network:true}))});Object.assign(s.data.players[0],{health:1,lives:1,ultimate:4});window.tokenState=s;const state=E.project(s,0),actions=E.legalActions(s,0),host=document.querySelector('#app');Object.assign(state.players[0],{isHost:true,network:true});Object.assign(state.players[7],{bot:false,local:true,primary:false});PlayroomViews.get('mage-brawl').render(state,0,actions,{});PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'tokens',gameName:'Битва магов',state,viewer:0,actions,scene:PlayroomViews.render(state,0,actions,{})}));PlayroomGameScreen.layoutScene(host);});
 const own=p.locator('.player-panel[data-player-index="0"]');assert.equal(await own.locator('.token-meeple .is-empty').count(),1);assert.equal(await own.locator('.token-crown .counter-token').count(),0);assert.equal(await own.locator('.player-avatar-label').innerText(),'×4');assert.equal(await own.locator('.avatar-host-crown').count(),0);assert.equal(await own.locator('.avatar.is-host-avatar').evaluate(n=>getComputedStyle(n).outlineColor),'rgb(215, 173, 67)');assert.equal(await own.locator('.avatar.is-host-avatar').evaluate(n=>getComputedStyle(n).outlineWidth),'2px');assert.equal(await own.locator('.player-avatar-label').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(228, 196, 89)');assert.equal(await own.locator('.player-avatar-label.is-center').count(),0);assert.deepEqual(await own.locator('.player-scores').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','lives','health']);
 assert(await own.locator('.token-meeple .is-empty').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).fill==='rgb(255, 255, 255)')));
 for(const [index,difficulty] of [[1,'easy'],[2,'medium'],[3,'hard']])assert.equal(await p.locator(`.player-panel[data-player-index="${index}"] .avatar [data-ui-icon="bot-${difficulty}"]`).count(),1);
 assert.equal(await p.locator('.player-heading .participant-role').count(),0);
 assert.equal(await p.locator('.player-panel[data-player-index="7"] .avatar.is-hotseat-avatar [data-ui-icon=hand]').count(),1);
 const hearts=await own.locator('.token-heart .counter-token').evaluateAll(ns=>ns.map(n=>({z:+getComputedStyle(n).zIndex,fill:getComputedStyle(n).fill,stroke:getComputedStyle(n).stroke,x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width})));
 assert(hearts[0].z>hearts[1].z);assert.equal(hearts[1].fill,'rgb(255, 255, 255)');assert.notEqual(hearts[0].fill,hearts[0].stroke);assert(Math.abs(hearts[1].x-hearts[0].x-hearts[0].w*.46)<.1);
 for(const viewport of [{width:384,height:782},{width:797,height:339},{width:384,height:782}]){
  await p.setViewportSize(viewport);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  if(viewport.width<viewport.height)assert.equal(await p.locator('.app-game-layout').evaluate(n=>getComputedStyle(n).getPropertyValue('--focus-player-columns').trim()),'3');
  const overflow=await p.locator('.player-panel .player-scores').evaluateAll(nodes=>nodes.filter(n=>{const i=n.closest('.player-info').getBoundingClientRect();return n.getBoundingClientRect().right>i.right-4.5}).map(n=>({info:n.closest('.player-info').getBoundingClientRect().toJSON(),scores:n.getBoundingClientRect().toJSON(),items:[...n.children].map(c=>({w:c.getBoundingClientRect().width,id:c.dataset.scoreId||'hand',gap:getComputedStyle(c).gap}))})));assert.equal(overflow.length,0,JSON.stringify(overflow));
  const cards=await p.locator('.player-panel').evaluateAll(nodes=>nodes.map(n=>{const box=e=>e.getBoundingClientRect(),a=box(n.querySelector('.player-avatar-wrap')),h=box(n.querySelector('.player-heading')),d=box(n.querySelector('.player-data')),i=box(n.querySelector('.player-info'));return {avatar:a.width,nameX:h.x,dataX:d.x,avatarRight:a.right,nameBottom:h.bottom,dataTop:d.top,padding:getComputedStyle(n.querySelector('.player-info')).padding,left:a.x-i.x,height:i.height}}));
  assert.equal(cards.length,8);assert(cards.every(c=>c.avatar===30&&c.nameX>=c.avatarRight&&c.dataX===c.nameX&&c.nameBottom<=c.dataTop&&c.padding===cards[0].padding&&c.left===cards[0].left&&c.height===cards[0].height),JSON.stringify(cards));
 }
 const out=path.resolve(root,process.env.MAGE_TOKEN_SCREENSHOTS||'../tmp_files/mage-brawl/stacked-tokens-2026-10-23');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'game.png')});
 await p.evaluate(()=>{const s=tokenState,E=TabletopCore;Object.assign(s.data.players[1],{health:0,lives:0,pos:null,eliminatedRound:1});E.complete(s,[0]);document.querySelector('#app').innerHTML=PlayroomGameScreen.resultMarkup({state:E.project(s,0),viewer:0,gameName:'Битва магов'});});
 const row=p.locator('.result-person').filter({has:p.locator('.result-nickname',{hasText:'Иван'})});assert.deepEqual(await row.locator('.result-core-counters').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills','ultimate','lives','health']);assert.equal(await row.locator('.token-crown .counter-token').count(),4);assert.equal(await row.locator('.token-meeple .is-empty').count(),1);
 for(const scope of [row]){
  assert(await scope.locator(':is(.token-heart,.token-meeple) .is-empty').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).fill==='rgb(255, 255, 255)')));
  const crowns=await scope.locator('.token-crown .counter-token').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right})));
  assert(crowns.every((n,i)=>!i||n.x>=crowns[i-1].right),'crowns do not overlap');
 }
 await p.screenshot({path:path.join(out,'results.png')});assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Mage tooltip 0.21: held card shows only its current action and oriented scheme',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',offline:!!process.env.MAGE_TOOLTIP_ARTIFACT&&process.env.MAGE_TOOLTIP_ENGINE!=='webkit'}),page=await context.newPage(),errors=[],webkit=process.env.MAGE_TOOLTIP_ENGINE==='webkit';
 const sync=require('./account-sync-fixture.cjs'),provider=await sync.installFetch(context,sync(async route=>route.fulfill({status:200,json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}})));
 await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-tooltip-local',name:'Анна',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,autoPass:false}));});
 const blockedExternalRequests=[];if(process.env.MAGE_TOOLTIP_ARTIFACT&&webkit)await context.route(/^https?:\/\//,route=>{blockedExternalRequests.push(route.request().url());return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 let cdp;
 try{
  await page.goto(process.env.MAGE_TOOLTIP_ARTIFACT?'file://'+process.env.MAGE_TOOLTIP_ARTIFACT:server.url);await page.locator('[data-start="mage-brawl"]').click();await page.locator('[data-game-mode="hotseat"]').click();await page.locator('[data-command="lobby-start"]').click();await page.locator('.mage-grid').waitFor();
  if(await page.locator('[data-command="unlock"]').count())await page.locator('[data-command="unlock"]').click();
  const packVersion=await page.evaluate(()=>PlayroomAppBridge.room().game.version),expectedVersion=JSON.parse(fs.readFileSync(path.join(root,'packs/mage-brawl/manifest.json'),'utf8')).version;assert.equal(packVersion,expectedVersion,'actual game uses the exact prepared companion');
  if(!webkit)cdp=await context.newCDPSession(page);
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const held=async(card,check)=>{
   const box=await card.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
   else await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:31,isPrimary:true,clientX:x,clientY:y,buttons:1});
   const tip=page.locator('#playroom-context-tooltip');await tip.waitFor({state:'visible'});await frames();await check(tip);
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   else {await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:31,isPrimary:true,clientX:x,clientY:y,buttons:0});await card.dispatchEvent('click',{detail:1});}
   await tip.waitFor({state:'hidden'});
  };
  const report={engine:webkit?'webkit':'chromium',holdInput:webkit?'controlled PointerEvents':'native CDP touch',states:[],errors,packVersion,blockedExternalRequests,offlineMode:webkit?'HTTP(S) routes blocked; file navigation uses normal context':'native context offline'};
  if(process.env.MAGE_TOOLTIP_ARTIFACT)report.artifact={path:process.env.MAGE_TOOLTIP_ARTIFACT,sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(process.env.MAGE_TOOLTIP_ARTIFACT)).digest('hex')};
  for(const action of ['movement','attack'])for(const direction of [0,1,2,3]){
   await page.locator(`[data-view-key="mageAction"][data-view-value="${action}"]`).click();const currentDirection=()=>page.locator('.mage-hand .mage-card').first().evaluate(el=>((parseFloat(el.style.getPropertyValue('--mage-direction'))/90)%4+4)%4);
   for(let step=0;step<4&&await currentDirection()!==direction;step++)await page.locator('.mage-hand-row > .mage-rotate').last().click();
   assert.equal(await currentDirection(),direction,'native quarter-turn buttons reach the requested orientation');
   const card=page.locator('.mage-hand .mage-card:not(:disabled)').first();
   await held(card,async tip=>{
    assert.equal(await tip.locator('.playroom-tooltip-title').innerText(),await card.getAttribute('data-tooltip-title'));
    assert.equal(await tip.locator(':scope > span').innerText(),await card.getAttribute('data-tooltip'));
    assert.equal(await tip.locator('.mage-action-diagram').count(),1);assert.equal(await tip.locator('.mage-action-diagram > g').getAttribute('transform'),`rotate(${direction*90} 50 50)`);
    assert(!/action-help\.|Движение:.*Атака:|Ультимейт:/.test(await tip.innerText()),'one current action, no combined element manual');
    const bounds=await tip.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844,'tooltip stays inside portrait');
    report.states.push({action,direction,title:await tip.locator('strong').innerText()});
    if(action==='movement'&&direction===0){const out=path.resolve(root,'../tmp_files/ux-021/owner-iteration03/mage-tooltip');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,(webkit?'webkit':'chromium')+'-portrait.png')});}
   });
  }
  await page.setViewportSize({width:844,height:390});await frames();
  await held(page.locator('.mage-hand .mage-card:not(:disabled)').first(),async tip=>{const b=await tip.boundingBox();assert(b.x>=0&&b.y>=0&&b.x+b.width<=844&&b.y+b.height<=390);const out=path.resolve(root,'../tmp_files/ux-021/owner-iteration03/mage-tooltip');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,(webkit?'webkit':'chromium')+'-landscape.png')});});
  assert.equal(provider.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
  const out=path.resolve(root,'../tmp_files/ux-021/owner-iteration03/mage-tooltip');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,(webkit?'webkit':'chromium')+'-report.json'),JSON.stringify(report,null,2));
 }finally{await cdp?.detach();await context.close();await browser.close();await server.close();}
});

test('Mage local choices reuse projections and keep one physical board across an eight-player round',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference',serviceWorkers:'block'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.stack));const report={samples:[],rotation:[],errors};
 try{await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-pointwise',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast',tutorialsEnabled:false}))});await openMageFixture(p,server.url);await p.locator('.game-tile').first().waitFor();await p.evaluate(async()=>{const E=TabletopCore,s=new TabletopSession(E,'mage-brawl',{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,actionsPerTurn:'1',players:Array.from({length:8},(_,i)=>({name:'Игрок '+i,bot:i>0}))});for(let actor=1;actor<8;actor++){const action=E.legalActions(s.current,actor).find(a=>a.type==='plan');if(!action)throw Error('no fixture plan');s.act(actor,action)}await PlayroomAppBridge.saveLibrary.activateAsync(s,'mage-pointwise')});await p.reload();await p.locator('[data-hub-page=sessions]').click();await p.locator('.saved-game[data-saved-actions-toggle]').first().click();await p.locator('[data-resume-id]:visible').first().click();await p.locator('.mage-card').first().waitFor();
 await p.evaluate(()=>{window.mageStableCell=document.querySelector('.mage-cell');window.mageStableCard=document.querySelector('.mage-card');window.mageProjectCalls=0;const original=TabletopCore.project;TabletopCore.project=function(...args){mageProjectCalls++;return original.apply(this,args)}});
 for(const index of [1,2,3,0])report.samples.push(await p.evaluate(async index=>{const cards=document.querySelectorAll('.layout-hand .mage-card'),start=performance.now();cards[index%cards.length].click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {elapsed:performance.now()-start,projectCalls:mageProjectCalls,sameCell:mageStableCell===document.querySelector('.mage-cell'),sameCard:mageStableCard===document.querySelector('.mage-card'),boards:document.querySelectorAll('.mage-grid').length,nodes:document.querySelectorAll('*').length};},index));assert(report.samples.every(s=>s.sameCell&&s.sameCard&&s.boards===1));assert.equal(report.samples.at(-1).projectCalls,0,'view choices do not reproject the same immutable position');
 for(const viewport of [{width:844,height:390},{width:390,height:844},{width:844,height:390}]){const start=Date.now();await p.setViewportSize(viewport);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const value=await p.evaluate(()=>{const stage=document.querySelector('.app-game-layout'),field=document.querySelector('.mage-grid').getBoundingClientRect(),self=document.querySelector('.layout-self').getBoundingClientRect(),opponent=document.querySelector('.layout-participants .player-panel').getBoundingClientRect();return {width:innerWidth,height:innerHeight,field:field.toJSON(),self:self.toJSON(),opponent:opponent.toJSON(),boards:document.querySelectorAll('.mage-grid').length,sameCell:mageStableCell===document.querySelector('.mage-cell')}});value.elapsed=Date.now()-start;report.rotation.push(value);assert.equal(value.boards,1);assert(value.sameCell);}
 const before=await p.locator('.mage-grid').boundingBox();await p.locator('.mage-ready:not(:disabled)').click();await p.waitForFunction(()=>JSON.parse(document.querySelector('[data-public-sequence]').dataset.presentationPlan).final>0);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const after=await p.locator('.mage-grid').boundingBox();report.round={before,after,scene:await p.evaluate(()=>({phase:document.querySelector('.mage-scene')?.className,stage:document.querySelector('.app-game-layout')?.getAttribute('style'),scene:document.querySelector('.scene')?.getBoundingClientRect().toJSON(),field:document.querySelector('.layout-field')?.getBoundingClientRect().toJSON(),grid:document.querySelector('.mage-grid')?.getAttribute('style'),hand:document.querySelector('.layout-hand')?.getBoundingClientRect().toJSON(),self:document.querySelector('.layout-self')?.getBoundingClientRect().toJSON()}))};assert.equal(await p.locator('.mage-grid').count(),1);assert.equal(await p.locator('[data-public-frame]').count(),1);assert(await p.evaluate(()=>mageStableCell===document.querySelector('.mage-cell')));assert(Math.abs(before.x-after.x)<2&&Math.abs(before.y-after.y)<2&&Math.abs(before.width-after.width)<2,'round playback keeps the allocated board square');await p.waitForFunction(()=>!document.querySelector('.is-public-playback'),null,{timeout:20000});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));report.completed=await p.evaluate(()=>({field:document.querySelector('.mage-grid').getBoundingClientRect().toJSON(),hand:document.querySelector('.layout-hand').getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll('.layout-hand .mage-card')].map(n=>n.getBoundingClientRect().toJSON()),boards:document.querySelectorAll('.mage-grid').length,nodes:document.querySelectorAll('*').length,geometry:PlayroomGameScreen.geometryMetrics(document.querySelector('#app'))}));assert.equal(report.completed.boards,1);assert(report.completed.cards.every(c=>c.width>=38),'next-round hand retains usable card size');assert(Math.abs(report.completed.field.x-before.x)<2&&Math.abs(report.completed.field.width-before.width)<2,'final phase preserves field allocation');assert.deepEqual(errors,[]);if(process.env.MAGE_EVIDENCE_DIR)await p.screenshot({path:mageEvidence('mage-eight-pointwise.png')});
 }finally{if(process.env.MAGE_EVIDENCE_DIR)fs.writeFileSync(mageEvidence('mage-pointwise-report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();await server.close()}
});

test('local drafts stay in RAM and closing the memo does not announce changed settings',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage();
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'checkpoint-local',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',tutorialsEnabled:false}));});await openMageFixture(p,server.url);await p.locator('.game-tile').first().waitFor();
  await p.evaluate(async()=>{const s=new TabletopSession(TabletopCore,'mage-brawl',{seed:17,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0,actionsPerTurn:'2',players:[{name:'A'},{name:'B'}]});await PlayroomAppBridge.saveLibrary.activateAsync(s,'checkpoint-local');});await p.reload();await p.locator('[data-hub-page=sessions]').click();await p.locator('.saved-game[data-saved-actions-toggle]').first().click();await p.locator('[data-resume-id]:visible').first().click();await p.locator('[data-command=unlock]').click();await p.locator('.mage-ready:not([disabled])').waitFor();
  await p.evaluate(()=>{window.localCheckpointWrites=0;window.localOptionEvents=0;const library=PlayroomAppBridge.saveLibrary,write=library.writeAsync;library.writeAsync=function(...args){localCheckpointWrites++;return write.apply(this,args);};window.addEventListener('playroom:game-options',()=>localOptionEvents++);});
  await p.locator('.mage-rotate').last().click();assert.equal(await p.evaluate(()=>localCheckpointWrites),0);await p.locator('.mage-ready:not([disabled])').click();await p.locator('.mage-plan-locked').waitFor();assert.equal(await p.evaluate(()=>localCheckpointWrites),0);
  await p.locator('.mage-hand [data-command=card-help]').click();assert.equal(await p.locator('.mage-memo-table tbody tr').count(),4);assert(await p.locator('.mage-memo-table tbody td').evaluateAll(cells=>cells.every(td=>getComputedStyle(td.querySelector('svg')).color===getComputedStyle(td).color)));await p.locator('#modal-root [data-command=close-modal]').click();assert.equal(await p.evaluate(()=>localOptionEvents),0);
  await p.locator('.mage-card:not([disabled])').last().click();await p.locator('.mage-ready:not([disabled])').click();assert.equal(await p.evaluate(()=>localCheckpointWrites),1);
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage room choices and playback reuse viewport geometry until an actual resize',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},isMobile:true,hasTouch:true,serviceWorkers:'block'}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.stack));
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-room-geometry',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast',tutorialsEnabled:false}));});await openMageFixture(p,server.url);await p.evaluate(()=>{const mount=PlayroomSharedViews.mount,render=PlayroomViews.render;PlayroomSharedViews.mount=function(client,...args){window.mageRoomClient=client;return mount.call(this,client,...args);};window.mageStaleRenders=[];window.mageFrameBuilds=[];PlayroomViews.render=function(state,...args){if(window.mageRoomClient&&state.move<mageRoomClient.snapshot.revision)mageStaleRenders.push({revision:state.move,latest:mageRoomClient.snapshot.revision,round:state.scene?.round?.number});const value=render.call(this,state,...args);for(const source of args[2]?.regionSink?.publicFrames?.values()||[]){const build=source.render;source.render=index=>{mageFrameBuilds.push({index,from:Number(document.querySelector('[data-public-display]')?.dataset.publicFrame)});return build(index);};}return value;};const start=PlayroomHostSessionService.prototype.start;PlayroomHostSessionService.prototype.start=function(room,options){return start.call(this,{...room,rules:{...room.rules,options:{...room.rules.options,seed:17}}},options);};});await p.locator('[data-start=mage-brawl]').click();await p.locator('[data-game-mode=network]').click();await p.locator('[data-room-auto-start]').uncheck();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(let i=2;i<=8;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+i,{kind:'bot',nickname:'Бот '+i});b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'2'}});b.renderLobby();});await p.locator('[data-command=lobby-ready]').click();await p.locator('[data-command=lobby-start]').click();await p.waitForFunction(()=>document.querySelectorAll('.layout-participants .player-panel.is-ready').length===7);
  await p.evaluate(()=>{const viewport=visualViewport;let proto=viewport,descriptor;while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,'scale');proto=Object.getPrototypeOf(proto);}if(!descriptor?.get)throw Error('Native viewport scale getter required');const read=descriptor.get;window.mageViewportReads=0;window.mageEarlyAnimationReads=0;const getAnimations=Element.prototype.getAnimations;Element.prototype.getAnimations=function(...args){if(new Error().stack.includes('paintFrame'))mageEarlyAnimationReads++;return getAnimations.apply(this,args);};window.mageBoard=document.querySelector('.mage-cell');Object.defineProperty(viewport,'scale',{configurable:true,get(){if(new Error().stack.includes('geometryViewport'))mageViewportReads++;return read.call(viewport);}});});
  for(const direction of [1,2,3,4])await p.locator(`[data-view-key=mageDirection][data-view-value="${direction}"]`).click();
  assert.equal(await p.evaluate(()=>mageViewportReads),0,'local choices must not force a viewport measurement after DOM writes');
  await p.locator('.mage-ready:not([disabled])').click();await p.locator('.mage-card:not([disabled])').last().click();await p.locator('.mage-ready:not([disabled])').click();await p.waitForFunction(()=>document.querySelector('.is-public-playback'));await p.waitForFunction(()=>!document.querySelector('.is-public-playback'),null,{timeout:30000});
  const prepared=await p.evaluate(()=>mageFrameBuilds.filter(f=>f.index>0));assert(prepared.length>2,'future frames are prepared incrementally');assert(prepared.every(f=>f.index===f.from+1),'prepare only the next frame during the current animation');assert.equal(new Set(prepared.map(f=>f.index)).size,prepared.length,'passive updates reuse prepared frames');assert.equal(await p.locator('[data-public-frame-bank]').count(),0,'live SDK rendering does not serialize the whole round into DOM');
  assert.equal(await p.evaluate(()=>mageViewportReads),0,'public player patches reuse the same viewport measurement');assert.equal(await p.evaluate(()=>mageEarlyAnimationReads),0,'animation reads follow both field and player writes');assert.equal(await p.evaluate(()=>mageStaleRenders.filter(r=>r.round===2&&r.revision>16).length),0,'queued private planning updates do not repaint the completed public round');assert(await p.evaluate(()=>mageBoard===document.querySelector('.mage-cell')));assert.equal(await p.locator('.mage-grid').count(),1);
  assert.equal(await p.locator('.mage-hand>.mage-order-hint,.layout-auxiliary>.mage-order-hint').count(),0,'order legend is available in help instead of consuming scene height');
  await p.locator('.mage-hand [data-command=card-help]').click();assert.equal(await p.locator('#modal-root .mage-memo-order svg').count(),1,'memo retains the order diagram');await p.locator('#modal-root [data-command=close-modal]').click();
  await p.setViewportSize({width:797,height:260});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const roster=await p.locator('.layout-participants').evaluate(node=>{
   const panels=node.querySelector('.players-panels'),cards=panels.querySelectorAll('.player-panel'),style=getComputedStyle(node);
   node.scrollTop=node.scrollHeight;const box=node.getBoundingClientRect(),last=cards[cards.length-1].getBoundingClientRect();
   return {columns:getComputedStyle(panels).gridTemplateColumns.split(' ').length,count:cards.length,overflow:style.overflowY,scrollTop:node.scrollTop,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,lastVisible:last.top>=box.top-1&&last.bottom<=box.bottom+1};
  });
  assert.equal(roster.columns,2);assert.equal(roster.count,7);assert.equal(roster.overflow,'auto');assert(roster.scrollHeight>roster.clientHeight&&roster.scrollTop>0&&roster.lastVisible,'every opponent remains reachable in the short landscape scrollport: '+JSON.stringify(roster));
  await p.setViewportSize({width:797,height:339});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await p.evaluate(()=>mageViewportReads>0),'resize refreshes the viewport measurement');const reads=await p.evaluate(()=>mageViewportReads);await p.setViewportSize({width:384,height:782});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await p.evaluate(n=>mageViewportReads>n,reads),'return to portrait refreshes geometry again');assert(await p.evaluate(()=>mageBoard===document.querySelector('.mage-cell')));assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage respawn remount reserves the player hand before fitting the arena',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'respawn-layout',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});
  await openMageFixture(p,server.url);await p.locator('[data-start=mage-brawl]').waitFor();
  await p.evaluate(()=>{
   const E=TabletopCore;window.respawnState=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'2',players:Array.from({length:8},(_,i)=>({name:'Игрок '+i}))});
   const s=respawnState,d=s.data,own=d.players[0];d.discard.push(...own.hand);own.hand=[];own.pos=null;own.health=0;own.lives=1;d.phase='respawn';d.respawn=[0];d.pendingDraw=[0];d.round=8;s.turn=0;E.validateState(s);
   window.drawRespawn=(fresh=false)=>{
    let host=document.querySelector('#app');if(fresh){const next=document.createElement('div');next.id='app';host.replaceWith(next);host=next;}
    const viewer=window.respawnViewer??0,state=E.project(respawnState,viewer),actions=E.legalActions(respawnState,viewer);
    let scene=PlayroomViews.render(state,viewer,actions,{});
    // An independently disappearing context row must not leave its height on
    // the hand when the generic patcher reuses the section node.
    if(window.respawnContextRow&&respawnState.data.phase==='respawn')scene=scene.replace('<section class="game-layout-slot layout-hand"','<section class="game-layout-slot layout-actions"><div class="scene-actions"><button disabled>Выберите базу</button></div></section><section class="game-layout-slot layout-hand"');
    PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'respawn-regression',gameName:E.get('mage-brawl').name,state,viewer,actions,scene}));PlayroomGameScreen.layoutScene(host);
   };
   drawRespawn(true);
  });
  const measure=()=>p.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout'),rect=selector=>{const node=stage.querySelector(selector);return node?node.getBoundingClientRect().toJSON():null;};
   return {field:rect('.layout-field'),board:rect('.mage-grid'),hand:rect('.layout-hand'),self:rect('.layout-self'),info:rect('.self-player'),hasHand:stage.dataset.hasHand,cards:[...stage.querySelectorAll('.layout-hand .mage-card')].map(n=>n.getBoundingClientRect().toJSON())};
  });
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:844},{width:390,height:844,context:true}]){
   await p.setViewportSize({width:viewport.width,height:viewport.height});await p.evaluate(extra=>{window.respawnContextRow=!!extra;drawRespawn(true);},viewport.context);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const before=await measure();assert(before.hand&&before.hand.height>60,'fresh respawn must reserve the hand zone: '+JSON.stringify(before));assert.equal(before.hasHand,'true');assert.equal(before.cards.length,0,'reserve contains no old cards');assert(before.board.top>=before.field.top-1&&before.board.bottom<=before.field.bottom+1,'arena stays inside field');
   if(process.env.MAGE_EVIDENCE_DIR)await p.screenshot({path:mageEvidence('respawn-empty-'+viewport.width+(viewport.context?'-context':'')+'.png')});
   await p.evaluate(()=>{window.savedRespawn=TabletopCore.clone(respawnState);const action=TabletopCore.legalActions(respawnState,0)[0];if(action.type!=='respawn')throw Error('fixture must choose a base');respawnState=TabletopCore.applyAction(respawnState,0,action);drawRespawn();});
   const after=await measure();assert(after.cards.length>=3);assert(Math.abs(after.field.y-before.field.y)<2&&Math.abs(after.field.height-before.field.height)<2,'base choice keeps field allocation: '+JSON.stringify({before,after}));assert(after.cards.every(c=>c.top>=after.hand.top-1&&c.bottom<=after.hand.bottom+1&&c.bottom<=after.info.top+1&&c.bottom<=viewport.height),'returned hand is fully visible in player zone: '+JSON.stringify({viewport,before,after}));
   if(process.env.MAGE_EVIDENCE_DIR)await p.screenshot({path:mageEvidence('respawn-'+viewport.width+'.png')});await p.evaluate(()=>{respawnState=savedRespawn;});
  }
  // Loot temporarily replaces the hand too, including a fresh mount.
  await p.evaluate(()=>{
   respawnState=TabletopCore.createGame('mage-brawl',{seed:17,actionsPerTurn:'2',players:Array.from({length:8},(_,i)=>({name:'Игрок '+i}))});
   const d=respawnState.data,p=d.players[0],cards=p.hand;p.hand=[];p.pos=null;p.health=0;p.lives=1;d.loot=[{victim:0,cards,recipients:[1]}];d.phase='loot';d.respawn=[0];respawnState.turn=1;window.respawnViewer=1;window.respawnContextRow=false;TabletopCore.validateState(respawnState);drawRespawn(true);
  });
  const loot=await measure();assert(loot.hand&&loot.hand.height>60);assert.equal(loot.cards.length,0,'loot reserve contains no private hand markup');assert.equal(await p.locator('.mage-loot-hand button').count(),1);
  await p.evaluate(()=>{const E=TabletopCore;respawnState=E.applyAction(respawnState,1,E.legalActions(respawnState,1)[0]);drawRespawn();});
  const reward=await measure();assert(reward.cards.length>=4);assert(Math.abs(reward.field.height-loot.field.height)<2);assert(reward.cards.every(c=>c.bottom<=reward.info.top+1&&c.bottom<=844),'reward hand remains visible inside its player zone');
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('Mage team reserves and shrink indicator: one to four corners, warning glow and responsive cards',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const out=path.resolve(process.env.MAGE_EVIDENCE_DIR||path.join(root,'../tmp_files/mage-teams-1113/screenshots'));fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(7000);
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'shrink-ui',name:'Иван'}));localStorage.setItem('playroom.settings.v1',JSON.stringify({tutorialsEnabled:false,sound:false,animationSpeed:'fast'}));});
  await openMageFixture(p,server.url);await TestUI.ready(p);await TestUI.openGame(p,'mage-brawl');await TestUI.activeSurface(p).locator('[data-command=lobby-start]').click();await p.locator('.mage-grid').waitFor();
  await p.evaluate(()=>{
   const E=TabletopCore;window.shrinkState=E.createGame('mage-brawl',{seed:17,preset:'teams',actionsPerTurn:'1',extraLives:'1',shrinkMode:'lives',players:Array.from({length:8},(_,i)=>({name:['Иван','Анна','Борис','Лена','Лев','Ника','Марк','Оля'][i],bot:i>0}))});
   window.showShrink=(filled,scheduled=false,extraLives=1,teamLives=null)=>{const s=E.clone(shrinkState);s.data.config.extraLives=extraLives;s.data.teamLives=teamLives||[4*extraLives,4*extraLives];s.data.lostLives=filled;s.data.shrink=scheduled?s.data.round:null;const state=E.project(s,0),actions=E.legalActions(s,0),host=document.querySelector('#app');PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'shrink-evidence',gameName:'Стихийная потасовка',state,viewer:0,actions,scene:PlayroomViews.render(state,0,actions,{})}));PlayroomGameScreen.layoutScene(host);};
  });
  const records=[];
  for(const filled of [1,2,3,4]){
   await p.evaluate(n=>showShrink(n),filled);const own=p.locator('.self-player');await own.locator(`.mage-shrink-counter[data-shrink-filled="${filled}"]`).waitFor();
   assert.equal(await own.locator('.mage-shrink-corner.is-filled').count(),filled);assert.equal(await own.locator('.mage-shrink-corner:not(.is-filled)').count(),4-filled);
   assert.equal(await own.locator('.mage-team-full .counter-token:not(.is-empty)').count(),8);assert.equal(await p.locator('.opponent-hand .mage-team-lives').count(),0);assert.equal(await p.locator('.player-panel .token-meeple').count(),0,'shared reserve is not repeated as personal lives');
   await own.screenshot({path:path.join(out,`indicator-${filled}.png`)});if(filled===3)await p.screenshot({path:path.join(out,'team-game.png')});
   records.push({filled,aria:await own.locator('.mage-shrink-counter').getAttribute('aria-label')});
  }
  await p.evaluate(()=>showShrink(4,true));const warning=p.locator('.self-player .mage-shrink-counter');
  const glow=await warning.evaluate(e=>{const a=e.getAnimations()[0];if(!a)throw Error('Warning animation missing');a.pause();a.currentTime=1400;return {animation:getComputedStyle(e).animationName,filter:getComputedStyle(e).filter};});assert.equal(glow.animation,'mage-shrink-warning');assert.notEqual(glow.filter,'none');await p.locator('.self-player').screenshot({path:path.join(out,'indicator-warning.png')});
  await p.evaluate(()=>showShrink(2));
  const own=p.locator('.self-player'),geometry=()=>own.evaluate(e=>{const mark=e.querySelector('.mage-shrink-counter').getBoundingClientRect(),status=e.querySelector('.player-status').getBoundingClientRect(),team=e.querySelector('.mage-team-lives').getBoundingClientRect();return {counterX:mark.x,right:mark.right,statusRight:status.right,teamRight:team.right,teamWidth:team.width,score:[...e.querySelectorAll('.mage-team-score b')].map(n=>{const r=n.getBoundingClientRect();return r.x+r.width/2;})};});
  const before=await geometry();assert(Math.abs(before.right-before.statusRight)<1);assert(before.teamRight<before.counterX);assert.notEqual(await own.locator('.mage-shrink-center').evaluate(n=>getComputedStyle(n).stroke),'none');await own.screenshot({path:path.join(out,'team-lives-full.png')});
  await p.evaluate(()=>showShrink(2,false,1,[1,2]));assert.equal(await own.locator('.mage-team-full .counter-token').count(),8);assert.equal(await own.locator('.mage-team-full .counter-token.is-empty').count(),5);assert.deepEqual(await geometry(),before,'spent reserves keep slots and score columns fixed');assert.deepEqual(await own.locator('.mage-team-score b').allTextContents(),['1','2']);await own.screenshot({path:path.join(out,'team-lives-spent.png')});
  for(const extraLives of [0,2]){await p.evaluate(n=>showShrink(n+1,false,n),extraLives);const mark=p.locator('.self-player .mage-shrink-counter');assert.equal(await mark.getAttribute('data-shrink-capacity'),String(2*(extraLives+1)));assert.equal(await mark.locator('.mage-shrink-corner.is-filled').count(),extraLives+1);await p.locator('.self-player').screenshot({path:path.join(out,`indicator-capacity-${2*(extraLives+1)}.png`)});}
  await p.evaluate(()=>showShrink(4,true));
  for(const viewport of [{width:320,height:740},{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(viewport);await p.evaluate(()=>PlayroomGameScreen.layoutScene(document.querySelector('#app')));const overflow=await p.locator('.player-status').evaluateAll(ns=>ns.filter(n=>{const card=n.closest('.player-panel').getBoundingClientRect(),r=n.getBoundingClientRect();return r.right>card.right+1||r.left<card.left-1;}).map(n=>n.outerHTML));assert.deepEqual(overflow,[],JSON.stringify(viewport));await p.screenshot({path:path.join(out,`team-${viewport.width}x${viewport.height}.png`)});}
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await warning.evaluate(e=>getComputedStyle(e).animationName),'none');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({records,glow,errors,scope:'Native app boot and game launch; staged public match states for exact indicator coverage'},null,2));
 }finally{await browser.close();await server.close();}
});

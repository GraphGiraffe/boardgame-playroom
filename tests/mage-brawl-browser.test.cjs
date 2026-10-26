'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('Mage Brawl browser: bot drafts, modal footer, responsive table, hotseat privacy and round playback',{timeout:90000},async t=>{
 const server=await serveBrowserFixture(root);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  for(const [width,height,n] of [[320,568,8],[390,844,2],[390,844,8],[844,390,2],[844,390,8],[820,1180,8],[1180,820,8],[1440,900,8]])await t.test(`${width}x${height}, ${n} players`,async()=>{
   const ctx=await browser.newContext({viewport:{width,height},playroomProfile:false,offline:!!process.env.MAGE_LOOT_ARTIFACT}),p=await ctx.newPage(),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.goto(process.env.MAGE_LOOT_ARTIFACT||server.url);await p.locator('#profile-form input').fill('Анна');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());await p.locator('[data-start="mage-brawl"]').click();
    await p.locator('[data-bot-settings]').first().click();await p.locator('#bot-settings-form [name=strategy][value=fighter]').check();await p.locator('#bot-settings-form [name=nickname]').fill('Боец');await p.locator('.bot-settings-footer [data-command=close-modal]').click();
    assert.equal(await p.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.bot).botSettings),undefined,'cancel does not commit');
    await p.locator('[data-bot-settings]').first().click();await p.locator('#bot-settings-form [name=strategy][value=fighter]').check();await p.locator('#bot-settings-form [name=difficulty]').fill('0');
    const slider=p.locator('#bot-settings-form [name=difficulty]');
    for(const [level,label] of [[0,'Простой'],[1,'Средний'],[2,'Сложный']]){await slider.fill(String(level));assert.equal(await slider.getAttribute('aria-valuetext'),label);assert.equal(await p.locator('.bot-difficulty-icons .selected').count(),1);}
    await slider.fill('0');
    const apply=await p.locator('[form=bot-settings-form]').boundingBox();assert(apply.y>=0&&apply.y+apply.height<=height,'fixed footer stays inside viewport');
    await p.locator('[form=bot-settings-form]').click();assert.deepEqual(await p.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.bot).botSettings),{strategy:'fighter',difficulty:'easy'});
    if(n>2)await p.evaluate(n=>{const b=PlayroomAppBridge,r=b.room();for(let i=2;i<n;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'bot',nickname:'Бот '+i});b.renderLobby();},n);
    await p.locator('[data-command=lobby-start]').click();assert.equal(await p.locator('.mage-grid').count(),1);assert.equal(await p.locator('.scene-hint[role=alert]').count(),0);await p.locator('.mage-hand [data-command=card-help]').click();assert.equal(await p.locator('#modal-root h2').count(),1);await p.locator('#modal-root [data-command=close-modal]').click();
    const before=await p.locator('.mage-card').first().innerHTML();await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();assert.notEqual(await p.locator('.mage-card').first().innerHTML(),before,'action changes every card face');await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();assert(await p.locator('.mage-card').evaluateAll(cards=>cards.every(c=>c.style.getPropertyValue('--mage-direction')==='90deg')));
    const geometry=await p.evaluate(()=>{const grid=document.querySelector('.mage-grid').getBoundingClientRect(),cell=document.querySelector('.mage-cell').getBoundingClientRect(),card=document.querySelector('.mage-card').getBoundingClientRect(),ready=document.querySelector('.mage-ready').getBoundingClientRect();return {grid:{x:grid.x,y:grid.y,right:grid.right,bottom:grid.bottom,width:grid.width,height:grid.height},cell:{width:cell.width,height:cell.height},card:{width:card.width,height:card.height},ready:{y:ready.y,bottom:ready.bottom}};});
    const out=path.resolve(root,'../tmp_files/mage-brawl/screenshots');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`${width}x${height}-${n}.png`)});
    assert(geometry.grid.width>80&&geometry.grid.height>80,'arena has usable nonzero space: '+JSON.stringify(geometry));assert(Math.abs(geometry.cell.width-geometry.cell.height)<2,'square cells');assert(Math.abs(geometry.card.width-geometry.card.height)<3,'square cards');assert(geometry.grid.x>=-1&&geometry.grid.right<=width+1&&geometry.grid.bottom<=height+1,'arena fits viewport');assert(geometry.ready.y>=0&&geometry.ready.bottom<=height,'ready reachable');
    const rotation=await p.locator('.mage-rotate').first().boundingBox();assert.equal(rotation.width,28);assert.equal(rotation.height,28);
    const hand=await p.locator('.mage-hand .hand-track').evaluate(t=>({width:t.clientWidth,scroll:t.scrollWidth,height:t.clientHeight,scrollHeight:t.scrollHeight}));assert(hand.scroll<=hand.width+1&&hand.scrollHeight<=hand.height+1,'hand fits without redundant scrolling: '+JSON.stringify(hand));assert.equal(await p.locator('[data-view-range=mageAction],.public-sequence-controls').count(),0);assert.deepEqual(errors,[]);
   }finally{await ctx.close();}
  });
  await t.test('two humans, closed choices and automatic phases',async()=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false,offline:!!process.env.MAGE_LOOT_ARTIFACT}),p=await ctx.newPage();p.setDefaultTimeout(8000);
   try{await p.goto(process.env.MAGE_LOOT_ARTIFACT||server.url);await p.locator('#profile-form input').fill('Анна');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());await p.locator('[data-start="mage-brawl"]').click();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Борис'});b.renderLobby();});await p.locator('[data-command=lobby-start]').click();await p.locator('[data-command=unlock]').click();
    await p.locator('.mage-controls [data-action]').click();await p.locator('[data-decision-player="1"]').click();await p.locator('[data-command=unlock]').waitFor();assert.equal(await p.locator('.mage-card').count(),0,'curtain DOM contains no private hand');await p.locator('[data-command=unlock]').click();
    await p.locator('[data-decision-player="0"]').click();await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.mage-controls [data-action]').getAttribute('aria-label'),'Изменить план');await p.locator('.mage-controls [data-action]').click();await p.locator('.mage-controls [data-action]').click();await p.locator('[data-decision-player="1"]').click();await p.locator('[data-command=unlock]').click();await p.locator('.mage-controls [data-action]').click();await p.locator('[data-public-sequence]').waitFor();
    if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.public-sequence-controls').count(),0);await p.waitForFunction(()=>!document.querySelector('.is-public-playback'),null,{timeout:30000});assert.equal(await p.locator('[data-public-frame]:visible').count(),1);
   }finally{await ctx.close();}
  });
 }finally{await browser?.close();await server.close();}
});

test('Mage Brawl playback: first render, player health, sounds, final callback and reduced motion',{timeout:30000},async()=>{
 // Playwright's JS clock does not advance the browser compositor clock.
 const advance=async(page,ms)=>{await page.evaluate(()=>{for(const a of document.getAnimations())if(Number.isFinite(a.effect.getTiming().iterations)&&['running','paused'].includes(a.playState))a.finish();});await page.clock.runFor(ms);await new Promise(resolve=>setTimeout(resolve,10));};
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false}),p=await ctx.newPage();
  await p.goto(process.env.MAGE_LOOT_ARTIFACT||server.url);if(await p.locator('#profile-form').count()){await p.locator('#profile-form input').fill('Анна');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
  await p.evaluate(()=>{
   window.PlayroomAppBridge={...PlayroomAppBridge,audio:{batch:()=>Promise.resolve(),play:()=>Promise.resolve()}};
   const prepare=TabletopSession.prototype.prepare,act=SessionAuthority.prototype.actBot;window.botTempo=[];
   TabletopSession.prototype.prepare=function(actor,action){if(this.game==='mage-brawl')window.tempoSession=this;return prepare.call(this,actor,action);};
   SessionAuthority.prototype.actBot=function(actor,action){botTempo.push({at:Date.now(),round:window.tempoSession?.current.data.round,playing:!!document.querySelector('.is-public-playback'),sequence:document.querySelector('[data-public-sequence]')?.dataset.publicSequence});return act.call(this,actor,action);};
  });
  await p.locator('[data-start="mage-brawl"]').click();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});for(let i=2;i<4;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'bot',nickname:'Бот '+i});b.renderLobby();});await p.locator('[data-command=lobby-start]').click();
  await p.evaluate(()=>{window.readyNode=document.querySelector('.mage-ready');window.readyMutations=[];window.readyObserver=new MutationObserver(rs=>readyMutations.push(...rs.filter(r=>r.target===readyNode&&['disabled','class','aria-pressed'].includes(r.attributeName)).map(r=>r.attributeName)));readyObserver.observe(document.querySelector('.mage-controls'),{attributes:true,subtree:true,childList:true});});
  await p.clock.runFor(900);
  assert.equal(await p.evaluate(()=>botTempo.length),3);assert.equal(await p.evaluate(()=>new Set(botTempo.map(t=>t.at)).size),1,'all bots ready in one timer callback');assert.equal(await p.evaluate(()=>readyNode===document.querySelector('.mage-ready')&&!readyNode.disabled),true,'other bots never remove or disable Ready');assert.deepEqual(await p.evaluate(()=>readyMutations),[],'bot readiness does not flash own Ready');
  await p.locator('[data-command=history]').click();
  await p.locator('#replay-range').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await p.locator('#replay-range').inputValue(),'3','history skips intermediate bot confirmations');
  assert.equal(await p.locator('.opponent-hand.is-ready').count(),3,'all bots are ready together in history');
  await p.locator('[data-command=history-close]').click();
  // Metadata takes effect on the next committed action, including a possible human respawn.
  await p.evaluate(()=>tempoSession.setPlayerMetadata(0,{bot:true}));
  await p.locator('.mage-ready').click();assert.equal(await p.locator('.is-public-playback').count(),1);
  await p.evaluate(()=>{window.botCountAtPlayback=botTempo.length;});
  await p.clock.runFor(1000);assert.equal(await p.evaluate(()=>botTempo.length===botCountAtPlayback),true,'bots do not overwrite a round while it is being shown');
  for(let i=0;i<20;i++)await advance(p,1000);const trace=await p.evaluate(()=>botTempo);assert(trace.length>3,'bots resume after the presentation: '+JSON.stringify(await p.evaluate(()=>({round:tempoSession.current.data.round,status:tempoSession.current.status,phase:tempoSession.current.data.phase,turn:tempoSession.current.turn,paused:!!document.querySelector('.pause-cover'),actions:tempoSession.current.players.map((_,i)=>TabletopCore.legalActions(tempoSession.current,i).length),frame:document.querySelector('[data-public-frame]:not([hidden])')?.dataset.publicFrame,count:document.querySelectorAll('[data-public-frame]').length,animations:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,end:a.effect.getComputedTiming().endTime}))}))));assert(trace.every(t=>!t.playing),'bot-only play respects the same presentation boundary');assert(trace.slice(3).every(t=>t.at>trace[0].at),'later rounds wait for playback');await ctx.close();
  for(const [mode,reduced] of [['normal',false],['fast',false],['instant',false],['normal',true]]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},playroomProfile:false}),p=await ctx.newPage();p.setDefaultTimeout(5000);await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await p.goto(server.url);await p.locator('#profile-form input').fill('Анна');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
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
   assert.equal(await p.locator('.public-sequence').evaluate(n=>n.style.getPropertyValue('--sequence-duration')),'250ms');
   await advance(p,250);await advance(p,750); // Complete reveal before the attack.
   const repeated=await p.evaluate(()=>{
    const h=document.querySelector('#app'),f=()=>h.querySelector('[data-public-frame]:not([hidden])'),before=f(),projectile=before.querySelector('.mage-projectile'),panel=h.querySelector('.player-panel[data-player-index="1"]'),child=panel.firstElementChild;
    const animation=projectile?.getAnimations()[0],hidden=[];
    const observer=new MutationObserver(records=>hidden.push(...records.filter(r=>r.target===before&&r.attributeName==='hidden')));observer.observe(h,{attributes:true,subtree:true});
    const s=magePlaybackFixture.s,E=TabletopCore;
    for(let i=0;i<3;i++){PlayroomGameScreen.update(h,'<section class="scene" data-animation-speed="normal">'+PlayroomViews.render(E.project(s,0),0,E.legalActions(s,0),{})+'</section>');PlayroomPublicSequence.bind(h);}
    hidden.push(...observer.takeRecords().filter(r=>r.target===before&&r.attributeName==='hidden'));observer.disconnect();
    return {index:f().dataset.publicFrame,sameFrame:f()===before,hidden: hidden.length,sameAnimation:!!animation&&projectile.getAnimations()[0]===animation,samePlayerChild:panel.firstElementChild===child,sounds:magePlaybackFixture.sounds.length};
   });
   assert.equal(repeated.index,'2');assert(repeated.sameFrame&&repeated.sameAnimation&&repeated.samePlayerChild,'redraw retains active effects and player nodes: '+JSON.stringify(repeated));assert.equal(repeated.hidden,0,'same-frame redraw never hides/restarts the effect');assert.equal(repeated.sounds,2,'redraw does not repeat reveal/attack audio');
   const paused=await p.evaluate(async()=>{
    phaseClock.pause();const a=document.querySelector('[data-public-frame]:not([hidden]) .mage-projectile').getAnimations()[0];
    await a.ready;window.phaseAnimation=a;return {time:a.currentTime,frame:document.querySelector('[data-public-frame]:not([hidden])').dataset.publicFrame};
   });
   await p.clock.runFor(2000);
   assert.deepEqual(await p.evaluate(()=>({time:phaseAnimation.currentTime,frame:document.querySelector('[data-public-frame]:not([hidden])').dataset.publicFrame})),paused,'pause freezes CSS effect and phase together');
   assert.equal(await p.evaluate(()=>{phaseClock.setRate(2);const rate=phaseAnimation.playbackRate;phaseClock.resume();return rate;}),2);

  }
  if(!reduced&&mode!=='instant'){assert.equal(await p.locator('.public-sequence-controls').count(),0);if(mode==='fast'){assert.equal(await p.locator('.public-sequence').evaluate(n=>n.style.getPropertyValue('--sequence-duration')),'250ms');await p.clock.runFor(140);assert.equal(await p.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),'0');await p.clock.runFor(1);assert.equal(await p.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),'1');for(let i=0;i<await p.locator('[data-public-frame]').count();i++)await advance(p,1000);}else for(let i=0;i<await p.locator('[data-public-frame]').count();i++)await advance(p,1000);
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
 try{const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',offline:!!process.env.MAGE_LOOT_ARTIFACT}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(4000);await p.goto(process.env.MAGE_LOOT_ARTIFACT||server.url);
  // Real local screen lifecycle: controls, a full round, hotseat and history.
  await p.locator('[data-start="mage-brawl"]').click();await p.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Борис'});b.renderLobby();});await p.locator('[data-command=room-rules]').click();assert.equal(await p.locator('[name=firstPlayerMode]').count(),0,'no first player option');assert.equal(await p.locator('[name=seatOrder]').count(),2,'seat order options remain');await p.locator('#modal-root [data-command=close-modal]').click();await p.locator('[data-command=lobby-start]').click();await p.locator('[data-command=unlock]').click();
  assert.deepEqual(errors,[]);
  await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();
  await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();
  const movementDiagram=await p.locator('.mage-card').first().locator('template').innerHTML();
  await p.locator('[data-view-key=mageAction][data-view-value=movement]').click();assert.notEqual(await p.locator('.mage-card').first().locator('template').innerHTML(),movementDiagram,'help template updates on action switch');
  await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();assert.equal(await p.locator('.mage-card').first().locator('template').innerHTML(),movementDiagram);
  await p.locator('[data-command=card-help]').click();assert.equal(await p.locator('.card-help-list .mage-action-diagram').first().locator(':scope > g').getAttribute('transform'),'rotate(90 50 50)');assert.equal(await p.locator('.card-help-list .mage-action-diagram [stroke-width]').first().evaluate(n=>getComputedStyle(n).strokeWidth),'1.5px');await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/help.png')});await p.locator('#modal-root [data-command=close-modal]').click();
  for(const c of await p.locator('.mage-card').all()){await c.click();assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'90deg');}
  assert.equal(await p.locator('.player-panel.is-turn,[aria-current=true],.turn-label').count(),0,'simultaneous preparation has no turn marker');
  await p.locator('.mage-controls [data-action]').click();await p.locator('[data-command=unlock]').click();
  assert.equal(await p.locator('.player-panel.is-turn,[aria-current=true],.turn-start-flash,.turn-label').count(),0,'ready does not transfer a turn');assert(await p.locator('.player-panel.is-ready[data-player-index="0"]').count()>0,'ready participant is highlighted');
  assert.equal(await p.evaluate(()=>{const n=document.querySelector('.player-panel.is-ready'),before=getComputedStyle(n).backgroundColor;n.classList.remove('is-ready');n.classList.add('is-turn');const after=getComputedStyle(n).backgroundColor;n.classList.remove('is-turn');n.classList.add('is-ready');return before===after;}),true,'ready uses the active player green');
  await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/ready.png')});
  await p.locator('[data-view-key=mageDirection][data-view-value="1"]').click();await p.locator('[data-view-key=mageDirection][data-view-value="2"]').click();await p.locator('[data-view-key=mageAction][data-view-value=attack]').click();await p.locator('.mage-controls [data-action]').click();
  if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();await p.waitForFunction(()=>!document.querySelector('.is-public-playback'));
  if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();
  if(await p.locator('.self-player').getAttribute('data-player-index')!=='0'){await p.locator('[data-decision-player="0"]').click();await p.locator('[data-command=unlock]').click();}
  assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'90deg','direction survives round and hotseat');
  const rotation=await p.evaluate(()=>{const samples=[],costs={};for(const [obj,key] of [[TabletopCore,'project'],[PlayroomViews,'render'],[PlayroomGameScreen,'update'],[PlayroomGameScreen,'layoutScene']]){const fn=obj[key];obj[key]=function(...args){const t=performance.now();try{return fn.apply(this,args)}finally{const c=costs[key]||(costs[key]={calls:0,ms:0});c.calls++;c.ms+=performance.now()-t;}};}for(let i=0;i<8;i++){const b=document.querySelector('.mage-rotate:last-child'),t=performance.now();b.click();document.querySelector('.mage-grid').getBoundingClientRect();samples.push(performance.now()-t);}return {samples,costs};});fs.writeFileSync(path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/rotation-timings.json'),JSON.stringify(rotation));
  await p.locator('[data-command=history]').click();assert.equal(await p.locator('.mage-hand,.mage-loot-hand,.mage-ready,.mage-rotate,.mage-action-switch,.mage-facing,.mage-preview').count(),0,'history has no private choice UI');
  await p.locator('[data-command=history-close]').click();if(await p.locator('[data-command=unlock]').count())await p.locator('[data-command=unlock]').click();assert.equal(await p.locator('.mage-card').first().evaluate(n=>n.style.getPropertyValue('--mage-direction')),'810deg','history preserves continuous live orientation after two complete rotations');
  const result=await p.evaluate(()=>{
   const E=TabletopCore;let s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]}),d=s.data;
   d.board=Array(36).fill('ground');d.board[0]=d.board[35]='base';d.shrink=null;
   [[2,2],[2,1],[2,3]].forEach((pos,i)=>Object.assign(d.players[i],{pos,health:3,maxHand:i?3:8,hand:i?['earth']:['water','fire','air','earth','water','fire','air','earth']}));d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:4},(_,i)=>({id:'card:'+(e*4+i),element})));d.discard=[];for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);
   window.finalLootSource=JSON.parse(JSON.stringify(s));finalLootSource.data.players[0].lives=1;
   [{element:'water',direction:0},{element:'earth',direction:1},{element:'earth',direction:3}].forEach((c,i)=>s=E.applyAction(s,i,{type:'plan',cardId:s.data.players[i].hand.find(card=>card.element===c.element).id,action:'attack',...c}));
   window.lootFixture={s,viewer:1,commits:[],viewState:{}};const host=document.querySelector('#app');
   window.renderLoot=()=>{const f=lootFixture,projected=E.project(f.s,f.viewer),actions=E.legalActions(f.s,f.viewer);PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'loot-dialog',gameName:'Битва магов',state:projected,viewer:f.viewer,actions,scene:PlayroomViews.render(projected,f.viewer,actions,{viewState:f.viewState||{}})}));PlayroomPublicSequence.bind(host);PlayroomGameScreen.layoutScene(host);};renderLoot();
   const simultaneous=[...host.querySelectorAll('[data-public-frame]')].map(f=>f.querySelectorAll('.mage-attack-earth').length).filter(Boolean),reveals=[...host.querySelectorAll('.mage-phase-cards')].map(n=>n.children.length);
   const outsider=document.createElement('div');outsider.innerHTML=PlayroomViews.render(E.project(s,2),2,E.legalActions(s,2),{});const outsiderChoices=outsider.querySelectorAll('.mage-loot-hand').length;
   outsider.innerHTML=PlayroomViews.render(E.project(s,-1),-1,[],{surface:'table'});const publicChoices=outsider.querySelectorAll('.mage-loot-hand').length;
   window.lootTargets=new PlayroomPlayerTarget({root:()=>host,actions:()=>E.legalActions(lootFixture.s,lootFixture.viewer),commit:c=>{const f=lootFixture;f.commits.push({actor:f.viewer,index:c.index});f.s=E.applyAction(f.s,f.viewer,c);f.viewer=f.s.data.loot?.[0]?.recipients[0]??f.viewer;renderLoot();}});
   host.addEventListener('click',e=>{const t=e.target.closest('.mage-loot-hand [data-player-target]');if(t){e.stopPropagation();lootTargets.tap(Number(t.dataset.playerTarget));}});
   return {simultaneous,reveals,outsiderChoices,publicChoices,inlineCards:host.querySelectorAll('.mage-loot-card').length};
  });
  assert.deepEqual(result.simultaneous,[2]);assert(result.reveals.includes(2));assert.equal(result.outsiderChoices,0);assert.equal(result.publicChoices,0);assert.equal(result.inlineCards,0);
  const open=p.locator('.mage-loot-hand [data-player-target]'),dialog=p.locator('dialog.card-choice-dialog');await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),7);assert.equal(await dialog.locator('.card-back-art').count(),7);assert.equal(await dialog.locator('[data-card-help-art]').count(),0);
  for(const [width,height] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width,height});const box=await dialog.boundingBox(),card=await dialog.locator('[data-card-index]').first().boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'dialog fits viewport');assert.equal(card.width,card.height,'square loot backs');await p.screenshot({path:path.resolve(root,`../tmp_files/mage-brawl/loot-history-2026-10-23/${width}x${height}.png`)});}
  await dialog.locator('.card-choice-heading button').click();assert.equal(await dialog.count(),0);assert.equal(await p.evaluate(()=>lootFixture.commits.length),0,'closing does not choose');await open.click();await dialog.locator('[data-card-index="1"]').click();assert.deepEqual(await p.evaluate(()=>lootFixture.commits),[{actor:1,index:1}]);assert.equal(await dialog.count(),0);
  await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),6);await dialog.locator('[data-card-index="0"]').click();assert.deepEqual(await p.evaluate(()=>lootFixture.commits),[{actor:1,index:1},{actor:2,index:0}]);assert.equal(await dialog.count(),0);assert.equal(await open.count(),0);
  assert.equal(await p.evaluate(()=>lootFixture.s.data.players[0].hand.length),5,'victim retains the unclaimed accumulated cards');
  await p.evaluate(()=>{window.retainedLootState=lootFixture.s;let s=finalLootSource;[{element:'water',direction:0},{element:'earth',direction:1},{element:'earth',direction:3}].forEach((c,i)=>s=TabletopCore.applyAction(s,i,{type:'plan',cardId:s.data.players[i].hand.find(card=>card.element===c.element).id,action:'attack',...c}));lootFixture.s=s;lootFixture.viewer=1;renderLoot();});
  for(const count of [7,6]){await open.click();assert.equal(await dialog.locator('[data-card-index]').count(),count);await dialog.locator('[data-card-index="0"]').click();}
  assert.deepEqual(await p.evaluate(()=>lootFixture.s.data.players.map(p=>p.hand.length)),[0,2,2],'final death also transfers one chosen card to each killer and replaces played cards');
  await p.evaluate(()=>{lootFixture.s=retainedLootState;renderLoot();});
  await p.evaluate(()=>{lootFixture.viewer=0;renderLoot();});
  assert(await p.locator('.mage-cell.is-playable[data-action]').count()>0,'only the respawning player sees highlighted legal bases');
  assert.equal(await p.locator('.mage-controls').innerText(),'');
  await p.evaluate(()=>{lootFixture.viewer=1;renderLoot();});assert.equal(await p.locator('.mage-cell.is-playable[data-action]').count(),0,'other players do not see base selection');
  await p.evaluate(()=>{const f=lootFixture,E=TabletopCore;f.s=E.applyAction(f.s,f.s.turn,E.legalActions(f.s,f.s.turn)[0]);f.viewer=0;renderLoot();});
  await p.setViewportSize({width:390,height:844});
  const handGeometry=await p.locator('.mage-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,id:n.dataset.entity,cls:n.className,parent:n.parentElement.className,transform:getComputedStyle(n).transform};}));fs.writeFileSync(path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/hand-geometry.json'),JSON.stringify(handGeometry));assert.equal(new Set(handGeometry.map(r=>r.y)).size,2,'selected card is lifted, all others share one row');assert.equal(new Set(handGeometry.map(r=>r.id)).size,8);assert(handGeometry.at(-1).right<=390);assert(handGeometry.some((r,i)=>i>0&&r.x<handGeometry[i-1].right),'ordinary cards overlap instead of wrapping');assert(handGeometry[1].x>=handGeometry[0].right,'selected first card stays fully exposed');
  const copies=await p.evaluate(()=>{const f=lootFixture,hand=f.s.data.players[f.viewer].hand,index=hand.findIndex((e,i)=>hand.findIndex(c=>c.element===e.element)!==i);f.viewState.mageCardId=hand[index].id;renderLoot();return {id:f.viewState.mageCardId,index};});assert.equal(await p.locator('.mage-card.is-selected').count(),1);assert.equal(await p.locator('.mage-card.is-selected').getAttribute('data-entity'),'card-'+copies.id);
  assert.equal(await p.locator('.mage-card').count(),8,'respawn refills the earned maximum after two cards were looted');await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/respawn-hand.png')});
  assert.equal(await p.locator('.player-hand').count(),0,'opponent hands are omitted');
  // Reserve life becomes a crown, followed by health; private choice previews rotate together.
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{const f=lootFixture;f.s=TabletopCore.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]});f.viewer=2;const d=f.s.data;d.board=Array(d.size*d.size).fill('ground');d.board[0]=d.board[d.board.length-1]='base';d.board[1]='wall';d.board[2]='falling_floor';d.board[3]='spikes';d.startingBases=[[0,0],[d.size-1,d.size-1],[2,2]];d.players[0].pos=[0,0];d.players[1].pos=[d.size-1,d.size-1];Object.assign(d.players[2],{pos:[2,2],hand:['air','earth','water','fire']});d.players[0].hand=['earth'];d.players[1].hand=['water'];d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:4},(_,i)=>({id:'card:'+(e*4+i),element})));d.discard=[];for(const v of d.players)v.hand=v.hand.map(e=>d.deck.splice(d.deck.findIndex(c=>c.element===e),1)[0]);f.viewState={mageCardId:d.players[f.viewer].hand.find(c=>c.element==='air').id,mageAction:'movement',mageDirection:0};renderLoot();});
  const own=p.locator('.player-panel[data-player-index="2"]'),scores=own.locator('.player-details');
  assert.equal(await p.locator('.mage-scene .player-turn-position,.mage-scene .player-medallion.is-first,.player-heading-counter').count(),0);
  assert.equal(await scores.locator('.token-meeple .counter-token:not(.is-empty)').count(),1);
  assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),3);
  assert.equal(await scores.locator('.token-crown').count(),0);
  assert.equal(await own.locator('.player-heading>strong').innerText(),'C');
  assert.equal(await own.locator('.player-heading .token-heart').count(),1);assert.equal(await own.locator('.player-heading .token-meeple').count(),1);
  assert.deepEqual(await own.locator('.player-scores').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills']);
  await p.evaluate(()=>{Object.assign(lootFixture.s.data.players[2],{health:1,maxHand:6});renderLoot();});
  assert.equal(await own.getAttribute('data-hand-count'),'6','card counter always shows the earned limit');
  assert.equal(await scores.locator('[data-score-id=kills]').getAttribute('title'),'Убийства: 3');
  const hearts=await scores.locator('.counter-token').evaluateAll(nodes=>nodes.filter(n=>n.closest('[data-score-id=health]')).map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width,empty:n.classList.contains('is-empty'),opacity:getComputedStyle(n).opacity})));
  assert.deepEqual(hearts.map(h=>h.empty),[false,true,true]);assert(Math.abs(hearts[1].x-hearts[0].x-hearts[0].width*.46)<.1);assert.equal(hearts[2].opacity,'1');
  const tokenHearts=await p.locator('.mage-piece[data-mage-player="2"] .mage-token-health .piece-indicator').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width,empty:n.classList.contains('is-empty'),opacity:getComputedStyle(n).opacity})));assert.deepEqual(tokenHearts.map(h=>h.empty),[false,true,true]);assert(tokenHearts[1].x-tokenHearts[0].x>tokenHearts[0].w);assert.equal(tokenHearts[1].opacity,'1');
  await p.evaluate(()=>{lootFixture.s.data.players[2].health=3;lootFixture.s.data.shrink=lootFixture.s.data.round;renderLoot();});
  assert.equal(await p.locator('.mage-warning').count(),0);assert.equal(await p.locator('.mage-risk').count(),20);
  assert.notEqual(await p.locator('.mage-risk').first().evaluate(n=>getComputedStyle(n,'::after').backgroundColor),'rgba(0, 0, 0, 0)');

  const beforeShrink=await p.locator('.mage-cell').first().boundingBox();
  await p.evaluate(()=>{const d=lootFixture.s.data;d.players[0].pos=[1,1];d.players[1].pos=[4,4];d.inset=1;d.shrink=null;renderLoot();});
  assert.equal(await p.locator('.mage-cell').count(),16,'removed ring does not reserve space');
  assert((await p.locator('.mage-cell').first().boundingBox()).width>beforeShrink.width*1.4,'remaining cells grow');
  assert.equal(await p.locator('.mage-piece[data-mage-player="2"]').evaluate(n=>n.style.getPropertyValue('--col')),'1','global positions map into cropped board');
  await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/shrunk-arena.png')});
  await p.evaluate(()=>{const d=lootFixture.s.data;d.inset=0;d.players[0].pos=[0,0];d.players[1].pos=[5,5];renderLoot();});
  const firstReserve=()=>scores.evaluate(n=>{const a=[...n.querySelectorAll('.token-meeple,.token-crown,.token-heart')];return a.map(x=>x.className);});
  assert.match((await firstReserve())[0],/token-meeple/);assert.match((await firstReserve())[1],/token-heart/);
  await p.evaluate(()=>{Object.assign(lootFixture.s.data.players[2],{lives:1,ultimate:1});renderLoot();});
  assert.equal(await scores.locator('.token-crown .counter-token:not(.is-empty)').count(),1);assert.equal(await scores.locator('.token-meeple .is-empty').count(),1);assert.match((await firstReserve())[0],/token-meeple/);
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
  for(const [width,height] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width,height});const hand=await p.locator('.mage-hand .hand-track').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth,height:n.clientHeight,scrollHeight:n.scrollHeight}));assert(hand.scroll<=hand.width+1&&hand.scrollHeight<=hand.height+1,'direction markers fit hand: '+JSON.stringify(hand));const rows=await p.locator('.player-heading:has(.player-heading-counters)').evaluateAll(ns=>ns.map(n=>{const c=n.querySelector('.player-heading-counters'),name=n.querySelector('strong'),r=n.getBoundingClientRect(),b=c.getBoundingClientRect();return {fits:b.right<=r.right+1,height:b.height,row:r.height,ellipsis:getComputedStyle(name).textOverflow,nowrap:getComputedStyle(name).whiteSpace};}));assert(rows.every(r=>r.fits&&r.height<=r.row&&r.ellipsis==='ellipsis'&&r.nowrap==='nowrap'),JSON.stringify(rows));await p.screenshot({path:path.resolve(root,`../tmp_files/mage-brawl/loot-history-2026-10-23/terrain-${width}x${height}.png`)});}
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{lootFixture.viewState.mageAction='movement';lootFixture.viewState.mageDirection=0;renderLoot();});await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/movement-directions.png')});
  await p.evaluate(()=>{lootFixture.viewState.mageAction='attack';renderLoot();});await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/attack-directions.png')});
  await p.evaluate(()=>{lootFixture.s.data.players[2].ultimate=0;renderLoot();});assert.equal(await switches.count(),2);assert.equal(await scores.locator('.token-meeple .is-empty').count(),1);assert.equal(await scores.locator('.token-crown').count(),0);assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),3);
  // Consecutive renders reuse DOM and sequence templates, just like the actual app.
  for(const [health,lives,ultimate] of [[3,2,0],[2,2,0],[0,1,1],[3,1,1],[1,1,0],[0,0,0]]){
   await p.evaluate(([health,lives,ultimate])=>{const f=lootFixture,d=f.s.data;Object.assign(d.players[2],{health,lives,ultimate,pos:health?[2,2]:null});const q=TabletopCore.project(f.s,f.viewer).data;d.frames=[{board:q.board,inset:q.inset,players:q.players.map(({health,lives,ultimate,handCount,maxHand,kills,pos})=>({health,lives,ultimate,handCount,maxHand,kills,pos})),phase:'start'}];renderLoot();},[health,lives,ultimate]);
   assert.equal(await scores.locator('.token-heart .counter-token:not(.is-empty)').count(),health,'rerendered health '+[health,lives,ultimate]);assert.equal(await scores.locator('.token-meeple .counter-token:not(.is-empty)').count(),lives>1?1:0,'rerendered spare life');assert.equal(await scores.locator('.token-crown .counter-token:not(.is-empty)').count(),ultimate>0?1:0,'rerendered ultimate');
  }
  const resultMetric=await p.evaluate(()=>{const E=TabletopCore,s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'}]});s.data.round=26;Object.assign(s.data.players[0],{lives:1});Object.assign(s.data.players[1],{health:0,lives:0,pos:null,eliminatedRound:25});E.complete(s,[0]);const projected=E.project(s,0);document.querySelector('#app').innerHTML=PlayroomGameScreen.resultMarkup({state:projected,viewer:0,gameName:'Битва магов'});return projected.result.metrics.find(m=>m.id==='survival').values;});
  assert.deepEqual(resultMetric,[26,25]);assert.deepEqual(await p.locator('.score-row').first().locator('.result-core-counters').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills','lives','health']);assert.equal(await p.locator('.score-row .token-heart.is-overlapping').count(),2);assert.equal(await p.locator('.result-awards .is-first').count(),0,'Mage Brawl results have no first-player token');assert((await p.locator('.score-row').allTextContents()).some(t=>t.includes('Выживание: 26')));await p.screenshot({path:path.resolve(root,'../tmp_files/mage-brawl/loot-history-2026-10-23/result.png')});
  // The same controller retains Akulina's portrait geometry and real command.
  await p.evaluate(()=>{lootTargets.destroy();const E=TabletopCore,s=E.createGame('oldmaid',{seed:17,players:[{name:'A'},{name:'B'}]}),viewer=s.turn,actions=E.legalActions(s,viewer),host=document.querySelector('#app');host.innerHTML=PlayroomViews.render(E.project(s,viewer),viewer,actions,{});window.oldmaidTarget=new PlayroomPlayerTarget({root:()=>host,actions:()=>actions,commit:()=>{}});oldmaidTarget.tap(actions[0].target);});
  assert.equal(await p.locator('.player-turn-position').count(),2,'other games retain order positions');assert(await p.locator('.player-panel.is-turn').count()>0,'sequential games retain active player');const portrait=await dialog.locator('[data-card-index]').first().boundingBox();assert(portrait.height>portrait.width);await p.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Mage Brawl elemental effects: routes, attacks, damage, death, fall and killer panels',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);await p.clock.install({time:new Date('2026-10-23T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-23T00:00:01Z'));
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
    const all=[...host.querySelectorAll('[data-public-frame]')],status=kind==='damage'?'damage':kind==='death'?'death':'fall';
    const index=all.findIndex(f=>kind==='shrink'||kind==='fall'||kind==='death'||kind==='damage'?f.querySelector(`.mage-token[data-public-feedback~="${status}"]`):kind==='move'?f.querySelector('.mage-trail'):f.querySelector('.mage-attack-'+element));
    const elapsed=all.slice(0,index).reduce((n,f)=>n+(Number(f.dataset.frameDuration)||650),0);
    // Select the real generated public frame through the existing playback clock.
    window.mageEffectFixture={s,index,bytes:JSON.stringify(s)};
    return {index,elapsed};
   };
  });
  async function show(kind,element){
   const {index,elapsed}=await p.evaluate(([k,e])=>showMageEffect(k,e),[kind,element]);assert(index>=0);await p.clock.runFor(elapsed+1);
   assert.equal(await p.locator('[data-public-frame]:visible').getAttribute('data-public-frame'),String(index));
   await p.evaluate(()=>document.querySelector('.mage-scene').getAnimations({subtree:true}).forEach(a=>{a.currentTime=Number(a.effect.getTiming().duration)*.65;a.pause();}));
  }
  for(const element of ['air','earth','water','fire']){
   await show('attack',element);assert.equal(await p.locator(`[data-public-frame]:visible .mage-attack-${element}`).count()>0,true,element+' has its own effect');assert(await p.locator('[data-public-frame]:visible .mage-attacks').evaluate(el=>Number(getComputedStyle(el).zIndex)>Number(getComputedStyle(el.parentElement.querySelector('.mage-pieces')).zIndex)));
   await p.screenshot({path:path.resolve(root,`../tmp_files/mage-brawl/loot-history-2026-10-23/attack-${element}.png`)});
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
   const token=p.locator('[data-public-frame]:visible .mage-piece[data-mage-player="1"] .mage-token-health');assert.equal(await token.locator('.piece-indicator').count(),3);assert.equal(await token.locator('.piece-indicator:not(.is-empty)').count(),expected.health,kind+' token matches public HP');
   const panel=p.locator('.player-panel[data-player-index="1"]');assert.equal(await panel.locator('.token-heart .counter-token:not(.is-empty)').count(),expected.health,kind+' health follows damage frame');assert.equal(await panel.locator('.token-meeple .counter-token:not(.is-empty)').count(),expected.lives>1?1:0);assert.equal(await panel.locator('.token-crown .counter-token:not(.is-empty)').count(),expected.ultimate>0?1:0);
   await p.screenshot({path:path.resolve(root,`../tmp_files/mage-brawl/loot-history-2026-10-23/${kind}.png`)});
   for(let i=0;i<30;i++){await p.evaluate(()=>{for(const a of document.getAnimations())if(Number.isFinite(a.effect.getTiming().iterations)&&['running','paused'].includes(a.playState))a.finish();});await p.clock.runFor(1000);await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(await p.locator('.player-panel[data-public-feedback]:not([data-public-feedback=""])').count(),0,'feedback clears on live frame');
   assert(await p.evaluate(()=>JSON.stringify(mageEffectFixture.s)===mageEffectFixture.bytes));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Mage Brawl stacked counters: lost lives, crown counts, layers and results',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.MAGE_LOOT_ARTIFACT||server.url);if(await p.locator('#profile-form').count()){await p.locator('#profile-form input').fill('Иван');await p.locator('#profile-form').evaluate(f=>f.requestSubmit());}await p.locator('[data-start="mage-brawl"]').click();await p.locator('[data-command=lobby-start]').click();await p.locator('.mage-grid').waitFor();
 await p.evaluate(()=>{const E=TabletopCore,s=E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'}]});Object.assign(s.data.players[0],{health:1,lives:1,ultimate:4});window.tokenState=s;const state=E.project(s,0),actions=E.legalActions(s,0),host=document.querySelector('#app');PlayroomViews.get('mage-brawl').render(state,0,actions,{});PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'tokens',gameName:'Битва магов',state,viewer:0,actions,scene:PlayroomViews.render(state,0,actions,{})}));PlayroomGameScreen.layoutScene(host);});
 const own=p.locator('.player-panel[data-player-index="0"]');assert.equal(await own.locator('.token-meeple .is-empty').count(),1);assert.equal(await own.locator('.token-crown .counter-token').count(),4);assert.deepEqual(await own.locator('.player-scores').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills','ultimate']);
 assert(await own.locator('.token-meeple .is-empty').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).fill==='rgb(255, 255, 255)')));
 const crownBoxes=await own.locator('.token-crown .counter-token').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right})));
 assert(crownBoxes.every((n,i)=>!i||n.x>=crownBoxes[i-1].right),'in-game crowns do not overlap');
 const hearts=await own.locator('.token-heart .counter-token').evaluateAll(ns=>ns.map(n=>({z:+getComputedStyle(n).zIndex,fill:getComputedStyle(n).fill,stroke:getComputedStyle(n).stroke,x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width})));
 assert(hearts[0].z>hearts[1].z);assert.equal(hearts[1].fill,'rgb(255, 255, 255)');assert.notEqual(hearts[0].fill,hearts[0].stroke);assert(Math.abs(hearts[1].x-hearts[0].x-hearts[0].w*.46)<.1);
 const out=path.resolve(root,process.env.MAGE_TOKEN_SCREENSHOTS||'../tmp_files/mage-brawl/stacked-tokens-2026-10-23');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'game.png')});
 await p.evaluate(()=>{const s=tokenState,E=TabletopCore;Object.assign(s.data.players[1],{health:0,lives:0,pos:null,eliminatedRound:1});E.complete(s,[0]);document.querySelector('#app').innerHTML=PlayroomGameScreen.resultMarkup({state:E.project(s,0),viewer:0,gameName:'Битва магов'});});
 const row=p.locator('.score-row').first();assert.deepEqual(await row.locator('.result-core-counters').evaluate(n=>[...n.children].map(c=>c.dataset.scoreId||'hand')),['hand','kills','ultimate','lives','health']);assert.equal(await row.locator('.token-crown .counter-token').count(),4);assert.equal(await row.locator('.token-meeple .is-empty').count(),1);
 for(const scope of [row]){
  assert(await scope.locator(':is(.token-heart,.token-meeple) .is-empty').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).fill==='rgb(255, 255, 255)')));
  const crowns=await scope.locator('.token-crown .counter-token').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right})));
  assert(crowns.every((n,i)=>!i||n.x>=crowns[i-1].right),'crowns do not overlap');
 }
 await p.screenshot({path:path.join(out,'results.png')});assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

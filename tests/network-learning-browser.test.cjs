'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

async function clickExposedCard(page,selector){
 const card=page.locator(selector).first();await card.waitFor({state:'visible'});
 const point=await card.evaluate(node=>{const r=node.getBoundingClientRect();for(let y=Math.max(1,r.top+3);y<Math.min(innerHeight,r.bottom-3);y+=4)for(let x=Math.max(1,r.left+3);x<Math.min(innerWidth,r.right-3);x+=4){const hit=document.elementFromPoint(x,y);if(hit&&(hit===node||node.contains(hit)))return {x,y};}return null;});
 if(!point)throw Error('No exposed card hit area');await page.mouse.click(point.x,point.y);
}

async function pair(run){
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const pages=[],errors=[];
 try{
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1000,height:900}});
   await context.addInitScript(i=>{
    localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'learner-'+i,name:'Player '+i,createdAt:1,updatedAt:1}));
    localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant'}));
    if(!localStorage.getItem('playroom.learning.v1.learner-'+i))localStorage.setItem('playroom.learning.v1.learner-'+i,JSON.stringify(Object.fromEntries(['uno','fleet-grid','mage-brawl','gofish','oldmaid','durak','domino','ludo','snakes','checkers','tictactoe','pexeso','dice-poker','klondike','spider'].map(g=>[g,{enabled:true,prompted:true,mastered:{}}]))));
   },i);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.PLAYROOM_TEST_ARTIFACT||server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{const update=PlayroomFirstTurnGuide.update;PlayroomFirstTurnGuide.update=context=>{window.netGuideContext=context;return update(context);};});pages.push(page);
  }
  async function start(game,turn=0,{battle=false}={}){
   for(const page of pages)await page.evaluate(()=>{window.netView?.destroy();window.netServe?.();window.netServe=null;window.netClient?.close();window.netPeer?.close?.();PlayroomFirstTurnGuide.stop();document.querySelector('#modal-root').replaceChildren();});
   const offer=await pages[0].evaluate(async({game,turn,battle})=>{
    window.netAuthority?.dispose();PlayroomPacks.activate(game);
    window.netSession=new TabletopSession(TabletopCore,game,{seed:17,unoMode:'manual',firstPlayerMode:'assigned',firstPlayer:turn,players:[{name:'Host'},{name:'Guest'}]});
    if(battle)for(let actor=0;actor<2;actor++){netSession.act(actor,{type:'auto'});netSession.act(actor,{type:'ready'});}
    window.netAuthority=new SessionAuthority(netSession);window.netPeer=await PlayroomWebRTCTransport.createHostPeer();
    const port=netAuthority.connect(1);window.netHold=false;window.netReject=false;
    window.netServe=PlayroomWebRTCTransport.serve(netPeer.channel,{...port,dispatch:command=>netHold?new Promise(resolve=>{window.netRelease=()=>resolve(port.dispatch(netReject?{...command,expectedRevision:999}:command));}):port.dispatch(command)});
    window.netClient=new PlayroomSessionClient(netAuthority.connect(0));await netClient.refresh();
    window.netDefinition=PlayroomPacks.exportView(game,netSession.packVersion);
    window.netView=PlayroomSharedViews.mount(netClient,netDefinition,{surface:'combined'});netView.render();return netPeer.offer;
   },{game,turn,battle});
   const definition=await pages[0].evaluate(()=>netDefinition);
   const answer=await pages[1].evaluate(async offer=>{window.netPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return netPeer.answer;},offer);
   await Promise.all([pages[0].evaluate(answer=>netPeer.acceptAnswer(answer),answer),pages[1].evaluate(async definition=>{
    window.netTransport=await netPeer.transport({timeout:5000});await netTransport.ready();window.netClient=new PlayroomSessionClient(netTransport);await netClient.refresh();
    window.netView=PlayroomSharedViews.mount(netClient,definition,{surface:'combined'});netView.render();
   },definition)]);
   for(const page of pages)await page.locator('.network-game').waitFor();
  }
  await run({pages,start});assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
}
const mastered=(page,game)=>page.evaluate(g=>PlayroomFirstTurnGuide.settings(g).mastered,game);

test('fresh RTC learning follows the first actionable seat and survives repeated frames', {timeout:60000},()=>pair(async({pages,start})=>{
 for(let viewer=0;viewer<2;viewer++)await pages[viewer].evaluate(viewer=>localStorage.removeItem('playroom.learning.v1.learner-'+viewer),viewer);
 await start('tictactoe',0);
 const intro=page=>page.locator('#modal-root>[data-surface-state=active] .learning-intro');
 await intro(pages[0]).waitFor();assert.equal(await intro(pages[1]).count(),0,'waiting player is not offered learning');
 assert.equal(await pages[1].evaluate(()=>netGuideContext.modelProjection===PlayroomProtocol.projectedModel(netClient.snapshot)),true,'the compact frame and guide share one authorized model');
 await pages[0].evaluate(()=>{PlayroomFirstTurnGuide.update({...netGuideContext});PlayroomFirstTurnGuide.update({...netGuideContext});});
 await intro(pages[0]).locator('[data-learning-choice=yes]').click();await pages[0].locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();
 const lessonReads=await pages[0].evaluate(()=>{
  const view=PlayroomViews.get('tictactoe'),read=view.tutorial;
  let calls=0;
  view.tutorial=Object.assign(context=>{calls++;return read(context);},read);
  try{netView.render();return calls;}finally{view.tutorial=read;}
 });
 assert.equal(lessonReads,1,'the hosted renderer uses the controller lesson for the current frame');
 await pages[0].locator('[data-sdk-guide-step~="cell"]:not([disabled])').first().click();
 await intro(pages[1]).waitFor();assert.equal(await pages[1].evaluate(()=>netClient.snapshot.revision),1);
 await intro(pages[1]).locator('[data-learning-choice=yes]').click();await pages[1].locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();
 await pages[1].locator('[data-sdk-guide-step~="cell"]:not([disabled])').first().click();
 await pages[0].waitForFunction(()=>netClient.snapshot.revision===2&&!netClient.pending&&!netGuideContext.busy);
 assert.equal(await pages[0].evaluate(()=>document.querySelector('#app').inert),false);
 assert.equal(await intro(pages[0]).count(),0,'no repeated introduction on the next turn');
}));

test('two RTC clients persist UNO help without a host command', {timeout:90000},()=>pair(async({pages,start})=>{
 for(let viewer=0;viewer<2;viewer++){
  await start('uno',viewer);const page=pages[viewer],other=pages[1-viewer];
  const otherBefore=await mastered(other,'uno');
  const revision=await page.evaluate(()=>netClient.snapshot.revision);
  await page.locator('[data-command="card-help"]').click();
  assert.equal((await mastered(page,'uno')).help,1,'help is learned on the clicking client');
  assert.deepEqual(await mastered(other,'uno'),otherBefore,'other user progress is unchanged');
  assert.equal(await page.evaluate(()=>netClient.snapshot.revision),revision,'help is local');
  await page.locator('#modal-root [data-command="close-modal"]').first().click();
  await page.evaluate(()=>netView.render());assert.equal((await mastered(page,'uno')).help,1);
 }
}));

test('two RTC clients learn manual fleet switches and follow independently', {timeout:90000},()=>pair(async({pages,start})=>{
 for(let viewer=0;viewer<2;viewer++){
  await start('fleet-grid',viewer,{battle:true});const page=pages[viewer];
  assert.equal((await mastered(page,'fleet-grid')).own,undefined,'automatic initial field is not learned');
  const revision=await page.evaluate(()=>netClient.snapshot.revision);
  for(const [goal,selector] of [['own','[data-view-key="fleet"][data-view-value="own"]'],['enemy','[data-view-key="fleet"][data-view-value="enemy"]'],['follow','[data-view-preference="followOpponent"]']]){
   await page.locator(selector).click();assert.equal((await mastered(page,'fleet-grid'))[goal],goal==='enemy'?2:1,goal);
  }
  assert.equal(await page.evaluate(()=>netClient.snapshot.revision),revision,'field controls do not dispatch');
 }
}));

test('RTC Old Maid guide follows the opponent into the card picker', {timeout:60000},()=>pair(async({pages,start})=>{
 for(let viewer=0;viewer<2;viewer++){
  await start('oldmaid',viewer);
  const page=pages[viewer],other=pages[1-viewer];
  const otherBefore=await mastered(other,'oldmaid');
  const opponent=page.locator('[data-sdk-player-choice="'+(1-viewer)+'"] .player-info');
  const dialog=page.locator('dialog[open].card-choice-dialog');
  const card=dialog.locator('button[data-card-index="0"]');
  const activeGuide=page.locator('.first-turn-guide:not([hidden]) .guide-caption');
  assert.equal(await opponent.getAttribute('data-sdk-guide-step'),'opponent');
  await activeGuide.waitFor({timeout:5000});
  assert.equal(await card.count(),0);
  await opponent.click();
  await card.waitFor();
  assert.equal(await card.getAttribute('data-sdk-guide-step'),'card');
  await dialog.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor({timeout:5000});
  assert.deepEqual(await mastered(page,'oldmaid'),{opponent:1});
  assert.deepEqual(await mastered(other,'oldmaid'),otherBefore);
  assert.equal(await page.evaluate(()=>netClient.snapshot.revision),0);
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal((await mastered(page,'oldmaid')).card,undefined);
  await opponent.click();
  await card.click();
  await page.waitForFunction(()=>netClient.snapshot.revision===1&&PlayroomFirstTurnGuide.settings('oldmaid').mastered.card===1);
  await page.evaluate(()=>netView.openHistory(0));
  await page.locator('.history-panel[aria-busy=false]').waitFor();
  assert.equal(await page.locator('[data-sdk-guide-step]').count(),0);
 }
}));

test('all multiplayer packs register guided input on host and RTC guest', {timeout:240000},()=>pair(async({pages,start})=>{
 for(const game of ['uno','fleet-grid','mage-brawl','gofish','oldmaid','durak','domino','ludo','snakes','checkers','tictactoe','pexeso','dice-poker'])for(let viewer=0;viewer<2;viewer++){
  await start(game,viewer);const page=pages[viewer],initial=await mastered(page,game),learned=[];
  for(let i=0;i<5;i++){
   await page.waitForFunction(()=>!netClient.pending&&!netGuideContext.busy,{},{timeout:10000});
   const next=await page.evaluate(()=>{
    const ctx=netGuideContext,definition=PlayroomViews.get(ctx.state.game).tutorial,seen=PlayroomFirstTurnGuide.settings(ctx.state.game).mastered;
    const guide=definition({...ctx,guideProgress:{seen:Object.keys(seen)}});
    if(ctx.state.turn!==ctx.viewer&&!guide.concurrent)return null;
    for(const step of guide.steps||[]){
     if(step.available===false||seen[step.id]||step.id==='help')continue;
     const nodes=[...document.querySelectorAll(step.selector)];
     for(let n=0;n<nodes.length;n++){
      const e=nodes[n],r=e.getBoundingClientRect();if(e.disabled||e.closest('[inert],[hidden]')||!r.width||!r.height||e.matches('[aria-pressed=true],[aria-selected=true]'))continue;
      for(const fx of [.5,.15,.85])for(const fy of [.5,.2,.8]){const x=r.left+r.width*fx,y=r.top+r.height*fy,hit=document.elementFromPoint(x,y);if(hit&&e.contains(hit))return {id:step.id,x,y};}
     }
    }return null;
   });
   if(!next)break;
   await page.mouse.click(next.x,next.y);
   await page.waitForFunction(()=>!netClient.pending&&!netGuideContext.busy,{},{timeout:10000});
   const after=await mastered(page,game);learned.push(...Object.keys(after).filter(id=>!initial[id]));
  }
  assert(learned.length,game+' viewer '+viewer+' must learn from actual controls');
  console.log(game,viewer,[...new Set(learned)].join(','));
 }
}));

test('RTC gameplay is learned only after successful acknowledgement', {timeout:60000},()=>pair(async({pages,start})=>{
 await start('tictactoe',1);const [host,guest]=pages;
 await host.evaluate(()=>{netHold=true;netReject=true;});
 await guest.locator('[data-action*="place"]').first().click();
 await host.waitForFunction(()=>typeof netRelease==='function');
 assert.deepEqual(await mastered(guest,'tictactoe'),{},'pending command is not learned');
 await host.evaluate(()=>netRelease());await guest.waitForFunction(()=>!netClient.pending);
 assert.deepEqual(await mastered(guest,'tictactoe'),{},'rejected command is not learned');
 await host.evaluate(()=>{netRelease=null;netReject=false;});
 await guest.locator('[data-action*="place"]').first().click();await host.waitForFunction(()=>typeof netRelease==='function');
 assert.deepEqual(await mastered(guest,'tictactoe'),{});
 await host.evaluate(()=>netRelease());await guest.waitForFunction(()=>Object.keys(PlayroomFirstTurnGuide.settings('tictactoe').mastered).length>0);
 assert.deepEqual(await mastered(host,'tictactoe'),{},'host does not learn guest actions');
}));

test('RTC Mage local choices and both planning steps are distinct persistent goals', {timeout:60000},()=>pair(async({pages,start})=>{
 await start('mage-brawl');
 for(const page of pages){
  await page.locator('[data-view-key="mageAction"][aria-pressed="true"]').click();
  assert.equal((await mastered(page,'mage-brawl')).movement,undefined);
  await page.locator('[data-view-key="mageAction"][data-view-value="attack"]').click();
  assert.equal((await mastered(page,'mage-brawl')).attack,2);
  await page.locator('.mage-card:not([disabled])').last().click();
  await page.locator('[data-view-key="mageDirection"]').last().click();
  await page.locator('[data-command="card-help"]').click();
  let progress=await mastered(page,'mage-brawl');assert.equal(progress.rotate,1);assert.equal(progress.help,1);assert.equal(progress.card,1);assert.equal(progress['card-second'],undefined);
  await page.locator('#modal-root [data-command="close-modal"]').first().click();
  const revision=await page.evaluate(()=>netClient.snapshot.revision);
  await page.locator('.mage-ready').click();await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.ready===1);
  assert.equal(await page.evaluate(()=>netClient.localDraft.length),1,'first plan is a private draft');
  assert.equal(await page.evaluate(()=>netClient.snapshot.revision),revision,'the first plan does not commit a revision');
  await clickExposedCard(page,'.mage-card:not([disabled]):not(.selected)');
  assert.equal((await mastered(page,'mage-brawl'))['card-second'],1);
  await page.locator('.mage-ready').click();await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered['ready-second']===1);
 }
}));

test('RTC local learning stops when disabled and survives reopening', {timeout:60000},()=>pair(async({pages,start})=>{
 await start('uno',1);const page=pages[1];
 await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('uno',false));
 await page.locator('[data-command="card-help"]').click();assert.equal((await mastered(page,'uno')).help,undefined);
 await page.locator('#modal-root [data-command="close-modal"]').first().click();
 await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('uno',true));
 await page.locator('[data-command="card-help"]').click();assert.equal((await mastered(page,'uno')).help,1);
 await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal((await mastered(page,'uno')).help,1);
}));

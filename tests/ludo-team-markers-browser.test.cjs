'use strict';
const {selectChoice,readChoice}=require('./browser-origin.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
async function gotoLudo(page,url){
 if(!process.env.PLAYROOM_LUDO_ARTIFACT)return page.goto(url);
 const body=fs.readFileSync(process.env.PLAYROOM_LUDO_ARTIFACT),hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 await page.route('**/*',route=>route.abort());await page.route(url,route=>route.fulfill({status:200,contentType:'text/html',body}));const response=await page.goto(url);assert.equal(hash(await response.body()),hash(body));
 if(process.env.PLAYROOM_LUDO_EVIDENCE_DIR){const out=process.env.PLAYROOM_LUDO_EVIDENCE_DIR;fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'artifact.json'),JSON.stringify({sha256:hash(body),engine:page.context().browser().browserType().name(),version:page.context().browser().version()},null,2));}
}

test('Ludo team discs and first-player token match in lobby and game; board symbols are centered SVGs',{timeout:45000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await gotoLudo(page,server.url);
    await page.locator('[data-start=ludo]').click();
    await page.locator('[data-command=room-rules]').click();
    await selectChoice(page.locator('#room-rules-form [name=preset]'),'teams');
    await page.locator('#room-rules-form [name=firstPlayerMode][value=assigned]').check();
    await page.locator('#room-rules-form').evaluate(form=>form.requestSubmit());
    await page.evaluate(()=>{
      const bridge=PlayroomAppBridge,room=bridge.room();
      for(const seat of room.seats.slice(1))bridge.roomService.setLocalSeat(room.id,room.ownerId,seat.id,{kind:'bot',nickname:'Бот'});
      bridge.roomService.configure(room.id,room.ownerId,{firstParticipantId:room.ownerId});
      bridge.renderLobby();
    });
    const inspect=selector=>page.locator(selector).evaluateAll(elements=>elements.map(el=>{
      const rect=el.getBoundingClientRect(),disc=el.querySelectorAll('.medallion-art circle')[1];
      return {width:rect.width,height:rect.height,color:getComputedStyle(disc).fill,viewBox:el.querySelector('svg')?.getAttribute('viewBox'),rings:el.querySelectorAll('.round-token-art>svg circle').length,content:el.textContent.trim()};
    }));
    const lobby=await inspect('.lobby-seat-row[data-participant-id] .player-medallion.is-team');
    assert.equal(lobby.length,4,'all four occupied team seats have a badge');
    assert.deepEqual(lobby.map(item=>item.color),['rgb(102, 143, 173)','rgb(206, 115, 93)','rgb(102, 143, 173)','rgb(206, 115, 93)']);
    assert(lobby.every(item=>item.width<=14&&item.height<=14&&item.viewBox==='0 0 100 100'),`small raised discs use one SVG artboard: ${JSON.stringify(lobby)}`);
    assert.equal(lobby[0].rings,1,'the first player gets the numbered ring on the team disc');
    assert(lobby.slice(1).every(item=>item.rings===0&&!item.content),'other teams have plain discs without a center dot');
    if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'ludo-teams-lobby.png')});}
    await page.locator('[data-command=lobby-start]').click();
    await page.locator('.ludo-board').waitFor();
    assert.equal(await page.locator('.app-game-layout').getAttribute('data-seat-style'),'anchors','automatic layout preserves spatial seats');
    const game=await inspect('.seat-group .player-panel .player-medallion.is-team');
    assert.equal(game.length,4,'anchored game cards keep all four team badges');
    assert.equal(await page.locator('.layout-self .player-medallion.is-team').count(),1,'own controls repeat the same team badge');
    assert(game.every(item=>item.width===lobby[0].width&&item.viewBox===lobby[0].viewBox),'lobby and game reuse the same disc artwork');
    assert.equal(game.filter(item=>item.rings===1).length,1);
    const symbols=await page.locator('.ludo-safe-star,.ludo-start-arrow').evaluateAll(elements=>elements.map(el=>{
      const symbol=el.getBoundingClientRect(),cell=el.closest('.ludo-cell').getBoundingClientRect();
      return {kind:el.classList.contains('ludo-safe-star')?'star':'arrow',tag:el.tagName,paths:el.querySelectorAll('path').length,ratio:symbol.width/cell.width,offset:Math.hypot((symbol.left+symbol.right-cell.left-cell.right)/2,(symbol.top+symbol.bottom-cell.top-cell.bottom)/2)};
    }));
    assert.equal(symbols.filter(item=>item.kind==='star').length,4);
    assert.equal(symbols.filter(item=>item.kind==='arrow').length,4);
    assert(symbols.every(item=>item.tag.toLowerCase()==='svg'&&item.paths===1&&item.offset<1),'symbols are centered SVGs');
    assert(symbols.filter(item=>item.kind==='star').every(item=>item.ratio>=.9),'stars fill almost the whole cell');
    const baseOffsets=await page.locator('.ludo-base [data-motion-anchor]').evaluateAll(anchors=>anchors.map(anchor=>{
      const id=anchor.dataset.motionAnchor.replace('base-','').split('-');
      const pawn=document.querySelector(`[data-entity="token-${id[0]}-${id[1]}"]`);
      const a=anchor.getBoundingClientRect(),b=pawn.getBoundingClientRect();
      return Math.hypot((a.left+a.right-b.left-b.right)/2,(a.top+a.bottom-b.top-b.bottom)/2);
    }));
    assert(baseOffsets.every(offset=>offset<1.5),`base pieces must sit on their circles: ${baseOffsets.join(', ')}`);
    const rings=await page.locator('.ludo-pawn').first().evaluate(pawn=>{
      pawn.classList.add('is-playable');
      const playable=getComputedStyle(pawn),available={radius:playable.borderRadius,shadow:playable.boxShadow,outline:playable.outlineStyle};
      pawn.classList.add('is-selected');
      const selected=getComputedStyle(pawn),chosen={radius:selected.borderRadius,shadow:selected.boxShadow,outline:selected.outlineStyle};
      return {available,chosen};
    });
    assert.equal(rings.available.radius,'50%');
    assert.equal(rings.chosen.radius,'50%');
    assert.notEqual(rings.available.shadow,'none');
    assert.notEqual(rings.chosen.shadow,rings.available.shadow);
    assert.equal(rings.available.outline,'none');
    assert.equal(rings.chosen.outline,'none');
    if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'ludo-teams-game.png')});
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'badges do not widen the phone layout');
    if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'ludo-teams-game-320.png')});
  }finally{await context.close();await browser.close();await server.close();}
});

test('Ludo touch selects a friendly pawn on a destination cell and commits through the chosen die',{timeout:30000},async()=>{
  require('../core/model-registration.js');
  const Core=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/ludo/rules.js');
  const saved=new Session(Core,'ludo',{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,diceCount:2,players:[{name:'Иван'},{name:'Мика'}]}).export();
  const state=saved.states[0];state.turn=0;Object.assign(state.data,{phase:'move',dice:[2,3],used:[false,false]});state.data.pawns[0]=[7,9,-1,-1];assert(Core.validateState(state));
  const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try{for(const viewport of [{width:390,height:844,scale:100},{width:844,height:390,scale:100},{width:390,height:844,scale:120},{width:844,height:390,scale:110}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:true,isMobile:true});
    await context.addInitScript(({saved,scale})=>{localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'ludo-selection-owner',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,quickPlay:false,animationSpeed:'instant',autoPass:false,interfaceScale:scale}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},{saved,scale:viewport.scale});
    const page=await context.newPage();page.setDefaultTimeout(5000);const safe=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
    try{
      await gotoLudo(page,server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('ludo',false));await page.locator('[data-hub-page=sessions]').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().tap();await page.locator('.ludo-board').waitFor();
      const pawnCenters=await page.locator('.ludo-pawn .pawn-token-art').evaluateAll(items=>items.map(svg=>({face:Number(svg.querySelector('.pawn-token-face').getAttribute('cy')),mark:Number(svg.querySelector('text').getAttribute('y'))})));assert(pawnCenters.length);assert(pawnCenters.every(item=>item.face===item.mark),'pawn numbers share the top face center');
      const initial=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.current().session.export()));
      await page.locator('[data-entity="token-0-0"]').tap();assert.equal(await page.locator('[data-entity="token-0-0"]').getAttribute('aria-pressed'),'true');
      await page.locator('[data-entity="token-0-1"]').tap();assert.equal(await page.locator('[data-entity="token-0-1"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.current().session.export())),initial,'switching to the occupied pawn must not commit a move');
      await page.locator('[data-entity="token-0-0"]').tap();
      if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`ludo-occupied-${viewport.width}-scale${viewport.scale}.png`)});}
      await page.locator('.layout-actions [data-action]').filter({visible:true}).first().tap();
      await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
      const after=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current);
      assert.deepEqual(after.data.pawns[0],[9,9,-1,-1]);assert.deepEqual(after.data.used,[true,false]);assert.equal(after.move,1);assert.equal(safe.nativeSupabaseRequests,0);
    }finally{await context.close();}
  }}finally{await browser.close();await server.close();}
});

test('Ludo history animates a failed roll even when the committed state belongs to the next player',{timeout:15000},async()=>{
  require('../core/model-registration.js');const Core=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/ludo/rules.js');
  let session;
  for(let seed=1;seed<=20;seed++){
    session=new Session(Core,'ludo',{seed,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Иван'},{name:'Мика'}]});session.act(0,{type:'roll'});
    if(session.current.turn===1)break;
  }
  assert.equal(session.current.turn,1);assert(session.current.data.dice.every(value=>value!==6));
  const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844}});
  try{
    await context.addInitScript(saved=>{localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast'}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},session.export());
    const page=await context.newPage();page.setDefaultTimeout(3500);await gotoLudo(page,server.url);await page.locator('[data-hub-page=sessions]:visible').first().click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.ludo-board').waitFor();
    await page.locator('[data-game-menu]').click();await page.locator('.game-menu-panel [data-command=history]').click();
    await page.evaluate(()=>{window.historyRolls=0;window.historyRollObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&(node.matches('[data-motion-kind="roll"]')||node.querySelector('[data-motion-kind="roll"]')))historyRolls++;});historyRollObserver.observe(document.body,{childList:true,subtree:true});});
    await page.locator('[data-command="replay-play"]').click();await page.waitForFunction(()=>historyRolls>0).catch(async error=>{error.message+=' '+JSON.stringify(await page.evaluate(()=>({dice:[...document.querySelectorAll('[data-motion-lead]')].map(e=>({lead:e.dataset.motionLead,rect:e.getBoundingClientRect().toJSON()})),history:document.querySelector('#replay-range')?.value,notice:document.querySelector('.toast')?.textContent})));throw error;});
    assert(await page.evaluate(()=>historyRolls>0));
  }finally{await context.close();await browser.close();await server.close();}
});

test('Ludo local bot resumes after menu settings and appearance interrupt a dice presentation',{timeout:45000},async()=>{
 require('../core/model-registration.js');const Core=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/ludo/rules.js');let saved,chosenSeed;
 for(let seed=1;seed<=512;seed++){const initial=new Session(Core,'ludo',{seed,mode:'solo',firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'Иван'},{name:'Тео',bot:true}]}).export();initial.states[0].data.pawns[1][0]=0;Core.validateState(initial.states[0]);const probe=Session.restore(Core,initial);probe.act(1,{type:'roll'});if(probe.current.turn===1&&probe.current.data.phase==='move'&&probe.current.data.dice.includes(2)&&probe.current.data.dice.includes(5)){saved=initial;chosenSeed=seed;break;}}
 assert(saved,'canonical seed gives the reported bot dice with a legal pawn outside base');const engine=process.env.LAB_ENGINE||'chromium',out=process.env.PLAYROOM_BOT_LIFECYCLE_EVIDENCE?path.join(process.env.PLAYROOM_BOT_LIFECYCLE_EVIDENCE,'ludo'):path.resolve(__dirname,'../../tmp_files/ux-021/ludo-modal-bot');fs.mkdirSync(out,{recursive:true});const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=engine==='webkit'?await require('playwright-core').webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});const network=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}})),page=await context.newPage(),errors=[],report={engine,actualBrowserType:browser.browserType().name(),browserVersion:browser.version(),chosenSeed,errors,steps:[]};page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await context.addInitScript(saved=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'ludo-navigation-owner',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'normal',quickPlay:false,autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
  await gotoLudo(page,server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{PlayroomFirstTurnGuide.setEnabled('ludo',false);window.ludoNavTrace=[];window.ludoPlanPlayers=new Set();for(const name of ['scheduleBot','cancelBot']){const original=SessionAuthority.prototype[name];SessionAuthority.prototype[name]=function(...args){ludoNavTrace.push({kind:'authority',name,revision:this.revision,modals:document.querySelectorAll('#modal-root>*').length});return original.apply(this,args);};}for(const name of ['play','pause','resume','cancel']){const original=PlayroomPlanPlayer.prototype[name];PlayroomPlanPlayer.prototype[name]=function(...args){ludoPlanPlayers.add(this);ludoNavTrace.push({kind:'plan',name,index:this.run?.index,paused:this.run?.paused,done:this.run?.done});return original.apply(this,args);};}});
  await page.locator('[data-hub-page=sessions]:visible').first().click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.ludo-board').waitFor();
  await page.waitForFunction(()=>{const state=PlayroomAppBridge.saveLibrary.current().session.current;return state.move===1&&state.turn===1&&state.data.phase==='move'&&document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')==='true';});
  const rolled=await page.evaluate(()=>{const state=PlayroomAppBridge.saveLibrary.current().session.current;return {move:state.move,turn:state.turn,phase:state.data.phase,dice:state.data.dice,sessionId:PlayroomAppBridge.saveLibrary.current().id};});report.steps.push({at:'bot-dice-presentation',...rolled});assert.deepEqual([...rolled.dice].sort(),[2,5]);
  await page.locator('[data-game-menu]').click();await page.locator('.game-menu-panel').waitFor();await page.locator('#modal-root>[data-surface-state=active] [data-game-menu-action][data-command=settings]').click();await page.locator('#modal-root>[data-surface-state=active] [data-settings-screen]').waitFor();
  assert.equal(await page.locator('#app').evaluate(app=>app.inert),true,'live game input remains blocked beneath settings');
  const settingsFrame=await page.locator('#modal-root>[data-surface-state=active]').getAttribute('data-surface-id');
  await page.waitForFunction(previous=>PlayroomAppBridge.saveLibrary.current().session.current.move>previous,rolled.move,{timeout:3000});
  assert.equal(await page.locator('#modal-root>[data-surface-state=active]').getAttribute('data-surface-id'),settingsFrame,'bot movement preserves the opened settings frame');report.steps.push({at:'bot-progress-under-settings',move:await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move)});
  await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();await page.locator('.game-menu-panel').waitFor();await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-game-menu-close]').click();await page.waitForFunction(()=>!document.querySelector('#modal-root>[data-surface-state=active]'));
  const snapshot=()=>page.evaluate(()=>{const entry=PlayroomAppBridge.saveLibrary.current(),state=entry.session.current;return {id:entry.id,move:state.move,turn:state.turn,bot:state.players[state.turn]?.bot,phase:state.data.phase,dice:state.data.dice,modals:document.querySelectorAll('#modal-root>*').length,busy:document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy'),plans:[...ludoPlanPlayers].map(player=>({index:player.run?.index,done:player.run?.done,paused:player.run?.paused,waiting:player.run?.waiting,effectsDone:player.run?.effectsDone,preparing:player.run?.preparing})),trace:ludoNavTrace.slice(-90)};});
  await page.waitForFunction(previous=>PlayroomAppBridge.saveLibrary.current().session.current.move>previous,rolled.move,{timeout:3000}).catch(async error=>{report.failureSnapshot=await snapshot();await page.screenshot({path:path.join(out,engine+'-stalled.png'),animations:'disabled'});throw error;});report.steps.push({at:'after-return',state:await snapshot()});assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().id),rolled.sessionId);await page.waitForFunction(()=>{const state=PlayroomAppBridge.saveLibrary.current().session.current;return state.turn===0&&document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true';});await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=pause]').click();await page.locator('.pause-cover').waitFor();
  const pausedMove=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),pausedMove,'explicit Pause retains the committed revision');await page.locator('.pause-cover [data-command=pause]').click();
  await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=home]').click();await page.locator('.game-tile').first().waitFor();
  await page.locator('[data-hub-page=profile]').click();await page.locator('[data-appearance-open]').click();await page.locator('#modal-root>[data-surface-state=active] .appearance-gallery-modal').waitFor();await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();
  await page.locator('[data-hub-page=sessions]:visible').first().click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.ludo-board').waitFor();
  const resumed=await page.evaluate(()=>({id:PlayroomAppBridge.saveLibrary.current().id,move:PlayroomAppBridge.saveLibrary.current().session.current.move}));assert.equal(resumed.id,rolled.sessionId);assert.equal(resumed.move,pausedMove,'home/appearance/resume does not duplicate a committed action');report.steps.push({at:'explicit-pause-home-appearance-resume',...resumed});
  const humanActions=[];let botEnteredAt=null;for(let step=0;step<8;step++){
   await page.waitForFunction(()=>document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true');
   const before=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,turn:s.turn,phase:s.data.phase};});if(before.turn!==0)break;
   const choice=await page.locator('.table-shell [data-action]').evaluateAll(nodes=>nodes.map((node,index)=>({index,node,action:JSON.parse(node.dataset.action)})).filter(({node,action})=>['roll','move'].includes(action.type)&&!node.disabled&&node.getClientRects().length&&getComputedStyle(node).visibility==='visible'&&!node.closest('[hidden],[inert]')).map(({index,action})=>({index,action}))[0]||null);
   assert(choice,'resumed human has an actual ordinary legal roll/move control');await page.locator('.table-shell [data-action]').nth(choice.index).tap();
   await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move>move,before.move);const after=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,turn:s.turn};});humanActions.push({before,action:choice.action,after});if(after.turn!==0){botEnteredAt=after.move;break;}
  }
  assert(humanActions.length>0,'the resumed human can actually play, rather than only view an old revision');assert.notEqual(botEnteredAt,null,'the native human turn legally hands control to the bot');
  await page.waitForFunction(move=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return s.move>move&&s.turn===0&&document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true';},botEnteredAt,{timeout:12000});
  const continued=await snapshot();assert.equal(continued.id,rolled.sessionId);assert.equal(continued.modals,0);assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);report.steps.push({at:'native-human-and-next-bot-turn-after-resume',humanActions,state:continued});
  assert.deepEqual(errors,[]);assert.equal(network.nativeSupabaseRequests,0);
 }finally{fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify({...report,nativeSupabaseRequests:network.nativeSupabaseRequests},null,2));await context.close();await browser.close();await server.close();}
});


test('diagnostics downloads bounded timings and a replayable Ludo save through settings',{timeout:60000},async()=>{
 require('../core/model-registration.js');const E=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/ludo/rules.js');
 const saved=new Session(E,'ludo',{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,diceCount:2,players:[{name:'Иван'},{name:'Мика'}]}).export();Object.assign(saved.states[0].data,{phase:'move',dice:[2,3],used:[false,false]});saved.states[0].data.pawns[0]=[7,9,-1,-1];assert(E.validateState(saved.states[0]));
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const provider=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local diagnostic fixture'}}));
 const active=()=>page.locator('#modal-root>[data-surface-state=active]');
 async function settings(){await page.locator('[data-game-menu]').click();await page.locator('#modal-root>[data-surface-state=active] [data-game-menu-action][data-command=settings]').click();await page.locator('[data-settings-tab=behavior]').click();await page.locator('.settings-diagnostics>summary').click();await page.locator('#setting-diagnostics').waitFor({state:'visible'});}
 try{
  await context.addInitScript(saved=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'diag-owner',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:true,volume:.3,tutorialsEnabled:false,animationSpeed:'fast',autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
  await gotoLudo(page,server.url);await page.locator('[data-hub-page=sessions]:visible').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.ludo-board').waitFor();assert.equal(await page.evaluate(()=>PlayroomDiagnostics.enabled),false);
  await settings();await page.locator('#setting-diagnostics').check();assert.equal(await page.evaluate(()=>PlayroomDiagnostics.enabled),true);await active().locator('.modal-head [data-command=close-modal]').click();await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-game-menu-close]').click();
  await page.locator('[data-entity="token-0-0"]').tap();await page.locator('.layout-actions [data-action]').filter({visible:true}).first().tap();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.waitForFunction(()=>document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{const start=performance.now();while(performance.now()-start<80){}resolve();})));
  if(await page.evaluate(()=>PerformanceObserver.supportedEntryTypes.includes('longtask')))await page.waitForFunction(()=>PlayroomDiagnostics.buffer.some(e=>e?.kind==='longtask'));
  await settings();const downloading=page.waitForEvent('download');await page.locator('[data-diagnostics-download]').click();const download=await downloading,raw=fs.readFileSync(await download.path(),'utf8'),report=JSON.parse(raw);assert.match(download.suggestedFilename(),/^hod-diagnostics-.*\.json$/);assert.equal(report.format,'playroom-diagnostics');assert.equal(report.game.status,'included');assert.equal(report.game.value.format,'playroom-save');const portable=await require('../application/save-transfer.js').inspect(JSON.stringify(report.game.value));assert.equal(portable.payload.options.lobbyConfig,undefined);assert.equal(Session.restore(E,portable.payload).current.move,1);
  for(const kind of ['capture.start','sample','action','render','save','presentation','timer.arm','timer.fire','audio.prepare','audio.play','audio.group','animation.start','animation.end'])assert(report.events.some(e=>e.kind===kind),'missing '+kind);assert(report.events.some(e=>e.kind==='sample'&&e.scheduler&&Number.isInteger(e.domNodes)&&Number.isInteger(e.storagePending)&&e.geometry&&Number.isInteger(e.geometry.observed)));assert(report.events.some(e=>e.kind==='audio.group'&&typeof e.completed==='boolean'));assert.equal(provider.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
  await page.locator('#setting-diagnostics').uncheck();const stopped=await page.evaluate(()=>({enabled:PlayroomDiagnostics.enabled,written:PlayroomDiagnostics.written,observers:PlayroomDiagnostics.observers.length,listeners:PlayroomDiagnostics.listeners.length,raf:PlayroomDiagnostics.raf,timer:PlayroomDiagnostics.timer}));assert.deepEqual(stopped,{enabled:false,written:stopped.written,observers:0,listeners:0,raf:null,timer:null});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>PlayroomDiagnostics.written),stopped.written);
  const out=process.env.PLAYROOM_DIAGNOSTIC_EVIDENCE_DIR;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'download.json'),raw);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({engine:browser.browserType().name(),version:browser.version(),events:report.events.length,gameMove:1,stopped,errors},null,2));await page.screenshot({path:path.join(out,'settings.png')});}
 }finally{await context.close();await browser.close();await server.close();}
});

test('large Ludo settings navigation preserves the game and reports native menu work',{timeout:90000},async()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js');require('../core/model-registration.js');require('../packs/ludo/rules.js');
 let payload;if(process.env.PLAYROOM_MENU_SAVE_INPUT)payload=JSON.parse(fs.readFileSync(process.env.PLAYROOM_MENU_SAVE_INPUT,'utf8')).payload;else{const s=new Session(E,'ludo',{seed:17,mode:'solo',players:Array.from({length:4},(_,i)=>({name:'P'+i,bot:true}))});for(let i=0;i<300&&s.current.status==='playing';i++)s.act(s.current.turn,E.botAction(s.current));payload=JSON.parse(s.serialize());}
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,isMobile:true}),page=await context.newPage(),out=process.env.PLAYROOM_MENU_EVIDENCE_DIR||path.resolve(__dirname,'../../tmp_files/ux-021/user-menu-save-1104/menu');fs.mkdirSync(out,{recursive:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local menu fixture'}}));let cdp;
 try{
  await context.addInitScript(payload=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'menu-owner',name:'Игрок',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,animationSpeed:'normal',autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(payload));},payload);
  await gotoLudo(page,server.url);await page.locator('[data-hub-page=sessions]:visible').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.ludo-board').waitFor();await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=pause]').click();await page.locator('.pause-cover').waitFor();
  await page.evaluate(()=>{window.menuMetrics=[];for(const name of ['project','legalActions','botAction']){const original=TabletopCore[name];TabletopCore[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{menuMetrics.push({name,duration:performance.now()-start});}};}});
  await page.evaluate(()=>{const restore=TabletopSession.restore;TabletopSession.restore=function(...args){const start=performance.now();try{return restore.apply(this,args);}finally{menuMetrics.push({name:'restore',duration:performance.now()-start});}};});
  if(browser.browserType().name()==='chromium'){cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  const times=[];
  for(let cycle=0;cycle<3;cycle++){
   await page.locator('[data-game-menu]').click();let start=Date.now();await page.locator('#modal-root>[data-surface-state=active] [data-game-menu-action][data-command=settings]').click();await page.locator('[data-settings-screen]').waitFor();const open=Date.now()-start;start=Date.now();await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();await page.locator('#modal-root>[data-surface-state=active] .game-menu-panel').waitFor();const close=Date.now()-start;await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-game-menu-close]').click();times.push({cycle,open,close});
  }
  if(cdp){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(out,'menu.cpuprofile'),JSON.stringify(profile));await cdp.detach();}
  const metrics=await page.evaluate(()=>menuMetrics);assert.equal(await page.locator('.pause-cover').count(),1);assert.equal(metrics.filter(e=>e.name==='restore').length,0,'opening or validating a game menu never restores game history');
  await page.locator('[data-game-menu]').click();await page.locator('#modal-root>[data-surface-state=active] [data-game-menu-action][data-command=home]').click();await page.locator('.hub-shell-v021').waitFor();await page.evaluate(()=>{menuMetrics.length=0;window.dispatchEvent(new Event('playroom:save-library-changed'));});
  const hubTimes=[];for(const mode of ['list','3','2']){const start=Date.now();await page.locator('[data-catalog-mode="'+mode+'"]').click();assert.equal(await page.locator('.hub-shell-v021').getAttribute('data-catalog-view'),mode);hubTimes.push({mode,elapsed:Date.now()-start});}
  for(const tab of ['profile','games'])await page.locator('[data-hub-page="'+tab+'"]:visible').click();const hubMetrics=await page.evaluate(()=>menuMetrics);assert.equal(hubMetrics.filter(e=>e.name==='restore').length,0,'hub navigation and known-save refresh never restore game history');fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify({engine:browser.browserType().name(),times,metrics,hubTimes,hubMetrics,errors},null,2));assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('finished Ludo history returns to results and lobby retains results until a new match',{timeout:90000},async()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js');require('../core/model-registration.js');require('../packs/ludo/rules.js');let payload;
 if(process.env.PLAYROOM_FINISHED_SAVE_INPUT)payload=JSON.parse(fs.readFileSync(process.env.PLAYROOM_FINISHED_SAVE_INPUT,'utf8')).payload;else{const session=new Session(E,'ludo',{seed:17,mode:'solo',players:[{name:'P0'},{name:'P1',bot:true}]});for(let i=0;i<2000&&session.current.status==='playing';i++)session.act(session.current.turn,E.botAction(session.current));assert.equal(session.current.status,'finished');payload=JSON.parse(session.serialize());}
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,isMobile:true}),page=await context.newPage(),active=()=>page.locator('#modal-root>[data-surface-state=active]');await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local results fixture'}}));
 try{
  const id='legacy-ludo-'+payload.createdAt;
  await context.addInitScript(({payload,id})=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'result-owner',name:'Игрок',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,animationSpeed:'instant',autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(payload));sessionStorage.setItem('playroom.navigation.v1',JSON.stringify({screen:'table',sessionId:id}));},{payload,id});
  await gotoLudo(page,server.url);await active().locator('.result-modal').waitFor();const initial=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.current().session.current));
  async function historyBack(){await active().locator('[data-command=result-replay]').click();await page.locator('#replay-range').waitFor();await page.locator('.game-frame-tools [data-command=history-close]').click();await active().locator('.result-modal').waitFor();assert.equal(await page.locator('#replay-range').count(),0);}
  await historyBack();await active().locator('[data-command=rematch]').click();await active().locator('.lobby-shell').waitFor();assert.equal(await active().locator('[data-command=stop-local-match]').count(),0);await active().locator('[data-command=result]').click();await active().locator('.result-modal').waitFor();await historyBack();await active().locator('.modal-head [data-command=close-modal]').click();await active().locator('.lobby-shell').waitFor();assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.current().session.current)),initial);
  await active().locator('[data-command=lobby-start]').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.status==='playing');await page.locator('.ludo-board').waitFor();await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=room]').click();await active().locator('.lobby-shell').waitFor();assert.equal(await active().locator('[data-command=result]').count(),0);assert.equal(await active().locator('[data-command=stop-local-match]').count(),1);assert.equal(await page.evaluate(id=>PlayroomAppBridge.saveLibrary.open(id).current.status,id),'finished');
 }finally{await context.close();await browser.close();await server.close();}
});

test('Resume unlocks bot audio before a human move and menu feedback plays independently',{timeout:60000},async()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js');require('../core/model-registration.js');require('../packs/ludo/rules.js');const saved=new Session(E,'ludo',{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'P0'},{name:'Bot',bot:true}]}).export();
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},hasTouch:true,isMobile:true}),page=await context.newPage();await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local audio fixture'}}));
 try{
  await context.addInitScript(saved=>{window.audioProbe=[];Object.defineProperty(globalThis,'TabletopAudio',{configurable:true,set(Audio){Object.defineProperty(globalThis,'TabletopAudio',{value:Audio,writable:true,configurable:true});const play=Audio.prototype.play;Audio.prototype.play=function(id,options){const result=play.call(this,id,options);result.then(ok=>audioProbe.push({id,pack:options?.pack,ok,state:this._context?.state}));return result;};}});localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'audio-owner',name:'P0',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:true,uiSounds:true,volume:.3,tutorialsEnabled:false,animationSpeed:'fast',autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
  await gotoLudo(page,server.url);await page.locator('[data-hub-page=sessions]:visible').tap();await page.locator('.saved-game[data-saved-actions-toggle]').first().tap();await page.locator('[data-resume-id]:visible').first().tap();await page.waitForFunction(()=>audioProbe.some(e=>e.pack==='ludo'&&e.ok&&e.state==='running'));await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.turn===0&&document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')==='false'&&!PlayroomAppBridge.audio.busy);
  const prior=await page.evaluate(()=>audioProbe.length);await page.locator('[data-game-menu]').tap();await page.waitForFunction(prior=>audioProbe.slice(prior).some(e=>e.pack==='app-feedback'&&e.id==='menu.open'&&e.ok),prior);await page.waitForTimeout(260);await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-game-menu-close]').tap();await page.waitForFunction(prior=>audioProbe.slice(prior).some(e=>e.pack==='app-feedback'&&e.id==='menu.close'&&e.ok),prior);
 }finally{await context.close();await browser.close();await server.close();}
});

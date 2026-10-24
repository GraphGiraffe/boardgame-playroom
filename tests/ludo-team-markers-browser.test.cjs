'use strict';
const {selectChoice,readChoice}=require('./browser-origin.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

test('Ludo team discs and first-player token match in lobby and game; board symbols are centered SVGs',{timeout:45000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await page.goto(server.url);
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
    await context.addInitScript(({saved,scale})=>{localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',autoPass:false,interfaceScale:scale}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},{saved,scale:viewport.scale});
    const page=await context.newPage();page.setDefaultTimeout(5000);
    try{
      await page.goto(server.url);await page.locator('.resume-banner [data-command="resume"]').tap();await page.locator('.ludo-board').waitFor();
      const initial=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));
      await page.locator('[data-entity="token-0-0"]').tap();assert.equal(await page.locator('[data-entity="token-0-0"]').getAttribute('aria-pressed'),'true');
      await page.locator('[data-entity="token-0-1"]').tap();assert.equal(await page.locator('[data-entity="token-0-1"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),initial,'switching to the occupied pawn must not commit a move');
      await page.locator('[data-entity="token-0-0"]').tap();
      if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`ludo-occupied-${viewport.width}.png`)});}
      await page.locator('.layout-actions [data-action]').filter({visible:true}).first().tap();
      await page.waitForFunction(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===1);
      const after=await page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current);
      assert.deepEqual(after.data.pawns[0],[9,9,-1,-1]);assert.deepEqual(after.data.used,[true,false]);assert.equal(after.move,1);
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
    const page=await context.newPage();page.setDefaultTimeout(3500);await page.goto(server.url);await page.locator('.resume-banner [data-command="resume"]').click();await page.locator('.ludo-board').waitFor();
    await page.locator('.table-tools [data-command="history"]').click();
    await page.evaluate(()=>{window.historyRolls=0;window.historyRollObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&(node.matches('[data-motion-kind="roll"]')||node.querySelector('[data-motion-kind="roll"]')))historyRolls++;});historyRollObserver.observe(document.body,{childList:true,subtree:true});});
    await page.locator('[data-command="replay-play"]').click();await page.waitForFunction(()=>historyRolls>0).catch(async error=>{error.message+=' '+JSON.stringify(await page.evaluate(()=>({dice:[...document.querySelectorAll('[data-motion-lead]')].map(e=>({lead:e.dataset.motionLead,rect:e.getBoundingClientRect().toJSON()})),history:document.querySelector('#replay-range')?.value,notice:document.querySelector('.toast')?.textContent})));throw error;});
    assert(await page.evaluate(()=>historyRolls>0));
  }finally{await context.close();await browser.close();await server.close();}
});

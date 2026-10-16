'use strict';
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
    await page.locator('#room-rules-form [name=preset]').selectOption('teams');
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
    await page.locator('.table-tools [data-command=settings]').click();
    await page.locator('#setting-seating').selectOption('circle');await page.locator('.modal [data-command=close-modal]').click();
    assert.equal(await page.locator('.app-game-layout').getAttribute('data-seat-style'),'edge');
    await page.locator('.table-tools [data-command=settings]').click();
    await page.locator('#setting-seating').selectOption('anchors');await page.locator('.modal [data-command=close-modal]').click();
    assert.equal(await page.locator('.app-game-layout').getAttribute('data-seat-style'),'anchors');
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

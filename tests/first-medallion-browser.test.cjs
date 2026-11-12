'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

test('first-player token is a centered number on the same raised disc in lobby and game',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await page.goto(server.url);
    await page.locator('[data-start=checkers]').click();await page.locator('[data-game-mode=hotseat]').click();
    await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
    const inspect=selector=>page.locator(selector).evaluate(el=>{
      const svg=el.querySelector('.medallion-art'),disc=svg?.querySelectorAll('circle')[1],number=svg?.querySelector('text');
      const a=disc?.getBoundingClientRect(),b=number?.getBoundingClientRect(),rect=el.getBoundingClientRect();
      return {fill:disc?getComputedStyle(disc).fill:null,width:rect.width,centerOffset:a&&b?Math.abs((a.left+a.right-b.left-b.right)/2):null,verticalOffset:a&&b?Math.abs((a.top+a.bottom-b.top-b.bottom)/2):null,number:!!number,withinFace:a&&b?b.left>a.left&&b.right<a.right&&b.top>a.top&&b.bottom<a.bottom:false,viewBox:svg?.getAttribute('viewBox')};
    });
    const button=await inspect('[data-first-token] .player-medallion');
    const lobby=await inspect('.room-v021-row[data-participant-id] .player-medallion.is-first');
    for(const mark of [button,lobby]){
      assert.equal(mark.fill,'rgb(234, 223, 192)');
      assert.equal(mark.viewBox,'0 0 100 100');
      assert.equal(mark.number,true);
      assert(mark.centerOffset<.2,`number is off center by ${mark.centerOffset}px`);
      assert(mark.verticalOffset<.7,`number is vertically off center by ${mark.verticalOffset}px`);
      assert.equal(mark.withinFace,true,'number must fit the top face');
    }
    assert(button.width>lobby.width,'assignment control uses a larger version of the same token');
    if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'first-medallion-lobby.png')});}
    await page.locator('[data-command=lobby-start]').click();
    const game=await inspect('.layout-self .player-medallion.is-first');
    assert.equal(game.fill,lobby.fill);
    // Transformed DOMRect values can differ by millionths of a CSS pixel.
    assert(Math.abs(game.width-lobby.width)<.001,`disc width differs between lobby and game: ${lobby.width}px vs ${game.width}px`);
    assert(game.centerOffset<1.5);
    if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'first-medallion-game.png')});
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'token must not widen the phone layout');
    assert.equal(await page.locator('.layout-self .player-medallion.is-first').isVisible(),true);
  }finally{await context.close();await browser.close();await server.close();}
});

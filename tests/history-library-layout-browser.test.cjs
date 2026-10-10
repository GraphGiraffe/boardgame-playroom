'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),Core=require('../core/engine.js'),Session=require('../core/session.js');
for(const game of ['checkers','uno','domino','durak','snakes'])require(root+'/packs/'+game+'/rules.js');
function saved(game,finished=false){const s=new Session(Core,game,{seed:17,mode:'solo',preset:'classic',players:[{name:'Иван'},{name:'Мика',bot:true}]});for(let i=0;i<8&&s.current.status==='playing';i++)s.act(s.current.turn,Core.botAction(s.current));if(finished){const apply=Core.applyAction;Core.applyAction=(...args)=>{const next=apply(...args);Core.finish(next,0,'Иван побеждает');return next;};try{s.act(s.current.turn,Core.botAction(s.current));}finally{Core.applyAction=apply;}}return s.export();}
test('complete local and projected replay scenes fit beside reachable history controls',{timeout:90000},async t=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try{for(const [width,height] of [[320,640],[390,740],[740,390],[1280,720]])for(const game of ['checkers','uno','domino','durak','snakes'])await t.test(game+' '+width+'×'+height,async()=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true}),page=await context.newPage(),fixture=saved(game),errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await context.addInitScript(f=>localStorage.setItem('playroom.session.v1',JSON.stringify(f)),fixture);
      await page.goto(server.url);await page.locator('[data-command=sessions]').first().click();await page.locator('[data-resume-id]').first().click();await page.locator('.table-tools [data-command=history]').click();
      async function fits(){await page.waitForTimeout(60);const box=await page.evaluate(()=>{
        const scene=document.querySelector('.scene.replaying'),stage=scene.firstElementChild,s=scene.getBoundingClientRect(),r=stage.getBoundingClientRect(),panel=document.querySelector('.history-panel').getBoundingClientRect();
        return {overflow:document.documentElement.scrollHeight-innerHeight,stageHeight:r.height,sceneHeight:scene.clientHeight,left:r.left,right:r.right,sceneLeft:s.left,sceneRight:s.right,panelBottom:panel.bottom,height:innerHeight,zoom:stage.style.zoom,parts:[...document.querySelectorAll('.table-header,.player-strip,.history-panel')].map(e=>({name:e.className,height:e.getBoundingClientRect().height}))};});
        assert.ok(box.overflow<=2,'history must fit the viewport '+JSON.stringify(box));assert.ok(box.stageHeight<=box.sceneHeight+2,'the complete board must fit '+JSON.stringify(box));assert.ok(box.left>=box.sceneLeft-2&&box.right<=box.sceneRight+2,'board must fit horizontally');assert.ok(box.panelBottom<=box.height,'history controls must remain visible');
        const positions=await page.evaluate(()=>{const header=document.querySelector('.table-header').getBoundingClientRect(),settings=document.querySelector('.table-tools [data-command=settings]').getBoundingClientRect(),help=document.querySelector('.table-tools [data-command=rules]').getBoundingClientRect(),back=document.querySelector('.table-heading [data-command=history-close]').getBoundingClientRect();return {header:header.height,settingsX:settings.x,helpX:help.x,settingsY:settings.y,helpY:help.y,backX:back.x,backY:back.y,target:settings.width};});
        assert.ok(positions.settingsX>positions.helpX&&Math.abs(positions.settingsY-positions.helpY)<=1,'Help and settings must stay at the right edge on one row');
        assert.ok(positions.backX<positions.helpX&&Math.abs(positions.backY-positions.settingsY)<=1,'History return stays at the left of the same header');
        assert.ok(positions.header<=52&&positions.target>=44,'A horizontal header must retain reachable icon buttons');

      }
      await fits();
      if(width===390&&game==='checkers'){await page.setViewportSize({width:740,height:390});await fits();await page.setViewportSize({width,height});await fits();}
      if(process.env.PLAYROOM_CAPTURE_DIR&&width===390&&game==='checkers'){
        require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'history-checkers-390.png'),animations:'disabled'});
      }
      assert.equal(await page.locator('.history-panel .replay-badge:visible').count(),1);
      assert.equal(await page.locator('.table-bottom:visible').count(),0,'event description must appear only in the history panel');
      await page.locator('#replay-range').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await fits();
      await page.locator('[data-command=replay-next]').click();await fits();
      await page.evaluate(f=>{
        const s=TabletopSession.restore(TabletopCore,f),a=new SessionAuthority(s),binding=a.connect(0),client={snapshot:binding.snapshot(),pending:null,subscribe:()=>()=>{},history:i=>Promise.resolve(binding.history(i)),send:()=>Promise.reject(Error('Read only'))};
        window.qaHistory=PlayroomSharedViews.mount(client,PlayroomAppBridge.packs.exportView(s.game,s.packVersion),{readOnly:true});qaHistory.render();return qaHistory.openHistory(s.states.length-1);
      },fixture);
      await fits();assert.deepEqual(errors,[]);await page.evaluate(()=>qaHistory.destroy());
    }finally{await context.close();}
  });}finally{await browser.close();await server.close();}
});

test('saved games share icon controls and local history opens directly without advancing the match',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),fixture=saved('checkers');
  try{
    const completed={...saved('checkers',true),libraryId:'qa-finished'};
    await context.addInitScript(({fixture,completed})=>{localStorage.setItem('playroom.session.v1',JSON.stringify(fixture));localStorage.setItem('playroom.paused.v1.qa-finished',JSON.stringify(completed));},{fixture,completed});await page.goto(server.url);
    await page.evaluate(()=>{
      PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>[
        {sessionId:'qa-host',role:'host',game:'uno',packVersion:'0.2.1',revision:62,players:['Иван','Алиса'],name:'Комната Иван',updatedAt:Date.now()},
        {id:'qa-client',role:'client',game:'uno',packVersion:'0.2.1',revision:62,savedFrames:63,players:['Иван','Алиса'],name:'Комната Иван',updatedAt:Date.now()-1}
      ]};
    });
    await page.locator('[data-command=sessions]').first().click();await page.locator('[data-network-session-id="qa-host"]').waitFor();
    for(const card of await page.locator('.saved-game').all()){
      const buttons=card.locator('.saved-history,.saved-continue');assert.equal(await buttons.count(),2);
      for(const button of await buttons.all()){
        assert.equal((await button.innerText()).trim(),'');assert.ok(await button.getAttribute('aria-label'));assert.ok(await button.getAttribute('title'));
        const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'icon targets must stay touch-sized');
      }
    }
    if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'saved-games-390.png'),fullPage:true,animations:'disabled'});
    assert.equal(await page.locator('[data-session-id="qa-finished"] .saved-continue').isDisabled(),true);
    await page.locator('.saved-game:has(.saved-continue:not(:disabled)) [data-history-id]').click();await page.locator('.history-panel').waitFor();
    assert.equal(await page.locator('.scene [data-action]').count(),0);
    assert.equal(await page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move),fixture.states.at(-1).move);
    await page.locator('[data-command=history-close]').click();assert.equal(await page.locator('.scene.replaying').count(),0);
    await page.locator('.table-heading [data-command=home]').click();await page.locator('[data-command=sessions]').first().click();
    await page.locator('[data-session-id="qa-finished"] [data-history-id]').click();await page.locator('.history-panel').waitFor();assert.equal(await page.locator('.table-tools [data-command=result]').count(),1);
  }finally{await context.close();await browser.close();await server.close();}
});

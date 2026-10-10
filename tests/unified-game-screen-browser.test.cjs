'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Core=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..');
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const def={manifest:JSON.parse(source('packs/uno/manifest.json')),view:source('packs/uno/view.js'),styles:source('packs/uno/styles.css'),rules:['Карты UNO']};

for(const [width,height,touch] of [[320,740,true],[390,740,false],[740,390,false]]){
  test(`history input renders before release, preserves the slider and rejects stale frames (${width}px)`,{timeout:50000},async()=>{
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    try{
      await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
      for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css'])await page.addStyleTag({content:source(file)});
      for(const file of ['core/ui.js','core/player-target.js','core/motion.js','core/game-flow.js','core/hand-overflow.js','app/views.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
      const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',players:[{name:'А'},{name:'Б'}]});
      const authority=new Authority(session),audience=authority.connect(0);
      for(let i=0;i<4;i++){
        const actor=session.current.turn,actions=Core.legalActions(session.current,actor);
        session.act(actor,actions.find(a=>a.type==='draw')||actions.find(a=>a.type==='pass')||actions[0]);
      }
      const frames=session.states.map((_,i)=>audience.history(i)),snapshot=audience.snapshot();
      await page.evaluate(({snapshot,frames,def,readOnly})=>{
        window.qaAudio=[];window.qaFrames=frames;window.qaRequests=[];window.qaDelayed=false;
        window.PlayroomAppBridge={audio:{registerPack(){},play(...args){qaAudio.push(args);}}};
        const client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('History cannot send commands');},
          history(index){if(!qaDelayed)return Promise.resolve(qaFrames[index]);return new Promise((resolve,reject)=>qaRequests.push({index,resolve,reject}));}};
        window.qaClient=client;window.qaGame=PlayroomSharedViews.mount(client,def,{readOnly});qaGame.render();
      },{snapshot,frames,def,readOnly:width===740});
      await page.evaluate(()=>qaGame.openHistory(4));
      await page.locator('#replay-range').evaluate(slider=>{window.qaSlider=slider;slider.focus();slider.value='0';slider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('.turn-extra')?.textContent==='Ход 0 из 4');
      assert.equal(await page.evaluate(()=>qaSlider===document.querySelector('#replay-range')&&qaSlider===document.activeElement),true,'Input and focus must survive asynchronous rendering');
      const initialScene=await page.locator('.scene').innerHTML();
      const box=await page.locator('#replay-range').boundingBox(),y=box.y+box.height/2;
      const from=box.x+10,to=box.x+box.width-10;
      let cdp;
      if(touch){
        cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to,y}]});
      }else{await page.mouse.move(from,y);await page.mouse.down();await page.mouse.move(to,y,{steps:8});}
      await page.waitForFunction(()=>document.querySelector('.turn-extra')?.textContent==='Ход 4 из 4');
      assert.notEqual(await page.locator('.scene').innerHTML(),initialScene,'The board must change while pointer is held');
      assert.equal(await page.evaluate(()=>qaSlider===document.querySelector('#replay-range')),true);
      if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
      await page.waitForFunction(()=>document.querySelector('.history-panel')?.getAttribute('aria-busy')==='false');
      await page.evaluate(()=>{qaDelayed=true;qaSlider.value='1';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===1);
      await page.evaluate(()=>{qaSlider.value='3';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===2);
      await page.evaluate(()=>qaRequests[1].resolve(qaFrames[3]));
      await page.waitForFunction(()=>document.querySelector('.turn-extra')?.textContent==='Ход 3 из 4');
      await page.evaluate(()=>qaRequests[0].resolve(qaFrames[1]));
      assert.equal(await page.locator('.turn-extra').textContent(),'Ход 3 из 4','Late frame cannot roll the scene back');
      const lastScene=await page.locator('.scene').innerHTML();
      await page.evaluate(()=>{qaSlider.value='2';qaSlider.dispatchEvent(new Event('change',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===3);
      await page.evaluate(()=>qaRequests[2].resolve({...qaFrames[2],viewer:1}));
      await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Некорректная история.');
      assert.equal(await page.locator('.scene').innerHTML(),lastScene,'Wrong-viewer frames must never reach the scene');
      assert.equal(await page.locator('.scene [data-action]').count(),0);
      assert.equal(await page.locator('.opponent-hand .uno-art-face').count(),0);
      assert.deepEqual(await page.evaluate(()=>qaAudio),[]);
      assert.equal(await page.evaluate(()=>qaClient.snapshot.revision),snapshot.revision);
      await page.evaluate(()=>{qaSlider.value='1';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===4);
      await page.locator('[data-command=history-close]').click();
      await page.evaluate(()=>qaRequests[3].reject(Error('obsolete RPC')));
      assert.equal(await page.locator('.history-panel').count(),0);
      assert.equal(await page.locator('#toast').textContent(),'Некорректная история.','A stale failure must not replace the current message');
      await page.evaluate(()=>qaGame.destroy());
    }finally{await page.close();await browser.close();}
  });
}

test('the projected network game reuses the bot GameScreen, opponents and inline history without exposing secret faces',{timeout:50000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  try{
    await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
    for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css'])await page.addStyleTag({content:source(file)});
    for(const file of ['core/ui.js','core/player-target.js','core/motion.js','core/game-flow.js','core/hand-overflow.js','app/views.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
    const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',unoMode:'manual',players:[{name:'Игрок А'},{name:'Игрок Б'}],openHands:false});
    const authority=new Authority(session);
    const audience=authority.connect(0);
    const snapshots=[audience.history(0)];
    const actor=session.current.turn;
    const action=Core.legalActions(session.current,actor).find(a=>a.type==='draw')||Core.legalActions(session.current,actor)[0];
    if(action){session.act(actor,action);snapshots.push(audience.history(1));}
    const snapshot=audience.snapshot(),publicSnapshot=authority.connect(-1).snapshot();
    assert(snapshot.state.data.hands[1].every(c=>c.hidden),'Private opponent cards must be absent from projected snapshots');
    await page.evaluate(({snapshot,snapshots,def})=>{
      const listeners=new Set();
      const client={snapshot,pending:null,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
        async history(index){return snapshots[index];},async send(){throw Error('Do not change authoritative state in read-only layout test');}};
      window.game=PlayroomSharedViews.mount(client,def,{surface:'combined'});game.render();
    },{snapshot,snapshots,def});
    const shell=page.locator('.table-shell.network-game');
    assert.equal(await shell.count(),1);
    assert.equal(await shell.locator('.player-strip .player-token').count(),2);
    assert.equal(await shell.locator('.scene .opponent-hand').count(),1);
    assert.equal(await shell.locator('.player-strip').isVisible(),true,'Player details must be visible, not just in the DOM');
    assert.equal(await shell.locator('.scene .opponent-hand').isVisible(),true,'Opponent hand must be visible');
    assert.equal(await shell.locator('.scene .own-hand').count(),1);
    assert.equal(await shell.locator('.scene .opponent-hand .uno-art-face').count(),0);
    assert.equal(await shell.locator('.table-tools [data-command=history] svg').count(),1);
    assert.equal(await shell.locator('.scene .uno-player-targets').count(),0,'No extra player-only accusation bar');
    const viewport=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert(viewport.width<=viewport.client+1,'Shared screen must fit mobile width');
    await page.evaluate(()=>{window.localClicks=0;document.addEventListener('click',()=>window.localClicks++);});
    await shell.locator('[data-command=history]').click();
    await shell.locator('.history-panel').waitFor();
    assert.equal(await shell.locator('.history-controls').count(),1);
    assert.equal(await shell.locator('.scene [data-action]').count(),0,'History is read-only');
    await shell.locator('.history-panel [data-command=history-close]').click();
    assert.equal(await page.evaluate(()=>window.localClicks),0,'Network interactions must not reach the local Session click handler');
    assert.equal(await shell.locator('.history-panel').count(),0);
    await page.setViewportSize({width:740,height:390});
    assert.equal(await shell.locator('.player-strip .player-token').count(),2);
    assert.equal(await shell.locator('.uno-bottom-dock').count(),1);
    await page.evaluate(()=>game.destroy());
    // Table mode is read-only and must not inherit a player's own hand.
    await page.evaluate(({snapshot,def})=>{
      const client={snapshot,pending:null,subscribe(){return()=>{};},history:async()=>{throw Error('Not requested');}};
      window.publicGame=PlayroomSharedViews.mount(client,def,{surface:'table'});publicGame.render();
    },{snapshot:publicSnapshot,def});
    assert.equal(await page.locator('.network-game').getAttribute('data-viewer'),'-1');
    assert.equal(await page.locator('.network-game .scene .own-hand').count(),0);
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0);
    assert.equal(await page.locator('.network-game .scene .opponent-hand').count(),2);
    assert.equal(await page.locator('.network-game .scene .uno-art-face').count(),1,'Only the public discard may show a card face');
    await page.evaluate(()=>publicGame.destroy());
  }finally{await page.close();await browser.close();}
});

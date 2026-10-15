'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Core=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..');
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const compiled={};require('node:vm').runInNewContext(source('installed-packs.js'),compiled);
const bundle=compiled.PlayroomInstalledPacks.find(item=>item.manifest.id==='uno');
const def={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:['Карты UNO']};

for(const [width,height,touch] of [[320,740,true],[390,740,false],[740,390,false]]){
  test(`history input renders before release, preserves the slider and rejects stale frames (${width}px)`,{timeout:50000},async()=>{
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    try{
      await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
      for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css','app/design-system.css'])await page.addStyleTag({content:source(file)});
      for(const file of ['presentation/localization.js','core/protocol.js','core/component-assets.js','core/ui.js','core/player-target.js','core/motion.js','presentation/scheduler.js','core/game-flow.js','core/hand-overflow.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
      const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',players:[{name:'А'},{name:'Б'}]});
      const authority=new Authority(session),audience=authority.connect(0);
      for(let i=0;i<4;i++){
        const actor=session.current.turn,actions=Core.legalActions(session.current,actor);
        session.act(actor,actions.find(a=>a.type==='draw')||actions.find(a=>a.type==='pass')||actions[0]);
      }
      const frames=session.states.map((_,i)=>audience.history(i)),snapshot=audience.snapshot();
      await page.evaluate(({snapshot,frames,def,readOnly})=>{
        window.qaAudio=[];window.qaFrames=frames;window.qaRequests=[];window.qaDelayed=false;
        window.PlayroomAppBridge={toast(text){document.querySelector('#toast').textContent=text;},audio:{registerPack(){},play(...args){qaAudio.push(args);}}};
        const client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('History cannot send commands');},
          history(index){if(!qaDelayed)return Promise.resolve(qaFrames[index]);return new Promise((resolve,reject)=>qaRequests.push({index,resolve,reject}));}};
        window.qaClient=client;window.qaGame=PlayroomSharedViews.mount(client,def,{readOnly});qaGame.render();
      },{snapshot,frames,def,readOnly:width===740});
      await page.evaluate(()=>qaGame.openHistory(4));
      await page.locator('#replay-range').evaluate(slider=>{window.qaSlider=slider;slider.focus();slider.value='0';slider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('.turn-extra')?.textContent==='Ход 0 из 4');
      assert.equal(await page.locator('.table-status .status-event').textContent(),'Начальная расстановка');
      assert.equal(await page.locator('.history-panel .history-caption').count(),0,'History uses the shared top status caption');
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
    for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css','app/design-system.css'])await page.addStyleTag({content:source(file)});
    for(const file of ['presentation/localization.js','core/protocol.js','core/component-assets.js','core/ui.js','core/player-target.js','core/motion.js','presentation/scheduler.js','core/game-flow.js','core/hand-overflow.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
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
    assert.equal(await shell.getAttribute('data-viewer'),String(snapshot.viewer));
    assert.equal(await shell.getAttribute('data-revision'),String(snapshot.revision));
    const commands=await shell.locator('.table-tools > button').evaluateAll(nodes=>nodes.map(n=>n.dataset.command));
    assert.deepEqual(commands.slice(-2),['rules','settings'],'Help and settings retain the right edge');
    assert.equal(await shell.locator('.table-tools button svg[data-ui-icon]').count(),commands.length);

    assert.equal(await shell.locator('.player-panel .player-token').count(),2);
    assert.equal(await shell.locator('.scene .opponent-hand').count(),1);
    assert.equal(await shell.locator('.layout-participants').isVisible(),true,'Player details must be visible, not just in the DOM');
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
    await shell.locator('.table-heading [data-command=history-close]').click();
    assert.equal(await page.evaluate(()=>window.localClicks),0,'Network interactions must not reach the local Session click handler');
    assert.equal(await shell.locator('.history-panel').count(),0);
    await page.setViewportSize({width:740,height:390});
    assert.equal(await shell.locator('.player-panel .player-token').count(),2);
    assert.equal(await shell.locator('.game-action-bar').count(),1);
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

test('personal network layout requires a Table, keeps equal opponent cards and restores the field',{timeout:50000},async()=>{
 require('../packs/gofish/rules.js');
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const [count,width,height]of [[2,320,740],[4,390,740],[6,740,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  try{
   await page.route('http://playroom-layout.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>'}));
   await page.goto('http://playroom-layout.test/');
   for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css','app/design-system.css'])await page.addStyleTag({content:source(file)});
   for(const file of ['presentation/localization.js','core/protocol.js','core/component-assets.js','core/ui.js','core/player-target.js','core/motion.js','presentation/scheduler.js','core/game-flow.js','core/hand-overflow.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
   const bundle=compiled.PlayroomInstalledPacks.find(item=>item.manifest.id==='gofish');
   const assets=Object.fromEntries(Object.entries(bundle.files).filter(([path])=>path.startsWith('assets/')).map(([path,value])=>[path,typeof value==='string'?'data:image/svg+xml;base64,'+Buffer.from(value).toString('base64'):'data:'+value.mime+';base64,'+value.data]));
   const definition={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],assets};
   const session=new Session(Core,'gofish',{seed:17,mode:'network',preset:'classic',players:Array.from({length:count},(_,index)=>({name:'Игрок '+index}))});
   const authority=new Authority(session),snapshot=authority.connect(0).snapshot();
   await page.evaluate(({snapshot,definition})=>{
    window.hasTable=false;window.PlayroomAppBridge={gameOptions:()=>({animationSpeed:'instant'}),toast:()=>{}};
    window.client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('No gameplay action in layout check');},history(){return {...snapshot,kind:'history'};}};
    window.game=PlayroomSharedViews.mount(client,definition,{tableAvailable:()=>hasTable});game.render();
   },{snapshot,definition});
   assert.equal(await page.locator('[data-command="toggle-field"]').count(),0);
   await page.evaluate(()=>{hasTable=true;game.render();});
   assert.equal(await page.locator('[data-command="pause"]').count(),1);assert.equal(await page.locator('.table-tools [data-command="history"]').count(),0);
   await page.locator('[data-command="toggle-field"]').click();
   const layout=page.locator('.app-game-layout');assert.equal(await layout.getAttribute('data-surface'),'player');
   assert.equal(await page.locator('.layout-field').isVisible(),false);assert(await page.locator('.layout-hand').isVisible());
   const boxes=await page.locator('.layout-participants .player-panel').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height};}));
   assert.equal(boxes.length,count-1);assert(boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&Math.abs(box.height-boxes[0].height)<1));
   assert.equal(await page.locator('.self-player').count(),1);
   assert.equal(await page.locator('.layout-participants .public-card').count(),0,'Closed opponents remain private');
   const shortcuts=await page.evaluate(()=>PlayroomGameScreen.quickAccessMarkup());assert.match(shortcuts,/data-command="history"/);assert.match(shortcuts,/data-command="pause"/);assert.match(shortcuts,/data-command="toggle-field"/);
   await page.evaluate(()=>{hasTable=false;game.render();});
   assert.equal(await layout.getAttribute('data-surface'),'combined');assert.equal(await page.locator('[data-command="toggle-field"]').count(),0);assert(await page.locator('.layout-field').isVisible());
   await page.evaluate(()=>game.destroy());
  }finally{await page.close();}
 }}finally{await browser.close();}
});

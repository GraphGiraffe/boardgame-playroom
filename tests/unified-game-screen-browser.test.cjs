'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Core=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');
require('../packs/uno/rules.js');
const TestUI=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
async function ready(page,url,{fixture=true}={}){
 await page.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'ui-fixture',name:'SDK',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',tutorialsEnabled:false}));});
 if(fixture)await require('./account-sync-fixture.cjs').installFetch(page.context(),async route=>route.fulfill({json:{}}));await page.goto(url);await TestUI.ready(page);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>PlayroomAppBridge.closeModal?.(true));
}

const compiled={};require('node:vm').runInNewContext(source('installed-packs.js'),compiled);
const bundle=compiled.PlayroomInstalledPacks.find(item=>item.manifest.id==='uno');
const def={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:['Карты UNO']};

for(const [width,height,touch] of [[320,740,true],[390,740,false],[740,390,false]]){
  test(`history input renders before release, preserves the slider and rejects stale frames (${width}px)`,{timeout:50000},async()=>{
    const server=await require('./browser-origin.cjs').serveBrowserFixture(root);
    const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    try{
      await ready(page,server.url);
      await page.evaluate(()=>{document.getElementById('app').replaceChildren();document.getElementById('modal-root').replaceChildren();});
      const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',players:[{name:'А'},{name:'Б'}]});
      const authority=new Authority(session),audience=authority.connect(0);
      for(let i=0;i<4;i++){
        const actor=session.current.turn,actions=Core.legalActions(session.current,actor);
        session.act(actor,actions.find(a=>a.type==='draw')||actions.find(a=>a.type==='pass')||actions[0]);
      }
      const frames=session.states.map((_,i)=>audience.history(i)),snapshot=audience.snapshot();
      await page.evaluate(({snapshot,frames,def,readOnly})=>{
        def=PlayroomAppBridge.packs.exportView(snapshot.game,snapshot.packVersion);
        window.qaAudio=[];window.qaFrames=frames;window.qaRequests=[];window.qaDelayed=new Set();
        window.PlayroomAppBridge={...window.PlayroomAppBridge,toast(text){document.querySelector('#toast').textContent=text;},audio:{registerPack(){},play(...args){qaAudio.push(args);}}};
        const client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('History cannot send commands');},
          history(index){if(!qaDelayed.delete(index))return Promise.resolve(qaFrames[index]);return new Promise((resolve,reject)=>qaRequests.push({index,resolve,reject}));}};
        window.qaClient=client;window.qaGame=PlayroomSharedViews.mount(client,def,{readOnly});qaGame.render();
      },{snapshot,frames,def,readOnly:width===740});
      await page.evaluate(()=>qaGame.openHistory(4));
      await page.locator('#replay-range').evaluate(slider=>{window.qaSlider=slider;slider.focus();slider.value='0';slider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('.replay-badge')?.textContent==='0 / 4'&&document.querySelector('.game-frame-turn-extra')?.textContent?.includes('Ход '+qaFrames[0].state.timeline.turn));
      assert.match(await page.locator('.game-frame-title').textContent(),/История партии/);
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
      await page.waitForFunction(()=>document.querySelector('.replay-badge')?.textContent==='4 / 4'&&document.querySelector('.game-frame-turn-extra')?.textContent?.includes('Ход '+qaFrames[4].state.timeline.turn));
      assert.notEqual(await page.locator('.scene').innerHTML(),initialScene,'The board must change while pointer is held');
      assert.equal(await page.evaluate(()=>qaSlider===document.querySelector('#replay-range')),true);
      if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
      await page.waitForFunction(()=>document.querySelector('.history-panel')?.getAttribute('aria-busy')==='false');
      await page.evaluate(()=>{qaDelayed=new Set([1,3]);qaSlider.value='1';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===1);
      await page.evaluate(()=>{qaSlider.value='3';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===2);
      await page.evaluate(()=>qaRequests[1].resolve(qaFrames[3]));
      await page.waitForFunction(()=>document.querySelector('.replay-badge')?.textContent==='3 / 4'&&document.querySelector('.game-frame-turn-extra')?.textContent?.includes('Ход '+qaFrames[3].state.timeline.turn));
      await page.evaluate(()=>qaRequests[0].resolve(qaFrames[1]));
      assert.equal(await page.locator('.replay-badge').textContent(),'3 / 4','Late frame cannot roll the scene back');
      const lastScene=await page.locator('.scene').innerHTML();
      await page.evaluate(()=>{qaDelayed.add(2);qaSlider.value='2';qaSlider.dispatchEvent(new Event('change',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===3);
      await page.evaluate(()=>qaRequests[2].resolve({...qaFrames[2],viewer:1}));
      await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Некорректная история.');
      assert.equal(await page.locator('.scene').innerHTML(),lastScene,'Wrong-viewer frames must never reach the scene');
      assert.equal(await page.locator('.scene [data-action]').count(),0);
      assert.equal(await page.locator('.opponent-hand [data-entity]').count(),0);
      assert.deepEqual(await page.evaluate(()=>qaAudio),[]);
      assert.equal(await page.evaluate(()=>qaClient.snapshot.revision),snapshot.revision);
      await page.evaluate(()=>{qaDelayed.add(1);qaSlider.value='1';qaSlider.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>qaRequests.length===4);
      await page.locator('[data-command=history-close]').click();
      await page.evaluate(()=>qaRequests[3].reject(Error('obsolete RPC')));
      assert.equal(await page.locator('.history-panel').count(),0);
      assert.equal(await page.locator('#toast').textContent(),'Некорректная история.','A stale failure must not replace the current message');
      await page.evaluate(()=>qaGame.destroy());
    }finally{await page.close();await browser.close();await server.close();}
  });
}

test('the projected network game reuses the bot GameScreen, opponents and inline history without exposing secret faces',{timeout:50000},async()=>{
  const server=await require('./browser-origin.cjs').serveBrowserFixture(root);
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  try{
    // Use the assembled application's dependency graph rather than a stale manual script list.
    await ready(page,server.url);
    await page.evaluate(()=>{document.getElementById('app').replaceChildren();document.getElementById('modal-root').replaceChildren();});
    const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',unoMode:'manual',players:[{name:'Игрок А'},{name:'Игрок Б'}],openHands:false});
    const authority=new Authority(session);
    const audience=authority.connect(0);
    const snapshots=[audience.history(0)];
    const actor=session.current.turn;
    const action=Core.legalActions(session.current,actor).find(a=>a.type==='draw')||Core.legalActions(session.current,actor)[0];
    if(action){session.act(actor,action);snapshots.push(audience.history(1));}
    const snapshot=audience.snapshot(),publicSnapshot=authority.connect(-1).snapshot();
    assert(snapshot.state.scene.players[1].hand.every(c=>c.hidden),'Private opponent cards must be absent from projected snapshots');
    await page.evaluate(({snapshot,snapshots,def})=>{
      const listeners=new Set();
      const client={snapshot,pending:null,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
        async history(index){return snapshots[index];},async send(){throw Error('Do not change authoritative state in read-only layout test');}};
      window.qaDefinition=PlayroomAppBridge.packs.exportView(snapshot.game,snapshot.packVersion);window.game=PlayroomSharedViews.mount(client,qaDefinition,{surface:'combined'});game.render();
    },{snapshot,snapshots,def});
    const shell=page.locator('.table-shell.network-game');
    assert.equal(await shell.count(),1);
    assert.equal(await shell.getAttribute('data-viewer'),String(snapshot.viewer));
    assert.equal(await shell.getAttribute('data-revision'),String(snapshot.revision));
    const commands=await shell.locator('.game-frame-tools button').evaluateAll(nodes=>nodes.map(n=>n.dataset.command||(n.hasAttribute('data-game-menu')?'menu':'chat')));
    assert.deepEqual(commands.slice(-2),['fullscreen','menu'],'Fullscreen and the game menu retain the right edge');
    assert.equal(await shell.locator('.game-frame-tools button svg[data-ui-icon]').count(),commands.length);

    assert.equal(await shell.locator('.player-panel:not([data-seat-copy]) .player-avatar-wrap>.avatar').count(),2);
    assert.equal(await shell.locator('.scene .opponent-hand').count(),1);
    assert.equal(await shell.locator('.layout-participants').isVisible(),true,'Player details must be visible, not just in the DOM');
    assert.equal(await shell.locator('.scene .opponent-hand').isVisible(),true,'Opponent hand must be visible');
    assert.equal(await shell.locator('.scene .own-hand').count(),1);
    assert.equal(await shell.locator('.scene .opponent-hand [data-entity]').count(),0);
    assert.match(await page.evaluate(()=>PlayroomGameScreen.quickAccessMarkup()),/data-command="history"/);
    assert.equal(await shell.locator('.scene .uno-player-targets').count(),0,'No extra player-only accusation bar');
    const viewport=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert(viewport.width<=viewport.client+1,'Shared screen must fit mobile width');
    await page.evaluate(()=>{window.localClicks=0;document.addEventListener('click',()=>window.localClicks++);});
    await shell.locator('[data-game-menu]').click();await page.evaluate(()=>window.localClicks=0);await page.locator('[data-game-menu-action][data-command=history]').click();
    await shell.locator('.history-panel').waitFor();
    assert.equal(await shell.locator('.history-controls').count(),1);
    assert.equal(await shell.locator('.scene [data-action]').count(),0,'History is read-only');
    await shell.locator('[data-command=history-close]').click();
    assert.equal(await page.evaluate(()=>window.localClicks),0,'Network interactions must not reach the local Session click handler');
    assert.equal(await shell.locator('.history-panel').count(),0);
    await page.setViewportSize({width:740,height:390});
    assert.equal(await shell.locator('.player-panel:not([data-seat-copy]) .player-avatar-wrap>.avatar').count(),2);
    assert.equal(await shell.locator('.layout-actions').count(),1);
    await page.evaluate(()=>game.destroy());
    // Table mode is read-only and must not inherit a player's own hand.
    await page.evaluate(({snapshot,def})=>{
      const client={snapshot,pending:null,subscribe(){return()=>{};},history:async()=>{throw Error('Not requested');}};
      window.publicGame=PlayroomSharedViews.mount(client,qaDefinition,{surface:'table'});publicGame.render();
    },{snapshot:publicSnapshot,def});
    assert.equal(await page.locator('.network-game').getAttribute('data-viewer'),'-1');
    assert.equal(await page.locator('.network-game .scene .own-hand').count(),0);
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0);
    assert.equal(await page.locator('.network-game .scene .opponent-hand').count(),2);
    assert.equal(await page.locator('.network-game .layout-field .uno-card[data-entity]').count(),1,'Only the public discard may show a card face');
    await page.evaluate(()=>publicGame.destroy());
  }finally{await page.close();await browser.close();await server.close();}
});

test('personal network layout requires a Table, keeps equal opponent cards and restores the field',{timeout:50000},async()=>{
 require('../packs/gofish/rules.js');
 const server=await require('./browser-origin.cjs').serveBrowserFixture(root);
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const [count,width,height]of [[2,320,740],[4,390,740],[6,740,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  try{
   await ready(page,server.url);
   await page.evaluate(()=>{document.getElementById('app').replaceChildren();document.getElementById('modal-root').replaceChildren();});
   const session=new Session(Core,'gofish',{seed:17,mode:'network',preset:'classic',players:Array.from({length:count},(_,index)=>({name:'Игрок '+index}))});
   const authority=new Authority(session),snapshot=authority.connect(0).snapshot();
   await page.evaluate(({snapshot})=>{
    const definition=PlayroomAppBridge.packs.exportView(snapshot.game,snapshot.packVersion);
    window.definition=definition;window.hasTable=false;window.PlayroomAppBridge={...window.PlayroomAppBridge,gameOptions:()=>({animationSpeed:'instant',tutorialsEnabled:false}),toast:()=>{}};
    window.client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('No gameplay action in layout check');},history(){return {...snapshot,kind:'history'};}};
    window.game=PlayroomSharedViews.mount(client,definition,{tableAvailable:()=>hasTable});game.render();
   },{snapshot});
   assert.equal(await page.locator('[data-command="toggle-field"]').count(),0);
   await page.evaluate(()=>{hasTable=true;game.render();});
   assert.equal(await page.locator('.table-tools [data-command="pause"]').count(),0,'Pause remains available through settings shortcuts');assert.equal(await page.locator('.table-tools [data-command="history"]').count(),0);
   await page.locator('[data-command="toggle-field"]').click();
   const layout=page.locator('.app-game-layout');assert.equal(await layout.getAttribute('data-surface'),'player');
   assert.equal(await page.locator('.layout-field').isVisible(),false);assert(await page.locator('.layout-hand').isVisible());
   const boxes=await page.locator('.layout-participants .player-panel').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height};}));
   assert.equal(boxes.length,count-1);assert(boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&Math.abs(box.height-boxes[0].height)<1));
   assert.equal(await page.locator('.self-player').count(),1);
   assert.equal(await page.locator('.layout-participants .shared-card:not(.shared-card-back)').count(),0,'Closed opponents remain private');
   const shortcuts=await page.evaluate(()=>PlayroomGameScreen.quickAccessMarkup());assert.match(shortcuts,/data-command="history"/);assert.match(shortcuts,/data-command="pause"/);assert.match(shortcuts,/data-command="toggle-field"/);
   await page.evaluate(()=>game.setConnected(false));
   assert.equal(await layout.getAttribute('data-surface'),'combined');assert.equal(await page.locator('[data-command="toggle-field"]').count(),0);
   await page.evaluate(()=>game.setConnected(true));
   assert.equal(await layout.getAttribute('data-surface'),'player','A connected player can resume their personal layout');
   await page.evaluate(()=>{hasTable=false;game.render();});
   assert.equal(await layout.getAttribute('data-surface'),'combined');assert.equal(await page.locator('[data-command="toggle-field"]').count(),0);assert(await page.locator('.layout-field').isVisible());
   assert.doesNotMatch(await page.evaluate(()=>PlayroomGameScreen.quickAccessMarkup()),/data-command="toggle-field"/);
   await page.evaluate(()=>{game.destroy();hasTable=true;window.game=PlayroomSharedViews.mount(client,definition,{tableAvailable:()=>hasTable,readOnly:true});game.render();});
   assert.equal(await layout.getAttribute('data-surface'),'combined');assert.equal(await page.locator('[data-command="toggle-field"]').count(),0,'An archive cannot hide its field even with a saved personal preference');
   await page.evaluate(()=>game.destroy());
  }finally{await page.close();}
 }}finally{await browser.close();await server.close();}
});

test('live completion 0.21: legal draw, bot defeat and teammate finish reach result, history and lobby',{timeout:90000},async()=>{
 const engine=process.env.LAB_ENGINE==='webkit'?'webkit':'chromium',pw=require('playwright-core'),server=await require('./browser-origin.cjs').serveBrowserFixture(root);
 const browser=await pw[engine].launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const out=path.resolve(root,'../tmp_files/ux-021/live-completion'),report={engine,source:'legal Session.act/prepare history; final UI action or actual scheduled bot',cases:[],errors:[]};fs.mkdirSync(out,{recursive:true});
 try{for(const kind of ['draw','bot-defeat','team-mate']){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'00000000-0000-4000-8000-00000000a160',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast',tutorialsEnabled:false}));});
  const counts=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}})),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));
  const entry={kind};report.cases.push(entry);
  try{
   await ready(page,server.url,{fixture:false});await page.locator('.game-tile').first().waitFor();
   entry.prepared=await page.evaluate(async kind=>{
    const b=PlayroomAppBridge,E=TabletopCore,game=kind==='team-mate'?'ludo':'tictactoe';b.packs.activate(game);PlayroomFirstTurnGuide.setEnabled(game,false);
    const players=kind==='team-mate'?[{name:'Иван'},{name:'Красный бот',bot:true},{name:'Напарник',bot:true},{name:'Красный второй',bot:true}]:[{name:'Иван'},{name:kind==='draw'?'Друг':'Бот',bot:kind!=='draw'}];
    const session=new TabletopSession(E,game,{seed:kind==='team-mate'?2:16,mode:kind==='draw'?'pass':'solo',preset:kind==='team-mate'?'teams':'classic',firstPlayerMode:'assigned',firstPlayer:0,players,openHands:true,...(kind==='team-mate'?{endMode:'winner',startPawn:'on',diceCount:3,sixReroll:'off',maxRounds:0}:{})});
    let finalActor=0,finalCommand={type:'place',cell:8};
    if(kind==='team-mate'){
     let found=false;for(let step=0;step<900;step++){
      const actor=session.current.turn,command=E.botAction(session.current,actor);if(!command)throw Error('No legal preparation action');const candidate=session.prepare(actor,command);
      if(candidate.status==='finished'){if(actor!==2||!candidate.winners.includes(0)||!candidate.winners.includes(2))throw Error('Expected seed2 teammate terminal action');finalActor=actor;finalCommand=command;found=true;break;}session.commitPrepared(candidate);
     }if(!found)throw Error('Legal team completion exceeded bounded900 steps');
    }else for(const cell of kind==='draw'?[0,1,2,4,3,5,7,6]:[0,3,1,4]){
     const actor=session.current.turn,command=E.legalActions(session.current,actor).find(action=>action.type==='place'&&action.cell===cell);if(!command)throw Error('Invalid legal prefix');session.act(actor,command);
    }
    if(session.current.status!=='playing')throw Error('Fixture must remain playing until actual final UI/bot transition');
    const id='completion-'+kind;await b.saveLibrary.activateAsync(session,id);b.showSessions();
    return {id,game,packVersion:session.packVersion,seed:session.options.seed,moves:session.current.move,finalActor,finalCommand,historyStates:session.states.length,mode:session.options.mode};
   },kind);
   await TestUI.resumeSaved(page,entry.prepared.id);
   if(kind!=='team-mate'){await page.locator('.ttt-grid').waitFor();await page.locator('.ttt-cell').nth(8).click();}
   await page.locator('.result-modal .result-v021-summary h3').waitFor();
   entry.finished=await page.evaluate(()=>{const b=PlayroomAppBridge,{id,session}=b.saveLibrary.current(),state=session.current;return {id,status:state.status,winner:state.winner,winners:state.winners||(state.winner==null?[]:[state.winner]),move:state.move,board:state.data.board||null,players:state.players.map(p=>({name:p.name,bot:p.bot})),saved:b.saveLibrary.list().find(row=>row.id===id),historyStates:session.states.length,roomPhase:b.room()?.phase};});
   assert.equal(entry.finished.status,'finished');assert.equal(entry.finished.saved.finished,true);assert.equal(entry.finished.id,entry.prepared.id);assert(entry.finished.move>entry.prepared.moves,'actual final pipeline committed a move');
   const expected=kind==='draw'?/^Ничья!?$/:kind==='bot-defeat'?/^Поражение!?$/:/^Победа!?$/;assert.match(await page.locator('.result-v021-summary h3').innerText(),expected);
   if(kind==='draw')assert.deepEqual(entry.finished.winners,[]);else if(kind==='bot-defeat'){assert.deepEqual(entry.finished.winners,[1]);assert.equal(entry.finished.board[5],1,'scheduled bot played its winning move');assert.equal(entry.finished.move,entry.prepared.moves+2);}else {assert.deepEqual(entry.finished.winners,[0,2]);assert.equal(entry.prepared.finalActor,2);assert.equal(entry.finished.players[0].bot,false);assert.equal(await page.locator('.result-awards .is-team').count(),4);}
   for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.locator('.result-modal').getAttribute('data-ui-surface'),'screen');assert(await page.locator('.result-v021-footer [data-command=rematch]').isVisible());assert(await page.locator('.result-v021-footer [data-command=rematch-start]').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,engine+'-'+kind+'-result-'+viewport.width+'.png'),animations:'disabled'});}
   await page.locator('.result-v021-history').click();await page.locator('#replay-range').waitFor();entry.historyStart=await page.locator('#replay-range').evaluate(slider=>({index:Number(slider.value),minimum:Number(slider.min),maximum:Number(slider.max),badge:document.querySelector('.replay-badge').textContent}));assert.equal(entry.historyStart.maximum,entry.finished.move);assert.equal(entry.historyStart.minimum,0);assert.equal(entry.historyStart.badge,entry.historyStart.index+' / '+entry.finished.move,'history badge reports the actual frame, including public ready batches');await page.locator('#replay-range').focus();await page.keyboard.press('End');await page.waitForFunction(move=>document.querySelector('.replay-badge')?.textContent===move+' / '+move,entry.finished.move);assert.equal(await page.locator('.replay-badge').count(),1);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#replay-range').count(),0);await TestUI.activeSurface(page).locator('.result-modal').waitFor();await TestUI.activeSurface(page).locator('.modal-head [data-command=close-modal]').click();await page.locator('[data-game-menu]').click();assert.equal(await page.locator('.game-menu-panel details').count(),0);await page.locator('[data-game-menu-action][data-command=result]').click();await page.locator('.result-modal').waitFor();
   if(kind==='bot-defeat'){
    await page.locator('.result-v021-footer [data-command=rematch-start]').click();await page.locator('.ttt-grid').waitFor();entry.rematch=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current();return {id:s.id,status:s.session.current.status,move:s.session.current.move};});assert.notEqual(entry.rematch.id,entry.finished.id);assert.equal(entry.rematch.status,'playing');assert.equal(await page.locator('.lobby-countdown').count(),0);
    await page.evaluate(()=>PlayroomAppBridge.parkLocalSession());
   }else {await page.locator('.result-v021-footer [data-command=rematch]').click();await page.locator('.room-v021').waitFor();assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().phase),'lobby');assert.equal(await page.locator('.lobby-countdown').count(),0,'return never opens a zero countdown');await page.evaluate(()=>PlayroomAppBridge.parkLocalSession());}
   await page.evaluate(()=>PlayroomAppBridge.showSessions());await page.locator('[data-saved-status=active]').click();assert.equal(await page.locator('[data-resume-id="'+entry.finished.id+'"]').count(),0,'completed save is absent from active games');
   if(kind!=='bot-defeat')assert.equal(await page.locator('[data-hub-page=sessions] .active-games-badge').count(),0,'finished history has no active-party badge');
   await page.locator('[data-saved-status=history]').click();await page.locator('.saved-game[data-session-id="'+entry.finished.id+'"]').click();await TestUI.activeSurface(page).locator('[data-history-id="'+entry.finished.id+'"]').waitFor();await page.screenshot({path:path.join(out,engine+'-'+kind+'-history.png'),animations:'disabled'});
   entry.nativeSupabaseRequests=counts.nativeSupabaseRequests;assert.equal(counts.nativeSupabaseRequests,0);
  }catch(error){entry.failure=String(error.stack);await page.screenshot({path:path.join(out,engine+'-'+kind+'-failure.png'),animations:'disabled'}).catch(()=>{});throw error;}finally{await context.close();}
 }}finally{fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify({engine,cases:report.cases.map(c=>({kind:c.kind,prepared:c.prepared.moves,final:c.finished.move})),errors:report.errors,nativeSupabaseRequests:report.cases.reduce((n,c)=>n+c.nativeSupabaseRequests,0)}));
});

test('SDK interaction audit covers every installed pack and duplicate ACK delivery',{timeout:120000},async()=>{
 const server=await require('./browser-origin.cjs').serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:384,height:782},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'sdk-audit',name:'SDK',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',tutorialsEnabled:false}));});
  if(process.env.PLAYROOM_AUDIT_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_AUDIT_ARTIFACT);await page.route('**/*',r=>r.abort());await page.route(server.url,r=>r.fulfill({contentType:'text/html',body}));}
  await ready(page,server.url);await page.locator('.game-tile').first().waitFor();const ids=await page.evaluate(()=>PlayroomInstalledPacks.map(b=>b.manifest.id));const report=[];
  for(const id of ids){
   await page.evaluate(async id=>{const E=TabletopCore,b=PlayroomAppBridge.packs,manifest=PlayroomInstalledPacks.find(p=>p.manifest.id===id).manifest;b.activate(id,manifest.version);const game=E.get(id),session=new TabletopSession(E,id,{seed:17,preset:game.presets[0].id,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:game.max},(_,i)=>({name:'P'+i,bot:false}))}),authority=new SessionAuthority(session),connection=authority.connect(0),client=new PlayroomSessionClient(PlayroomLocalTransport(connection));await client.refresh();document.querySelector('#app').innerHTML='';const mount=PlayroomSharedViews.mount(client,b.exportView(id,manifest.version));window.sdkAudit={session,authority,client,mount,before:JSON.stringify(session.current),beforeState:session.current,renders:0};const render=PlayroomViews.render;window.sdkRenderOriginal=render;PlayroomViews.render=function(...args){sdkAudit.renders++;return render.apply(this,args);};mount.render();sdkAudit.renders=0;},id);
   const item=await page.evaluate(async()=>{const f=sdkAudit,action=f.client.snapshot.actions.find(a=>!a.disabled);if(!action)throw Error('No initial action '+f.session.game);const start=performance.now();let receipt=await f.client.send(action);for(let step=0;f.client.localDraft.length&&step<16;step++){const frame=f.client.confirmedFrame,pack=TabletopCore.get(frame.game,frame.packVersion),spec=pack.draftSpec(PlayroomProtocol.projectedModel(frame));if(spec.mode==='coalesce')receipt=await f.client.flushLocalDraft();else{const next=f.client.snapshot.actions.find(a=>!a.disabled&&spec.commit.includes(a.type));if(!next)throw Error('No declared draft confirmation '+frame.game);receipt=await f.client.send(next);}if(!receipt?.ok)throw Error('Draft confirmation rejected');}if(f.client.localDraft.length)throw Error('Draft confirmation exceeded16steps');return {game:f.session.game,action:action.type,ok:receipt.ok,dispatchMs:performance.now()-start};});assert(item.ok,JSON.stringify(item));
   await page.waitForFunction(()=>document.querySelector('.app-game-layout')?.getAttribute('aria-busy')==='false',null,{timeout:10000});
   const summary=await page.evaluate(async()=>{const f=sdkAudit,before=f.renders;for(let i=0;i<3;i++)for(const listener of f.client.listeners)listener(f.client.snapshot);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const result={players:f.session.current.players.length,revision:f.session.current.move,history:f.client.snapshot.historyLength,priorUnchanged:JSON.stringify(f.beforeState)===f.before,renders:before,duplicateAckRenders:f.renders-before,domNodes:document.querySelectorAll('*').length};PlayroomViews.render=sdkRenderOriginal;f.mount.destroy();f.client.close();f.authority.dispose();return result;});Object.assign(item,summary);assert.equal(item.revision,1,id);assert.equal(item.history,2,id);assert(item.priorUnchanged,id+' input position stays immutable');assert.equal(item.duplicateAckRenders,0,id+' duplicate ACK does not render again');report.push(item);
  }
  assert.equal(report.length,15);assert.deepEqual(errors,[]);if(process.env.SDK_AUDIT_EVIDENCE){fs.mkdirSync(process.env.SDK_AUDIT_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.SDK_AUDIT_EVIDENCE,'all-packs.json'),JSON.stringify({report,errors},null,2));}console.log(JSON.stringify(report));
 }finally{await context.close();await browser.close();await server.close();}
});

test('keyed fragments patch only changed components and presence preserves avatar roles',{timeout:30000},async()=>{
 const server=await require('./browser-origin.cjs').serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await browser.newPage();
 try{await ready(page,server.url);const result=await page.evaluate(()=>{
  const D=PlayroomDOM,host=document.createElement('div');document.body.append(host);
  const source=n=>`<section><button data-dom-key="first" title="x > y"><svg viewBox="0 0 2 2"><title>A &gt; B</title><path d="M0 0L1 1"/></svg>A</button><!-- <span data-dom-key="ignored"> --> <button data-dom-key="second"><input value="${n}"><strong>${n}</strong></button></section>`;
  const a=D.keyedFragments(source(1)),first=D.fragmentTemplate(document,a.markup,a.fragments);first.commit();host.append(first.template.content.cloneNode(true));const fixed=host.querySelector('button'),svg=fixed.querySelector('svg');fixed.classList.add('runtime-effect');
  const b=D.keyedFragments(source(2)),next=D.fragmentTemplate(document,b.markup,b.fragments,first);let writes=0;D.patchChildren(host,next.template.content,first.template.content,()=>writes++,next.resolve);next.commit();
  const sparse={same:host.querySelector('button')===fixed,svg:fixed.querySelector('svg')===svg,effect:fixed.classList.contains('runtime-effect'),value:host.querySelector('strong').textContent,regions:b.fragments.size,writes};
  const duplicates=D.keyedFragments('<div data-dom-key="x"></div><div data-dom-key="x"></div>').fragments.size,raw=D.keyedFragments('<script>"<span data-dom-key=\"x\">"</script>').fragments.size;
  host.remove();const shell=document.createElement('main');shell.className='table-shell network-game';shell.innerHTML='<div class="app-game-layout"></div>';document.querySelector('#app').replaceChildren(shell);
  const people=[{id:'host',nickname:'A',isHost:true,avatar:'triangle-blue'},{id:'easy',nickname:'B',bot:true,botSettings:{difficulty:'easy'}},{id:'hard',nickname:'C',bot:true,botSettings:{difficulty:'hard'}},{id:'hand',nickname:'D',local:true}].map(p=>({...p,role:'player',connected:true}));
  const state={players:people.map(p=>({...p,name:p.nickname,score:0})),firstPlayer:0,turn:0};shell.querySelector('.app-game-layout').innerHTML=state.players.map((_,i)=>TabletopUI.playerPanel(state,i,0)).join('');
  const avatarNodes=[...shell.querySelectorAll('.avatar')],glyphNodes=avatarNodes.map(a=>a.querySelector('[data-ui-icon]'));let presenceRenders=0;const room={id:'avatar-room',participants:people,seats:people.map((p,index)=>({participantId:p.id,index,playerIndex:index}))};const presence=PlayroomNetworkPresence.create({hostGameClient:{snapshot:{sessionId:'avatar-session',playerControls:[]}},hostRoomId:room.id,hostAuthority:{},hostMount:{render(){presenceRenders++;}},bridge:()=>({roomService:{snapshot:()=>room}})});presence.renderPresence();presence.renderPresence();const stableRenders=presenceRenders;people[1].nickname='Renamed bot';presence.renderPresence();const identityStable=avatarNodes.every((a,i)=>a===shell.querySelectorAll('.avatar')[i]&&glyphNodes[i]===a.querySelector('[data-ui-icon]'));
  const lobby=document.createElement('div');lobby.innerHTML=TabletopUI.avatar({...people[1],name:people[1].nickname},1);document.querySelector('#modal-root').append(lobby);lobby.firstElementChild.style.cssText+=';width:48px;height:48px';const lobbyRatio=lobby.querySelector('svg').getBoundingClientRect().width/lobby.firstElementChild.getBoundingClientRect().width;lobby.remove();
  const roles=[...shell.querySelectorAll('.avatar')].map(a=>({bot:a.classList.contains('is-bot-avatar'),hand:a.classList.contains('is-hotseat-avatar'),icon:a.querySelector('[data-ui-icon]')?.dataset.uiIcon,ratio:(a.querySelector('svg')?.getBoundingClientRect().width||0)/(a.getBoundingClientRect().width||1)}));return {sparse,duplicates,raw,roles,lobbyRatio,identityStable,stableRenders,presenceRenders};
 });assert(result.sparse.same&&result.sparse.svg&&result.sparse.effect);assert.equal(result.sparse.value,'2');assert.equal(result.sparse.regions,2);assert(result.sparse.writes>0&&result.sparse.writes<5);assert.equal(result.duplicates,0);assert.equal(result.raw,0);assert.equal(result.roles[1].icon,'bot-easy');assert.equal(result.roles[2].icon,'bot-hard');assert.equal(result.roles[3].icon,'hand');assert(result.roles.slice(1).every(r=>r.ratio>=.65));assert(result.lobbyRatio>=.65);assert(result.identityStable);assert.equal(result.stableRenders,1);assert.equal(result.presenceRenders,2);
 }finally{await browser.close();await server.close();}
});

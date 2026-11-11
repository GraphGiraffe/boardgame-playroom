'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');

// Shared geometry assertions: identical thresholds for the existing scene matrix and focused eight-player case.
function sceneGeometryIssues(){
    const stage=document.querySelector('.app-game-layout'),issues=[];
    if(!stage)return ['missing scene'];
    const visible=e=>{const r=e.getBoundingClientRect();return !e.closest('[inert]')&&r.width>0&&r.height>0;};
    for(const [selector,ratio]of [['.shared-card',5/7],['.shared-die',1],['.battle-cell',1],['.ttt-cell',1],['.ludo-board',1],['.ludo-pawn',1]])for(const e of stage.querySelectorAll(selector)){if(!visible(e))continue;const r={width:e.offsetWidth,height:e.offsetHeight};if(Math.abs(r.width/r.height-ratio)>.025)issues.push(`${selector} ratio ${r.width}/${r.height}`);}
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
    const actions=stage.querySelector('.layout-actions'),hand=stage.querySelector('.layout-hand'),field=stage.querySelector('.layout-field');
    for(const e of [actions,hand].filter(Boolean)){const r=e.getBoundingClientRect(),s=stage.getBoundingClientRect();if(r.top<s.top-1||r.bottom>s.bottom+1)issues.push(`clipped ${e.className}: ${r.top}..${r.bottom}/${s.bottom}`);}
    if(actions&&hand&&actions.getBoundingClientRect().bottom>hand.getBoundingClientRect().top+1)issues.push('actions overlap hand');
    if(!stage.querySelector('[data-action],[data-select],[data-player-target],[data-view-key]'))issues.push('no interaction');
    const gameShell=stage.closest('.table-shell');
    if(gameShell&&getComputedStyle(gameShell.querySelector('.game-frame-title h1')).userSelect!=='none')issues.push('game text selectable');
    if(stage.classList.contains('ludo-scene')){
     const arrow=stage.querySelector('.ludo-start-arrow'),safe=stage.querySelector('.ludo-safe');
     if([arrow,safe].some(el=>!el||getComputedStyle(el).userSelect!=='none'))issues.push('Ludo symbols selectable');
     for(const [seat,color]of [[2,'#668fad'],[3,'#cfac4c']]){
      const pawn=stage.querySelector(`[data-entity="token-${seat}-0"]`),base=stage.querySelectorAll('.ludo-base')[seat];
      if(!base||(pawn&&getComputedStyle(pawn).getPropertyValue('--pawn').trim()!==color)||getComputedStyle(base).getPropertyValue('--base').trim()!==color)issues.push(`Ludo seat ${seat} color`);
     }
    }
    if(innerWidth===390&&stage.classList.contains('battleship-scene')){
     const ships=[...stage.querySelectorAll('.player-panel.opponent-hand .fleet-indicator')];
     if(ships.length===4&&ships.some(ship=>Math.abs(ship.getBoundingClientRect().top-ships[0].getBoundingClientRect().top)>1))issues.push('opponent fleet wraps');
    }
    if(field.clientHeight<80)issues.push(`field collapsed: ${field.clientHeight}; players ${stage.querySelector('.layout-participants').clientHeight}; self ${stage.querySelector('.layout-self')?.clientHeight}; mode ${stage.dataset.layoutMode}`);
    // A side seat rotates its entire row; measure text wrapping before that transform.
    for(const name of stage.querySelectorAll('.player-heading strong'))if(name.offsetHeight>30)issues.push('vertical player name');
    if(stage.querySelectorAll('.battle-grid').length===2&&innerWidth<600&&[...stage.querySelectorAll('.battle-grid')].filter(visible).length!==1)issues.push('two mobile fleets');
    if(stage.classList.contains('yatzy-scene')){const footer=stage.querySelector('tfoot th'),f=field.getBoundingClientRect(),r=footer.getBoundingClientRect();if(r.bottom>f.bottom+1||r.top<f.top)issues.push('Yatzy total not sticky');const widths=[...stage.querySelectorAll('thead [data-score-player]')].map(n=>n.getBoundingClientRect().width);if(widths.some(w=>w<28||Math.abs(w-widths[0])>1))issues.push('Yatzy unequal score columns');if(stage.querySelector('.yatzy-board').scrollWidth>stage.querySelector('.yatzy-board').clientWidth+1)issues.push('Yatzy horizontal scroll');}
    for(const panel of stage.querySelectorAll('[data-hand-count].player-panel'))if(panel.querySelectorAll('.piece-count.is-hand').length!==1)issues.push('duplicate hand counter');
    return [...new Set(issues)];
}
test('layered model renders assigned marks, public Table controls and projected client history',{timeout:45000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(fixture.url);
  if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Тест');await page.locator('#profile-form').evaluate(form=>form.requestSubmit());}
  const captures=path.join(root,'tmp_files/refactor-0.18-model');fs.mkdirSync(captures,{recursive:true});
  for(const [width,height]of [[320,640],[390,740],[740,390]])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height});
   const result=await page.evaluate(({theme})=>{
    PlayroomAppearanceUI.runtime.service.select(theme);
    const E=TabletopCore,session=new TabletopSession(E,'tictactoe',{seed:17,firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'Аня'},{name:'Борис'}]});
    const next=E.applyTableAction(session.current,1,{type:'place',cell:4});
    const same=JSON.stringify(next)===JSON.stringify(E.applyAction(session.current,1,{type:'place',cell:4}));
    const table=E.projectTable(next,0),actions=table.tableActions;
    const scene=PlayroomViews.render(table,-1,actions,{surface:'table'});
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Крестики-нолики',state:table,viewer:-1,actions,scene,turnText:'Публичный стол'});
    PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    const publicHtml=PlayroomViews.render(E.project(next,-1),-1,[],{surface:'table'});
    const replayHtml=PlayroomViews.render(table,-1,[],{surface:'table'});
    return {same,mark:document.querySelectorAll('.ttt-cell')[4].classList.contains('cross'),
      buttons:document.querySelectorAll('.ttt-cell[data-action]').length,
      viewer:table.modelProjection.viewer,actor:table.modelProjection.actor,
      readonly:!publicHtml.includes('data-action=')&&!replayHtml.includes('data-action='),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
   },{theme});
   assert.deepEqual(result,{same:true,mark:true,buttons:8,viewer:-1,actor:0,readonly:true,overflow:false});
   if(width===390)await page.screenshot({path:path.join(captures,`table-${theme}-390.png`)});
  }
  await page.evaluate(async()=>{
   const session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'Аня'},{name:'Борис'}]});
   const authority=new SessionAuthority(session),connection=authority.connect(1),client=new PlayroomSessionClient(PlayroomLocalTransport(connection));
   await client.refresh();await client.send({type:'place',cell:4});
   const mounted=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('tictactoe',session.packVersion),{surface:'combined'});mounted.render();
   window.modelNetwork={authority,client,mounted};
  });
  await page.locator('.network-game .ttt-cell.cross').waitFor();
  assert.equal(await page.locator('.network-game .ttt-cell[data-action]').count(),0,'other player turn is read only');
  const history=await page.evaluate(async()=>{
   const {authority,client}=modelNetwork,frame=await client.transport.history(0);
   return {revision:authority.revision,cell:client.snapshot.state.scene.cells[4].owner,
     initial:frame.state.scene.cells[4].owner,secret:JSON.stringify(client.snapshot).includes('"rng"')};
  });
  assert.deepEqual(history,{revision:1,cell:1,initial:null,secret:false});assert.deepEqual(errors,[]);
  await page.evaluate(()=>{modelNetwork.mounted.destroy();modelNetwork.client.close();modelNetwork.authority.dispose();});
 }finally{await browser.close();await fixture.close();}
});
test('new game scenes preserve proportions, reachable controls and hands before and after a move',{timeout:120000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await browser.newPage({viewport:{width:390,height:740}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'scene-geometry-owner',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});const safe=await require('./account-sync-fixture.cjs').installFetch(page.context(),async route=>route.fulfill({json:{}}));await page.goto(fixture.url);await page.waitForFunction(()=>PlayroomInstalledPacks.length===15&&PlayroomInstalledPacks.every(pack=>{try{return !!TabletopCore.get(pack.manifest.id);}catch(_){return false;}}));if(process.env.PLAYROOM_QA_DIR)fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});assert.equal(await page.locator('#modal-root .modal').count(),0);const games=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid'];
  for(const [width,height]of [[320,640],[390,740],[740,390],[640,280],[768,1024],[1280,900]]){await page.setViewportSize({width,height});for(const game of games)for(const progressed of [false,true]){
   await page.evaluate(({game,progressed,width})=>{
    const E=TabletopCore,g=E.get(game);let state=E.createGame(game,{seed:17,preset:g.presets[0].id,...(game==='ludo'?{diceCount:3}:{}),players:Array.from({length:width<=390?g.max:2},(_,i)=>({name:['Аня','Борис','Вера','Глеб','Даша','Егор','Женя','Зоя'][i]}))});
    if(progressed){const count=game==='battleship'?2:game==='pexeso'?2:1;for(let n=0;n<count;n++)state=E.applyAction(state,state.turn,E.botAction(state));if(game==='yatzy')state=E.applyAction(state,state.turn,E.legalActions(state).find(a=>a.type==='score'));}
    window.fixtureState=state;const viewer=state.turn,projected=E.project(state,viewer),actions=E.legalActions(state,viewer),scene=PlayroomViews.render(projected,viewer,actions,{selected:null});
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:g.name,state:projected,viewer,actions,scene,turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   },{game,progressed,width});
   await page.waitForTimeout(35);
   const result=await page.evaluate(sceneGeometryIssues);
   if(result.length&&process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'failure.png')});
   assert.deepEqual(result,[],`${game} ${width}x${height} ${progressed?'after':'initial'}`);
   if(process.env.PLAYROOM_QA_DIR&&[390,740].includes(width)){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`${game}-${width}-${progressed?'after':'initial'}.png`)});}
  }}

  for(const [width,height] of [[390,740],[640,280]]){
   await page.setViewportSize({width,height});
   const geometry=await page.evaluate(()=>{
    const E=TabletopCore,issues=[];
    for(const id of E.GAMES.map(g=>g.id)){
     const game=E.get(id),players=Array.from({length:Math.min(game.max,Math.max(2,game.min))},(_,i)=>({name:`Игрок ${i+1}`}));
     let state=E.createGame(id,{players,seed:17}),before;
     const measure=()=>{const projected=E.project(state,state.turn),actions=E.legalActions(state),scene=PlayroomViews.render(projected,state.turn,actions);
      document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:game.name,state:projected,viewer:state.turn,actions,scene});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
      const node=document.querySelector('.layout-field');if(!node)throw Error(id+' scene: '+document.querySelector('#app').textContent);const f=node.getBoundingClientRect(),a=document.querySelector('.layout-actions')?.getBoundingClientRect();return {field:[f.left,f.top,f.width,f.height],actions:a?.height||0};};
     before=measure();const action=E.botAction(state);if(!action)continue;state=E.applyAction(state,state.turn,action);const after=measure();
     if(before.field.some((value,i)=>Math.abs(value-after.field[i])>2))issues.push(`${id} field shifted after action: ${before.field} -> ${after.field}`);
     if(before.actions&&after.actions&&Math.abs(before.actions-after.actions)>2)issues.push(`${id} actions changed height: ${before.actions} -> ${after.actions}`);
    }return issues;
   });
   assert.deepEqual(geometry,[],`stable action reserve at ${width}x${height}`);
   const fleets=await page.evaluate(()=>{
    const E=TabletopCore,issues=[],players=[{name:'Аня'},{name:'Борис'}];let state=E.createGame('battleship',{players,seed:17});
    state=E.applyAction(state,state.turn,{type:'auto'});state=E.applyAction(state,state.turn,{type:'ready'});state=E.applyAction(state,state.turn,{type:'auto'});state=E.applyAction(state,state.turn,{type:'ready'});
    for(const fleet of ['own','enemy']){
     const projected=E.project(state,0),actions=E.legalActions(state,0),scene=PlayroomViews.render(projected,0,actions,{viewState:{fleet}});
     document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Морской бой',state:projected,viewer:0,actions,scene});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
     const field=document.querySelector('.battle-fields').getBoundingClientRect(),board=document.querySelector('.battle-panel.is-active .battle-grid').getBoundingClientRect();
     if(getComputedStyle(document.querySelector('.battleship-scene .game-field-content')).overflowX!=='clip')issues.push(`${fleet} horizontal overflow is not clipped`);
     if(board.left<field.left-1||board.right>field.right+1||board.top<field.top-1||board.bottom>field.bottom+1)issues.push(`${fleet} clipped board=${board.x},${board.y},${board.width},${board.height} field=${field.x},${field.y},${field.width},${field.height}`);
     if(innerWidth<=innerHeight&&Math.abs((board.left+board.right)/2-(field.left+field.right)/2)>2)issues.push(`${fleet} off center`);
     const counters=[...document.querySelectorAll('.battle-panel.is-active .fleet-indicator')];if(!counters.length)issues.push(`${fleet} counters missing`);
    }return issues;
   });assert.deepEqual(fleets,[],`centered fleet at ${width}x${height}`);
  }

  await page.setViewportSize({width:390,height:740});
  const publicViews=await page.evaluate(()=>{
   const E=TabletopCore,issues=[];
   for(const game of ['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid']){
    let s=E.createGame(game,{seed:17,...(game==='ludo'?{diceCount:1}:{}),players:Array.from({length:E.get(game).max},(_,i)=>({name:`Игрок ${i+1}`}))});
    if(game==='battleship')for(let n=0;n<2;n++){s=E.applyAction(s,s.turn,{type:'auto'});s=E.applyAction(s,s.turn,{type:'ready'});}
    const p=E.project(s,-1);document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:game,state:p,viewer:-1,actions:[],scene:PlayroomViews.render(p,-1,[],{surface:'table'})});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    if(document.querySelector('.view-error')||document.querySelector('[data-action]:not([disabled])'))issues.push(game+' public actions');
    if(game==='yatzy'&&document.querySelectorAll('.shared-die').length!==5)issues.push('missing public dice');
    if(game==='ludo'&&document.querySelectorAll('.shared-die').length!==1)issues.push('missing public die');
    if(game==='battleship'){
     if(document.querySelectorAll('[data-view-key="fleet"]').length!==2)issues.push('missing public fleet switch');
     if(!document.querySelector('[data-view-preference="followOpponent"]'))issues.push('missing spectator auto-switch');
     if(PlayroomGameFlow.viewingTime(PlayroomCatalog.battleship.capabilities,{scene:{phase:'battle'}})!==750)issues.push('missing minimum shot viewing time');
    }
   }return issues;
  });assert.deepEqual(publicViews,[]);
  for(const id of ['ludo','yatzy']){
   const replay=await page.evaluate(async id=>{
    const E=TabletopCore,players=Array.from({length:id==='ludo'?4:2},(_,i)=>({name:`Игрок ${i+1}`}));let s=E.createGame(id,{seed:17,players,diceCount:3});
    s=E.applyAction(s,s.turn,E.legalActions(s)[0]);const p=E.project(s,0),scene=PlayroomViews.render(p,0,[],{replay:true});
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:id,state:p,viewer:0,scene,replay:true,historyHTML:PlayroomGameScreen.historyMarkup({index:1,count:3})});PlayroomGameScreen.layoutScene(document.querySelector('#app'));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const outer=document.querySelector('.scene').getBoundingClientRect(),dice=[...document.querySelectorAll('.layout-actions .shared-die')],buttons=[...document.querySelectorAll('.layout-actions .scene-button')];
    return {geometry:{outer:outer.toJSON(),dice:dice.map(el=>el.getBoundingClientRect().toJSON())},count:dice.length,visible:dice.every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=outer.top&&r.bottom<=outer.bottom}),controls:buttons.some(el=>getComputedStyle(el).display!=='none')};
   },id);
   if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`${id}-history-390.png`)});
   assert.equal(replay.count,id==='ludo'?3:5);assert.equal(replay.visible,true,`${id} replay dice visible: ${JSON.stringify(replay.geometry)}`);assert.equal(replay.controls,false,`${id} replay controls hidden`);
  }
  const choice=await page.evaluate(()=>{
   const E=TabletopCore;window.fixtureState=E.createGame('oldmaid',{seed:17,players:[{name:'Аня'},{name:'Борис'}]});const s=fixtureState,viewer=s.turn,actions=E.legalActions(s),projected=E.project(s,viewer);
   document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Акулина',state:projected,viewer,actions,scene:PlayroomViews.render(projected,viewer,actions)});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   window.fixtureTarget=new PlayroomPlayerTarget({actions:()=>E.legalActions(fixtureState),commit:a=>{window.fixtureChoice=a;fixtureState=E.applyAction(fixtureState,fixtureState.turn,a);},root:()=>document.querySelector('.table-shell')});fixtureTarget.tap(actions[0].target);
   return {count:actions.length,last:actions.at(-1).cardIndex};
  });
  assert.equal(await page.locator('.player-target-menu [data-card-index]').count(),choice.count);
  assert(await page.locator('.player-target-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
  await page.locator('.player-target-menu [data-card-index]').last().click();assert.equal(await page.evaluate(()=>fixtureChoice.cardIndex),choice.last);await page.evaluate(()=>fixtureTarget.destroy());
  const rolls=await page.evaluate(async()=>{
   const E=TabletopCore;let s=E.createGame('yatzy',{seed:17,players:[{name:'Аня'},{name:'Борис'}]});const render=()=>{const p=E.project(s,0),actions=E.legalActions(s,0);document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Ятзи',state:p,viewer:0,actions,scene:PlayroomViews.render(p,0,actions)});PlayroomGameScreen.layoutScene(document.querySelector('#app'));};render();const a=E.legalActions(s)[0],snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:a});s=E.applyAction(s,0,a);render();const done=PlayroomMotion.play(snapshot,{duration:220});await new Promise(r=>setTimeout(r,30));const count=document.querySelectorAll('[data-motion-kind="roll"].playroom-motion-flight').length;await done;return count;
  });assert.equal(rolls,5,'all five unheld dice animate');
  const sample=await page.evaluate(async()=>{const src=PlayroomCatalog.uno.sounds['uno.call'].src,bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));const context=new AudioContext();try{const decoded=await context.decodeAudioData(bytes.buffer);return {duration:decoded.duration,channels:decoded.numberOfChannels};}finally{await context.close();}});assert(sample.duration>0&&sample.channels>0);
  assert.deepEqual(errors,[]);assert.equal(safe.nativeSupabaseRequests,0);
 }finally{await browser.close();await fixture.close();}
});
test('Yatzy keeps score rows and table scroll stable when dice are held',{timeout:15000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:740}});page.setDefaultTimeout(5000);await page.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'yatzy-scroll-owner',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false,autoPass:false}));});const safe=await require('./account-sync-fixture.cjs').installFetch(page.context(),async route=>route.fulfill({json:{}}));if(process.env.PLAYROOM_YATZY_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_YATZY_ARTIFACT);await page.route('**/*',route=>route.abort());await page.route(fixture.url,route=>route.fulfill({status:200,contentType:'text/html',body}));}
  const response=await page.goto(fixture.url);
  if(process.env.PLAYROOM_YATZY_ARTIFACT){const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex'),actual=hash(await response.body());assert.equal(actual,hash(fs.readFileSync(process.env.PLAYROOM_YATZY_ARTIFACT)));if(process.env.PLAYROOM_YATZY_EVIDENCE_DIR){fs.mkdirSync(process.env.PLAYROOM_YATZY_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PLAYROOM_YATZY_EVIDENCE_DIR,'artifact.json'),JSON.stringify({sha256:actual,engine:browser.browserType().name(),version:browser.version()},null,2));}}
  await page.locator('[data-start="yatzy"]').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('yatzy',false));
  await page.locator('[data-start="yatzy"]').first().click();await page.locator('#modal-root>[data-surface-state=active] [data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command="lobby-start"]').click();await page.locator('.yatzy-score').waitFor();
  const before=await page.locator('.yatzy-score tbody tr').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  await page.locator('.yatzy-roll[data-action]').click();await page.locator('[data-motion-kind="roll"]').first().waitFor();
  await page.locator('[data-motion-kind="roll"]').first().waitFor({state:'detached'});const landed=Date.now();
  await page.locator('.yatzy-dice [data-action]').first().waitFor();assert(Date.now()-landed<230,'next action unlocks after dice motion and its normal settle, without a card-animation budget');
  const after=await page.locator('.yatzy-score tbody tr').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  assert(before.every((height,i)=>Math.abs(height-after[i])<=1),'score buttons do not stretch rows');
  const top=await page.locator('.yatzy-board').evaluate(board=>{board.scrollTop=board.scrollHeight;window.qaYatzyBoard=board;return board.scrollTop;});assert(top>0);
  await page.locator('.yatzy-dice [data-action]').first().click();
  assert(await page.locator('.yatzy-board').evaluate(board=>board===window.qaYatzyBoard),'holding a die keeps the table node');
  assert(Math.abs(await page.locator('.yatzy-board').evaluate(board=>board.scrollTop)-top)<=1,'holding a die keeps table scroll');
  await page.locator('.yatzy-roll[data-action]').click();await page.waitForFunction(()=>document.querySelector('.yatzy-board')?.scrollTop>0);
  await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.rolls===2);await page.locator('.table-shell>.scene[aria-busy="false"]').waitFor();assert(Math.abs(await page.locator('.yatzy-board').evaluate(board=>board.scrollTop)-top)<=1,'reroll settles at the retained table position');
  if(process.env.PLAYROOM_YATZY_EVIDENCE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_YATZY_EVIDENCE_DIR,'yatzy-reroll-390.png')});
  assert.equal(safe.nativeSupabaseRequests,0);
 }finally{await browser.close();await fixture.close();}
});


test('Mage eight-player geometry preserves controls and field through one legal commit across viewports',{timeout:90000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const safe=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'mage-eight-geometry',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});
  await page.goto(fixture.url);await page.waitForFunction(()=>{try{return TabletopCore.get('mage-brawl').max===8;}catch(_){return false;}});
  const report=[];
  if(process.env.PLAYROOM_QA_DIR)fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});
  for(const [width,height]of [[320,640],[390,740],[740,390],[640,280],[768,1024],[1280,900]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.evaluate(({width,height})=>{
    const E=TabletopCore;window.qaMageEightSession=new TabletopSession(E,'mage-brawl',{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:['Аня','Борис','Вера','Глеб','Даша','Егор','Женя','Зоя'].map(name=>({name}))});
    window.qaMageEightRender=()=>{const state=qaMageEightSession.current,viewer=0,projected=E.project(state,viewer),actions=E.legalActions(state,viewer),host=document.querySelector('#app');const markup=PlayroomGameScreen.render({layoutId:'mage-eight:'+width+'x'+height,gameName:E.get('mage-brawl').name,state:projected,viewer,actions,scene:PlayroomViews.render(projected,viewer,actions,{selected:null}),turnText:'Ваш ход'});const kept=PlayroomGameScreen.update(host,markup);if(!kept)PlayroomGameScreen.layoutScene(host);return kept;};
    qaMageEightRender();
   },{width,height});
   for(const phase of ['initial','committed']){
    if(phase==='committed'){
     const commit=await page.evaluate(()=>{const session=qaMageEightSession,E=TabletopCore,before=session.current.move,actor=session.current.turn,action=E.botAction(session.current);if(!E.legalActions(session.current,actor).some(legal=>JSON.stringify(legal)===JSON.stringify(action)))throw Error('No legal Mage command');session.act(actor,action);return {before,after:session.current.move,kept:qaMageEightRender(),action};});
     assert.equal(commit.before,0);assert.equal(commit.after,1);assert.equal(commit.kept,true,'one legal commit retains the same authorized scene allocation');
    }
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const issues=await page.evaluate(sceneGeometryIssues),players=await page.locator('.app-game-layout .player-panel[data-player-index]').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.playerIndex)).size);
    if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`mage-eight-${width}x${height}-${phase}.png`)});
    assert.equal(players,8,'all eight actual players remain represented');assert.deepEqual(issues,[],`Mage eight ${width}x${height} ${phase}`);report.push({width,height,phase,players,issues});
   }
  }
  assert.deepEqual(errors,[]);assert.equal(safe.nativeSupabaseRequests,0);
  if(process.env.PLAYROOM_QA_DIR)fs.writeFileSync(path.join(process.env.PLAYROOM_QA_DIR,'report.json'),JSON.stringify({states:report,errors,nativeSupabaseRequests:safe.nativeSupabaseRequests},null,2));
 }finally{await browser.close();await fixture.close();}
});

test('Pexeso resumes every board size and flips only the selected slot through the real application',{timeout:90000},async()=>{
 const Engine=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/pexeso/rules.js');
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const deck of ['cartoon','52'])for(const preset of ['easy','medium','hard']){
  const saved=new Session(Engine,'pexeso',{seed:17,preset,deck,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]}).export();
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true,reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.addInitScript(saved=>{localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'pexeso-artifact-owner',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({animationSpeed:'fast',sound:false,tutorialsEnabled:false,autoPass:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
   const safe=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
   if(process.env.PLAYROOM_PEXESO_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_PEXESO_ARTIFACT);await page.route('**/*',route=>route.abort());await page.route(server.url,route=>route.fulfill({status:200,contentType:'text/html',body}));}
   const response=await page.goto(server.url);
   if(process.env.PLAYROOM_PEXESO_ARTIFACT){const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex'),actual=hash(await response.body());assert.equal(actual,hash(fs.readFileSync(process.env.PLAYROOM_PEXESO_ARTIFACT)));if(process.env.PLAYROOM_PEXESO_EVIDENCE_DIR){fs.mkdirSync(process.env.PLAYROOM_PEXESO_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PLAYROOM_PEXESO_EVIDENCE_DIR,'artifact.json'),JSON.stringify({sha256:actual,engine:browser.browserType().name(),version:browser.version()},null,2));}}
   await page.locator('[data-hub-page=sessions]:visible').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();await page.locator('.pexeso-slot').first().waitFor();
   assert.equal(await page.locator('.pexeso-slot').count(),saved.states[0].data.board.length);
   await page.evaluate(()=>window.qaPexesoSlots=[...document.querySelectorAll('.pexeso-slot')].map(node=>({node,art:node.querySelector('svg')})));
   await page.locator('.pexeso-slot[data-motion-value="0"] [data-action]').tap();await page.locator('[data-motion-kind="flip"]').first().waitFor();await page.locator('[data-motion-kind="flip"]').first().waitFor({state:'detached'});await page.locator('.table-shell>.scene[aria-busy="false"]').waitFor();
   assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),1);assert.equal(await page.locator('.pexeso-slot .shared-card-back').count(),saved.states[0].data.board.length-1);
   assert(await page.evaluate(()=>qaPexesoSlots.every(({node,art},i)=>node===document.querySelectorAll('.pexeso-slot')[i]&&(i===0||art===node.querySelector('svg')))),`${deck}/${preset} retains untouched positions and artwork`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert.equal(safe.nativeSupabaseRequests,0);
   if(process.env.PLAYROOM_PEXESO_EVIDENCE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_PEXESO_EVIDENCE_DIR,`${deck}-${preset}-390.png`)});
  }finally{await context.close();}
 }}finally{await browser.close();await server.close();}
});

test('canonical physical piece radii scale with miniature and full size without clipping framed SVG',{timeout:30000},async()=>{
 const packs=path.dirname(fs.realpathSync(path.join(root,'packs'))),shared=path.join(packs,'shared'),C=require(path.join(shared,'components/game-components.js')),styles=['view-kit.css','asset-packs/mini-cards/styles.css','asset-packs/uno-deck/styles.css','asset-packs/solitaire-board/styles.css'].map(p=>fs.readFileSync(path.join(shared,p),'utf8')).join('\n');const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:900,height:900},deviceScaleFactor:2}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{const rows=[24,34,48,70,140].map(size=>`<section class="radius-row"><b>${size}px</b>${['card','uno','mini','slot','square','die','solitaire'].map(kind=>{const art=kind==='die'?C.dieArt(6):kind==='square'?C.cardFrame(C.dieArt(6),{shape:'square'}):C.cardBack();const cls=kind==='die'?'shared-die':kind==='slot'?'shared-card-slot':kind==='mini'?'mini-card':kind==='uno'?'shared-card uno-card art-card':kind==='solitaire'?'shared-card solitaire-card':'shared-card';const tag=kind==='mini'?'span':'button';return `<div class="sample-holder ${kind==='solitaire'?'solitaire-board':''}"><div class="${kind==='solitaire'?'solitaire-content':''}" style="--cw:${size}px;--ch:${size*1.4}px"><${tag} data-kind="${kind}" data-size="${size}" class="${cls}" style="width:${size}px;height:${size*(kind==='die'||kind==='square'?1:1.4)}px">${kind==='slot'?'':art}</${tag}><small>${kind}</small></div></div>`;}).join('')}</section>`).join('');await page.setContent(`<style>body{margin:16px;background:#f5f2e8}.radius-row{display:flex;align-items:flex-start;gap:18px;margin:18px 0}.radius-row>b{width:44px;flex:none}.sample-holder{flex:none;width:auto!important;height:auto!important}.sample-holder>div{display:block;padding:0;gap:0;flex:none}.sample-holder small{display:block;font:11px system-ui;margin-top:8px}</style><style>${styles}</style>${rows}`);
 const metrics=await page.locator('[data-kind]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),v=s.borderTopLeftRadius.split(' '),px=(x,n)=>x.endsWith('%')?parseFloat(x)*n/100:parseFloat(x);return{kind:e.dataset.kind,size:Number(e.dataset.size),width:r.width,height:r.height,rx:px(v[0],r.width),ry:px(v[1]||v[0],r.height),radius:s.borderTopLeftRadius,overflow:s.overflow,svg:e.querySelector('svg')?.getBoundingClientRect().toJSON()};}));
 const out=process.env.PLAYROOM_PIECE_RADIUS_OUT;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));await page.screenshot({path:path.join(out,'physical-piece-sizes.png'),fullPage:true});}
 for(const m of metrics){const ratio=m.kind==='die'?11/60:1/8;assert(Math.abs(m.rx/m.width-ratio)<.001,m.kind+' horizontal radius scales at '+m.size+'px: '+m.radius);assert(Math.abs(m.rx-m.ry)<.1,m.kind+' radius remains circular');if(['card','uno','square','solitaire'].includes(m.kind))assert.equal(m.overflow,'visible','typed SVG owns its clipping: '+m.kind);if(m.svg){assert(Math.abs(m.svg.width-m.width)<.1);assert(Math.abs(m.svg.height-m.height)<.1);}}assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

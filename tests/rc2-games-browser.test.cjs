'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
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
   return {revision:authority.revision,cell:client.snapshot.state.modelProjection.data.board[4],
     initial:frame.state.modelProjection.data.board[4],secret:JSON.stringify(client.snapshot).includes('"rng"')};
  });
  assert.deepEqual(history,{revision:1,cell:1,initial:null,secret:false});assert.deepEqual(errors,[]);
  await page.evaluate(()=>{modelNetwork.mounted.destroy();modelNetwork.client.close();modelNetwork.authority.dispose();});
 }finally{await browser.close();await fixture.close();}
});
test('new game scenes preserve proportions, reachable controls and hands before and after a move',{timeout:120000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await browser.newPage({viewport:{width:390,height:740}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(fixture.url);if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Тест');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}assert.equal(await page.locator('#modal-root .modal').count(),0);const games=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid'];
  for(const [width,height]of [[320,640],[390,740],[740,390],[640,280],[768,1024],[1280,900]]){await page.setViewportSize({width,height});for(const game of games)for(const progressed of [false,true]){
   await page.evaluate(({game,progressed,width})=>{
    const E=TabletopCore,g=E.get(game);let state=E.createGame(game,{seed:17,preset:g.presets[0].id,...(game==='ludo'?{diceCount:3}:{}),players:Array.from({length:width<=390?g.max:2},(_,i)=>({name:['Аня','Борис','Вера','Глеб','Даша','Егор'][i]}))});
    if(progressed){const count=game==='battleship'?2:game==='pexeso'?2:1;for(let n=0;n<count;n++)state=E.applyAction(state,state.turn,E.botAction(state));if(game==='yatzy')state=E.applyAction(state,state.turn,E.legalActions(state).find(a=>a.type==='score'));}
    window.fixtureState=state;const viewer=state.turn,projected=E.project(state,viewer),actions=E.legalActions(state,viewer),scene=PlayroomViews.render(projected,viewer,actions,{selected:null});
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:g.name,state:projected,viewer,actions,scene,turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   },{game,progressed,width});
   await page.waitForTimeout(35);
   const result=await page.evaluate(()=>{
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
    if(gameShell&&getComputedStyle(gameShell.querySelector('.table-title h1')).userSelect!=='none')issues.push('game text selectable');
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
   });
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
    let s=E.createGame(game,{seed:17,players:Array.from({length:E.get(game).max},(_,i)=>({name:`Игрок ${i+1}`}))});
    if(game==='battleship')for(let n=0;n<2;n++){s=E.applyAction(s,s.turn,{type:'auto'});s=E.applyAction(s,s.turn,{type:'ready'});}
    const p=E.project(s,-1);document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:game,state:p,viewer:-1,actions:[],scene:PlayroomViews.render(p,-1,[],{surface:'table'})});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    if(document.querySelector('.view-error')||document.querySelector('[data-action]:not([disabled])'))issues.push(game+' public actions');
    if(game==='yatzy'&&document.querySelectorAll('.shared-die').length!==5)issues.push('missing public dice');
    if(game==='ludo'&&document.querySelectorAll('.shared-die').length!==1)issues.push('missing public die');
    if(game==='battleship'){
     if(document.querySelectorAll('[data-view-key="fleet"]').length!==2)issues.push('missing public fleet switch');
     if(!document.querySelector('[data-view-preference="followOpponent"]'))issues.push('missing spectator auto-switch');
     if(PlayroomGameFlow.viewingTime(PlayroomCatalog.battleship.capabilities,{data:{phase:'battle'}})!==750)issues.push('missing minimum shot viewing time');
    }
   }return issues;
  });assert.deepEqual(publicViews,[]);
  for(const id of ['ludo','yatzy']){
   const replay=await page.evaluate(id=>{
    const E=TabletopCore,players=Array.from({length:id==='ludo'?4:2},(_,i)=>({name:`Игрок ${i+1}`}));let s=E.createGame(id,{seed:17,players,diceCount:3});
    s=E.applyAction(s,s.turn,E.legalActions(s)[0]);const p=E.project(s,0),scene=PlayroomViews.render(p,0,[]);
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:id,state:p,viewer:0,scene,replay:true,historyHTML:PlayroomGameScreen.historyMarkup({index:1,count:3})});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    const outer=document.querySelector('.scene').getBoundingClientRect(),dice=[...document.querySelectorAll('.layout-actions .shared-die')],buttons=[...document.querySelectorAll('.layout-actions .scene-button')];
    return {count:dice.length,visible:dice.every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=outer.top&&r.bottom<=outer.bottom}),controls:buttons.some(el=>getComputedStyle(el).display!=='none')};
   },id);
   assert.equal(replay.count,id==='ludo'?3:5);assert.equal(replay.visible,true,`${id} replay dice visible`);assert.equal(replay.controls,false,`${id} replay controls hidden`);
   if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`${id}-history-390.png`)});
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
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await fixture.close();}
});
test('Yatzy keeps score rows and table scroll stable when dice are held',{timeout:15000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:740}});page.setDefaultTimeout(5000);await page.goto(fixture.url);if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Тест');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  await page.locator('[data-start="yatzy"]').first().click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command="lobby-start"]').click();
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
 }finally{await browser.close();await fixture.close();}
});

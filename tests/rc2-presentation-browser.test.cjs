'use strict';
const {selectChoice,readChoice}=require('./browser-origin.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),shots=process.env.PLAYROOM_TUTORIAL_CAPTURE_DIR?path.resolve(process.env.PLAYROOM_TUTORIAL_CAPTURE_DIR):path.join(root,'tmp_files/rc2-presentation');
async function fixture(run,{settings={sound:false,animationSpeed:'fast',quickPlay:false,autoPass:false},learningPrompted=true,safeSupabase=false}={}){
 const server=await serveBrowserFixture(root),webkit=process.env.PLAYROOM_TEST_BROWSER==='webkit',browser=await (webkit?require('playwright-core').webkit:chromium).launch(webkit?{headless:true}:{headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await browser.newPage({viewport:{width:1098,height:1238}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let provider=null;if(safeSupabase||process.env.PLAYROOM_TUTORIAL_REPORT){const sync=require('./account-sync-fixture.cjs');provider=await sync.installFetch(page.context(),sync(async route=>route.fulfill({status:200,json:{profile:null,friends:[],groups:[],entries:[],rooms:[],invitations:[],messages:[]}})));}
 await page.addInitScript(({settings,learningPrompted})=>{if(learningPrompted&&!localStorage.getItem('playroom.learning.v1.rc2'))localStorage.setItem('playroom.learning.v1.rc2',JSON.stringify(Object.fromEntries(['uno','durak','gofish','oldmaid','domino','ludo','snakes','battleship','checkers','tictactoe','pexeso','yatzy','klondike','spider','mage-brawl'].map(id=>[id,{enabled:true,prompted:true,mastered:{}}]))));localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'rc2',name:'Иван',createdAt:1,updatedAt:1}));if(settings&&!localStorage.getItem('playroom.settings.v1'))localStorage.setItem('playroom.settings.v1',JSON.stringify(settings));},{settings,learningPrompted});
 let artifactProof=null,completed=false;try{
 const requestedArtifact=process.env.PLAYROOM_TEST_ARTIFACT;
 if(requestedArtifact&&!/^https?:/i.test(requestedArtifact)){
  const artifact=requestedArtifact.startsWith('file:')?require('node:url').fileURLToPath(requestedArtifact):path.resolve(requestedArtifact),body=fs.readFileSync(artifact),hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
  await page.route('**/*',route=>route.abort());await page.route(server.url,route=>route.fulfill({status:200,contentType:'text/html',body}));const response=await page.goto(server.url);assert.equal(hash(await response.body()),hash(body),'actual compiled tutorial document');artifactProof={path:artifact,sha256:hash(body)};
 }else await page.goto(requestedArtifact||server.url);await page.locator('.game-tile').first().waitFor({timeout:10000}).catch(error=>{throw Error(errors.join('\n')||error.message);});fs.mkdirSync(shots,{recursive:true});await run(page);assert.deepEqual(errors,[]);if(provider)assert.equal(provider.nativeSupabaseRequests,0);completed=true;}finally{
  if(process.env.PLAYROOM_TUTORIAL_REPORT){const out=process.env.PLAYROOM_TUTORIAL_REPORT_DIR?path.resolve(process.env.PLAYROOM_TUTORIAL_REPORT_DIR):path.resolve(root,'../tmp_files/ux-021/functional-1104/tutorials');fs.mkdirSync(out,{recursive:true});const games=await page.evaluate(ids=>Object.fromEntries(ids.map(game=>{const definition=PlayroomViews.get(game)?.tutorial,goals=definition?.goals||[],saved=PlayroomFirstTurnGuide.settings(game);return [game,{goals,saved,remaining:goals.filter(goal=>saved.mastered[goal.id]!==goal.revision).map(goal=>goal.id)}];})),(process.env.PLAYROOM_TUTORIAL_GAMES||'').split(',').filter(Boolean)).catch(()=>null);fs.writeFileSync(path.join(out,process.env.PLAYROOM_TUTORIAL_REPORT+'.json'),JSON.stringify({completed,artifactProof,browserType:browser.browserType().name(),browserVersion:browser.version(),errors,nativeSupabaseRequests:provider?.nativeSupabaseRequests,games},null,2));}
  await browser.close();await server.close();}
}
async function scene(page,game,options={}){
 await page.evaluate(({game,options})=>{
  window.rcUI={};window.rcStateOverride=null;window.rcSession=new TabletopSession(TabletopCore,game,{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:Math.min(TabletopCore.get(game).max,Math.max(TabletopCore.get(game).min,4))},(_,i)=>({name:['Иван','Тео','Сэм','Кира'][i]})),...options});
  window.rcRender=()=>{const actual=rcStateOverride||rcSession.current,state=TabletopCore.project(actual,0),actions=TabletopCore.legalActions(actual,0),scene=PlayroomViews.render(state,0,actions,{selected:null,preferences:{},viewState:{},...rcUI});PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:TabletopCore.get(game).name,state,viewer:0,actions,scene,turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));};rcRender();
 },{game,options});
}
test('landscape reserves readable player zones before maximizing the field',{timeout:90000},async()=>fixture(async page=>{
 const rows=[];
 for(const game of ['uno','mage-brawl','durak','domino','yatzy','battleship','checkers','gofish','ludo','oldmaid','pexeso','snakes','tictactoe']){
  const count=await page.evaluate(game=>TabletopCore.get(game).max,game);
  await scene(page,game,{players:Array.from({length:count},(_,i)=>({name:['Иван','Мика','Луна','Ника','Тео','Сэм','Лев','Кира'][i]}))});
  for(const [width,height]of [[900,600],[844,390],[740,390],[390,844],[900,600]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>document.querySelector('.app-game-layout')?.dataset.screenOrientation===(innerWidth>innerHeight?'landscape':'portrait'));
   const row=await page.evaluate(()=>{
    const stage=document.querySelector('.app-game-layout'),rect=node=>node.getBoundingClientRect().toJSON();
    const roster=stage.querySelector('.layout-participants'),self=stage.querySelector('.layout-self'),field=stage.querySelector('.layout-field');
    const panels=[...roster.querySelectorAll('.player-panel')].filter(n=>n.getClientRects().length);
    const hand=self.querySelector('.layout-hand'),cards=[...hand?.querySelectorAll('.hand-card')||[]];
    return {width:innerWidth,height:innerHeight,anchors:stage.dataset.seatAnchors==='true',columns:Number(stage.dataset.landscapeRosterColumns)||0,roster:rect(roster),self:rect(self),field:rect(field),panels:panels.map(rect),names:panels.map(p=>{const n=p.querySelector('.player-heading strong');return {text:n.textContent,width:n.clientWidth,needed:n.scrollWidth};}),cards:cards.map(rect),pageOverflow:document.documentElement.scrollWidth-innerWidth};
   });
   assert(row.pageOverflow<=1,game+' page stays within viewport');
   if(width>height&&!row.anchors){
    assert(row.self.width>=239,game+' keeps the local hand reserve: '+JSON.stringify(row));
    assert(row.panels.every(p=>p.width>=143),game+' keeps readable opponent cards');
    assert(row.names.every(n=>n.width>=n.needed),game+' ordinary player names fit');
    assert.equal(row.columns,width===740||count===2?1:2,game+' chooses columns from their minimum widths');
    assert(row.field.left>=row.roster.right-1&&row.field.right<=row.self.left+1,game+' field stays between player zones');
   }
   rows.push({game,...row});
   if(width===900&&height===600)await page.screenshot({path:path.join(shots,`readable-zones-${game}.png`)});
  }
  // Repainting the same committed state cannot silently renegotiate zone sizes.
  const before=await page.locator('.layout-self').boundingBox();await page.evaluate(()=>rcRender());
  assert.deepEqual(await page.locator('.layout-self').boundingBox(),before,game+' repaint preserves geometry');
 }
 fs.writeFileSync(path.join(shots,'readable-zones.json'),JSON.stringify(rows,null,2));
},{safeSupabase:true}));

test('shared-grid games force rows and the complete Yatzy table fits phone and tablet widths',{timeout:45000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/dice-review');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height]of [[320,640],[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const game of ['yatzy']){
   await scene(page,game);await page.evaluate(()=>{rcUI={seating:'circle'};rcRender();});
   await page.screenshot({path:path.join(dir,`${game}-${width}x${height}.png`)});
   assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'row',game+' has no spatial seats');
   if(game==='yatzy'){
    const table=await page.locator('.yatzy-board').evaluate(board=>({overflow:board.scrollWidth-board.clientWidth,widths:[...board.querySelectorAll('thead [data-score-player]')].map(el=>el.getBoundingClientRect().width)}));
    assert(table.overflow<=1,JSON.stringify({width,height,table}));assert(table.widths.every(w=>w>=28&&Math.abs(w-table.widths[0])<1));
   }
  }
 }
 await page.reload();
 await page.locator('[data-start="yatzy"]').first().click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(const seat of ['seat-3','seat-4'])b.roomService.setLocalSeat(r.id,r.ownerId,seat,{kind:'bot',nickname:seat});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
 await page.locator('[data-command="lobby-start"]').click();await page.locator('.yatzy-score').waitFor();
 await page.locator('.table-shell [data-command="settings"]').click();
 assert.equal(await page.locator('#setting-seating').count(),0);assert.equal(await page.locator('#setting-hand-shape').count(),0);
 await page.locator('.modal [data-command="close-modal"]').click();await page.locator('.yatzy-roll[data-action]').click();const category=page.locator('.yatzy-score button[data-action]').filter({hasText:/^0$/}).first();
 await category.waitFor();const before=await page.locator('.yatzy-score').textContent(),dice=await page.locator('.yatzy-dice').innerHTML(),box=await page.locator('.layout-field').boundingBox();
 for(const cancel of ['button','escape','close']){
  await category.click();await page.locator('.modal [data-command="confirm-action"]').waitFor();
  assert.match(await page.locator('.modal .lead').textContent(),/0 очков/);
  assert.equal(await page.locator('.yatzy-score').textContent(),before);assert.equal(await page.locator('.yatzy-dice').innerHTML(),dice);assert.deepEqual(await page.locator('.layout-field').boundingBox(),box);
  await page.screenshot({path:path.join(dir,'yatzy-confirmation.png')});
  if(cancel==='escape')await page.keyboard.press('Escape');else await page.locator('.modal [data-command="close-modal"]').nth(cancel==='close'?0:1).click();
  assert.equal(await page.locator('.yatzy-score').textContent(),before);assert.equal(await page.locator('.yatzy-dice').innerHTML(),dice);
 }
 await category.click();for(const [width,height] of [[320,640],[390,844],[844,390]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(dir,`yatzy-confirmation-${width}.png`)});const box=await page.locator('.modal').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);}await page.locator('.modal [data-command="confirm-action"]').click();await page.locator('.action-reveal').waitFor();
 await page.screenshot({path:path.join(dir,'yatzy-live-dice.png')});
}));
test('playable hand outlines stay inside the scroll viewport and recent teams share one player flow',{timeout:45000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/hand-rings');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});await scene(page,'uno');
  await page.evaluate(()=>{rcUI={seating:'row'};rcRender();});
  const cards=await page.evaluate(()=>{
   const track=document.querySelector('.own-hand .hand-track');track.scrollLeft=0;
   return [...track.querySelectorAll('.hand-card.is-playable')].map(card=>{
    const s=getComputedStyle(card),r=card.getBoundingClientRect(),t=track.getBoundingClientRect(),edge=Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset));
    return {edge,width:parseFloat(s.outlineWidth),left:r.left-edge-track.clientLeft-t.left,right:r.right+edge-(t.left+track.clientLeft+track.clientWidth),top:r.top-edge-track.clientTop-t.top,bottom:r.bottom+edge-(t.top+track.clientTop+track.clientHeight)};
   });
  });
  await page.screenshot({path:path.join(dir,`uno-${width}x${height}.png`)});
  assert(cards.length>0);assert(cards.every(c=>c.width>=2));
  // A selected/preview card can be lifted, so its ring must not extend its painted bounds.
  assert(cards.every(c=>c.edge===0),'outline is painted over the card, never outside its scrollable bounds');
  const focused=await page.evaluate(()=>{
   const action=TabletopCore.legalActions(rcSession.current,0).find(a=>a.card);rcUI.selected=action.card;rcRender();
   const card=document.querySelector('.own-hand .hand-card.is-selected');card.focus();const s=getComputedStyle(card);
   return {width:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset)};
  });
  assert(focused.width>=2&&focused.width+focused.offset<=0,'keyboard focus and selection keep the complete ring inside the card');
  await page.screenshot({path:path.join(dir,`uno-${width}x${height}-selected.png`)});
 }
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const game of ['uno','checkers','yatzy']){
  await scene(page,game);
  if(game==='yatzy')await page.evaluate(()=>{const action=TabletopCore.legalActions(rcSession.current,0).find(a=>a.type==='roll');rcSession.act(0,action);rcRender();});
  const cue=page.locator('.is-playable').first();assert(await cue.count()>0,game+' playable object');
  const pulse=await cue.evaluate(n=>{const stage=n.closest('.app-game-layout'),animation=stage.getAnimations().find(a=>a.animationName==='piece-highlight-pulse');if(!animation)return null;animation.pause();animation.currentTime=0;const first=getComputedStyle(n).getPropertyValue('--piece-highlight-strength');animation.currentTime=1300;return [first,getComputedStyle(n).getPropertyValue('--piece-highlight-strength')];});
  assert(pulse&&pulse[0]!==pulse[1],game+' shared highlight pulses');
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.app-game-layout').evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const names=await page.evaluate(()=>{
  const teams=[{id:'a',label:'А',color:'#638658'},{id:'b',label:'Б',color:'#c97866'}];
  const state={players:['Иван','Луна','Сэм','Кира'].map((name,i)=>({name,bot:i>0})),firstPlayer:2,turn:0,preset:'teams',status:'playing',scene:{round:{number:1},players:[0,1,2,3].map(player=>({player,team:teams[player%2]}))}};
  document.querySelector('#app').innerHTML=PlayroomGameScreen.resumeCard({state,network:true,gameName:'Лудо',roomName:'Комната Иван',participants:[{playerIndex:0,isHost:true}]});
  return [...document.querySelectorAll('.resume-person')].map(p=>({name:p.querySelector('.resume-person-name>span:last-child').textContent.trim(),y:p.getBoundingClientRect().top}));
 });
 assert.deepEqual(names.map(p=>p.name),['Иван','Луна','Сэм','Кира']);assert(names.every(p=>Math.abs(p.y-names[0].y)<1),'teams do not force a new row');
 await page.screenshot({path:path.join(dir,'recent-teams-390.png')});
}));
test('UNO forced skips preserve corner seats and hands through every animation frame',{timeout:60000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/skip-feedback');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height] of [[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const target of [1,3])for(const value of ['skip','+2']){
   await scene(page,'uno',{firstPlayer:target-1});
   const result=await page.evaluate(async({target,value})=>{
    rcUI={seating:'circle'};let action;
    for(let seed=1;seed<=100;seed++){
     rcSession=new TabletopSession(TabletopCore,'uno',{seed,mode:'solo',firstPlayerMode:'assigned',firstPlayer:target-1,players:['Иван','Тео','Сэм','Кира'].map(name=>({name}))});
     action=TabletopCore.legalActions(rcSession.current,target-1).find(a=>a.type==='play'&&rcSession.current.data.hands[target-1].find(c=>c.id===a.card)?.value===value);
     if(action)break;
    }
    if(!action)throw Error('UNO_SKIP_FIXTURE');
    rcSession.act(target-1,action);rcRender();
    const event=TabletopCore.project(rcSession.current,0).events.findLast(e=>e.feedback?.kind==='skip'&&e.feedback.player===target);
    if(!event)throw Error('UNO_SKIP_EVENT');
    const panel=document.querySelector(`.seat-group .player-panel[data-player-index="${target}"]`);
    const measure=()=>{const s=getComputedStyle(panel),m=new DOMMatrix(s.transform),r=panel.getBoundingClientRect(),h=panel.querySelector('.mini-hand').getBoundingClientRect();return {matrix:[m.a,m.b,m.c,m.d],x:r.x,y:r.y,w:r.width,h:r.height,handW:h.width,handH:h.height};};
    const before=measure();window.rcSkipFeedback=new PlayroomGameFeedback();rcSkipFeedback.accept([event],[],'uno',{mode:'slow'});
    const animation=panel.getAnimations().find(a=>a.animationName==='player-turn-skipped');animation.pause();
    const samples=[];for(const fraction of [0,.18,.35,.52,.69,.85,1]){animation.currentTime=animation.effect.getTiming().duration*fraction;samples.push(measure());}
    animation.currentTime=animation.effect.getTiming().duration*.35;
    return {before,samples,seating:document.querySelector('.app-game-layout').dataset.seating,fallback:document.querySelector('.app-game-layout').dataset.seatingFallback};
   },{target,value});
   await page.screenshot({path:path.join(dir,`uno-${width}x${height}-${target}-${value==='skip'?'skip':'draw2'}.png`)});
   for(const sample of result.samples){
    assert.deepEqual(sample.matrix,result.before.matrix,'skip must preserve the seat rotation');
    for(const key of ['w','h','handW','handH'])assert(Math.abs(sample[key]-result.before[key])<1,`skip must preserve ${key}`);
    assert(Math.abs(sample.x-result.before.x)<=4.1&&Math.abs(sample.y-result.before.y)<=4.1,'shake stays inside its four-pixel reserve');
   }
   assert.equal(Math.round(result.before.matrix[1]),0,'corner identities remain upright');
   assert(result.seating==='circle'||result.seating==='row'&&result.fallback==='true',`corners or explicit responsive fallback ${width}x${height} target ${target} ${value}`);
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.is-turn-skipped').evaluate(el=>getComputedStyle(el).animationName),'none');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>rcSkipFeedback.destroy());
  }
 }
}));
test('RC2 themed surfaces, proportional pawns, card choice and circular interaction rings',{timeout:60000},async()=>fixture(async page=>{
 await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));
 for(const game of ['domino','durak','battleship']){await scene(page,game);const selector={domino:'.domino-board',durak:'.durak-table',battleship:'.battle-grid'}[game];const rgb=await page.locator(selector).first().evaluate(el=>getComputedStyle(el).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number));assert(Math.max(...rgb)<170,game+' surface must use the dark palette');}
 await scene(page,'snakes');const sizes=await page.evaluate(()=>{rcStateOverride=TabletopCore.clone(rcSession.current);rcStateOverride.data.positions=[6,1,6,2];rcRender();return [...document.querySelectorAll('.snakes-token')].map(n=>n.getBoundingClientRect().width);});assert(sizes[0]<=sizes[1],JSON.stringify(sizes));assert(sizes[1]>35,'single pawn scales with its cell');
 await page.screenshot({path:path.join(shots,'dark-snakes.png')});
 await scene(page,'checkers');const selected=await page.locator('.checker-piece.is-playable').first().evaluate(el=>({shape:el.dataset.interactionShape,radius:getComputedStyle(el).borderRadius,width:getComputedStyle(el).outlineWidth}));assert.equal(selected.shape,'circle');assert.equal(selected.radius,'50%');assert(parseFloat(selected.width)>=2);assert.equal(await page.locator('.checker-art .available-marker').count(),0);
 await page.screenshot({path:path.join(shots,'dark-checkers.png')});
 await scene(page,'oldmaid');await page.evaluate(()=>{const p=new PlayroomPlayerTarget({root:()=>document.querySelector('.table-shell'),actions:()=>TabletopCore.legalActions(rcSession.current,0),commit(){}});p.tap(1);});
 assert(await page.locator('.player-target-menu.is-card-choice button[data-card-index]').first().evaluate(el=>el.getBoundingClientRect().width>=50&&el.getBoundingClientRect().width<=80));
 await page.screenshot({path:path.join(shots,'dark-card-choice.png')});
}));
test('RC2 feedback overlays preserve geometry, identity and speed; reveal has readable dark title',{timeout:45000},async()=>fixture(async page=>{
 await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));await scene(page,'gofish');
 const result=await page.evaluate(()=>{
  const shell=document.querySelector('.table-shell'),before={w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,scene:document.querySelector('.scene').getBoundingClientRect().height};
  window.rcFeedback=new PlayroomGameFeedback({mount:()=>shell});rcFeedback.accept([{id:1,speech:{speaker:0,target:1,icon:'cards',count:4,result:'success'}}],[],'gofish',{mode:'fast'});const bubble=rcFeedback.bubble;rcFeedback.refresh();
  return {before,after:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,scene:document.querySelector('.scene').getBoundingClientRect().height},same:bubble===rcFeedback.bubble,font:parseFloat(getComputedStyle(bubble).fontSize),parent:bubble.parentElement.className,position:getComputedStyle(bubble).position,left:bubble.getBoundingClientRect().left,top:bubble.getBoundingClientRect().top,times:PlayroomGameFeedback.times};
 });assert.deepEqual(result.after,result.before);assert(result.same);assert(result.font>=13);assert.equal(result.parent,'game-feedback-layer');assert.equal(result.position,'fixed');assert(result.left>=8&&result.top>100,'bubble anchored to its player, not viewport origin');assert(result.times.fast.skip<result.times.normal.skip);assert(result.times.fast.reveal<result.times.normal.reveal);
 await page.screenshot({path:path.join(shots,'dark-gofish-bubble.png')});
 await page.evaluate(()=>{rcFeedback.clear();rcFeedback.accept([{id:2,reveal:{kind:'dice',title:'Фулл-хаус',dice:[{value:6},{value:6},{value:6},{value:2},{value:2}]}}],[],'yatzy',{mode:'slow'});});
 const title=await page.locator('.action-reveal-title').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));assert.notEqual(title.bg,title.fg);assert.equal(await page.locator('.action-reveal-die').count(),5);await page.screenshot({path:path.join(shots,'dark-dice-reveal.png')});await page.evaluate(()=>rcFeedback.destroy());
}));
test('RC2 board stays still while marks animate and Pexeso scales into available field',{timeout:60000},async()=>fixture(async page=>{
 for(const [width,height]of [[1098,1238],[390,740],[740,390],[320,640]]){
  await page.setViewportSize({width,height});await scene(page,'tictactoe');
  const boxes=await page.evaluate(async()=>{
   const snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'place',cell:4}});rcSession.act(0,{type:'place',cell:4});rcRender();
   const motion=PlayroomMotion.play(snapshot,{duration:220}),samples=[];for(let i=0;i<10;i++){await new Promise(requestAnimationFrame);const b=document.querySelector('.ttt-grid').getBoundingClientRect();samples.push([b.x,b.y,b.width,b.height,document.documentElement.scrollWidth]);}await motion;return samples;
  });for(const box of boxes)for(let i=0;i<4;i++)assert(Math.abs(box[i]-boxes[0][i])<1,'field geometry must stay fixed '+JSON.stringify({width,height,boxes}));
  assert(boxes.every(b=>b[4]<=width),'no page horizontal overflow');
 }
 await page.setViewportSize({width:1098,height:1238});await scene(page,'pexeso',{deck:'32'});assert(await page.locator('.pexeso-slot').first().evaluate(el=>el.getBoundingClientRect().width>70));await page.screenshot({path:path.join(shots,'dark-pexeso.png')});
}));
test('RC2 hub drops work in both directions and settings groups adapt',{timeout:45000},async()=>fixture(async page=>{
 await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-edit-toggle]').click();assert.equal(await page.locator('.hub-edit-section [data-edit-step]').count(),0,'catalog editing has no up/down buttons');
 const editId=await page.locator('[data-edit-drop="normal"] .game-tile').first().getAttribute('data-game');
 await page.locator(`[data-catalog-visibility="${editId}"]`).click();assert.equal(await page.locator(`[data-edit-drop="hidden"] [data-game="${editId}"]`).count(),1);await page.locator(`[data-catalog-visibility="${editId}"]`).click();
 await page.locator(`[data-game="${editId}"] [data-favorite]`).click();assert.equal(await page.locator(`[data-edit-drop="favorites"] [data-game="${editId}"]`).count(),1);await page.locator(`[data-game="${editId}"] [data-favorite]`).click();


 const cards=page.locator('[data-edit-drop="normal"] .game-tile');const before=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));
 async function drop(source,target,after){await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));const box=await target.boundingBox(),horizontal=box.width>box.height*1.5;await source.dragTo(target,{targetPosition:{x:box.width*(horizontal?.5:after?.8:.2),y:box.height*(horizontal?(after?.8:.2):.5)}});}
 await drop(page.locator(`[data-edit-drop="normal"] [data-game="${before[0]}"]`),page.locator(`[data-edit-drop="normal"] [data-game="${before[2]}"]`),true);
 let order=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));assert.equal(order[2],before[0]);
 await drop(page.locator(`[data-edit-drop="normal"] [data-game="${before[0]}"]`),page.locator(`[data-edit-drop="normal"] [data-game="${before[1]}"]`),false);
 assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game)),before);
 await page.setViewportSize({width:390,height:740});await page.locator('[data-catalog-mode=list]').click();
 const touchBefore=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));
 const touchSource=page.locator(`[data-edit-drop="normal"] [data-game="${touchBefore[0]}"]`),touchTarget=page.locator(`[data-edit-drop="normal"] [data-game="${touchBefore[1]}"]`);
 await touchSource.scrollIntoViewIfNeeded();let touchBox=await touchSource.boundingBox(),targetBox=await touchTarget.boundingBox();
 const pointer=(box,id)=>({pointerId:id,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:box.x+box.width/2,clientY:box.y+box.height/2});
 await touchSource.dispatchEvent('pointerdown',pointer(touchBox,91));await page.locator('.catalog-order-ghost').waitFor();await page.screenshot({path:path.join(shots,(process.env.PLAYROOM_TEST_BROWSER||'chromium')+'-catalog-touch-ghost.png')});
 assert(await page.locator('.catalog-order-ghost').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'&&!el.hasAttribute('data-game')&&el.querySelectorAll('[data-game],[data-command],[data-favorite]').length===0));
 const dropPoint={...pointer(targetBox,91),clientY:targetBox.y+targetBox.height*.8};await page.dispatchEvent('body','pointermove',dropPoint);await page.dispatchEvent('body','pointerup',dropPoint);await page.locator('.catalog-order-ghost').waitFor({state:'detached'});
 assert.equal((await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game)))[1],touchBefore[0],'controlled touch drop uses the same persisted ordering');
 const cancelled=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));const cancelSource=cards.first();touchBox=await cancelSource.boundingBox();await cancelSource.dispatchEvent('pointerdown',pointer(touchBox,92));await page.locator('.catalog-order-ghost').waitFor();await page.dispatchEvent('body','pointercancel',pointer(touchBox,92));await page.locator('.catalog-order-ghost').waitFor({state:'detached'});assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game)),cancelled);
 await page.reload();await page.locator('.game-tile').first().waitFor();await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=settings]').click();
 for(const viewport of [{width:1098,height:1238},{width:390,height:740}]){await page.setViewportSize(viewport);assert.equal(await page.locator('[data-settings-tab]').count(),3);await page.locator('[data-settings-tab=behavior]').click();assert(await page.locator('#settings-panel-behavior').isVisible());await page.screenshot({path:path.join(shots,`catalog-edit-settings-${viewport.width}.png`)});}
},{safeSupabase:true}));
test('RC2 Pexeso opens and closes with two continuous opaque sides and no layout changes',{timeout:30000},async()=>fixture(async page=>{
 await scene(page,'pexeso',{deck:'52'});
 const observations=await page.evaluate(async()=>{
  const values=rcSession.current.data.board,pair=c=>c.rank+'-'+(['♥','♦'].includes(c.suit)?'red':'black');
  const first=0,second=values.findIndex(c=>pair(c)!==pair(values[0]));const samples=[];
  for(const index of [first,second]){
   const action={type:'flip',index},beforeTurn=rcSession.current.turn,shot=PlayroomMotion.capture({actor:beforeTurn,viewer:0,action});rcSession.act(beforeTurn,action);rcUI={presentationTurn:beforeTurn};rcRender();
   const promise=PlayroomMotion.play(shot,{duration:220,effects:PlayroomGameFlow.effectTimes.fast}),field=document.querySelector('.pexeso-grid'),before=field.getBoundingClientRect();
   for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);const faces=[...document.querySelectorAll('[data-motion-kind="flip"]>div>*')],box=field.getBoundingClientRect();samples.push({sides:faces.length,opaque:faces.every(n=>getComputedStyle(n).opacity==='1'),stable:Math.abs(before.width-box.width)<1&&Math.abs(before.height-box.height)<1});}
   await promise;
  }
  const closed=[...document.querySelectorAll('[data-motion-close]')].every(slot=>getComputedStyle(slot.querySelector('.pexeso-face')).visibility==='hidden'&&getComputedStyle(slot.querySelector('.pexeso-close-back')).visibility==='visible');rcUI={};rcRender();
  return {samples,closed,layers:document.querySelectorAll('.playroom-motion-layer').length};
 });assert(observations.samples.every(x=>x.sides>=2&&x.opaque&&x.stable));assert(observations.closed);assert.equal(observations.layers,0);
}));
test('RC2 Battleship manual and automatic field controls agree with slide order for player and spectator',{timeout:30000},async()=>fixture(async page=>{
 const compiled={};require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'installed-packs.js'),'utf8'),compiled);const bundle=compiled.PlayroomInstalledPacks.find(p=>p.manifest.id==='battleship');
 for(const viewer of [0,-1]){
  await scene(page,'battleship');
  await page.evaluate(({bundle,viewer})=>{
   for(let i=0;i<2;i++){rcSession.act(rcSession.current.turn,{type:'auto'});rcSession.act(rcSession.current.turn,{type:'ready'});}
   window.rcAuthority=new SessionAuthority(rcSession);window.rcOwner=rcAuthority.connect(viewer);const snapshot=rcOwner.snapshot();
   const client={snapshot,pending:null,subscribe(){return()=>{};},send:async()=>({ok:true}),history:async()=>snapshot};
   window.rcShared=PlayroomSharedViews.mount(client,{manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css']});rcShared.render();
  },{bundle,viewer});
  assert.deepEqual(await page.locator('[data-view-key="fleet"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.viewValue)),['own','enemy']);
  await page.locator('[data-view-key="fleet"][data-view-value="own"]').click();assert.equal(await page.locator('.battle-fields').getAttribute('data-slide-key'),'0');assert.equal(await page.locator('[data-view-preference="followOpponent"]').getAttribute('aria-pressed'),'false');
  await page.locator('.scene').evaluate(el=>el.setAttribute('aria-busy','true'));
  await page.locator('[data-view-preference="followOpponent"]').click();assert.equal(await page.locator('[data-view-preference="followOpponent"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.battle-fields').getAttribute('data-slide-key'),'1');
  if(viewer<0)assert.equal(await page.locator('.battle-cell.ship').count(),0,'Spectator fields remain private');
  await page.evaluate(()=>{rcShared.destroy();rcAuthority.dispose();});
 }
}));

test('RC3 hub uses two columns down to 320px and an accessible icon-only edit control',{timeout:45000},async()=>fixture(async page=>{
 await page.evaluate(()=>{window.dispatchEvent(new Event('beforeinstallprompt',{cancelable:true}));});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);
  for(const width of [320,390,520,1090]){
   await page.setViewportSize({width,height:900});
   const layout=await page.evaluate(()=>{const grid=document.querySelector('.game-grid'),cards=[...grid.querySelectorAll('.game-tile')],button=document.querySelector('[data-edit-toggle]');return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,sameRow:Math.abs(cards[0].getBoundingClientRect().top-cards[1].getBoundingClientRect().top)<1,overflow:document.documentElement.scrollWidth>innerWidth+1,text:button.textContent.trim(),label:button.getAttribute('aria-label')};});
   if(width<=520){assert.equal(layout.columns,2);assert(layout.sameRow);assert(await page.locator('.game-tile').evaluateAll(cards=>cards.every(card=>card.getBoundingClientRect().height/card.getBoundingClientRect().width<1.3)),'cards should be nearly square');const overflow=await page.locator('.game-tile').evaluateAll(cards=>cards.filter(card=>card.scrollHeight>card.clientHeight+1).map(card=>({id:card.dataset.game,h:card.clientHeight,scroll:card.scrollHeight,parts:[...card.children].map(n=>({class:n.className,h:n.getBoundingClientRect().height}))})));assert.deepEqual(overflow,[],'card content must fit at '+width);}assert(!layout.overflow);assert.equal(layout.text,'');assert(layout.label);const buttons=await page.locator('.hub-intro-actions .btn').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));assert.equal(buttons.length,1);assert.equal(await page.locator('[data-catalog-room-action] #network-join-button').count(),1);
   if(width===390)await page.screenshot({path:path.join(shots,`rc3-hub-${theme}.png`),fullPage:true});
  }
 }
}));
test('RC3 enlarged public move stays at the visible field center through resize',{timeout:45000},async()=>fixture(async page=>{
 await scene(page,'uno');
 await page.evaluate(()=>{window.rcReveal=new PlayroomActionReveal();const card=rcSession.current.data.hands[0][0];rcReveal.show({kind:'card',entity:{namespace:'card',id:card.id},card},'uno');});
 for(const [width,height]of [[1090,900],[390,740],[740,390]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{PlayroomGameScreen.layoutScene(document.querySelector('#app'));rcReveal.position();});
  const geometry=await page.evaluate(()=>{const f=document.querySelector('.layout-field').getBoundingClientRect(),r=document.querySelector('.action-reveal-content').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,ex:(Math.max(0,f.left)+Math.min(innerWidth,f.right))/2,ey:(Math.max(0,f.top)+Math.min(innerHeight,f.bottom))/2,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert(Math.abs(geometry.x-geometry.ex)<2,JSON.stringify(geometry));assert(Math.abs(geometry.y-geometry.ey)<2,JSON.stringify(geometry));assert(!geometry.overflow);
 }
 await page.screenshot({path:path.join(shots,'rc3-public-card.png')});await page.evaluate(()=>rcReveal.clear());
}));
test('RC3 Battleship history retains field and automatic viewing controls without commands or private fleets',{timeout:45000},async()=>fixture(async page=>{
 const compiled={};require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'installed-packs.js'),'utf8'),compiled);const bundle=compiled.PlayroomInstalledPacks.find(p=>p.manifest.id==='battleship');
 for(const viewer of [0,-1]){
  await scene(page,'battleship');await page.evaluate(async({bundle,viewer})=>{
   for(let i=0;i<2;i++){rcSession.act(rcSession.current.turn,{type:'auto'});rcSession.act(rcSession.current.turn,{type:'ready'});}
   for(let i=0;i<2;i++){const actor=rcSession.current.turn;rcSession.act(actor,TabletopCore.legalActions(rcSession.current,actor)[0]);}
   window.rcAuthority=new SessionAuthority(rcSession);const owner=rcAuthority.connect(viewer),frames=rcSession.states.map((_,i)=>owner.history(i));window.rcSends=0;
   window.rcHistoryClient={snapshot:owner.snapshot(),pending:null,subscribe(){return()=>{};},send:async()=>{rcSends++;throw Error('History cannot send');},history:async index=>frames[index]};
   window.rcShared=PlayroomSharedViews.mount(rcHistoryClient,{manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css']},{readOnly:true});rcShared.render();await rcShared.openHistory(0);
  },{bundle,viewer});
  assert.equal(await page.locator('#replay-range').getAttribute('min'),'4');assert.equal(await page.evaluate(()=>rcShared.historyIndex),4);
  await page.locator('[data-view-key=fleet][data-view-value=own]').click();assert.equal(await page.locator('.battle-fields').getAttribute('data-slide-key'),'0');
  await page.locator('[data-view-key=fleet][data-view-value=enemy]').click();assert.equal(await page.locator('.battle-fields').getAttribute('data-slide-key'),'1');
  await page.locator('[data-command=replay-next]').click();assert.equal(await page.locator('.battle-fields').getAttribute('data-slide-key'),'1','manual field survives history seek');
  await page.locator('[data-view-preference=followOpponent]').click();assert.equal(await page.locator('[data-view-preference=followOpponent]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.scene [data-action]').count(),0);assert.equal(await page.evaluate(()=>rcSends),0);
  if(viewer<0)assert.equal(await page.locator('.battle-cell.ship').count(),0);
  await page.screenshot({path:path.join(shots,`rc3-history-${viewer}.png`)});await page.evaluate(()=>{rcShared.destroy();rcAuthority.dispose();});
 }
}));

test('RC8 corner seats align hands, keep player geometry equal and preserve a clear public field',{timeout:60000},async()=>fixture(async page=>{
 for(const game of ['oldmaid','gofish','ludo','uno'])for(const [width,height]of [[320,740],[390,740],[740,390],[1090,900],[1440,900]]){
  await page.setViewportSize({width,height});await scene(page,game);
  const geometry=await page.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout'),field=stage.querySelector('.layout-field').getBoundingClientRect(),cards=[...stage.querySelectorAll('.seat-group>.player-panel:not([data-portrait-copy])')].filter(n=>n.getBoundingClientRect().width),boxes=cards.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,localWidth:n.offsetWidth,localHeight:n.offsetHeight};});
   return {focus:stage.dataset.layoutFocus,seating:stage.dataset.seating,fallback:stage.dataset.seatingFallback,mode:stage.dataset.seatMode,field:{x:field.x,y:field.y,w:field.width,h:field.height},boxes:boxes.map(b=>({x:b.x,y:b.y,w:b.width,h:b.height,lw:b.localWidth,lh:b.localHeight})),mini:[...stage.querySelectorAll('.seat-group .mini-hand>*')].map(n=>n.getBoundingClientRect().width),overflow:document.documentElement.scrollWidth>innerWidth+1,copies:stage.querySelectorAll('[data-seat-copy]').length};
  });if(game==='gofish')assert.equal(geometry.seating,'row');else assert(geometry.seating==='circle'||geometry.seating==='row'&&geometry.fallback==='true',game+' explicit responsive fallback');assert(!geometry.overflow,game+' '+width);assert(geometry.field.w>40&&geometry.field.h>40,JSON.stringify(geometry));
  for(const b of geometry.boxes){assert(Math.abs(b.lw-geometry.boxes[0].lw)<1&&Math.abs(b.lh-geometry.boxes[0].lh)<1,game+' equal cards');assert(b.x+b.w<=geometry.field.x+1||b.x>=geometry.field.x+geometry.field.w-1||b.y+b.h<=geometry.field.y+1||b.y>=geometry.field.y+geometry.field.h-1,game+' seats cannot cover field '+JSON.stringify(geometry));}
  if(geometry.seating==='circle'&&['oldmaid','gofish'].includes(game)){assert.equal(geometry.focus,'hands');assert(geometry.boxes.every(b=>b.lw>b.lh),'name and hand share a horizontal block before edge rotation');}
  if(game==='ludo'&&geometry.seating==='circle'){
   assert.equal(geometry.copies,1);
   const current=page.locator('.player-panel.is-turn');assert.equal(await current.count(),1);assert(await current.isVisible());
   assert.equal(await current.getAttribute('data-player-index'),'0');assert.equal(await current.getAttribute('aria-current'),'true');
   assert.equal(await current.getAttribute('data-turn-primary'),'true');assert.equal(await page.locator('.player-panel[aria-current="true"]').count(),1);
  }
  if([390,1090].includes(width))await page.screenshot({path:path.join(shots,`rc4-${game}-${width}.png`)});
 }
}));
test('RC4 local seating can be changed without actions, ownership changes or revealing private hands',{timeout:45000},async()=>fixture(async page=>{
 await page.locator('[data-start="oldmaid"]').first().click();await page.locator('[data-room-cycle="seat-3"]').click();await page.locator('[data-room-cycle="seat-4"]').click();await page.locator('[data-command=lobby-start]').click();
 await page.locator('.table-tools [data-command=settings]').click();
 assert.equal(await page.locator('.settings-personal [data-appearance-picker]').count(),0);
 for(const width of [320,390,1090]){await page.setViewportSize({width,height:900});assert(await page.locator('[data-quick-shortcut]').evaluateAll(nodes=>nodes.every(n=>Math.abs(n.getBoundingClientRect().y-nodes[0].getBoundingClientRect().y)<1)));}
 await selectChoice(page.locator('#setting-seating'),'row');await page.locator('#modal-root [data-command=close-modal]').click();assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'row');assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions('uno').seating),'auto','another game keeps its own default');
 await page.locator('.table-tools [data-command=settings]').click();await selectChoice(page.locator('#setting-seating'),'anchors');await page.locator('#modal-root [data-command=close-modal]').click();assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 assert.equal(await page.locator('.seat-group .mini-hand .public-card').count(),0,'opponents remain hidden');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).seatingByGame.oldmaid),'anchors');await page.reload();await page.locator('.table-tools [data-command=settings]').click();assert.equal(await readChoice(page.locator('#setting-seating')),'anchors');
}));
test('RC4 phone tiles preserve square geometry, symmetrical header and readable artwork',{timeout:45000},async()=>fixture(async page=>{
 for(const width of [320,390,520]){
  await page.setViewportSize({width,height:900});
  const values=await page.locator('.game-tile').evaluateAll(cards=>cards.map(card=>{
   const c=card.getBoundingClientRect(),fav=card.querySelector('.tile-favorite').getBoundingClientRect(),type=card.querySelector('.type-badge-card'),t=type.getBoundingClientRect(),svg=card.querySelector('.game-cover svg'),s=svg.getBoundingClientRect(),art=svg.querySelector('[data-cover-art]').getBoundingClientRect();
   return {game:card.dataset.game,width:c.width,height:c.height,ratio:c.height/c.width,favSize:fav.width,typeSize:t.width,radius:getComputedStyle(type).borderRadius,edge:Math.abs(t.left-c.left-(c.right-fav.right)),top:Math.abs(t.top-fav.top),artFill:Math.max(art.width/s.width,art.height/s.height),legacyPlay:!!card.querySelector('.play-tile')};
  }));for(const v of values){assert(v.width>=100&&v.height>=100,JSON.stringify(v));assert(Math.abs(v.ratio-1)<.01,JSON.stringify(v));assert.equal(v.typeSize,v.favSize);assert.equal(v.radius,'50%');assert(v.edge<1&&v.top<1,JSON.stringify(v));assert(v.artFill>.7&&v.artFill<1.1,JSON.stringify(v));assert.equal(v.legacyPlay,false);}
  await page.screenshot({path:path.join(shots,`rc4-hub-${width}.png`),fullPage:true});
 }
}));

test('RC6 repeated Pexeso mismatches keep both flip sides visible and preserve matched pairs',{timeout:45000},async()=>fixture(async page=>{
 for(const deck of ['cartoon','52']){
  await scene(page,'pexeso',{deck});
  const result=await page.evaluate(async()=>{
   const cards=rcSession.current.data.board,key=c=>c.character||c.rank+'-'+(['♥','♦'].includes(c.suit)?'red':'black');
   const mate=cards.findIndex((c,i)=>i>0&&key(c)===key(cards[0])),mismatches=cards.map((c,i)=>i).filter(i=>i!==0&&i!==mate),samples=[];
   async function flip(index){
    const beforeTurn=rcSession.current.turn,action={type:'flip',index},shot=PlayroomMotion.capture({actor:beforeTurn,viewer:0,action}),initial=TabletopCore.project(rcSession.current,0),cursor=initial.events.at(-1)?.id||0;
    rcSession.act(beforeTurn,action);rcUI={presentationTurn:beforeTurn};rcRender();
    const final=TabletopCore.project(rcSession.current,0);
    const feedback=new PlayroomGameFeedback({fieldChanged:()=>{rcUI.fieldScene=feedback.fieldScene;rcRender();},mount:()=>document.querySelector('.table-shell')});
    feedback.renderField=field=>PlayroomViews.renderField(final,0,field,rcUI);
    feedback.start(initial.events);
    feedback.accept(final.events.filter(e=>e.id>cursor),[],'pexeso',{mode:'fast',initialScene:initial.scene,finalScene:final.scene,snapshot:shot,motion:context=>PlayroomMotion.play(shot,{duration:220,effects:PlayroomGameFlow.effectTimes.fast,context})});
    const pending=feedback.whenIdle();
    for(let frame=0;frame<6;frame++){await new Promise(requestAnimationFrame);samples.push(!document.querySelector('[data-motion-kind=play]')&&[...document.querySelectorAll('[data-motion-kind=flip] button')].every(n=>getComputedStyle(n).visibility==='visible'));}
    await pending;
    for(let frame=0;frame<3;frame++){await new Promise(requestAnimationFrame);samples.push([...document.querySelectorAll('[data-motion-close]')].every(slot=>getComputedStyle(slot.querySelector('[data-motion-face]')).visibility==='hidden'&&getComputedStyle(slot.querySelector('[data-motion-back]')).visibility==='visible'));}
    rcUI={};rcRender();feedback.destroy();
    samples.push([...document.querySelectorAll('.pexeso-slot .pexeso-face')].every(n=>getComputedStyle(n).visibility==='visible'));
   }
   await flip(0);await flip(mate);
   const first=mismatches[0],second=mismatches.find(i=>key(cards[i])!==key(cards[first]));
   for(let cycle=0;cycle<3;cycle++){await flip(first);await flip(second);}
   return {visible:samples.every(Boolean),matched:document.querySelectorAll('.pexeso-slot.matched').length,layers:document.querySelectorAll('.playroom-motion-layer').length};
  });assert.equal(result.visible,true,deck);assert.equal(result.matched,2,deck);assert.equal(result.layers,0);
 }
}));

test('RC6 shared seating composes every installed game without page overflow',{timeout:30000},async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});
 for(const game of await page.evaluate(()=>TabletopCore.GAMES.map(game=>game.id))){
  await scene(page,game);
  const value=await page.evaluate(()=>{const stage=document.querySelector('.app-game-layout'),field=stage?.querySelector('.layout-field');return {error:!!document.querySelector('.scene [role=alert]'),field:field?.getBoundingClientRect().width||0,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.equal(value.error,false,game);assert(value.field>40,game);assert.equal(value.overflow,false,game);
 }
}));

test('RC7 real game scenes fit phone and tablet orientations and retain the chosen seating',{timeout:180000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/rc7-review');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height]of [[320,640],[390,844],[740,360],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const game of ['uno','oldmaid','gofish','durak','domino','ludo','snakes','battleship','checkers','tictactoe','pexeso','yatzy']){
   await scene(page,game);
   await page.evaluate(()=>{for(let i=0;i<8&&rcSession.current.status==='playing';i++){const actor=rcSession.current.turn,action=TabletopCore.botAction(rcSession.current,actor);if(!action)break;rcSession.act(actor,action);}rcRender();});
   const geometry=await page.evaluate(()=>{
    const stage=document.querySelector('.app-game-layout'),field=stage.querySelector('.layout-field').getBoundingClientRect(),panels=[...stage.querySelectorAll('.player-panel')].map(el=>el.getBoundingClientRect()).filter(b=>b.width>0);
    return {actual:stage.dataset.seating,preferred:stage.dataset.preferredSeating,count:Number(stage.dataset.playerCount),overflow:document.documentElement.scrollWidth>innerWidth+1,field:{w:field.width,h:field.height},panels:panels.map(b=>({w:b.width,h:b.height})),emptyHands:[...stage.querySelectorAll('.player-panel[data-hand-count="0"] .player-hand')].filter(el=>el.getBoundingClientRect().height>0).length};
   });
   assert(!geometry.overflow,game+' '+width);assert(geometry.field.w>=80&&geometry.field.h>=60,game+' field '+JSON.stringify(geometry));
   assert(geometry.panels.every(b=>Math.min(b.w,b.h)>=40),game+' squashed player '+JSON.stringify(geometry));
   if(geometry.count===2)assert.equal(geometry.actual,'row',game+' duel');

   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   if(game==='ludo'){
    const anchors=await page.evaluate(()=>{const field=document.querySelector('.layout-field').getBoundingClientRect();return [...document.querySelectorAll('[data-seat-copy],.seat-group>.player-panel')].map(el=>{const r=el.getBoundingClientRect();return {seat:el.dataset.seat,cx:r.x+r.width/2,cy:r.y+r.height/2,fx:field.x+field.width/2,fy:field.y+field.height/2};});});
    for(const a of anchors){assert(a.seat.includes('west')?a.cx<a.fx:a.cx>a.fx,JSON.stringify(a));assert(a.seat.includes('north')?a.cy<a.fy:a.cy>a.fy,JSON.stringify(a));}
   }
   await page.screenshot({path:path.join(dir,`${game}-${width}x${height}-played.png`)});
  }
 }
 await page.setViewportSize({width:390,height:844});await scene(page,'uno');assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 await page.setViewportSize({width:740,height:190});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.seating==='row');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.seating==='circle');
 await page.locator('.table-tools [data-command="settings"]').click();
 // UI fixture has no selected application Session; the production preference stays untouched.
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions('uno').seating),'auto');
}));

test('RC7 settings separate themes, square initial avatar and optional recent game; notices overlay scrolled content',{timeout:45000},async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:740});
 await page.evaluate(()=>{PlayroomAppBridge.rememberGame('uno');PlayroomAppBridge.showHub();});assert.equal(await page.locator('.recent-section').count(),0);
 await page.locator('.topbar-tools [data-command="settings"]').click();
 assert.equal(await page.locator('.settings-quick [data-appearance-picker],.settings-quick [data-appearance-editor]').count(),0);
 assert.equal(await page.locator('.settings-themes').getAttribute('aria-label'),'Темы');
 await page.locator('#setting-last-game').check();await page.locator('[data-avatar-picker]').click();
 const letter=page.locator('[data-avatar-option=""]');assert.equal(await letter.innerText(),'И');
 const sizes=await letter.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.firstElementChild.getBoundingClientRect();return[a.width,a.height,b.width,b.height];});assert(Math.max(...sizes)-Math.min(...sizes)<1);
 await page.locator('[data-avatar-dismiss]').click();await page.locator('#modal-root [data-command="close-modal"]').click();await page.evaluate(()=>PlayroomAppBridge.showHub());assert.equal(await page.locator('.recent-section').count(),1);
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const before=await page.evaluate(()=>({scroll:scrollY,height:document.documentElement.scrollHeight}));
 await page.evaluate(()=>PlayroomAppBridge.toast('Сначала покиньте текущую сетевую комнату через лобби.'));
 await page.locator('#toast').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
 assert.equal(await page.evaluate(()=>scrollY),before.scroll);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),before.height);
 for(const [width,height]of [[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  const notice=await page.locator('#toast').evaluate(el=>({top:el.getBoundingClientRect().top,boxHeight:el.getBoundingClientRect().height,boxWidth:el.getBoundingClientRect().width,position:getComputedStyle(el).position}));
  assert.equal(notice.position,'fixed');assert(notice.top>=0&&notice.top<32);assert(notice.boxHeight<=90,'notification hugs its text instead of stretching to the old bottom anchor');assert(notice.boxWidth<=480);
  await page.screenshot({path:path.join(root,`tmp_files/rc7-review/hub-notice-${width}x${height}.png`)});
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(root,'tmp_files/rc7-review/hub-scrolled-notice.png')});
 await page.locator('#toast [data-command="dismiss-notice"]').click();assert.equal(await page.locator('#toast.show').count(),0);
}));

test('RC8 UNO draws into upright hands in live play and replay without stretching the artwork',{timeout:45000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/rc7-review');
 for(const [width,height]of [[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});await scene(page,'uno',{firstPlayer:1});
  for(const replay of [false,true]){
   const result=await page.evaluate(async replay=>{
    rcUI={seating:'circle'};let snapshot;
    if(!replay){rcRender();const action=TabletopCore.legalActions(rcSession.current,1).find(a=>a.type==='draw');if(!action)throw Error('UNO_DRAW_FIXTURE');snapshot=PlayroomMotion.capture({actor:1,viewer:0,action});rcSession.act(1,action);rcRender();}
    else{rcUI.readOnly=true;rcStateOverride=rcSession.states[0];rcRender();snapshot=PlayroomMotion.capture({actor:1,viewer:0,action:{type:'draw'}});rcStateOverride=rcSession.states[1];rcRender();}
    window.rcDraw=PlayroomMotion.play(snapshot,{duration:700,draws:[{player:1,count:1,from:'stock'}]});
    const clone=document.querySelector('.playroom-motion-piece[data-motion-kind="draw"]'),art=clone.querySelector('svg'),samples=[];
    for(const fraction of [.15,.5,.85]){
     for(const a of document.getAnimations().filter(a=>a.effect.target.closest?.('.playroom-motion-layer'))){a.pause();a.currentTime=a.effect.getTiming().duration*fraction;}
     const r=clone.getBoundingClientRect(),svg=art?.getBoundingClientRect();samples.push({w:r.width,h:r.height,aw:svg?.width,ah:svg?.height});
    }
    return {samples,angle:snapshot.hands.get(1).angle};
   },replay);
   assert(result.samples.every(s=>s.w>0&&s.h>0&&(!s.aw||Math.abs(s.w-s.aw)<2)&&(!s.ah||Math.abs(s.h-s.ah)<2)),JSON.stringify({width,height,replay,result}));
   assert.equal(result.angle,0,'corner hands stay upright');
   await page.screenshot({path:path.join(dir,`uno-${width}x${height}-${replay?'history':'live'}-draw.png`)});
   await page.evaluate(()=>{PlayroomMotion.cancel();return rcDraw;});assert.equal(await page.locator('.playroom-motion-layer').count(),0);
  }
 }
}));

test('RC7 Ludo offers corners or row and orientation fallback does not rewrite settings',{timeout:45000},async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await page.locator('[data-start="ludo"]').first().click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,preset:'teams'});b.renderLobby();});
 assert.equal(await page.locator('[data-command="lobby-start"]').isDisabled(),true);assert.match(await page.locator('.lobby-start-reason').innerText(),/режим/);
 const rejected=await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();try{b.roomService.beginCountdown(r.id,r.ownerId);return false;}catch(_){return b.roomService.snapshot(r.id).phase==='lobby';}});assert(rejected,'real pack rejects a two-person team roster before countdown');
 for(const seat of ['seat-3','seat-4'])await page.locator(`[data-room-cycle="${seat}"]`).click();
 await page.locator('[data-command="lobby-start"]').click();await page.locator('.table-tools [data-command="settings"]').click();
 assert.deepEqual(await page.locator('#setting-seating').evaluate(e=>JSON.parse(e.dataset.choiceOptions).map(o=>o.value)),['anchors','row']);
 await selectChoice(page.locator('#setting-seating'),'anchors');await page.locator('#modal-root [data-command="close-modal"]').click();
 await page.setViewportSize({width:740,height:360});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.anchorCompactControls==='true');
 assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 await page.locator('.table-tools [data-command="settings"]').click();assert.equal(await readChoice(page.locator('#setting-seating')),'anchors');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).seatingByGame.ludo),'anchors');
 await page.locator('#modal-root [data-command="close-modal"]').click();await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.seating==='circle');
 await page.locator('.table-tools [data-command="settings"]').click();await selectChoice(page.locator('#setting-seating'),'row');await page.locator('#modal-root [data-command="close-modal"]').click();
 for(const [width,height]of [[390,844],[740,360],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});const panels=await page.locator('.layout-participants .player-panel').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert(panels.every(p=>p.w>=80&&p.h>=44),JSON.stringify(panels));
  await page.screenshot({path:path.join(root,'tmp_files/rc7-review',`ludo-${width}x${height}-chosen-row.png`)});
 }
}));

test('RC8 in-game Themes opens above settings and profile controls align',{timeout:45000},async()=>fixture(async page=>{
 await page.locator('[data-start="uno"]').first().click();await page.locator('[data-command="lobby-start"]').click();
 await page.locator('.table-tools [data-command="settings"]').click();
 const before=await page.evaluate(()=>{window.settingsBefore=document.querySelector('#modal-root .modal');return localStorage.getItem('playroom.session.v1');});
 for(const [width,height]of [[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  const boxes=await page.locator('.settings-personal :is(.profile-identity-row,.lobby-profile)').evaluate(el=>{const a=el.querySelector('[data-avatar-picker]').getBoundingClientRect(),b=el.querySelector('input').getBoundingClientRect();return {top:a.top-b.top,height:a.height-b.height,width:a.width-a.height};});
  assert(Math.abs(boxes.top)<2&&Math.abs(boxes.height)<2&&Math.abs(boxes.width)<2,JSON.stringify(boxes));
  await page.locator('.settings-themes').click();await page.locator('.appearance-editor').waitFor();
  assert(await page.locator('.appearance-editor').evaluate(el=>el.matches(':modal')));
  await page.screenshot({path:path.join(root,`tmp_files/rc8/themes-${width}x${height}.png`)});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.querySelector('#modal-root .modal')===settingsBefore),true);
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),before);
}));

test('RC9 maximum rosters fit contents, hands and fields in both orientations',{timeout:120000},async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[640,320],[844,390],[768,1024],[1024,768],[1366,768],[1920,1080]])for(const game of ['uno','durak','oldmaid','gofish','domino','ludo','snakes','pexeso','battleship','yatzy','checkers','tictactoe'])for(const seating of ['anchors','row']){
  await page.setViewportSize({width,height});const count=await page.evaluate(game=>TabletopCore.get(game).max,game);
  await scene(page,game,{players:Array.from({length:count},(_,i)=>({name:['Иван','Мика','Луна','Кира','Лев','Сэм'][i]}))});
  await page.evaluate(seating=>{rcUI={seating};rcRender();},seating);await page.waitForTimeout(30);
  const errors=await page.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout'),field=stage.querySelector('.layout-field').getBoundingClientRect(),panels=[...stage.querySelectorAll('.player-panel')].map(el=>({r:el.getBoundingClientRect(),name:el.textContent})).filter(p=>p.r.width&&p.r.height),errors=[];
   const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   for(let i=0;i<panels.length;i++){const {r,name}=panels[i];if(r.width<70||r.height<40)errors.push('squashed '+name);if(r.bottom>innerHeight+2)errors.push('panel below viewport '+name);if(overlaps(r,field))errors.push('field overlap '+name);for(const p of panels.slice(i+1))if(overlaps(r,p.r))errors.push('panel overlap '+name);}
   const self=stage.querySelector('.layout-self')?.getBoundingClientRect();for(const group of stage.querySelectorAll('.seat-group'))if(self&&overlaps(group.getBoundingClientRect(),self))errors.push('seat/self overlap');
   for(const e of stage.querySelectorAll('.layout-participants,.layout-field,.hand-track:not(.is-long-hand),.yatzy-board')){if(e.clientWidth&&((!e.matches('.yatzy-board')&&getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight+3)||(getComputedStyle(e).overflowX==='auto'&&e.scrollWidth>e.clientWidth+3)))errors.push('content scroll '+e.className+' '+JSON.stringify({w:e.clientWidth,h:e.clientHeight,sw:e.scrollWidth,sh:e.scrollHeight}));}
   const tiles=[...stage.querySelectorAll('.hand-track.is-tiles>button')].map(e=>e.getBoundingClientRect());if(tiles.some(r=>Math.abs(r.width-tiles[0].width)>1||Math.abs(r.height-tiles[0].height)>1||Math.abs(r.width/r.height-4/7)>.02))errors.push('unequal domino size');
   for(const e of stage.querySelectorAll('.opponent-hand .mini-hand')){if(e.clientWidth&&e.firstElementChild){const card=e.firstElementChild.getBoundingClientRect(),viewport=e.getBoundingClientRect();if(Math.abs(card.width/card.height-(Number(e.querySelector('[data-piece-ratio]')?.dataset.pieceRatio)||5/7))>.03)errors.push('opponent card proportions');if(stage.dataset.croppedHands==='true'&&card.height<viewport.height*1.5)errors.push('opponent cards resized instead of cropped');}}
   if(document.documentElement.scrollWidth>innerWidth+1)errors.push('page overflow');return errors;
  });
  if(errors.length)await page.screenshot({path:path.join(shots,`rc15-failure-${game}-${width}.png`)});
  assert.deepEqual(errors,[],`${game} ${seating} ${width}x${height}`);
 }
}));

test('UNO status is a label below the avatar, separate from score counters',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await scene(page,'uno');
 await page.evaluate(()=>{const state=structuredClone(TabletopCore.project(rcSession.current,0));state.data.uno.declared[0]=true;const actions=TabletopCore.legalActions(rcSession.current,0);PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:'UNO',state,viewer:0,actions,scene:PlayroomViews.render(state,0,actions,{seating:'anchors'}),turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));});
 const badge=page.locator('.layout-self .player-avatar-label');await badge.waitFor();assert.equal(await badge.textContent(),'UNO');assert.equal(await page.locator('.self-player .player-badges').count(),0);
 const placement=await badge.evaluate(e=>{const r=e.getBoundingClientRect(),a=e.parentElement.querySelector('.avatar').getBoundingClientRect();return {offset:Math.abs(r.x+r.width/2-a.x-a.width/2),bottom:r.bottom-a.bottom,w:r.width,h:r.height};});
 assert(placement.offset<1&&placement.bottom>=0&&placement.w>placement.h);
 await page.screenshot({path:path.join(shots,'rc9-uno-avatar-badge.png')});
}));


test('RC10 full names, adaptive hands and portrait own-seat identity', {timeout:60000},async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[640,320],[844,390],[768,1024],[1024,768],[1920,1080]]){
  await page.setViewportSize({width,height});
  await scene(page,'uno',{players:['Александр','Екатерина','Владислав','Анастасия'].map(name=>({name}))});
  await page.evaluate(()=>{rcUI={seating:'anchors'};rcRender();});await page.waitForTimeout(50);
  const result=await page.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout');return {cropped:stage.dataset.croppedHands,names:[...stage.querySelectorAll('.player-heading strong')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.textContent,sw:e.scrollWidth,w:e.clientWidth,style:getComputedStyle(e).textOverflow})),copies:[...stage.querySelectorAll('[data-portrait-copy]')].filter(e=>e.getBoundingClientRect().width).length,seating:stage.dataset.seating};
  });
  assert(result.names.every(n=>n.style!=='ellipsis'&&n.sw<=n.w+1),JSON.stringify({width,height,result}));
  if(height>width&&result.seating==='circle')assert.equal(result.copies,1);
  assert.equal(result.cropped,'true');
  const first=page.locator('.layout-hand .hand-card').first();await first.hover({position:{x:5,y:8}});await page.waitForTimeout(180);
  assert(await page.locator('.hand-track').evaluate(e=>e.scrollWidth<=e.clientWidth+2),'hover must not scroll ordinary hand '+width);
  await page.mouse.move(0,0);await page.waitForTimeout(100);
  await page.screenshot({path:path.join(shots,`rc10-names-${width}x${height}.png`)});
 }
}));

test('Durak stock and played cards share size with readable pairs in the reserved field',{timeout:45000},async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[640,320],[844,390],[768,1024],[1024,768],[1920,1080]]){
  await page.setViewportSize({width,height});await scene(page,'durak',{deck:'52',players:Array.from({length:6},(_,i)=>({name:['Иван','Кира','Мика','Лев','Сэм','Рэй'][i]}))});
  await page.evaluate(()=>{
   const raw=structuredClone(rcSession.current),d=raw.data,all=[...d.hands.flat(),...d.drawPile],suits=['♥','♦','♣','♠'];
   const layout=base=>[[base,suits[0],base+1],[base,suits[1],base+1],[base+1,suits[2],base+2],[base+1,suits[3],base+2],[base+2,suits[0],base+3],[base+2,suits[1],base+3]].map(([rank,suit,defence])=>({attack:all.find(c=>c.rank===rank&&c.suit===suit),defense:all.find(c=>c.rank===defence&&c.suit===suit)}));
   const pairs=[2,6,10].map(layout).find(pairs=>pairs.every(p=>p.attack&&p.defense&&p.attack.id!==d.trump.id&&p.defense.id!==d.trump.id));if(!pairs)throw Error('six-pair fixture unavailable');
   const used=new Set(pairs.flatMap(p=>[p.attack.id,p.defense.id])),rest=all.filter(c=>!used.has(c.id)&&c.id!==d.trump.id);d.hands=Array.from({length:6},()=>rest.splice(0,4));d.drawPile=[d.trump,...rest];Object.assign(d,{table:pairs,attacker:0,defender:1,attackCursor:0,boutOrigin:0,passes:0,attackLimit:6,composing:false,taking:false});raw.turn=0;
   if(!TabletopCore.validateState(raw))throw Error('six-pair fixture invalid');const state=TabletopCore.project(raw,0);if(state.scene.table.length!==6)throw Error('six pairs missing from authorized scene');
   window.durakSixRender=()=>{PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:'Дурак',state,viewer:0,actions:[],scene:PlayroomViews.render(state,0,[],{seating:'anchors'}),turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));};durakSixRender();
  });
  await page.waitForTimeout(50);
  const geometry=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.layout-field .playing-card,.layout-field .shared-card-back')];const pairs=[...document.querySelectorAll('.durak-pair')].map(e=>e.getBoundingClientRect()),stock=document.querySelector('.field-group-stock').getBoundingClientRect();return {sizes:cards.map(e=>[e.offsetWidth,e.offsetHeight]),columns:new Set(pairs.map(r=>Math.round(r.x))).size,clear:pairs.every(r=>Math.min(r.right,stock.right)-Math.max(r.left,stock.left)<=1||Math.min(r.bottom,stock.bottom)-Math.max(r.top,stock.top)<=1)};});
  assert(geometry.sizes.every(s=>s[0]===geometry.sizes[0][0]&&s[1]===geometry.sizes[0][1]),JSON.stringify(geometry));assert(geometry.columns>=2,JSON.stringify(geometry));assert(geometry.clear,JSON.stringify(geometry));
  if(height>=width){const rows=await page.locator('.layout-participants .player-panel').evaluateAll(nodes=>new Set(nodes.map(node=>Math.round(node.getBoundingClientRect().top))).size);assert(rows<=2,'portrait seating stays within two rows');}
  const scrollport=page.locator('.game-field-groups'),bounds=await scrollport.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.layout-field').getBoundingClientRect();return {fits:a.left>=b.left-2&&a.right<=b.right+2&&a.top>=b.top-2&&a.bottom<=b.bottom+2,overflow:el.scrollHeight>el.clientHeight+1};});assert(bounds.fits,'the table scrollport must stay inside the reserved field');
  if(bounds.overflow){await scrollport.hover();await page.mouse.wheel(0,10000);await page.waitForFunction(()=>{const el=document.querySelector('.game-field-groups');return el.scrollTop+el.clientHeight>=el.scrollHeight-1;});}
  await page.waitForFunction(()=>{const el=document.querySelector('.game-field-groups'),a=el.querySelector('.durak-pair:last-child .defense-card [data-entity]').getBoundingClientRect(),b=el.getBoundingClientRect();return a.left>=b.left-2&&a.right<=b.right+2&&a.top>=b.top-2&&a.bottom<=b.bottom+2;},null,{timeout:5000}).catch(async error=>{await page.screenshot({path:path.join(shots,'durak-scroll-failure.png')});const detail=await scrollport.evaluate(el=>({scrollTop:el.scrollTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,port:el.getBoundingClientRect().toJSON(),last:el.querySelector('.durak-pair:last-child .defense-card [data-entity]').getBoundingClientRect().toJSON(),overflow:getComputedStyle(el).overflow}));throw Error(error.message+' '+JSON.stringify({width,height,detail}));});
  const retainedScroll=await scrollport.evaluate(el=>{window.durakScrollOwner=el;return el.scrollTop;});await page.evaluate(()=>durakSixRender());assert(await scrollport.evaluate(el=>el===durakScrollOwner));const afterScroll=await scrollport.evaluate(el=>el.scrollTop);assert(Math.abs(afterScroll-retainedScroll)<=1,'scene refresh preserves the table scroll '+JSON.stringify({width,height,before:retainedScroll,after:afterScroll}));
  await page.screenshot({path:path.join(shots,`rc10-durak-six-pairs-${width}x${height}.png`)});
 }
}));

test('RC10 hidden domino tiles have distinct outlined backs and 4:7 proportions',async()=>fixture(async page=>{
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);await page.setViewportSize({width:390,height:844});await scene(page,'domino');
  const backs=await page.locator('.opponent-hand .domino-back').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),face=getComputedStyle(e.firstElementChild);return {ratio:r.width/r.height,edge:parseFloat(s.borderWidth),shadow:s.boxShadow,art:e.firstElementChild?.matches('svg[data-piece-type=domino]'),rim:e.querySelector('svg rect:nth-child(2)')?.getAttribute('fill'),face:e.querySelector('svg rect:nth-child(3)')?.getAttribute('fill'),text:e.textContent};}));
  assert(backs.length>0);assert(backs.every(b=>Math.abs(b.ratio-4/7)<.02&&b.edge===0&&b.shadow==='none'&&b.art&&b.rim!==b.face&&!b.text.trim()),JSON.stringify(backs));
  assert.equal(await page.locator('.opponent-hand .card-back').count(),0);
  await page.screenshot({path:path.join(shots,`rc10-domino-backs-${theme}.png`)});
 }
}));

test('RC11 optional card arc persists and follows scrolling without affecting domino',{timeout:60000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/rc11-arc');fs.mkdirSync(dir,{recursive:true});
 await page.locator('[data-command="settings"]').first().click();
 await page.locator('#setting-hand-shape').check();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).handShape),'arc');
 await page.locator('.modal [data-command="close-modal"]').click();
 for(const [width,height]of [[390,844],[844,390],[640,320],[768,1024],[1024,768],[1920,1080]]){
  await page.setViewportSize({width,height});await scene(page,'uno');
  await page.evaluate(()=>{rcUI={seating:'anchors'};rcRender();});
  const track=page.locator('.layout-hand .hand-track.is-fan');
  assert(await track.evaluate(t=>t.classList.contains('is-arc')));
  const measure=()=>track.evaluate(t=>({overflow:t.scrollWidth-t.clientWidth,cards:[...t.querySelectorAll('.hand-card')].map(c=>{const r=c.getBoundingClientRect(),b=t.getBoundingClientRect();return {angle:parseFloat(getComputedStyle(c).rotate),top:r.top-b.top,bottom:b.bottom-r.bottom};})}));
  const size=()=>page.evaluate(()=>({cards:[...document.querySelectorAll('.layout-hand .hand-card')].map(c=>[c.offsetWidth,c.offsetHeight]),panels:[...document.querySelectorAll('.player-panel')].map(c=>[c.offsetWidth,c.offsetHeight]),hand:[document.querySelector('.hand-track').offsetWidth,document.querySelector('.hand-track').offsetHeight]}));
  const arcSize=await size();
  await page.locator('[data-command="settings"]').first().click();await page.locator('#setting-hand-shape').uncheck();await page.locator('.modal [data-command="close-modal"]').click();await page.evaluate(()=>rcRender());
  assert.deepEqual(await size(),arcSize,'shape choice preserves card, player panel and hand viewport dimensions');
  await page.locator('[data-command="settings"]').first().click();await page.locator('#setting-hand-shape').check();await page.locator('.modal [data-command="close-modal"]').click();await page.evaluate(()=>rcRender());
  let box=await measure();assert(box.cards.some(c=>Math.abs(c.angle)>1));assert(box.cards.every(c=>c.top>=-1&&c.bottom>=-1),JSON.stringify({width,height,box}));
  await page.screenshot({path:path.join(dir,`uno-${width}x${height}.png`)});
  await track.locator('.hand-card').first().focus();
  box=await measure();assert(box.cards.every(c=>c.top>=-1&&c.bottom>=-1),'focus lift stays visible');
  await page.evaluate(()=>{rcStateOverride=structuredClone(rcSession.current);rcStateOverride.data.hands[0].push(...rcStateOverride.data.drawPile.splice(0,60));rcRender();});
  const before=await track.locator('.hand-card').last().evaluate(c=>getComputedStyle(c).rotate);
  await track.evaluate(t=>t.scrollLeft=t.scrollWidth);await page.waitForTimeout(80);
  assert(await track.evaluate(t=>t.scrollLeft>0),'long hand scrolls');
  const after=await track.locator('.hand-card').last().evaluate(c=>getComputedStyle(c).rotate);
  assert.notEqual(after,before,'card angle follows scroll position');
  await page.screenshot({path:path.join(dir,`uno-scrolled-${width}x${height}.png`)});
  for(const game of ['durak','oldmaid','gofish']){await scene(page,game);assert.equal(await page.locator('.hand-track.is-arc').count(),1);await page.screenshot({path:path.join(dir,`${game}-${width}x${height}.png`)});}
  await scene(page,'domino');assert.equal(await page.locator('.hand-track.is-arc').count(),0);
 }
 await page.reload();await page.locator('.game-tile').first().waitFor();
 await page.locator('[data-command="settings"]').first().click();assert.equal(await page.locator('#setting-hand-shape').isChecked(),true);
 await page.locator('#setting-hand-shape').uncheck();await page.locator('.modal [data-command="close-modal"]').click();
 await scene(page,'uno');assert.equal(await page.locator('.hand-track.is-arc').count(),0);
}));


test('RC12 fresh defaults, compact room entry and symmetric landscape status',{timeout:45000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/rc12-ui');fs.mkdirSync(dir,{recursive:true});
 await page.locator('[data-command="settings"]').first().click();
 for(const id of ['setting-auto-pass','setting-quick-play'])assert(await page.locator('#'+id).isChecked(),id);
 assert.equal(await page.locator('#setting-sound').count(),0);
 assert.equal(await page.locator('#setting-last-game').isChecked(),false);
 assert.equal(await page.locator('#setting-volume').inputValue(),'3');
 assert.equal(await page.locator('#setting-speed').inputValue(),'2');
 assert.equal(await page.locator('#setting-hand-shape').isChecked(),true);
 await page.screenshot({path:path.join(dir,'defaults.png')});
 await page.setViewportSize({width:320,height:640});
 const heading=await page.locator('.modal-head').evaluate(h=>({height:h.querySelector('h2').getBoundingClientRect().height,overflow:h.scrollWidth-h.clientWidth}));assert(heading.height<30&&heading.overflow<=1);
 const edges=await page.locator('.modal').evaluate(m=>['.settings-header-actions','.settings-themes','#setting-player-name','.settings-layout-grid','.setting-with-help:has(#setting-last-game)'].map(s=>m.querySelector(s).getBoundingClientRect().right));assert(Math.max(...edges)-Math.min(...edges)<=1,JSON.stringify(edges));
 const insets=await page.locator('.modal').evaluate(m=>{const r=m.getBoundingClientRect(),left=m.querySelector('.modal-head>.icon-btn').getBoundingClientRect().left,right=m.querySelector('.settings-layout-grid').getBoundingClientRect().right;return {left:left-r.left,right:r.right-right};});assert(Math.abs(insets.left-insets.right)<=1,JSON.stringify(insets));
 await page.screenshot({path:path.join(dir,'settings-320.png')});await page.setViewportSize({width:1098,height:1238});
 await page.locator('#setting-volume').evaluate(e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#setting-quick-play').uncheck();await page.locator('#setting-auto-pass').uncheck();
 await page.reload();await page.locator('.game-tile').first().waitFor();
 await page.locator('[data-command="settings"]').first().click();
 for(const id of ['setting-auto-pass','setting-quick-play'])assert.equal(await page.locator('#'+id).isChecked(),false,'saved '+id);
 assert.equal(await page.locator('#setting-volume').inputValue(),'0');
 await page.locator('.modal [data-command="close-modal"]').click();
 for(const [width,height]of [[320,640],[390,844],[844,390],[768,1024],[1024,768],[1366,768]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>PlayroomAppBridge.showHub());
  const join=page.locator('[data-catalog-room-action] #network-join-button');await join.waitFor();
  const row=await join.evaluate(b=>{const r=b.getBoundingClientRect(),f=document.querySelector('.catalog-view-controls').getBoundingClientRect();return {center:r.y+r.height/2-f.y-f.height/2,right:r.right,overflow:document.documentElement.scrollWidth-innerWidth};});
  assert(Math.abs(row.center)<1&&row.right<=width&&row.overflow<=1,JSON.stringify(row));
  await page.screenshot({path:path.join(dir,`hub-${width}x${height}.png`)});
  await join.click();await page.locator('#modal-root .modal').waitFor();await page.keyboard.press('Escape');
  await scene(page,'yatzy');
  if(width>height){const boxes=await page.locator('.table-status').evaluate(s=>[s.querySelector('.turn-label'),s.querySelector('.status-details')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,height:r.height,bg:getComputedStyle(e).backgroundColor};}));assert.deepEqual(boxes[0],boxes[1]);assert.notEqual(boxes[0].bg,'rgba(0, 0, 0, 0)');}
  await page.screenshot({path:path.join(dir,`yatzy-${width}x${height}.png`)});
 }
},{settings:null}));

test('RC12 small fans stay centered, symmetric and overlapping',{timeout:45000},async()=>fixture(async page=>{
 await page.locator('[data-command="settings"]').first().click();await page.locator('#setting-hand-shape').check();await page.locator('.modal [data-command="close-modal"]').click();
 const dir=path.join(root,'tmp_files/rc12-ui');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height] of [[390,844],[640,320],[844,390],[1024,768]])for(const count of [1,2,3,4,6]){
  await page.setViewportSize({width,height});await scene(page,'uno');
  await page.evaluate(count=>{rcStateOverride=structuredClone(rcSession.current);rcStateOverride.data.drawPile.push(...rcStateOverride.data.hands[0].splice(count));rcRender();},count);
  const result=await page.locator('.hand-track').evaluate(t=>{const b=t.getBoundingClientRect(),cards=[...t.querySelectorAll('.hand-card')].map(c=>({angle:parseFloat(getComputedStyle(c).rotate),r:c.getBoundingClientRect()}));return {debug:{row:t.querySelector('.hand-fan-row').getBoundingClientRect().toJSON(),track:b.toJSON(),card:t.querySelector('.hand-card').offsetWidth,padding:getComputedStyle(t).padding},center:(b.left+b.right)/2,cards:cards.map(c=>({angle:c.angle,left:c.r.left,right:c.r.right}))};});
  const first=result.cards[0],last=result.cards.at(-1);assert(Math.abs(first.angle+last.angle)<.1,JSON.stringify({width,height,count,result}));assert(Math.abs((first.left+last.right)/2-result.center)<2);if(count===1)assert.equal(first.angle,0);else for(let i=1;i<count;i++)assert(result.cards[i].left<result.cards[i-1].right);
  await page.screenshot({path:path.join(dir,`fan-${count}-${width}x${height}.png`)});
 }
}));

test('RC12 bubbles anchor visible duplicate panels and actions escape small panels',{timeout:30000},async()=>fixture(async page=>{
 await page.setViewportSize({width:844,height:390});await scene(page,'uno');
 const result=await page.evaluate(()=>{
  const host=document.querySelector('.table-shell'),panel=host.querySelector('.player-panel[data-player-index="1"]'),copy=panel.cloneNode(true);copy.style.display='none';host.prepend(copy);
  const f=new PlayroomGameFeedback({mount:()=>host});f.active={id:99,timing:PlayroomGameFlow.effectTimes.fast,speech:{speaker:1,text:'Беру'}};f.refresh();const b=f.bubble.getBoundingClientRect(),r=panel.getBoundingClientRect();const good=b.width>0&&b.left>=0&&b.right<=innerWidth&&Math.abs(b.left-r.left)<r.width;f.destroy();copy.remove();
  panel.querySelector('.player-info').setAttribute('data-player-target','1');const target=new PlayroomPlayerTarget({root:()=>host,actions:()=>[{target:1,targetKind:'player',type:'catch',label:'UNO!'}],commit(){}});target.tap(1);const menu=target.menu;const fits=menu&&menu.scrollHeight<=menu.clientHeight&&menu.parentElement===document.body;target.destroy();return {good,fits};
 });assert(result.good);assert(result.fits);
}));

test('RC15 popovers preserve form layout and fixed choices hide without losing values',async()=>fixture(async page=>{
 for(const [width,height] of [[320,640],[844,390]]){
  await page.setViewportSize({width,height});await page.reload();await page.locator('.game-tile').first().waitFor();
  await page.screenshot({path:path.join(shots,`rc15-hub-${width}.png`)});
  await page.evaluate(()=>{document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal"><div class="modal-body"><form><fieldset><legend>Игрок №1 ${PlayroomLobbyView.fieldHelp('Первый ход определяется правилами игры.')}</legend></fieldset><label class="field"><span>Набор правил</span><select name="preset"><option value="classic">Классика</option></select></label><label class="switch"><span>Открытые руки</span><input type="checkbox">${PlayroomLobbyView.fieldHelp('Все участники видят карты друг друга. Это меняет видимость рук, но не допустимые действия.')}</label></form></div></section></div>`;});
  assert.equal(await page.locator('select[name=preset]').isVisible(),false);
  assert.equal(await readChoice(page.locator('select[name=preset]')),'classic');
  const before=await page.locator('.switch').boundingBox();
  for(const button of await page.locator('.rule-help>button').all()){
   await button.click();const popup=page.locator('.mini-help-popover:popover-open');await popup.waitFor();
   const box=await popup.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   assert.deepEqual(await page.locator('.switch').boundingBox(),before);
   await page.screenshot({path:path.join(shots,`rc15-help-${width}.png`)});
   await page.keyboard.press('Escape');assert.equal(await page.locator(':popover-open').count(),0);
  }
 }
}));

test('RC15 domino hand swipes at fixed size and six-player dice games fit', {timeout:60000},async()=>fixture(async page=>{
 const players=Array.from({length:6},(_,i)=>({name:['Иван','Кира','Сэм','Лев','Ника','Тео'][i]}));
 for(const [width,height] of [[320,640],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const game of ['yatzy','snakes']){
   await scene(page,game,{players});assert.equal(await page.evaluate(()=>rcSession.current.players.length),6);
   assert(await page.locator('[data-game-element="field"]').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:path.join(shots,`rc15-${game}-6-${width}.png`)});
  }
 }
 await page.setViewportSize({width:844,height:390});await scene(page,'domino',{players:[{name:'Иван'},{name:'Кира'}]});
 await page.evaluate(()=>{rcStateOverride=structuredClone(rcSession.current);rcStateOverride.data.hands[0].push(...rcStateOverride.data.stock.splice(0));rcRender();});
 const track=page.locator('.hand-track'),box=await track.boundingBox();
 assert(box.x+box.width<=844,'viewport fits the own-hand slot');
 assert(await track.evaluate(e=>e.scrollWidth>e.clientWidth),'fixed-size domino hand overflows inside viewport');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 for(const [type,x]of [['touchStart',box.x+box.width-20],['touchMove',box.x+box.width-50],['touchMove',box.x+20],['touchEnd',0]])await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y:box.y+box.height/2}]});
 assert(await track.evaluate(e=>e.scrollLeft>0),'touch swipe scrolls domino');
 await page.screenshot({path:path.join(shots,'rc15-domino-swipe.png')});
}));

test('RC15 card choices use a viewport dialog and the landscape catalog adapts',async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'oldmaid',{players:Array.from({length:6},(_,i)=>({name:'Игрок '+(i+1)}))});
  await page.evaluate(()=>{window.rcChoice=new PlayroomPlayerTarget({root:()=>document.querySelector('.table-shell'),actions:()=>TabletopCore.legalActions(rcSession.current,0),commit(){}});rcChoice.tap(1);});
  const menu=page.locator('.card-choice-dialog');assert(await menu.evaluate(e=>e.matches(':modal')&&e.parentNode===document.body));const box=await menu.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);assert.equal(await menu.locator('[data-card-index]').first().evaluate(e=>Math.round(e.getBoundingClientRect().width)),72);
  await page.screenshot({path:path.join(shots,`rc15-choice-${width}.png`)});await page.keyboard.press('Escape');assert.equal(await menu.count(),0);await page.evaluate(()=>rcChoice.destroy());
 }
 let previous=0;
 for(const [width,height]of [[640,320],[844,390],[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await page.reload();await page.locator('.game-tile').first().waitFor();
  const columns=await page.locator('.game-grid').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert(columns>=previous);previous=columns;
  await page.screenshot({path:path.join(shots,`rc15-catalog-${width}.png`)});
 }
}));
test('RC15 hiding a local resume card preserves the saved game across reload',async()=>fixture(async page=>{
 await page.locator('[data-start="tictactoe"]').first().click();
 await page.locator('[data-command="lobby-start"]').click();
 await page.locator('.table-shell [data-command="home"]').click();
 await page.locator('[data-command="hide-local-session"]').click();
 assert.equal(await page.locator('.resume-banner').count(),0);
 await page.reload();await page.locator('.game-tile').first().waitFor();
 assert.equal(await page.locator('.resume-banner').count(),0);
 await page.locator('[data-command="sessions"]').first().click();
 assert.equal(await page.locator('[data-resume-id]').count(),1);
 await page.locator('[data-resume-id]').click();await page.locator('.table-shell').waitFor();
}));
test('RC16 first player numbers, clockwise corners and rounded dice',async()=>fixture(async page=>{
 for(const [width,height] of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'snakes',{players:Array.from({length:6},(_,i)=>({name:'Игрок '+i})),firstPlayer:3});
  await page.evaluate(()=>{rcUI={seating:'circle'};rcRender();});
  assert.equal(await page.locator('[data-player-index="3"] .player-turn-position').first().textContent(),'1');
  const order=await page.evaluate(()=>['south-east','south-west','north-west','north-east'].flatMap(seat=>{let a=[...document.querySelectorAll('.seat-'+seat+' .player-panel')].map(el=>Number(el.dataset.playerIndex));return seat.endsWith('west')?a.reverse():a; }));
  const first=order.indexOf(0),circle=[...order.slice(first),...order.slice(0,first)];assert.deepEqual(circle,[0,1,2,3,4,5]);
  assert((await page.locator('.die').evaluateAll(els=>els.map(el=>getComputedStyle(el).borderRadius))).every(value=>value!=='0px'));
  await page.screenshot({path:path.join(shots,`rc16-snakes-${width}.png`)});
 }
}));
test('RC16 public sets reveal every card and fish books use aligned card rows',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});
 for(const game of ['oldmaid','gofish']){
  await scene(page,game,{players:[{name:'Иван'},{name:'Александра'},{name:'Лев'}]});
  const found=await page.evaluate(game=>{
   let event;
   for(let i=0;i<1500&&rcSession.current.status!=='finished';i++){
    const before=rcSession.current.events.at(-1)?.id||0,actor=rcSession.current.turn,actions=TabletopCore.legalActions(rcSession.current,actor);rcSession.act(actor,actions[i%actions.length]);
    event=TabletopCore.project(rcSession.current,0).events.find(e=>e.id>before&&e.reveal?.kind==='cards');if(event)break;
   }
   if(!event)return null;rcRender();window.rcReveal=new PlayroomActionReveal({mount:()=>document.querySelector('.table-shell')});rcReveal.show(event.reveal,game);return {count:event.reveal.cards.length,first:event.reveal.cards[0].id};
  },game);
  assert(found);assert.equal(await page.locator('.action-reveal-art>.shared-card').count(),found.count);
  assert(await page.locator('.action-reveal-art>.shared-card').evaluateAll(cards=>cards.every(card=>getComputedStyle(card).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(card).boxShadow==='none')),'only artwork paints the card, without rectangular backing');
  await page.screenshot({path:path.join(shots,`rc16-${game}-set.png`)});
  await page.evaluate(()=>rcReveal.clear());
  if(game==='gofish'){
   assert.equal(await page.locator('.gofish-owner').count(),3);
   const xs=await page.locator('.gofish-book-cards').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));assert(Math.max(...xs)-Math.min(...xs)<1);assert.equal(await page.locator('.gofish-owner .avatar').count(),3);
   assert.equal(await page.locator('.gofish-book[data-entity="card-'+found.first+'"]').count(),1);
   await page.screenshot({path:path.join(shots,'rc16-fish-books.png')});
  }
 }
}));
test('RC16 a private transfer has a visible back before the public pair reveal',async()=>fixture(async page=>{
 for(const [game,side] of [['oldmaid','recipient'],['oldmaid','source'],['oldmaid','observer'],['gofish','recipient']]){
 await scene(page,game);
 const result=await page.evaluate(async ({game,side})=>{
  let event,shot,events,draws,initialScene,beforeState;
  for(let i=0;i<1500&&rcSession.current.status!=='finished';i++){
   const actor=rcSession.current.turn,actions=TabletopCore.legalActions(rcSession.current,actor),action=actions[i%actions.length];rcRender();beforeState=rcSession.current;initialScene=TabletopCore.project(rcSession.current,0).scene;shot=PlayroomMotion.capture({actor,viewer:0,action});const before=rcSession.current.events.at(-1)?.id||0;rcSession.act(actor,action);
   events=TabletopCore.project(rcSession.current,0).events.filter(e=>e.id>before);event=events.find(e=>e.reveal?.kind==='cards');if(game==='gofish'&&!events.some(e=>e.speech&&e.transfer))event=null;if(event)break;
  }
  if(!event)return null;
  const transfer=events.find(e=>e.transfer).transfer;
  const viewer=side==='recipient'?transfer.player:side==='source'?transfer.fromPlayer:[0,1,2,3].find(p=>p!==transfer.player&&p!==transfer.fromPlayer);
  const render=actual=>{
   const state=TabletopCore.project(actual,viewer),actions=[];
   const scene=PlayroomViews.render(state,viewer,actions,{preferences:{},viewState:{},...rcUI});
   PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:game,state,viewer,actions,scene,turnText:''}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));
  };
  render(beforeState);shot=PlayroomMotion.capture({actor:shot.actor,viewer,action:shot.action,deferDepartures:true});initialScene=TabletopCore.project(beforeState,viewer).scene;
  events=TabletopCore.project(rcSession.current,viewer).events.filter(e=>e.id>(beforeState.events.at(-1)?.id||0));event=events.find(e=>e.reveal?.kind==='cards');draws=events.filter(e=>e.transfer).map(e=>e.transfer);shot.prepareTransfers(draws);render(rcSession.current);
  const soundOrder=[];let answerAnimations=[],answerFinished=false,earlyFlight=false,earlyHands=false;
  const answerDone=()=>answerFinished||answerAnimations.every(a=>a.playState==='finished');
  const redraw=()=>{rcUI.displayScene=f.displayScene;render(rcSession.current);f.refresh();};
  const f=new PlayroomGameFeedback({fieldChanged:redraw,mount:()=>document.querySelector('.table-shell'),play:ids=>soundOrder.push({ids,answerVisible:!!f.bubble&&f.active?.speech?.result==='success',answerCompleted:answerDone(),eventId:f.active?.id})}),observed={back:false,earlySet:false,earlyTarget:false,set:false},target=()=>[...document.querySelectorAll('.scene [data-entity]')].find(el=>el.dataset.entity===PlayroomGameComponents.entityKey(event.reveal.entity)&&!el.closest('.hand-track,.mini-hand'));
  let transferred=false;
  const sample=()=>{const set=document.querySelector('.action-reveal-art.is-card-set');observed.set ||= !!set;observed.earlySet ||= !!set&&!transferred;const badge=target();observed.earlyTarget ||= !!badge&&getComputedStyle(badge).visibility!=='hidden'&&!transferred;};
  const present=f.presentCue.bind(f);f.presentCue=async(cue,...rest)=>{await present(cue,...rest);if(cue.kind==='prepare'&&cue.item.speech&&cue.item.transfer){answerAnimations=f.bubble.getAnimations();Promise.all(answerAnimations.map(a=>a.finished)).then(()=>answerFinished=true,()=>{});}};
  f.accept(events,TabletopCore.soundCues(rcSession.current,0,events[0].id-1),game,{initialScene,finalScene:TabletopCore.project(rcSession.current,viewer).scene,defer:true,snapshot:shot,mode:'fast',motion:async context=>{
   earlyFlight ||= !answerDone();
   if(game==='gofish'&&!document.querySelector('[data-motion-pending]'))throw Error('Arrival cards visible before transfer');
   if(game==='gofish'){
    const arrival=f.displayScene,owner=event.actor,final=TabletopCore.project(rcSession.current,viewer).scene;
    if(arrival.players[owner].hand.length!==final.players[owner].hand.length+event.reveal.cards.length)throw Error('Set removed before transfer');
    if(owner===viewer)for(const card of event.reveal.cards)if(!document.querySelector('.hand-track [data-entity="'+PlayroomGameComponents.entityKey({namespace:'card',id:card.id})+'"]'))throw Error('Set card missing from arrival hand');
   }
   const flight=PlayroomMotion.play(shot,{duration:160,draws,context});await new Promise(requestAnimationFrame);
   observed.back ||= !!document.querySelector('.playroom-motion-piece[data-motion-kind="draw"]');
   const flights=[...document.querySelectorAll('.playroom-motion-flight[data-motion-kind="draw"]')];
   if(!flights.length||flights.some(el=>el.getAnimations()[0]?.effect.getTiming().duration<480))throw Error('Hand transfer too short');
   sample();await flight;transferred=true;
  }});
  redraw();f.next();
  const timer=setInterval(()=>{sample();if(!answerDone()&&!document.querySelector('[data-motion-held-hand]'))earlyHands=true;},10);await f.whenIdle();clearInterval(timer);const badge=target();
  if(game==='gofish'&&events.some(e=>e.speech&&e.transfer)&&(answerAnimations.length===0||earlyFlight||earlyHands))throw Error('Answer animation boundary: '+JSON.stringify({animations:answerAnimations.length,earlyFlight,earlyHands}));
  if(game==='gofish'&&events.some(e=>e.speech&&e.transfer)&&(!soundOrder.some(c=>c.ids.includes('success')&&c.answerVisible)||soundOrder.some(c=>c.ids.includes('success')&&c.eventId===events.find(e=>e.speech&&e.transfer).id&&!c.answerVisible)))throw Error('Success sound must accompany answer bubble: '+JSON.stringify(soundOrder));
  const result={...observed,ended:!document.querySelector('.action-reveal'),targetVisible:game!=='gofish'||!!badge&&getComputedStyle(badge).visibility!=='hidden'};f.destroy();return result;
 },{game,side});assert.deepEqual(result,{back:true,earlySet:false,earlyTarget:false,set:true,ended:true,targetVisible:true},game+' '+side);
 }
}));
test('RC17 dice retain faces across turns and player colors never repeat',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});
 for(const game of ['yatzy','ludo','snakes']){
  await scene(page,game);
  const result=await page.evaluate(game=>{
   const before=JSON.stringify(rcSession.current.data.dice),rng=rcSession.current.rng;rcRender();
   const rendered=[...document.querySelectorAll('.layout-self .shared-die-art')].map(el=>el.querySelectorAll('circle').length);
   const first=rcSession.current.turn;rcSession.act(first,{type:'roll'});const rolled=JSON.stringify(rcSession.current.data.dice);
   for(let i=0;i<20&&rcSession.current.turn===first;i++){
    const legal=TabletopCore.legalActions(rcSession.current,first),action=legal.find(a=>a.type==='score')||legal.find(a=>a.type==='move');if(!action)break;rcSession.act(first,action);
   }
   rcRender();return {before,rendered,rolled,after:JSON.stringify(rcSession.current.data.dice),visible:[...document.querySelectorAll('.layout-self .shared-die-art')].map(el=>el.querySelectorAll('circle').length),changed:rcSession.current.turn!==first};
  },game);
  assert(result.rendered.length>0&&result.rendered.every(n=>n>=1&&n<=6),game);assert(result.visible.every(n=>n>=1&&n<=6));assert.equal(result.after,result.rolled);assert(result.changed,game);
  await page.screenshot({path:path.join(shots,`rc17-${game}-dice.png`)});
 }
 const colors=await page.evaluate(()=>{const host=document.createElement('div');host.innerHTML=Array.from({length:8},(_,i)=>TabletopUI.avatar({name:'Игрок '+i},i)).join('');document.body.append(host);const colors=[...host.children].map(el=>getComputedStyle(el).backgroundColor);host.remove();return {colors,slots:Array.from({length:8},(_,i)=>PlayroomMultiplayer.seatColor(i).value)};});assert.equal(new Set(colors.colors).size,8);assert.equal(new Set(colors.slots).size,8);
}));

test('RC17 ZiL+ routes and deferred badges fit phones; second die follows the first movement',{timeout:45000},async()=>fixture(async page=>{
 for(const [width,height] of [[320,640],[390,844],[640,320],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'snakes',{preset:'plus',players:Array.from({length:6},(_,i)=>({name:'Игрок '+i}))});
  const result=await page.evaluate(()=>{rcStateOverride=TabletopCore.clone(rcSession.current);Object.assign(rcStateOverride.data,{phase:'move',dice:[2,5],adjusting:true});rcStateOverride.data.effects[0]={adjust:true,less:true,skip:true,shield:true};rcUI={viewState:{adjustDelta:rcStateOverride.move+':1'}};rcRender();const b=document.querySelector('.snakes-board').getBoundingClientRect(),dice=[...document.querySelectorAll('.layout-self .snakes-controls button')].map(e=>e.getBoundingClientRect());return {board:{x:b.x,y:b.y,width:b.width,height:b.height},dice:dice.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),targets:document.querySelectorAll('.snakes-cell[data-action]').length,badges:document.querySelectorAll('.layout-self [data-ui-icon="lessDie"]').length,fit:b.width>120&&b.left>=0&&b.right<=innerWidth&&dice.every(r=>r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight)};});
  assert(result.targets>=2);assert(result.badges);assert(result.fit,JSON.stringify({width,height,result}));await page.screenshot({path:path.join(shots,`rc17-plus-${width}.png`)});
 }
 await page.setViewportSize({width:390,height:844});await scene(page,'snakes',{preset:'plus'});
 await page.evaluate(()=>{
  const before=TabletopCore.clone(rcSession.current);Object.assign(before.data,{phase:'move',dice:[1,2]});before.data.positions[0]=16;rcStateOverride=before;rcRender();
  const action=TabletopCore.legalActions(before,0).find(a=>a.dieIndex===0&&a.delta===0),shot=PlayroomMotion.capture({viewer:0,action});
  const after=TabletopCore.applyAction(before,0,action);rcStateOverride=after;rcRender();
  window.rcFeedback=new PlayroomGameFeedback({mount:()=>document.querySelector('.table-shell')});rcFeedback.start(TabletopCore.project(before,0).events);rcFeedback.accept(TabletopCore.project(after,0).events,[],'snakes',{snapshot:shot,mode:'fast'});
 });
 await page.waitForFunction(()=>document.querySelector('.action-reveal-die svg')?.querySelectorAll('circle').length===1);
 await page.screenshot({path:path.join(shots,'rc17-first-die.png')});
 await page.waitForFunction(()=>document.querySelector('.action-reveal-die svg')?.querySelectorAll('circle').length===2);
 const middle=await page.evaluate(()=>{const t=document.querySelector('[data-entity="token-0"]').getBoundingClientRect(),c=document.querySelector('[data-motion-anchor="cell-17"]').getBoundingClientRect();return Math.hypot(t.x+t.width/2-c.x-c.width/2,t.y+t.height/2-c.y-c.height/2);});assert(middle<3,'pawn rests on second-die cell before second reveal');
 await page.screenshot({path:path.join(shots,'rc17-second-die.png')});await page.evaluate(async()=>{await rcFeedback.whenIdle();rcFeedback.destroy();});
 assert.equal(await page.locator('[data-entity="token-0"]').evaluate(el=>el.style.translate),'');
}));

test('ZiL+ keeps board geometry and pawn size across rolling and matches cell and effect colors',async()=>fixture(async page=>{
 for(const boardSize of [64,100])for(const [width,height] of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'snakes',{preset:'plus',boardSize,players:Array.from({length:6},(_,i)=>({name:'Игрок '+i}))});
  const geometry=await page.evaluate(()=>{
   const measure=()=>{const b=document.querySelector('.snakes-board').getBoundingClientRect(),t=document.querySelector('[data-entity="token-0"]').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,pawn:t.width};};
   const before=measure();rcSession.act(0,{type:'roll'});rcRender();const after=measure();
   rcStateOverride=TabletopCore.clone(rcSession.current);rcStateOverride.data.positions[0]=10;rcRender();const moved=measure();return {before,after,moved};
  });
  for(const key of ['x','y','w','h','pawn'])assert(Math.abs(geometry.before[key]-geometry.after[key])<1,JSON.stringify({width,key,geometry}));assert(Math.abs(geometry.after.pawn-geometry.moved.pawn)<1);
  const colors=await page.evaluate(()=>{rcStateOverride.data.effects[0]={skip:true,less:true,adjust:true,shield:true};rcRender();return ['skip','less','adjust','shield'].map((key,i)=>{const cell=document.querySelector(`[data-special="${key}"]`),icons={skip:'skipTurn',less:'lessDie',adjust:'adjustDie',shield:'shield'},badge=document.querySelector(`.layout-self [data-ui-icon="${icons[key]}"]`).closest('.player-status-badge');return {cell:cell.style.backgroundColor,badge:getComputedStyle(badge).backgroundColor,icon:getComputedStyle(cell.querySelector('svg')).color,number:!!cell.querySelector(':scope > span'),collision:Object.hasOwn(rcStateOverride.data.links,Number(cell.dataset.motionAnchor.slice(5)))};});});
  assert.equal(new Set(colors.map(c=>c.cell)).size,4);assert(colors.every(c=>c.cell===c.badge&&c.icon==='rgb(255, 255, 255)'&&!c.number&&!c.collision),JSON.stringify(colors));
  const layers=await page.evaluate(()=>{const z=selector=>Number(getComputedStyle(document.querySelector(selector)).zIndex)||0;return {links:z('.snakes-links'),tokens:z('.snakes-tokens'),cells:Math.max(...Array.from(document.querySelectorAll('.snakes-cell'),el=>Number(getComputedStyle(el).zIndex)||0))};});
  assert(layers.links>layers.cells&&layers.tokens>layers.links,JSON.stringify(layers));
  await page.screenshot({path:path.join(shots,`zil-cells-${boardSize}-${width}.png`)});
 }
}));

test('shared board targets preserve special icons, color outcomes, and keep Ludo still',async()=>fixture(async page=>{
 for(const [width,height]of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'ludo');
  const result=await page.evaluate(()=>{const box=()=>{const r=document.querySelector('.ludo-board').getBoundingClientRect();return [r.x,r.y,r.width,r.height];};const before=box();rcSession.act(0,{type:'roll'});rcRender();const after=box();const a=TabletopCore.legalActions(rcSession.current,0).find(a=>a.type==='move');if(a){rcUI={viewState:{pawn:a.owner+':'+a.pawn}};rcRender();}return {before,after,selected:box(),hints:document.querySelectorAll('.ludo-scene .shared-hint').length};});
  assert.equal(result.hints,0);for(let i=0;i<4;i++){assert(Math.abs(result.before[i]-result.after[i])<1,JSON.stringify(result));assert(Math.abs(result.before[i]-result.selected[i])<1);}
  await page.screenshot({path:path.join(shots,`zil-ludo-${width}.png`)});
 }
 await scene(page,'ludo',{preset:'teams',diceCount:2});
 const team=await page.evaluate(()=>{
  rcStateOverride=TabletopCore.clone(rcSession.current);rcStateOverride.turn=0;
  Object.assign(rcStateOverride.data,{phase:'move',dice:[2,3],used:[false,false]});rcStateOverride.data.pawns[0]=[57,57,57,57];rcStateOverride.data.pawns[2]=[5,10,-1,-1];
  rcUI={viewState:{pawn:'0:3'}};rcRender();
  const stale=document.querySelectorAll('.ludo-pawn.is-selected,.ludo-pawn[aria-pressed="true"]').length;
  const playable=[...document.querySelectorAll('.ludo-pawn.is-playable')].map(el=>el.dataset.viewValue);
  rcUI={viewState:{pawn:'2:0'}};rcRender();
  return {stale,playable,selected:document.querySelector('.ludo-pawn.is-selected')?.dataset.viewValue,targets:document.querySelectorAll('.ludo-target').length};
 });
 assert.equal(team.stale,0);assert(team.playable.length>0&&team.playable.every(id=>id.startsWith('2:')));assert.equal(team.selected,'2:0');assert(team.targets>0);
 await page.screenshot({path:path.join(shots,'ludo-team-valid-selection.png')});
 await scene(page,'snakes',{preset:'plus',boardSize:64});
 const targets=await page.evaluate(()=>{rcStateOverride=TabletopCore.clone(rcSession.current);Object.assign(rcStateOverride.data,{phase:'move',dice:[3,5]});rcStateOverride.data.positions[0]=17;rcRender();const capture=document.querySelector('[data-motion-anchor="cell-22"]'),home=document.querySelector('[data-motion-anchor="cell-20"]');const kinds=[capture.classList.contains('target-capture'),home.classList.contains('target-home')];rcStateOverride.data.positions[0]=8;rcRender();const cell=document.querySelector('[data-motion-anchor="cell-11"]');return {kinds,background:getComputedStyle(cell).backgroundColor,base:cell.style.backgroundColor,icon:getComputedStyle(cell.querySelector('svg')).color,dot:!!cell.querySelector('.board-route-dot'),target:cell.classList.contains('board-target')};});
 assert.deepEqual(targets.kinds,[true,true]);assert(targets.target&&!targets.dot);assert.notEqual(targets.background,targets.base);assert.equal(targets.icon,'rgb(255, 255, 255)');
}));

test('all games keep the field stable while selecting and changing action phases',{timeout:120000},async()=>fixture(async page=>{
 const report=[];
 for(const [width,height] of [[320,640],[390,844],[640,320],[844,390]])for(const game of ['tictactoe','checkers','battleship','domino','durak','uno','oldmaid','gofish','pexeso','yatzy','ludo','snakes']){
  await page.setViewportSize({width,height});await scene(page,game);
  const measurements=await page.evaluate(()=>{
   const rows=[],box=()=>{const r=document.querySelector('.layout-field').getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
   for(let step=0;step<16&&rcSession.current.status==='playing';step++){
    rcUI={};rcRender();const before=box(),s=rcSession.current,actor=s.turn,actions=TabletopCore.legalActions(s,actor);
    const selected=actions.find(a=>a.card!=null||a.pawn!=null);
    if(actor===0&&selected){rcUI={selected:selected.card,viewState:selected.pawn!=null?{pawn:selected.owner+':'+selected.pawn}:{}};rcRender();rows.push({step,phase:s.data.phase,kind:'selection',before,after:box()});}
    rcUI={};const action=actions.find(a=>a.type==='ready')||actions.find(a=>a.type==='auto')||actions.find(a=>a.type==='score')||actions[step%actions.length];if(!action)break;
    rcSession.act(actor,action);rcRender();rows.push({step,phase:s.data.phase,action:action.type,kind:'action',before,after:box()});
   }
   return rows;
  });
  const changes=measurements.filter(row=>row.before.some((v,i)=>Math.abs(v-row.after[i])>1));report.push({game,width,changes});
  await page.screenshot({path:path.join(shots,`rc18-all-${game}-${width}.png`)});
 }
 fs.writeFileSync(path.join(shots,'rc18-layout-report.json'),JSON.stringify(report,null,2));
 assert.deepEqual(report.filter(row=>row.changes.length),[]);
}));

 test('layout reflow requires an explicit action flag and resets on viewport change',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await scene(page,'uno');
 const result=await page.evaluate(()=>{
  const h=document.querySelector('#app'),box=()=>document.querySelector('.layout-field').getBoundingClientRect().height;
  const initial=box();document.querySelector('.layout-participants').style.minHeight='220px';PlayroomGameScreen.layoutScene(h);const fixed=box();
  PlayroomGameScreen.allowLayoutChange(h,{});PlayroomGameScreen.layoutScene(h);const implicit=box();
  PlayroomGameScreen.allowLayoutChange(h,{allowLayoutChange:true});PlayroomGameScreen.layoutScene(h);
  return {initial,fixed,implicit,changed:box(),attr:PlayroomViews.helpers.actionAttr({type:'draw'},{allowLayoutChange:true})};
 });assert.equal(result.initial,result.fixed);assert.equal(result.initial,result.implicit);assert.notEqual(result.changed,result.initial);assert.match(result.attr,/data-allow-layout-change="true"/);
 await page.setViewportSize({width:844,height:390});await page.evaluate(()=>rcRender());
 assert((await page.locator('.layout-field').boundingBox()).width>100);
}));

test('structural field grids reject implicit reflow and accept only a true action flag',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await scene(page,'durak');
 const result=await page.evaluate(()=>{
  const host=document.querySelector('#app'),grid=()=>host.querySelector('.game-field-groups');
  const read=()=>{const c=getComputedStyle(grid());return [c.gridTemplateColumns,c.gridTemplateRows,c.columnGap,c.alignItems];};
  const initial=read(),style=document.createElement('style');
  style.textContent='.durak-scene .game-field-groups{grid-template-columns:100px 100px!important;column-gap:17px!important;align-items:end!important}';document.head.append(style);
  // A fresh DOM render must preserve the previous geometry as well.
  rcRender();const rerendered=read();
  const indicator=document.createElement('span');indicator.className='player-indicator';host.querySelector('.player-panel').append(indicator);
  for(const flag of [undefined,false,'true',1]){PlayroomGameScreen.allowLayoutChange(host,{allowLayoutChange:flag});PlayroomGameScreen.layoutScene(host);}
  const rejected=read();PlayroomGameScreen.allowLayoutChange(host,{allowLayoutChange:true});PlayroomGameScreen.layoutScene(host);const allowed=read();
  style.remove();PlayroomGameScreen.layoutScene(host);const once=read();
  return {initial,rerendered,rejected,allowed,once};
 });assert.deepEqual(result.rerendered,result.initial);assert.deepEqual(result.rejected,result.initial);assert.notDeepEqual(result.allowed,result.initial);assert.deepEqual(result.once,result.allowed);
 await page.setViewportSize({width:844,height:390});await page.evaluate(()=>rcRender());
 const columns=await page.locator('.game-field-groups').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
 assert.notEqual(columns,result.allowed[0]);
}));

test('ZiL+ has one reversible adjustment choice before either die or destination can move',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await scene(page,'snakes',{preset:'plus'});
 const result=await page.evaluate(()=>{
  rcStateOverride=TabletopCore.clone(rcSession.current);Object.assign(rcStateOverride.data,{phase:'move',dice:[2,5],adjusting:true});rcStateOverride.data.positions[0]=30;rcRender();
  const cells=()=>[...document.querySelectorAll('.snakes-cell[data-action]')].map(el=>Number(el.dataset.motionAnchor.slice(5))).sort((a,b)=>a-b),box=()=>{const r=document.querySelector('.snakes-board').getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
  const before=box(),initial=cells(),disabled=[...document.querySelectorAll('.snakes-controls .die')].every(el=>el.disabled),buttons=document.querySelectorAll('.snakes-adjust button').length;
  const choose=value=>{const button=document.querySelector(`[data-adjust-delta="${value}"]`);rcUI.viewState={adjustDelta:button.dataset.viewValue};rcRender();return cells();};
  const plus=choose(1),minus=choose(-1),again=choose(1),after=box();rcStateOverride.move++;rcRender();return {before,after,initial,disabled,buttons,plus,minus,again,reset:cells(),position:rcStateOverride.data.positions[0]};
 });assert.deepEqual(result.initial,[]);assert(result.disabled);assert.equal(result.buttons,2);assert.deepEqual(result.reset,[]);assert.deepEqual(result.plus,[33,36]);assert.deepEqual(result.minus,[31,34]);assert.deepEqual(result.again,result.plus);assert.equal(result.position,30);assert.deepEqual(result.before,result.after);
 await page.screenshot({path:path.join(shots,'rc18-adjustment.png')});
}));


test('deferred effect badges scroll in one fixed-height player row',async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'snakes',{preset:'plus',players:Array.from({length:6},(_,i)=>({name:'Игрок '+i}))});
  const result=await page.evaluate(()=>{
   const boxes=()=>Array.from(document.querySelectorAll('.player-info'),el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
   const before=boxes();rcStateOverride=TabletopCore.clone(rcSession.current);rcStateOverride.data.effects.forEach(e=>Object.assign(e,{skip:true,less:true,adjust:true,shield:true}));rcRender();
   const rows=Array.from(document.querySelectorAll('.player-data')).filter(el=>el.querySelector('.player-status-badge')).map(el=>{const badges=Array.from(el.querySelectorAll('.player-status-badge')),tops=badges.map(b=>b.getBoundingClientRect().top);el.scrollLeft=1000;return {tops,scroll:el.scrollLeft,overflow:el.scrollWidth>el.clientWidth};});return {before,after:boxes(),rows};
  });
  assert.deepEqual(result.after,result.before,'effects must not resize or reposition cards');assert(result.rows.length);
  for(const row of result.rows){assert(Math.max(...row.tops)-Math.min(...row.tops)<1);if(row.overflow)assert(row.scroll>0);}
  if(width<=390)assert(result.rows.some(row=>row.overflow),'narrow cards exercise scrolling');
  await page.screenshot({path:path.join(shots,`rc19-effects-${width}.png`)});
 }
}));


test('full boards reserve a square zone and use portrait width before and after rolling',async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[390,900],[844,390]])for(const game of ['snakes','ludo','checkers','tictactoe'])for(const seating of ['circle','row']){
  await page.setViewportSize({width,height});await scene(page,game,{players:Array.from({length:game==='snakes'?6:game==='ludo'?4:2},(_,i)=>({name:'Игрок '+i}))});
  await page.evaluate(seating=>{rcUI={seating};rcRender();},seating);
  const measure=()=>page.evaluate(()=>{const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {field:box('.layout-field'),art:box('.game-field-content'),stage:box('.app-game-layout'),controls:document.querySelector('.layout-actions')?.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
  const before=await measure();assert(Math.abs(before.field.w-before.field.h)<1,JSON.stringify({game,seating,width,before}));assert(Math.abs(before.art.w-before.field.w)<2);assert(!before.overflow);
  if(width===390&&height>=844)assert(before.art.w>=before.stage.w-14,JSON.stringify({game,seating,width,before}));
  if(game==='snakes'||game==='ludo'){
   await page.evaluate(()=>{rcSession.act(0,{type:'roll'});rcRender();});const after=await measure();assert.deepEqual(after.field,before.field,'rolling must preserve the square zone');
  }
  if(game==='snakes'||game==='ludo')await page.screenshot({path:path.join(shots,`rc20-${game}-${seating}-${width}-${height}.png`)});
 }
}));


test('each committed dice roll animates independently of routes, faces and speed except instant',async()=>fixture(async page=>{
 for(const [game,preset]of [['snakes','plus'],['snakes','classic'],['ludo','classic'],['yatzy','classic']])for(const choice of ['fast','normal','slow','instant','reduced']){
  const mode=choice==='reduced'?'fast':choice;await page.emulateMedia({reducedMotion:choice==='reduced'?'reduce':'no-preference'});await scene(page,game,{preset});
  const result=await page.evaluate(async({mode})=>{
   const flow=new PlayroomGameFlow.GameFlow({options:()=>({animationSpeed:mode}),motion:PlayroomMotion,reducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
   window.rollFeedback=new PlayroomGameFeedback();rollFeedback.start(rcSession.current.events);
   const actor=rcSession.current.turn,action={type:'roll'},snapshot=flow.capture({actor,action,viewer:0});rcSession.act(actor,action);rcUI.presentationTurn=actor;rcRender();
   const events=TabletopCore.project(rcSession.current,0).events;
   rollFeedback.accept(events,[],rcSession.game,{mode,snapshot,motion:()=>flow.play(snapshot)});
   await new Promise(requestAnimationFrame);
   const count=document.querySelectorAll('[data-motion-kind="roll"]').length;
   const queue=rollFeedback.queue.length;rollFeedback.accept(events,[],rcSession.game,{mode});
   return {count,queue,duplicateQueue:rollFeedback.queue.length};
  },{mode});
  if(mode==='instant')assert.equal(result.count,0);else assert(result.count>0,game+'/'+preset+'/'+mode);
  assert.equal(result.queue,result.duplicateQueue,'duplicate snapshot must not queue a second throw');
  await page.evaluate(()=>{rollFeedback.clear();PlayroomMotion.cancel();});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await scene(page,'snakes',{preset:'plus'});
 const gentle=await page.evaluate(async()=>{window.rollFeedback=new PlayroomGameFeedback();rollFeedback.accept([{id:100,kind:'roll'}],[],'snakes',{mode:'fast'});await new Promise(requestAnimationFrame);return [...document.querySelectorAll('[data-motion-kind="roll"]')].map(el=>el.getAnimations()[0]?.effect.getKeyframes());});
 assert.equal(gentle.length,2);assert(gentle.every(frames=>frames.length&&frames.every(frame=>frame.transform===undefined)));
 await page.evaluate(()=>{rollFeedback.clear();PlayroomMotion.cancel();});
 // Equal faces in the same DOM still animate for every newly accepted event.
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const id of [101,102]){await page.evaluate(id=>rollFeedback.accept([{id,kind:'roll'}],[],'snakes',{mode:'fast'}),id);assert.equal(await page.locator('[data-motion-kind="roll"]').count(),2);await page.evaluate(()=>{rollFeedback.clear();PlayroomMotion.cancel();});}
}));


test('card hands default to arc while a saved straight hand stays explicit',async()=>{
 await fixture(async page=>{assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions().handShape),'arc');await scene(page,'uno');assert.equal(await page.locator('.layout-hand .hand-track.is-arc').count(),1);});
 await fixture(async page=>{assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions().handShape),'straight');await scene(page,'uno');assert.equal(await page.locator('.layout-hand .hand-track.is-arc').count(),0);},{settings:{sound:false,animationSpeed:'fast',handShape:'straight'}});
});


test('local primary player keeps the player icon after changing seats and no local crowns appear',async()=>fixture(async page=>{
 await page.locator('[data-start="snakes"]').click();
 const host=await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room(),id=r.id,h=r.ownerId;b.roomService.setLocalSeat(id,h,'seat-2',{kind:'human',nickname:'Друг'});b.roomService.setLocalSeat(id,h,'seat-3',{kind:'bot',nickname:'Бот'});b.roomService.moveParticipant(id,h,h,'seat-3');b.roomService.configure(id,h,{firstPlayerMode:'assigned',firstParticipantId:h});b.renderLobby();return h;});
 assert.equal(await page.locator(`[data-participant-id="${host}"] [data-participant-role="player"]`).count(),1);
 assert.equal(await page.locator('.lobby-shell [data-ui-icon="host"]').count(),0);
 assert.equal(await page.locator('.lobby-shell [data-participant-role="hand"]').count(),1);
 await page.screenshot({path:path.join(shots,'rc20-local-lobby.png')});
 await page.locator('[data-command="lobby-start"]').click();await page.locator('.table-shell').waitFor();
 assert(await page.locator('.player-panel[data-player-index="2"] [data-participant-role="player"]').count()>0);
 assert(await page.locator('.player-panel [data-participant-role="hand"]').count()>0);
 assert.equal(await page.locator('.table-shell [data-ui-icon="host"]').count(),0);
 await page.screenshot({path:path.join(shots,'rc20-local-player.png')});
}));

test('network crowns replace player icons and the resume card appends Table after all players',async()=>fixture(async page=>{
 const result=await page.evaluate(()=>{
  const h=TabletopUI.helpers,html=(person,options)=>{const node=document.createElement('div');node.innerHTML=h.participantIcon(person,options);return [...node.querySelectorAll('[data-ui-icon]')].map(el=>el.dataset.uiIcon);};
  const state={players:[{name:'Игрок'},{name:'Бот',bot:true}],turn:0,status:'playing'};
  document.querySelector('#app').innerHTML=PlayroomGameScreen.resumeCard({state,network:true,participants:[{playerIndex:0,isHost:true},{role:'spectator',nickname:'Зритель'},{role:'table',nickname:'Общий экран',isHost:true}]});
  return {local:html({local:true,isHost:true}),host:html({isHost:true},{network:true}),table:html({isHost:true,role:'table'},{network:true}),names:[...document.querySelectorAll('.resume-person-name>span:last-child')].map(el=>el.textContent),last:[...document.querySelectorAll('.resume-person')].at(-1).classList.contains('resume-table')};
 });assert.deepEqual(result.local,['player']);assert.deepEqual(result.host,['host']);assert.deepEqual(result.table,['host','grid']);assert.deepEqual(result.names,['Игрок','Бот','Общий экран']);assert(result.last);
 await page.screenshot({path:path.join(shots,'rc20-network-resume-table.png')});
}));

test('enlarged public moves and bubbles remain below application dialogs',async()=>fixture(async page=>{
 await scene(page,'snakes',{preset:'plus'});
 const result=await page.evaluate(()=>{
  const reveal=new PlayroomActionReveal();reveal.show({kind:'dice',dice:[{value:6}]},'snakes');
  const feedback=new PlayroomGameFeedback();feedback.active={id:1,timing:PlayroomGameFlow.effectTimes.normal,speech:{speaker:0,text:'Пас'}};feedback.refresh();
  document.querySelector('#modal-root').innerHTML='<div class="shared-modal-backdrop"><div class="modal" style="width:300px;height:300px">Настройки</div></div>';
  const modal=document.querySelector('.shared-modal-backdrop'),box=modal.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  const z=el=>Number(getComputedStyle(el).zIndex);return {reveal:z(reveal.host),bubble:z(feedback.layer),modal:z(modal),top:!!document.elementFromPoint(x,y)?.closest('#modal-root')};
 });assert(result.reveal<result.modal,JSON.stringify(result));assert(result.bubble<result.modal,JSON.stringify(result));assert(result.top);
 await page.screenshot({path:path.join(shots,'rc20-reveal-behind-dialog.png')});
}));

test('fish books follow turn order in balanced avatar columns and rank-only cards stay legible',async()=>fixture(async page=>{
 for(const [width,height] of [[320,640],[390,844],[844,390]])for(const count of [3,4,5,6]){
  await page.setViewportSize({width,height});await scene(page,'gofish',{firstPlayer:2,players:Array.from({length:count},(_,i)=>({name:['Иван','Луна','Сэм','Кира','Ника','Лев'][i]}))});
  await page.evaluate(()=>{rcUI={seating:'anchors'};rcRender();});assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'row','fish ignores saved corner seating');
  const fieldBefore=await page.locator('.layout-field').boundingBox(),tablesBefore=await page.locator('.gofish-book-table').evaluateAll(tables=>tables.map(t=>({width:t.getBoundingClientRect().width,height:t.getBoundingClientRect().height})));
  await page.evaluate(()=>{const state=TabletopCore.project(rcSession.current,0),d=state.data;d.books=d.books.map(()=>Array.from({length:13},(_,i)=>i+2));d.bookCards=d.books.map((r,p)=>r.map((rank,i)=>({id:`test-${p}-${i}`,rank,suit:'♥'})));const scene=PlayroomViews.render(state,0,[],{preferences:{},viewState:{}});PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:TabletopCore.get('gofish').name,state,viewer:0,actions:[],scene,turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));});
  assert.deepEqual(await page.locator('.layout-field').boundingBox(),fieldBefore,'all sets do not resize the field');assert.deepEqual(await page.locator('.gofish-book-table').evaluateAll(tables=>tables.map(t=>({width:t.getBoundingClientRect().width,height:t.getBoundingClientRect().height}))),tablesBefore,'all sets do not resize tables');
  assert(await page.locator('.gofish-book-cards').evaluateAll(stacks=>stacks.every(stack=>{const cards=[...stack.children];return cards.slice(1).every((card,i)=>{const previous=cards[i],a=previous.getBoundingClientRect(),b=card.getBoundingClientRect(),label=previous.querySelector('.shared-card-corner:not(.bottom)'),corner=label.getBoundingClientRect();if(Math.abs(b.left-a.left-14)>.1)return false;if(previous.dataset.rank!=='10')return b.left>=corner.right;const range=document.createRange();range.setStart(label.firstChild,0);range.setEnd(label.firstChild,1);return b.left>=range.getBoundingClientRect().right+1&&b.left<corner.right&&corner.left-a.left<stack.firstElementChild.querySelector('.shared-card-corner:not(.bottom)').getBoundingClientRect().left-stack.firstElementChild.getBoundingClientRect().left-.8;});})),'uniform mini-card geometry '+JSON.stringify(await page.locator('.gofish-book-cards').first().evaluate(stack=>[...stack.children].map((card,i)=>{const box=card.getBoundingClientRect(),label=card.querySelector('.shared-card-corner:not(.bottom)'),corner=label.getBoundingClientRect();return {rank:card.dataset.rank,x:box.x,step:i?box.x-stack.children[i-1].getBoundingClientRect().x:0,left:corner.left-box.left,right:corner.right-box.left};}))));
  await page.screenshot({path:path.join(shots,`fish-density-${count}-${width}-start.png`)});
  const layout=await page.evaluate(()=>({columns:Object.values([...document.querySelectorAll('[data-book-player]')].reduce((columns,row)=>{const x=Math.round(row.getBoundingClientRect().x);(columns[x]||=[]).push(Number(row.dataset.bookPlayer));return columns;},{})),stock:document.querySelector('.gofish-stock').getBoundingClientRect().width,overflows:[...document.querySelectorAll('.gofish-book-cards')].map(c=>c.scrollWidth>c.clientWidth),ranks:[...document.querySelectorAll('.gofish-book .shared-card-corner:not(.bottom)')].map(c=>c.textContent),card:document.querySelector('.gofish-book').getBoundingClientRect().width}));
  assert(layout.columns.length>=1&&layout.columns.length<=2);if(count===6&&width!==320)assert.equal(layout.columns.length,1,'six-player tables fit one column when field height is sufficient');assert(Math.abs(layout.columns[0].length-(layout.columns[1]?.length||layout.columns[0].length))<=1);assert.deepEqual(layout.columns.flat(),Array.from({length:count},(_,i)=>(i+2)%count));assert(layout.stock>=59.9&&layout.stock<=90.1,JSON.stringify(layout));assert(await page.locator('.gofish-owner .avatar').evaluateAll(avatars=>avatars.every(avatar=>{const range=document.createRange();range.selectNodeContents(avatar);const letter=range.getBoundingClientRect(),box=avatar.getBoundingClientRect();return Math.abs(box.width-24)<.1&&Math.abs(box.height-24)<.1&&Math.abs(letter.x+letter.width/2-box.x-box.width/2)<1&&Math.abs(letter.y+letter.height/2-box.y-box.height/2)<4;})),'avatar letters remain centered in both table columns');assert(layout.card>=23.9&&layout.card<=24.1,JSON.stringify(layout));assert.equal(layout.ranks.length,count*13);assert.equal(new Set(layout.ranks).size,13);assert(await page.locator('.gofish-book-cards').evaluateAll(cells=>cells.every(cell=>{cell.scrollLeft=cell.scrollWidth;const last=cell.lastElementChild.getBoundingClientRect(),box=cell.getBoundingClientRect();return last.right<=box.right+1&&last.left>=box.left-1;})),'last set is reachable inside its own table cell');
  await page.evaluate(()=>{const board=document.querySelector('.gofish-board');board.scrollTop=board.scrollHeight;});
  assert(await page.locator('.gofish-board').evaluate(board=>{const b=board.getBoundingClientRect();return [...board.querySelectorAll('.gofish-book-row')].every(row=>row.getBoundingClientRect().bottom<=b.bottom+1);}),'last player in either table is reachable');
  await page.screenshot({path:path.join(shots,`fish-density-${count}-${width}.png`)});
 }
}));

test('fish hides the seating selector because only rows are available',async()=>fixture(async page=>{
 await page.locator('[data-start="gofish"]').first().click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
 await page.locator('[data-command="lobby-start"]').click();await page.locator('.gofish-board').waitFor();
 await page.locator('.table-shell [data-command="settings"]').click();assert.equal(await page.locator('#setting-seating').count(),0);assert.equal(await page.locator('#setting-hand-shape').count(),1);
}));

test('player-card hands are always cropped on every hand-game surface',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});
 for(const game of ['uno','durak','oldmaid','gofish','domino'])for(const openHands of [false,true]){
  await scene(page,game,{openHands});
  for(const surface of ['combined','table','player'])for(const seating of ['row','anchors']){
   await page.evaluate(({surface,seating})=>{const viewer=surface==='table'?-1:0,state=TabletopCore.project(rcSession.current,viewer),actions=viewer<0?[]:TabletopCore.legalActions(rcSession.current,viewer),scene=PlayroomViews.render(state,viewer,actions,{surface,seating,preferences:{},viewState:{}});PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:state.game,state,viewer,actions,scene,turnText:'Ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));},{surface,seating});
   const hands=await page.locator('.player-panel .mini-hand').evaluateAll(hands=>hands.filter(hand=>hand.clientWidth&&hand.firstElementChild).map(hand=>({height:hand.getBoundingClientRect().height,card:hand.firstElementChild.getBoundingClientRect().height,overflow:getComputedStyle(hand).overflowY})));
   assert(hands.length,game+' '+surface);assert(hands.every(hand=>hand.overflow==='hidden'&&hand.card>=hand.height*1.5),JSON.stringify({game,surface,seating,openHands,hands}));
  }
 }
}));


test('avatars remain square with proportional corners in lobby, settings, picker, games and saved results',async()=>fixture(async page=>{
 const check=async label=>{
  const avatars=await page.locator('.avatar').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&n.getBoundingClientRect().width).map(n=>{
   const r=n.getBoundingClientRect(),s=getComputedStyle(n),art=n.querySelector('.avatar-art'),clip=n.querySelector('.avatar-clip');
   return {width:r.width,height:r.height,corners:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius],fit:art?getComputedStyle(art).objectFit:null,inset:clip?(clip.getBoundingClientRect().left-r.left)/r.width:null};
  }));
  assert(avatars.length,label+' has visible avatars');
  for(const a of avatars){assert(Math.abs(a.width-a.height)<.2,label+JSON.stringify(a));assert(a.corners.every(v=>v==='22%'),label+JSON.stringify(a));if(a.fit){assert.equal(a.fit,'contain');assert(Math.abs(a.inset-.09)<.01);}}
 };
 for(const [width,height] of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.reload();await page.locator('.game-tile').first().waitFor();
  await page.locator('.topbar [data-command="settings"]').click();await check('settings');
  await page.locator('[data-avatar-picker]').first().click();await check('picker');
  await page.screenshot({path:path.join(shots,`avatars-picker-${width}.png`)});
  await page.locator('[data-avatar-option="square-red"]').click();await check('profile artwork');await page.keyboard.press('Escape');
  await page.locator('[data-start="gofish"]').first().click();await check('lobby');
  await page.screenshot({path:path.join(shots,`avatars-lobby-${width}.png`)});
  await scene(page,'gofish',{players:Array.from({length:6},(_,i)=>({name:['Иван','Луна','Сэм','Кира','Ника','Лев'][i],avatar:i%2?'square-red':null}))});
  await check('game and fish table');
  await page.evaluate(()=>{const state=TabletopCore.project(rcSession.current,0);state.status='finished';state.winners=[0];state.result={places:[1,2,3,4,5,6],values:[6,5,4,3,2,1]};document.querySelector('#app').innerHTML=PlayroomGameScreen.resumeCard({state,gameName:'Спроси рыбу',action:'data-resume'})+PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Спроси рыбу'});});
  await check('resume and results');await page.screenshot({path:path.join(shots,`avatars-results-${width}.png`)});
 }
}));

test('hand zones reserve space when own and opponent hands disappear and return',{timeout:60000},async()=>fixture(async page=>{
 for(const [width,height]of [[390,844],[844,390]])for(const game of ['mage-brawl','uno','domino']){
  await page.setViewportSize({width,height});await scene(page,game);
  const result=await page.evaluate(()=>{
   const host=document.querySelector('#app'),original=PlayroomViews.render;
   const boxes=()=>['.layout-field','.layout-self',...Array.from(document.querySelectorAll('.layout-participants .player-panel')).map(p=>`.layout-participants .player-panel[data-player-index="${p.dataset.playerIndex}"]`)].map(q=>{const b=document.querySelector(q).getBoundingClientRect();return [b.x,b.y,b.width,b.height];});
   const before=boxes(),height=document.querySelector('.layout-hand').offsetHeight;
   let empty=true;
   PlayroomViews.render=(...args)=>{const template=document.createElement('template');template.innerHTML=original(...args);if(empty){template.content.querySelector('.layout-hand')?.remove();for(const hand of template.content.querySelectorAll('.player-hand'))hand.remove();}return template.innerHTML;};
   try{
    rcRender();const absent=boxes(),reserve=document.querySelector('.layout-hand');
    const blank=reserve?.children.length===0&&reserve.hasAttribute('inert')&&reserve.offsetHeight>=height;
    rcRender();const repeated=boxes();empty=false;rcRender();
    return {before,absent,repeated,returned:boxes(),blank,restored:!!document.querySelector('.layout-hand button')};
   }finally{PlayroomViews.render=original;}
  });
  assert(result.blank,game+' keeps an inert blank hand zone');assert(result.restored,game+' restores controls');
  for(const phase of ['absent','repeated','returned'])for(let i=0;i<result.before.length;i++)for(let j=0;j<4;j++)assert(Math.abs(result.before[i][j]-result[phase][i][j])<1,JSON.stringify({game,width,phase,result}));
 }
}));


test('Mage Brawl status and hand geometry stay fixed through death and respawn',async()=>fixture(async page=>{
 for(const [width,height]of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'mage-brawl');
  const result=await page.evaluate(()=>{
   const boxes=()=>['.table-status','.layout-field','.mage-grid','.layout-self'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
   const before=boxes(),s=structuredClone(rcSession.current),p=s.data.players[0],hand=[...p.hand],pos=[...p.pos];rcStateOverride=s;
   s.data.discard.push(...hand);Object.assign(p,{hand:[],health:0,lives:1,pos:null});s.data.phase='respawn';s.data.respawn=[0];s.data.frames=[];rcRender();const death=boxes();
   s.data.discard.splice(s.data.discard.length-hand.length,hand.length);Object.assign(p,{hand,health:3,pos});s.data.phase='planning';s.data.respawn=[];rcRender();
   return {before,death,returned:boxes(),turnLabel:!!document.querySelector('.turn-label')};
  });
  assert.equal(result.turnLabel,false);
  for(const phase of ['death','returned'])for(let i=0;i<result.before.length;i++)for(let j=0;j<4;j++)assert(Math.abs(result.before[i][j]-result[phase][i][j])<1,JSON.stringify({width,phase,result}));
 }
}));


test('hand reserves reset on orientation changes without a render',async()=>fixture(async page=>{
 for(const game of ['mage-brawl','uno','domino']){
  await page.setViewportSize({width:390,height:844});await scene(page,game);
  const boxes=()=>page.evaluate(()=>['.layout-field','.layout-hand','.layout-self'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
  await page.evaluate(()=>{rcRender();rcRender();});const before=await boxes();
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{PlayroomGameScreen.layoutScene(document.querySelector('#app'));rcUI.viewState={mageSelectedCard:1};rcRender();rcRender();});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>PlayroomGameScreen.layoutScene(document.querySelector('#app')));
  const after=await boxes();
  for(let i=0;i<before.length;i++)for(let j=0;j<4;j++)assert(Math.abs(before[i][j]-after[i][j])<1,JSON.stringify({game,before,after}));
 }
}));


test('Battleship reserves opponent fleet indicators from setup through battle',async()=>fixture(async page=>{
 for(const [width,height] of [[390,844],[360,740],[844,390]]){
  await page.setViewportSize({width,height});await scene(page,'battleship');
  const result=await page.evaluate(()=>{
   const measure=()=>{const slot=document.querySelector('.layout-participants'),panel=slot.querySelector('.player-panel'),indicators=panel.querySelector('.player-indicators');return {height:slot.getBoundingClientRect().height,overflow:slot.scrollHeight-slot.clientHeight,visible:!!indicators&&indicators.getBoundingClientRect().bottom<=slot.getBoundingClientRect().bottom+1,count:panel.querySelectorAll('.fleet-indicator').length};};
   const before=measure();
   for(const actor of [0,1]){rcSession.act(actor,{type:'auto'});rcSession.act(actor,{type:'ready'});rcRender();}
   return {before,after:measure()};
  });
  assert.equal(result.before.count,4);assert.equal(result.after.count,4);assert(result.before.visible&&result.after.visible,JSON.stringify({width,result}));assert(result.after.overflow<=1,JSON.stringify({width,result}));assert.equal(result.before.height,result.after.height);
  await page.screenshot({path:path.join(shots,'battleship-reserved-'+width+'.png')});
 }
}));


test('Battleship bot prepares itself while auto placement controls only the local fleet',async()=>fixture(async page=>{
 await page.evaluate(()=>{const write=PlayroomLibrary.prototype.write;PlayroomLibrary.prototype.write=function(session,...args){window.battleLive=session;return write.call(this,session,...args);};});
 await page.locator('[data-start="battleship"]').first().click();await page.locator('[data-command="lobby-start"]').click();
 await page.waitForFunction(()=>{const s=window.battleLive?.current;return s?.data.ready[1]&&!s.data.ready[0];});
 const before=await page.evaluate(()=>{const s=window.battleLive.current;return {own:s.data.ships[0],bot:s.data.ships[1]};});
 assert.equal(before.own.length,0);assert(before.bot.length>0);
 await page.getByRole('button',{name:'Расставить флот',exact:true}).click();
 await page.getByRole('button',{name:'Готово',exact:true}).waitFor();
 const after=await page.evaluate(()=>window.battleLive.current.data.ships);
 assert(after[0].length>0);assert.deepEqual(after[1],before.bot);
 await page.getByRole('button',{name:'Готово',exact:true}).click();
 await page.waitForFunction(()=>window.battleLive.current.data.phase==='battle');
}));

test('all pack views release replaced scenes across repeated render cycles',{timeout:90000},async()=>fixture(async page=>{
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const samples=[];
 for(let round=0;round<3;round++){
  for(const game of ['uno','durak','gofish','oldmaid','domino','ludo','snakes','battleship','checkers','tictactoe','pexeso','yatzy','klondike','spider','mage-brawl']){
   await scene(page,game);await page.evaluate(()=>{for(let i=0;i<8;i++)rcRender();});
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await cdp.send('HeapProfiler.collectGarbage');
  const counters=await cdp.send('Memory.getDOMCounters'),metrics=await cdp.send('Performance.getMetrics');
  samples.push({...counters,heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize').value});
 }
 console.log('Post-GC render-cycle samples:',JSON.stringify(samples));
 assert(samples[2].nodes<=samples[0].nodes+100,'replaced DOM nodes do not accumulate');
 assert(samples[2].jsEventListeners<=samples[0].jsEventListeners+20,'listeners do not accumulate');
 assert(samples[2].heap<=samples[0].heap*1.2+2_000_000,'heap remains bounded after warmup');
 await cdp.detach();
}));


test('Mage cell highlights stay above tiles without overlapping adjacent cells',async()=>fixture(async page=>{
 for(const [width,height] of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});
  for(const players of [2,4]){
   await scene(page,'mage-brawl',{players:Array.from({length:players},(_,i)=>({name:'Player '+i}))});
   const result=await page.locator('.mage-grid').evaluate(grid=>{
    const cells=[...grid.querySelectorAll('.mage-cell')],rings=[...grid.querySelectorAll('.mage-cell-highlight')],rect=e=>e.getBoundingClientRect();
    return {acting:cells.filter(c=>c.classList.contains('mage-acting')).length,layer:Number(getComputedStyle(grid.querySelector('.mage-highlights')).zIndex),pieces:Number(getComputedStyle(grid.querySelector('.mage-pieces')).zIndex),cells:cells.map((c,i)=>{const r=rect(c),a=rect(c.querySelector('svg')),h=rect(rings[i]),next=cells[i+1]&&rect(cells[i+1]);return {artInside:a.left>=r.left&&a.right<=r.right+.1&&a.top>=r.top&&a.bottom<=r.bottom+.1,aligned:Math.abs(h.x-r.x)<.1&&Math.abs(h.y-r.y)<.1&&Math.abs(h.width-r.width)<.1&&Math.abs(h.height-r.height)<.1,noOverlap:!next||Math.abs(next.y-r.y)>.1||next.left>=r.right,outline:getComputedStyle(c).outlineStyle};})};
   });
   assert.equal(result.acting,0,'empty cells never get an acting ring');assert(result.layer>result.pieces);
   for(const c of result.cells){assert(c.artInside&&c.aligned&&c.noOverlap,JSON.stringify(c));assert.equal(c.outline,'none');}
   await page.screenshot({path:path.join(shots,`mage-rings-${players}-${width}.png`)});
  }
 }
}));

test('first-turn guides cover every pack and stay non-interactive above the scene',async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});
 const failures=[];
 for(const game of ['uno','durak','gofish','oldmaid','domino','ludo','snakes','battleship','checkers','tictactoe','pexeso','yatzy','klondike','spider','mage-brawl']){
  await scene(page,game);
  await page.evaluate(()=>{window.refreshGuide=()=>{const state=TabletopCore.project(rcSession.current,0);PlayroomFirstTurnGuide.update({owner:rcSession,state,viewer:0,actions:TabletopCore.legalActions(rcSession.current,0),ui:rcUI,active:true,busy:false});};refreshGuide();});
  await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor({timeout:5000});
  const info=await page.evaluate(()=>{const g=document.querySelector('.first-turn-guide');return {visible:!!g&&!g.hidden,text:g?.textContent,pointer:g&&getComputedStyle(g).pointerEvents,actions:[...new Set(TabletopCore.legalActions(rcSession.current,0).map(a=>a.type))]};});
  if(!info.visible)failures.push({game,...info});else assert.equal(info.pointer,'none');
  if(['oldmaid','mage-brawl','ludo'].includes(game))await page.screenshot({path:path.join(shots,`guide-${game}.png`)});
  await page.evaluate(()=>PlayroomFirstTurnGuide.stop());
 }
 assert.deepEqual(failures,[]);
}));

test('first-turn guide follows real Old Maid choices and both Mage planning steps',{timeout:45000},async()=>fixture(async page=>{
 const caption=page.locator('.first-turn-guide:not([hidden]) .guide-caption');
 const start=async game=>{
  await page.locator(`[data-start="${game}"]`).first().click();await page.locator('[data-game-mode=hotseat]').click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
  await page.locator('[data-command="lobby-start"]').click();
 };
 await start('oldmaid');await caption.filter({hasText:'соперника'}).waitFor();
 await page.evaluate(()=>{window.retainedHand=[...document.querySelectorAll('.own-hand [data-entity]')].map(node=>({id:node.dataset.entity,node,art:node.querySelector('svg')}));window.retainedHandScope=document.querySelector('.table-shell')?.dataset.geometryIdentity;});
 const targets=page.locator('[data-player-target]');await targets.last().click();
 await page.locator('dialog[open] .first-turn-guide:not([hidden]) .guide-caption').waitFor();
 assert.match(await caption.innerText(),/любую карту/);
 await page.screenshot({path:path.join(shots,'guide-oldmaid-choice.png')});
 await page.locator('.card-choice-dialog [data-card-index]').last().click();
 await page.waitForFunction(()=>!document.querySelector('.first-turn-guide:not([hidden])'));
 await page.locator('.table-shell>.scene[aria-busy="false"]').waitFor();
 const retained=await page.evaluate(()=>{const current=[...document.querySelectorAll('.own-hand [data-entity]')],kept=retainedHand.flatMap(old=>{const node=current.find(node=>node.dataset.entity===old.id);return node?[{node:node===old.node,art:node.querySelector('svg')===old.art}]:[]});return {before:retainedHand.length,kept,sameScope:retainedHandScope===document.querySelector('.table-shell')?.dataset.geometryIdentity};});assert(retained.kept.length>0&&retained.kept.every(item=>item.node&&item.art),JSON.stringify(retained));
 await page.evaluate(()=>PlayroomAppBridge.showHub());
 await start('mage-brawl');await caption.filter({hasText:'тип действия'}).waitFor();
 assert.match(await caption.innerText(),/атака/,'default movement is already selected');
 await page.locator('[data-view-key="mageAction"][aria-pressed="true"]').click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.movement),undefined,'clicking the already selected type is not a switch');
 await caption.filter({hasText:'атака'}).waitFor();
 // Bypass the suggested action type and choose any other card directly.
 await page.locator('.mage-card:not([disabled])').last().click();
 await caption.filter({hasText:'Поверните'}).waitFor();
 await page.locator('[data-view-key="mageDirection"]').last().click();
 await caption.filter({hasText:'справку'}).waitFor();
 await page.locator('[data-command="card-help"]').click();
 await page.locator('#modal-root [data-command="close-modal"]').first().click();
 await caption.filter({hasText:'галочкой'}).waitFor();
 await page.locator('.mage-ready').click();
 await caption.filter({hasText:'карту стихии'}).waitFor();
 await page.locator('.mage-reset-plan').click();
 await page.waitForFunction(()=>!PlayroomAppBridge.saveLibrary.current().session.current.data.drafts?.[0],null,{timeout:5000});
 assert.equal(await page.evaluate(()=>!!PlayroomAppBridge.saveLibrary.current().session.current.data.drafts?.[0]),false,'native undo removes the committed first draft');
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.edit),1);
 await page.locator('.mage-card:not([disabled])').last().click();await page.locator('.mage-ready').click();
 await page.locator('.mage-card:not([disabled])').first().click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.edit),1,'completed undo is not suggested again');
 await page.locator('.mage-ready').click();
 await page.waitForFunction(()=>!document.querySelector('.first-turn-guide:not([hidden])'));
 // Rare phases use validated saved positions, then the same actual app/input/commit path.
 const resumeRare=async kind=>{
  await page.evaluate(async kind=>{
   PlayroomAppBridge.showHub();const E=TabletopCore,saved=new TabletopSession(E,'mage-brawl',{seed:17,mode:'solo',actionsPerTurn:'1',players:[{name:'Иван'},{name:'Тео'},{name:'Сэм'}]}).export(),state=saved.states[0],d=state.data;
   if(kind==='ultimate')d.players[0].ultimate=1;
   else{
    const victim=kind==='base'?0:1,positions=victim===0?[[2,2],[2,1],[2,3]]:[[2,1],[2,2],[2,3]];
    d.board=Array(d.size*d.size).fill('ground');for(const q of d.startingBases)d.board[q[0]*d.size+q[1]]='base';
    const pool=[...d.deck,...d.discard,...d.players.flatMap(p=>p.hand)];d.discard=[];
    d.players.forEach((p,i)=>{const elements=i===victim?['water','fire','air']:['earth'];Object.assign(p,{pos:positions[i],health:3,lives:2,ultimate:0,hand:elements.map(element=>{const index=pool.findIndex(c=>c.element===element);if(index<0)throw Error('Missing physical fixture card');return pool.splice(index,1)[0];})});});d.deck=pool;
   }
   E.validateState(state);const session=TabletopSession.restore(E,saved);
   if(kind!=='ultimate'){
    for(let actor=0;actor<3;actor++){const victim=kind==='base'?0:1,action=E.legalActions(session.current,actor).find(a=>a.type==='plan'&&a.action==='attack'&&a.element===(actor===victim?'water':'earth')&&a.direction===(actor===victim?0:actor===2?3:1));if(!action)throw Error('Missing legal fixture attack');session.act(actor,action);}
    if(session.current.data.phase!=='loot')throw Error('Legal attacks must produce loot');
    if(kind==='base')while(session.current.data.phase==='loot')session.act(session.current.turn,E.legalActions(session.current,session.current.turn)[0]);
    if(kind==='base'&&(session.current.data.phase!=='respawn'||session.current.turn!==0))throw Error('Fixture must require own base choice');
    if(kind==='loot')while(session.current.data.phase==='loot'&&session.current.turn!==0)session.act(session.current.turn,E.legalActions(session.current,session.current.turn)[0]);
    if(kind==='loot'&&(session.current.data.phase!=='loot'||session.current.turn!==0))throw Error('Fixture must grant own loot choice');
   }
   const id='mage-tutorial-tail-'+kind;await PlayroomAppBridge.saveLibrary.activateAsync(session,id);PlayroomAppBridge.showSessions();
  },kind);
  await page.locator(`.saved-game[data-session-id="mage-tutorial-tail-${kind}"][data-saved-actions-toggle]`).click();await page.locator(`[data-resume-id="mage-tutorial-tail-${kind}"]`).first().click();await page.locator('.mage-grid:visible').first().waitFor();
 };
 await resumeRare('ultimate');await page.locator('[data-view-key="mageAction"][data-view-value="ultimate"]').click();await page.locator('.mage-card:not([disabled])').first().click();await page.locator('.mage-ready').click();
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.window.plans[0].action),'ultimate','actual legal ultimate plan is committed');
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.ultimate),2);
 await resumeRare('loot');const lootBefore=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,hand:s.data.players[0].hand.length};});
 await page.locator('.mage-loot-hand [data-player-target]').click();await page.locator('.card-choice-dialog [data-card-index]').first().click();
 await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move>move,lootBefore.move);
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.players[0].hand.length),lootBefore.hand+1,'actual private reward enters own hand');
 for(const goal of ['loot-player','loot-card'])assert.equal(await page.evaluate(goal=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered[goal],goal),1);
 await resumeRare('base');const baseBefore=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.locator('.mage-cell[data-action]').first().click();
 await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move>move,baseBefore);assert(await page.evaluate(()=>!!PlayroomAppBridge.saveLibrary.current().session.current.data.players[0].pos));
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered.base),1);
 const remaining=await page.evaluate(()=>PlayroomViews.get('mage-brawl').tutorial.goals.filter(g=>PlayroomFirstTurnGuide.settings('mage-brawl').mastered[g.id]!==g.revision).map(g=>g.id));assert.deepEqual(remaining,[],'all thirteen Mage goals have actual input receipts across these sessions');
},{settings:{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false}}));

test('first-turn guide preferences persist per pack and resize does not move the field',{timeout:30000},async()=>fixture(async page=>{
 page.setDefaultTimeout(5000);
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-start="tictactoe"]').first().click();await page.locator('[data-command="lobby-start"]').click();
 await page.locator('.table-shell [data-command="settings"]').click();
 const setting=page.locator('#setting-learning-enabled');await setting.uncheck();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.skipped('tictactoe')),true);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.skipped('oldmaid')),false);
 await page.reload();assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.skipped('tictactoe')),true);
 await page.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showHub();});
 await scene(page,'tictactoe');
 await page.evaluate(()=>PlayroomFirstTurnGuide.update({owner:rcSession,state:TabletopCore.project(rcSession.current,0),viewer:0,actions:TabletopCore.legalActions(rcSession.current,0),active:true}));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
 assert.equal(await page.locator('.first-turn-guide:not([hidden])').count(),0);
 await page.evaluate(()=>PlayroomFirstTurnGuide.setSkipped('tictactoe',false));
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:320,height:640}]){
  await page.setViewportSize(viewport);await page.locator('.guide-caption').waitFor();
  const before=await page.locator('.ttt-grid').boundingBox();
  await page.evaluate(()=>PlayroomFirstTurnGuide.setSkipped('tictactoe',true));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.deepEqual(await page.locator('.ttt-grid').boundingBox(),before);
  await page.evaluate(()=>PlayroomFirstTurnGuide.setSkipped('tictactoe',false));
 }
}));

test('Mage history owns round playback, pause/resume and return to live',{timeout:45000},async()=>fixture(async page=>{
 page.setDefaultTimeout(6000);
 await page.evaluate(()=>{
  const E=TabletopCore,s=new TabletopSession(E,'mage-brawl',{seed:17,mode:'solo',actionsPerTurn:'1',players:[{name:'Иван'},{name:'Тео'}]});
  for(let i=0;i<60&&s.current.data.round<4&&s.current.status==='playing';i++){
   const window=E.decisionWindow(s.current),actor=window?.participants.find(p=>!window.ready.includes(p))??s.current.turn,actions=E.legalActions(s.current,actor);
   s.act(actor,actions.find(a=>a.type==='plan'&&a.action==='movement'&&a.element==='earth')||actions.find(a=>a.type==='plan'&&a.action==='movement')||actions[0]);
  }
  if(s.current.data.round<3)throw Error('Fixture must contain several completed rounds');
  window.testRounds=s.current.timeline.roundStarts;
  const library=new PlayroomLibrary(()=>localStorage,E,TabletopSession,PlayroomPacks);library.activate(s,'mage-history-test');
  sessionStorage.setItem('playroom.navigation.v1',JSON.stringify({screen:'table',sessionId:'mage-history-test'}));
 });
 await page.reload();await page.evaluate(()=>PlayroomAppBridge.showSessions());await page.locator('[data-resume-id=mage-history-test]').first().click();await page.locator('.mage-grid').first().waitFor();
 await page.locator('[data-command="history"]').click();
 const slider=page.locator('#replay-range');await slider.waitFor();
 assert.equal(await page.locator('.is-public-playback').count(),0,'Opening history is static');
 await page.locator('[data-command="replay-round-prev"]').click();
 const previous=await slider.inputValue();await page.waitForTimeout(400);assert.equal(await slider.inputValue(),previous);assert.equal(await page.locator('.is-public-playback').count(),0);
 await page.locator('[data-command="replay-round-next"]').click();assert(Number(await slider.inputValue())>Number(previous));
 await page.locator('[data-command="replay-play"]').click();
 await page.locator('.is-public-playback [data-public-frame="1"]:not([hidden])').waitFor();
 assert.match(await page.locator('.turn-extra').innerText(),/Раунд 1/);
 await page.locator('[data-command="replay-play"]').click();
 const paused=await page.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),revision=await slider.inputValue();
 await page.waitForTimeout(1000);assert.equal(await page.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),paused);assert.equal(await slider.inputValue(),revision);
 await page.locator('[data-command="replay-play"]').click();
 await page.waitForFunction(before=>document.querySelector('[data-public-frame]:not([hidden])')?.dataset.publicFrame!==before,paused);
 assert.equal(await slider.inputValue(),revision,'Revision waits for the whole round presentation');
 await page.locator('[data-command="history-close"]').click();
 assert.equal(await page.locator('.history-panel,.is-public-playback').count(),0);
 const live=await page.locator('.mage-grid').last().innerHTML();await page.waitForTimeout(1100);
 assert.equal(await page.locator('.history-panel,.is-public-playback').count(),0);assert.equal(await page.locator('.mage-grid').last().innerHTML(),live,'No late history frame changes the live board');
 await page.evaluate(()=>{
  PlayroomAppBridge.showHub();const library=new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks),s=library.open('mage-history-test');
  window.historyAuthority=new SessionAuthority(s);const channel=historyAuthority.connect(0);
  const client={snapshot:channel.snapshot(),pending:null,subscribe:()=>()=>{},history:async index=>channel.history(index),send:async()=>({ok:true})};
  window.sharedHistory=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('mage-brawl'));sharedHistory.render();
 });
 await page.evaluate(()=>sharedHistory.openHistory(0));await page.locator('[data-command="replay-play"]').click();
 await page.locator('.is-public-playback [data-public-frame="1"]:not([hidden])').waitFor();
 await page.locator('[data-command="replay-play"]').click();
 const networkFrame=await page.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame');
 await page.waitForTimeout(900);assert.equal(await page.locator('[data-public-frame]:not([hidden])').getAttribute('data-public-frame'),networkFrame);
 await page.locator('[data-command="replay-play"]').click();
 await page.waitForFunction(before=>document.querySelector('[data-public-frame]:not([hidden])')?.dataset.publicFrame!==before,networkFrame);
 await page.locator('[data-command="history-close"]').click();await page.waitForTimeout(700);
 assert.equal(await page.locator('.history-panel,.is-public-playback').count(),0);
 await page.evaluate(()=>{sharedHistory.destroy();historyAuthority.dispose();});

}));


test('bot difficulty choices, individual settings, roster labels and in-game lock',{timeout:45000},async()=>fixture(async page=>{
 await page.setViewportSize({width:390,height:844});await page.locator('[data-start="pexeso"]').click();await page.locator('[data-game-mode=hotseat]').click();
 assert.equal(await page.locator('[data-bots-difficulty]').count(),0,'the lobby has no persistent difficulty toolbar');
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'bot',nickname:'Третий'});b.renderLobby();});
 await page.locator('[data-bot-settings]').first().click();assert.equal(await page.locator('[name=difficulty]').inputValue(),'1');assert.equal(await page.locator('[name=botLevel][value="1"]').isChecked(),true);assert.equal(await page.locator('[name=errorRate]').count(),0);assert.equal(await page.locator('[name=strategy]').count(),0);
 await page.locator('[name=botLevel][value="2"]').check();await page.locator('[form=bot-settings-form]').click();
 assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.room().participants.filter(p=>p.bot).map(p=>p.botSettings?.difficulty||'medium')),['hard','medium']);
 const bots=await page.evaluate(()=>PlayroomAppBridge.room().participants.filter(p=>p.bot).map(p=>p.id));for(const id of bots){await page.locator(`[data-participant-id="${id}"] [data-bot-settings]`).click();await page.locator('[name=botLevel][value="0"]').check();await page.locator('[form=bot-settings-form]').click();}assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.room().participants.filter(p=>p.bot).map(p=>p.botSettings.difficulty)),['easy','easy']);
 await page.screenshot({path:path.join(shots,'bot-difficulty-lobby.png')});
 await page.locator('[data-bot-settings]').first().click();await page.screenshot({path:path.join(shots,'bot-difficulty-settings.png')});await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();
 await page.locator('[data-command=lobby-start]').click();await page.locator('.table-shell').waitFor();assert.equal(await page.locator('.participant-role[data-participant-role=bot]').count(),2);
 const hidden=await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();return PlayroomLobbyView.render({room:r,participantId:r.ownerId,isHost:true}).includes('data-bots-difficulty');});assert.equal(hidden,false);
 assert.equal(await page.locator('.participant-role[data-bot-difficulty=easy]').count(),2);
 const icons=await page.evaluate(()=>['easy','medium','hard'].map(difficulty=>{
  const state=new TabletopSession(TabletopCore,'pexeso',{players:[{name:'Bot',bot:true,botSettings:{difficulty}},{name:'Human'}],seed:3}).current;
  const saved=JSON.parse(JSON.stringify(state));
  const resume=document.createElement('div');resume.innerHTML=PlayroomGameScreen.participantsMarkup(saved);
  const result=document.createElement('div');result.innerHTML=PlayroomGameScreen.resultMarkup({state:{...saved,status:'finished',winner:0},viewer:1,gameName:'Пексесо'});
  return [resume.querySelector('[data-bot-difficulty]')?.dataset.botDifficulty,result.querySelector('[data-bot-difficulty]')?.dataset.botDifficulty,result.querySelector('.result-bot-settings')===null,resume.querySelector('[data-bot-difficulty] svg')?.innerHTML];
 }));
 assert.deepEqual(icons.map(row=>row.slice(0,3)),['easy','medium','hard'].map(level=>[level,level,true]));assert.equal(new Set(icons.map(row=>row[3])).size,3);

await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=room]').click();await page.locator('[data-bot-settings]').first().click();assert.equal(await page.locator('[name=botLevel]').first().isDisabled(),true);assert.equal(await page.locator('[form=bot-settings-form]').count(),0);assert.match(await page.locator('.choice021-reason').innerText(),/до начала партии/);
 },{safeSupabase:true,settings:{sound:false,animationSpeed:'fast',quickPlay:false,autoPass:false,tutorialsEnabled:false}}));


test('fresh learning is offered before the first action and keeps the table usable', {timeout:60000},async()=>fixture(async page=>{
 page.setDefaultTimeout(5000);await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const G=PlayroomFirstTurnGuide,update=G.update;G.update=context=>{window.freshGuideContext=context;return update(context);};});
 await page.locator('[data-start="tictactoe"]').click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();
 const intro=page.locator('#modal-root>[data-surface-state=active] .learning-intro');
 await intro.waitFor();
 await page.evaluate(()=>PlayroomFirstTurnGuide.update({...window.freshGuideContext}));
 assert.equal(await page.locator('.tic-cell:not(:empty)').count(),0,'offer precedes any player move');
 await intro.locator('[data-learning-choice=yes]').click();
 const caption=page.locator('.first-turn-guide:not([hidden]) .guide-caption');await caption.waitFor();
 for(let turn=0;turn<2;turn++){
  const cell=page.locator('[data-action]:not([disabled])').first();await cell.waitFor();await cell.click();
  await page.waitForFunction(()=>!!document.querySelector('[data-action]:not([disabled])')&&!document.querySelector('#app').inert);
  assert.equal(await page.locator('#modal-root .learning-intro').count(),0,'offer is not repeated');
 }
},{learningPrompted:false,safeSupabase:true,settings:{sound:false,animationSpeed:'fast',quickPlay:false,autoPass:false}}));

for(const game of ['uno','durak','gofish','oldmaid','domino','ludo','snakes','battleship','checkers','tictactoe','pexeso','yatzy','klondike','spider','mage-brawl'])test('fresh first decision offers learning before input: '+game,{timeout:30000},async()=>fixture(async page=>{
 page.setDefaultTimeout(6000);await page.setViewportSize({width:844,height:390});
 await page.evaluate(()=>{const G=PlayroomFirstTurnGuide,update=G.update,commit=G.committed;window.freshHumanCommands=0;G.update=c=>{window.freshGuideContext=c;return update(c);};G.committed=(owner,viewer,...args)=>{if(!freshGuideContext?.state.players[viewer]?.bot)freshHumanCommands++;return commit(owner,viewer,...args);};});
 await page.locator('[data-start="'+game+'"]').click();await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();
 const intro=page.locator('#modal-root>[data-surface-state=active] .learning-intro');await intro.waitFor();
 assert.equal(await page.evaluate(()=>freshHumanCommands),0,'offer precedes the first human command, including simultaneous setup');
 await page.evaluate(()=>{const c=freshGuideContext;PlayroomFirstTurnGuide.update({...c});PlayroomFirstTurnGuide.update({...c});});
 await intro.locator('[data-learning-choice=yes]').click();
 const hint=page.locator('.first-turn-guide:not([hidden]) .guide-caption');await hint.waitFor();
 const target=await page.evaluate(()=>{const c=freshGuideContext,g=PlayroomViews.get(c.state.game).tutorial({...c,guideProgress:{seen:[]}});return {steps:g.steps.filter(s=>s.available!==false).map(s=>s.selector),blocked:document.querySelector('#app').inert,move:c.state.move};});
 assert.equal(target.blocked,false);assert.equal(await page.evaluate(()=>freshHumanCommands),0);assert(target.steps.some(selector=>selector),'a real actionable guide is available');
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{const n=document.querySelector('.first-turn-guide:not([hidden]) .guide-caption');if(!n)return false;const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;},null,{timeout:6000});
},{learningPrompted:false,safeSupabase:true,settings:{sound:false,animationSpeed:'normal',quickPlay:false,autoPass:false}}));

test('learning reset is confirmed, enables learning and resets only the current pack',async()=>fixture(async page=>{
 page.setDefaultTimeout(7000);await page.setViewportSize({width:390,height:844});
 const active=()=>page.locator('#modal-root>[data-surface-state=active]');
 await page.locator('[data-start="tictactoe"]').click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.table-shell').waitFor();
 await page.evaluate(()=>PlayroomTutorialSettings.offer('tictactoe',()=>true));await active().locator('.learning-intro').waitFor();
 await page.evaluate(()=>PlayroomAppBridge.showSettings({inGame:true,category:'behavior'}));await active().locator('[data-settings-screen]').waitFor();await page.keyboard.press('Escape');
 const childEscapePrompted=await page.evaluate(()=>PlayroomFirstTurnGuide.settings('tictactoe').prompted);
 await active().locator('.learning-intro').waitFor();await active().locator('.modal-head [data-command=close-modal]').click();
 await page.evaluate(()=>{const G=PlayroomFirstTurnGuide;G.setEnabled('tictactoe',false);G.setEnabled('oldmaid',false);});
 await page.locator('[data-game-menu]').click();await active().locator('[data-command=settings]').click();await active().locator('[data-settings-tab=behavior]').click();
 const box=()=>active().locator('#setting-learning-enabled');assert.equal(await box().isChecked(),false);
 await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-cancel]').click();assert.equal(await box().isChecked(),false);
 await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-accept]').click();assert.equal(await box().isChecked(),true);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('oldmaid').enabled),false);
 await page.evaluate(()=>{window.learningScreen=PlayroomGameScreen;PlayroomGameScreen={...learningScreen,confirmDialog:async(...args)=>{const result=await learningScreen.confirmDialog(...args),hold=window.learningResetHold;if(hold){hold.decided=true;await hold.promise;}return result;}};});
 const beginHeld=async()=>{await box().uncheck();await page.evaluate(()=>{window.learningOrigin=document.querySelector('#modal-root>[data-surface-state=active] #setting-learning-enabled');let release;const promise=new Promise(resolve=>{release=resolve;});window.learningResetHold={promise,release,decided:false};});await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-accept]').click();await page.waitForFunction(()=>window.learningResetHold.decided);};
 await beginHeld();await page.evaluate(()=>PlayroomAppBridge.showSettings({inGame:true,category:'behavior'}));
 assert.equal(await box().evaluate(e=>e===window.learningOrigin),false,'replacement settings have a new native input');
 await page.evaluate(()=>{window.learningResetHold.release();window.learningResetHold=null;});await page.evaluate(()=>new Promise(requestAnimationFrame));
 const replacement=await page.evaluate(()=>({checked:document.querySelector('#modal-root>[data-surface-state=active] #setting-learning-enabled').checked,enabled:PlayroomFirstTurnGuide.settings('tictactoe').enabled}));
 await beginHeld();await page.evaluate(()=>{const B=PlayroomAppBridge,back=B.captureModalReturn();B.openModal(B.modalHead('Другой экран')+'<p>Сброс ещё ожидает завершения.</p>','learning-test-child',{onBack:back});});
 await page.evaluate(()=>{window.learningResetHold.release();window.learningResetHold=null;});await page.evaluate(()=>new Promise(requestAnimationFrame));
 const suspended=await page.evaluate(()=>({checked:window.learningOrigin.checked,enabled:PlayroomFirstTurnGuide.settings('tictactoe').enabled,child:!!document.querySelector('#modal-root>[data-surface-state=active] .learning-test-child')}));
 await active().locator('.modal-head [data-command=close-modal]').click();assert.equal(await box().evaluate(e=>e===window.learningOrigin),true,'Back retains the original native settings input');
 await page.evaluate(()=>{PlayroomGameScreen=window.learningScreen;});
 assert.deepEqual({childEscapePrompted,replacement,suspended},{childEscapePrompted:false,replacement:{checked:false,enabled:false},suspended:{checked:false,enabled:false,child:true}},'child dismissal and late accepted resets preserve their original surface owner');
 assert.equal(await page.locator('#sound-preview').count(),0);await page.screenshot({path:path.join(shots,'learning-settings-390.png')});
},{safeSupabase:true,learningPrompted:false,settings:{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false,tutorialsEnabled:false}}));

test('Battleship guide follows alternate setup choices and waits 500ms after input',{timeout:30000},async()=>fixture(async page=>{
 page.setDefaultTimeout(5000);await page.setViewportSize({width:390,height:844});
 await page.locator('[data-start=battleship]').click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();
 const caption=page.locator('.first-turn-guide:not([hidden]) .guide-caption');await caption.waitFor();
 await page.locator('.battle-panel [data-select="new:3"]').click();
 assert.equal(await caption.count(),0,'hide immediately while user acts');
 await page.waitForTimeout(350);assert.equal(await caption.count(),0,'do not interrupt activity before half a second');await caption.waitFor();assert.match(await caption.innerText(),/свободную клетку/);
 await page.locator('.battle-grid [data-action]').first().click();await caption.waitFor();assert.match(await caption.innerText(),/выставленный корабль/);
 await page.locator('.battle-grid [data-select="ship:0"]').first().click();await caption.waitFor();assert.match(await caption.innerText(),/поворачивает/);
 // Ignore rotation: move instead; the next hint must follow the real board state.
 await page.locator('.battle-grid [data-action]').last().click();await caption.waitFor();
 await page.locator('[data-guide-step=remove]').click();await caption.waitFor();assert.doesNotMatch(await caption.innerText(),/выбранный корабль в запас/);
 await page.locator('.battle-panel [data-select="new:2"]').click();await page.locator('[data-guide-step=rotate]').click();await page.waitForTimeout(650);assert.equal(await caption.count(),0,'completed placement and rotation are not taught again');
 await page.screenshot({path:path.join(shots,'battleship-adaptive-guide.png')});
 await page.locator('[data-action]').filter({hasText:'Расставить флот'}).click();
 await page.locator('[data-action]').filter({hasText:'Готов'}).click();
 await caption.waitFor();assert.match(await caption.innerText(),/своё поле/);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('battleship').mastered.own),undefined,'automatic own view during setup does not teach a manual switch');
 await page.locator('[data-view-key="fleet"][data-view-value="own"]').click();await caption.waitFor();assert.match(await caption.innerText(),/поле соперника/);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('battleship').mastered.own),1);
 await page.locator('[data-view-key="fleet"][data-view-value="enemy"]').click();await caption.waitFor();assert.match(await caption.innerText(),/кнопку с глазом/);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('battleship').mastered.enemy),2);
 await page.locator('[data-view-preference="followOpponent"]').click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('battleship').mastered.follow),1);
 const beforeFire=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
 await page.locator('.battle-grid [data-action*="fire"]').first().click();
 await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move>move,beforeFire);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('battleship').mastered.fire),1,'native legal shot commits the fire goal');
 assert.deepEqual(await page.evaluate(()=>PlayroomViews.get('battleship').tutorial.goals.filter(g=>PlayroomFirstTurnGuide.settings('battleship').mastered[g.id]!==g.revision).map(g=>g.id)),[]);

}));

test('semantic guides preserve rare goals across turns and classify commands before delayed acknowledgement',async()=>fixture(async page=>{
 const result=await page.evaluate(()=>{
  const G=PlayroomFirstTurnGuide,out={};
  const make=game=>{const owner={},state={game,status:'playing',move:0,turn:0,players:[{},{}],scene:{},events:[]};return {owner,state,viewer:0,actions:[{type:'placeholder'}],ui:{},active:true};};
  const apply=(ctx,action)=>{G.update(ctx);const token=G.capture(ctx.owner,0);G.committed(ctx.owner,0,action,token);return [...token.progress.seen];};
  const p=make('pexeso');p.state.scene.selectionCount=0;G.update(p);const first=G.capture(p.owner,0);
  p.state={...p.state,move:1,scene:{selectionCount:1}};G.update(p);G.committed(p.owner,0,{type:'flip',index:7},first);out.first=[...first.progress.seen];
  out.second=apply(p,{type:'flip',index:3});
  const l=make('ludo');l.state.scene={moves:[]};out.roll=apply(l,{type:'roll'});
  G.update({...l,state:{...l.state,move:2,turn:1}});l.state={...l.state,move:3,scene:{dice:[{value:6}],moves:[{from:-1,command:{owner:0,pawn:2,dieIndex:0}}]}};
  out.exit=apply(l,{type:'move',owner:0,pawn:2,dieIndex:0});l.state.scene.dice=[{value:3}];out.guaranteedExit=apply(l,{type:'move',owner:0,pawn:2,dieIndex:0});
  l.state={...l.state,move:4,scene:{moves:[{from:5,command:{owner:0,pawn:1,dieIndex:0}}]}};out.move=apply(l,{type:'move',owner:0,pawn:1,dieIndex:0});
  l.state={...l.state,preset:'teams',scene:{moves:[],pawns:[{owner:0,progress:56}]}};out.notHome=apply(l,{type:'roll'});
  l.state.scene.pawns=Array.from({length:4},()=>({owner:0,progress:57}));out.teamRoll=apply(l,{type:'roll'});
  l.state.scene.moves=[{from:5,command:{owner:2,pawn:1,dieIndex:0}}];out.teamMove=apply(l,{type:'move',owner:2,pawn:1,dieIndex:0});

  const u=make('uno');u.state.scene={manualDeclaration:true};out.ordinary=apply(u,{type:'play',card:'u1'});out.color=apply(u,{type:'play',card:'u101',color:'red'});out.draw=apply(u,{type:'draw'});out.pass=apply(u,{type:'pass'});
  const n=make('snakes');n.state.preset='plus';n.state.scene={adjusting:false};out.snakes=apply(n,{type:'roll'});
  n.state={...n.state,move:3,events:[{type:'snakes.extra',player:0,params:{reason:'double'}}]};out.double=apply(n,{type:'roll'});
  n.state={...n.state,move:4,scene:{adjusting:true}};out.noAdjust=apply(n,{type:'move',delta:0});out.adjust=apply(n,{type:'move',delta:1});
  const c=make('checkers');c.state.scene={pieces:[{cell:9,king:true}],forced:null};c.actions=[{type:'move',from:9,to:36,capture:false}];out.king=apply(c,{type:'move',from:9,to:36});
  const m=make('mage-brawl');m.state.scene={arena:{phase:'planning',config:{steps:2},players:[{draft:null}]}};out.mageFirst=apply(m,{type:'plan',action:'movement'});
  m.state={...m.state,move:1,scene:{arena:{phase:'planning',config:{steps:2},players:[{draft:{cardId:'first'}}]}}};out.mageSecond=apply(m,{type:'plan',action:'attack'});
  m.state.scene.arena.phase='respawn';out.base=apply(m,{type:'respawn',pos:[0,0]});m.state.scene.arena.phase='loot';out.loot=apply(m,{type:'loot'});
  m.state.scene.arena.phase='planning';out.ultimate=apply(m,{type:'plan',action:'ultimate'});
  // Restart invalidates a command from the previous tutorial run.
  G.update(m);const stale=G.capture(m.owner,0);G.restart('mage-brawl');G.committed(m.owner,0,{type:'plan',action:'ultimate'},stale);out.restart=[...G.capture(m.owner,0).progress.seen];
  G.stop();return out;
 });
 assert.deepEqual(result.first,['first']);assert.deepEqual(result.second,['first','second']);
 assert.deepEqual(result.roll,['roll']);assert.deepEqual(result.exit,['roll','exit']);assert.deepEqual(result.guaranteedExit,['roll','exit','exit-guaranteed']);assert(result.move.includes('pawn')&&result.move.includes('destination'));assert(!result.notHome.includes('team-roll'));assert(result.teamRoll.includes('team-roll')&&!result.teamRoll.includes('team-move'));assert(result.teamMove.includes('team-move'));
 assert(!result.ordinary.includes('color'));assert(result.color.includes('color'));assert(result.draw.includes('draw')&&!result.draw.includes('pass'));assert(result.pass.includes('pass'));
 assert(!result.snakes.includes('double'));assert(result.double.includes('double'));assert(!result.noAdjust.includes('adjust'));assert(result.adjust.includes('adjust'));
 assert(result.king.includes('king')&&result.king.includes('king-move'));assert(result.mageFirst.includes('card')&&!result.mageFirst.includes('card-second'));assert(result.mageSecond.includes('card-second')&&result.mageSecond.includes('ready-second'));
 assert(result.base.includes('base'));assert(result.loot.includes('loot-card'));assert(result.ultimate.includes('ultimate'));assert.deepEqual(result.restart,[]);
}));

test('hint and card help clicks teach separate persistent goals',{timeout:150000},async()=>fixture(async page=>{
 if(process.env.PLAYROOM_MARKUP_COUNTERS){
  page.setDefaultTimeout(8000);await page.setViewportSize({width:390,height:844});const out=path.resolve(root,'../tmp_files/ux-021/targeted-render-1103/markup'),engine=page.context().browser().browserType().name(),report={browserType:engine,browserVersion:page.context().browser().version(),steps:[]};fs.mkdirSync(out,{recursive:true});
  await page.evaluate(()=>{
   const counts=window.markupCounts={render:0,project:0,directRenderProject:0,register:0,export:0,style:0},render=PlayroomViews.render,project=TabletopCore.project,register=PlayroomViews.register,exportSession=TabletopSession.prototype.export;
   PlayroomViews.render=function(...args){counts.render++;return render.apply(this,args);};PlayroomViews.register=function(...args){counts.register++;return register.apply(this,args);};TabletopSession.prototype.export=function(...args){counts.export++;return exportSession.apply(this,args);};
   TabletopCore.project=function(...args){counts.project++;const stack=Error().stack;if(stack.includes('renderTable')&&!stack.includes('localFrame')&&!stack.includes('activeActions')&&!stack.includes('snapshot'))counts.directRenderProject++;return project.apply(this,args);};
   window.markupStyleObserver=new MutationObserver(rows=>{counts.style+=rows.filter(row=>row.target.closest?.('style[data-playroom-pack]')||[...row.addedNodes,...row.removedNodes].some(n=>n.matches?.('style[data-playroom-pack]'))).length;});markupStyleObserver.observe(document.head,{subtree:true,childList:true,characterData:true});
  });
  const counts=()=>page.evaluate(()=>({...markupCounts})),delta=(a,b)=>Object.fromEntries(Object.keys(b).map(key=>[key,b[key]-a[key]])),ready=()=>page.waitForFunction(()=>!!document.querySelector('.table-shell')&&!document.querySelector('.scene[aria-busy=true],.playroom-motion-layer'));
  const start=async game=>{await page.evaluate(async game=>{PlayroomAppBridge.showHub();PlayroomFirstTurnGuide.setEnabled(game,false);const s=new TabletopSession(TabletopCore,game,{seed:17,mode:'pass',openHands:true,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:TabletopCore.get(game).min},(_,i)=>({name:'Игрок '+i}))});await PlayroomAppBridge.saveLibrary.activateAsync(s,'markup-'+game);PlayroomAppBridge.showSessions();},game);await page.locator('[data-hub-page=sessions]').click();await page.locator('.saved-game[data-session-id=markup-'+game+'][data-saved-actions-toggle]').click();await page.locator('[data-resume-id=markup-'+game+']').click();await ready();};
  try{
   const seedBefore=await counts();await start('spider');const seed=delta(seedBefore,await counts());report.seed=seed;
   let card=null;for(let i=0;i<4&&!card;i++){card=await page.evaluate(()=>{const state=PlayroomAppBridge.saveLibrary.current().session.current,actions=TabletopCore.legalActions(state,0);return [...document.querySelectorAll('.solitaire-column>.solitaire-card-position:last-child [data-drag-piece]')].find(n=>actions.filter(a=>a.type==='move'&&a.card===n.dataset.dragPiece).length>1)?.dataset.dragPiece;});if(!card){await page.locator('.solitaire-draw-control').click();await ready();}}
   assert(card,'a real exposed source with multiple destinations exists');const source=()=>page.locator('[data-drag-piece='+JSON.stringify(card)+']');await source().focus();await source().press('Enter');assert.equal(await source().getAttribute('aria-pressed'),'true');
   const press=async()=>{await source().hover({position:{x:(await source().boundingBox()).width/2,y:8}});const b=await source().boundingBox();await page.mouse.down();await page.mouse.move(b.x+b.width/2+16,b.y+8,{steps:3});await page.locator('html.playroom-dragging').waitFor();},release=async()=>{await page.mouse.move(1,1);await page.mouse.up();await ready();};
   await source().evaluate(n=>window.markupSource=n);let before=await counts();await press();const repeated=delta(before,await counts());repeated.sameNode=await source().evaluate(n=>n===markupSource);report.steps.push({kind:'same-selected-drag-start',...repeated});await release();assert.equal(await source().getAttribute('aria-pressed'),'false','cancelled real drag clears selection');
   await source().focus();await source().press('Enter');before=await counts();await source().press('Enter');const deselect=delta(before,await counts());deselect.pressed=await source().getAttribute('aria-pressed');report.steps.push({kind:'same-card-tap-deselect',...deselect});
   await source().press('Enter');await page.locator('[data-view-key=hint]').click();before=await counts();await press();const clearHint=delta(before,await counts());clearHint.hint=await page.locator('.solitaire-hint-popup').count();report.steps.push({kind:'same-selection-clears-hint',...clearHint});await release();
   await start('mage-brawl');const action=()=>page.locator('[data-view-key=mageAction][data-view-value=attack]');await action().click();before=await counts();await action().click();const repeatChoice=delta(before,await counts());report.steps.push({kind:'repeat-view-key',...repeatChoice,pressed:await action().getAttribute('aria-pressed')});
   await page.screenshot({path:path.join(out,'repeat-controls-'+engine+'.png')});
   assert.equal(repeated.render,0,'unchanged selected source must not recompute full scene');assert(repeated.sameNode!==false);assert.equal(repeatChoice.render,0,'same authored view-key must not recompute full scene');assert(deselect.render>0&&deselect.pressed==='false','real same-card deselection remains meaningful');assert(clearHint.render>0&&clearHint.hint===0,'clearViewHints remains meaningful');assert.equal(repeated.style+repeatChoice.style,0,'repeat inputs do not invalidate pack styles');assert.equal(seed.directRenderProject,0,'current same-viewer projection seeds feedback without a second projection');
  }finally{fs.writeFileSync(path.join(out,'counters-'+engine+'.json'),JSON.stringify(report,null,2));}
  return;
 }
 if(process.env.PLAYROOM_SOLITAIRE_TUTORIALS){
  page.setDefaultTimeout(8000);await page.setViewportSize({width:390,height:844});
  const engine=process.env.PLAYROOM_TEST_BROWSER||'chromium',out=path.resolve(root,'../tmp_files/ux-021/current-game-checks-1103/solitaire-tutorials'),report=[];fs.mkdirSync(out,{recursive:true});
  const active=()=>page.locator('#modal-root>[data-surface-state=active]'),progress=game=>page.evaluate(g=>PlayroomFirstTurnGuide.settings(g),game);
  const settings=async()=>{await page.evaluate(()=>PlayroomAppBridge.showSettings({inGame:true,category:'behavior'}));await active().locator('#setting-learning-enabled').waitFor();};
  const close=async()=>{await active().locator('.modal-head [data-command=close-modal]').click();};
  const ready=async()=>{await page.locator('.solitaire-board').waitFor();await page.waitForFunction(()=>!document.querySelector('.scene[aria-busy=true],.playroom-motion-layer'));};
  const state=()=>page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,data:s.data,actions:TabletopCore.legalActions(s,0)};});
  const act=async action=>{
   const before=await state();
   if(action.type==='move'){
    const source=await page.evaluate(card=>{for(const old of document.querySelectorAll('[data-guide-source]'))old.removeAttribute('data-guide-source');const n=[...document.querySelectorAll('[data-drag-piece]')].find(n=>n.dataset.dragPiece===String(card));if(!n)return false;n.setAttribute('data-guide-source','');return true;},action.card);assert(source,'legal source exists '+JSON.stringify(action));await page.locator('[data-guide-source]').focus();await page.locator('[data-guide-source]').press('Enter');
    if((await state()).move!==before.move){const committed=await page.evaluate(()=>JSON.parse(PlayroomAppBridge.saveLibrary.current().session.serialize()).actions.at(-1).command);assert(Object.entries(action).every(([k,v])=>k==='label'||committed[k]===v),'single-tap committed requested legal move '+JSON.stringify(committed));await ready();return 'source-tap';}
   }
   const found=await page.evaluate(action=>{for(const n of document.querySelectorAll('[data-guide-command]'))n.removeAttribute('data-guide-command');const n=[...document.querySelectorAll('#app [data-action],#app [data-double-action]')].find(n=>{const a=JSON.parse(action.type==='collect'?n.dataset.doubleAction||'null':n.dataset.action||'null');return a&&Object.entries(action).every(([k,v])=>k==='label'||a[k]===v);});if(!n)return false;n.setAttribute('data-guide-command','');return true;},action);assert(found,'legal command exposed in actual input '+JSON.stringify({action,dom:await page.locator('#app [data-action]').evaluateAll(nodes=>nodes.map(n=>n.dataset.action))}));
   if(action.type==='collect')await page.locator('[data-guide-command]').dblclick();else await page.locator('[data-guide-command]').click();await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move!==move,before.move);await ready();
  };
  try{
  if(process.env.PLAYROOM_SOLITAIRE_OLD_PACK){
   const old=JSON.parse(fs.readFileSync(process.env.PLAYROOM_SOLITAIRE_OLD_PACK,'utf8')),version=await page.evaluate(()=>TabletopCore.get('klondike').version);
   assert.notEqual(version,old.manifest.version);
   const saved=await page.evaluate(async old=>{await PlayroomPacks.install(PlayroomPacks.prepare(old));const s=new TabletopSession(TabletopCore,'klondike',{packVersion:old.manifest.version,seed:17,mode:'solo',players:[{name:'Иван'}]});await PlayroomAppBridge.saveLibrary.activateAsync(s,'guide-v2-compat');return s.serialize();},old);
   fs.writeFileSync(path.join(out,'old-v2-save-'+engine+'.json'),saved);await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
   const cache=await page.evaluate(oldVersion=>({versions:PlayroomPacks.list().filter(x=>x.id==='klondike').map(x=>x.version),active:TabletopCore.get('klondike').version,saved:PlayroomAppBridge.saveLibrary.current().session.packVersion,exported:JSON.parse(PlayroomPacks.exportPack('klondike',oldVersion))}),old.manifest.version);
   assert(cache.versions.includes(version)&&cache.versions.includes(old.manifest.version));assert.equal(cache.active,version);assert.equal(cache.saved,old.manifest.version);assert.deepEqual(cache.exported,old,'old IDB bundle stays byte-equivalent as parsed pack after new builtin bootstrap');
   await page.evaluate(()=>PlayroomAppBridge.showSessions());await page.locator('[data-hub-page=sessions]').click();await page.locator('.saved-game[data-session-id=guide-v2-compat][data-saved-actions-toggle]').click();await page.locator('[data-resume-id=guide-v2-compat]').click();await ready();assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.packVersion),old.manifest.version,'old save opens exact v2');
   report.push({probe:'v2-IDB-to-v3-builtin',versions:cache.versions,active:cache.active,saved:cache.saved,oldBundlePreserved:true,oldSaveOpened:true});await page.evaluate(version=>{PlayroomAppBridge.showHub();PlayroomPacks.activate('klondike',version);},version);
  }
  if(process.env.PLAYROOM_SOLITAIRE_RESET_PROBE){
   const detail={game:'klondike',probe:'hint-quiet-recycle-reset'};report.push(detail);
   await page.evaluate(async()=>{
    const proto=PlayroomTutorialController.prototype,update=proto.update,nodes=new WeakMap();let nodeId=0;window.qaTutorialUpdates=[];proto.update=function(context,definition){const result=update.call(this,context,definition),board=document.querySelector('.solitaire-board'),r=board?.getBoundingClientRect();if(board&&!nodes.has(board))nodes.set(board,++nodeId);qaTutorialUpdates.push({game:context.state.game,move:context.state.move,status:context.state.status,active:context.active,busy:context.busy,viewer:context.viewer,actions:context.actions.length,board:board?{id:nodes.get(board),x:r.x,y:r.y,w:r.width,h:r.height}:null,progress:result?{started:result.progress.started,done:result.progress.done,seen:[...result.progress.seen]}:null});return result;};
    const s=new TabletopSession(TabletopCore,'klondike',{seed:17,mode:'solo',players:[{name:'Иван'}],draw:'1',autoFlip:'manual',autoCollect:'button',undo:'history',maxPasses:'0'});while(s.current.data.stock.length)s.act(0,TabletopCore.legalActions(s.current,0).find(a=>a.type==='draw'));await PlayroomAppBridge.saveLibrary.activateAsync(s,'guide-reset-probe');PlayroomAppBridge.showSessions();
   });await page.locator('[data-hub-page=sessions]').click();await page.locator('.saved-game[data-session-id=guide-reset-probe][data-saved-actions-toggle]').click();await page.locator('[data-resume-id=guide-reset-probe]').click();await ready();
   await page.locator('[data-view-key=hint]').click();assert.equal((await progress('klondike')).mastered.hint,1);await page.keyboard.press('Escape');
   await act((await state()).actions.find(a=>a.type==='recycle'));detail.afterRecycle=await page.evaluate(()=>qaTutorialUpdates.slice(-5));
   await settings();await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-accept]').click();assert.deepEqual((await progress('klondike')).mastered,{});await close();
   await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor({timeout:1800}).catch(()=>{});
   detail.beforeHint=await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),modals:[...document.querySelectorAll('#modal-root>[data-surface-state]')].map(n=>({state:n.dataset.surfaceState,text:n.innerText.slice(0,120)})),updates:qaTutorialUpdates,settings:PlayroomFirstTurnGuide.settings('klondike'),options:PlayroomAppBridge.gameOptions(),pointer:document.querySelector('.first-turn-guide')?.hidden}));
   const busy=detail.beforeHint.updates.find(x=>x.move===25&&x.busy),idle=detail.beforeHint.updates.find(x=>x.move===25&&!x.busy);assert(busy&&idle,'actual tutorial readiness follows quiet completion');assert.deepEqual(idle.board,busy.board,'readiness update retains board DOM and geometry');await page.locator('[data-view-key=hint]').click();detail.afterHint=await progress('klondike');await page.screenshot({path:path.join(out,'reset-probe-'+engine+'.png')});assert.equal(detail.afterHint.mastered.hint,1,'reset must allow a fresh actual hint input');
   await page.keyboard.press('Escape');await page.evaluate(()=>{const proto=PlayroomGameFeedback.prototype,original=proto.whenIdle;proto.whenIdle=function(...args){const result=original.apply(this,args);if(!window.qaHoldQuiet)return result;qaHoldQuiet=false;return Promise.resolve(result).then(()=>new Promise(resolve=>window.qaReleaseQuiet=resolve));};});
   const hold=async()=>{await page.evaluate(()=>{window.qaReleaseQuiet=null;window.qaHoldQuiet=true;});await act((await state()).actions.find(a=>a.type==='undo'));await page.waitForFunction(()=>!!window.qaReleaseQuiet);};
   await hold();await act((await state()).actions.find(a=>a.type==='undo'));await page.waitForFunction(()=>qaTutorialUpdates.at(-1)?.busy===false);const updatesBefore=await page.evaluate(()=>qaTutorialUpdates.length);await page.evaluate(async()=>{qaReleaseQuiet();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});assert.equal(await page.evaluate(()=>qaTutorialUpdates.length),updatesBefore,'older quiet completion does not refresh a newer revision');detail.lateRevisionGuard=true;
   await hold();await page.evaluate(()=>PlayroomAppBridge.showHub());const hubUpdates=await page.evaluate(()=>qaTutorialUpdates.length);await page.evaluate(async()=>{qaReleaseQuiet();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});assert.equal(await page.evaluate(()=>qaTutorialUpdates.length),hubUpdates,'late quiet completion does not revive a navigated game tutorial');assert(await page.locator('.game-grid').isVisible());detail.lateNavigationGuard=true;
   return;
  }
  const selected=process.env.PLAYROOM_SOLITAIRE_GAME?[process.env.PLAYROOM_SOLITAIRE_GAME]:['klondike','spider'];assert(selected.every(game=>['klondike','spider'].includes(game)));for(const game of selected){
   const entry={game,seed:17,steps:[]};report.push(entry);await page.evaluate(async game=>{PlayroomAppBridge.showHub();const s=new TabletopSession(TabletopCore,game,{seed:17,mode:'solo',players:[{name:'Иван'}],draw:'1',maxPasses:'0',autoFlip:'manual',autoCollect:'button',undo:'history',emptyDeal:'allow'});await PlayroomAppBridge.saveLibrary.activateAsync(s,'guide-'+game);PlayroomAppBridge.showSessions();},game);
   await page.locator('[data-hub-page=sessions]').click();await page.locator('.saved-game[data-session-id=guide-'+game+'][data-saved-actions-toggle]').click();await page.locator('[data-resume-id=guide-'+game+']').first().click();await ready();
   await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();entry.initialCaption=await page.locator('.first-turn-guide:not([hidden]) .guide-caption').innerText();assert.equal(await page.locator('.first-turn-guide:not([hidden])').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
   const goals=await page.evaluate(g=>PlayroomViews.get(g).tutorial.goals.map(x=>({id:x.id,revision:x.revision||1})),game);entry.goals=goals;assert.equal(Object.keys((await progress(game)).mastered).length,0,'no test-forced mastery');
   await page.locator('[data-view-key=hint]').click();assert.equal((await progress(game)).mastered.hint,1);await page.keyboard.press('Escape');
   await settings();await active().locator('[data-learning-list]').click();assert.equal(await active().locator('.learning-goals input:checked').count(),1);await close();await close();
   const partial=(await progress(game)).mastered;await page.reload();await ready();assert.deepEqual((await progress(game)).mastered,partial,'partial progress persists on reopen/reload');entry.partial=partial;
   await settings();await active().locator('#setting-learning-enabled').uncheck();await close();const stopped=await progress(game),first=(await state()).actions.find(a=>a.type==='draw');assert(first);await act(first);assert.deepEqual((await progress(game)).mastered,stopped.mastered,'disabled learning never learns legal input');entry.steps.push({action:first,disabled:true,mastered:(await progress(game)).mastered});
   await settings();await active().locator('#setting-learning-enabled').check();await close();
   for(let i=0;i<100;i++){
    const saved=await progress(game);if(goals.every(g=>saved.mastered[g.id]===g.revision))break;
    const s=await state(),missing=id=>goals.some(g=>g.id===id)&&!saved.mastered[id],moves=s.actions.filter(a=>a.type==='move'),exposing=moves.find(a=>a.source==='tableau'&&a.index>0&&!s.data.tableau[a.from][a.index-1].open);
    const action=(missing('flip')&&s.actions.find(a=>a.type==='flip'))||(missing('collect')&&s.actions.find(a=>a.type==='collect'))||((missing('target')||missing('card')||missing('flip'))&&(exposing||moves.find(a=>a.source!=='foundation'))) || (missing('undo')&&s.actions.find(a=>a.type==='undo')) || s.actions.find(a=>a.type==='recycle') || s.actions.find(a=>a.type==='draw');
    if(action?.type==='collect')entry.collectSelector=await page.evaluate(()=>{const step=PlayroomViews.get('klondike').tutorial({state:TabletopCore.project(PlayroomAppBridge.saveLibrary.current().session.current,0)}).steps.find(s=>s.id==='collect');const anchor=document.querySelector(step.selector),r=anchor?.getBoundingClientRect(),hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {selector:step.selector,matches:document.querySelectorAll(step.selector).length,doubleTargets:document.querySelectorAll('[data-double-action]').length,freeField:!!hit&&anchor.contains(hit)&&!hit.closest('button,a,input,select,textarea,[data-select],[data-drag-stack-member],[data-view-key]')};});if(action?.type==='collect')assert(entry.collectSelector.matches>0&&entry.collectSelector.freeField,'legal collect tutorial must anchor to actual free field '+JSON.stringify(entry.collectSelector));
    assert(action,'remaining tutorial goals reachable from legal state '+JSON.stringify({game,mastered:saved.mastered,actions:s.actions}));await act(action);const after=await progress(game);entry.steps.push({action,mastered:after.mastered});
   }
   const completed=await progress(game);entry.completed=completed;assert(goals.every(g=>completed.mastered[g.id]===g.revision),'all declared goals learned through real controls '+JSON.stringify({game,mastered:completed.mastered}));
   await settings();await active().locator('[data-learning-list]').click();assert.equal(await active().locator('.learning-goals input:checked:disabled').count(),goals.length);assert(await active().locator('.learning-complete').isVisible());await page.screenshot({path:path.join(out,game+'-completed-'+engine+'.png')});await close();await close();await settings();await active().locator('[data-learning-list]').click();assert.equal(await active().locator('.learning-goals input:checked:disabled').count(),goals.length,'completed list survives close/reopen');await close();
   const other=game==='klondike'?'spider':'klondike',otherBefore=await progress(other);await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-cancel]').click();assert.deepEqual((await progress(game)).mastered,completed.mastered,'reset Cancel keeps progress');
   await active().locator('[data-restart-guides]').click();await page.locator('[data-confirm-accept]').click();assert.deepEqual((await progress(game)).mastered,{});assert.equal((await progress(game)).enabled,true);assert((await progress(game)).epoch>completed.epoch);assert.deepEqual(await progress(other),otherBefore,'reset is scoped to this game');entry.reset=await progress(game);await close();await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();
   await page.locator('[data-view-key=hint]').click();assert.equal((await progress(game)).mastered.hint,1,'new run learns real input after reset');await page.keyboard.press('Escape');await page.reload();await ready();assert.deepEqual((await progress(game)).mastered,{hint:1},'reset run survives app reopen');entry.reopened=await progress(game);await page.evaluate(()=>PlayroomAppBridge.showHub());
  }}finally{fs.writeFileSync(path.join(out,(process.env.PLAYROOM_SOLITAIRE_RESET_PROBE?'reset-probe':process.env.PLAYROOM_SOLITAIRE_GAME||'tutorials')+'-'+engine+'.json'),JSON.stringify({report},null,2));}
  return;
 }

 for(const game of ['klondike','spider','uno','mage-brawl']){
  const hint=['klondike','spider'].includes(game),goal=hint?'hint':'help';
  await page.locator(`[data-start="${game}"]`).first().click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  await page.locator('[data-command=lobby-start]').click();
  assert.equal(await page.evaluate(({game,goal})=>PlayroomFirstTurnGuide.settings(game).mastered[goal],{game,goal}),undefined);
  await page.locator(hint?'[data-view-key="hint"]':'[data-command="card-help"]').click();
  assert.equal(await page.evaluate(({game,goal})=>PlayroomFirstTurnGuide.settings(game).mastered[goal],{game,goal}),1);
  if(!hint)await page.locator('#modal-root [data-command="close-modal"]').first().click();
  await page.locator('#app [data-command="settings"]').click();await page.locator(`[data-learning-list="${game}"]`).click();
  assert.equal(await page.locator('.learning-goals li').filter({hasText:hint?'кнопку подсказки':'Откройте справку'}).locator('input:checked:disabled').count(),1);
  await page.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showHub();});
 }
},{safeSupabase:!!(process.env.PLAYROOM_SOLITAIRE_TUTORIALS||process.env.PLAYROOM_MARKUP_COUNTERS),settings:(process.env.PLAYROOM_SOLITAIRE_TUTORIALS||process.env.PLAYROOM_MARKUP_COUNTERS)?{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false,tutorialsEnabled:true}:{sound:false,animationSpeed:'fast',quickPlay:false,autoPass:false}}));

test('Go Fish tutorial selects a card before any opponent and accepts changing that card',async()=>fixture(async page=>{
 await page.locator('[data-start="gofish"]').first().click();await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
 await page.locator('[data-command="lobby-start"]').click();
 const caption=page.locator('.first-turn-guide:not([hidden]) .guide-caption');
 await caption.filter({hasText:'карту'}).waitFor();assert.doesNotMatch(await caption.innerText(),/соперника/);
 await page.locator('.own-hand .hand-card.is-playable').first().click();
 await caption.filter({hasText:'соперника'}).waitFor();
 await page.locator('.own-hand .hand-card.is-playable').last().click();
 await caption.filter({hasText:'соперника'}).waitFor();
 await page.screenshot({path:path.join(shots,'guide-gofish-card-before-opponent.png')});
 await page.evaluate(()=>{window.retainedHand=[...document.querySelectorAll('.own-hand [data-entity]')].map(node=>({id:node.dataset.entity,node,art:node.querySelector('svg')}));window.retainedHandScope=document.querySelector('.table-shell')?.dataset.geometryIdentity;});
 await page.locator('[data-player-target]').first().click();
 await page.locator('.table-shell>.scene[aria-busy="false"]').waitFor();
 const retained=await page.evaluate(()=>{const current=[...document.querySelectorAll('.own-hand [data-entity]')],kept=retainedHand.flatMap(old=>{const node=current.find(node=>node.dataset.entity===old.id);return node?[{node:node===old.node,art:node.querySelector('svg')===old.art}]:[]});return {before:retainedHand.length,kept,sameScope:retainedHandScope===document.querySelector('.table-shell')?.dataset.geometryIdentity};});assert(retained.kept.length>0&&retained.kept.every(item=>item.node&&item.art),JSON.stringify(retained));
 await page.locator('[data-game-menu]').click();await page.locator('#modal-root>[data-surface-state=active] [data-command=settings]').click();await page.locator('#modal-root>[data-surface-state=active] [data-settings-tab=behavior]').click();await page.locator('[data-learning-list="gofish"]').click();
 assert.equal(await page.locator('.learning-goals input').count(),2);
 assert.equal(await page.locator('.learning-goals input:checked').count(),2);
 assert.match(await page.locator('.learning-complete').innerText(),/Все действия освоены/);

},{settings:{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false}}));

test('first own turn asks once per pack and user progress survives reload and a new match',async()=>fixture(async page=>{
 assert.deepEqual(await page.evaluate(()=>{
  const c=new PlayroomTutorialController(),context={viewer:0,state:{status:'playing',turn:1,players:[{},{}]},actions:[{type:'move'}]},guide={steps:[]};
  return [c.canOffer(context,guide),c.canOffer({...context,state:{...context.state,turn:0}},guide),c.canOffer(context,{...guide,concurrent:true}),c.canOffer({...context,actions:[]},{...guide,concurrent:true}),c.canOffer({...context,busy:true},{...guide,concurrent:true}),c.canOffer({...context,replay:true},{...guide,concurrent:true}),c.canOffer({...context,active:false},{...guide,concurrent:true})];
 }),[false,true,true,false,false,false,false]);
 await page.setViewportSize({width:390,height:844});await page.locator('[data-start=tictactoe]').click();assert.equal(await page.locator('.learning-intro').count(),0);
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();await page.locator('.learning-intro .modal-foot').waitFor();await page.screenshot({path:path.join(shots,'learning-intro-390.png')});await page.locator('[data-learning-choice=yes]').click();await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();
 await page.locator('#app [data-command="settings"]').click();await page.locator('[data-learning-list="tictactoe"]').click();
 assert.equal(await page.locator('.learning-goals input:disabled:not(:checked)').count(),1);
 assert.equal(await page.locator('.learning-complete').count(),0);
 await page.locator('#modal-root [data-command="close-modal"]').click();await page.locator('#modal-root [data-command="close-modal"]').click();
 await page.locator('.ttt-cell[data-action]').first().click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('tictactoe').mastered.cell),1);
 await page.locator('#app [data-command="settings"]').click();await page.locator('[data-learning-list="tictactoe"]').click();
 assert.equal(await page.locator('.learning-goals input:checked:disabled').count(),1);
 assert.match(await page.locator('.learning-complete').innerText(),/Все действия освоены/);
 await page.screenshot({path:path.join(shots,'learning-list-complete.png')});

 await page.reload();assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('tictactoe').mastered.cell),1);
 await page.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showHub();});
 await page.locator('[data-start=tictactoe]').click();await page.locator('[data-command=lobby-start]').waitFor();assert.equal(await page.locator('.learning-intro').count(),0);
 await page.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showHub();});
 await page.locator('[data-start=oldmaid]').click();assert.equal(await page.locator('.learning-intro').count(),0);await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('[data-learning-choice=no]').click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('oldmaid').enabled),false);
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('tictactoe').enabled),true);
},{settings:{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false},learningPrompted:false}));

test('UNO declaration guidance bypasses the normal input idle delay',async()=>fixture(async page=>{
 await scene(page,'uno');
 await page.evaluate(()=>{
  const button=document.createElement('button');button.dataset.action=JSON.stringify({type:'declare-uno'});button.textContent='UNO';button.style='position:fixed;left:150px;top:150px;width:80px;height:50px;z-index:2';document.querySelector('.table-shell').append(button);
  PlayroomFirstTurnGuide.update({owner:{},viewer:0,active:true,state:{game:'uno',status:'playing',turn:1,move:1,players:[{},{}],scene:{declarationOpen:[true,false],declared:[false,false]}},actions:[{type:'declare-uno'}],ui:{}});
 });
 await page.locator('.first-turn-guide:not([hidden]) .guide-caption').filter({hasText:'Объявите'}).waitFor({timeout:300});
}));

test('UNO real projected declaration is guided during feedback and learned on click',async()=>fixture(async page=>{
 await scene(page,'uno',{unoMode:'manual'});
 await page.evaluate(()=>{
  rcStateOverride=structuredClone(rcSession.current);const s=rcStateOverride,d=s.data;
  d.drawPile.push(...d.hands[0].splice(1));s.turn=1;
  d.uno.situations[0]={episode:0,open:true,settled:false,called:false};d.uno.declared[0]=false;
  TabletopCore.validateState(s);rcRender();
  const ctx={owner:rcSession,viewer:0,active:true,busy:true,state:TabletopCore.project(s,0),actions:TabletopCore.legalActions(s,0),ui:{}};
  PlayroomFirstTurnGuide.update(ctx);
  window.unoProbe={goals:PlayroomViews.get('uno')?.tutorial?.goals,initialTutorial:!!PlayroomViews.get('uno')?.tutorial,initialDeclared:ctx.state.scene.declared[0]};window.unoProbeNode=document.querySelector('.uno-call');
  unoProbeNode.addEventListener('click',event=>{
   unoProbe.clicked=true;unoProbe.trusted=event.isTrusted;
   event.preventDefault();event.stopImmediatePropagation();
   const action=JSON.parse(event.currentTarget.dataset.action),token=PlayroomFirstTurnGuide.capture(rcSession,0);
   unoProbe.token=!!token;unoProbe.progressBefore=token?{...token.progress,seen:[...token.progress.seen]}:null;
   rcStateOverride=TabletopCore.applyAction(rcStateOverride,0,action);unoProbe.domainDeclared=TabletopCore.project(rcStateOverride,0).scene.declared[0];
   PlayroomFirstTurnGuide.committed(rcSession,0,action,token);
  });
 });
 await page.locator('.first-turn-guide:not([hidden]) .guide-caption').filter({hasText:'Объявите'}).waitFor({timeout:400});
 await page.evaluate(()=>{unoProbe.listenerNodeStillCurrent=unoProbeNode===document.querySelector('.uno-call');unoProbe.beforeClickTutorial=!!PlayroomViews.get('uno')?.tutorial;});
 await page.locator('.uno-call').click();
 console.log('UNO tutorial probe',JSON.stringify(await page.evaluate(()=>({...unoProbe,afterTutorial:!!PlayroomViews.get('uno')?.tutorial,learned:PlayroomFirstTurnGuide.settings('uno').mastered}))));
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('uno').mastered['declare-uno']),1);
 await page.reload();await page.locator('.game-tile').first().waitFor();
 await page.locator('[data-start=uno]').first().click();await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();
 assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('uno').mastered['declare-uno']),1,'native declaration learning survives real app reopen for primary profile/viewer');
}));


const solitaireLearningCase=defaults=>async()=>fixture(async page=>{
 page.setDefaultTimeout(7000);await page.setViewportSize({width:390,height:844});
 const caption=page.locator('.first-turn-guide:not([hidden]) .guide-caption');
 const mastered=game=>page.evaluate(game=>PlayroomFirstTurnGuide.settings(game).mastered,game);
 const showGoal=async(game,id)=>{const text=await page.evaluate(({game,id})=>PlayroomViews.get(game).tutorial.goals.find(goal=>goal.id===id).text,{game,id});try{await caption.filter({hasText:text}).waitFor();}catch(error){const debug=await page.evaluate(()=>({caption:document.querySelector('.first-turn-guide')?.textContent,hidden:document.querySelector('.first-turn-guide')?.hidden,modal:document.querySelector('#modal-root')?.innerText,selected:[...document.querySelectorAll('.solitaire-card[aria-pressed=true]')].map(n=>n.dataset.select),targets:[...document.querySelectorAll('[data-drop-piece][data-action]')].slice(0,12).map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {piece:n.dataset.dropPiece,tag:n.tagName,box:{x:r.x,y:r.y,width:r.width,height:r.height},hit:hit?.tagName,hitClass:hit?.getAttribute('class'),hidden:!!n.closest('[hidden],[inert]')};})}));fs.writeFileSync(path.join(shots,game+'-'+id+'-failure.json'),JSON.stringify(debug,null,2));await page.screenshot({path:path.join(shots,game+'-'+id+'-failure.png')});throw error;}};
 const move=()=>page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
 const commit=async control=>{const before=await move();await control.click();await page.waitForFunction(before=>PlayroomAppBridge.saveLibrary.current().session.current.move===before+1,before);await page.locator('.scene[aria-busy=false]').waitFor();};
 const resume=async game=>{
  await page.evaluate(async ({game,defaults})=>{
   const b=PlayroomAppBridge,E=TabletopCore;b.showHub();
   const saved=new TabletopSession(E,game,{seed:17,mode:'solo',...(!defaults?{undo:'history',autoFlip:'manual',autoCollect:'button'}:{}),players:[{name:'Иван'}]}).export(),state=saved.states[0];
   if(game==='klondike'){
    const d=state.data,pool=[...d.tableau.flat(),...d.stock];
    const take=(rank,suit,open)=>{const index=pool.findIndex(card=>card.rank===rank&&card.suit===suit);if(index<0)throw Error('Missing physical fixture card');return {...pool.splice(index,1)[0],open};};
    d.tableau=[[take(7,'♣',false),take(6,'♥',true)],[take(7,'♠',true)],[take(14,'♥',true)],[],[],[],[]];d.stock=pool.map(card=>({...card,open:false}));
   }
   E.validateState(state);const session=TabletopSession.restore(E,saved);if(!E.legalActions(session.current,0).some(a=>a.type==='move'&&a.source==='tableau'))throw Error('Fixture needs a legal tableau move');
   await b.saveLibrary.activateAsync(session,'learning-all-'+game);b.showSessions();
  },{game,defaults});
  await page.locator('.saved-game[data-session-id="learning-all-'+game+'"][data-saved-actions-toggle]').click();await page.locator('[data-resume-id="learning-all-'+game+'"]').first().click();await page.locator('.solitaire-board').waitFor();
 };
 const selectAndMove=async game=>{
  await showGoal(game,'card');
  const action=await page.evaluate(game=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return TabletopCore.legalActions(s,0).find(a=>a.type==='move'&&a.source==='tableau'&&(game!=='klondike'||a.from===0&&a.to===1));},game);assert(action);
  const source=page.locator('.solitaire-card[data-select='+JSON.stringify(action.card)+']');await source.focus();await page.keyboard.press('Enter');assert.equal((await mastered(game)).card,1);
  const destination=page.locator('[data-drop-piece='+JSON.stringify(action.card)+'][data-action]').first(),targetBox=await destination.boundingBox(),viewport=page.viewportSize();
  if(targetBox.x<0||targetBox.x+targetBox.width>viewport.width){const before=await page.locator('.solitaire-scroll').evaluate(n=>n.scrollLeft),beforeMove=await move();await page.locator('.first-turn-guide.is-scroll-cue:not([hidden]) .guide-caption').waitFor();await showGoal(game,'target');assert.equal(await page.locator('.solitaire-scroll').evaluate(n=>n.scrollLeft),before,'scroll cue never moves the field');assert.equal(await move(),beforeMove);assert.equal((await mastered(game)).target,undefined);await page.screenshot({path:path.join(shots,game+'-scroll-cue.png')});const box=await page.locator('.solitaire-scroll').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(targetBox.x<0?targetBox.x-16:targetBox.x+targetBox.width-viewport.width+16,0);}
  await showGoal(game,'target');await commit(destination);assert.equal((await mastered(game)).target,1);
 };
 const listComplete=async(game,count)=>{
  await page.locator('[data-game-menu]').click();await page.locator('.game-menu-panel [data-command=settings]').click();await page.locator('[data-settings-tab=behavior]').click();await page.locator('[data-learning-list='+game+']').click();
  assert.equal(await page.locator('.learning-goals input:checked:disabled').count(),count);
  if(defaults&&game==='klondike'){assert.equal(await page.locator('.learning-goals input:not(:checked)').count(),1);assert.equal(await page.locator('.learning-complete').count(),0,'automatic flip is not falsely marked as manually learned');}
  else {assert.equal(await page.locator('.learning-goals input:not(:checked)').count(),0);assert.match(await page.locator('.learning-complete').innerText(),/Все действия освоены/);}
  await page.screenshot({path:path.join(shots,game+'-all-learning.png')});await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();assert.equal(await page.locator('[data-settings-screen]').count(),1,'one Back restores settings');await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();
 };
 await resume('spider');assert.deepEqual(await mastered('spider'),{});await selectAndMove('spider');
 if(defaults){
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.config.undo),'last');
  await commit(page.locator(`[data-action*='"type":"undo"']:visible`).first());
  assert.equal(await page.locator(`[data-action*='"type":"undo"']:visible`).count(),0,'last undo cannot repeat');
 }
 await showGoal('spider','deal');await commit(page.locator('.solitaire-draw-control'));
 if(defaults)assert.equal(await page.locator(`[data-action*='"type":"undo"']:visible`).count(),0,'default Spider deal is an undo barrier');
 else {await showGoal('spider','undo');await commit(page.locator(`[data-action*='"type":"undo"']:visible`).first());}
 await showGoal('spider','hint');const spiderMove=await move();await page.locator('[data-view-key=hint]').click();assert.equal(await move(),spiderMove,'hint is local UI, not a game command');
 assert.deepEqual(Object.keys(await mastered('spider')).sort(),['card','deal','hint','target','undo']);await listComplete('spider',5);
 await resume('klondike');assert.deepEqual(await mastered('klondike'),{});await selectAndMove('klondike');
 await showGoal('klondike','stock');await commit(page.locator('.solitaire-stock[data-action]'));
 if(defaults){
  const state=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {config:s.data.config,open:s.data.tableau[0].at(-1).open,flip:TabletopCore.legalActions(s,0).some(a=>a.type==='flip'),waste:s.data.waste.length};});
  assert.equal(state.config.undo,'last');assert.equal(state.config.autoFlip,true);assert.equal(state.config.draw,3);assert.equal(state.open,true);assert.equal(state.flip,false);assert.equal(state.waste,3);assert.equal((await mastered('klondike')).flip,undefined);
 }else {await showGoal('klondike','flip');await commit(page.locator(`[data-action*='"type":"flip"']:visible`).first());}
 await showGoal('klondike','collect');const beforeCollect=await move(),box=await page.locator('.solitaire-board').boundingBox();await page.mouse.dblclick(box.x+box.width/2,box.y+box.height-12);await page.waitForFunction(before=>PlayroomAppBridge.saveLibrary.current().session.current.move===before+1,beforeCollect);assert.equal((await mastered('klondike')).collect,1);
 await showGoal('klondike','undo');await commit(page.locator(`[data-action*='"type":"undo"']:visible`).first());
 await showGoal('klondike','hint');await page.locator('[data-view-key=hint]').click();assert.equal((await mastered('klondike')).hint,1);
 for(let i=0;i<20;i++){const count=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.stock.length);if(!count)break;await commit(page.locator('.solitaire-stock[data-action]'));}
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.stock.length),0);
 await showGoal('klondike','recycle');await commit(page.locator('.solitaire-stock[data-action]'));
 assert.deepEqual(Object.keys(await mastered('klondike')).sort(),['card','collect',...(!defaults?['flip']:[]),'hint','recycle','stock','target','undo']);await listComplete('klondike',defaults?7:8);
 await page.reload();await page.locator('.solitaire-board').waitFor();
 for(const game of ['spider','klondike']){const saved=await mastered(game),goals=await page.evaluate(game=>PlayroomViews.get(game).tutorial.goals,game);assert(goals.filter(goal=>!defaults||game!=='klondike'||goal.id!=='flip').every(goal=>saved[goal.id]===goal.revision),game+' mastery revisions persist after reload');if(defaults&&game==='klondike')assert.equal(saved.flip,undefined);}
 assert.equal(await page.locator('.first-turn-guide:not([hidden])').count(),0,'completed learning does not resume as a new tutorial');
},{settings:{sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false},safeSupabase:true});

test('solitaire learning masters every goal through real input and validated saved positions',{timeout:120000},solitaireLearningCase(false));
test('default solitaire rules preserve actionable guides and single-step undo',{timeout:120000},solitaireLearningCase(true));


test('first-turn guidance explains clipped scroll targets without moving the field or learning the action',{timeout:60000},async()=>fixture(async page=>{
 page.setDefaultTimeout(5000);await page.setViewportSize({width:390,height:844});await scene(page,'tictactoe');
 const rows=[];
 for(const scenario of [{direction:'right'},{direction:'left'},{direction:'down'},{direction:'up'},{direction:'left',rtl:true},{direction:'right',rtl:true}]){
  const initial=await page.evaluate(({direction,rtl})=>{
   PlayroomFirstTurnGuide.stop();document.querySelector('#scroll-guide-fixture')?.remove();document.querySelector('#scroll-guide-alternative')?.remove();
   const host=document.createElement('div');host.id='scroll-guide-fixture';host.style.cssText='position:fixed;left:40px;top:120px;width:200px;height:160px;overflow:auto;z-index:100;direction:'+(rtl?'rtl':'ltr');
   const content=document.createElement('div');content.style.cssText='position:relative;width:600px;height:600px';
   const target=document.createElement('button');target.id='scroll-guide-target';target.textContent='Target';target.style.cssText='position:absolute;left:'+(['down','up'].includes(direction)?40:direction==='right'?500:0)+'px;top:'+(['left','right'].includes(direction)?40:direction==='down'?500:0)+'px;width:60px;height:44px';content.append(target);host.append(content);document.querySelector('#app').append(host);
   const alternative=document.createElement('button');alternative.id='scroll-guide-alternative';alternative.textContent='Alternative';alternative.style.cssText='position:fixed;left:40px;top:340px;width:100px;height:40px;z-index:100';document.querySelector('#app').append(alternative);
   host.scrollLeft=rtl?(direction==='right'?-(host.scrollWidth-host.clientWidth):0):direction==='left'?host.scrollWidth-host.clientWidth:0;host.scrollTop=direction==='up'?host.scrollHeight-host.clientHeight:0;
   const tutorial=()=>({steps:[{id:'scrollTarget',selector:'#scroll-guide-target',actions:['move'],text:'Choose the target.'},{id:'alternative',selector:'#scroll-guide-alternative',actions:['draw'],text:'Alternative action.'}]});tutorial.goals=[{id:'scrollTarget',revision:1,text:'Choose the target.'}];PlayroomViews.registerTutorial('tictactoe',tutorial);
   window.scrollGuideOwner={};PlayroomFirstTurnGuide.update({owner:scrollGuideOwner,state:TabletopCore.project(rcSession.current,0),viewer:0,actions:TabletopCore.legalActions(rcSession.current,0),active:true,busy:false});return {left:host.scrollLeft,top:host.scrollTop};
  },scenario);
  const cue=page.locator('.first-turn-guide.is-scroll-cue:not([hidden])');await cue.locator('.guide-caption').waitFor();assert.equal(await cue.getAttribute('data-scroll-direction'),scenario.direction);
  assert.match(await cue.locator('.guide-caption').innerText(),/Прокрутите/);assert.match(await cue.locator('.guide-caption').innerText(),/Choose the target/);
  const bounds=await cue.locator('.guide-scroll-direction').boundingBox(),port=await page.locator('#scroll-guide-fixture').boundingBox();assert(bounds&&bounds.x>=port.x&&bounds.y>=port.y&&bounds.x+bounds.width<=port.x+port.width&&bounds.y+bounds.height<=port.y+port.height,'scroll cue stays inside its visible scrollport '+JSON.stringify({scenario,bounds,port}));
  const before=await page.evaluate(()=>({left:document.querySelector('#scroll-guide-fixture').scrollLeft,top:document.querySelector('#scroll-guide-fixture').scrollTop,mastered:PlayroomFirstTurnGuide.settings('tictactoe').mastered,pointer:getComputedStyle(document.querySelector('.first-turn-guide')).pointerEvents}));assert.deepEqual({left:before.left,top:before.top},initial,'guidance must not scroll automatically');assert.equal(before.mastered.scrollTarget,undefined);assert.equal(before.pointer,'none');
  await page.mouse.move(140,200);await page.mouse.wheel(scenario.direction==='left'?-600:scenario.direction==='right'?600:0,scenario.direction==='up'?-600:scenario.direction==='down'?600:0);
  await page.locator('.first-turn-guide.is-tapping:not(.is-scroll-cue):not([hidden]) .guide-caption').filter({hasText:'Choose the target.'}).waitFor();
  await page.waitForFunction(()=>{const a=document.querySelector('.first-turn-guide').getBoundingClientRect(),b=document.querySelector('#scroll-guide-target').getBoundingClientRect();return Math.abs(a.x-b.x-b.width/2)<1&&Math.abs(a.y-b.y-b.height/2)<1;});assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('tictactoe').mastered.scrollTarget),undefined,'scrolling alone does not learn a game command');rows.push({...scenario,bounds});
 }
 await page.evaluate(()=>{const host=document.querySelector('#scroll-guide-fixture');host.style.overflow='hidden';host.style.direction='ltr';host.scrollLeft=0;host.scrollTop=0;document.querySelector('#scroll-guide-target').style.left='500px';const state=TabletopCore.project(rcSession.current,0);PlayroomFirstTurnGuide.update({owner:scrollGuideOwner,state,viewer:0,actions:TabletopCore.legalActions(rcSession.current,0),active:true,busy:false});dispatchEvent(new Event('resize'));});
 await page.locator('.first-turn-guide:not([hidden]) .guide-caption').filter({hasText:'Alternative action.'}).waitFor();assert.equal(await page.locator('.first-turn-guide.is-scroll-cue:not([hidden])').count(),0,'non-scrollable clipping must not advertise an impossible scroll');
 fs.writeFileSync(path.join(shots,'scroll-cue-directions.json'),JSON.stringify(rows,null,2));
},{safeSupabase:true}));

test('shared game frame aligns system edges and fits eight-player landscape counters',{timeout:45000},async()=>fixture(async page=>{
 const report=[];
 for(const [width,height] of [[844,320],[844,390],[932,430],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [game,count] of [['mage-brawl',8],['uno',6],['battleship',2]]){
   await scene(page,game,{players:Array.from({length:count},(_,i)=>({name:'Игрок '+i}))});
   const m=await page.evaluate(()=>{const box=n=>n.getBoundingClientRect(),shell=document.querySelector('.table-shell'),stage=document.querySelector('.app-game-layout'),scene=document.querySelector('.scene'),roster=stage.querySelector('.layout-participants'),heading=document.querySelector('.game-frame-heading'),tools=document.querySelector('.game-frame-tools'),list=roster.querySelector('.players-panels'),cards=[...roster.querySelectorAll('.player-panel')];return {scene:box(scene).toJSON(),heading:box(heading).toJSON(),tools:box(tools).toJSON(),padding:getComputedStyle(shell).padding,roster:{height:roster.clientHeight,scroll:roster.scrollHeight,bottom:box(roster).bottom,lastBottom:Math.max(...cards.map(n=>box(n).bottom))},columns:getComputedStyle(list).gridTemplateColumns.split(' ').length,counters:cards.map(card=>{const c=card.querySelector('.player-scores');return {card:box(card).toJSON(),scores:c?box(c).toJSON():null};}),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert(!m.overflow,JSON.stringify({game,width,m}));
   if(width>height){assert(Math.abs(m.heading.x-m.scene.x)<1);assert(Math.abs(m.tools.right-m.scene.right)<1);assert(Math.abs(m.heading.y-m.scene.y)<1);assert.equal(m.columns,count>2?2:1);if(game==='mage-brawl'){assert(m.roster.scroll<=m.roster.height+1,JSON.stringify(m));assert(m.roster.lastBottom<=m.roster.bottom+1);for(const item of m.counters)assert(item.scores.right<=item.card.right-1,JSON.stringify(item));}}
   if(game==='mage-brawl'&&width>height){const stable=await page.evaluate(()=>{const bounds=()=>['.layout-field','.game-frame-heading','.game-frame-tools'].map(selector=>{const b=document.querySelector(selector).getBoundingClientRect();return [b.x,b.y,b.width,b.height];}),before=bounds();rcStateOverride=structuredClone(rcSession.current);for(const player of rcStateOverride.data.players){player.health=1;player.lives=1;}rcRender();return {before,after:bounds()};});assert.deepEqual(stable.after,stable.before,'counter changes preserve the field and system blocks');const overflow=await page.evaluate(()=>{const roster=document.querySelector('.layout-participants'),list=roster.querySelector('.players-panels');for(let i=0;i<20;i++)list.append(list.firstElementChild.cloneNode(true));roster.scrollTop=roster.scrollHeight;const last=list.lastElementChild.getBoundingClientRect(),edge=roster.getBoundingClientRect();return {scrollable:roster.scrollHeight>roster.clientHeight,atEnd:Math.abs(roster.scrollHeight-roster.clientHeight-roster.scrollTop)<1,lastVisible:last.bottom<=edge.bottom+1};});assert(overflow.scrollable&&overflow.atEnd&&overflow.lastVisible,JSON.stringify(overflow));}
   report.push({game,width,height,...m});
  }
 }
 await page.setViewportSize({width:844,height:320});await scene(page,'mage-brawl',{players:Array.from({length:8},(_,i)=>({name:'Игрок '+i}))});await page.evaluate(()=>document.documentElement.requestFullscreen());await page.setViewportSize({width:844,height:390});await page.evaluate(()=>PlayroomGameScreen.layoutScene(document.querySelector('#app')));
 const fullscreen=await page.locator('.layout-participants .player-panel').evaluateAll(cards=>cards.map(card=>({width:card.getBoundingClientRect().width,right:card.getBoundingClientRect().right,scoreRight:card.querySelector('.player-scores').getBoundingClientRect().right})));assert(fullscreen.every(c=>c.scoreRight<=c.right-1),JSON.stringify(fullscreen));await page.evaluate(()=>document.exitFullscreen());
 console.log('game frame geometry',JSON.stringify(report));
},{safeSupabase:true}));

test('Mage planning remains confirmable and cancellable after returning from live history',{timeout:30000},async()=>fixture(async page=>{
 page.setDefaultTimeout(3500);await page.setViewportSize({width:390,height:844});
 await page.locator('[data-start=mage-brawl]').click();await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Луна'});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();await page.waitForFunction(()=>document.querySelector('[data-command=unlock],.mage-card'));
 if(await page.locator('[data-command=unlock]').count())await page.locator('[data-command=unlock]').click();
 await page.locator('.mage-card').first().click();await page.locator('.mage-controls [data-action]').click();await page.locator('.mage-controls [data-action]').click();
 await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]').click();await page.locator('#replay-range').waitFor();
 const latest=Number(await page.locator('#replay-range').inputValue());await page.locator('[data-command=replay-prev]').click();await page.waitForFunction(n=>Number(document.querySelector('#replay-range')?.value)<n,latest);
 await page.locator('[data-command=history-close]').click();
 await page.locator('.mage-card').first().click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.mage-controls [data-action]')].some(b=>!b.disabled),null,{timeout:1500});
 await page.locator('.mage-controls [data-action]').click();const cancel=page.locator('.mage-controls [data-action]');assert.equal(JSON.parse(await cancel.getAttribute('data-action')).type,'unready');await cancel.click();
 assert.notEqual(JSON.parse(await page.locator('.mage-controls [data-action]').getAttribute('data-action')).type,'unready','cancellation returned to selection');
},{safeSupabase:true,settings:{sound:false,animationSpeed:'instant',tutorialsEnabled:false,autoPass:false,quickPlay:false}}));


test('physical board insets survive shared field fitting and keep square native targets',{timeout:60000},()=>fixture(async page=>{
 for(const [width,height]of [[390,844],[844,390]])for(const theme of ['light','dark']){await page.setViewportSize({width,height});await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);await scene(page,'checkers');
  const m=await page.locator('.checker-board-wrap').evaluate(e=>{const outer=e.getBoundingClientRect(),board=e.querySelector('.checker-board').getBoundingClientRect(),frame=e.querySelector('.checker-board-frame').getBoundingClientRect();return{outer:outer.toJSON(),board:board.toJSON(),frame:frame.toJSON(),cells:e.querySelectorAll('[data-grid-cell]').length,pointer:getComputedStyle(e.querySelector('.checker-board-frame')).pointerEvents};});
  assert(Math.abs(m.outer.width/m.outer.height-1)<.01);assert(Math.abs(m.board.width/m.outer.width-.94)<.002,JSON.stringify(m));assert(Math.abs((m.board.left-m.outer.left)/m.outer.width-.03)<.002,JSON.stringify(m));assert.equal(m.cells,64);assert.equal(m.pointer,'none');assert(Math.abs(m.frame.width-m.outer.width)<1);
 }
}));

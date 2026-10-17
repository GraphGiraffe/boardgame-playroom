'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),shots=path.join(root,'tmp_files/rc2-presentation');
async function fixture(run){
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await browser.newPage({viewport:{width:1098,height:1238}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'rc2',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast'}));});
 try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();fs.mkdirSync(shots,{recursive:true});await run(page);assert.deepEqual(errors,[]);}finally{await browser.close();await server.close();}
}
async function scene(page,game,options={}){
 await page.evaluate(({game,options})=>{
  window.rcUI={};window.rcStateOverride=null;window.rcSession=new TabletopSession(TabletopCore,game,{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:game==='checkers'||game==='tictactoe'||game==='battleship'?2:4},(_,i)=>({name:['Иван','Тео','Сэм','Кира'][i]})),...options});
  window.rcRender=()=>{const actual=rcStateOverride||rcSession.current,state=TabletopCore.project(actual,0),actions=TabletopCore.legalActions(actual,0),scene=PlayroomViews.render(state,0,actions,{selected:null,preferences:{},viewState:{},...rcUI});PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:TabletopCore.get(game).name,state,viewer:0,actions,scene,turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));};rcRender();
 },{game,options});
}
test('shared-grid games force rows and the complete Yatzy table fits phone and tablet widths',{timeout:45000},async()=>fixture(async page=>{
 const dir=path.join(root,'tmp_files/dice-review');fs.mkdirSync(dir,{recursive:true});
 for(const [width,height]of [[320,640],[390,844],[844,390],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const game of ['yatzy','pexeso','snakes']){
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
 assert.deepEqual(await page.locator('#setting-seating option').evaluateAll(options=>options.map(option=>option.value)),['row']);
 await page.locator('.modal [data-command="close-modal"]').click();await page.locator('.yatzy-roll[data-action]').click();await page.locator('.yatzy-score button[data-action]').first().click();await page.locator('.action-reveal').waitFor();
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
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  const teams=[{id:'a',label:'А',color:'#638658'},{id:'b',label:'Б',color:'#c97866'}];
  const state={players:['Иван','Луна','Сэм','Кира'].map((name,i)=>({name,bot:i>0})),firstPlayer:2,turn:0,preset:'teams',status:'playing',scene:{round:{number:1},players:[0,1,2,3].map(player=>({player,team:teams[player%2]}))}};
  document.querySelector('#app').innerHTML=PlayroomGameScreen.resumeCard({state,network:true,gameName:'Лудо',roomName:'Комната Иван',participants:[{playerIndex:0,isHost:true}]});
 });
 const names=await page.locator('.resume-person').evaluateAll(people=>people.map(p=>({name:p.querySelector('.resume-person-name>span:last-child').textContent.trim(),y:p.getBoundingClientRect().top})));
 assert.deepEqual(names.map(p=>p.name),['Иван','Луна','Сэм','Кира']);assert(names.every(p=>Math.abs(p.y-names[0].y)<1),'teams do not force a new row');
 await page.screenshot({path:path.join(dir,'recent-teams-390.png')});
}));
test('UNO forced skips preserve rotated seats and hands through every animation frame',{timeout:60000},async()=>fixture(async page=>{
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
    return {before,samples,seating:document.querySelector('.app-game-layout').dataset.seating};
   },{target,value});
   await page.screenshot({path:path.join(dir,`uno-${width}x${height}-${target}-${value==='skip'?'skip':'draw2'}.png`)});
   for(const sample of result.samples){
    assert.deepEqual(sample.matrix,result.before.matrix,'skip must preserve the seat rotation');
    for(const key of ['w','h','handW','handH'])assert(Math.abs(sample[key]-result.before[key])<1,`skip must preserve ${key}`);
    assert(Math.abs(sample.x-result.before.x)<=4.1&&Math.abs(sample.y-result.before.y)<=4.1,'shake stays inside its four-pixel reserve');
   }
   if(height>width)assert.equal(Math.abs(Math.round(result.before.matrix[1])),1,'portrait fixture exercises a rotated seat');
   if(height<width&&height<500)assert.equal(result.seating,'row','short landscape exercises the row fallback');
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
 assert(await page.locator('.player-target-menu.is-card-choice button[data-card-index]').first().evaluate(el=>el.getBoundingClientRect().width>=90));
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
  });for(const box of boxes)for(let i=0;i<4;i++)assert(Math.abs(box[i]-boxes[0][i])<1,'field geometry must stay fixed');
  assert(boxes.every(b=>b[4]<=width),'no page horizontal overflow');
 }
 await page.setViewportSize({width:1098,height:1238});await scene(page,'pexeso',{deck:'32'});assert(await page.locator('.pexeso-slot').first().evaluate(el=>el.getBoundingClientRect().width>70));await page.screenshot({path:path.join(shots,'dark-pexeso.png')});
}));
test('RC2 hub drops work in both directions and settings groups adapt',{timeout:45000},async()=>fixture(async page=>{
 await page.locator('[data-edit-toggle]').click();
 const cards=page.locator('[data-edit-drop="normal"] .game-tile');const before=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));
 async function drop(source,target,after){const box=await target.boundingBox(),horizontal=box.width>box.height*1.5;await source.dragTo(target,{targetPosition:{x:box.width*(horizontal?.5:after?.8:.2),y:box.height*(horizontal?(after?.8:.2):.5)}});}
 await drop(page.locator(`[data-edit-drop="normal"] [data-game="${before[0]}"]`),page.locator(`[data-edit-drop="normal"] [data-game="${before[2]}"]`),true);
 let order=await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game));assert.equal(order[2],before[0]);
 await drop(page.locator(`[data-edit-drop="normal"] [data-game="${before[0]}"]`),page.locator(`[data-edit-drop="normal"] [data-game="${before[1]}"]`),false);
 assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.game)),before);
 await page.reload();await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));await page.locator('[data-start="uno"]').first().click();await page.locator('.modal [data-command="settings"]').click();
 await page.setViewportSize({width:1098,height:1238});let positions=await page.locator('.settings-overview').evaluate(el=>[...el.children].map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert(positions[1].y>positions[0].y);
 await page.screenshot({path:path.join(shots,'dark-settings.png')});await page.setViewportSize({width:390,height:740});positions=await page.locator('.settings-overview').evaluate(el=>[...el.children].map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert(positions[1].y>positions[0].y);
}));
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
   if(width<=520){assert.equal(layout.columns,2);assert(layout.sameRow);assert(await page.locator('.game-tile').evaluateAll(cards=>cards.every(card=>card.getBoundingClientRect().height/card.getBoundingClientRect().width<1.3)),'cards should be nearly square');const overflow=await page.locator('.game-tile').evaluateAll(cards=>cards.filter(card=>card.scrollHeight>card.clientHeight+1).map(card=>({id:card.dataset.game,h:card.clientHeight,scroll:card.scrollHeight,parts:[...card.children].map(n=>({class:n.className,h:n.getBoundingClientRect().height}))})));assert.deepEqual(overflow,[],'card content must fit at '+width);}assert(!layout.overflow);assert.equal(layout.text,'');assert(layout.label);const buttons=await page.locator('.hub-intro-actions .btn').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));assert.equal(buttons.length,2);assert(Math.abs(buttons[0]-buttons[1])<1);
   if(width===390)await page.screenshot({path:path.join(shots,`rc3-hub-${theme}.png`),fullPage:true});
  }
 }
}));
test('RC3 enlarged public move stays at the visible field center through resize',{timeout:45000},async()=>fixture(async page=>{
 await scene(page,'uno');
 await page.evaluate(()=>{window.rcReveal=new PlayroomActionReveal();const card=rcSession.current.data.hands[0][0];rcReveal.show({kind:'card',entity:'card-'+card.id,card},'uno');});
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

test('RC6 circular seats align hands to edges, keep player geometry equal and preserve a clear public field',{timeout:60000},async()=>fixture(async page=>{
 for(const game of ['oldmaid','gofish','ludo','uno'])for(const [width,height]of [[320,740],[390,740],[740,390],[1090,900],[1440,900]]){
  await page.setViewportSize({width,height});await scene(page,game);
  const geometry=await page.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout'),field=stage.querySelector('.layout-field').getBoundingClientRect(),cards=[...stage.querySelectorAll('.seat-group>.player-panel')].filter(n=>n.getBoundingClientRect().width),boxes=cards.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,localWidth:n.offsetWidth,localHeight:n.offsetHeight};});
   return {focus:stage.dataset.layoutFocus,seating:stage.dataset.seating,mode:stage.dataset.seatMode,field:{x:field.x,y:field.y,w:field.width,h:field.height},boxes:boxes.map(b=>({x:b.x,y:b.y,w:b.width,h:b.height,lw:b.localWidth,lh:b.localHeight})),mini:[...stage.querySelectorAll('.seat-group .mini-hand>*')].map(n=>n.getBoundingClientRect().width),overflow:document.documentElement.scrollWidth>innerWidth+1,copies:stage.querySelectorAll('[data-seat-copy]').length};
  });assert.equal(geometry.seating,game!=='ludo'&&height<width&&height<=550?'row':'circle');assert(!geometry.overflow,game+' '+width);assert(geometry.field.w>40&&geometry.field.h>40,JSON.stringify(geometry));
  for(const b of geometry.boxes){assert(Math.abs(b.lw-geometry.boxes[0].lw)<1&&Math.abs(b.lh-geometry.boxes[0].lh)<1,game+' equal cards');assert(b.x+b.w<=geometry.field.x+1||b.x>=geometry.field.x+geometry.field.w-1||b.y+b.h<=geometry.field.y+1||b.y>=geometry.field.y+geometry.field.h-1,game+' seats cannot cover field '+JSON.stringify(geometry));}
  if(geometry.seating==='circle'&&['oldmaid','gofish'].includes(game)){assert.equal(geometry.focus,'hands');assert(geometry.boxes.every(b=>b.lw>b.lh),'name and hand share a horizontal block before edge rotation');}
  if(game==='ludo'&&geometry.seating==='circle'){assert.equal(geometry.copies,1);assert.equal(await page.locator('.seat-group [data-player-index="0"].is-turn').count(),1);assert.equal(await page.locator('.layout-self [data-player-index="0"].is-turn').count(),1);}
  if([390,1090].includes(width))await page.screenshot({path:path.join(shots,`rc4-${game}-${width}.png`)});
 }
}));
test('RC4 local seating can be changed without actions, ownership changes or revealing private hands',{timeout:45000},async()=>fixture(async page=>{
 await page.locator('[data-start="oldmaid"]').first().click();await page.locator('[data-room-cycle="seat-3"]').click();await page.locator('[data-room-cycle="seat-4"]').click();await page.locator('[data-command=lobby-start]').click();
 await page.locator('.table-tools [data-command=settings]').click();
 assert.equal(await page.locator('.settings-personal [data-appearance-picker]').count(),0);
 for(const width of [320,390,1090]){await page.setViewportSize({width,height:900});assert(await page.locator('[data-quick-shortcut]').evaluateAll(nodes=>nodes.every(n=>Math.abs(n.getBoundingClientRect().y-nodes[0].getBoundingClientRect().y)<1)));}
 await page.locator('#setting-seating').selectOption('row');await page.locator('#modal-root [data-command=close-modal]').click();assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'row');assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions('uno').seating),'auto','another game keeps its own default');
 await page.locator('.table-tools [data-command=settings]').click();await page.locator('#setting-seating').selectOption('circle');await page.locator('#modal-root [data-command=close-modal]').click();assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 assert.equal(await page.locator('.seat-group .mini-hand .public-card').count(),0,'opponents remain hidden');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).seatingByGame.oldmaid),'circle');await page.reload();await page.locator('.table-tools [data-command=settings]').click();assert.equal(await page.locator('#setting-seating').inputValue(),'circle');
}));
test('RC4 phone tiles preserve square geometry, symmetrical header and readable artwork',{timeout:45000},async()=>fixture(async page=>{
 for(const width of [320,390,520]){
  await page.setViewportSize({width,height:900});
  const values=await page.locator('.game-tile').evaluateAll(cards=>cards.map(card=>{
   const c=card.getBoundingClientRect(),fav=card.querySelector('.tile-favorite').getBoundingClientRect(),type=card.querySelector('.type-badge-card'),t=type.getBoundingClientRect(),svg=card.querySelector('.game-cover svg'),s=svg.getBoundingClientRect(),art=svg.querySelector('[data-cover-art]').getBoundingClientRect();
   return {game:card.dataset.game,ratio:c.height/c.width,favSize:fav.width,typeSize:t.width,radius:getComputedStyle(type).borderRadius,edge:Math.abs(t.left-c.left-(c.right-fav.right)),top:Math.abs(t.top-fav.top),artFill:Math.max(art.width/s.width,art.height/s.height),legacyPlay:!!card.querySelector('.play-tile')};
  }));for(const v of values){assert(Math.abs(v.ratio-1)<.01,JSON.stringify(v));assert.equal(v.typeSize,v.favSize);assert.equal(v.radius,'50%');assert(v.edge<1&&v.top<1,JSON.stringify(v));assert(v.artFill>.7&&v.artFill<1.1,JSON.stringify(v));assert.equal(v.legacyPlay,false);}
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
    const beforeTurn=rcSession.current.turn,action={type:'flip',index},shot=PlayroomMotion.capture({actor:beforeTurn,viewer:0,action});
    rcSession.act(beforeTurn,action);rcUI={presentationTurn:beforeTurn};rcRender();
    const pending=PlayroomMotion.play(shot,{duration:220,effects:PlayroomGameFlow.effectTimes.fast});
    for(let frame=0;frame<6;frame++){await new Promise(requestAnimationFrame);samples.push([...document.querySelectorAll('[data-motion-kind=flip] button')].every(n=>getComputedStyle(n).visibility==='visible'));}
    await pending;rcUI={};rcRender();
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
   if(game!=='ludo'&&width>height&&height<=550)assert.equal(geometry.actual,'row',game+' short landscape');
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   if(game==='ludo'){
    const anchors=await page.evaluate(()=>{const field=document.querySelector('.layout-field').getBoundingClientRect();return [...document.querySelectorAll('[data-seat-copy],.seat-group>.player-panel')].map(el=>{const r=el.getBoundingClientRect();return {seat:el.dataset.seat,cx:r.x+r.width/2,cy:r.y+r.height/2,fx:field.x+field.width/2,fy:field.y+field.height/2};});});
    for(const a of anchors){assert(a.seat.includes('west')?a.cx<a.fx:a.cx>a.fx,JSON.stringify(a));assert(a.seat.includes('north')?a.cy<a.fy:a.cy>a.fy,JSON.stringify(a));}
   }
   await page.screenshot({path:path.join(dir,`${game}-${width}x${height}-played.png`)});
  }
 }
 await page.setViewportSize({width:390,height:844});await scene(page,'uno');assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 await page.setViewportSize({width:740,height:360});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.seating==='row');
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
 assert.equal(await page.locator('.settings-themes').innerText(),'Темы');
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

test('RC7 UNO draws into rotated hands in live play and replay without stretching the artwork',{timeout:45000},async()=>fixture(async page=>{
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
   if(height>550)assert.equal(Math.abs(Math.round(result.angle)),90);else assert.equal(result.angle,0);
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
 assert.deepEqual(await page.locator('#setting-seating option').evaluateAll(nodes=>nodes.map(n=>n.value)),['anchors','row']);
 await page.locator('#setting-seating').selectOption('anchors');await page.locator('#modal-root [data-command="close-modal"]').click();
 await page.setViewportSize({width:740,height:360});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.anchorCompactControls==='true');
 assert.equal(await page.locator('.app-game-layout').getAttribute('data-seating'),'circle');
 await page.locator('.table-tools [data-command="settings"]').click();assert.equal(await page.locator('#setting-seating').inputValue(),'anchors');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).seatingByGame.ludo),'anchors');
 await page.locator('#modal-root [data-command="close-modal"]').click();await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.app-game-layout').dataset.seating==='circle');
 await page.locator('.table-tools [data-command="settings"]').click();await page.locator('#setting-seating').selectOption('row');await page.locator('#modal-root [data-command="close-modal"]').click();
 for(const [width,height]of [[390,844],[740,360],[768,1024],[1024,768]]){
  await page.setViewportSize({width,height});const panels=await page.locator('.layout-participants .player-panel').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height};}));assert(panels.every(p=>p.w>=80&&p.h>=44),JSON.stringify(panels));
  await page.screenshot({path:path.join(root,'tmp_files/rc7-review',`ludo-${width}x${height}-chosen-row.png`)});
 }
}));

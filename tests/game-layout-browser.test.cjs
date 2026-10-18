'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const UI=require('../core/ui.js'),root=path.resolve(__dirname,'..'),packsDir=path.join(root,'packs'),sharedDir=fs.existsSync(packsDir)?path.join(path.dirname(fs.realpathSync(packsDir)),'shared'):null,read=f=>fs.readFileSync(f.startsWith('shared/')?path.join(sharedDir,f.slice(7)):path.join(root,f),'utf8');
const sourceSizes=[[590,1032,'snakes'],[1647,973,'snakes'],[1874,550,'durak'],[1397,543,'snakes'],[1055,692,'durak'],[1065,967,'snakes'],[687,538,'domino'],[1742,488,'domino'],[1609,481,'domino'],[832,1032,'domino'],[724,1032,'domino'],[737,1032,'checkers'],[898,1032,'checkers']];
test('elements API rejects malformed content and geometry',()=>{for(const value of ['old',{api:1},{api:2,family:'cards',elements:{field:''}},{api:2,family:'board',elements:{field:'x',unknown:'x'}},{api:2,family:'board',fieldAspect:0,elements:{field:'x'}},{api:2,family:'cards',elements:{field:'x'},playerContent:[{handCount:-1}]}])assert.throws(()=>UI.composeScene(value));});
test('all packs share player panels and preserve geometry across reported screens, replay and rotation',{timeout:180000,skip:!['uno','domino','durak','checkers','snakes'].every(id=>fs.existsSync(path.join(root,'packs',id,'rules.js')))},async t=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div></body></html>');
 for(const f of ['app/styles.css','app/design-system.css','core/game-components.css','core/ui.css','shared/view-kit.css',...['uno','durak','domino','checkers','snakes'].map(id=>`packs/${id}/styles.css`)])await page.addStyleTag({content:read(f)});
 for(const f of ['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/model-runtime.js','presentation/localization.js','core/model-registration.js','core/engine.js','core/component-assets.js','core/game-components.js','core/token-layout.js','core/ui.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','core/tag-registry.js','core/tags.js','platform/web/pack-loader.js','core/packs.js','installed-packs.js'])await page.addScriptTag({content:read(f)});
 await page.evaluate(()=>{window.packs=new TabletopPacks({engine:TabletopCore,views:PlayroomViews,catalog:{},document,storage:{get:()=>null,set(){}}});packs.bootstrap(PlayroomInstalledPacks);});
 const cases=[...sourceSizes,...[...['uno','durak','domino','checkers','snakes']].flatMap(id=>[[320,640,id],[390,740,id],[740,390,id],[640,280,id],[768,1024,id],[1024,768,id],[1280,900,id],[1920,1080,id]]),...['uno','durak','domino','checkers','snakes'].flatMap(id=>[[390,740,id,'table'],[740,390,id,'table'],[1280,900,id,'table'],[390,740,id,'player'],[740,390,id,'player'],[1280,900,id,'player'],[390,740,id,'open']])];
 let capture=0;
 for(const [width,height,game,surface]of cases)for(const replay of [false,true])await t.test(`${game} ${surface||'combined'} ${width}x${height} ${replay?'replay':'live'}`,async()=>{
  await page.setViewportSize({width,height});
  const turn=await page.evaluate(({game,replay,surface})=>{
   const E=TabletopCore;let state=E.createGame(game,{seed:17,preset:'classic',openHands:surface==='open',players:Array.from({length:['durak','checkers'].includes(game)?2:4},(_,i)=>({name:['Иван','Мика','Тео','Луна'][i],bot:i>0}))});
   if(['domino','snakes'].includes(game))for(let i=0;i<14&&state.status!=='finished';i++)state=E.applyAction(state,state.turn,E.botAction(state));
   if(game==='checkers')state.turn=1;
   const viewer=surface==='table'?-1:game==='checkers'?1:0,projected=E.project(state,viewer),actions=replay?[]:E.legalActions(state,viewer);
   document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:E.get(game).name,subtitle:'За столом с ботами · Основные правила игры',state:projected,viewer,actions,scene:PlayroomViews.render(projected,viewer,actions,{selected:null,surface:['table','player'].includes(surface)?surface:'combined'}),turnText:'Ходит '+state.players[state.turn].name,turnExtra:'Ход '+state.move,footerText:'Последнее действие',replay,historyHTML:replay?PlayroomGameScreen.historyMarkup({index:state.move,count:state.move,caption:'Последнее действие'}):''});
   PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   return state.turn;
  },{game,replay,surface});
  await page.waitForTimeout(25);
  const result=await page.evaluate(turn=>{
   const stage=document.querySelector('.app-game-layout'),scene=document.querySelector('.scene'),s=scene.getBoundingClientRect(),errors=[];
   if(!stage)return {errors:['missing scene']};
   const visible=node=>!!node?.getClientRects().length;
   const within=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
   if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
   for(const selector of ['.layout-participants','.layout-field','.layout-self']){const node=document.querySelector(selector);if(visible(node)&&!within(node.getBoundingClientRect(),s))errors.push('slot outside: '+selector);}
   const board=document.querySelector('.checker-board,.snakes-board');if(visible(board)){const r=board.getBoundingClientRect();if(Math.abs(r.width-r.height)>1||r.width<80)errors.push('board geometry');}
   for(const node of document.querySelectorAll('.layout-hand .hand-card:not(.domino-tile)')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-64/91)>.025)errors.push('card aspect');}
   for(const node of document.querySelectorAll('.layout-hand .domino-tile')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-48/84)>.025)errors.push('domino aspect');}
   const tiles=stage.querySelector('.hand-track.is-tiles:not(.is-long-hand)');
   if(tiles){const box=tiles.getBoundingClientRect();if(tiles.scrollWidth>tiles.clientWidth+1)errors.push('starting tiles require horizontal scroll');for(const tile of tiles.children){const r=tile.getBoundingClientRect();if(!within(r,box))errors.push('starting tile clipped');}}
   const shared=stage.querySelector('.layout-shared'),field=stage.querySelector('.layout-field');
   if(shared&&field){const die=shared.querySelector('.die'),d=die?.getBoundingClientRect(),f=field.getBoundingClientRect();if(stage.querySelectorAll('.die').length!==1)errors.push('shared die duplicated');if(d){if(['phone-landscape','desktop'].includes(stage.dataset.layoutMode)){if(d.left<f.right-1)errors.push('die is not right of field');}else if(d.top<f.bottom-1)errors.push('die is not below field');}}
   if(shared&&['phone-landscape','desktop'].includes(stage.dataset.layoutMode)){
    const participants=stage.querySelector('.layout-participants'),first=participants?.querySelector('.player-panel');
    if(first&&first.getBoundingClientRect().top>field.getBoundingClientRect().top+12)errors.push('shared object pushes opponents down');
   }
   if(stage.classList.contains('checkers-scene')){
    if(stage.querySelector('.player-side,.player-status-badge'))errors.push('verbose checkers metadata');
    for(const counter of stage.querySelectorAll('[data-score-kind="pieces"]')){const r=counter.getBoundingClientRect();if(Math.abs(r.width-r.height)>1)errors.push('pieces counter is not round');}
    if(stage.querySelectorAll('[data-score-kind="pieces"]').length!==2)errors.push('missing piece counters');
   }
   const dominoBoard=document.querySelector('.domino-board');if(dominoBoard){const field=stage.querySelector('.layout-field');if(visible(dominoBoard)&&dominoBoard.scrollWidth>dominoBoard.clientWidth+1||dominoBoard.getBoundingClientRect().left<field.getBoundingClientRect().left-1||dominoBoard.getBoundingClientRect().right>field.getBoundingClientRect().right+1)errors.push('domino field overflow');for(const tile of dominoBoard.querySelectorAll('.domino-node>.domino-tile')){const r=tile.getBoundingClientRect(),aspect=tile.classList.contains('double')?4/7:7/4;if(Math.abs(r.width/r.height-aspect)>.03)errors.push('table domino aspect');}}
   for(const pip of document.querySelectorAll('.domino-art-face .pip')){const r=pip.getBoundingClientRect();if(Math.abs(r.width-r.height)>.2)errors.push('domino pip stretched');}
   const n=document.querySelectorAll('.player-panel').length;if(n!==document.querySelectorAll('.player-info').length||n<2)errors.push('players missing');
   const active=stage.querySelectorAll('.player-panel.is-turn'),inactive=stage.querySelector('.player-panel:not(.is-turn)');
   if(active.length!==1||Number(active[0]?.dataset.playerIndex)!==turn||active[0]?.getAttribute('aria-current')!=='true'||stage.querySelectorAll('.player-panel[aria-current="true"]').length!==1)errors.push('incorrect active player');
   if(active.length===1&&inactive){const current=getComputedStyle(active[0]),idle=getComputedStyle(inactive);if(current.backgroundColor===idle.backgroundColor||current.borderTopColor===idle.borderTopColor||parseFloat(current.borderTopWidth)<1)errors.push('active card lacks background or border highlight');if(current.borderTopWidth!==idle.borderTopWidth)errors.push('turn highlight changes card geometry');}
   if(stage.querySelector('.turn-badge'))errors.push('redundant turn badge');
   for(const badge of stage.querySelectorAll('.piece-count')){if(!visible(badge))continue;
    const r=badge.getBoundingClientRect(),parent=badge.classList.contains('is-hand')?badge.closest('.player-info'):badge.parentElement,p=parent.getBoundingClientRect();
    if(!within(r,p)||r.height<14||badge.textContent.trim()!==badge.dataset.pieceCount)errors.push('count badge clipped or unreadable: '+parent.className+' '+JSON.stringify({count:badge.dataset.pieceCount,x:r.x,y:r.y,w:r.width,h:r.height,p:{x:p.x,y:p.y,w:p.width,h:p.height}}));
    if(badge.classList.contains('is-corner')){if(Math.abs(r.left-p.left)>1||Math.abs(r.top-p.top)>1)errors.push('stock count is not top-left');}
    else if(!badge.classList.contains('is-hand')||!badge.closest('.player-info'))errors.push('hand count is not inside player info');
    if(badge.classList.contains('is-hand')){const style=getComputedStyle(badge);if(Math.abs(parseFloat(style.width)/parseFloat(style.height)-13/18)>.01||style.transform==='none')errors.push('hand count card shape');}
   }
   for(const panel of stage.querySelectorAll('.player-panel')){const count=panel.dataset.handCount,index=panel.dataset.playerIndex,own=panel.classList.contains('self-player'),badge=panel.querySelector('.player-info .piece-count.is-hand');if(count!==undefined&&badge?.dataset.pieceCount!==count)errors.push('missing or incorrect hand count for '+index);if(panel.querySelectorAll('.piece-count.is-hand').length!==(count!==undefined?1:0))errors.push('duplicate or missing hand count');}
   for(const panel of stage.querySelectorAll('.player-panel')){
    const heading=panel.querySelector('.player-heading'),role=heading?.querySelector('.participant-role'),name=heading?.querySelector('strong'),scores=panel.querySelector('.player-scores');
    if(!role||!name||!scores)errors.push('missing compact metadata');else{
     const r=role.getBoundingClientRect(),n=name.getBoundingClientRect(),b=scores.getBoundingClientRect();
     if(r.right>n.left+1||b.top<heading.getBoundingClientRect().bottom-1||!within(heading.getBoundingClientRect(),panel.getBoundingClientRect()))errors.push('metadata placement');
     if(getComputedStyle(role).color!==getComputedStyle(name).color)errors.push('local role must use text color');
     if(panel.querySelector('.player-info').textContent.match(/Бот|Игрок|очки:|победы:/))errors.push('redundant role or score label');
    }
   }
   if(stage.querySelector('.own-hand>.piece-count,.player-hand>.piece-count'))errors.push('hand count duplicated above hand');
   if(stage.dataset.surface==='table'&&stage.querySelector('.layout-hand,.layout-self,[data-action]:not(:disabled)'))errors.push('private or unauthorized controls on a spectator Table');
   if(document.querySelector('.player-strip,.table-bottom,.auto-saved,.snakes-legend,.checker-guide'))errors.push('duplicate chrome');
   for(const node of document.querySelectorAll('.table-header button')){const r=node.getBoundingClientRect();if(!r.width&&!r.height)continue;if(r.width<44||r.height<44||!within(r,{left:0,top:0,right:innerWidth,bottom:innerHeight}))errors.push('toolbar target '+node.dataset.command+' '+JSON.stringify({w:r.width,h:r.height,x:r.x,y:r.y}));}
   for(const hand of document.querySelectorAll('.player-panel .mini-hand')){if(!hand.getClientRects().length)continue;if(['auto','scroll'].includes(getComputedStyle(hand).overflowY)&&hand.scrollHeight>hand.clientHeight+1)errors.push('opponent vertical scroll');if(!hand.classList.contains('is-open')){const miniBox=hand.getBoundingClientRect(),first=hand.firstElementChild?.getBoundingClientRect(),last=hand.lastElementChild?.getBoundingClientRect();if(first&&last&&(first.left<miniBox.left-1||last.right>miniBox.right+1))errors.push('closed hand clipped horizontally');const cards=[...hand.children],steps=cards.slice(1).map((c,i)=>c.getBoundingClientRect().left-cards[i].getBoundingClientRect().left);if(steps.some(x=>Math.abs(x-steps[0])>1))errors.push('uneven opponent hand spacing');const wrap=hand.closest('.player-hand'),info=hand.closest('.player-panel').querySelector('.player-info');if(info&&wrap&&wrap.getBoundingClientRect().top-info.getBoundingClientRect().bottom>6)errors.push('gap between info and hand');}}
   if(document.querySelector('.table-title p')?.textContent.includes('За столом с ботами'))errors.push('redundant mode subtitle');
   for(const piece of document.querySelectorAll('.checker-piece.owner-1.is-playable'))if(getComputedStyle(piece).outlineColor!=='rgb(255, 220, 147)')errors.push('dark checker lacks contrasting outline');
   const self=stage.querySelector('.layout-self'),hand=self?.querySelector('.layout-hand'),info=self?.querySelector('.self-player');if(hand&&info&&info.getBoundingClientRect().top<hand.getBoundingClientRect().bottom-1)errors.push('self info above hand');
   return {errors,mode:stage.dataset.layoutMode,width:scene.clientWidth,height:scene.clientHeight};
  },turn);
  assert.deepEqual(result.errors,[]);assert.equal(result.mode,UI.selectLayout(result.width,result.height));
  if(process.env.PLAYROOM_CAPTURE_DIR&&(process.env.PLAYROOM_CAPTURE_ALL||!replay&&(capture<13||width===390&&height===740||width===640&&height===280))){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,process.env.PLAYROOM_CAPTURE_ALL?`${game}-${surface||'combined'}-${width}x${height}-${replay?'history':'live'}.png`:`${String(++capture).padStart(2,'0')}-${game}.png`)});}
 });
 await t.test('two counters and long names remain inside narrow player cards',async()=>{
  for(const width of [320,390,740]){
   await page.setViewportSize({width,height:width===740?390:740});
   await page.evaluate(()=>{
    const state={game:'uno',turn:0,move:0,players:Array.from({length:4},(_,i)=>({name:'Александр '+i,bot:i>0,score:99})),data:{}};
    const descriptor={api:2,family:'cards',elements:{field:'<div>Поле</div>'},playerContent:state.players.map(()=>({counters:[{kind:'points',value:99},{kind:'wins',value:12}]}))};
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'UNO',state,viewer:0,actions:[],scene:TabletopUI.composeScene(descriptor,{state,viewer:0}),turnText:'Ваш ход'});
    PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   });
   const result=await page.evaluate(()=>[...document.querySelectorAll('.player-panel')].map(p=>{const b=p.getBoundingClientRect();return [...p.querySelectorAll('.participant-role,strong,.player-score')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;})&&p.querySelectorAll('.player-score').length===2;}));
   assert(result.every(Boolean),'long names and both counters fit at '+width);
  }
 });
 await t.test('conditional action rows keep hand, metadata and field geometry unchanged',async()=>{
  for(const game of ['durak','domino'])for(const [width,height] of [[390,740],[740,390]]){
   await page.setViewportSize({width,height});
   await page.evaluate(game=>{const E=TabletopCore,state=E.createGame(game,{seed:17,players:[{name:'A'},{name:'B'}]}),viewer=0,projected=E.project(state,viewer);document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:game,state:projected,viewer,scene:PlayroomViews.render(projected,viewer,[],{}),turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));},game);
   const measure=()=>page.evaluate(()=>Object.fromEntries(['.layout-field','.layout-hand','.self-player','.layout-actions'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,[r.x,r.y,r.width,r.height]];})));
   const before=await measure();
   await page.evaluate(()=>{document.querySelector('.layout-actions .scene-actions').innerHTML='<button class="scene-button">Пропустить ход</button>';PlayroomGameScreen.layoutScene(document.querySelector('#app'));});
   const after=await measure();assert(before['.layout-actions'][3]>=44);
   for(const selector of Object.keys(before))assert(before[selector].every((value,index)=>Math.abs(value-after[selector][index])<=1),game+' '+width+' '+selector+' moved');
  }
 });
 await context.close();
 }finally{await browser.close();}
});

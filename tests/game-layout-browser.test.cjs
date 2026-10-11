'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const UI=require('../core/ui.js'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sourceSizes=[[590,1032,'snakes'],[1647,973,'snakes'],[1874,550,'durak'],[1397,543,'snakes'],[1055,692,'durak'],[1065,967,'snakes'],[687,538,'domino'],[1742,488,'domino'],[1609,481,'domino'],[832,1032,'domino'],[724,1032,'domino'],[737,1032,'checkers'],[898,1032,'checkers']];
test('elements API rejects malformed content and geometry',()=>{for(const value of ['old',{api:1},{api:2,family:'cards',elements:{field:''}},{api:2,family:'board',elements:{field:'x',unknown:'x'}},{api:2,family:'board',fieldAspect:0,elements:{field:'x'}},{api:2,family:'cards',elements:{field:'x'},playerContent:[{handCount:-1}]}])assert.throws(()=>UI.composeScene(value));});
test('all packs share player panels and preserve geometry across reported screens, replay and rotation',{timeout:180000,skip:!['uno','domino','durak','checkers','snakes'].every(id=>fs.existsSync(path.join(root,'packs',id,'rules.js')))},async t=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div></body></html>');
 for(const f of ['app/styles.css','app/design-system.css','core/ui.css',...['uno','durak','domino','checkers','snakes'].map(id=>`packs/${id}/styles.css`)])await page.addStyleTag({content:read(f)});
 for(const f of ['core/engine.js','core/ui.js','app/views.js','app/game-screen.js',...['uno','durak','domino','checkers','snakes'].flatMap(id=>[`packs/${id}/rules.js`,`packs/${id}/view.js`])])await page.addScriptTag({content:read(f)});
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
   const within=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
   if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
   for(const selector of ['.layout-participants','.layout-field','.layout-self']){const node=document.querySelector(selector);if(node&&!within(node.getBoundingClientRect(),s))errors.push('slot outside: '+selector);}
   const board=document.querySelector('.checker-board,.snakes-board');if(board){const r=board.getBoundingClientRect();if(Math.abs(r.width-r.height)>1||r.width<80)errors.push('board geometry');}
   for(const node of document.querySelectorAll('.layout-hand .hand-card:not(.domino-tile)')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-64/91)>.025)errors.push('card aspect');}
   for(const node of document.querySelectorAll('.layout-hand .domino-tile')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-48/84)>.025)errors.push('domino aspect');}
   const dominoBoard=document.querySelector('.domino-board');if(dominoBoard){const field=stage.querySelector('.layout-field');if(dominoBoard.scrollWidth>dominoBoard.clientWidth+1||dominoBoard.getBoundingClientRect().left<field.getBoundingClientRect().left-1||dominoBoard.getBoundingClientRect().right>field.getBoundingClientRect().right+1)errors.push('domino field overflow');for(const tile of dominoBoard.querySelectorAll('.domino-node>.domino-tile')){const r=tile.getBoundingClientRect(),aspect=tile.classList.contains('double')?30/52:60/34;if(Math.abs(r.width/r.height-aspect)>.03)errors.push('table domino aspect');}}
   const n=document.querySelectorAll('.player-panel').length;if(n!==document.querySelectorAll('.player-info').length||n<2)errors.push('players missing');
   const active=stage.querySelectorAll('.player-panel.is-turn'),inactive=stage.querySelector('.player-panel:not(.is-turn)');
   if(active.length!==1||Number(active[0]?.dataset.playerIndex)!==turn||active[0]?.getAttribute('aria-current')!=='true'||stage.querySelectorAll('.player-panel[aria-current="true"]').length!==1)errors.push('incorrect active player');
   if(active.length===1&&inactive){const current=getComputedStyle(active[0]),idle=getComputedStyle(inactive);if(current.backgroundColor===idle.backgroundColor||current.borderTopColor===idle.borderTopColor||parseFloat(current.borderTopWidth)<1)errors.push('active card lacks background or border highlight');if(current.borderTopWidth!==idle.borderTopWidth)errors.push('turn highlight changes card geometry');}
   if(stage.querySelector('.turn-badge'))errors.push('redundant turn badge');
   if(stage.dataset.surface==='table'&&stage.querySelector('.layout-hand,.layout-actions,.layout-self'))errors.push('personal controls on table');
   if(document.querySelector('.player-strip,.table-bottom,.auto-saved,.snakes-legend,.checker-guide'))errors.push('duplicate chrome');
   for(const node of document.querySelectorAll('.table-header button')){const r=node.getBoundingClientRect();if(!r.width&&!r.height)continue;if(r.width<44||r.height<44||!within(r,{left:0,top:0,right:innerWidth,bottom:innerHeight}))errors.push('toolbar target '+node.dataset.command+' '+JSON.stringify({w:r.width,h:r.height,x:r.x,y:r.y}));}
   for(const hand of document.querySelectorAll('.player-panel .mini-hand')){if(!hand.getClientRects().length)continue;if(hand.scrollHeight>hand.clientHeight+1)errors.push('opponent vertical scroll');if(!hand.classList.contains('is-open')){const miniBox=hand.getBoundingClientRect(),first=hand.firstElementChild?.getBoundingClientRect(),last=hand.lastElementChild?.getBoundingClientRect();if(first&&last&&(first.left<miniBox.left-1||last.right>miniBox.right+1))errors.push('closed hand clipped horizontally');const cards=[...hand.children],steps=cards.slice(1).map((c,i)=>c.getBoundingClientRect().left-cards[i].getBoundingClientRect().left);if(steps.some(x=>Math.abs(x-steps[0])>1))errors.push('uneven opponent hand spacing');const info=hand.parentElement.querySelector('.player-info');if(info&&hand.getBoundingClientRect().top-info.getBoundingClientRect().bottom>6)errors.push('gap between info and hand');}}
   if(document.querySelector('.table-title p')?.textContent.includes('За столом с ботами'))errors.push('redundant mode subtitle');
   for(const piece of document.querySelectorAll('.checker-piece.owner-1.is-playable'))if(getComputedStyle(piece).outlineColor!=='rgb(255, 220, 147)')errors.push('dark checker lacks contrasting outline');
   const self=stage.querySelector('.layout-self'),hand=self?.querySelector('.layout-hand'),info=self?.querySelector('.self-player');if(hand&&info&&info.getBoundingClientRect().top<hand.getBoundingClientRect().bottom-1)errors.push('self info above hand');
   return {errors,mode:stage.dataset.layoutMode,width:scene.clientWidth,height:scene.clientHeight};
  },turn);
  assert.deepEqual(result.errors,[]);assert.equal(result.mode,UI.selectLayout(result.width,result.height));
  if(process.env.PLAYROOM_CAPTURE_DIR&&(process.env.PLAYROOM_CAPTURE_ALL||!replay&&(capture<13||width===390&&height===740))){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,process.env.PLAYROOM_CAPTURE_ALL?`${game}-${surface||'combined'}-${width}x${height}-${replay?'history':'live'}.png`:`${String(++capture).padStart(2,'0')}-${game}.png`)});}
 });
 await context.close();
 }finally{await browser.close();}
});

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
 const cases=[...sourceSizes,...[...['uno','durak','domino','checkers','snakes']].flatMap(id=>[[320,640,id],[390,740,id],[740,390,id],[640,280,id],[1280,900,id]])];
 let capture=0;
 for(const [width,height,game]of cases)for(const replay of [false,true])await t.test(`${game} ${width}x${height} ${replay?'replay':'live'}`,async()=>{
  await page.setViewportSize({width,height});
  await page.evaluate(({game,replay})=>{
   const E=TabletopCore;let state=E.createGame(game,{seed:17,preset:'classic',players:Array.from({length:['durak','checkers'].includes(game)?2:4},(_,i)=>({name:['Иван','Мика','Тео','Луна'][i],bot:i>0}))});
   if(['domino','checkers','snakes'].includes(game))for(let i=0;i<14&&state.status!=='finished';i++)state=E.applyAction(state,state.turn,E.botAction(state));
   const viewer=0,projected=E.project(state,viewer),actions=replay?[]:E.legalActions(state,viewer);
   document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:E.get(game).name,subtitle:'За столом с ботами · Основные правила игры',state:projected,viewer,actions,scene:PlayroomViews.render(projected,viewer,actions,{selected:null}),turnText:'Ходит '+state.players[state.turn].name,turnExtra:'Ход '+state.move,footerText:'Последнее действие',replay,historyHTML:replay?PlayroomGameScreen.historyMarkup({index:state.move,count:state.move,caption:'Последнее действие'}):''});
   PlayroomGameScreen.layoutScene(document.querySelector('#app'));
  },{game,replay});
  await page.waitForTimeout(25);
  const result=await page.evaluate(()=>{
   const stage=document.querySelector('.app-game-layout'),scene=document.querySelector('.scene'),s=scene.getBoundingClientRect(),errors=[];
   if(!stage)return {errors:['missing scene']};
   const within=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
   if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
   for(const selector of ['.layout-participants','.layout-field','.layout-self']){const node=document.querySelector(selector);if(node&&!within(node.getBoundingClientRect(),s))errors.push('slot outside: '+selector);}
   const board=document.querySelector('.checker-board,.snakes-board');if(board){const r=board.getBoundingClientRect();if(Math.abs(r.width-r.height)>1||r.width<80)errors.push('board geometry');}
   for(const node of document.querySelectorAll('.layout-hand .hand-card:not(.domino-tile)')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-64/91)>.025)errors.push('card aspect');}
   for(const node of document.querySelectorAll('.layout-hand .domino-tile')){const r=node.getBoundingClientRect();if(Math.abs(r.width/r.height-48/84)>.025)errors.push('domino aspect');}
   const n=document.querySelectorAll('.player-panel').length;if(n!==document.querySelectorAll('.player-info').length||n<2)errors.push('players missing');
   if(document.querySelector('.player-strip,.table-bottom,.auto-saved,.snakes-legend,.checker-guide'))errors.push('duplicate chrome');
   for(const node of document.querySelectorAll('.table-header button')){const r=node.getBoundingClientRect();if(r.width<44||r.height<44||!within(r,{left:0,top:0,right:innerWidth,bottom:innerHeight}))errors.push('toolbar target '+node.dataset.command+' '+JSON.stringify({w:r.width,h:r.height,x:r.x,y:r.y}));}
   return {errors,mode:stage.dataset.layoutMode,width:scene.clientWidth,height:scene.clientHeight};
  });
  assert.deepEqual(result.errors,[]);assert.equal(result.mode,UI.selectLayout(result.width,result.height));
  if(process.env.PLAYROOM_CAPTURE_DIR&&!replay&&capture<13){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`${String(++capture).padStart(2,'0')}-${game}.png`)});}
 });
 await context.close();
 }finally{await browser.close();}
});

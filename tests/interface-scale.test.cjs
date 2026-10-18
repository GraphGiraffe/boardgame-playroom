'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Scale=require('../platform/web/interface-scale.js'),{chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),shots=path.join(root,'tmp_files/interface-scale');
test('interface scale validates preferences and reserves tested phone geometry',()=>{
 for(const value of [50,60,100,120,150])assert.equal(Scale.normalize(value),value);
 for(const value of [undefined,null,'120',NaN,Infinity,0,49,105,151])assert.equal(Scale.normalize(value),100);
 for(const [w,h,max]of [[320,640,100],[390,844,120],[844,390,110],[640,280,100],[1440,900,150],[1024,768,120]])assert.equal(Scale.maximum(w,h),max);
});
async function fixture(run,{width=390,height=844,settings={}}={}){
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<1000}),page=await context.newPage(),errors=[];
 await context.addInitScript(settings=>{if(!sessionStorage.getItem('scale-seeded')){sessionStorage.setItem('scale-seeded','1');localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',...settings}));}},settings);
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
 try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();fs.mkdirSync(shots,{recursive:true});await run(page);assert.deepEqual(errors,[]);}finally{await context.close();await browser.close();await server.close();}
}
async function change(page,id,value){await page.locator('#'+id).evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
test('settings sliders keep all ticks, clamp unavailable scale, preserve nodes and restore preferences',async()=>fixture(async page=>{
 await page.locator('[data-command=settings]:visible').first().click();
 assert.equal(await page.locator('#setting-sound').count(),0);
 for(const [id,count]of [['setting-scale',11],['setting-speed',4],['setting-volume',4]]){assert.equal(await page.locator('#'+id).getAttribute('type'),'range');assert.equal(await page.locator('#'+id).locator('..').locator('[data-range-stop]').count(),count);}
 assert.equal(await page.locator('#setting-scale').inputValue(),'100');assert.equal(await page.locator('#setting-scale').getAttribute('max'),'150');assert.equal(await page.locator('#setting-scale').getAttribute('data-allowed-max'),'120');
 assert(await page.locator('#setting-scale').evaluate(e=>e.closest('.settings-range').compareDocumentPosition(document.querySelector('.settings-grid'))&Node.DOCUMENT_POSITION_PRECEDING));
 await page.evaluate(()=>window.scaleInput=document.getElementById('setting-scale'));
 await change(page,'setting-scale',150);assert.equal(await page.locator('#setting-scale').inputValue(),'120');assert.equal(await page.locator('#setting-scale-value').textContent(),'120%');assert(await page.evaluate(()=>scaleInput===document.getElementById('setting-scale')));
 await page.locator('#setting-scale').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#setting-scale').inputValue(),'120');
 await page.keyboard.press('End');assert.equal(await page.locator('#setting-scale').inputValue(),'120');const rail=await page.locator('#setting-scale').boundingBox();await page.mouse.click(rail.x+rail.width-3,rail.y+rail.height/2);assert.equal(await page.locator('#setting-scale').inputValue(),'120','grey positions cannot be clicked');
 const dots=await page.locator('#setting-scale').locator('..').locator('[data-range-stop]').evaluateAll(nodes=>nodes.map(n=>!n.hidden));assert.equal(dots.length,11);assert(dots.every(Boolean));
 await change(page,'setting-volume',2);assert.equal(await page.locator('#setting-volume-value').textContent(),'Средне');assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).sound));
 await change(page,'setting-volume',0);assert.equal(await page.locator('#setting-volume-value').textContent(),'Без звука');assert.equal(await page.locator('#setting-volume').isDisabled(),false);assert.equal(await page.locator('#sound-preview').isDisabled(),true);
 await change(page,'setting-speed',1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).animationSpeed),'fast');
 await page.locator('#setting-scale').locator('..').locator('..').scrollIntoViewIfNeeded();await page.locator('#setting-scale').evaluate(e=>e.blur());await page.screenshot({path:path.join(shots,'settings-390-120.png')});
 await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-interface-scale'),'120');
 await page.setViewportSize({width:320,height:640});await page.waitForFunction(()=>PlayroomInterfaceScale.applied===100);assert.equal(await page.evaluate(()=>PlayroomInterfaceScale.requested),120);
 await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>PlayroomInterfaceScale.applied===110);assert.equal(await page.evaluate(()=>PlayroomInterfaceScale.requested),120);await page.locator('[data-command=settings]:visible').first().click();await page.locator('#setting-scale').locator('..').locator('..').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'settings-844-110.png')});
}));
test('all packs keep square boards and contained slots at every available scale position', {timeout:90000},async()=>fixture(async page=>{
 for(const [width,height]of [[320,640],[390,844],[844,390],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});
  const limit=await page.evaluate(()=>PlayroomInterfaceScale.limit);
  for(const scale of Array.from({length:(limit-50)/10+1},(_,i)=>50+i*10))for(const game of ['uno','durak','domino','checkers','snakes','ludo','yatzy','gofish','oldmaid','pexeso','battleship','tictactoe']){
   const errors=await page.evaluate(({scale,game})=>{
    PlayroomInterfaceScale.set(scale);const E=TabletopCore,state=E.createGame(game,{seed:17,players:Array.from({length:E.get(game).max},(_,i)=>({name:'Игрок '+i,bot:i>0}))}),s=E.project(state,0),actions=E.legalActions(state,0);
    PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:E.get(game).name,state:s,viewer:0,scene:PlayroomViews.render(s,0,actions,{}),turnText:'Ваш ход'}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    const errors=[],scene=document.querySelector('.scene').getBoundingClientRect();
    if(scene.bottom>innerHeight+1||scene.right>innerWidth+1)errors.push('scene outside viewport '+JSON.stringify(scene.toJSON()));
    for(const selector of ['.layout-self','.layout-field','.layout-participants']){const el=document.querySelector(selector);if(!el?.getClientRects().length)continue;const r=el.getBoundingClientRect();if(r.left<scene.left-1||r.right>scene.right+1||r.top<scene.top-1||r.bottom>scene.bottom+1)errors.push('slot outside '+selector+' '+JSON.stringify(r.toJSON()));}
    const participants=document.querySelector('.layout-participants');if(participants?.getClientRects().length&&getComputedStyle(participants).overflowY==='auto'&&participants.scrollHeight>participants.clientHeight+3)errors.push('players require scroll '+participants.scrollHeight+'/'+participants.clientHeight);
    const board=document.querySelector('.snakes-board,.ludo-board,.checker-board');if(board){const r=board.getBoundingClientRect();if(Math.abs(r.width-r.height)>1)errors.push('board aspect');}
    for(const name of document.querySelectorAll('.player-heading strong')){if(!name.getClientRects().length)continue;const style=getComputedStyle(name);if(name.getBoundingClientRect().height>parseFloat(style.lineHeight)*3.1*(PlayroomInterfaceScale.applied/100))errors.push('unreadable vertical name '+name.textContent+' '+JSON.stringify({height:name.getBoundingClientRect().height,width:name.getBoundingClientRect().width,line:style.lineHeight,offset:name.offsetHeight,cols:document.querySelector('.app-game-layout').style.getPropertyValue('--focus-player-columns'),grid:getComputedStyle(document.querySelector('.players-panels')).gridTemplateColumns}));}
    if(document.documentElement.scrollWidth>innerWidth+1)errors.push('horizontal overflow');return errors;
   },{scale,game});if(errors.length)await page.screenshot({path:path.join(shots,`failure-${game}-${width}-${scale}.png`)});assert.deepEqual(errors,[],`${game} ${width}x${height} ${scale}%`);
   if((scale===50||scale===limit)&&['uno','snakes','gofish'].includes(game)&&[390,844].includes(width))await page.screenshot({path:path.join(shots,`${game}-${width}-${scale}.png`)});
  }
 }
}));

test('scaled live games preserve their session and card input uses screen coordinates',{timeout:30000},async()=>fixture(async page=>{
 for(const [width,height,scale]of [[390,844,50],[390,844,120],[844,390,110]]){
  await page.setViewportSize({width,height});
  const card=await page.evaluate(scale=>{
   const session=new TabletopSession(TabletopCore,'uno',{seed:17,mode:'solo',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Иван'},{name:'Мика'}]}),action=TabletopCore.legalActions(session.current,0).find(a=>a.type==='play'&&a.color===undefined);
   if(!action)throw Error('fixture requires a playable non-wild card');
   localStorage.setItem('playroom.session.v1',JSON.stringify(session.export()));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast',quickPlay:false,interfaceScale:scale}));return action.card;
  },scale);
  await page.reload();await page.locator('.resume-banner [data-command=resume]').click();await page.locator('.own-hand').waitFor();
  assert.equal(await page.evaluate(()=>PlayroomInterfaceScale.applied),scale);
  const source=page.locator(`.hand-track [data-entity="card-${card}"]`);await source.click({position:{x:3,y:8}});
  const target=page.locator(`.uno-drop-target[data-drop-piece="${card}"][data-action]`);await target.waitFor();
  const from=await source.boundingBox(),to=await target.boundingBox();
  await page.mouse.move(from.x+5,from.y+12);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===1);
  await page.waitForFunction(()=>document.querySelector('.scene').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move),1);
  await page.locator('.table-tools [data-command=settings]').click();const before=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));
  await change(page,'setting-scale',100);assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),before,'scale is a local preference, not a game command');
  await page.locator('.modal [data-command=close-modal]').first().click();
 }
}));

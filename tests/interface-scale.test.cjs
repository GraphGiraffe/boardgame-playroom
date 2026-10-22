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
    // The game scene is not CSS-zoomed: computed line-height already uses screen CSS pixels.
    for(const name of document.querySelectorAll('.player-heading strong')){if(!name.getClientRects().length)continue;const style=getComputedStyle(name);if(name.getBoundingClientRect().height>parseFloat(style.lineHeight)*3.1)errors.push('unreadable vertical name '+name.textContent+' '+JSON.stringify({height:name.getBoundingClientRect().height,width:name.getBoundingClientRect().width,line:style.lineHeight,offset:name.offsetHeight,cols:document.querySelector('.app-game-layout').style.getPropertyValue('--focus-player-columns'),grid:getComputedStyle(document.querySelector('.players-panels')).gridTemplateColumns}));}
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

test('standard size catalogue has discrete monotonic families and valid component roles',()=>{
 const Sizes=require('../platform/web/element-sizes.js');
 for(const family of Object.values(Sizes.catalogue.families)){assert.deepEqual(family,[...new Set(family)].sort((a,b)=>a-b));}
 for(const [width,height] of [[390,844],[844,390],[1280,800]]){
  let previous=0;for(const scale of Sizes.catalogue.scaleStops){const sizes=Sizes.resolve(scale,width,height);assert(Sizes.catalogue.families.card.includes(sizes.card));assert(sizes.card>=previous);assert(sizes.control>=32);previous=sizes.card;}
 }
 assert.equal(Sizes.resolve(100,390,844).card,50);assert.equal(Sizes.resolve(50,390,844).card,24);
});

test('standard size roles match across packs and shrink without compensating root zoom',{timeout:60000},async()=>fixture(async page=>{
 for(const [width,height]of [[390,844],[844,390]]){
  await page.setViewportSize({width,height});
  for(const scale of [100,70,50])for(const game of ['spider','klondike','uno','durak','gofish','oldmaid','domino','pexeso','checkers','snakes','ludo','yatzy','battleship','tictactoe']){
   const result=await page.evaluate(async({scale,game})=>{
    PlayroomInterfaceScale.set(scale);const E=TabletopCore,definition=E.get(game),state=E.createGame(game,{seed:17,players:Array.from({length:definition.min},(_,i)=>({name:'Игрок '+i,bot:i>0}))}),s=E.project(state,0),host=document.querySelector('#app');
    PlayroomGameScreen.update(host,PlayroomGameScreen.render({gameName:definition.name,state:s,viewer:0,scene:PlayroomViews.render(s,0,E.legalActions(state,0),{}),turnText:'Ваш ход'}));PlayroomGameScreen.allowLayoutChange(host,{allowLayoutChange:true});PlayroomGameScreen.layoutScene(host);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const card=host.querySelector('.solitaire-card,.layout-hand .hand-card'),resolved=PlayroomElementSizes.resolve(scale,innerWidth,innerHeight),size=game==='domino'?parseFloat(getComputedStyle(card.closest('.hand-track')).getPropertyValue('--tile-width')):card?.classList.contains('solitaire-card')?parseFloat(getComputedStyle(card).getPropertyValue('--size-card')):resolved['hand-card'],ratio=game==='domino'?1.75:1.4,board=host.querySelector('.checker-board,.ludo-board,.snakes-board');
    const physical=[...host.querySelectorAll('.layout-field [data-size-role=card]')].filter(e=>!e.closest('.pexeso-grid')).map(e=>({width:parseFloat(getComputedStyle(e).width),height:parseFloat(getComputedStyle(e).height),size:parseFloat(getComputedStyle(e).getPropertyValue('--size-card'))}));
    return {bodyFont:parseFloat(getComputedStyle(document.body).fontSize),expectedBodyFont:PlayroomElementSizes.nearest('type',16*scale/100),physical,ratio,width:card?parseFloat(getComputedStyle(card).width):null,height:card?parseFloat(getComputedStyle(card).height):null,size,zoom:getComputedStyle(host).zoom,overflow:document.documentElement.scrollWidth>innerWidth+1,sceneBottom:host.querySelector('.scene').getBoundingClientRect().bottom,viewportHeight:innerHeight,board:board?{width:board.getBoundingClientRect().width,height:board.getBoundingClientRect().height}:null};
   },{scale,game});
   assert.equal(result.bodyFont,result.expectedBodyFont,game+' inherited font size');assert.equal(Number(result.zoom),1,game+' root zoom');assert.equal(result.overflow,false,game+' document overflow');assert(result.sceneBottom<=result.viewportHeight+1,game+' scene outside viewport');
   if(result.width!==null){assert(Math.abs(result.width-result.size)<1,`${game} ${width} ${scale}: ${result.width} != ${result.size}`);assert(Math.abs(result.height-result.size*result.ratio)<1,game+' ratio');}
   for(const physical of result.physical){assert(Math.abs(physical.width-physical.size)<1,game+' field card width');assert(Math.abs(physical.height-physical.size*1.4)<1,game+' field card height');}
   if(result.board)assert(Math.abs(result.board.width-result.board.height)<1,game+' square');
  }
 }
}));

test('standard grid profiles use complete tile spans and standard physical spacing',()=>{
 const S=require('../platform/web/element-sizes.js');
 for(const width of [320,390,600,768,844,1000,1280,1920])for(const percent of S.catalogue.scaleStops){const grid=S.layoutGrid(width,percent);assert([4,8,12].includes(grid.columns));assert.equal(grid.tileColumns*4,grid.columns);assert(S.catalogue.families.space.includes(grid.margin));assert(S.catalogue.families.space.includes(grid.gutter));assert.equal(grid.maxContentWidth,1280);}
 assert.equal(S.layoutGrid(390,100).columns,8);assert.equal(S.layoutGrid(390,50).columns,8);assert.equal(S.layoutGrid(640,100,280).tileColumns,3);assert.equal(S.layoutGrid(1280,100).columns,12);
});

test('standard layout guides follow real content and never intercept input or change geometry',{timeout:30000},async()=>fixture(async page=>{
 const settings=page.locator('.topbar-tools [data-command=settings]').first(),before=await settings.boundingBox();
 await page.evaluate(()=>PlayroomLayoutGuides.show({baseline:8,columns:true,centers:true,zones:true}));
 assert.equal(await page.locator('#playroom-layout-guides [data-guide-column]').count(),8);assert(await page.locator('#playroom-layout-guides [data-guide-padding]').count()>0);assert.equal(await page.locator('#playroom-layout-guides').getAttribute('aria-hidden'),'true');assert.equal(await page.locator('#playroom-layout-guides').evaluate(e=>getComputedStyle(e).pointerEvents),'none');assert.deepEqual(await settings.boundingBox(),before);
 const geometry=await page.evaluate(()=>PlayroomLayoutGuides.geometry());assert(geometry.content.left>=0&&geometry.content.right<=390);assert.equal(geometry.grid.columns,8);
 await settings.click();await page.locator('#setting-scale').waitFor();await change(page,'setting-scale',50);await page.waitForFunction(()=>document.querySelectorAll('#playroom-layout-guides [data-guide-column]').length===8);assert.equal(await page.locator('#setting-scale').inputValue(),'50');
 await page.evaluate(()=>PlayroomLayoutGuides.hide());assert.equal(await page.locator('#playroom-layout-guides').count(),0);
}));

test('standard portal icons stay centered at reduced density',{timeout:30000},async()=>fixture(async page=>{
 const centered=async selector=>{const rect=await page.locator(selector).first().evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('svg').getBoundingClientRect();return {dx:b.x+b.width/2-a.x-a.width/2,dy:b.y+b.height/2-a.y-a.height/2};});assert(Math.abs(rect.dx)<=1&&Math.abs(rect.dy)<=1,selector+' '+JSON.stringify(rect));};
 await page.locator('.topbar-tools [data-command=settings]').first().click();await change(page,'setting-scale',50);await page.locator('.settings-personal [data-avatar-picker]').click();await page.locator('.avatar-options').waitFor();await centered('#avatar-picker-root .icon-btn');await page.locator('[data-avatar-option=circle-red]').click();await page.locator('.modal [data-command=close-modal]').first().click();await page.evaluate(()=>PlayroomAppearanceUI.openEditor());await page.locator('.appearance-dialog').waitFor();await centered('.appearance-dialog .icon-btn');
}));

test('phone library preserves two portrait and three landscape columns with side navigation at every density',{timeout:60000},async()=>fixture(async page=>{
 for(const [width,height,columns]of [[320,640,2],[390,844,2],[640,280,3],[844,390,3]]){
  await page.setViewportSize({width,height});
  for(const scale of [50,100,150]){
   await page.evaluate(scale=>PlayroomInterfaceScale.set(scale),scale);
   const state=await page.evaluate(()=>{const grid=document.querySelector('.game-grid'),side=document.querySelector('.sidebar'),nav=document.querySelector('.side-nav'),main=document.querySelector('.hub-main');return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,featured:[...grid.querySelectorAll('.featured')].map(e=>getComputedStyle(e).gridColumnEnd),sidebar:getComputedStyle(side).display,navPosition:getComputedStyle(nav).position,sideRight:side.getBoundingClientRect().right,mainLeft:main.getBoundingClientRect().left,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(state.columns,columns,JSON.stringify({width,height,scale,state}));assert(!state.overflow);assert(state.featured.every(x=>x==='auto'));
   if(width>height){assert.equal(state.sidebar,'flex');assert.equal(state.navPosition,'static');assert(state.sideRight<=state.mainLeft+1);}else assert.equal(state.navPosition,'fixed');
  }
 }
}));

test('release0.18.3 defines the100% menu and settings baseline independently of game-piece scale',{timeout:30000},async()=>fixture(async page=>{
 await page.setViewportSize({width:384,height:797});await page.evaluate(()=>PlayroomInterfaceScale.set(100));
 const hub=await page.evaluate(()=>({heading:parseFloat(getComputedStyle(document.querySelector('.intro h1')).fontSize),description:parseFloat(getComputedStyle(document.querySelector('.intro p')).fontSize),button:document.querySelector('.topbar-tools .icon-btn').getBoundingClientRect().width,columns:getComputedStyle(document.querySelector('.game-grid')).gridTemplateColumns.split(' ').length,zoom:Number(getComputedStyle(document.querySelector('.app-shell')).zoom),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}));
 assert(Math.abs(hub.heading-31.9872)<.05);assert.equal(hub.description,12);assert.equal(hub.button,44);assert.equal(hub.columns,2);assert.equal(hub.zoom,1);assert(!hub.overflow);
 await page.locator('.topbar-tools [data-command=settings]').first().click();assert.equal(await page.locator('.modal h2').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),18);
 await change(page,'setting-scale',50);assert.equal(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.app-shell')).zoom)),.5);assert.equal(await page.evaluate(()=>PlayroomElementSizes.resolve(50,innerWidth,innerHeight).card),24);
}));

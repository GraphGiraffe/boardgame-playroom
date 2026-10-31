'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
const captures=path.resolve(root,'../tmp_files/themes-020');fs.mkdirSync(captures,{recursive:true});

async function fixture(run) {
  const server=await serveBrowserFixture(process.env.PLAYROOM_BROWSER_ROOT||process.env.PLAYROOM_SOCIAL_FIXTURE||root);
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'appearance-test',name:'Иван',createdAt:1,updatedAt:1}));
    localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',autoPass:false}));
  });
  try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{for(const id of Object.keys(PlayroomCatalog))PlayroomFirstTurnGuide.setEnabled(id,false);});await run({page,context});assert.deepEqual(errors,[]);}
  finally{await context.close();await browser.close();await server.close();}
}
async function choose(page,id) {
 const openedSettings=!(await page.locator('[data-theme-toggle]:visible').count());
 if(openedSettings)await page.locator('[data-command=settings]:visible').first().click();
 if(await page.locator('html').getAttribute('data-appearance-mode')!==id)await page.locator('[data-theme-toggle]').click();
 assert.equal(await page.locator('.appearance-editor,.appearance-picker').count(),0);
 if(openedSettings)await page.locator('#modal-root [data-command=close-modal]').first().click();
}

function contrast(foreground,background) {
  const luminance=color=>{
    const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(value=>parseInt(value,16)):color.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);
    return rgb.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  };
  const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('settings toggle applies immediately, stays OLED black, remembers mode and has no theme dialog',{timeout:45000},async()=>fixture(async({page})=>{
 assert.equal(await page.locator('[data-appearance-editor],[data-appearance-picker],.hub-theme-tabs').count(),0);
 await page.locator('#app [data-command=settings]').first().click();assert.equal(await page.locator('[data-theme-toggle] [data-ui-icon=sun]').count(),1);await page.locator('[data-theme-toggle]').click();
 assert.equal(await page.locator('[data-theme-toggle] [data-ui-icon=moon]').count(),1);assert.equal(await page.locator('.appearance-editor,.appearance-picker').count(),0);
 const colors=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,meta:document.querySelector('meta[name=color-scheme]').content}));assert.deepEqual(colors,{html:'rgb(0, 0, 0)',body:'rgb(0, 0, 0)',meta:'dark'});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId),'dark');await page.screenshot({path:path.join(captures,'settings-dark-390.png')});await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'dark');
 for(const width of [320,390]){await page.setViewportSize({width,height:740});const size=await page.locator('.side-nav').evaluate(e=>({width:e.clientWidth,tabs:e.querySelector('.hub-page-tabs').getBoundingClientRect().width}));assert(Math.abs(size.width-size.tabs)<=2);assert.equal(await page.locator('.hub-page-tabs>.nav-item').count(),2);await page.screenshot({path:path.join(captures,'hub-dark-'+width+'.png')});}
 await choose(page,'light');assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'light');
}));

test('switching preserves local table, scrolling, history slider and an already open settings dialog',{timeout:60000},async()=>fixture(async({page})=>{
  await page.evaluate(()=>{
    const session=new TabletopSession(TabletopCore,'yatzy',{seed:17,mode:'solo',players:[{name:'Иван'},{name:'Сэм'}]});
    session.act(0,{type:'roll'});
    const library=new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks);
    library.activate(session,'appearance-yatzy');
  });
  await page.reload();await page.locator('[data-command=resume]').click();await page.locator('.yatzy-board').waitFor();
  const before=await page.evaluate(()=>{
    const board=document.querySelector('.yatzy-board');board.scrollTop=65;board.scrollLeft=25;
    window.appearanceBoard=board;
    return {raw:PlayroomData.getItem('playroom.session.v1'),top:board.scrollTop,left:board.scrollLeft,rect:board.getBoundingClientRect().toJSON()};
  });
  const materialBefore=await page.locator('.shared-die-art rect[stroke]').first().evaluate(node=>getComputedStyle(node).stroke);
  await choose(page,'dark');
  const materialAfter=await page.locator('.shared-die-art rect[stroke]').first().evaluate(node=>getComputedStyle(node).stroke);
  assert.notEqual(materialAfter,materialBefore,'The live shared die uses local theme material bindings');
  const after=await page.evaluate(()=>{const b=document.querySelector('.yatzy-board');return {same:b===window.appearanceBoard,raw:PlayroomData.getItem('playroom.session.v1'),top:b.scrollTop,left:b.scrollLeft,rect:b.getBoundingClientRect().toJSON()};});
  assert(after.same);assert.equal(after.raw,before.raw);assert.equal(after.top,before.top);assert.equal(after.left,before.left);assert.deepEqual(after.rect,before.rect);
  const colors=await page.evaluate(()=>{
    const header=getComputedStyle(document.querySelector('.yatzy-score thead th'));
    return {header:header.color,face:header.backgroundColor,hint:getComputedStyle(document.querySelector('.yatzy-score tbody th')).color,canvas:getComputedStyle(document.documentElement).getPropertyValue('--color-surface-game').trim()};
  });
  assert(contrast(colors.header,colors.face)>=4.5);assert(contrast(colors.hint,colors.canvas)>=4.5);
  await page.screenshot({path:path.join(captures,'dark-yatzy-390.png')});
  await page.locator('.table-tools [data-command=settings]').click();
  await page.evaluate(()=>window.appearanceSettings=document.querySelector('#modal-root .modal'));
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(()=>document.querySelector('#modal-root .modal')===window.appearanceSettings),true);
  await choose(page,'light');
  assert.equal(await page.evaluate(()=>document.querySelector('#modal-root .modal')===window.appearanceSettings),true);
  await page.locator('#modal-root [data-command=close-modal]').click();
  await page.locator('.table-tools [data-command=history]').click();await page.locator('#replay-range').waitFor();
  await page.evaluate(()=>{window.appearanceRange=document.querySelector('#replay-range');window.appearanceRange.value='0';window.appearanceRange.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(100);
  const value=await page.locator('#replay-range').inputValue();await choose(page,'dark');
  assert.equal(await page.evaluate(()=>document.querySelector('#replay-range')===window.appearanceRange),true);
  assert.equal(await page.locator('#replay-range').inputValue(),value);
  assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1')),before.raw);
  await page.setViewportSize({width:320,height:640});
  assert.equal(await page.locator('.table-tools [data-appearance-picker]').count(),0);
  await page.locator('.table-tools [data-command=settings]').click();
  await choose(page,'light');
  assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'light');
}));

test('projected shared screen switches appearance without publishing a game command',{timeout:45000},async()=>fixture(async({page})=>{
  await page.evaluate(async()=>{
    const session=new TabletopSession(TabletopCore,'yatzy',{seed:17,players:[{name:'Иван'},{name:'Тео'}]});
    session.act(0,{type:'roll'});
    const authority=new SessionAuthority(session),connection=authority.connect(0);
    const client=new PlayroomSessionClient(PlayroomLocalTransport(connection));await client.refresh();
    const mounted=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('yatzy',session.packVersion),{surface:'combined'});
    mounted.render();
    window.appearanceNetwork={authority,client,mounted,board:document.querySelector('.yatzy-board'),state:JSON.stringify(client.snapshot)};
  });
  await page.locator('.network-game .yatzy-board').waitFor();await choose(page,'dark');
  const result=await page.evaluate(()=>({same:document.querySelector('.yatzy-board')===appearanceNetwork.board,state:JSON.stringify(appearanceNetwork.client.snapshot)===appearanceNetwork.state,pending:appearanceNetwork.client.pending,revision:appearanceNetwork.authority.revision}));
  assert.deepEqual(result,{same:true,state:true,pending:null,revision:1});
  await page.evaluate(()=>{appearanceNetwork.mounted.destroy();appearanceNetwork.client.close();appearanceNetwork.authority.dispose();});
}));

test('game skins live in settings, hide single choices and apply without a separate dialog',{timeout:45000},async()=>fixture(async({page})=>{
 await page.locator('#app [data-command=settings]').first().click();assert.equal(await page.locator('#skin-preferences').count(),0);await page.locator('#modal-root [data-command=close-modal]').click();
 await page.locator('[data-start=klondike]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.game-scene[data-appearance-pack=klondike]').waitFor();await page.locator('.table-tools [data-command=settings]').click();
 assert.equal(await page.locator('#skin-preferences [data-skin-family=card-face]').count(),6);assert.equal(await page.locator('[data-skin-group=two-color] [data-skin-variant]').count(),3);assert.equal(await page.locator('[data-skin-group=four-color] [data-skin-variant]').count(),3);
 const before=await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1'));await page.locator('[data-skin-family=card-face][data-skin-variant=mini-split]').click();assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1')),before);assert.equal(await page.locator('[data-skin-family=card-face][data-skin-variant=mini-split]').getAttribute('aria-pressed'),'true');
 for(const width of [320,390]){await page.setViewportSize({width,height:740});assert(await page.locator('#skin-preferences').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 assert.equal(await page.locator('[data-skin-family=character-face],[data-avatar-style-choice],.appearance-editor').count(),0);
}));

test('avatars always use characters, migrate old geometric preferences and keep source geometry outside runtime',{timeout:45000},async()=>fixture(async({page})=>{
 await page.evaluate(()=>localStorage.setItem('playroom.appearance.v1',JSON.stringify({formatVersion:1,activeId:'dark',presets:[],avatarStyle:'simple'})));await page.reload();await page.locator('.game-tile').first().waitFor();
 assert.equal(await page.locator('html').getAttribute('data-avatar-style'),'minimal');assert.deepEqual(await page.evaluate(()=>PlayroomAvatars.styles),['minimal']);assert.equal(await page.evaluate(()=>Object.hasOwn(PlayroomCharacterStyles.sets,'simple')),false);assert.equal(await page.evaluate(()=>PlayroomAvatars.source('circle-red','simple')===PlayroomAvatars.source('circle-red','minimal')),true);
 await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();await page.locator('.table-tools [data-command=settings]').click();assert.equal(await page.locator('[data-skin-family=character-face],[data-avatar-style-choice]').count(),0);await page.locator('#modal-root [data-command=close-modal]').click();
 await page.locator('.pexeso-grid [data-action]').first().click();await page.locator('.pexeso-character-card [data-character-style=minimal]').waitFor();assert((await page.locator('.pexeso-character-card image').first().getAttribute('href')).startsWith('data:image/svg+xml'));
}));

for(const [name,key] of [['QuotaExceededError','ui.app.save-quota'],['SecurityError','ui.app.save-unavailable'],['Error','ui.app.save-failed']])test(`session save reports ${name} without blaming pack assets`,{timeout:45000},async()=>fixture(async({page})=>{
 assert.equal(await page.locator('[data-game=pexeso] [data-character-style=minimal]').count(),2,'cover uses minimal characters');
 await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();
 const raw=await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1'));assert(raw&&!raw.includes('data:image/')&&!raw.includes('renderer.js'));
 await page.evaluate(name=>{const original=PlayroomDataStorage.prototype.setItem;window.restoreSessionWrites=()=>PlayroomDataStorage.prototype.setItem=original;PlayroomDataStorage.prototype.setItem=function(key,value){if(key==='playroom.session.v1')throw new DOMException('test save failure',name);return original.call(this,key,value);};},name);
 await page.locator('.pexeso-grid [data-action]').first().click();
 await page.waitForFunction(key=>document.querySelector('#toast')?.textContent.includes(PlayroomMessages.text(key)),key);
 assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1')),raw,'failed write preserves previous saved party');await page.evaluate(()=>restoreSessionWrites());
}));

for(const failure of ['archive','active'])test(`failed local start (${failure}) preserves previous session and allows retry`,{timeout:45000},async()=>fixture(async({page})=>{
 await page.locator('[data-start=klondike]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.solitaire-board').waitFor();
 const previous=await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1'));const id=JSON.parse(previous).libraryId;
 await page.evaluate(()=>PlayroomAppBridge.showHub());await page.locator('[data-start=pexeso]').first().click();
 await page.evaluate(failure=>{const original=PlayroomDataStorage.prototype.setItem;window.restoreSessionWrites=()=>PlayroomDataStorage.prototype.setItem=original;PlayroomDataStorage.prototype.setItem=function(key,value){if(failure==='archive'?key.startsWith('playroom.paused.v1.'):key==='playroom.session.v1'&&JSON.parse(value).game==='pexeso')throw new DOMException('test quota','QuotaExceededError');return original.call(this,key,value);};},failure);
 for(let attempt=0;attempt<2;attempt++){
  await page.locator('[data-command=lobby-start]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes(PlayroomMessages.text('ui.app.save-quota')));
  assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1')),previous);
  assert.equal(await page.locator('.room-setup-modal').count(),1,'failed activation stays in lobby');
 }
 await page.evaluate(()=>restoreSessionWrites());await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();
 const result=await page.evaluate(id=>({game:JSON.parse(PlayroomData.getItem('playroom.session.v1')).game,old:JSON.parse(PlayroomData.getItem('playroom.paused.v1.'+id)).game}),id);assert.deepEqual(result,{game:'pexeso',old:'klondike'});
}));

test('Pexeso keeps the empty cell at the centre of a 5 by 5 twelve-pair layout',{timeout:45000},async()=>fixture(async({page})=>{
 await page.evaluate(()=>{const s=new TabletopSession(TabletopCore,'pexeso',{seed:31,preset:'medium',mode:'solo',players:[{name:'Иван'},{name:'Тео',bot:true}]});new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks).activate(s,'twelve-pairs');});
 await page.reload();await page.locator('[data-command=resume]').first().click();await page.locator('.pexeso-grid').waitFor();let square=false;
 for(const [width,height] of [[390,844],[320,740],[740,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);const state=await page.locator('.pexeso-grid').evaluate(grid=>{const gap=grid.querySelector('[data-grid-gap]'),cols=Number(grid.style.getPropertyValue('--grid-columns')),rows=Number(grid.style.getPropertyValue('--grid-rows'));return {cols,rows,gap:gap.hidden,index:[...grid.children].indexOf(gap),cards:grid.querySelectorAll('.pexeso-slot').length};});assert.equal(state.cards,24);if(state.cols===5&&state.rows===5){square=true;assert.equal(state.gap,false);assert.equal(state.index,12);}else assert.equal(state.gap,true);}
 assert(square,'phone geometry uses 5 by 5');
 const sounds=await page.evaluate(()=>{const view=PlayroomPacks.exportView('battleship');return Object.values(view.sounds).map(cue=>({inline:cue.src.startsWith('data:audio/'),copies:Object.values(view.assets).filter(src=>src===cue.src).length}));});assert.equal(sounds.length,4);assert(sounds.every(s=>s.inline&&s.copies===1));
}));


test('web startup and manifest stay black before the saved light or dark appearance loads',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(process.env.PLAYROOM_BROWSER_ROOT||root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{for(const mode of ['light','dark']){
  const context=await browser.newContext({viewport:{width:390,height:740}});await context.addInitScript(mode=>localStorage.setItem('playroom.appearance.v1',JSON.stringify({formatVersion:1,activeId:mode,avatarStyle:'minimal',presets:[]})),mode);
  let release;const ready=new Promise(resolve=>release=resolve);await context.route('**/appearance-models*.js',async route=>{await ready;await route.continue();});const page=await context.newPage();
  try{await page.goto(server.url,{waitUntil:'commit'});await page.waitForFunction(()=>document.documentElement.dataset.appLoading==='true');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(0, 0, 0)');assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#000000');release();await page.locator('.game-tile').first().waitFor();await page.waitForFunction(()=>!document.documentElement.dataset.appLoading);assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),mode);const manifest=await page.evaluate(()=>fetch('manifest.webmanifest').then(r=>r.json()));assert.equal(manifest.background_color,'#000000');assert.equal(manifest.theme_color,'#000000');}
  finally{release();await context.close();}
 }}finally{await browser.close();await server.close();}
});

test('dark domino interaction contours stay opaque and contrast with both board and pale pieces',{timeout:45000},async()=>fixture(async({page})=>{
 await page.locator('[data-start=domino]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('.is-playable').first().waitFor();
 const before=await page.locator('.game-scene').boundingBox();await choose(page,'dark');
 const colors=await page.evaluate(()=>{const root=getComputedStyle(document.documentElement),scene=document.querySelector('.game-scene'),piece=scene.querySelector('.is-playable'),contour=piece.querySelector('.piece-contour,.card-outline');return {green:root.getPropertyValue('--color-interaction-available').trim(),keyline:getComputedStyle(scene).getPropertyValue('--piece-interaction-keyline').trim(),board:root.getPropertyValue('--color-surface-game').trim(),face:root.getPropertyValue('--color-material-domino-face').trim(),strength:getComputedStyle(scene).getPropertyValue('--piece-highlight-strength').trim(),stroke:contour?getComputedStyle(contour).stroke:null,opacity:contour?getComputedStyle(contour).strokeOpacity:null};});
 assert(contrast(colors.green,colors.board)>=3,JSON.stringify(colors));assert(contrast(colors.keyline,colors.face)>=3,JSON.stringify(colors));assert.equal(colors.green,'#ffe169');assert.equal(colors.strength,'100%');if(colors.opacity!==null)assert(['1','100%'].includes(colors.opacity),JSON.stringify(colors));assert.deepEqual(await page.locator('.game-scene').boundingBox(),before);
 await page.screenshot({path:path.join(captures,'dark-domino-contrast-390.png')});await choose(page,'light');assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'light');
}));

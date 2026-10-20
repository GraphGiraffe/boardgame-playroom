'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
const captures=path.join(root,'tmp_files/refactor-0.18-appearance');

async function fixture(run) {
  const server=await serveBrowserFixture(root);
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'appearance-test',name:'Иван',createdAt:1,updatedAt:1}));
    localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',autoPass:false}));
  });
  try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await run({page,context});assert.deepEqual(errors,[]);}
  finally{await context.close();await browser.close();await server.close();}
}
async function choose(page,id) {
  const openedSettings=!(await page.locator('.settings-themes:visible').count());
  if(openedSettings)await page.locator('[data-command=settings]:visible').first().click();
  await page.locator('.settings-themes').click();
  await page.locator('.appearance-editor [data-appearance-choice]').selectOption(id);
  await page.locator('#appearance-selection button[type=submit]').click();
  assert.equal(await page.locator('.appearance-dialog').count(),0);
  if(openedSettings)await page.locator('#modal-root [data-command=close-modal]').first().click();
}

function contrast(foreground,background) {
  const luminance=color=>{
    const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(value=>parseInt(value,16)):color.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);
    return rgb.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  };
  const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('theme editor previews, cancels, saves, reloads and edits existing custom presets',{timeout:60000},async()=>fixture(async({page})=>{
 fs.mkdirSync(captures,{recursive:true});await choose(page,'dark');assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'dark');
 await page.locator('[data-appearance-editor]:visible').first().click();assert.equal(await page.locator('[data-appearance-action=copy],[data-appearance-action=apply]').count(),0);assert(!await page.locator('.appearance-body').innerText().then(t=>t.includes('Стандартную тему')));
 await page.locator('[data-appearance-choice]').selectOption('light');assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'light');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId),'dark');await page.locator('[data-appearance-action=cancel-selection]').click();assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'dark');await page.keyboard.press('Escape');
 const id=await page.evaluate(()=>{const s=PlayroomAppearanceUI.runtime.service,d=s.createDraft('dark','Моя ночь');s.saveDraft(d);return d.id;});
 await page.locator('[data-appearance-editor]:visible').first().click();await page.locator('[data-appearance-choice]').selectOption(id);await page.locator('[data-appearance-action=edit]').click();await page.locator('[data-appearance-color="surface.canvas"]').evaluate(el=>{el.value='#101820';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#101820');await page.locator('[data-appearance-action=cancel-draft]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId),'dark');
 await page.locator('[data-appearance-action=edit]').click();await page.locator('[name=themeName]').fill('Тихий вечер');await page.locator('#appearance-draft button[type=submit]').click();await page.keyboard.press('Escape');await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-appearance-preset'),id);
 await page.locator('[data-appearance-editor]:visible').first().click();await page.locator('[data-appearance-action=remove]').click();await page.locator('[data-appearance-action=confirm-remove]').click();assert.equal(await page.locator('html').getAttribute('data-appearance-preset'),'light');await page.keyboard.press('Escape');
 for(const width of [320,740]){await page.setViewportSize({width,height:width===320?740:390});await page.locator('[data-appearance-editor]:visible').first().click();assert(await page.locator('.appearance-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.keyboard.press('Escape');}
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
    return {raw:localStorage.getItem('playroom.session.v1'),top:board.scrollTop,left:board.scrollLeft,rect:board.getBoundingClientRect().toJSON()};
  });
  const materialBefore=await page.locator('.shared-die-art rect[stroke]').first().evaluate(node=>getComputedStyle(node).stroke);
  await choose(page,'dark');
  const materialAfter=await page.locator('.shared-die-art rect[stroke]').first().evaluate(node=>getComputedStyle(node).stroke);
  assert.notEqual(materialAfter,materialBefore,'The live shared die uses local theme material bindings');
  const after=await page.evaluate(()=>{const b=document.querySelector('.yatzy-board');return {same:b===window.appearanceBoard,raw:localStorage.getItem('playroom.session.v1'),top:b.scrollTop,left:b.scrollLeft,rect:b.getBoundingClientRect().toJSON()};});
  assert(after.same);assert.equal(after.raw,before.raw);assert.equal(after.top,before.top);assert.equal(after.left,before.left);assert.deepEqual(after.rect,before.rect);
  const colors=await page.evaluate(()=>{
    const header=getComputedStyle(document.querySelector('.yatzy-score thead th'));
    return {header:header.color,face:header.backgroundColor,hint:getComputedStyle(document.querySelector('.yatzy-score tbody th')).color,canvas:getComputedStyle(document.documentElement).getPropertyValue('--color-surface-game').trim()};
  });
  assert(contrast(colors.header,colors.face)>=4.5);assert(contrast(colors.hint,colors.canvas)>=4.5);
  await page.screenshot({path:path.join(captures,'dark-yatzy-390.png')});
  await page.locator('.table-tools [data-command=settings]').click();
  await page.evaluate(()=>window.appearanceSettings=document.querySelector('#modal-root .modal'));
  await page.locator('.settings-themes').click();await page.keyboard.press('Escape');
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
  assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),before.raw);
  await page.setViewportSize({width:320,height:640});
  assert.equal(await page.locator('.table-tools [data-appearance-picker]').isVisible(),false);
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

test('main menu edits themes only, games hide single-choice skin families and empty blocks',{timeout:45000},async()=>fixture(async({page})=>{
 await page.evaluate(()=>PlayroomAppearanceUI.openEditor());assert.equal(await page.locator('#appearance-title').innerText(),'Темы');assert.equal(await page.locator('#skin-preferences,[data-preview-family]').count(),0);await page.locator('[data-appearance-action=close]').click();
 for(const game of ['checkers','domino','uno']){await page.locator(`[data-start=${game}]`).first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.game-scene').waitFor();await page.evaluate(()=>PlayroomAppearanceUI.openEditor());assert.equal(await page.locator('#skin-preferences').count(),0,game+' has no selectable skin variants');await page.locator('[data-appearance-action=close]').click();await page.evaluate(()=>PlayroomAppBridge.showHub());}
 await page.locator('[data-start=klondike]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.solitaire-board').waitFor();await page.locator('[data-command=settings]:visible').first().click();assert.equal(await page.locator('#modal-root [data-start]').count(),0,'settings omit the redundant new-game configuration shortcut');await page.locator('.settings-themes').click();assert.equal(await page.locator('#appearance-title').innerText(),'Темы и скины');assert.equal(await page.locator('#skin-preferences [data-skin-family=card-face]').count(),6);assert.equal(await page.locator('[data-skin-group=two-color] [data-skin-variant]').count(),3);assert.equal(await page.locator('[data-skin-group=four-color] [data-skin-variant]').count(),3);for(const width of [320,390]){await page.setViewportSize({width,height:740});assert(await page.locator('[data-skin-group=two-color]').evaluate(el=>new Set([...el.children].map(c=>c.getBoundingClientRect().y)).size===1),'two-colour samples fit one row');assert(await page.locator('.appearance-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}assert.equal(await page.locator('#skin-preferences details,#skin-preferences summary,.appearance-skin-caption,[data-appearance-action=copy],[data-appearance-action=apply]').count(),0);assert(!await page.locator('.appearance-body').innerText().then(t=>t.includes('Стандартную тему')));await page.locator('[data-appearance-choice]').selectOption('dark');assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'dark');assert.equal(await page.locator('[data-skin-variant=classic] .shared-face').evaluate(el=>getComputedStyle(el).color),'rgb(38, 78, 67)');assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.appearance.v1')),null);assert.equal(await page.locator('#appearance-selection button[type=submit]').innerText(),'Принять');assert.deepEqual(await page.locator('.appearance-confirm-actions>button').allTextContents(),['Отмена','Принять']);await page.locator('#appearance-selection button[type=submit]').click();assert.equal(await page.locator('.appearance-dialog').count(),0,'accept closes only the appearance dialog');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId),'dark');assert.equal(await page.locator('[data-skin-family=card-back],[data-skin-family=domino],[data-skin-family=board],[data-skin-family=checker]').count(),0);assert.equal(await page.locator('[data-skin-reset]').count(),0);
 assert(await page.locator('#modal-root .settings-themes').isVisible(),'closing editor returns to game settings');
}));

test('main themes preview avatar sets; Pexeso exposes its character deck without changing avatar style or game state',{timeout:45000},async()=>fixture(async({page})=>{
 await page.evaluate(()=>PlayroomAppearanceUI.openEditor());assert.equal(await page.locator('[data-avatar-style-choice]').count(),2);
 assert.equal(await page.locator('[data-avatar-style-choice]').first().getAttribute('data-avatar-style-choice'),'minimal');
 assert.equal(await page.locator('[data-avatar-style-choice=detailed]').count(),0);assert.equal(await page.locator('[data-avatar-style-choice=minimal]').getAttribute('aria-label'),'Стандартный');
 await page.locator('[data-avatar-style-choice=minimal]').click();assert.equal(await page.locator('html').getAttribute('data-avatar-style'),'minimal');assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.appearance.v1')),null);
 await page.locator('[data-appearance-action=close]').click();assert.equal(await page.locator('html').getAttribute('data-avatar-style'),'minimal');
 await page.evaluate(()=>PlayroomAppearanceUI.openEditor());await page.locator('[data-avatar-style-choice=simple]').click();await page.locator('#appearance-selection button[type=submit]').click();assert.equal(await page.locator('.appearance-dialog').count(),0);await page.reload();assert.equal(await page.locator('html').getAttribute('data-avatar-style'),'simple');
 await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();const state=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));
 await page.evaluate(()=>PlayroomAppearanceUI.openEditor());assert.equal(await page.locator('[data-avatar-style-choice],[data-skin-family=card-face]').count(),0);assert.equal(await page.locator('[data-skin-family=character-face]').count(),2);
 assert.equal(await page.locator('[data-skin-family=character-face]').first().getAttribute('data-skin-variant'),'minimal');assert.equal(await page.locator('[data-skin-family=character-face][aria-pressed=true]').getAttribute('data-skin-variant'),'minimal');
 for(const image of await page.locator('[data-skin-family=character-face] [data-character-id]').all())assert.equal(await image.getAttribute('data-character-id'),'circle-red');
 await page.locator('[data-skin-family=character-face][data-skin-variant=minimal]').click();await page.locator('#appearance-selection button[type=submit]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),state);assert.equal(await page.locator('html').getAttribute('data-avatar-style'),'simple');
 await page.locator('.pexeso-grid [data-action]').first().click();await page.locator('.pexeso-character-card [data-character-style=minimal]').waitFor();assert((await page.locator('.pexeso-character-card image').first().getAttribute('href')).startsWith('data:image/svg+xml'));
}));

for(const [name,key] of [['QuotaExceededError','ui.app.save-quota'],['SecurityError','ui.app.save-unavailable'],['Error','ui.app.save-failed']])test(`session save reports ${name} without blaming pack assets`,{timeout:45000},async()=>fixture(async({page})=>{
 assert.equal(await page.locator('[data-game=pexeso] [data-character-style=minimal]').count(),2,'cover uses minimal characters');
 await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();
 const raw=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));assert(raw&&!raw.includes('data:image/')&&!raw.includes('renderer.js'));
 await page.evaluate(name=>{const original=Storage.prototype.setItem;window.restoreSessionWrites=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(key,value){if(key==='playroom.session.v1')throw new DOMException('test save failure',name);return original.call(this,key,value);};},name);
 await page.locator('.pexeso-grid [data-action]').first().click();
 await page.waitForFunction(key=>document.querySelector('#toast')?.textContent.includes(PlayroomMessages.text(key)),key);
 assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),raw,'failed write preserves previous saved party');await page.evaluate(()=>restoreSessionWrites());
}));

for(const failure of ['archive','active'])test(`failed local start (${failure}) preserves previous session and allows retry`,{timeout:45000},async()=>fixture(async({page})=>{
 await page.locator('[data-start=klondike]').first().click();await page.locator('[data-command=lobby-start]').click();await page.locator('.solitaire-board').waitFor();
 const previous=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));const id=JSON.parse(previous).libraryId;
 await page.evaluate(()=>PlayroomAppBridge.showHub());await page.locator('[data-start=pexeso]').first().click();
 await page.evaluate(failure=>{const original=Storage.prototype.setItem;window.restoreSessionWrites=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(key,value){if(failure==='archive'?key.startsWith('playroom.paused.v1.'):key==='playroom.session.v1'&&JSON.parse(value).game==='pexeso')throw new DOMException('test quota','QuotaExceededError');return original.call(this,key,value);};},failure);
 for(let attempt=0;attempt<2;attempt++){
  await page.locator('[data-command=lobby-start]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes(PlayroomMessages.text('ui.app.save-quota')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),previous);
  assert.equal(await page.locator('.room-setup-modal').count(),1,'failed activation stays in lobby');
 }
 await page.evaluate(()=>restoreSessionWrites());await page.locator('[data-command=lobby-start]').click();await page.locator('.pexeso-grid').waitFor();
 const result=await page.evaluate(id=>({game:JSON.parse(localStorage.getItem('playroom.session.v1')).game,old:JSON.parse(localStorage.getItem('playroom.paused.v1.'+id)).game}),id);assert.deepEqual(result,{game:'pexeso',old:'klondike'});
}));

test('Pexeso keeps the empty cell at the centre of a 5 by 5 twelve-pair layout',{timeout:45000},async()=>fixture(async({page})=>{
 await page.evaluate(()=>{const s=new TabletopSession(TabletopCore,'pexeso',{seed:31,preset:'medium',mode:'solo',players:[{name:'Иван'},{name:'Тео',bot:true}]});new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks).activate(s,'twelve-pairs');});
 await page.reload();await page.locator('[data-command=resume]').first().click();await page.locator('.pexeso-grid').waitFor();let square=false;
 for(const [width,height] of [[390,844],[320,740],[740,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);const state=await page.locator('.pexeso-grid').evaluate(grid=>{const gap=grid.querySelector('[data-grid-gap]'),cols=Number(grid.style.getPropertyValue('--grid-columns')),rows=Number(grid.style.getPropertyValue('--grid-rows'));return {cols,rows,gap:gap.hidden,index:[...grid.children].indexOf(gap),cards:grid.querySelectorAll('.pexeso-slot').length};});assert.equal(state.cards,24);if(state.cols===5&&state.rows===5){square=true;assert.equal(state.gap,false);assert.equal(state.index,12);}else assert.equal(state.gap,true);}
 assert(square,'phone geometry uses 5 by 5');
 const sounds=await page.evaluate(()=>{const view=PlayroomPacks.exportView('battleship');return Object.values(view.sounds).map(cue=>({inline:cue.src.startsWith('data:audio/'),copies:Object.values(view.assets).filter(src=>src===cue.src).length}));});assert.equal(sounds.length,4);assert(sounds.every(s=>s.inline&&s.copies===1));
}));

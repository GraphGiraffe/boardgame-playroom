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
  await page.locator('[data-appearance-picker]').first().click();
  await page.locator('.appearance-picker [data-appearance-choice]').selectOption(id);
  assert.equal(await page.locator('.appearance-dialog').count(),0);
}
function contrast(foreground,background) {
  const luminance=color=>{
    const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(value=>parseInt(value,16)):color.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);
    return rgb.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  };
  const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('theme editor copies immutable presets, previews, cancels, saves, reloads and deletes',{timeout:60000},async()=>fixture(async({page})=>{
  fs.mkdirSync(captures,{recursive:true});
  assert.equal(await page.locator('.side-nav [data-command=help]').count(),0);
  assert.equal(await page.locator('.topbar [data-command=help]').count(),1);
  await choose(page,'dark');
  assert.equal(await page.locator('html').getAttribute('data-appearance-mode'),'dark');
  assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#18211d');
  const backgrounds=await page.locator('.game-tile').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  for(const color of backgrounds){const rgb=color.match(/\d+/g).slice(0,3).map(Number);assert(Math.max(...rgb)<130,`Dark tile: ${color}`);}
  await page.screenshot({path:path.join(captures,'dark-hub-390.png'),fullPage:true});
  await page.locator('[data-appearance-editor]').click();
  assert.equal(await page.locator('[data-appearance-action=edit]').count(),0);
  await page.locator('[data-appearance-action=copy]').click();
  await page.locator('[name=themeName]').fill('Моя ночь');
  await page.locator('[data-appearance-color="surface.canvas"]').evaluate(el=>{el.value='#101820';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#101820');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId),'dark');
  await page.locator('[data-appearance-action=cancel-draft]').click();
  assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#18211d');
  await page.locator('[data-appearance-action=copy]').click();
  await page.locator('[name=themeName]').fill('Моя ночь');
  await page.locator('[data-appearance-color="surface.canvas"]').evaluate(el=>{el.value='#101820';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#appearance-draft button[type=submit]').click();
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.appearance.v1')).activeId);
  assert.match(id,/^custom-/);
  assert.equal(await page.evaluate(()=>PlayroomAppearanceUI.runtime.catalog.builtin('dark').palette['surface.canvas']),'#18211d');
  await page.screenshot({path:path.join(captures,'custom-editor-390.png'),fullPage:true});
  await page.keyboard.press('Escape');await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('data-appearance-preset'),id);
  await page.locator('[data-appearance-editor]').click();
  await page.locator('[data-appearance-action=edit]').click();await page.locator('[name=themeName]').fill('Тихий вечер');
  await page.locator('#appearance-draft button[type=submit]').click();
  assert.equal(await page.locator('[data-appearance-choice] option:checked').textContent(),'Тихий вечер');
  await page.locator('[data-appearance-action=remove]').click();
  await page.locator('[data-appearance-action=confirm-remove]').click();
  assert.equal(await page.locator('html').getAttribute('data-appearance-preset'),'light');
  await page.keyboard.press('Escape');
  for(const [width,height] of [[320,640],[740,390]]){
    await page.setViewportSize({width,height});await page.locator('[data-appearance-editor]').click();
    await page.locator('[data-appearance-action=copy]').click();
    const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('.appearance-dialog').getBoundingClientRect().toJSON()}));
    assert(size.scroll<=size.width+1);assert(size.dialog.left>=0&&size.dialog.right<=width+1);
    await page.screenshot({path:path.join(captures,`editor-${width}.png`)});await page.keyboard.press('Escape');
  }
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
  await choose(page,'dark');
  const after=await page.evaluate(()=>{const b=document.querySelector('.yatzy-board');return {same:b===window.appearanceBoard,raw:localStorage.getItem('playroom.session.v1'),top:b.scrollTop,left:b.scrollLeft,rect:b.getBoundingClientRect().toJSON()};});
  assert(after.same);assert.equal(after.raw,before.raw);assert.equal(after.top,before.top);assert.equal(after.left,before.left);assert.deepEqual(after.rect,before.rect);
  const colors=await page.evaluate(()=>{
    const header=getComputedStyle(document.querySelector('.yatzy-score thead th'));
    return {header:header.color,face:header.backgroundColor,hint:getComputedStyle(document.querySelector('.yatzy-dice-help')).color,canvas:getComputedStyle(document.documentElement).getPropertyValue('--color-surface-game').trim()};
  });
  assert(contrast(colors.header,colors.face)>=4.5);assert(contrast(colors.hint,colors.canvas)>=4.5);
  await page.screenshot({path:path.join(captures,'dark-yatzy-390.png')});
  await page.locator('.table-tools [data-command=settings]').click();
  await page.evaluate(()=>window.appearanceSettings=document.querySelector('#modal-root .modal'));
  await page.locator('.appearance-settings-shortcut').click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.querySelector('#modal-root .modal')===window.appearanceSettings),true);
  await page.locator('.appearance-settings-shortcut').click();await page.locator('.appearance-picker select').selectOption('light');
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
  await page.locator('.appearance-settings-shortcut').click();await page.locator('.appearance-picker select').selectOption('light');
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

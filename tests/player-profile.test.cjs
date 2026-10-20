'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const url=process.env.PLAYROOM_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const {serveBrowserFixture}=require('./browser-origin.cjs');
const fs=require('node:fs');
const capture=async(page,name)=>{if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,name+'.png')});}};

test('settings avatar stays left of nickname and uses the shared persistent picker',{timeout:30000},async()=>{
  const fixture=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const assertPlacement=async()=>{
    const button=await page.locator('.settings-personal [data-avatar-picker]').boundingBox();
    const input=await page.locator('.settings-personal input').boundingBox();
    assert.ok(button&&input&&button.x+button.width<=input.x,'Avatar is left of the input');
    assert.ok(Math.min(button.y+button.height,input.y+input.height)>Math.max(button.y,input.y),'Avatar and input share a row');
  };
  try{
    await page.goto(fixture.url);
    await page.locator('.topbar-tools [data-command=settings]').click();
    await assertPlacement();
    await page.locator('.settings-personal [data-avatar-picker]').click();
    assert.equal(await page.locator('.avatar-options [data-avatar-option]').count(),49);
    assert.equal(await page.locator('.avatar-options').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),6);
    assert.equal(await page.locator('.avatar-picker-modal').evaluate(el=>el.scrollTop),0);
    await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-options img')].every(img=>img.complete&&img.naturalWidth===256));
    await capture(page,'rc4-avatar-picker');
    await page.locator('[data-avatar-option=circle-red]').click();
    await page.locator('#avatar-picker-root').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),'circle-red');
    assert.equal(await page.locator('.settings-personal .avatar-art').count(),1);
    await capture(page,'rc4-settings-avatar');
    await page.locator('.modal [data-command=close-modal]').click();
    await page.reload();
    await page.locator('[data-start=ludo]').first().click();
    await page.locator('.lobby-header [data-command=settings]').click();
    for(const width of [390,320]){await page.setViewportSize({width,height:844});await assertPlacement();}
    await page.locator('.settings-personal [data-avatar-picker]').click();
    await page.locator('.avatar-options [data-avatar-option=""]').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),null);
    assert.equal(await page.locator('.settings-personal .avatar-art').count(),0);
  }finally{await context.close();await browser.close();await fixture.close();}
});

test('first launch requires a player name and persists it',{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});
  const page=await context.newPage();
  try{
    await page.goto(url);
    await page.locator('#profile-form').waitFor();
    assert.equal(await page.locator('.game-grid').count(),1,'Hub may render behind the required modal');
    await page.locator('#profile-form input[name=playerName]').fill('Иван');
    await page.locator('#profile-form').evaluate(form=>form.requestSubmit());
    await page.locator('#profile-form').waitFor({state:'detached'});
    const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')));
    assert.equal(profile.name,'Иван');assert.equal(profile.version,1);assert.ok(profile.id);
    await page.reload();
    assert.equal(await page.locator('#profile-form').count(),0,'Saved profile must suppress the first-run prompt');
  }finally{await context.close();await browser.close();}
});


test('cartoon Pexeso cards resolve offline in the pack and shared client renderer',{timeout:30000},async()=>{
 const fixture=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(fixture.url);
  const values=await page.evaluate(()=>{
   const session=new TabletopSession(TabletopCore,'pexeso',{seed:17,preset:'easy',players:[{name:'Иван',avatar:'circle-red'},{name:'Тео',bot:true,avatar:'crescent-yellow'}]});
   const actor=session.current.turn;session.act(actor,{type:'flip',index:0});
   const state=TabletopCore.project(session.current,actor),scene=PlayroomViews.render(state,actor,TabletopCore.legalActions(session.current,actor));
   document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Пексесо',state,viewer:actor,actions:[],scene,turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   const asset=document.querySelector('.pexeso-character-card image').getAttribute('href');
   const exported=PlayroomPacks.exportView('pexeso',session.packVersion);
   return {asset:asset.startsWith('data:image/svg+xml;base64,'),deck:state.data.deckSize,avatars:document.querySelectorAll('.player-avatar-wrap .avatar-art').length,portableAssets:Object.keys(exported.assets).filter(path=>path.startsWith('assets/shared-packs/characters/runtime/')).length};
  });
  assert.deepEqual(values,{asset:true,deck:96,avatars:2,portableAssets:0});
  await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-art')].every(img=>img.complete&&img.naturalWidth>0));
  await capture(page,'rc4-pexeso-characters');
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await fixture.close();}
});

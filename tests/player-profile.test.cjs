'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const url=process.env.PLAYROOM_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const TestUI=require('./browser-origin.cjs');const {serveBrowserFixture}=TestUI;
const fs=require('node:fs');
const capture=async(page,name)=>{if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,name+'.png')});}};

test('profile avatar stays left of nickname and uses the shared persistent picker',{timeout:45000},async()=>{
 const fixture=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(6000);
 const active=selector=>TestUI.activeSurface(page).locator(selector);
 const open=async()=>{await page.locator('[data-hub-page=profile]').click();await page.locator('[data-profile-account]').click();await active('[data-command=profile-edit]').click();await active('#local-profile-editor').waitFor();await TestUI.activeSurface(page).evaluate(n=>Promise.all(n.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));};
 const placement=async()=>{const button=await active('[data-local-profile-avatar]').boundingBox(),input=await active('[name=nickname]').boundingBox();assert(button.x+button.width<=input.x);assert(Math.min(button.y+button.height,input.y+input.height)>Math.max(button.y,input.y));};
 try{
  await page.goto(fixture.url);await TestUI.ready(page);await open();await placement();
  const before=await page.evaluate(()=>localStorage.getItem('playroom.player-profile.v1'));
  await active('[data-local-profile-avatar]').click();assert.equal(await active('[data-avatar-option]').count(),await page.evaluate(()=>PlayroomAvatars.items().length+1));
  assert.equal(await active('.modal-body').evaluate(n=>n.scrollTop),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-options img')].length>0&&[...document.querySelectorAll('.avatar-options img')].every(img=>img.complete&&img.naturalWidth>0));
  await active('[data-avatar-option=circle-red]').click();await active('#local-profile-editor').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.player-profile.v1')),before,'avatar selection remains in the form draft');
  assert.equal(await active('[data-local-profile-avatar] .avatar-art').count(),1);await active('button[type=submit][form=local-profile-editor],#local-profile-editor button[type=submit]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),'circle-red');
  await active('.modal-head [data-command=close-modal]').click();await page.reload();await TestUI.ready(page);await open();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await placement();}
  await active('[data-local-profile-avatar]').click();await active('[data-avatar-option=""]').click();await active('button[type=submit][form=local-profile-editor],#local-profile-editor button[type=submit]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),null);
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
    await page.locator('#profile-form [name=playerName]').fill('Иван');
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
  await page.goto(fixture.url);await TestUI.ready(page);
  const values=await page.evaluate(()=>{
   const session=new TabletopSession(TabletopCore,'pexeso',{seed:17,preset:'easy',players:[{name:'Иван',avatar:'circle-red'},{name:'Тео',bot:true,avatar:'crescent-yellow'}]});
   const actor=session.current.turn;session.act(actor,{type:'flip',index:0});
   const state=TabletopCore.project(session.current,actor),scene=PlayroomViews.render(state,actor,TabletopCore.legalActions(session.current,actor));
   document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:'Пексесо',state,viewer:actor,actions:[],scene,turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
   const asset=document.querySelector('.pexeso-character-card image').getAttribute('href');
   const exported=PlayroomPacks.exportView('pexeso',session.packVersion);
   return {asset:asset.startsWith('data:image/svg+xml;base64,'),deck:state.data.deckSize,avatars:document.querySelectorAll('.player-avatar-wrap .avatar-art').length,bots:document.querySelectorAll('.player-avatar-wrap .is-bot-avatar').length,portableAssets:Object.keys(exported.assets).filter(path=>path.startsWith('assets/shared-packs/characters/runtime/')).length};
  });
  assert.deepEqual(values,{asset:true,deck:96,avatars:1,bots:1,portableAssets:0});
  await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-art')].every(img=>img.complete&&img.naturalWidth>0));
  await capture(page,'rc4-pexeso-characters');
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await fixture.close();}
});

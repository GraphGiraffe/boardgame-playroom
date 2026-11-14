'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,activeSurface}=require('./browser-origin.cjs');

test('results keep place medals separate and attach standard team or first tokens to avatars',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await context.route('https://*.supabase.co/**',route=>route.abort());
  if(process.env.PLAYROOM_RESULT_ARTIFACT)await context.route(server.url,route=>route.fulfill({path:path.resolve(process.env.PLAYROOM_RESULT_ARTIFACT),contentType:'text/html'}));
  await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge?.saveLibrary);
  for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>{const state={game:'ludo',preset:'teams',status:'finished',winner:0,winners:[0,2],firstPlayer:0,move:482,players:[{name:'Иван'},{name:'Тео'},{name:'Луна'},{name:'Сэм'}],result:{places:[1,2,1,2],values:[8,5,8,5],details:[4,2,4,3]}};const teams=[{id:'blue',label:'синяя'},{id:'red',label:'красная'}];PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Лудо',playerContent:state.players.map((_,i)=>({team:teams[i%2]}))}),'result-modal');});
   const panel=activeSurface(page);assert.equal(await panel.locator('.result-awards .is-team,.result-awards .is-first').count(),0);assert.equal(await panel.locator('.result-avatar-wrap .is-team').count(),4);assert.equal(await panel.locator('.result-awards .is-place').count(),4);
   const geometry=await panel.locator('.result-person').evaluateAll(rows=>rows.map(row=>{const wrap=row.querySelector('.result-avatar-wrap').getBoundingClientRect(),mark=row.querySelector('.result-avatar-wrap .player-medallion').getBoundingClientRect(),name=row.querySelector('.result-nickname').getBoundingClientRect(),medal=row.querySelector('.result-awards .player-medallion').getBoundingClientRect();return {avatar:wrap.width,mark:mark.width,medal:medal.width,gap:name.left-mark.right,offsetRight:mark.right-wrap.right,offsetTop:wrap.top-mark.top};}));
   assert(geometry.every(g=>g.mark===13&&g.medal===22&&g.offsetRight===6&&g.offsetTop===6&&g.gap>=.5),JSON.stringify(geometry));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'team-results-'+viewport.width+'.png')});}
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const state={status:'finished',winner:0,firstPlayer:0,move:20,players:[{name:'Иван'},{name:'Тео'}],result:{places:[1,4],values:[10,4]}};PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Шашки'}),'result-modal');});
  assert.equal(await activeSurface(page).locator('.result-avatar-wrap .is-first').count(),1);assert.equal(await activeSurface(page).locator('.result-awards .is-first').count(),0);
  await page.evaluate(()=>{const state={status:'finished',winner:0,winners:[0],move:20,players:Array.from({length:6},(_,i)=>({name:'Игрок '+(i+1)})),result:{places:[1,2,3,4,5,6],values:[0,0,0,0,0,1],lastPlayers:[5],exits:[{player:3,kind:'cards',round:5}]}};PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Дурак'}),'result-modal');});
  assert.equal(await activeSurface(page).locator('.result-awards .is-minor').count(),2);assert.equal(await activeSurface(page).locator('.result-awards .is-last').count(),1);assert.match(await activeSurface(page).innerText(),/Сбросил карты.*Раунд 5/);
 }finally{await context.close();await browser.close();await server.close();}
});

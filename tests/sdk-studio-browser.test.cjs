'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {serve}=require('../sdk/server.cjs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const project=path.resolve(__dirname,'../../playroom-paks/packs/tictactoe'),shared=path.resolve(__dirname,'../../playroom-paks/shared');
test('SDK loopback API rejects missing tokens, foreign origins, hosts and asset traversal',async()=>{
 const running=await serve(project,{shared});
 try{
  assert.equal((await fetch(running.url+'/api/changed')).status,403);
  assert.equal((await fetch(running.url+'/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':running.token,origin:'https://example.invalid'},body:'{"op":"view"}'})).status,403);
  assert.equal((await fetch(running.url+'/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':running.token},body:'{"op":"unknown"}'})).status,400);
  assert.equal((await fetch(running.url+'/api/asset?file=assets/../../manifest.json',{headers:{'x-playroom-sdk':running.token}})).status,400);
  const response=await fetch(running.url+'/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':running.token},body:'{"op":"view"}'}),frame=await response.json();assert.equal(frame.projection.viewer,0);assert.equal(frame.position,undefined);assert.equal(frame.debug,undefined);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const call=async body=>(await fetch(running.url+'/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':running.token},body:JSON.stringify(body)})).json();
  const moved=await call({op:'apply',command:frame.actions[0].command});assert(moved.plan.groups.length>0,'live commits use the shared event plan');assert(Number.isSafeInteger(moved.projection.events[0].id));
  const previous=await call({op:'seek',index:0});assert.equal(previous.plan,null,'backward access restores the checkpoint');
  const forward=await call({op:'seek',index:1});assert.deepEqual(forward.plan.groups,moved.plan.groups,'forward history uses the same event cues as the live commit');
 }finally{await running.close();}
});
test('SDK studio plays a local game, switches viewer, restores a checkpoint and renders safely at phone width',{timeout:45000},async()=>{
 const running=await serve(project,{shared}),browser=await chromium.launch({headless:true,executablePath:executablePath()}),context=await browser.newContext({viewport:{width:390,height:740},reducedMotion:'reduce',playroomProfile:false}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(running.url);await page.locator('#actions button').first().waitFor();assert.equal(await page.locator('#actions button').count(),9);
  assert.equal(await page.locator('#motion').isChecked(),true);assert.equal(await page.locator('#debug-data').isVisible(),false);
  await page.locator('#actions button').first().click();await page.waitForFunction(()=>document.querySelector('#projection').textContent.includes('"revision": 1'));
  await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>document.querySelector('#projection').textContent.includes('"viewer": 1'));assert.equal(await page.locator('#actions button').count(),8);
  const checkpoint=await page.evaluate(async()=>{const token=document.querySelector('meta[name="sdk-token"]').content;return (await (await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':token},body:'{"op":"checkpoint"}'})).json()).checkpoint;});
  await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#projection').textContent.includes('"revision": 0'));
  await page.locator('#restore').setInputFiles({name:'checkpoint.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(checkpoint))});await page.waitForFunction(()=>document.querySelector('#projection').textContent.includes('"revision": 1'));
  await page.locator('#viewer').selectOption('-1');await page.waitForFunction(()=>document.querySelector('#projection').textContent.includes('"viewer": -1'));assert.equal(await page.locator('#actions button').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  const directory=path.resolve(__dirname,'../dist/test-results/sdk-studio');fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'phone.png'),fullPage:true});
 }finally{await context.close();await browser.close();await running.close();}
});

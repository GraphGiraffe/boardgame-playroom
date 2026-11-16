'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const crypto=require('node:crypto');
const {serve}=require('../sdk/server.cjs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {fixture}=require('./sdk-fixture.cjs');
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
  const checked=await call({op:'check'});assert.equal(checked.check.budget.maxBytes,4_000_000);assert(checked.check.budget.bytes>0);
  const assets=await call({op:'assets'});assert.equal(assets.assets.limits.maxBytes,2_000_000);assert.equal(assets.assets.limits.maxFiles,256);
  const moved=await call({op:'apply',command:frame.actions[0].command});assert(moved.plan.groups.length>0,'live commits use the shared event plan');assert(Number.isSafeInteger(moved.projection.events[0].id));
  const previous=await call({op:'seek',index:0});assert.equal(previous.plan,null,'backward access restores the checkpoint');
  const forward=await call({op:'seek',index:1});assert.deepEqual(forward.plan.groups,moved.plan.groups,'forward history uses the same event cues as the live commit');
 }finally{await running.close();}
});
test('SDK asset endpoint refuses oversized media before sending it to the browser',async t=>{
 const project=fixture(t);fs.mkdirSync(path.join(project,'assets'));const asset=path.join(project,'assets/large.svg');fs.writeFileSync(asset,'<svg xmlns="http://www.w3.org/2000/svg"/>');const running=await serve(project);
 try{fs.writeFileSync(asset,'<svg xmlns="http://www.w3.org/2000/svg"><!--'+'x'.repeat(64_000)+'--></svg>');const response=await fetch(running.url+'/api/asset?file=assets/large.svg',{headers:{'x-playroom-sdk':running.token}});assert.equal(response.status,400);assert.equal((await response.json()).code,'SDK_ASSET_SIZE_LIMIT');await assert.rejects(serve(project),error=>error.code==='SDK_ASSET_SIZE_LIMIT');}finally{await running.close();}
});
test('SDK asset gallery serves the exact declared shared resource closure and refuses provider source',async()=>{
 const running=await serve(path.resolve(__dirname,'../../playroom-paks/packs/pexeso'),{shared});
 try{
  const headers={'Content-Type':'application/json','X-PlayRoom-SDK':running.token},response=await fetch(running.url+'/api',{method:'POST',headers,body:'{"op":"assets"}'}),frame=await response.json();assert.equal(response.status,200);assert(frame.assets.files.length>0);
  const asset=frame.assets.files.find(file=>file.file.startsWith('assets/shared-packs/'));assert(asset);const bytes=await fetch(running.url+'/api/asset?file='+encodeURIComponent(asset.file),{headers});assert.equal(bytes.status,200);assert.equal(crypto.createHash('sha256').update(Buffer.from(await bytes.arrayBuffer())).digest('hex'),asset.sha256);
  assert.deepEqual(new Set(frame.assets.files.map(file=>file.file)),new Set(frame.resources.assets.map(file=>file.file)));
  const denied=await fetch(running.url+'/api/asset?file='+encodeURIComponent('assets/shared-packs/characters-simple/provider.js'),{headers});assert.equal(denied.status,400);assert.equal((await denied.json()).code,'SDK_ASSET_PATH');
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
  await page.locator('.studio-sidebar details').filter({has:page.locator('#assets')}).locator('summary').click();await page.locator('#assets').click();await page.waitForFunction(()=>document.querySelector('#asset-list').textContent.includes('0 / 256 файлов · 0 / 2000000 байт'));
  await page.locator('#check').click();await page.waitForFunction(()=>document.querySelector('#checks').textContent.includes('"maxBytes": 4000000'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  const directory=path.resolve(__dirname,'../dist/test-results/sdk-studio');fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'phone.png'),fullPage:true});
 }finally{await context.close();await browser.close();await running.close();}
});
test('Kalyakodil stop vote is a nonblocking timed toast and preserves the live guessing draft',{timeout:75000},async()=>{
 const running=await serve(path.resolve(__dirname,'../../playroom-paks/sdk/examples/kalyakodil-c'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath()}),context=await browser.newContext({viewport:{width:1280,height:1000},playroomProfile:false}),page=await context.newPage();
 const call=async body=>{const response=await fetch(running.url+'/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':running.token},body:JSON.stringify({client:'vote-test-author',...body})});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
 const stop=async viewer=>{const frame=await call({op:'view',viewer});return call({op:'apply',viewer,command:frame.projection.actions.find(c=>c.type==='stop')});};
 try{
  await call({op:'start',options:{playerCount:6,durationSeconds:180}});await page.goto(running.url);await page.locator('#viewer option[value="5"]').waitFor({state:'attached'});await page.locator('#viewer').selectOption('1');
  await page.locator('.sdk-chat-input').waitFor();await page.waitForFunction(()=>!document.querySelector('.sdk-chat-input').disabled);assert.equal(await page.locator('.sdk-vote').isVisible(),false);
  await page.locator('.sdk-chat-input').fill('незаконченный вариант');const input=await page.locator('.sdk-chat-input').elementHandle();await input.focus();
  const first=await stop(0);await page.waitForFunction(()=>document.querySelector('.sdk-vote progress')?.value===1&&!document.querySelector('.sdk-vote').hidden);
  assert.equal(await page.locator('.sdk-vote progress').getAttribute('max'),'5');assert.match(await page.locator('.sdk-vote-timer').textContent(),/\d+ с/);assert.equal(await input.evaluate(e=>e===document.activeElement),true);assert.equal(await input.inputValue(),'незаконченный вариант');
  const artist=await call({op:'view',viewer:0}),draw=artist.projection.inputs.find(c=>c.command.type==='draw');assert(draw,'voting does not pause drawing');
  await call({op:'preview',viewer:0,command:draw.command,operation:{kind:'stroke',id:'vote-drawing',tool:'brush',color:'#000000',width:2,points:[[10,10]]}});await new Promise(resolve=>setTimeout(resolve,1200));
  const savedPreview=await call({op:'checkpoint',viewer:0});assert.equal(savedPreview.checkpoint.position.revision,artist.projection.revision,'a paused pen and saving do not commit speculative previews');assert.equal(savedPreview.checkpoint.position.data.operations.length,0);
  await call({op:'apply',viewer:0,command:{...draw.command,operation:{kind:'stroke',id:'vote-drawing',tool:'brush',color:'#000000',width:2,points:[[10,10],[100,100]]}}});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#projection').textContent).data.operations.length===1);assert.equal(await input.evaluate(e=>e===document.activeElement),true);assert.equal(await input.inputValue(),'незаконченный вариант');
  await page.getByRole('button',{name:'Свернуть голосование',exact:true}).click();assert.equal(await page.locator('.sdk-vote-badge').isVisible(),true);await page.locator('.sdk-vote-badge').click();assert.equal(await page.locator('.sdk-vote').isVisible(),true);
  await stop(2);await page.waitForFunction(()=>document.querySelector('.sdk-vote progress').value===2);await page.locator('#history-prev').click();await page.waitForFunction(()=>document.querySelector('.sdk-chat-input').disabled);assert.equal(await page.locator('.sdk-vote button').first().isEnabled(),true);assert.equal(await page.locator('.sdk-vote button').last().isEnabled(),false);
  await page.locator('#history-live').click();await page.waitForFunction(()=>!document.querySelector('.sdk-chat-input').disabled);await page.waitForFunction(()=>document.querySelector('.sdk-vote').hidden,{},{timeout:35000});assert.equal(await input.inputValue(),'незаконченный вариант');
  const reopened=await stop(0);assert.notEqual(reopened.scene.vote.id,first.scene.vote.id);for(const viewer of [1,2,3,4])await stop(viewer);await page.waitForFunction(()=>document.querySelector('.sdk-vote').classList.contains('is-accepted'));assert.match(await page.locator('.sdk-vote-timer').textContent(),/Решение принято/);assert.equal((await call({op:'view',viewer:0})).projection.status,'playing');
 }finally{await context.close();await browser.close();await running.close();}
});

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
  const assets=await call({op:'assets'});assert.equal(assets.assets.limits.maxBytes,2_000_000);assert.equal(assets.assets.limits.maxFiles,512);
  const moved=await call({op:'apply',command:frame.actions[0].command});
  assert.equal(Object.hasOwn(moved,'plan'),false,'the viewer owns the executable plan');
  assert(Number.isSafeInteger(moved.events[0].id));assert.equal(moved.events[0].id,moved.projection.events[0].id);
  assert.equal(typeof moved.motion?.action?.type,'string','motion is chosen from presented public events');
  assert.deepEqual(Object.keys(moved.motion).sort(),['action','actor']);
  const previous=await call({op:'seek',index:0});assert.equal(previous.motion,null,'backward access has no committed transition');
  const forward=await call({op:'seek',index:1});assert.deepEqual(forward.events,moved.events,'forward history receives the same facts as the live commit');assert.deepEqual(forward.motion,moved.motion);
  assert.equal(forward.sessionId,frame.sessionId,'history belongs to the same geometry owner');
  const restarted=await call({op:'start'});assert.notEqual(restarted.sessionId,frame.sessionId);assert.equal(restarted.sessionEpoch,frame.sessionEpoch+1);assert.equal(restarted.motion,null);
  const checkpoint=(await call({op:'checkpoint'})).checkpoint,restored=await call({op:'restore',checkpoint});assert.notEqual(restored.sessionId,restarted.sessionId);assert.equal(restored.sessionEpoch,restarted.sessionEpoch+1);
  const reloaded=await call({op:'reload'});assert.notEqual(reloaded.sessionId,restored.sessionId);assert.equal(reloaded.sessionEpoch,restored.sessionEpoch+1);
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

test('SDK Studio emits compact views for a known hash and keeps large legacy streams open',async t=>{
 const running=await serve(path.resolve(__dirname,'../../playroom-paks/packs/pexeso'),{shared});
 const abort=new AbortController();
 try{
  const headers={'Content-Type':'application/json','X-PlayRoom-SDK':running.token};
  const call=async body=>{
   const response=await fetch(running.url+'/api',{method:'POST',headers,body:JSON.stringify(body)});
   assert.equal(response.status,200);
   return response.text();
  };
  const full=await call({op:'view'}),hash=JSON.parse(full).pack.hash;
  const bootstrap=JSON.parse(await call({op:'view',knownPackHash:''}));
  const lean=await call({op:'view',knownPackHash:hash});
  for(const field of ['resources','metadata','catalogs']){
   assert(Object.hasOwn(JSON.parse(full),field));
   assert.equal(Object.hasOwn(JSON.parse(lean),field),false);
  }
  assert(bootstrap.metadata.catalog.figures.length>0);
  assert.equal(Object.hasOwn(bootstrap.support,'catalog'),false);
  assert.equal(Object.hasOwn(JSON.parse(lean).support,'catalog'),false);
  assert.deepEqual(JSON.parse(lean).support.tutorial,JSON.parse(full).support.tutorial);
  assert.deepEqual(JSON.parse(lean).projection,JSON.parse(full).projection);
  t.diagnostic('Pexeso view UTF-8 bytes: '+Buffer.byteLength(full)+' → '+Buffer.byteLength(lean));
  assert(Buffer.byteLength(full)>Buffer.byteLength(lean)*4);
  const response=await fetch(running.url+'/api/stream?client=legacy',{headers,signal:abort.signal});
  assert.equal(response.status,200);
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer='';
  async function next(){
   while(!buffer.includes('\n')){
    const {done,value}=await reader.read();assert.equal(done,false);
    buffer+=value;
   }
   const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);return line;
  }
  assert(Buffer.byteLength(await next())>16*1024,'legacy snapshot exceeds the writable high-water mark');
  await call({op:'start'});
  assert.equal(JSON.parse(await next()).sessionEpoch,1,'a normal large write does not close the stream');
 }finally{abort.abort();await running.close();}
});

test('Studio reuses a projected frame across live and history requests while keeping viewers and sessions separate',async t=>{
 const {StudioSession}=require('../sdk/runtime.cjs'),view=StudioSession.prototype.view;
 const source=fixture(t,{project:'({count:position.data.count,owner:viewer===0?position.data.secret:null})'});
 fs.appendFileSync(path.join(source,'domain/game.js'),`
 PlayroomPackDefinition.reduce=position=>({position:{...position,data:{...position.data,count:position.data.count+1}},events:[
  {type:'probe.step',actor:0,params:{},visibility:{kind:'public'}}
 ]});`);
 const rendered=[];
 t.mock.method(StudioSession.prototype,'view',function(viewer,...rest){rendered.push(viewer);return view.call(this,viewer,...rest);});
 const running=await serve(source);
 try{
  async function call(op,extra={}){
   const response=await fetch(running.url+'/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':running.token},body:JSON.stringify({op,viewer:0,client:'reviewer',knownPackHash:'',...extra})});
   const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
  }
  const live=await call('view');
  const first=await call('seek',{index:0});
  assert.deepEqual(first.projection,live.projection);
  const moved=await call('apply',{client:'peer',command:{type:'step'}});
  assert.equal(moved.projection.data.count,1);
  const inspected=await call('view');
  assert.equal(inspected.history.count,2);
  assert.deepEqual(inspected.projection,first.projection);
  const next=await call('seek',{index:1});
  assert.deepEqual(next.events,moved.events);
  assert.equal(next.motion.action.type,'action');
  const other=await call('view',{viewer:1});
  assert.equal(other.projection.data.owner,null);
  assert.equal(next.projection.data.owner,'hidden-alpha');
  t.diagnostic('Projection renders before restart: '+rendered.length);
  assert.deepEqual(rendered,[0,0,1]);
  const restarted=await call('start',{viewer:1});
  assert.notEqual(restarted.sessionId,live.sessionId);
  assert.equal(restarted.projection.revision,0);
  assert.deepEqual(rendered,[0,0,1,1]);
 }finally{await running.close();}
});

test('Studio delivers a deadline transition even when a request is rejected and before a later command',async t=>{
 const source=fixture(t);
 fs.appendFileSync(path.join(source,'domain/game.js'),`
 const definition=PlayroomPackDefinition;
 const step=(position,type)=>({position:{...position,data:{...position.data,count:position.data.count+1}},events:[
  {type,actor:0,params:{},visibility:{kind:'public'}}
 ]});
 definition.actions=position=>[{command:{type:position.data.count?'step':'before'},visibility:'public'}];
 definition.advance=(position,now)=>position.data.count===0&&now>=position.clock+100?step(position,'probe.deadline'):null;
 definition.reduce=position=>step(position,'probe.step');
 `);
 let now=1000;
 t.mock.method(Date,'now',()=>now);
 t.mock.timers.enable({apis:['setInterval']});
 const running=await serve(source),abort=new AbortController();
 const headers={'content-type':'application/json','x-playroom-sdk':running.token};
 async function request(op,extra={}){
  const response=await fetch(running.url+'/api',{method:'POST',headers,body:JSON.stringify({op,client:'actor',viewer:0,...extra})});
  return [response.status,await response.json()];
 }
 async function subscribe(client,viewer){
  const response=await fetch(running.url+'/api/stream?'+new URLSearchParams({client,viewer}),{headers,signal:abort.signal});
  assert.equal(response.status,200);
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer='';
  return async()=>{
   while(!buffer.includes('\n')){
    const {done,value}=await reader.read();assert.equal(done,false);buffer+=value;
   }
   const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);return JSON.parse(line);
  };
 }
 try{
  const actor=await subscribe('actor',0),observer=await subscribe('observer',-1);
  assert.equal((await actor()).projection.revision,0);
  assert.equal((await observer()).projection.revision,0);
  const watchdog=setTimeout(()=>abort.abort(),3000);
  try{
   now+=100;
   const [bad]=await request('apply',{command:{type:'before'}});
   assert.equal(bad,400);
   for(const next of [actor,observer]){
    const frame=await next();
    assert.equal(frame.projection.revision,1);
    assert.deepEqual(frame.projection.events.map(event=>event.type),['probe.deadline']);
   }
   const [started]=await request('start');assert.equal(started,200);
   assert.equal((await observer()).projection.revision,0);
   now+=100;
   const [ok,committed]=await request('apply',{command:{type:'step'}});
   assert.equal(ok,200);
   assert.equal(committed.projection.revision,2);
   for(const [revision,types] of [[1,['probe.deadline']],[2,['probe.deadline','probe.step']]]){
    const frame=await observer();
    assert.equal(frame.projection.revision,revision);
    assert.deepEqual(frame.projection.events.map(event=>event.type),types);
   }
  }finally{clearTimeout(watchdog);}
 }finally{abort.abort();await running.close();}
});

test('Studio viewer keeps one owned resource snapshot until project reload changes its hash',{timeout:45000},async t=>{
 const source=fixture(t),assets=path.join(source,'assets');
 fs.mkdirSync(assets);
 const file=path.join(assets,'pulse.json');
 const write=duration=>fs.writeFileSync(file,JSON.stringify({contractVersion:1,frames:[{time:0,values:{opacity:0}},{time:duration,values:{opacity:1}}]}));
 write(240);
 const running=await serve(source),browser=await chromium.launch({headless:true,executablePath:executablePath()});
 try{
  const page=await browser.newPage();
  await page.goto(running.url);
  await page.waitForFunction(()=>renderer?.frame?.resources?.animations?.['assets/pulse.json']?.duration===240);
  await page.evaluate(async()=>{
   window.initialResources=[frame.resources,renderer.frame.resources];
   const view=document.querySelector('#scene').contentWindow,clone=view.structuredClone;
   window.copiedPublicFrames=0;
   view.structuredClone=value=>{
    if(value?.projection)copiedPublicFrames++;
    return clone.call(view,value);
   };
   await request('apply',{command:{type:'step'}});
   await request('seek',{index:0});
  });
  await page.locator('#viewer').selectOption('-1');
  await page.waitForFunction(()=>renderer.frame.projection.viewer===-1);
  const same=await page.evaluate(()=>[frame.resources===initialResources[0],renderer.frame.resources===initialResources[1],renderer.frame.projection.viewer]);
  assert.deepEqual(same,[true,true,-1]);
  assert.deepEqual(await page.evaluate(()=>[
   frame.resources===renderer.frame.resources,frame.scene===renderer.frame.scene,
   frame.projection===renderer.frame.projection,frame.events===renderer.frame.events,
   Object.isFrozen(frame.scene.players[0]),copiedPublicFrames,
  ]),[true,true,true,true,true,0]);
  assert.deepEqual(await page.evaluate(async()=>{
   const {checkpoint}=await request('checkpoint');
   checkpoint.position.data.count=99;
   return [checkpoint.position.data.count,Object.hasOwn(renderer.frame,'checkpoint')];
  }),[99,false]);
  assert(await page.evaluate(()=>{
   const external=structuredClone(frame);
   Object.freeze(external.scene);
   renderer.update(external,{sharedPackData:packSnapshot.data});
   external.scene.players[0].probe=true;
   return renderer.frame.scene!==external.scene&&!Object.hasOwn(renderer.frame.scene.players[0],'probe');
  }));
  write(360);
  await page.evaluate(()=>request('reload'));
  assert.deepEqual(await page.evaluate(()=>[
   frame.resources!==initialResources[0],renderer.frame.resources!==initialResources[1],
   renderer.frame.resources.animations['assets/pulse.json'].duration
  ]),[true,true,360]);
  assert(await page.evaluate(async()=>{const next=renderer.frame.resources;await request('view');return next===renderer.frame.resources;}));
  fs.appendFileSync(path.join(source,'presentation/scene.js'),`
   Object.defineProperty(PlayroomPackPresentation,'metadata',{get(){throw Error('broken metadata');}});`);
  assert(await page.evaluate(async()=>{
   const next=renderer.frame.resources;
   return await request('reload')===false&&!!await request('view')&&renderer.frame.resources===next;
  }));
 }finally{await browser.close();await running.close();}
});

test('SDK studio plays a local game, switches viewer, restores a checkpoint and renders safely at phone width',{timeout:45000},async()=>{
 const running=await serve(project,{shared}),browser=await chromium.launch({headless:true,executablePath:executablePath()}),context=await browser.newContext({viewport:{width:390,height:740},reducedMotion:'reduce',playroomProfile:false}),page=await context.newPage(),game=page.frameLocator('#scene'),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(running.url);await game.locator('.sdk-board-grid button:not([disabled])').first().waitFor();assert.equal(await game.locator('.sdk-board-grid button:not([disabled])').count(),9);
  assert.equal(await page.locator('#motion').isChecked(),true);assert.equal(await page.locator('#debug-data,#projection,#scene-data,#checks,#actions,[name=rng]').count(),0);
  assert.equal(await page.locator('#error').isVisible(),false,'native viewer mounts without a swallowed runtime error');
  const cell=await game.locator('.sdk-board-grid button:not([disabled])').first().boundingBox();assert(cell.width>40&&Math.abs(cell.width-cell.height)<1,'native square cells have an actual hit area');
  await game.locator('.sdk-board-grid button:not([disabled])').first().click();await page.waitForFunction(()=>frame?.projection?.revision===1);
  await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>frame?.projection?.viewer===1);assert.equal(await game.locator('.sdk-board-grid button:not([disabled])').count(),8);
  const checkpoint=await page.evaluate(async()=>{const token=document.querySelector('meta[name="sdk-token"]').content;return (await (await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':token},body:'{"op":"checkpoint"}'})).json()).checkpoint;});
  await page.evaluate(()=>request('start'));await page.waitForFunction(()=>frame?.projection?.revision===0);
  await page.evaluate(checkpoint=>request('restore',{checkpoint}),checkpoint);await page.waitForFunction(()=>frame?.projection?.revision===1);
  await page.locator('#viewer').selectOption('-1');await page.waitForFunction(()=>frame?.projection?.viewer===-1);assert.equal(await game.locator('.sdk-board-grid button:not([disabled])').count(),0);
  const assets=await page.evaluate(()=>request('assets'));assert(assets.assets.files.some(file=>file.file==='assets/cover.webp'));assert.equal(await page.locator('#options,#option-fields,#events,#asset-list,.studio-sidebar,#bot,#save,#restore,#reload').count(),0,'authoring and diagnostics stay outside the viewer');
  const check=await page.evaluate(()=>request('check'));assert.equal(check.check.budget.maxBytes,4000000);assert.equal(await page.evaluate(()=>['checkpoint','debug','assets','check'].some(key=>Object.hasOwn(frame,key)||Object.hasOwn(renderer.renderer.frame,key))),false,'author operation payloads never enter the rendering frame');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  const directory=path.resolve(__dirname,'../dist/test-results/sdk-studio');fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'phone.png'),fullPage:true});
 }finally{await context.close();await browser.close();await running.close();}
});

test('Studio uses the common transfer cue for a single Old Maid draw',{timeout:45000},async()=>{
 const running=await serve(path.resolve(project,'../oldmaid'),{shared});
 const browser=await chromium.launch({headless:true,executablePath:executablePath()});
 try{
  const page=await browser.newPage({viewport:{width:920,height:960},reducedMotion:'no-preference'});
  await page.goto(running.url);
  const game=page.frameLocator('#scene'),opponent=game.locator('[data-sdk-player-choice] .player-info').first();
  await opponent.evaluate(element=>{
   const window=element.ownerDocument.defaultView;
   window.transfers=[];
   const animate=window.Element.prototype.animate;
   window.Element.prototype.animate=function(...args){
    if(this.matches('.playroom-motion-flight[data-motion-kind=draw]'))window.transfers.push(this.dataset.motionKind);
    return animate.apply(this,args);
   };
  });
  await opponent.click();
  await game.locator('.card-choice-dialog [data-card-index]').first().click();
  await page.waitForFunction(()=>frame?.projection?.revision===1);
  const viewer=page.frames().find(frame=>frame!==page.mainFrame());
  await viewer.waitForFunction(()=>window.transfers.length===1);
 }finally{await browser.close();await running.close();}
});

test('Studio rejects delayed live replies and catches up after delayed history navigation',{timeout:45000},async()=>{
 const running=await serve(project,{shared}),browser=await chromium.launch({headless:true,executablePath:executablePath()}),page=await browser.newPage();
 const headers={'content-type':'application/json','x-playroom-sdk':running.token};
 async function peer(op,extra={}){
  const response=await fetch(running.url+'/api',{method:'POST',headers,body:JSON.stringify({op,client:'peer',...extra})});
  assert.equal(response.status,200);return response.json();
 }
 async function holdReply(op,extra,during){
  const received=Promise.withResolvers(),release=Promise.withResolvers();
  const routeReply=async route=>{
   if(route.request().postDataJSON()?.op!==op)return route.continue();
   const response=await route.fetch();
   received.resolve();await release.promise;
   await route.fulfill({response});
  };
  await page.route('**/api',routeReply);
  const pending=page.evaluate(({op,extra})=>request(op,extra),{op,extra});
  try{await received.promise;await during();}
  finally{release.resolve();await pending;await page.unroute('**/api',routeReply);}
 }
 try{
  await page.goto(running.url);
  await page.waitForFunction(()=>renderer?.frame&&document.querySelector('#connection').textContent==='Обновления подключены');
  await page.evaluate(()=>{
   const accept=acceptFrame;
   acceptFrame=(value,source)=>{
    if(source==='stream'&&value?.projection)window.latestStreamRevision=value.projection.revision;
    return accept(value,source);
   };
  });
  const command=await page.evaluate(()=>frame.projection.actions[0]);
  await holdReply('view',{},async()=>{
   await peer('apply',{command});
   await page.waitForFunction(()=>frame.projection.revision===1);
  });
  assert.deepEqual(await page.evaluate(()=>[frame.projection.revision,renderer.frame.projection.revision]),[1,1]);
  await page.evaluate(()=>request('seek',{index:0}));
  assert.equal(await page.evaluate(()=>frame.history.reviewing),true);
  await holdReply('seek',{index:null},async()=>{
   const next=await peer('view',{viewer:1});await peer('apply',{viewer:1,command:next.projection.actions[0]});
   await page.waitForFunction(()=>window.latestStreamRevision===2);
  });
  await page.waitForFunction(()=>!frame.history.reviewing&&frame.projection.revision===2,{},{timeout:5000});
  await holdReply('seek',{index:0},async()=>{
   await peer('start');
   await page.waitForFunction(()=>frame.sessionEpoch===1,{},{timeout:5000});
  });
  assert.deepEqual(await page.evaluate(()=>[frame.sessionEpoch,frame.history.reviewing,renderer.frame.sessionId===frame.sessionId]),[1,false,true]);
 }finally{await browser.close();await running.close();}
});

test('author studio keeps exact device viewports with docked tools and game-only fullscreen',{timeout:45000},async()=>{
 const running=await serve(project,{shared}),browser=await chromium.launch({headless:true,executablePath:executablePath()}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(running.url+'/studio');
  await page.waitForFunction(()=>!!renderer?.frame&&document.querySelector('#option-fields [name=playerCount]'));
  const game=page.frameLocator('#scene'),panel=page.locator('#author-panel'),tools=page.locator('#studio-tools');
  const size=()=>game.locator('body').evaluate(()=>[innerWidth,innerHeight]);
  await tools.click();await panel.waitFor();assert.deepEqual(await size(),[390,844]);
  assert.equal(await page.locator('.preview-workspace').getAttribute('data-docked'),'true');
  await panel.locator('details:has(#assets)>summary').click();await page.locator('#assets').click();
  await page.locator('#asset-list button').filter({hasText:'assets/cover.webp'}).click();
  await page.waitForFunction(()=>document.querySelector('#asset-preview img')?.naturalWidth>0);
  assert.deepEqual(await size(),[390,844],'loading an asset never resizes the game');
  for(const [width,height]of [[844,390],[768,1024],[1024,768],[900,1440],[1440,900]]){
   await page.locator('#viewport-size').selectOption(`${width}:${height}`);
   if(width===1440){assert.equal(await page.locator('#scene').isVisible(),false);await tools.click();}
   assert.deepEqual(await size(),[width,height]);
  }
  await page.setViewportSize({width:630,height:900});await page.locator('#viewport-size').selectOption('390:844');await tools.click();
  assert.equal(await panel.isVisible(),true);assert.equal(await page.locator('#scene').isVisible(),false);
  await panel.locator('button[type=submit]').click();await page.waitForFunction(()=>frame.sessionEpoch===1);
  await tools.click();await game.locator('.sdk-board-grid button:not([disabled])').first().waitFor();assert.deepEqual(await size(),[390,844]);
  const session=await page.evaluate(()=>frame.sessionId);
  await page.locator('#viewport-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='preview-viewport');
  assert.deepEqual(await size(),[390,844]);
  await game.locator('.sdk-board-grid button:not([disabled])').first().click();await page.waitForFunction(()=>frame.projection.revision===1);
  await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.fullscreenElement);
  assert.equal(await page.evaluate(()=>frame.sessionId),session);
  await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing);
  await page.evaluate(async()=>{const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({client:'terminal',op:'start'})});if(!response.ok)throw Error(await response.text());});
  await page.waitForFunction(()=>frame.sessionEpoch===2&&!frame.history.reviewing);
  assert.equal(await page.locator('#error').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();await running.close();}
});

test('author settings control the same three-move game in studio and installed app',{timeout:60000},async t=>{
 const {execFileSync}=require('node:child_process'),TestUI=require('./browser-origin.cjs');
 const app=path.resolve(__dirname,'..'),packs=path.dirname(shared),utils=path.resolve(app,'../boardgame-playroom-utils/sdk.py');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-counter-settings-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const id='sdk-settings-counter',source=path.join(directory,id),output=path.join(directory,id+'.playroom-pack.json');
 const sdk=(...args)=>JSON.parse(execFileSync('python3',[utils,'--app',app,...args],{encoding:'utf8'}));
 sdk('new',source,'--id',id,'--packs',packs);
 const checked=sdk('check',source,'--shared',shared);
 const verified=sdk('verify',source,'--shared',shared,'--steps','8');
 const compiled=sdk('compile',source,'--packs',packs,'--output',output);
 const bytes=fs.readFileSync(output),bundle=JSON.parse(bytes);
 assert.equal(checked.status,'passed');
 assert.equal(verified.status,'passed');
 assert.equal(compiled.authorSourceHash,checked.hash);
 assert.equal(compiled.authorSourceHash,verified.hash);
 assert.equal(compiled.sourceHash,bundle.sdk.sourceHash);
 assert.equal(compiled.sha256,require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
 assert.equal(bundle.manifest.settings.fields.find(field=>field.key==='target').default,6);
 assert(!Object.hasOwn(bundle.manifest.sourceModules||{},'settings'));
 const running=await serve(source,{shared});t.after(()=>running.close());
 const server=await TestUI.serveBrowserFixture(app);t.after(()=>server.close());
 const browser=await chromium.launch({headless:true,executablePath:executablePath()});t.after(()=>browser.close());
 const studio=await browser.newPage({viewport:{width:1400,height:950},reducedMotion:'reduce'});
 const player=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];for(const page of [studio,player]){
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**',route=>route.abort());
 }
 await studio.goto(running.url+'/studio');
 await studio.locator('#studio-tools').click();
 const target=studio.locator('#option-fields [name=target]');
 assert.equal(await target.inputValue(),'6');
 await target.selectOption('3');
 await studio.locator('#options button[type=submit]').click();
 await studio.waitForFunction(()=>frame.sessionEpoch===1);
 assert.equal(await target.inputValue(),'3');

 await player.goto(server.url);
 await player.locator('#profile-form [name=playerName]').fill('Тестовый игрок');
 await player.locator('[data-profile-play-label]').click();
 const packManager=await TestUI.openPacks(player);
 await packManager.locator('#pack-file').setInputFiles(output);
 await packManager.locator('[data-pack-install]').click();
 await packManager.locator('[data-installed-pack][data-pack-id="'+id+'"]').waitFor();
 await packManager.locator('.modal-head [data-command=close-modal]').click();
 const room=await TestUI.openGame(player,id);
 await player.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});
 await room.locator('[data-command=room-rules]').click();
 await TestUI.selectChoice(room.locator('[name=option-target]'),'3');
 await room.locator('button[type=submit][form=room-rules-form]').click();
 await room.locator('[data-command=lobby-start]').click();
 await player.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.data.target===3);

 const studioCell=studio.frameLocator('#scene').locator('.sdk-board-grid button:not([disabled])').first();
 const playerCell=player.locator('.sdk-board-grid button:not([disabled])').first();
 for(let count=1;count<=3;count++){
  const viewer=await studio.evaluate(()=>frame.projection.turn);
  await studio.locator('#viewer').selectOption(String(viewer));
  await studio.waitForFunction(viewer=>frame.projection.viewer===viewer,viewer);
  await studioCell.click();
  if(count>1)await player.locator('[data-command=pass-device]').click();
  await playerCell.click();
  await studio.waitForFunction(count=>frame.projection.data.count===count,count);
  await player.waitForFunction(count=>PlayroomAppBridge.saveLibrary.current()?.session.current.data.count===count,count);
 }
 assert.equal(await studio.evaluate(()=>frame.projection.status),'finished');
 assert.equal((await TestUI.currentState(player)).status,'finished');
 await studio.locator('#history-prev').click();
 await studio.waitForFunction(()=>frame.history.reviewing&&frame.projection.data.count===2);
 await TestUI.activeSurface(player).locator('[data-command=close-modal]').click();
 await player.locator('[data-game-menu]').click();
 await TestUI.activeSurface(player).locator('[data-command=history]').click();
 const slider=player.locator('#replay-range');await slider.focus();await slider.press('End');await slider.press('ArrowLeft');
 const studioHistory=studio.frameLocator('#scene').locator('.sdk-board-grid button');
 const playerHistory=player.locator('.sdk-board-grid button');
 await playerHistory.filter({hasText:'2'}).waitFor();
 assert.equal(await slider.inputValue(),'2');
 assert.equal(await playerHistory.textContent(),await studioHistory.textContent());
 assert.equal(await studioCell.count(),0);
 assert.equal(await playerCell.count(),0);
 assert.deepEqual(errors,[]);
});

test('native SDK viewer uses application zones for every shipped pack across real viewports',{timeout:180000},async t=>{
 const packs=path.resolve(shared,'../packs'),ids=fs.readdirSync(packs).filter(id=>fs.existsSync(path.join(packs,id,'sdk/project.json'))&&(!process.env.PLAYROOM_SDK_VIEW_PACKS||process.env.PLAYROOM_SDK_VIEW_PACKS.split(',').includes(id))),browser=await chromium.launch({headless:true,executablePath:executablePath()}),records=[];
 const output=process.env.PLAYROOM_SDK_VIEW_EVIDENCE?path.resolve(process.env.PLAYROOM_SDK_VIEW_EVIDENCE):path.resolve(__dirname,'../../tmp_files/sdk-native-view');fs.mkdirSync(output,{recursive:true});
 try{for(const id of ids)await t.test(id,async()=>{
  const running=await serve(path.join(packs,id),{shared}),context=await browser.newContext({viewport:{width:1920,height:1200},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(running.url);const game=page.frameLocator('#scene');await page.waitForFunction(()=>!!frame&& (!!renderer?.renderer?.frame||!document.getElementById('error').hidden));assert.equal(await page.locator('#error').isVisible(),false,id+' mounts without a swallowed exception: '+await page.locator('#error').textContent());await game.locator('[data-sdk-player-scene].sdk-scene').waitFor({timeout:5000});
   assert.equal(await game.locator('.sdk-player:visible,.sdk-zones:visible,.sdk-objects:visible').count(),0,'the viewer uses native participant cards');
   const round=await page.evaluate(()=>frame.scene.round?null:frame.projection.timeline?.round);
   if(round)assert.match(await game.locator('.game-frame-turn-extra').textContent(),new RegExp(`Раунд ${round}\\b`));
   const position=await page.evaluate(async()=>{const result=await request('checkpoint');return {position:result.checkpoint.position,options:frame.options,pack:frame.pack};});fs.writeFileSync(path.join(output,id+'-position.json'),JSON.stringify(position));
   const pair=game.locator('.sdk-stock-discard'),sizes=[{width:1280,height:900},{width:390,height:844},{width:844,height:390}];
   // Every scene must fit tablet and short landscape viewports. The card pair
   // also checks that returning to desktop restores its initial scale.
   sizes.push({width:768,height:1024},{width:1024,height:768},{width:844,height:320});
   if(await pair.count())sizes.push({width:1280,height:900});
   let desktopCardWidth;
   for(const viewport of sizes){
    await page.locator('#scene').evaluate((iframe,size)=>{Object.assign(iframe.style,{width:size.width+'px',height:size.height+'px',minHeight:'0'});},viewport);
    await game.locator('#app').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await game.locator('#app').evaluate(host=>{const rect=e=>e?.getBoundingClientRect().toJSON(),field=host.querySelector('.layout-field');return {viewport:[innerWidth,innerHeight],field:rect(field),players:[...host.querySelectorAll('.player-panel')].map(e=>({player:e.dataset.playerIndex,box:rect(e)})),pageOverflow:document.documentElement.scrollWidth>innerWidth+1};});
    assert.deepEqual(geometry.viewport,[viewport.width,viewport.height],'CSS receives the actual selected viewport');assert(geometry.field.width>=80&&geometry.field.height>=80,id+' has a usable field '+JSON.stringify(geometry));assert.equal(geometry.pageOverflow,false,id+' keeps the game inside its viewport');
    if(await game.locator('.sdk-collected-sets').count())assert.equal(await game.locator('.layout-field').evaluate(field=>getComputedStyle(field).backgroundColor),'rgba(0, 0, 0, 0)');
    const opening=game.locator('.sdk-chain-opening > .sdk-chain-drop');
    if(await opening.count()){
     const box=await opening.boundingBox(),short=viewport.width>viewport.height&&viewport.height<=540;
     assert(box.width>=(short?58:70)&&box.height>=(short?44:58),JSON.stringify(box));
     assert.equal(await opening.isDisabled(),true);
     assert.equal(await opening.evaluate(node=>getComputedStyle(node).opacity),'1');
     const dock=game.locator('.layout-actions>.game-action-bar');
     assert.equal(await dock.locator('[data-action]').count(),0);
     assert((await dock.boundingBox()).height>=44,'the empty action bar reserves a row for draw or pass');
    }
    const fans=await game.locator('.layout-hand .hand-track.is-fan').evaluateAll(tracks=>tracks.map(track=>{
     const cards=[...track.querySelectorAll('.hand-card')];
     return {arc:track.classList.contains('is-arc'),angles:cards.map(card=>parseFloat(card.style.getPropertyValue('--hand-arc-angle')))};
    }));
    for(const {arc,angles} of fans){
     assert.equal(arc,true,'the viewer uses the application default hand shape');
     if(angles.length>1)assert(angles.some(angle=>angle<0)&&angles.some(angle=>angle>0),JSON.stringify(angles));
    }
    if(await pair.count()){
     const table=await pair.evaluate(element=>{
      const stock=element.querySelector('.sdk-table-stock-art'),discard=element.querySelector('.sdk-table-discard > .sdk-piece-card');
      const {width,height}=getComputedStyle(stock),rect=item=>item.getBoundingClientRect().toJSON();
      return {width:parseFloat(width),height:parseFloat(height),discardWidth:parseFloat(getComputedStyle(discard).width),stock:rect(stock),discard:rect(discard),baseline:parseFloat(getComputedStyle(element).getPropertyValue('--size-hand-card'))};
     });
     assert(Math.abs(table.height/table.width-1.4)<.01,JSON.stringify(table));
     assert.equal(table.width,table.discardWidth,'stock and discard use the same scale');
     for(const card of [table.stock,table.discard])assert(card.left>=geometry.field.left&&card.right<=geometry.field.right&&card.top>=geometry.field.top&&card.bottom<=geometry.field.bottom,JSON.stringify({field:geometry.field,card}));
     if(viewport.width===1280){
      assert(table.width>table.baseline*1.5,'the wide field gives the central pair more space');
      if(desktopCardWidth!==undefined)assert.equal(table.width,desktopCardWidth,'returning to the same viewport restores the same scale');
      desktopCardWidth=table.width;
     }else if(viewport.width===390||viewport.height<=390)assert(table.width<=table.baseline*1.2,JSON.stringify(table));
     geometry.tableCards=table;
    }
    const file=id+'-'+viewport.width+'x'+viewport.height+'.png';await game.locator('#app').screenshot({path:path.join(output,file),animations:'disabled'});records.push({id,file,...geometry});
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();await running.close();}
 });}finally{await browser.close();fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(records,null,2));}
});

test('native SDK viewer reuses the application menu and revokes historical commands',{timeout:45000},async t=>{
 const project=fixture(t,{render:"return {contractVersion:1,id:'probe',family:'board',players:[0,1].map(player=>({player,metrics:[]})),menuActions:projection.actions.map(command=>({kind:'vote',label:'End proposal',command}))};"}),running=await serve(project),browser=await chromium.launch({headless:true,executablePath:executablePath()}),context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await page.goto(running.url);const game=page.frameLocator('#scene');await page.waitForFunction(()=>!!frame&&!!renderer);const menuState=await page.evaluate(()=>{try{renderer.update(frame);return {actions:frame.scene.menuActions,error:document.getElementById('error').textContent};}catch(e){return {exception:e.stack};}});assert(!menuState.exception,JSON.stringify(menuState));assert(menuState.actions?.length,JSON.stringify(menuState));const privateFrame=await page.evaluate(()=>{try{renderer.update({...frame,checkpoint:{position:{secret:'NOT_A_RENDER_INPUT'}}});return false;}catch(error){return error.code==='SDK_PRIVATE_FRAME_DENIED';}});assert.equal(privateFrame,true,'accidental authority envelopes are rejected before rendering');await game.locator('[data-game-menu]').click({timeout:5000});await game.getByRole('button',{name:'End proposal',exact:true}).click();await page.waitForFunction(()=>frame.projection.revision===1);assert.equal(await game.locator('.game-menu-panel:visible').count(),0,'the same menu retires before dispatching the SDK command');
  await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing);assert.equal(await game.locator('[data-game-menu]').count(),0,'history cannot keep the previous live menu command');assert.equal(await game.getByRole('button',{name:'End proposal',exact:true}).count(),0);assert.equal(await page.locator('#error').isVisible(),false);
  await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);await game.locator('[data-game-menu]').click();const disposed=await page.evaluate(()=>{const view=document.querySelector('#scene').contentWindow,host=view.document.getElementById('app');let invalid=false;try{new view.PlayroomSDKGameView(view.document.createElement('div'),{command:()=>{}});}catch(error){invalid=error.code==='SDK_NATIVE_HOST_REQUIRED';}renderer.destroy();renderer.destroy();let rejected=false;try{renderer.update(frame);}catch(error){rejected=error.code==='SDK_VIEW_DISPOSED';}return {invalid,rejected,inert:host.inert,opened:view.PlayroomGameMenu.opened,submitted:renderer.send({type:'step'})};});assert.deepEqual(disposed,{invalid:true,rejected:true,inert:false,opened:false,submitted:false});
 }finally{await context.close();await browser.close();await running.close();}
});

test('a tutorial step refreshes its text while retaining the current page',async t=>{
 const running=await serve(fixture(t)),browser=await chromium.launch({headless:true,executablePath:executablePath()});
 try {
  const page=await browser.newPage();await page.goto(running.url);await page.waitForFunction(()=>!!renderer?.renderer?.frame);
  const values=await page.evaluate(()=>{
   const scene=renderer.renderer,frame=scene.frame;
   const paint=count=>scene.update({...frame,support:{tutorial:{steps:[
    {id:'start',text:'Start'},{id:'remaining',text:'Cards left: '+count}
   ]}}});
   const read=()=>[scene.tutorialText.textContent,scene.tutorialCount.textContent];
   paint(3);scene.advanceTutorial();const before=read();paint(2);return [before,read()];
  });
  assert.deepEqual(values,[['Cards left: 3','2 / 2'],['Cards left: 2','2 / 2']]);
 } finally {await browser.close();await running.close();}
});

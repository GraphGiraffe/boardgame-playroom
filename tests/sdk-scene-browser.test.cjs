'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {serve}=require('../sdk/server.cjs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {fixture}=require('./sdk-fixture.cjs');
const packs=process.env.PLAYROOM_PACKS_ROOT||path.resolve(__dirname,'../../playroom-paks');

async function studio(t,{project=path.join(packs,'packs/klondike'),reducedMotion='reduce',hasTouch=false}={}){
 const running=await serve(project,{shared:path.join(packs,'shared')});
 let browser,context;
 t.after(async()=>{if(context)await context.close();if(browser)await browser.close();await running.close();});
 browser=await chromium.launch({headless:true,executablePath:executablePath()});
 context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion,hasTouch,playroomProfile:false});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(running.url);
 await page.locator('#identity').filter({hasText:'0.'}).waitFor();
 return {page,errors};
}
async function foundationSeed(page){
 await page.locator('input[name=rng]').fill('7');
 const started=page.waitForResponse(response=>response.url().endsWith('/api')&&response.request().method()==='POST'&&response.request().postDataJSON()?.op==='start');
 await page.locator('#options button[type=submit]').click();assert.equal((await started).ok(),true);
 await page.waitForFunction(()=>frame?.options?.rng===7&&JSON.parse(document.querySelector('#projection').textContent).revision===0);
}
async function foundationCommand(page){
 return page.evaluate(()=>JSON.parse(document.querySelector('#projection').textContent).actions.find(command=>command.type==='move'&&command.target==='foundation'));
}
async function moveToFoundation(page,{drag=false,touch=false}={}){
 const command=await foundationCommand(page);
 assert(command,'The fixed seed exposes a real legal foundation move');
 const source=page.locator('[data-entity="card-'+command.card+'"]');
 const target=page.locator('[data-zone="'+command.target+'-'+command.to+'"] .sdk-piece-card').last();
 if(touch&&drag){await source.tap();const a=await source.boundingBox(),b=await target.boundingBox(),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width/2+(b.x+b.width/2-a.x-a.width/2)*step/12,y:a.y+a.height/2+(b.y+b.height/2-a.y-a.height/2)*step/12,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else if(drag){
  await source.scrollIntoViewIfNeeded();
  const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
 }else if(touch){await source.tap();await target.tap();}else{await source.click();await target.click();}
 return command;
}
async function noHiddenCards(page){
 assert.equal(await page.locator('.sdk-solitaire [style*="visibility: hidden"]').count(),0);
 assert.equal(await page.locator('.sdk-flight-layer').count(),0);
}

test('SDK shared card tap and drag fly above foundation piles and clean up through PlanPlayer',{timeout:60000},async t=>{
 const {page,errors}=await studio(t,{reducedMotion:'no-preference',hasTouch:true});
 await foundationSeed(page);
 const unchanged=await page.evaluate(()=>{const original=Element.prototype.getBoundingClientRect,art=document.querySelector('.sdk-solitaire [data-entity] svg');let reads=0;Element.prototype.getBoundingClientRect=function(){if(this.matches('#scene [data-entity]'))reads++;return original.call(this);};try{const next={...frame,scene:{...frame.scene,players:frame.scene.players.map((p,i)=>i? p:{...p,metrics:[{id:'test-points',kind:'points',value:1,label:'Очки'}]})}};renderer.update(next);renderer.update({...next,projection:{...next.projection,revision:next.projection.revision+1}});renderer.update(frame);return {reads,sameArt:art===document.querySelector('.sdk-solitaire [data-entity] svg')};}finally{Element.prototype.getBoundingClientRect=original;}});assert.equal(unchanged.reads,0,'score-only frames never measure card geometry');assert.equal(unchanged.sameArt,true);
 const first=await foundationCommand(page),keyboardSource=page.locator('[data-entity="card-'+first.card+'"]');await keyboardSource.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.sdk-cancel-selection').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.sdk-cancel-selection').isVisible(),false);assert.equal(await keyboardSource.evaluate(e=>e===document.activeElement),true);await keyboardSource.click();await page.locator('.sdk-cancel-selection').click();assert.equal(await page.locator('.sdk-cancel-selection').isVisible(),false);
 // Slow the shared player, not the browser clock or game rules, for reliable layer observation.
 await page.evaluate(()=>renderer.motionPlayer.setRate(.5));
 for(const touch of [false,true]){if(touch)await foundationSeed(page);for(let index=0;index<2;index++){
  const command=await moveToFoundation(page,{drag:index===1,touch});
  const flight=page.locator('.sdk-flight').first();await flight.waitFor();
  const layer=await flight.evaluate(element=>({position:getComputedStyle(element).position,z:Number(getComputedStyle(element.closest('.sdk-flight-layer')).zIndex)}));
  assert.equal(layer.position,'fixed');assert(layer.z>=1000);
  await page.evaluate(()=>renderer.motionPlayer.whenIdle());
  assert.equal(await page.locator('[data-zone="'+command.target+'-'+command.to+'"] [data-entity="card-'+command.card+'"]').evaluate(element=>element.style.visibility),'');
  await noHiddenCards(page);
 }}
 assert.deepEqual(errors,[]);
 const uno=await studio(t,{project:path.join(packs,'packs/uno'),hasTouch:true});
 await uno.page.setViewportSize({width:390,height:844});
 const restart=async()=>{await uno.page.locator('input[name=playerCount]').fill('4');await uno.page.locator('input[name=rng]').fill('1');const response=uno.page.waitForResponse(r=>r.url().endsWith('/api')&&r.request().postDataJSON()?.op==='start');await uno.page.locator('#options button[type=submit]').click();await response;await uno.page.waitForFunction(()=>frame.options.rng===1&&frame.projection.revision===0);};
 await restart();
 const choices=await uno.page.evaluate(()=>{const plays=frame.projection.actions.filter(a=>a.type==='play');return {single:plays.find(a=>plays.filter(b=>b.card===a.card).length===1),wild:plays.find(a=>plays.filter(b=>b.card===a.card).length>1)};});assert(choices.single&&choices.wild);
 const gesture=async(command,{hold=false}={})=>{const card=uno.page.locator('.sdk-hand-fan.is-own-hand [data-entity="card-'+command.card+'"]');await card.scrollIntoViewIfNeeded();const a=await card.boundingBox(),cdp=await uno.page.context().newCDPSession(uno.page),x=a.x+a.width/2,y=a.y+a.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});if(hold)await uno.page.waitForTimeout(260);for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(hold?20:0)*step/8,y:y-(hold?20:70)*step/8,id:1}]});if(hold){assert.equal(await uno.page.locator('.playroom-drag-ghost').count(),1);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();};
 await gesture(choices.single,{hold:true});assert.equal(await uno.page.locator('.playroom-drag-ghost').count(),0);assert.equal(await uno.page.evaluate(()=>frame.projection.revision),0);
 await gesture(choices.single);await uno.page.waitForFunction(()=>frame.projection.revision===1);
 await restart();await gesture(choices.wild);await uno.page.locator('.sdk-choice-panel:not([hidden])').waitFor();assert.equal(await uno.page.evaluate(()=>frame.projection.revision),0,'wild swipe always retains explicit colour choice');assert.equal(await uno.page.locator('.sdk-choice-panel button').count(),4);await uno.page.locator('.sdk-choice-panel button').first().click();await uno.page.waitForFunction(()=>frame.projection.revision===1);assert.deepEqual(uno.errors,[]);
});

test('SDK shared cards keep identities and geometry through history with reduced motion',{timeout:60000},async t=>{
 const {page,errors}=await studio(t);await foundationSeed(page);
 for(let index=0;index<2;index++){
  await moveToFoundation(page);
  await page.waitForFunction(revision=>JSON.parse(document.querySelector('#projection').textContent).revision===revision,index+1);
  assert.equal(await page.locator('.sdk-flight').count(),0);
 }
 const surface=page.locator('.sdk-solitaire');
 const capture=async()=>{
  await page.locator('#identity').click();await surface.scrollIntoViewIfNeeded();
  return {rect:await surface.boundingBox(),ids:await surface.locator('[data-entity]').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity).sort()),cards:await surface.locator('.sdk-piece-card').count(),image:await surface.screenshot()};
 };
 const before=await capture();
 await page.locator('#history-prev').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Просмотр истории'));
 assert.equal(await page.locator('.sdk-solitaire .sdk-piece-card:not([disabled])').count(),0);
 await page.locator('#history-live').click();await page.waitForFunction(()=>!document.querySelector('#status').textContent.includes('Просмотр истории'));
 await page.evaluate(()=>renderer.motionPlayer.whenIdle());const after=await capture();
 assert.deepEqual(after.rect,before.rect);assert.deepEqual(after.ids,before.ids);assert.equal(after.cards,before.cards);await noHiddenCards(page);
 // Compare bounded decoded pixels; never ask assert to format large PNG buffers.
 const delta=await page.evaluate(async([a,b])=>{
  async function decode(value){const image=new Image();image.src='data:image/png;base64,'+value;await image.decode();if(image.width>2048||image.height>2048)throw Error('Unexpected screenshot size');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};}
  const [one,two]=await Promise.all([decode(a),decode(b)]);if(one.width!==two.width||one.height!==two.height)return {sameSize:false};let maxChannelDelta=0,differentPixels=0;for(let i=0;i<one.data.length;i+=4){let changed=false;for(let channel=0;channel<4;channel++){const d=Math.abs(one.data[i+channel]-two.data[i+channel]);maxChannelDelta=Math.max(maxChannelDelta,d);if(d)changed=true;}if(changed)differentPixels++;}return {sameSize:true,maxChannelDelta,differentPixels};
 },[before.image.toString('base64'),after.image.toString('base64')]);
 assert.equal(delta.sameSize,true);assert(delta.maxChannelDelta<=5,'Only browser antialias variation up to five channel units is permitted');
 t.diagnostic(JSON.stringify(delta));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('details').filter({has:page.locator('#motion')}).locator('summary').click();await page.locator('#motion').uncheck();await foundationSeed(page);await page.evaluate(()=>renderer.motionPlayer.setRate(.1));
 await moveToFoundation(page);await page.locator('.sdk-flight').first().waitFor();await page.locator('#motion').check();await noHiddenCards(page);assert.equal(await page.evaluate(()=>renderer.reducedMotion),true);await page.evaluate(()=>renderer.motionPlayer.whenIdle());
 await page.evaluate(()=>{window.noMotionBBox=0;window.originalRendererUpdate=renderer.update;renderer.update=function(value){const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.matches('#scene [data-entity]'))window.noMotionBBox++;return original.call(this);};try{return window.originalRendererUpdate.call(this,value);}finally{Element.prototype.getBoundingClientRect=original;}};});
 try{await moveToFoundation(page);await page.waitForFunction(()=>frame.projection.revision===2);assert.equal(await page.locator('.sdk-flight').count(),0);assert.equal(await page.evaluate(()=>window.noMotionBBox),0);}finally{await page.evaluate(()=>{renderer.update=window.originalRendererUpdate;});}
 assert.deepEqual(errors,[]);
});

test('SDK graphic records reject URL requests, stale asset scopes and excessive geometry',{timeout:60000},async t=>{
 const {page,errors}=await studio(t,{project:fixture(t,{render:"return {contractVersion:1,id:'scroll-fixture',family:'card-table',stockCount:0,players:[{player:0,metrics:[],hand:Array.from({length:20},(_,i)=>({id:'card-'+i,rank:2+i%13,suit:'♠'}))},{player:1,metrics:[]}]};"}),hasTouch:true}),forbidden=[];
 await page.setViewportSize({width:390,height:844});const hand=page.locator('.sdk-hand-fan.is-own-hand').first();await hand.scrollIntoViewIfNeeded();const handBox=await hand.boundingBox(),touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:handBox.x+handBox.width*.8,y:handBox.y+handBox.height*.5,id:1}]});for(let step=1;step<=8;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handBox.x+handBox.width*.8-160*step/8,y:handBox.y+handBox.height*.5,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>document.querySelector('.sdk-hand-fan.is-own-hand').scrollLeft>0);await touch.detach();

 const botCapability=await page.evaluate(()=>{const original=frame.pack.capabilities;frame.pack.capabilities={...original,bots:false};render();const disabled=document.querySelector('#bot').disabled,title=document.querySelector('#bot').title;frame.pack.capabilities=undefined;render();const defaultEnabled=!document.querySelector('#bot').disabled;frame.pack.capabilities=original;render();return {disabled,title,defaultEnabled};});assert.deepEqual(botCapability,{disabled:true,title:'В этой игре нет ходов бота',defaultEnabled:true});
 page.on('request',request=>{if(request.url().includes('should-never-fetch'))forbidden.push(request.url());});
 const result=await page.evaluate(()=>{
  const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:30px;height:30px';document.body.append(host);
  const values=['url(/should-never-fetch-relative)','url(//should-never-fetch.invalid/x)','u\\72l(/should-never-fetch-escaped)','URL( /should-never-fetch-spaced )','image-set("/should-never-fetch-image" 1x)','javascript:alert(1)'];
  for(const value of values)host.append(PlayroomSDKRenderGraphic({kind:'vector',tag:'svg',attrs:{viewBox:'0 0 10 10'},children:[{kind:'vector',tag:'rect',attrs:{width:'10',height:'10',fill:value,styles:{background:value,'--unsafe':value}},children:[]},{kind:'vector-text',text:'x',x:2,y:2,fill:value},{kind:'vector',tag:'use',attrs:{href:value},children:[]}]}));
  const forgedAttributes=[...host.querySelectorAll('*')].some(element=>[...element.attributes].some(attribute=>attribute.value.includes('should-never-fetch')||attribute.value.includes('\\72')));host.remove();
  const parent=document.createElement('div');document.body.append(parent);const diagnostics=[];
  const r=new PlayroomSDKSceneRenderer(parent,{text:value=>String(value??''),command:async()=>false,error:error=>diagnostics.push(error.code)});
  const asset={file:'assets/scope.svg',sha256:'scope-a',mime:'image/svg+xml',data:btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>')};
  const frame={now:0,pack:{hash:'scope-a'},history:{index:0,count:1,reviewing:false},projection:{game:'scope-a',viewer:0,turn:0,revision:0,playerCount:2,actions:[],inputs:[]},actions:[],scene:{contractVersion:1,id:'scope',family:'card-table',players:[{player:0,metrics:[],hand:[{id:'card1',asset:{kind:'asset',id:'assets/scope.svg'}}]},{player:1,metrics:[]}]},resources:{assets:[asset]}};
  r.update(frame);const initial=parent.querySelectorAll('img').length;
  r.update({...frame,pack:{hash:'scope-b'},projection:{...frame.projection,game:'scope-b'},resources:{assets:[]}});const remaining=parent.querySelectorAll('img').length;
  let rejected=0;for(const record of [{kind:'component',component:'links',value:{args:[[],1000000]}},{kind:'group',children:Array.from({length:10001},()=>({kind:'text',text:'x'}))},{kind:'component',component:'score-table',value:{rows:Array.from({length:129},()=>[])}}]){try{PlayroomSDKRenderGraphic(record);}catch(error){if(error.code==='SDK_GRAPHIC_LIMIT')rejected++;}}
  try{r.update({...frame,scene:{...frame.scene,family:'grid-board',columns:1000000,rows:1000000,pieces:[]}});}catch(error){if(error.code==='SDK_SCENE_GEOMETRY_LIMIT')rejected++;}
  r.destroy();parent.remove();return {forgedAttributes,initial,remaining,diagnostics,rejected};
 });
 assert.equal(result.forgedAttributes,false);assert.equal(result.initial,1);assert.equal(result.remaining,0);assert(result.diagnostics.includes('SDK_RESOURCE_UNAVAILABLE'));assert.equal(result.rejected,4);
 await page.waitForTimeout(100);assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{createPreview}=require('../dev/serve-preview.cjs'),Session=require('../core/session.js'),E=require('../core/engine.js');
const root=path.resolve(__dirname,'..'),packs=path.join(root,'packs'),renderOnly=process.env.PLAYROOM_RENDER_ONLY==='1';
function pack(){const dir=path.join(packs,'uno'),manifest=JSON.parse(fs.readFileSync(dir+'/manifest.json','utf8'));return {format:'playroom-pack',formatVersion:1,manifest,files:Object.fromEntries(['rules.js','view.js','styles.css','sounds.js'].map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]))};}
async function open(browser,preview,viewer,size={width:390,height:740}){
  const context=await browser.newContext({viewport:size,hasTouch:true,isMobile:size.width<1000}),page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(!renderOnly){await page.goto(preview.url(viewer));await page.locator('.uno-scene').waitFor();}
  else {
    // Optional offline rendering bridge for restricted CI sandboxes. Default is real HTTP navigation.
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><div id="modal-root"></div><div id="toast"></div>');
    for(const file of ['core/ui.css','core/input.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
    for(const file of ['core/ui.js','app/views.js','core/protocol.js','core/input.js','app/session-client.js','app/shared-views.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
    const origin=new URL(preview.url(viewer)).origin,token=preview.links.find(l=>l.viewer===viewer).token;
    await page.exposeFunction('previewRequest',async(method,value)=>{const response=await fetch(origin+'/api/'+method,{headers:{Authorization:'Bearer '+token,...(value?{'Content-Type':'application/json'}:{})},method:value?'POST':'GET',body:value?JSON.stringify(value):undefined});return response.json();});
    await page.evaluate(async definition=>{const transport={snapshot:()=>previewRequest('snapshot'),dispatch:c=>previewRequest('command',c),history:i=>previewRequest('history?index='+i),subscribe:fn=>{const timer=setInterval(()=>previewRequest('snapshot').then(fn),200);return ()=>clearInterval(timer);}};const client=new PlayroomSessionClient(transport);PlayroomSharedViews.mount(client,definition);await client.refresh();},preview.definition);
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'app/shared-views.css'),'utf8')});
  }
  return {page,context,errors};
}
async function visibleControl(page,selector){const r=await page.locator(selector).first().boundingBox(),size=page.viewportSize();assert.ok(r&&r.x>=-1&&r.y>=0&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1,selector+' inside viewport');assert.ok(r.width>=43&&r.height>=43,selector+' tap target');}
async function start(count=7,players=4){
  const bundle=pack(),initial=createPreview({bundle,players,seed:'shared-test'}),saved=initial.session.export();await initial.close();
  const d=saved.states[0].data;
  if(count>7)d.hands[0].push(...d.drawPile.splice(0,count-7));else if(count<7)d.drawPile.push(...d.hands[0].splice(count));
  // Put a real wild card in the active hand, preserving card conservation.
  if(!d.hands[0].some(c=>c.color==='wild'&&c.value==='wild')){const index=d.drawPile.findIndex(c=>c.color==='wild'&&c.value==='wild');[d.hands[0][0],d.drawPile[index]]=[d.drawPile[index],d.hands[0][0]];}
  E.validateState(saved.states[0]);const preview=createPreview({bundle,session:Session.restore(E,saved),players});await preview.listen();return preview;
}
test('shared preview: private clients, manual actions, public updates and rotation', {timeout:90000},async t=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  await t.test('public and 2 private pages receive distinct projections, play without touching public table',async()=>{
   const preview=await start(),a=await open(browser,preview,0),b=await open(browser,preview,1),pub=await open(browser,preview,-1,{width:1280,height:800});
   try{for(const screen of [a,b,pub]){assert.equal(await screen.page.evaluate(()=>typeof TabletopSession),'undefined');assert.equal(await screen.page.evaluate(()=>typeof TabletopCore),'undefined');}
    const ids=preview.session.current.data.hands[1].map(c=>c.id);for(const id of ids)assert.ok(!(await a.page.content()).includes('card-'+id+'"'));
    assert.equal(await pub.page.locator('.own-hand').count(),0);assert.equal(await pub.page.locator('[data-action]').count(),0);
    assert.equal(await a.page.locator('.uno-player-targets [data-accuse-player]').count(),3);
    await b.page.locator('[data-shared=help]').click(); // Personal modal must not pause another player.
    await a.page.locator('.uno-call').click();await a.page.waitForFunction(()=>document.querySelector('.shared-status').textContent.includes('Ход 2'));
    assert.equal(preview.authority.revision,1);await pub.page.waitForFunction(()=>document.querySelector('.shared-status').textContent.includes('Ход 2'));
    await b.page.locator('[data-shared=close]').click();
    await a.page.locator('.stock-button[data-action]').click();await a.page.waitForFunction(()=>document.querySelector('.shared-status').textContent.includes('Ход 3'));
    assert.equal(preview.authority.revision,2);for(const screen of [a,b,pub])assert.deepEqual(screen.errors,[]);
    if(!renderOnly){await a.page.reload();await a.page.locator('.uno-scene').waitFor();assert.match(await a.page.locator('.shared-header').innerText(),/Игрок 1/);assert.ok(await a.page.evaluate(()=>localStorage.length===0));}
   }finally{await Promise.all([a.context.close(),b.context.close(),pub.context.close()]);await preview.close();}
  });
  await t.test('wild selection survives rotation, color action stays reachable and executes once',async()=>{
   const preview=await start(),{page,context,errors}=await open(browser,preview,0);try{
    const wild=preview.session.current.data.hands[0].find(c=>c.color==='wild'&&c.value==='wild')||preview.session.current.data.hands[0].find(c=>c.color==='wild');
    const selector=`.own-hand [data-select="${wild.id}"]`;const point=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();for(const y of [.2,.5,.8])for(const x of [.05,.15,.5,.9]){const p={x:r.x+r.width*x,y:r.y+r.height*y},hit=document.elementFromPoint(p.x,p.y);if(hit===el||el.contains(hit))return p;}throw Error('No exposed card point');});await page.touchscreen.tap(point.x,point.y);await page.locator('.uno-color-picker').waitFor();
    await page.setViewportSize({width:844,height:390});await visibleControl(page,'.uno-call');await visibleControl(page,'.uno-card-help');await visibleControl(page,'.color-choice');
    assert.equal(await page.locator(selector).evaluate(n=>n.classList.contains('is-selected')),true);assert.equal(preview.authority.revision,0);
    await page.locator('.color-choice').first().click();await page.waitForFunction(()=>document.querySelector('.shared-status').textContent.includes('Ход 2'));assert.equal(preview.authority.revision,1);assert.deepEqual(errors,[]);
   }finally{await context.close();await preview.close();}
  });
  for(const count of [1,7,14,30,35])for(const size of [{width:320,height:640},{width:390,height:740},{width:844,height:390}])await t.test(`${count} cards at ${size.width}x${size.height}`,async()=>{
   const preview=await start(count),{page,context,errors}=await open(browser,preview,0,size);try{
    assert.equal(await page.locator('.hand-track .uno-card').count(),count);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1));
    for(const selector of ['.uno-call','.uno-card-help','.shared-header [data-shared=history]'])await visibleControl(page,selector);
    const hand=await page.locator('.own-hand').boundingBox(),scene=await page.locator('.shared-scene').boundingBox();assert.ok(hand.y>=scene.y-1&&hand.y+hand.height<=scene.y+scene.height+1,'hand inside bounded scene');
    assert.deepEqual(errors,[]);
   }finally{await context.close();await preview.close();}
  });
 }finally{await browser.close();}
});

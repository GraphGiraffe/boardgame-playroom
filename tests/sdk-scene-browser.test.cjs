'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {serve}=require('../sdk/server.cjs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {fixture}=require('./sdk-fixture.cjs');
const packs=process.env.PLAYROOM_PACKS_ROOT||path.resolve(__dirname,'../../playroom-paks');

const viewports=new WeakMap();
async function studio(t,{project=path.join(packs,'packs/klondike'),reducedMotion='reduce',hasTouch=false}={}){
 const running=await serve(project,{shared:path.join(packs,'shared')});let browser,context;
 t.after(async()=>{if(context)await context.close();if(browser)await browser.close();await running.close();});
 browser=await chromium.launch({headless:true,executablePath:executablePath()});context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion,hasTouch,playroomProfile:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(running.url);
 await page.waitForFunction(()=>!!frame&&!!renderer?.renderer?.frame);assert.equal(await page.locator('#error').isVisible(),false);
 const game=page.frames().find(value=>value.url().endsWith('/viewer.html'));assert(game);
 // Test-only reference to the trusted host, never supplied to pack/VM code.
 await page.evaluate(()=>{document.querySelector('#scene').contentWindow.testSDKHost=renderer;});viewports.set(page,game);return {page,game,errors};
}
async function foundationSeed(page){
 const started=page.waitForResponse(r=>r.url().endsWith('/api')&&r.request().method()==='POST'&&r.request().postDataJSON()?.op==='start');
 await page.evaluate(()=>request('start',{options:{...frame.options,rng:7}}));assert.equal((await started).ok(),true);await page.waitForFunction(()=>frame?.options?.rng===7&&frame.projection.revision===0);
}
async function foundationCommand(page){return page.evaluate(()=>frame.projection.actions.find(command=>command.type==='move'&&command.target==='foundation'));}
async function idle(page){await viewports.get(page).evaluate(()=>testSDKHost.whenIdle());}
async function motionEvidence(page,name){const folder=process.env.PLAYROOM_SDK_MOTION_EVIDENCE;if(!folder)return;require('node:fs').mkdirSync(folder,{recursive:true});await viewports.get(page).locator('body').screenshot({path:path.join(folder,name+'.png')});}
async function moveToFoundation(page,{drag=false,touch=false}={}){
 const command=await foundationCommand(page);assert(command,'The fixed seed exposes a real legal foundation move');const game=viewports.get(page);
 const suit=await page.evaluate(command=>[...frame.scene.tableau.flat(),...frame.scene.waste,...frame.scene.foundations.flat()].find(card=>card.id===command.card)?.suit,command);
 const source=game.locator('[data-entity="card-'+command.card+'"]'),target=game.locator('.solitaire-home[data-foundation-suit="'+suit+'"]');
 if(touch&&drag){await source.tap();const a=await source.boundingBox(),b=await target.boundingBox(),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+3,id:1}]});for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width/2+(b.x+b.width/2-a.x-a.width/2)*step/12,y:a.y+3+(b.y+b.height/2-a.y-3)*step/12,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else if(drag){await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+3);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();}
 else if(touch){await source.tap();await target.tap();}else{await source.click();await target.click();}return command;
}
async function noHiddenCards(page){const game=viewports.get(page);assert.equal(await game.locator('.solitaire-board [style*="visibility: hidden"]').count(),0);assert.equal(await game.locator('.sdk-flight-layer,.playroom-motion-layer').count(),0);if(!await game.evaluate(()=>!!testSDKHost.frame.history?.reviewing))assert.equal(await game.locator('[data-scene-actions-home=landscape] .layout-actions').count(),1,'native controls retain their physical sidebar home after a live frame '+JSON.stringify(await game.evaluate(()=>({reviewing:testSDKHost.frame.history?.reviewing,actions:[...document.querySelectorAll('.layout-actions')].map(e=>({parent:e.parentElement.className,html:e.innerHTML.slice(0,80)})),homes:[...document.querySelectorAll('[data-scene-actions-home]')].map(e=>e.outerHTML.slice(0,120))}))));}

test('SDK shared card tap and drag fly above foundation piles and clean up through PlanPlayer',{timeout:90000},async t=>{
 const {page,game,errors}=await studio(t,{reducedMotion:'no-preference',hasTouch:true});await foundationSeed(page);
 const unchanged=await game.evaluate(()=>{const view=testSDKHost,frame=view.frame,original=Element.prototype.getBoundingClientRect,art=document.querySelector('.solitaire-board [data-entity] svg');let reads=0;Element.prototype.getBoundingClientRect=function(){if(this.matches('.solitaire-board [data-entity]'))reads++;return original.call(this);};try{const next={...frame,scene:{...frame.scene,players:frame.scene.players.map((p,i)=>i?p:{...p,metrics:[{id:'test-points',kind:'points',value:1,label:'Очки'}]})}};view.update(next);view.update({...next,projection:{...next.projection,revision:next.projection.revision+1}});return {reads,sameArt:!!art&&art===document.querySelector('.solitaire-board [data-entity] svg')};}finally{Element.prototype.getBoundingClientRect=original;view.update({...frame,history:{...frame.history,reviewing:true}});view.update(frame);}});assert.equal(unchanged.reads,0,'score-only frames never measure card geometry');assert.equal(unchanged.sameArt,true);
 const first=await foundationCommand(page),keyboardSource=game.locator('[data-entity="card-'+first.card+'"]');await keyboardSource.focus();await page.keyboard.press('Enter');assert(await game.evaluate(()=>!!testSDKHost.renderer.selectedSource));await page.keyboard.press('Escape');assert.equal(await game.evaluate(()=>testSDKHost.renderer.selectedSource),null);assert.equal(await keyboardSource.evaluate(e=>e===document.activeElement),true);
 await game.evaluate(()=>testSDKHost.renderer.motionPlayer.setRate(.5));
 for(const touch of [false,true]){if(touch)await foundationSeed(page);for(let index=0;index<2;index++){
  const command=await moveToFoundation(page,{drag:index===1,touch}),flight=game.locator('.playroom-motion-flight').first();await flight.waitFor();const layer=await flight.evaluate(element=>({position:getComputedStyle(element).position,plane:getComputedStyle(element.closest('.playroom-motion-layer')).position,outsideField:!element.closest('.solitaire-board'),z:Number(getComputedStyle(element.closest('.playroom-motion-layer')).zIndex)}));assert.equal(layer.position,'absolute');assert.equal(layer.plane,'fixed');assert(layer.outsideField&&layer.z>0,'shared motion uses a viewport plane above the board');await idle(page);
  assert.equal(await game.locator('.solitaire-foundations [data-entity="card-'+command.card+'"]').evaluate(element=>element.style.visibility),'');await noHiddenCards(page);
 }}
 // Author checkpoints may construct a repeatable position, but only the
 // projected frame reaches the renderer or supplies the motion descriptor.
 await foundationSeed(page);await page.evaluate(async()=>{const {checkpoint}=await request('checkpoint'),d=checkpoint.position.data,cards=[...d.tableau.flat(),...d.stock],take=rank=>({...cards.splice(cards.findIndex(c=>c.rank===rank&&c.suit==='♥'),1)[0],open:true});d.tableau=[[take(3)],[take(2)],[take(4)],[],[],[],[]];d.foundations=[[take(14)],[],[],[]];d.stock=cards.map(c=>({...c,open:false}));const result=await request('restore',{checkpoint});if(!result)throw Error(document.querySelector('#error').textContent);});assert.equal(await page.evaluate(()=>frame.scene.foundations.flat().length),1);assert(await page.evaluate(()=>frame.projection.actions.some(a=>a.type==='collect')),'fixture exposes collect');assert.equal(await game.locator('[data-double-action]').count(),1);
 await motionEvidence(page,'collect-before');const blank=await game.locator('.solitaire-scroll').boundingBox();await game.locator('.solitaire-scroll').dblclick({position:{x:blank.width/2,y:Math.min(260,blank.height-20)}});try{await game.locator('.playroom-motion-flight[data-motion-kind=transfer]').first().waitFor({timeout:3000});}catch(error){throw Error(JSON.stringify({frame:await page.evaluate(()=>({revision:frame.projection.revision,motion:frame.motion,foundations:frame.scene.foundations.flat().length,error:document.querySelector('#error').textContent})),dom:await game.evaluate(()=>({layers:document.querySelectorAll('.playroom-motion-layer').length,choices:testSDKHost.renderer.choiceCommands,double:[...document.querySelectorAll('[data-double-action]')].map(e=>({command:e.dataset.doubleAction,disabled:e.disabled,aria:e.getAttribute('aria-disabled'),box:e.getBoundingClientRect().toJSON()}))}))}));}
 const collect=await game.locator('.playroom-motion-layer').evaluate(e=>({top:e.querySelector('.playroom-motion-stack')?.dataset.motionAnchor,label:e.querySelector('.playroom-motion-stack')?.firstElementChild.getAttribute('aria-label'),flights:[...e.querySelectorAll('.playroom-motion-flight')].map(n=>({z:Number(n.style.zIndex),delay:n.getAnimations()[0].effect.getTiming().delay}))}));assert.equal(collect.top,'home-♥');assert.match(collect.label,/Туз/);assert.equal(collect.flights.length,3);assert(collect.flights.every((f,i)=>f.z>0&&(!i||f.delay>collect.flights[i-1].delay)),'arrivals remain ordered above the original home top');if(process.env.PLAYROOM_SDK_MOTION_EVIDENCE){await game.evaluate(()=>testSDKHost.renderer.motionPlayer.pause());await motionEvidence(page,'collect-flight');await game.evaluate(()=>testSDKHost.renderer.motionPlayer.resume());}await idle(page);await motionEvidence(page,'collect-after');await noHiddenCards(page);assert.equal(await page.evaluate(()=>frame.scene.foundations.flat().length),4);
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);await noHiddenCards(page);await page.locator('#history-next').click();try{await game.locator('.playroom-motion-flight[data-motion-kind=transfer]').first().waitFor({timeout:3000});}catch(error){throw Error(JSON.stringify({frame:await page.evaluate(()=>({revision:frame.projection.revision,motion:frame.motion,history:frame.history,error:document.querySelector('#error').textContent})),renderer:await game.evaluate(()=>({revision:testSDKHost.renderer.frame.projection.revision,reduced:testSDKHost.renderer.isReducedMotion(),transfers:testSDKHost.renderer.sceneData.solitaireLayout.transfers.length,player:testSDKHost.renderer.motionPlayer.run?.plan.id,bank:document.querySelector('[data-motion-transfers]')?.dataset.motionTransfers,connected:testSDKHost.renderer.targetScope.isConnected,scopeCurrent:testSDKHost.renderer.targetScope===testSDKHost.renderer.root.closest('.table-shell'),run:{done:testSDKHost.renderer.motionPlayer.run?.done,cancelled:testSDKHost.renderer.motionPlayer.run?.cancelled}}))}));}assert.equal(await game.locator('.playroom-motion-flight[data-motion-kind=transfer]').count(),3,'forward history replays every intermediate arrival');assert.equal(await game.locator('.playroom-motion-stack').getAttribute('data-motion-anchor'),'home-♥');await idle(page);assert.equal(await game.locator('.solitaire-board [data-sdk-target]:not([disabled])').count(),0,'historical animation grants no live input');await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);await noHiddenCards(page);assert.deepEqual(errors,[]);
});

test('native SDK UNO uses normal player highlights, in-game rules and card help',{timeout:30000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/uno')});
 await page.setViewportSize({width:390,height:926});
 assert.equal(await game.locator('.player-panel.is-next[data-player-index="1"]').count(),1);
 const revision=await page.evaluate(()=>frame.projection.revision);
 const help=game.locator('[data-command=card-help]');
 await help.click();
 const cards=game.locator('.card-help-list .card-help-entry');await cards.first().waitFor();
 assert(await cards.first().locator('.card-help-art svg').count(),'the help reuses the visible hand art');
 await help.evaluate(element=>element.ownerDocument.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await cards.first().waitFor({state:'hidden'});
 await game.locator('[data-game-menu]').click();await game.locator('[data-game-menu-action][data-command=rules]').click();
 await game.locator('.rulebook-modal .rulebook-section').first().waitFor();
 assert(await game.locator('.rulebook-modal [data-rulebook-figure] svg').count(),'shared rulebook renders a pack illustration');
 await game.locator('.rulebook-modal [data-command=close-modal]').click();
 assert.equal(await page.evaluate(()=>frame.projection.revision),revision);
 assert.equal(await game.locator('.layout-actions [data-action*="accuse-uno"]').count(),0);
 const opponent=game.locator('.player-panel [data-player-target="1"]');
 const accusation=game.locator('.player-target-menu [role=menuitem]');
 await opponent.click();
 await accusation.waitFor();
 await page.keyboard.press('Escape');
 await accusation.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>frame.projection.revision),revision);
 await opponent.click();await accusation.click();
 await page.waitForFunction(()=>frame.projection.revision===1);
 assert(await page.evaluate(()=>frame.projection.events.some(event=>event.type==='uno.false-accusation'&&event.params.target===1)));
 await idle(page);
 await page.locator('#history-prev').click();
 await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);
 assert.equal(await opponent.count(),0,'history keeps the player card without its action trigger');
 assert.equal(await game.locator('.player-target-menu').count(),0);
 assert.deepEqual(errors,[]);
 if(process.env.PLAYROOM_SDK_MOTION_EVIDENCE)await motionEvidence(page,'uno-normal-help-and-next');
});

test('native SDK UNO previews the next turn and penalty on the native player panels',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/uno')});
 await page.evaluate(()=>request('start',{options:{...frame.options,playerCount:4,rng:4,firstPlayer:0,firstPlayerMode:'assigned'}}));
 const {command,preview,baseNext}=await page.evaluate(()=>{
  const [card,preview]=Object.entries(frame.scene.turnPreviewByCard).find(([,value])=>value.kind==='+2');
  return {command:frame.projection.actions.find(action=>action.type==='play'&&action.card===card),preview,baseNext:frame.scene.nextPlayer};
 });
 assert(command);assert.notEqual(baseNext,preview.nextPlayer);assert.deepEqual(preview.affected,[baseNext]);
 const players=selector=>game.locator('.player-panel:visible'+selector).evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.playerIndex)));
 const field=()=>game.locator('.layout-field').boundingBox(),before=await field();
 const piles=()=>game.locator('.sdk-table-stock-art,.sdk-table-discard > .sdk-piece-card').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON())),pileBounds=await piles();
 const source=game.locator('.layout-hand [data-entity="card-'+command.card+'"]');
 const select=async()=>{await source.focus();await page.keyboard.press('Enter');};
 const untouched=async()=>{assert.deepEqual(await players('[data-next-turn]'),[baseNext]);assert.deepEqual(await players('[data-turn-preview]'),[]);};
 await untouched();
 await select();
 assert.deepEqual(await players('.is-next[data-next-turn]'),[preview.nextPlayer]);
 assert.deepEqual(await players('.is-turn-preview-negative[data-turn-preview=negative]'),[baseNext]);
 assert.deepEqual(await players('.is-turn-preview-positive[data-turn-preview=positive]'),[preview.nextPlayer]);
 assert.deepEqual(await field(),before);assert.deepEqual(await piles(),pileBounds);assert.equal(await page.evaluate(()=>frame.projection.revision),0);
 await source.hover({position:{x:8,y:18}});
 const hint=game.locator('#playroom-context-tooltip');await hint.waitFor();assert.match(await hint.textContent(),/берёт 2 карты/);
 assert.match(await source.getAttribute('aria-describedby'),/playroom-context-tooltip/);
 await motionEvidence(page,'uno-penalty-preview');
 await page.keyboard.press('Escape');await untouched();assert.equal(await hint.isVisible(),false);
 await select();await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>frame.projection.viewer===1);
 await untouched();assert.equal(await page.evaluate(()=>Object.keys(frame.scene.turnPreviewByCard).length),0);
 await page.locator('#viewer').selectOption('0');await page.waitForFunction(()=>frame.projection.viewer===0);await untouched();
 await select();await game.locator('.sdk-table-drop:not([disabled])').click();await page.waitForFunction(()=>frame.projection.revision===1);await idle(page);
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);
 await untouched();assert.deepEqual(await piles(),pileBounds);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.deepEqual(errors,[]);
});

test('native SDK UNO touch swipe and cancel retain legal source permissions',{timeout:45000},async t=>{
 const uno=await studio(t,{project:path.join(packs,'packs/uno'),hasTouch:true});await uno.page.setViewportSize({width:390,height:844});

 const restart=async()=>{await uno.page.evaluate(()=>request('start',{options:{...frame.options,playerCount:4,rng:1}}));await uno.page.waitForFunction(()=>frame.options.rng===1&&frame.projection.revision===0);};await restart();
 const choices=await uno.page.evaluate(()=>{const plays=frame.projection.actions.filter(a=>a.type==='play');return {single:plays.find(a=>plays.filter(b=>b.card===a.card).length===1),wild:plays.find(a=>plays.filter(b=>b.card===a.card).length>1)};});assert(choices.single&&choices.wild);assert.deepEqual(JSON.parse(await uno.game.locator('.layout-hand [data-entity="card-'+choices.single.card+'"]').getAttribute('data-swipe-action')),choices.single,'the first mounted card already has its authorized swipe');
 const gesture=async(command,{hold=false}={})=>{const card=uno.game.locator('.layout-hand [data-entity="card-'+command.card+'"]');await card.scrollIntoViewIfNeeded();const a=await card.boundingBox(),cdp=await uno.page.context().newCDPSession(uno.page),x=a.x+4,y=a.y+a.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});if(hold)await uno.page.waitForTimeout(260);for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(hold?20:0)*step/8,y:y-(hold?20:70)*step/8,id:1}]});if(hold){assert.equal(await uno.game.locator('.playroom-drag-ghost').count(),1);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();};
 await gesture(choices.single,{hold:true});assert.equal(await uno.game.locator('.playroom-drag-ghost').count(),0);assert.equal(await uno.page.evaluate(()=>frame.projection.revision),0);await gesture(choices.single);await uno.page.waitForFunction(()=>frame.projection.revision===1,null,{timeout:7000});
 await restart();const fieldBeforeChoice=await uno.game.locator('.layout-field').boundingBox();await gesture(choices.wild);await uno.game.locator('.sdk-choice-panel:not([hidden])').waitFor();assert.deepEqual(await uno.game.locator('.layout-field').boundingBox(),fieldBeforeChoice,'the choice floats without reallocating the field');assert.equal(await uno.game.locator('.sdk-choice-panel').evaluate(e=>e.matches(':popover-open')),true);assert.equal(await uno.game.locator('.sdk-choice-panel .color-choice i').count(),4,'native color swatches are retained');assert.equal(await uno.page.evaluate(()=>frame.projection.revision),0,'wild swipe retains explicit colour choice');assert.equal(await uno.game.locator('.sdk-choice-panel button').count(),4);await uno.game.locator('.sdk-choice-panel button').first().click();await uno.page.waitForFunction(()=>frame.projection.revision===1);assert.deepEqual(uno.errors,[]);
});

test('SDK shared cards keep identities and geometry through history with reduced motion',{timeout:90000},async t=>{
 const {page,game,errors}=await studio(t);await foundationSeed(page);for(let index=0;index<2;index++){await moveToFoundation(page);await page.waitForFunction(revision=>frame.projection.revision===revision,index+1);assert.equal(await game.locator('.sdk-flight,.playroom-motion-flight').count(),0);}
 const surface=game.locator('.solitaire-board');const capture=async()=>{await page.locator('#identity').click();await surface.scrollIntoViewIfNeeded();return {rect:await surface.boundingBox(),ids:await surface.locator('[data-entity]').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity).sort()),cards:await surface.locator('.solitaire-card').count(),flags:await surface.locator('[data-entity]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.entity,cls:e.className,disabled:e.disabled}))),image:await surface.screenshot()};};const layout=()=>game.evaluate(()=>({viewport:[innerWidth,innerHeight],stage:document.querySelector('.app-game-layout').dataset.actionPlacement,homes:[...document.querySelectorAll('[data-scene-actions-home]')].map(e=>({connected:e.isConnected,parent:e.parentElement.className,contains:e.contains(document.querySelector('.layout-actions'))})),actionClass:document.querySelector('.layout-actions')?.className,wrapped:document.querySelector('.game-frame-header').className,header:document.querySelector('.game-frame-header').getBoundingClientRect().toJSON(),actions:document.querySelector('.layout-actions')?.parentElement.className,controls:[...document.querySelectorAll('[data-sdk-solitaire-controls]')].map(e=>({parent:e.parentElement.className,box:e.getBoundingClientRect().toJSON()})),stats:[...document.querySelectorAll('.solitaire-stats')].map(e=>({parent:e.parentElement.className,box:e.getBoundingClientRect().toJSON()})),error:parent.document.getElementById('error').textContent}));const before=await capture(),beforeLayout=await layout();
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing);assert.equal(await game.locator('.solitaire-board [data-sdk-target]:not([disabled])').count(),0);await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);await idle(page);const after=await capture();if(JSON.stringify(after.rect)!==JSON.stringify(before.rect)){const fs=require('node:fs'),folder=path.resolve(__dirname,'../../tmp_files/sdk-native-view/history');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'layout.json'),JSON.stringify({before:beforeLayout,after:await layout()},null,2));await page.screenshot({path:path.join(folder,'after.png'),fullPage:true});fs.writeFileSync(path.join(folder,'before.png'),before.image);fs.writeFileSync(path.join(folder,'board-after.png'),after.image);}assert.equal(await game.locator('[data-sdk-solitaire-controls]').count(),1,'history retains one physical action port');assert.deepEqual(after.rect,before.rect);assert.deepEqual(after.ids,before.ids);assert.equal(after.cards,before.cards);await noHiddenCards(page);
 const delta=await page.evaluate(async([a,b])=>{async function decode(value){const image=new Image();image.src='data:image/png;base64,'+value;await image.decode();if(image.width>2048||image.height>2048)throw Error('Unexpected screenshot size');const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};}const [one,two]=await Promise.all([decode(a),decode(b)]);if(one.width!==two.width||one.height!==two.height)return {sameSize:false};let maxChannelDelta=0,differentPixels=0;for(let i=0;i<one.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(one.data[i+c]-two.data[i+c]);maxChannelDelta=Math.max(maxChannelDelta,d);if(d)changed=true;}if(changed)differentPixels++;}return {sameSize:true,maxChannelDelta,differentPixels};},[before.image.toString('base64'),after.image.toString('base64')]);assert.equal(delta.sameSize,true);if(delta.maxChannelDelta>5){const fs=require('node:fs'),folder=path.resolve(__dirname,'../../tmp_files/sdk-native-view/history');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'before.png'),before.image);fs.writeFileSync(path.join(folder,'board-after.png'),after.image);fs.writeFileSync(path.join(folder,'pixels.json'),JSON.stringify({delta,before:before.flags,after:after.flags,layout:{before:beforeLayout,after:await layout()}},null,2));}assert(delta.maxChannelDelta<=5,'Only antialias variation up to five channel units is permitted');t.diagnostic(JSON.stringify(delta));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#motion').uncheck();await foundationSeed(page);await game.evaluate(()=>testSDKHost.renderer.motionPlayer.setRate(.1));await moveToFoundation(page);await game.locator('.playroom-motion-flight').first().waitFor();await page.locator('#motion').check();await noHiddenCards(page);assert.equal(await game.evaluate(()=>testSDKHost.renderer.reducedMotion),true);await idle(page);
 await game.evaluate(()=>{const r=testSDKHost.renderer;window.noMotionBBox=0;window.originalRendererUpdate=r.update;r.update=function(value){const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.matches('.solitaire-board [data-entity]'))window.noMotionBBox++;return original.call(this);};try{return window.originalRendererUpdate.call(this,value);}finally{Element.prototype.getBoundingClientRect=original;}};});
 try{await moveToFoundation(page);await page.waitForFunction(()=>frame.projection.revision===2);assert.equal(await game.locator('.sdk-flight,.playroom-motion-flight').count(),0);assert.equal(await game.evaluate(()=>window.noMotionBBox),0);}finally{await game.evaluate(()=>{testSDKHost.renderer.update=window.originalRendererUpdate;});}assert.deepEqual(errors,[]);
});

test('native SDK routes share stepped movement, departures and historical replay',{timeout:120000},async t=>{
 for(const sample of [{game:'ludo',mode:'exit'},{game:'ludo',mode:'friendly'},{game:'ludo',mode:'capture'},{game:'ludo',mode:'finish'},{game:'snakes',mode:'swap'}])await t.test(sample.game+' '+sample.mode,async t=>{
  const {page,game,errors}=await studio(t,{project:path.join(packs,'packs',sample.game),reducedMotion:'no-preference'});await game.evaluate(()=>testSDKHost.renderer.motionPlayer.setRate(.5));
  await page.evaluate(async({game,mode})=>{await request('start',{options:{...frame.options,rng:17,diceCount:2,preset:game==='snakes'?'plus':'classic'}});const {checkpoint}=await request('checkpoint'),d=checkpoint.position.data;checkpoint.position.turn=0;d.phase='move';if(game==='ludo'){d.dice=mode==='exit'?[6,2]:[2,3];d.used=[false,false];d.pawns[0]=mode==='friendly'?[7,9,-1,-1]:mode==='exit'?[-1,-1,-1,-1]:mode==='capture'?[7,-1,-1,-1]:[55,-1,-1,-1];if(mode==='capture')d.pawns[1]=[48,-1,-1,-1];}else{d.positions=[0,22];d.dice=[3,4];}const result=await request('restore',{checkpoint});if(!result)throw Error(document.querySelector('#error').textContent);},sample);
  const field=game.locator('.layout-field'),before=await field.evaluate(e=>e.getBoundingClientRect().toJSON()),board=game.locator(sample.game==='ludo'?'.sdk-cross-route':'.sdk-numbered-board');
  assert(await board.evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.getBoundingClientRect().height)<1));
  if(sample.game==='ludo'){
   await game.locator('.sdk-cross-pawn[data-entity="token-0-0"]').click();if(sample.mode!=='exit'){assert.equal(await page.evaluate(()=>frame.projection.revision),0);if(sample.mode==='friendly')await game.locator('.layout-actions .sdk-die').first().click();else if(sample.mode==='capture')await game.locator('.sdk-cross-pawn[data-entity="token-1-0"]').click();else await game.locator('.sdk-cross-cell[data-motion-anchor="finish-0"]').click();}
  }else await game.locator('.layout-actions .sdk-die').first().click();
  const flight=game.locator('.playroom-motion-flight[data-motion-kind=route]').first();await flight.waitFor({state:'attached',timeout:5000});assert.equal(await game.locator('.sdk-flight-layer').count(),0,'the canonical route player owns movement');
  const animation=await flight.evaluate(e=>({keyframes:e.getAnimations()[0]?.effect.getKeyframes().length,duration:e.getAnimations()[0]?.effect.getTiming().duration}));assert(animation.keyframes>=2&&animation.duration>0);
  if(['capture','swap'].includes(sample.mode))assert.equal(await game.locator('.playroom-motion-flight[data-motion-kind=move]').count(),1,'the displaced pawn has one return flight');
  await idle(page);assert.equal(await game.locator('.playroom-motion-layer').count(),0);assert.equal(await game.locator('[style*="visibility: hidden"][data-entity]').count(),0);assert.deepEqual(await field.evaluate(e=>e.getBoundingClientRect().toJSON()),before);
  const end=await page.evaluate(()=>frame.scene);if(sample.game==='ludo'){assert.equal(end.pawns.find(p=>p.owner===0&&p.pawn===0).progress,sample.mode==='exit'?0:sample.mode==='finish'?57:9);if(sample.mode==='capture')assert.equal(end.pawns.find(p=>p.owner===1&&p.pawn===0).progress,-1);}else assert.deepEqual(end.positions.map(p=>p.cell),[22,0]);
  await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);
  await page.locator('#history-next').click();await flight.waitFor({state:'attached',timeout:5000});await idle(page);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.deepEqual(await page.evaluate(()=>frame.scene),end,'history renders the same completed route');
  await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);assert.equal(await game.locator('.playroom-motion-layer').count(),0);assert.deepEqual(errors,[]);
 });
});

test('native SDK compound routes play every public checkpoint with the shared application queue',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/snakes'),reducedMotion:'no-preference'});
 await page.evaluate(async()=>{await request('start',{options:{...frame.options,preset:'plus',rng:17}});const {checkpoint}=await request('checkpoint');Object.assign(checkpoint.position.data,{phase:'move',positions:[22,25],dice:[3,4]});if(!await request('restore',{checkpoint}))throw Error(document.querySelector('#error').textContent);});
 await game.evaluate(()=>{window.routeTrace=[];window.fieldTrace=[];const surface=PlayroomMotion.surface;PlayroomMotion.surface=function(...args){const motion=surface(...args),play=motion.play;motion.play=function(snapshot,options){if(snapshot.sequence){const key=PlayroomGameComponents.entityKey(snapshot.sequence.entity);routeTrace.push({origin:snapshot.sequence.origin.anchor,from:snapshot.entities?.get(key)?.rect,anchor:snapshot.anchors?.get(snapshot.sequence.origin.anchor)});}return play.call(this,snapshot,options);};return motion;};const render=testSDKHost.renderFrame;testSDKHost.renderFrame=function(frame){render.call(this,frame);if(this.presenting)fieldTrace.push(this.renderer.sceneData.positions.map(p=>p.cell));};});
 assert.equal(await game.evaluate(()=>Object.getPrototypeOf(testSDKHost.frame.scene)===Object.prototype),true,'the common plan validator receives viewer-owned plain data');
 const field=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());await game.locator('.layout-actions .sdk-die').first().click();await page.waitForFunction(()=>renderer.presenting===true,null,{timeout:7000});
 assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0,'intermediate scenes have no live targets');assert.equal(await game.locator('.table-shell>.scene').getAttribute('aria-busy'),'true');assert.equal(await page.evaluate(()=>renderer.send({type:'roll'})),false,'the command port is gated for the whole queue');
 await page.waitForFunction(()=>!renderer.presenting,null,{timeout:15000}).catch(async error=>{throw Error(JSON.stringify({message:error.message,errors,feedback:await game.evaluate(()=>{const f=testSDKHost.feedback;return {active:f?.active?.id,queue:f?.queue.map(e=>({id:e.id,route:!!e.presentation?.sequence})),field:f?.fieldScene?.positions,animations:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,duration:a.effect.getComputedTiming().duration}))};})}));});
 const trace=await game.evaluate(()=>({routes:routeTrace,fields:fieldTrace}));assert.deepEqual(trace.routes.map(route=>route.origin),['cell-22','cell-25']);assert(trace.routes.every(route=>Math.abs(route.from.x+route.from.width/2-route.anchor.x-route.anchor.width/2)<2&&Math.abs(route.from.y+route.from.height/2-route.anchor.y-route.anchor.height/2)<2),'each leg departs from its own released checkpoint');
 const first=trace.fields.findIndex(p=>p[0]===25),final=trace.fields.findIndex(p=>p[0]===29);assert(first>=0&&final>first,'the first endpoint is shown before the final endpoint');assert.deepEqual(await page.evaluate(()=>frame.scene.positions.map(p=>p.cell)),[29,22]);assert.deepEqual(await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON()),field);
 const position=game.locator('.player-panel[data-player-index="0"] [data-score-id="position"]').first();
 assert.equal((await position.textContent()).trim(),'29','the host counter keeps the committed endpoint after the overlay retires');
 assert.match(await position.getAttribute('aria-label'),/: 29$/);
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);await game.evaluate(()=>{routeTrace=[];});await page.locator('#history-next').click();await page.waitForFunction(()=>renderer.presenting===true,null,{timeout:7000});await page.waitForFunction(()=>!renderer.presenting,null,{timeout:15000});assert.deepEqual(await game.evaluate(()=>routeTrace.map(route=>route.origin)),['cell-22','cell-25']);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.equal(await game.locator('.playroom-motion-layer,.action-reveal').count(),0);assert.deepEqual(errors,[]);
 // Cancellation settles the committed public endpoint and retires all queued
 // event effects, including a second leg that has not started yet.
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);await page.locator('#history-next').click();await game.locator('.playroom-motion-flight[data-motion-kind=route]').first().waitFor();await page.evaluate(()=>renderer.setReducedMotion(true));await page.waitForFunction(()=>!renderer.presenting);
 assert.deepEqual(await game.evaluate(()=>testSDKHost.renderer.sceneData.positions.map(p=>p.cell)),[29,22]);assert.equal(await game.locator('.table-shell>.scene').getAttribute('aria-busy'),'false');assert.equal(await game.locator('.playroom-motion-layer,.action-reveal,[data-entity][style*="visibility: hidden"]').count(),0);assert.equal(await game.evaluate(()=>testSDKHost.feedback.queue.length),0);
 await page.evaluate(()=>renderer.setReducedMotion(false));await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);await page.locator('#history-next').click();await game.locator('.playroom-motion-flight[data-motion-kind=route]').first().waitFor();await page.evaluate(()=>renderer.destroy());assert.equal(await game.locator('.playroom-motion-layer,.action-reveal').count(),0);assert.equal(await game.evaluate(()=>testSDKHost.feedback.queue.length),0);assert.deepEqual(errors,[]);
});

test('native SDK finishes the displayed route before playing a newer live revision',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/snakes'),reducedMotion:'no-preference'});
 await page.evaluate(async()=>{
  await request('start',{options:{...frame.options,preset:'plus',rng:17}});
  const {checkpoint}=await request('checkpoint');
  Object.assign(checkpoint.position.data,{phase:'move',positions:[22,25],dice:[3,4]});
  await request('restore',{checkpoint});
 });
 await game.locator('.layout-actions .sdk-die').first().click();
 await game.locator('.playroom-motion-flight[data-motion-kind=route]').first().waitFor();
 await game.evaluate(()=>{
  const host=testSDKHost;
  host.feedback.player.pause();
  window.playedRevisions=[];
  const present=host.presentEvents;
  host.presentEvents=function(previous,next,events){playedRevisions.push([previous.projection.revision,next.projection.revision]);return present.call(this,previous,next,events);};
 });
 await page.evaluate(async()=>{
  const response=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':document.querySelector('meta[name="sdk-token"]').content},body:JSON.stringify({op:'apply',client:'other-view',viewer:frame.projection.turn,command:{type:'roll'}})});
  if(!response.ok)throw Error(JSON.stringify(await response.json()));
 });
 await page.waitForFunction(()=>frame.projection.revision===2);
 assert.deepEqual(await game.evaluate(()=>[testSDKHost.frame.projection.revision,playedRevisions]),[1,[]]);
 // A refresh of revision 2 arrives without a motion descriptor. It must
 // retain the queued transition selected when revision 2 first arrived.
 await page.evaluate(()=>request('view'));
 await game.evaluate(()=>testSDKHost.feedback.player.resume());
 await idle(page);
 assert.deepEqual(await game.evaluate(()=>[testSDKHost.frame.projection.revision,playedRevisions]),[2,[[1,2]]]);
 assert.equal(await game.locator('.playroom-motion-layer').count(),0);
 assert.deepEqual(errors,[]);
});

test('native SDK keeps the elemental public plan across a live update and replays it in history',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/mage-brawl'),reducedMotion:'no-preference'});
 await page.evaluate(async()=>{
  await request('start',{options:{...frame.options,rng:17,options:{...frame.options.options,actionsPerTurn:1}}});
  window.commitArenaPlan=async viewer=>{
   const send=async(payload)=>{
    const response=await fetch('/api',{method:'POST',headers:{'content-type':'application/json','x-playroom-sdk':document.querySelector('meta[name="sdk-token"]').content},body:JSON.stringify({viewer,client:'arena-peer',...payload})});
    const value=await response.json();if(!response.ok)throw Error(JSON.stringify(value));return value;
   };
   const {projection}=await send({op:'view'});
   const command=projection.actions.find(value=>value.type==='plan'&&value.action==='attack');
   if(!command)throw Error('Expected an authorized arena plan');
   await send({op:'apply',command});
  };
 });
 await game.evaluate(()=>{
  window.publicSounds=[];
  testSDKHost.playAudio=testSDKHost.renderer.playAudio=(ids,_pack,context)=>{
   const {publicFrameIndex}=testSDKHost.renderer;
   publicSounds.push(...ids.map(id=>({id,index:publicFrameIndex,cancellable:!!context.signal})));
  };
 });
 await page.evaluate(async()=>{await commitArenaPlan(0);await commitArenaPlan(1);});
 await page.waitForFunction(()=>renderer.renderer.publicState&&renderer.frame.projection.revision===2);
 const expected=await game.evaluate(()=>{
  const renderer=testSDKHost.renderer;
  renderer.motionPlayer.pause();
  return renderer.sceneData.plan.groups.flatMap(group=>group.cues.filter(cue=>cue.kind==='sound').flatMap(cue=>cue.sounds.map(id=>({id,index:group.scene,cancellable:true}))));
 });
 assert(expected.length>1);
 await page.evaluate(()=>commitArenaPlan(0));
 await page.waitForFunction(()=>frame.projection.revision===3);
 assert.equal(await game.evaluate(()=>testSDKHost.frame.projection.revision),2,'the later live frame waits for the active public plan');
 assert.equal(await game.locator('.table-shell>.scene').getAttribute('aria-busy'),'true');
 await game.evaluate(()=>testSDKHost.renderer.motionPlayer.resume());
 await idle(page);
 assert.equal(await game.evaluate(()=>testSDKHost.frame.projection.revision),3);
 assert.deepEqual(await game.evaluate(()=>publicSounds),expected);
 await page.evaluate(()=>request('seek',{index:1}));
 assert.deepEqual(await game.evaluate(()=>publicSounds),expected,'backward navigation stays silent');
 await page.locator('#history-next').click();
 await page.waitForFunction(()=>frame.projection.revision===2);
 await idle(page);
 assert.deepEqual(await game.evaluate(()=>publicSounds),[...expected,...expected]);
 assert.deepEqual(errors,[]);
});

test('native SDK spoken transfers reveal and collect the same authorized cards in history',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/gofish'),reducedMotion:'no-preference'});
 const command=await page.evaluate(async()=>{await request('start',{options:{...frame.options,rng:17}});const {checkpoint}=await request('checkpoint'),d=checkpoint.position.data,cards=[...d.hands.flat(),...d.drawPile],set=cards.filter(c=>c.rank===7),extra=cards.find(c=>c.rank!==7);if(set.length!==4)throw Error('Fixture requires a complete rank');d.hands=[set.slice(0,3),[set[3],extra]];const held=new Set(d.hands.flat().map(c=>c.id));d.drawPile=cards.filter(c=>!held.has(c.id));d.books=[[],[]];d.bookCards=[[],[]];d.attempts=[0,0];if(!await request('restore',{checkpoint}))throw Error(document.querySelector('#error').textContent);return frame.projection.actions.find(a=>a.cardId===set[0].id&&a.target===1);});assert(command);
 const geometry=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());await page.evaluate(command=>request('apply',{command}),command);await game.locator('.game-feedback-layer [data-feedback-event]').first().waitFor();assert.match(await game.locator('.game-feedback-layer').textContent(),/7/);assert.match(await game.locator('.game-feedback-layer [data-feedback-event]').getAttribute('aria-label'),/Игрок 1/,'public actor names use the installed adapter convention');assert.equal(await game.evaluate(()=>typeof testSDKHost.feedback.active.speech.text),'string','message references are localized before shared speech rendering');
 await game.locator('.action-reveal-art.is-card-set').waitFor();assert.equal(await game.locator('.action-reveal-art.is-card-set .shared-card').count(),4,'all four public cards use the common reveal renderer');await idle(page);assert.equal(await game.locator('.sdk-collection-cards .mini-card').count(),1);assert.equal(await game.locator('.layout-hand [data-entity]').count(),0);assert.deepEqual(await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON()),geometry);assert.equal(await game.locator('.action-reveal,.game-feedback-layer [data-feedback-event],.playroom-motion-layer,.playroom-request-layer').count(),0);
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);assert.equal(await game.locator('.layout-hand [data-entity]').count(),3);await page.locator('#history-next').click();await game.locator('.action-reveal-art.is-card-set').waitFor();assert.equal(await game.locator('.action-reveal-art.is-card-set .shared-card').count(),4);await idle(page);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.equal(await game.locator('.sdk-collection-cards .mini-card').count(),1);assert.deepEqual(errors,[]);
});

test('native SDK domino reveals an upright tile before the same folded placement in history',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/domino'),reducedMotion:'no-preference'});
 await page.evaluate(()=>request('start',{options:{...frame.options,rng:17,firstPlayer:0,firstPlayerMode:'assigned'}}));
 const command=await page.evaluate(async()=>{
  if(frame.projection.viewer!==frame.projection.turn)await request('view',{viewer:frame.projection.turn});
  return frame.projection.actions.find(c=>c.type==='play'&&c.card[1]!==c.card[2]);
 });assert(command,'the fixed deal has a non-double opening');
 const reveal=game.locator('.action-reveal-art .domino-print');
 const destination=game.locator('.sdk-chain-flow [data-entity="tile-'+command.card+'"]');
 const checkReveal=async()=>{
  await reveal.waitFor();
  assert.equal(await reveal.getAttribute('viewBox'),'0 0 48 84');
  const box=await reveal.boundingBox();assert(Math.abs(box.width/box.height-4/7)<.01,JSON.stringify(box));
  assert.equal(await destination.getAttribute('data-reveal-active'),'');
 };
 await game.locator('.layout-hand [data-entity="tile-'+command.card+'"]').click();
 await game.locator('.sdk-chain-opening .sdk-chain-drop:not([disabled])').click();
 await checkReveal();await motionEvidence(page,'domino-public-reveal');await idle(page);
 assert.equal(await destination.locator('svg.domino-print').getAttribute('viewBox'),'0 0 84 48');
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);
 assert.equal(await destination.count(),0);
 await page.locator('#history-next').click();await checkReveal();await idle(page);
 assert.equal(await destination.locator('svg.domino-print').getAttribute('viewBox'),'0 0 84 48');
 assert.equal(await game.locator('[data-sdk-target]:not([disabled]),.action-reveal,.playroom-motion-layer,[data-reveal-active]').count(),0);
 assert.deepEqual(errors,[]);
});

test('native SDK memory flips, closes and matches through the application queue without reflow',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/pexeso'),reducedMotion:'no-preference'});
 const indices=await page.evaluate(async()=>{await request('start',{options:{...frame.options,preset:'medium',deck:52,rng:17}});const {checkpoint}=await request('checkpoint'),board=checkpoint.position.data.board,key=c=>c.character||c.rank+'-'+(['♥','♦'].includes(c.suit)?'red':'black');return {mate:board.findIndex((c,i)=>i>0&&key(c)===key(board[0])),other:board.findIndex(c=>key(c)!==key(board[0]))};});assert(indices.mate>0&&indices.other>0);
 await page.locator('#scene').scrollIntoViewIfNeeded();const geometry=()=>game.locator('.sdk-memory-slot').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON())),before=await geometry();const field=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());assert(before.every(r=>r.left>=field.left&&r.right<=field.right&&r.top>=field.top&&r.bottom<=field.bottom),'a new party fits every card inside the current viewport');await game.evaluate(()=>window.retainedSlots=[...document.querySelectorAll('.sdk-memory-slot')]);
 await game.locator('.sdk-memory-slot[data-motion-value="0"] button').click();await game.locator('.playroom-motion-flight[data-motion-kind=flip]').first().waitFor();await idle(page);assert.equal(await game.locator('.sdk-paired-memory .sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),1);
 await game.locator('.sdk-memory-slot[data-motion-value="'+indices.other+'"] button').click();await game.locator('.sdk-memory-slot[data-motion-close]').first().waitFor();assert.equal(await game.locator('.sdk-paired-memory .sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),2,'both unmatched faces remain public until closing completes');await idle(page);assert.equal(await game.locator('.sdk-paired-memory .sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),0);assert.deepEqual(await geometry(),before);
 await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>frame.projection.viewer===1);await game.locator('.sdk-memory-slot[data-motion-value="0"] button').click();await idle(page);await game.locator('.sdk-memory-slot[data-motion-value="'+indices.mate+'"] button').click();await idle(page);assert.equal(await page.evaluate(()=>frame.scene.cards.filter(c=>c.matched).length),2);assert(await game.evaluate(()=>retainedSlots.every((node,i)=>node===document.querySelectorAll('.sdk-memory-slot')[i])),'the same physical slots survive the whole exchange');assert.deepEqual(await geometry(),before);
 await page.evaluate(()=>request('seek',{index:0}));await page.locator('#history-next').click();await game.locator('.playroom-motion-flight[data-motion-kind=flip]').first().waitFor();await idle(page);assert.equal(await game.locator('.sdk-paired-memory .sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),1);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.deepEqual(errors,[]);
});

test('native SDK category dice share roll fallback sound and the public score reveal',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/dice-poker'),reducedMotion:'no-preference'});await page.locator('label:has(#mute)').click();await page.waitForFunction(()=>audio._context?.state==='running');await page.evaluate(()=>{window.categorySounds=[];const batch=audio.batch.bind(audio);audio.batch=(ids,options)=>{categorySounds.push(...ids);return batch(ids,options);};});
 const field=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());await game.locator('.sdk-score-roll').click();await game.locator('.playroom-motion-flight[data-motion-kind=roll]').first().waitFor();assert.equal(await game.locator('.playroom-motion-flight[data-motion-kind=roll]').count(),5);await idle(page);assert.deepEqual(await page.evaluate(()=>categorySounds),['dice'],'the SDK uses the same canonical roll fallback as local/network play');
 const cell=game.locator('[data-score-row=chance] button'),dialog=game.locator('#modal-root .modal:has([data-command=confirm-action])');
 const open=async()=>{await cell.click();await dialog.waitFor({timeout:3000});assert.match(await dialog.locator('.modal-head h2').textContent(),/Шанс/);};
 await open();assert.equal(await page.evaluate(()=>frame.projection.revision),1);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>frame.projection.revision),1);
 await open();await page.evaluate(()=>request('apply',{command:{type:'hold',index:0}}));await dialog.waitFor({state:'hidden'});await idle(page);
 const revision=await page.evaluate(()=>frame.projection.revision);assert.equal(revision,2);assert.equal(await game.locator('.sdk-score-dice .sdk-die').first().getAttribute('aria-pressed'),'true');
 const imageFaces=await page.evaluate(()=>!!frame.scene.dice[0].face);
 if(imageFaces)assert.equal(await game.locator('.sdk-score-dice .sdk-die image').count(),5);
 await open();
 if(process.env.PLAYROOM_SDK_MOTION_EVIDENCE){
  await dialog.evaluate(async element=>{const entry=[...element.getAnimations(),...element.parentElement.getAnimations()];await Promise.allSettled(entry.map(animation=>animation.finished));});
  await motionEvidence(page,'yatzy-score-confirmation');
 }
 await dialog.locator('[data-command=confirm-action]').click();
 const revealed=game.locator('.action-reveal-die');
 const checkReveal=async()=>{
  await revealed.first().waitFor();assert.equal(await revealed.count(),5);
  if(imageFaces){
   assert.equal(await revealed.locator('image').count(),5);
   assert.match(await game.locator('.action-reveal').getAttribute('aria-label'),/Синий ромб/);
   const widths=await revealed.locator('image').evaluateAll(nodes=>Promise.all(nodes.map(async node=>{
    const image=new Image();
    image.src=node.getAttribute('href');
    await image.decode();
    return image.naturalWidth;
   })));
   assert(widths.every(width=>width>0));
  }
 };
 await checkReveal();const title=await game.locator('.action-reveal-title').textContent();assert(title.length>0&&!title.includes('[object Object]'));await idle(page);assert.equal((await page.evaluate(()=>categorySounds)).at(-1),'success');assert.deepEqual(await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON()),field);
 await page.locator('#history-prev').click();await page.waitForFunction(revision=>frame.projection.revision===revision,revision);await page.locator('#history-next').click();await checkReveal();await idle(page);assert.equal(await dialog.count(),0);assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);assert.deepEqual(errors,[]);
});

test('native SDK result uses the shared ranking and sounds once before read-only replay',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/tictactoe'),reducedMotion:'no-preference'});
 await page.locator('label:has(#mute)').click();await page.waitForFunction(()=>audio._context?.state==='running');
 await page.evaluate(()=>{
  window.terminalAudio=[];const batch=audio.batch.bind(audio);
  audio.batch=(ids,options)=>{
   if(ids.some(id=>['victory','defeat','draw-game'].includes(id)))terminalAudio.push({ids,visible:!!renderer.modalRoot.querySelector('.result-modal'),presenting:renderer.presenting});
   return batch(ids,options);
  };
 });
 for(const [index,cell] of [0,3,1,4,2].entries()){
  await page.locator('#viewer').selectOption(String(index%2));
  await page.waitForFunction(viewer=>frame.projection.viewer===viewer,index%2);
  const committed=await page.evaluate(cell=>request('apply',{command:frame.projection.actions.find(action=>action.cell===cell)}).then(Boolean),cell);
  assert.equal(committed,true);await idle(page);
 }
 const result=game.locator('.result-modal');await result.waitFor();
 assert.match(await result.locator('.result-v021-summary h3').textContent(),/Победа/);
 assert.deepEqual(await result.locator('[data-result-player]').evaluateAll(rows=>rows.map(row=>Number(row.dataset.resultPlayer))),[0,1]);
 assert.deepEqual(await page.evaluate(()=>({places:frame.result.places,metrics:frame.result.metrics.map(metric=>[metric.id,metric.values]),private:Object.hasOwn(frame,'position')})),{places:[1,2],metrics:[['wins',[1,0]]],private:false});
 await page.waitForFunction(()=>terminalAudio.length===1);
 assert.deepEqual(await page.evaluate(()=>terminalAudio),[{ids:['victory'],visible:true,presenting:false}]);
 for(const viewport of [{width:1440,height:1000},{width:844,height:435},{width:390,height:920}]){
  await page.setViewportSize(viewport);
  const layout=await result.evaluate(async modal=>{
   const entryAnimations=[...modal.getAnimations(),...modal.parentElement.getAnimations()];
   await Promise.allSettled(entryAnimations.map(animation=>animation.finished));
   const r=modal.getBoundingClientRect(),footer=modal.querySelector('[data-fixed-footer]').getBoundingClientRect();
   return {x:r.x,y:r.y,width:r.width,height:r.height,innerWidth,innerHeight,footerBottom:footer.bottom};
  });
  assert(layout.width<=672&&Math.abs(layout.x+layout.width/2-layout.innerWidth/2)<1,JSON.stringify(layout));
  if(viewport.width>=1440)assert(layout.height<layout.innerHeight-200&&Math.abs(layout.y+layout.height/2-layout.innerHeight/2)<1,JSON.stringify(layout));
  assert(layout.footerBottom<=layout.innerHeight+1,JSON.stringify(layout));
  if(viewport.width===1440)await motionEvidence(page,'result-tictactoe-compact');
 }
 await result.locator('[data-command=result-replay]').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.history.index===0);
 assert.equal(await result.count(),0);assert.equal(await game.locator('.sdk-board-grid button:not([disabled])').count(),0);
 await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);
 await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>frame.projection.viewer===1);
 await game.locator('[data-game-menu]').click();await game.locator('[data-game-menu-action][data-command=result]').click();await result.waitFor();
 assert.match(await result.locator('.result-v021-summary h3').textContent(),/Поражение/);
 assert.equal(await page.evaluate(()=>terminalAudio.length),1,'reopening or reviewing never replays terminal audio');
 const previousParty=await page.evaluate(()=>frame.sessionId);
 await result.locator('[data-command=rematch-start]').click();await page.waitForFunction(id=>frame.sessionId!==id,previousParty);
 assert.equal(await result.count(),0);assert.equal(await page.evaluate(()=>frame.result),undefined);
 assert.equal(await page.evaluate(()=>frame.projection.revision),0);
 assert.deepEqual(errors,[]);
});

test('native SDK audio shares event groups, mute and navigation cancellation',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/snakes'),reducedMotion:'no-preference'});
 await page.evaluate(async()=>{await request('start',{options:{...frame.options,preset:'plus',rng:17}});const {checkpoint}=await request('checkpoint');Object.assign(checkpoint.position.data,{phase:'move',positions:[22,25],dice:[3,4]});await request('restore',{checkpoint});window.audioTrace=[];const batch=audio.batch.bind(audio);audio.batch=(ids,options)=>{audioTrace.push({ids:ids.slice(),eventId:renderer.feedback?.active?.id,positions:renderer.renderer.sceneData.positions.map(p=>p.cell),signal:options.signal});return batch(ids,options);};});
 assert.equal(await page.evaluate(()=>audio._context),null,'muted startup creates no audio context');await page.locator('label:has(#mute)').click();await page.waitForFunction(()=>audio._context?.state==='running');
 const moved=await page.evaluate(async()=>{const result=await request('apply',{command:{type:'move',dieIndex:0,delta:0}});return {ok:!!result.projection,presenting:renderer.presenting,cues:frame.events.filter(e=>e.sound&&!e.finish).map(e=>({id:e.sound.id,eventId:e.id}))};});assert(moved.ok&&moved.presenting,'HTTP completion does not wait for presentation or block navigation');
 await page.waitForFunction(()=>!renderer.presenting);const trace=await page.evaluate(()=>audioTrace.map(e=>({id:e.ids[0],eventId:e.eventId,positions:e.positions})));assert.deepEqual(trace.map(({id,eventId})=>({id,eventId})),moved.cues,'each public cue starts in its own shared event group');assert.deepEqual(trace[0].positions,[22,25]);assert.deepEqual(trace.at(-1).positions,[25,22]);assert.equal(await page.evaluate(()=>audio._groups.size),0);
 await page.evaluate(()=>renderer.update(frame));assert.equal(await page.evaluate(()=>audioTrace.length),trace.length,'a duplicate view does not repeat sound');
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);await page.locator('#history-next').click();await page.waitForFunction(()=>renderer.presenting);await page.waitForFunction(()=>!renderer.presenting);assert.deepEqual(await page.evaluate(()=>audioTrace.slice(-3).map(e=>({id:e.ids[0],eventId:e.eventId}))),moved.cues,'forward history uses the same sound cues');
 await page.locator('label:has(#mute)').click();const silentCount=await page.evaluate(()=>audioTrace.length);await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);await page.locator('#history-next').click();await page.waitForFunction(()=>renderer.presenting);await page.waitForFunction(()=>!renderer.presenting);assert.equal(await page.evaluate(()=>audioTrace.length),silentCount,'muted history never invokes the audio batch');
 await page.locator('label:has(#mute)').click();await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.projection.revision===0);await page.locator('#history-next').click();await page.waitForFunction(()=>audio._groups.size>0);const canceled=await page.evaluate(async()=>{const signal=audioTrace.at(-1).signal;await request('seek',{index:0});return {aborted:signal.aborted,voices:audio._groups.size,queued:renderer.feedback.queue.length,playing:renderer.presenting,revision:frame.projection.revision};});assert.deepEqual(canceled,{aborted:true,voices:0,queued:0,playing:false,revision:0});assert.equal(await game.locator('.action-reveal,.playroom-motion-layer').count(),0);assert.deepEqual(errors,[]);
 const uno=await studio(t,{project:path.join(packs,'packs/uno')});assert(await uno.page.evaluate(()=>audio._packs.get('uno')?.has('uno.call')),'pack-owned offline speech is registered');await uno.page.locator('label:has(#mute)').click();await uno.page.waitForFunction(()=>audio._context?.state==='running');assert.equal(await uno.page.evaluate(()=>audio.batch(['uno.call'],{pack:'uno'})),true,'the real browser decodes and finishes the pack sample');assert.equal(await uno.page.evaluate(()=>audio._groups.size),0);assert.deepEqual(uno.errors,[]);
 const sea=await studio(t,{project:path.join(packs,'packs/fleet-grid')});assert.equal(await sea.page.evaluate(()=>frame.metadata.sounds['sea.hit'].src.kind),'asset','guest sound references remain declarative');await sea.page.locator('label:has(#mute)').click();await sea.page.waitForFunction(()=>audio._context?.state==='running');assert.equal(await sea.page.evaluate(()=>audio.batch(['sea.hit'],{pack:'fleet-grid'})),true,'a declared sample resource is resolved and decoded by the same audio engine');
 const denied=await sea.page.evaluate(()=>{const original=renderer.frame.pack.hash,bad=structuredClone(frame);bad.pack.hash+='-missing-sample';bad.metadata.sounds={'test.missing':{label:'Missing sample',src:{kind:'asset',id:'domain/game.js'}}};try{renderer.update(bad);return null;}catch(error){return {code:error.code,preserved:renderer.frame.pack.hash===original};}});assert.deepEqual(denied,{code:'SDK_SOUND_ASSET_INVALID',preserved:true});assert.deepEqual(sea.errors,[]);
});

test('native SDK rolls animate unchanged board poses with the application tempo and cancel cleanly',{timeout:45000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/ludo'),reducedMotion:'no-preference'});
 await page.evaluate(()=>request('start',{options:{...frame.options,diceCount:2,rng:17}}));await game.evaluate(()=>testSDKHost.renderer.motionPlayer.setRate(.5));
 const before=await page.evaluate(()=>frame.scene.pawns.map(({id,progress,point,anchor})=>({id,progress,point,anchor}))),field=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());
 await game.locator('.layout-actions .sdk-die').first().click();const rolls=game.locator('.playroom-motion-flight[data-motion-kind=roll]');await rolls.first().waitFor();assert.equal(await rolls.count(),2);assert.equal(await game.locator('.sdk-flight-layer').count(),0);
 assert.equal(await rolls.first().evaluate(e=>e.getAnimations()[0].effect.getTiming().duration),await game.evaluate(()=>PlayroomGameFlow.timing().duration),'the SDK uses the application normal tempo');await idle(page);assert.equal(await page.evaluate(()=>frame.projection.turn),1,'a roll with no legal exit has already passed authority to the next player');assert.deepEqual(await page.evaluate(()=>frame.scene.pawns.map(({id,progress,point,anchor})=>({id,progress,point,anchor}))),before,'rolling changes no pawn pose');assert.deepEqual(await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON()),field);
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);await page.locator('#history-next').click();await rolls.first().waitFor();assert.equal(await rolls.count(),2,'forward history replays the same dice leads');assert.equal(await game.locator('[data-sdk-target]:not([disabled])').count(),0);
 await page.evaluate(()=>renderer.setReducedMotion(true));await idle(page);assert.equal(await game.locator('.playroom-motion-layer').count(),0);assert(await game.locator('.sdk-die').evaluateAll(nodes=>nodes.every(e=>e.style.visibility==='')),'cancellation restores every physical die');assert.deepEqual(errors,[]);
});

test('native SDK Spider keeps hints, ten-card deals, completed runs and undo in the shared scene',{timeout:90000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/spider'),reducedMotion:'no-preference'});
 await game.evaluate(()=>testSDKHost.renderer.motionPlayer.setRate(.5));
 const field=await game.locator('.layout-field').boundingBox();
 await game.locator('.solitaire-control[data-view-key=hint]').click();await game.locator('.solitaire-hint-popup').waitFor();
 assert.deepEqual(await game.locator('.layout-field').boundingBox(),field,'a hint overlays the unchanged field');
 const initial=await page.evaluate(()=>frame.scene.tableau.flat().filter(c=>!c.hidden).map(c=>c.id).sort());
 await game.evaluate(()=>{const card=document.querySelector('.solitaire-columns [data-entity]');window.retainedSpiderCard={node:card,art:card.querySelector('svg')};});
 await game.locator('.solitaire-draw-control').click();await game.locator('.playroom-motion-flight[data-motion-kind=reveal]').first().waitFor();
 const deal=await game.locator('.playroom-motion-flight[data-motion-kind=reveal]').evaluateAll(nodes=>nodes.map(e=>({delay:e.getAnimations()[0].effect.getTiming().delay,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 assert.equal(deal.length,10,'one stock card arrives at each native column');assert(deal.every((d,i)=>d.width>0&&d.height>d.width&&(!i||d.delay>deal[i-1].delay)),'stock arrivals retain card shape and stagger');
 await idle(page);assert.equal(await page.evaluate(()=>frame.scene.stockCount),40);assert.deepEqual(await game.locator('.layout-field').boundingBox(),field);
 assert(await game.evaluate(()=>retainedSpiderCard.node.isConnected&&retainedSpiderCard.art===retainedSpiderCard.node.querySelector('svg')),'unchanged tableau artwork survives a deal');
 await game.locator('.solitaire-control[data-action*="undo"]').click();await page.waitForFunction(()=>frame.projection.revision===2);await idle(page);
 assert.equal(await page.evaluate(()=>frame.scene.stockCount),50);assert.deepEqual(await page.evaluate(()=>frame.scene.tableau.flat().filter(c=>!c.hidden).map(c=>c.id).sort()),initial);
 // A full legal run is authored through checkpoint restore, never injected
 // into the renderer. The ordinary rules still decide completion and undo.
 await page.evaluate(async()=>{await request('start',{options:{...frame.options,rng:7}});const {checkpoint}=await request('checkpoint'),d=checkpoint.position.data,cards=[...d.tableau.flat(),...d.stock],suit=cards[0].suit,take=rank=>{const index=cards.findIndex(c=>c.rank===rank&&c.suit===suit);if(index<0)throw Error('Missing Spider fixture rank');return {...cards.splice(index,1)[0],open:true};};d.tableau=[Array.from({length:12},(_,i)=>take(13-i)),[take(14)],...Array.from({length:8},()=>[])];d.stock=cards.splice(-50).map(c=>({...c,open:false}));cards.forEach((c,i)=>d.tableau[2+i%8].push({...c,open:false}));for(const col of d.tableau.slice(2))col.at(-1).open=true;const result=await request('restore',{checkpoint});if(!result)throw Error(document.querySelector('#error').textContent);});
 const finish=await page.evaluate(()=>frame.projection.actions.find(a=>a.type==='move'&&a.from===1&&a.to===0));assert(finish);
 await game.locator('[data-entity="card-'+finish.card+'"]').click();await game.locator('.solitaire-column[data-column="0"] [data-action]').last().click();await page.waitForFunction(()=>frame.projection.revision===1);await idle(page);
 assert.equal(await page.evaluate(()=>frame.scene.completed.length),1);assert.equal(await page.evaluate(()=>frame.scene.completed[0].length),13);assert.match(await game.locator('.solitaire-series').innerText(),/1[\s\S]*\/8/);
 assert.equal(await game.locator('.solitaire-draw-control').isDisabled(),true,'an empty column blocks stock dealing');assert.equal(await game.locator('.playroom-motion-layer').count(),0);
 const completedIDs=await page.evaluate(()=>frame.scene.completed[0].map(c=>'card-'+c.id));assert.equal(await game.locator('.solitaire-columns [data-entity]').evaluateAll((nodes,ids)=>nodes.filter(n=>ids.includes(n.dataset.entity)).length,completedIDs),0,'a completed run leaves no stale interactive card nodes');
 await page.locator('#history-prev').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===0);assert.equal(await page.evaluate(()=>frame.scene.completed.length),0);assert.equal(await game.locator('.solitaire-board [data-sdk-target]:not([disabled])').count(),0);
 await page.locator('#history-next').click();await page.waitForFunction(()=>frame.history.reviewing&&frame.projection.revision===1);await idle(page);assert.equal(await page.evaluate(()=>frame.scene.completed.length),1);
 await page.locator('#history-live').click();await page.waitForFunction(()=>!frame.history.reviewing);await game.locator('.solitaire-control[data-action*="undo"]').click();await page.waitForFunction(()=>frame.projection.revision===2);await idle(page);
 assert.equal(await page.evaluate(()=>frame.scene.completed.length),0);assert.equal(await page.evaluate(()=>frame.scene.tableau[0].length),12);assert.equal(await page.evaluate(()=>frame.scene.tableau[1].length),1);assert.equal(await game.locator('.playroom-motion-layer').count(),0);assert.deepEqual(errors,[]);
});

test('native SDK help uses the shared illustrated memo and retires its modal with the viewer',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:path.join(packs,'packs/mage-brawl')});
 const button=game.locator('[data-command=card-help]'),field=await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON());
 await button.click();await game.locator('.game-memo-modal .mage-memo-table').waitFor();
 assert.equal(await game.locator('.game-memo-modal .mage-memo-table tbody tr').count(),4);assert(await game.locator('.game-memo-modal .mage-memo-table svg').count()>4,'the canonical illustrated memo is retained');
 assert.equal(await game.locator('#app').evaluate(e=>e.inert),true);assert(await game.locator('.game-memo-modal').getAttribute('aria-labelledby'));
 // Optional visual evidence uses the frozen application, not another SDK
 // renderer. The memo is static public rules, so both viewports see the same art.
 if(process.env.PLAYROOM_SDK_HELP_EVIDENCE){
  const fs=require('node:fs'),folder=process.env.PLAYROOM_SDK_HELP_EVIDENCE;fs.mkdirSync(folder,{recursive:true});await page.locator('#scene').scrollIntoViewIfNeeded();await game.locator('.game-memo-modal').screenshot({path:path.join(folder,'sdk-memo.png'),animations:'disabled'});
  if(process.env.PLAYROOM_021_REFERENCE_HTML){
   const viewport=await game.evaluate(()=>({width:innerWidth,height:innerHeight})),context=await page.context().browser().newContext({viewport,reducedMotion:'reduce'});t.after(()=>context.close());const reference=await context.newPage();await reference.route('https://**',route=>route.abort());await reference.goto(require('node:url').pathToFileURL(process.env.PLAYROOM_021_REFERENCE_HTML).href);
   await reference.waitForFunction(()=>!!globalThis.PlayroomAppBridge&&document.querySelectorAll('[data-start]').length===15);if(await reference.getByRole('button',{name:'Играть без облака',exact:true}).isVisible()){const nickname=reference.getByRole('textbox',{name:'Никнейм',exact:true});if(await nickname.isVisible())await nickname.fill('Игрок 1');await reference.getByRole('button',{name:'Играть без облака',exact:true}).click();}await reference.evaluate(()=>{PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:1,firstPlayer:0,firstPlayerMode:'assigned'});});await reference.locator('[data-start=mage-brawl]').first().click({timeout:3000});await reference.locator('[data-game-mode=hotseat]').click();await reference.locator('[data-command=lobby-start]').click();await reference.locator('.mage-grid').waitFor();if(await reference.locator('.handoff [data-command=unlock]').isVisible())await reference.locator('.handoff [data-command=unlock]').click();await reference.locator('[data-command=card-help]').click();await reference.locator('.game-memo-modal .mage-memo-table').waitFor();
   // Compare the painted SVG view boxes; table cell widths change with the panel cap.
   const geometry=surface=>surface.locator('.game-memo-modal').evaluate(e=>({width:e.getBoundingClientRect().width,table:e.querySelector('.mage-memo-table').getBoundingClientRect().width,rows:e.querySelectorAll('tbody tr').length,modal:e.getBoundingClientRect().toJSON(),body:e.querySelector('.modal-body')?.getBoundingClientRect().toJSON(),scroll:{top:e.querySelector('.modal-body')?.scrollTop,height:e.querySelector('.modal-body')?.scrollHeight,client:e.querySelector('.modal-body')?.clientHeight},rowBounds:[...e.querySelectorAll('tbody tr')].map(n=>({rect:n.getBoundingClientRect().toJSON(),opacity:getComputedStyle(n).opacity,visibility:getComputedStyle(n).visibility,hit:n.contains(n.ownerDocument.elementFromPoint(n.getBoundingClientRect().x+n.getBoundingClientRect().width/2,n.getBoundingClientRect().y+n.getBoundingClientRect().height/2))})),art:[...e.querySelectorAll('.mage-action-diagram')].map(n=>{const box=n.viewBox.baseVal,scale=n.getScreenCTM();return {width:box.width*Math.hypot(scale.a,scale.b),height:box.height*Math.hypot(scale.c,scale.d)};})}));const sdk=await geometry(game),old=await geometry(reference);await reference.locator('.game-memo-modal').screenshot({path:path.join(folder,'reference-memo.png'),animations:'disabled'});fs.writeFileSync(path.join(folder,'geometry.json'),JSON.stringify({viewport,sdk,reference:old},null,2));assert.equal(sdk.rows,old.rows);assert.equal(sdk.art.length,12);assert.equal(sdk.art.length,old.art.length);assert(sdk.rowBounds.every(row=>row.hit&&row.rect.top>=sdk.body.top-1&&row.rect.bottom<=sdk.body.bottom+1),'every memo row is visible and reachable inside its scrollport');assert(sdk.width<=old.width+1);assert(Math.abs((sdk.width-sdk.table)-(old.width-old.table))<1,'the memo preserves the 0.21 table insets inside the capped panel');assert(sdk.art.every((art,i)=>Math.abs(art.width-old.art[i].width)<1&&Math.abs(art.height-old.art[i].height)<1),'memo diagrams retain their 0.21 physical dimensions');await context.close();
  }
 }
 await game.locator('.game-memo-modal .modal-head [data-command=close-modal]').click();assert.equal(await game.locator('#modal-root .modal').count(),0);assert.equal(await game.locator('#app').evaluate(e=>e.inert),false);assert.equal(await button.evaluate(e=>e===document.activeElement),true);
 await button.click();await game.locator('.game-memo-modal').waitFor();await page.keyboard.press('Escape');assert.equal(await game.locator('#modal-root .modal').count(),0);
 await button.click();await page.locator('#viewer').selectOption('1');await page.waitForFunction(()=>frame.projection.viewer===1);assert.equal(await game.locator('#modal-root .modal').count(),0,'a viewer change cannot retain the previous authorized help surface');assert.equal(await game.locator('#app').evaluate(e=>e.inert),false);assert.deepEqual(await game.locator('.layout-field').evaluate(e=>e.getBoundingClientRect().toJSON()),field);
 await game.locator('[data-command=card-help]').click();await game.locator('.game-memo-modal').waitFor();await page.evaluate(()=>{renderer.destroy();renderer.openHelp();});assert.equal(await game.locator('#modal-root .modal').count(),0);assert.equal(await game.locator('#app').evaluate(e=>e.inert),false);assert.deepEqual(errors,[]);
});

test('SDK graphic records reject URL requests, stale asset scopes and excessive geometry',{timeout:60000},async t=>{
 const {page,game,errors}=await studio(t,{project:fixture(t,{render:"return {contractVersion:1,id:'scroll-fixture',family:'card-table',stockCount:0,players:[{player:0,metrics:[],hand:Array.from({length:40},(_,i)=>({id:'card-'+i,rank:2+i%13,suit:'♠'}))},{player:1,metrics:[]}]};"}),hasTouch:true}),forbidden=[];
 await page.setViewportSize({width:390,height:844});const hand=game.locator('.layout-hand .hand-track').first();await hand.scrollIntoViewIfNeeded();const handBox=await hand.boundingBox(),touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:handBox.x+handBox.width*.8,y:handBox.y+handBox.height*.5,id:1}]});for(let step=1;step<=8;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handBox.x+handBox.width*.8-160*step/8,y:handBox.y+handBox.height*.5,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await game.waitForFunction(()=>document.querySelector('.layout-hand .hand-track').scrollLeft>0);await touch.detach();

 assert.equal(await page.locator('#bot,#options,#option-fields,#events,#asset-list,.studio-sidebar').count(),0,'the viewer contains no authoring or diagnostic panels');
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

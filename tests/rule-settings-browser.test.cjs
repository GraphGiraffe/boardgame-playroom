'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,selectChoice,readChoice}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('A08 invalid settings are rejected atomically by the production host service and guest authority',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 const provider=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local A08 fixture: no provider'}}));page.on('pageerror',error=>errors.push(error.message));
 const evidence=path.resolve(root,'../tmp_files/ux-021/a08-followup-1103');fs.mkdirSync(evidence,{recursive:true});const engine=process.env.PLAYWRIGHT_MODULE?'webkit':'chromium',active=()=>page.locator('#modal-root>[data-surface-state=active]');
 try{
  await page.goto(server.url);await page.locator('[data-start=uno]').first().click();await active().locator('[data-game-mode=hotseat]').click();await active().locator('[data-command=room-game-context]').click();await active().locator('[data-command=room-rules]').click();await page.locator('#room-rules-form').waitFor();
  const invalid=await page.evaluate(()=>{
   const b=PlayroomAppBridge,s=b.roomService,r=b.room();s.setAutoStart(r.id,r.ownerId,false);s.setReady(r.id,r.ownerId,true);const results=[];
   for(const patch of [{preset:'missing-preset'},{options:{...r.rules.options,unoMode:'invalid'}},{options:{...r.rules.options,endMode:'invalid'}},{options:{...r.rules.options,unknownSetting:'unexpected'}}]){
    const before=s.snapshot(r.id);let error=null;try{s.updateRules(r.id,r.ownerId,{...before.rules,...patch});}catch(value){error=value.code||value.message;}
    results.push({patch,error,before,after:s.snapshot(r.id)});
   }
   return results;
  });fs.writeFileSync(path.join(evidence,engine+'-invalid.json'),JSON.stringify(invalid,null,2));
  for(const result of invalid){assert(result.error,'invalid host input is rejected before the rules commit: '+JSON.stringify(result.patch));assert.deepEqual(result.after,result.before,'rules/readiness/revisions/events remain identical');}
  const submission=await page.evaluate(()=>{
   const b=PlayroomAppBridge,r=b.room(),s=b.roomService,form=document.querySelector('#room-rules-form'),input=form.elements['option-unoMode'],before=s.snapshot(r.id),remembered=localStorage.getItem('playroom.last-rules.v1');
   input.add(new Option('Invalid fixture value','invalid'));input.value='invalid';form.requestSubmit();return {before,after:s.snapshot(r.id),remembered,rememberedAfter:localStorage.getItem('playroom.last-rules.v1'),editorRetained:form.isConnected};
  });assert.deepEqual(submission.after,submission.before);assert.equal(submission.rememberedAfter,submission.remembered);assert(submission.editorRetained,'invalid submit keeps the editor available for correction');await page.locator('#toast.show').filter({hasText:/Объявление UNO.*Повторите выбор/}).waitFor();assert(!await page.locator('#toast').innerText().then(text=>text.includes('ROOM_RULES_INVALID')),'the feedback uses the field label and localized retry instruction');
  await active().locator('.modal-head [data-command=close-modal]').click();await active().locator('.modal-head [data-command=close-modal]').click();
  const authority=await page.evaluate(()=>{
   const b=PlayroomAppBridge,s=b.roomService,r=b.room();s.configure(r.id,r.ownerId,{transportMode:'network'});for(const seat of s.snapshot(r.id).seats)if(seat.participantId&&seat.participantId!==r.ownerId)s.setLocalSeat(r.id,r.ownerId,seat.id,{kind:'empty'});
   const guest=s.connection(r.id),joined=guest.dispatch({type:'join',nickname:'Гость A08'}),id=joined.snapshot.participantId,spectator=s.snapshot(r.id);let spectatorError=null;try{s.updateRules(r.id,id,{...r.rules,preset:'quick'});}catch(error){spectatorError=error.code||error.message;}const afterSpectator=s.snapshot(r.id);
   guest.dispatch({type:'claim-seat',seatId:'seat-2'});guest.dispatch({type:'ready',ready:true});s.setReady(r.id,r.ownerId,true);
   const before=s.snapshot(r.id),failures=[];
   for(const type of ['rules','update-rules']){try{guest.dispatch({type,ownerId:r.ownerId,participantId:r.ownerId,rules:{...before.rules,preset:'missing-preset'}});failures.push(null);}catch(error){failures.push(error.code||error.message);}}
   try{s.updateRules(r.id,id,{...before.rules,preset:'quick'});failures.push(null);}catch(error){failures.push(error.code||error.message);}
   const afterRejected=s.snapshot(r.id),events=[];const unsubscribe=guest.subscribe(packet=>events.push(packet));
   const accepted=s.updateRules(r.id,r.ownerId,{...before.rules,preset:'quick'});unsubscribe();
   guest.dispatch({type:'claim-table'});const table=s.snapshot(r.id);let tableError=null;try{s.updateRules(r.id,id,{...accepted.rules,preset:'classic'});}catch(error){tableError=error.code||error.message;}const afterTable=s.snapshot(r.id);guest.dispatch({type:'claim-seat',seatId:'seat-2'});
   s.claimTable(r.id,r.ownerId);const hostTable=s.updateRules(r.id,r.ownerId,{...accepted.rules,preset:'classic'});s.claimSeat(r.id,r.ownerId,'seat-1');
   const thaw=s.freezeLobbyTransfer(r.id,r.ownerId),frozen=s.snapshot(r.id);let frozenError=null;try{s.updateRules(r.id,r.ownerId,{...accepted.rules,preset:'quick'});}catch(error){frozenError=error.code||error.message;}const afterFrozen=s.snapshot(r.id);thaw();
   guest.dispatch({type:'ready',ready:true});s.setReady(r.id,r.ownerId,true);s.beginCountdown(r.id,r.ownerId,{seconds:3});const starting=s.snapshot(r.id);let phaseError=null;try{s.updateRules(r.id,r.ownerId,{...accepted.rules,preset:'classic'});}catch(error){phaseError=error.code||error.message;}
   const afterPhase=s.snapshot(r.id),clock=s.clock;s.clock=()=>starting.countdownEndsAt+1;s.tick(r.id);s.clock=clock;const playing=s.snapshot(r.id);let playingError=null;try{s.updateRules(r.id,r.ownerId,{...accepted.rules,preset:'quick'});}catch(error){playingError=error.code||error.message;}const afterPlaying=s.snapshot(r.id);
   return {id,failures,before,afterRejected,accepted,events,spectator,spectatorError,afterSpectator,table,tableError,afterTable,hostTable,frozen,frozenError,afterFrozen,starting,afterPhase,phaseError,playing,playingError,afterPlaying};
  });fs.writeFileSync(path.join(evidence,engine+'-authority.json'),JSON.stringify(authority,null,2));
  assert(authority.failures.every(Boolean),'guest commands and guest direct actor cannot change rules');assert.deepEqual(authority.afterRejected,authority.before);
  assert.equal(authority.events.length,1);assert.equal(authority.events[0].participantId,authority.id);assert.deepEqual(authority.events[0].room,authority.accepted);assert.equal(authority.accepted.rules.preset,'quick');assert(authority.accepted.participants.filter(person=>person.role==='player').every(person=>!person.ready));
  assert(authority.phaseError);assert.deepEqual(authority.afterPhase,authority.starting,'countdown forbids rules writes atomically');assert.equal(provider.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
  for(const [before,after,error] of [['spectator','afterSpectator','spectatorError'],['table','afterTable','tableError'],['frozen','afterFrozen','frozenError'],['playing','afterPlaying','playingError']]){assert(authority[error],before+' rejects rules changes');assert.deepEqual(authority[after],authority[before],before+' denial is atomic');}
  assert.equal(authority.hostTable.hostMode,'table');assert.equal(authority.hostTable.rules.preset,'classic','host Table retains owner authority');
 }finally{await browser.close();await server.close();}
});
test('A08 future Ludo teams save independently of start roster and reject undeclared settings',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 const provider=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local Ludo rules fixture: no provider'}}));page.on('pageerror',error=>errors.push(error.message));const active=()=>page.locator('#modal-root>[data-surface-state=active]');
 try{
  if(process.env.PLAYROOM_TEST_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT);await page.route('**/*',route=>route.abort());await page.route(server.url,route=>route.fulfill({status:200,contentType:'text/html',body}));}
  const response=await page.goto(server.url);if(process.env.PLAYROOM_TEST_ARTIFACT){const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');assert.equal(hash(await response.body()),hash(fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT)));}
await page.locator('[data-start=ludo]').first().click();await active().locator('[data-game-mode=hotseat]').click();await active().locator('[data-command=room-game-context]').click();await active().locator('[data-command=room-rules]').click();
  const summaryLayout=[];
  for(const width of [360,390,740]){
   await page.setViewportSize({width,height:844});
   const layout=await page.locator('[data-rule-summary-text]').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,items:[...el.children].map(item=>{const r=item.getBoundingClientRect();return {text:item.textContent,x:r.x,y:r.y,height:r.height,lineHeight:parseFloat(getComputedStyle(item).lineHeight)};})}));
   assert.equal(layout.items.length,3);assert(layout.scrollWidth<=layout.width+1);assert(layout.items.every(item=>item.height<=item.lineHeight+1),'summary items wrap together');summaryLayout.push({width,...layout});
  }
  await page.setViewportSize({width:390,height:844});
  const beforeChoice=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),choiceReport=[];
  for(const [name,title]of [['seatOrder','Порядок'],['firstPlayerMode','Игрок №1'],['option-guaranteedExit','Выход после 3 неудач']]){
   const control=page.locator('#room-rules-form [name="'+name+'"]'),value=await control.inputValue(),help=control.locator('..').locator('.rule-help [popover]'),helpText=await help.textContent();await control.click();
   const picker=active().locator('.select-choice-dialog');await picker.waitFor();assert.equal(await picker.locator('.modal-head h2').innerText(),title);assert.equal(await picker.locator('.pairing-choice-list').getAttribute('aria-label'),title);assert(await picker.locator('.modal-head h2').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'short field heading fits the panel');
   if(process.env.PLAYROOM_RULE_CHOICE_EVIDENCE_DIR){fs.mkdirSync(process.env.PLAYROOM_RULE_CHOICE_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_RULE_CHOICE_EVIDENCE_DIR,name+'.png')});}
   await picker.locator('[data-choice][aria-pressed="true"]').click();await picker.waitFor({state:'detached'});assert.equal(await control.inputValue(),value);assert.equal(await help.textContent(),helpText);choiceReport.push({name,title,helpPreserved:true,value});
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),beforeChoice,'opening or accepting the current option does not save rule changes');
  if(process.env.PLAYROOM_RULE_CHOICE_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.PLAYROOM_RULE_CHOICE_EVIDENCE_DIR,'choices.json'),JSON.stringify({engine:browser.browserType().name(),version:browser.version(),choices:choiceReport},null,2));
  await selectChoice(page.locator('#room-rules-form [name=preset]'),'teams');await page.locator('#room-rules-form').evaluate(form=>form.requestSubmit());
  const future=await page.evaluate(()=>{const b=PlayroomAppBridge,s=b.roomService,r=s.snapshot(b.room().id);return {room:r,canStart:s.canStart(r.id),reason:s.startBlocker(r.id)};});assert.equal(future.room.rules.preset,'teams');assert.equal(future.room.seats.filter(seat=>seat.participantId).length,2);assert.equal(future.canStart,false);assert(future.reason,'the actual engine rejects a two-player team start while the valid preset remains saved');
  const invalid=await page.evaluate(()=>{const b=PlayroomAppBridge,s=b.roomService,r=b.room(),before=s.snapshot(r.id);let error=null;try{s.updateRules(r.id,r.ownerId,{...before.rules,options:{...before.rules.options,diceCount:'99'}});}catch(value){error=value.code||value.message;}return {before,after:s.snapshot(r.id),error};});assert.equal(invalid.error,'ROOM_RULES_INVALID');assert.deepEqual(invalid.after,invalid.before);
  const ready=await page.evaluate(()=>{const b=PlayroomAppBridge,s=b.roomService,r=b.room();s.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'bot'});s.setLocalSeat(r.id,r.ownerId,'seat-4',{kind:'bot'});return {room:s.snapshot(r.id),canStart:s.canStart(r.id),reason:s.startBlocker(r.id)};});assert.equal(ready.room.rules.preset,'teams');assert.equal(ready.canStart,true);assert.equal(ready.reason,null);assert.equal(provider.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
test('A08 ownership handoff retires an open rules editor and preserves the successor editor context',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),errors=[],pages=[],net=[];
 const evidence=path.resolve(root,'../tmp_files/ux-021/a08-followup-1103/ownership');fs.mkdirSync(evidence,{recursive:true});const engine=process.env.PLAYWRIGHT_MODULE?'webkit':'chromium';
 try{
  for(let i=0;i<2;i++){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});net.push(await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local handoff ports: no provider'}})));const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);await page.locator('.game-tile').first().waitFor();pages.push(page);}
  const [host,next]=pages,active=page=>page.locator('#modal-root>[data-surface-state=active]');
  await host.locator('[data-start=uno]').first().click();await active(host).locator('[data-game-mode=hotseat]').click();
  await host.evaluate(()=>{const b=PlayroomAppBridge,s=b.roomService,r=b.room();s.setAutoStart(r.id,r.ownerId,false);s.configure(r.id,r.ownerId,{transportMode:'network'});for(const seat of s.snapshot(r.id).seats)if(seat.participantId&&seat.participantId!==r.ownerId)s.setLocalSeat(r.id,r.ownerId,seat.id,{kind:'empty'});b.renderLobby();});
  await active(host).locator('[data-command=room-game-context]').click();await active(host).locator('[data-command=room-rules]').click();await selectChoice(host.locator('#room-rules-form [name=option-endMode]'),'last');
  await host.exposeFunction('__a08PromoteLocal',payload=>next.evaluate(async value=>{await PlayroomNetworkLibrary.transferPromoteLobby({payload:value,peers:new Map()});return {room:PlayroomAppBridge.room(),actor:PlayroomAppBridge.participantId()};},payload));
  const prepared=await host.evaluate(()=>{
   const b=PlayroomAppBridge,s=b.roomService,r=b.room(),connection=s.connection(r.id),joined=connection.dispatch({type:'join',nickname:'Следующий хост'}),target=joined.snapshot.participantId;
   connection.dispatch({type:'claim-seat',seatId:'seat-2'});connection.dispatch({type:'ready',ready:true});s.setReady(r.id,r.ownerId,true);
   const network=PlayroomNetworkLibrary,wire=PlayroomHostTransferWire,channel=new EventTarget(),before=s.snapshot(r.id),defaults=localStorage.getItem('playroom.last-rules.v1');channel.readyState='open';
   const fixture=window.a08Handoff={network,wire,connection,before,defaults,form:document.querySelector('#room-rules-form'),steps:[],target,source:r.ownerId,roomId:r.id,payload:null};
   fixture.delayed=new Promise(resolve=>fixture.releaseSubmit=resolve).then(()=>{fixture.form.requestSubmit();return {connected:fixture.form.isConnected,room:b.room(),defaults:localStorage.getItem('playroom.last-rules.v1')};});
   const consent=new Promise(resolve=>fixture.accept=()=>resolve({accepted:true}));
   // Only peer admission/signaling/fence acknowledgements are local ports. The
   // real UI/Sender constructs lobbyBundle and the successor uses the real
   // promotion/restore lifecycle; no ownerId or service internals are patched.
   window.PlayroomNetworkLibrary=Object.freeze({...network,
    transferContext:()=>({room:s.snapshot(r.id),kind:'lobby',peers:[{id:target,channel}]}),
    transferFreeze:async()=>{fixture.steps.push('freeze');return s.freezeLobbyTransfer(r.id,r.ownerId);},
    transferExport:async()=>({lobby:{version:1,room:s.snapshot(r.id),tokens:[{participantId:target,token:joined.resumeToken}]},pack:b.packs.exportPack(r.game.id,r.game.version),chat:[]}),
    transferSaveResume:token=>{fixture.steps.push('resume-ack');return /^[a-f0-9]{64}$/.test(token);},
    transferFence:async()=>{fixture.steps.push('fence-ack');}
   });
   window.PlayroomHostTransferWire={bind:peer=>{if(peer!==channel)throw Error('Unexpected local peer');return {request:async(method,data)=>{
    fixture.steps.push(method);
    if(method==='consent')return consent;
    if(method==='prepare'){fixture.payload=data.payload;network.transferValidateLobby(data.payload);const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.payload))));return {digest:'sha256:'+Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join(''),revision:data.payload.lobby.recovery.room.revision};}
    if(method==='offers')return [];
    if(method==='activate'){await __a08PromoteLocal(fixture.payload);connection.close();network.leaveHostRoom(r.id);b.rollbackHostedRoom(r.id);b.closeModal(true);const state=PlayroomHostTransferUI.senderState();state.promoted=true;state.promotedResolve();return {ok:true};}
    if(method==='cancel')return {ok:true};throw Error('Unexpected local handoff RPC: '+method);
   }};}};
   fixture.job=PlayroomHostTransferUI.start(target);return {before,defaults,target,oldEditor:!!fixture.form};
  });assert(prepared.oldEditor);await host.locator('#room-rules-form').waitFor({state:'detached'});assert.equal(await host.evaluate(()=>PlayroomHostTransferUI.senderState().stage),'consent','the actual offer retires the editor before awaiting peer consent');
  await host.evaluate(async()=>{a08Handoff.accept();a08Handoff.result=await a08Handoff.job;window.PlayroomNetworkLibrary=a08Handoff.network;window.PlayroomHostTransferWire=a08Handoff.wire;});
  const promoted=await next.evaluate(()=>({room:PlayroomAppBridge.room(),actor:PlayroomAppBridge.participantId(),defaults:localStorage.getItem('playroom.last-rules.v1')}));assert.equal(promoted.actor,prepared.target);assert.equal(promoted.room.ownerId,prepared.target);assert.equal(promoted.room.id,prepared.before.id);assert.deepEqual(promoted.room.rules,prepared.before.rules);assert(promoted.room.participants.filter(person=>!person.bot).every(person=>!person.ready));
  await active(next).locator('[data-command=room-game-context]').click();await next.evaluate(()=>window.a08GameContext=document.querySelector('#modal-root>[data-surface-state=active]'));await active(next).locator('[data-command=room-rules]').click();await selectChoice(next.locator('#room-rules-form [name=preset]'),'quick');await active(next).locator('.modal-head [data-command=close-modal]').click();
  assert(await next.evaluate(()=>a08GameContext===document.querySelector('#modal-root>[data-surface-state=active]')),'Back restores the exact successor game context');assert.deepEqual(await next.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id)),promoted.room,'successor Back cancels only its draft');assert.equal(await next.evaluate(()=>localStorage.getItem('playroom.last-rules.v1')),promoted.defaults);
  await active(next).locator('[data-command=room-rules]').click();assert.equal(await readChoice(next.locator('#room-rules-form [name=preset]')),'classic');await selectChoice(next.locator('#room-rules-form [name=preset]'),'quick');await next.locator('#room-rules-form').evaluate(form=>form.requestSubmit());
  const accepted=await next.evaluate(()=>({room:PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id),defaults:localStorage.getItem('playroom.last-rules.v1')}));assert.equal(accepted.room.rules.preset,'quick');assert.equal(accepted.room.rules.options.endMode,'winner');assert.equal(JSON.parse(accepted.defaults).uno.preset,'quick');
  const delayed=await host.evaluate(async()=>{a08Handoff.releaseSubmit();return a08Handoff.delayed;});assert.equal(delayed.connected,false);assert.equal(delayed.room,null);assert.equal(delayed.defaults,prepared.defaults);
  assert.deepEqual(await next.evaluate(()=>({room:PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id),defaults:localStorage.getItem('playroom.last-rules.v1')})),accepted,'old delayed submit changes neither successor rules/readiness/events nor defaults');
  const lifecycle=await host.evaluate(()=>({steps:a08Handoff.steps,result:a08Handoff.result,sourceRoom:PlayroomAppBridge.room()}));assert(lifecycle.result.complete);assert.deepEqual(lifecycle.steps,['consent','freeze','prepare','offers','resume-ack','fence-ack','activate']);assert(net.every(value=>value.nativeSupabaseRequests===0));assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,engine+'.json'),JSON.stringify({scope:'actual UI/Sender/lobbyBundle/promotion, local peer/consent/ACK ports; no RTC or physical devices',prepared,promoted,accepted,delayed,lifecycle,nativeSupabaseRequests:net.map(value=>value.nativeSupabaseRequests),errors},null,2));
 }finally{await browser.close();await server.close();}
});
for(const [width,height] of [[320,740],[390,740],[740,390]])test(`screen:phone:${width>height?'landscape':'portrait'} rules ${width}×${height}: grouping, drafts and exact IDs`,{timeout:120000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 const provider=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({status:503,json:{message:'Local rules fixture: no provider'}}));
 const shots=path.resolve(root,'../tmp_files/ux-021/rules-buckets');fs.mkdirSync(shots,{recursive:true});const engine=process.env.PLAYWRIGHT_MODULE?'webkit':'chromium',active=()=>page.locator('#modal-root>[data-surface-state=active]');
 const openRules=async id=>{await page.locator('[data-start='+id+']').first().click();await active().locator('[data-game-mode=hotseat]').click();await active().locator('[data-command=room-game-context]').click();await active().locator('[data-command=room-rules]').click();await page.locator('#room-rules-form').waitFor();};
 const leave=async()=>{if(await active().locator('#room-rules-form').count())await active().locator('.modal-head [data-command=close-modal]').click();if(await active().locator('.room-game-context-modal').count())await active().locator('.modal-head [data-command=close-modal]').click();await active().locator('[data-room-context]').click();await active().locator('[data-command=lobby-leave]').click();if(await active().locator('[data-confirm-accept]').count())await active().locator('[data-confirm-accept]').click();await page.locator('.room-v021').waitFor({state:'detached'});};
 try{await page.goto(server.url);
  for(const id of ['pexeso','uno','durak','gofish','oldmaid','domino','ludo','snakes','yatzy','checkers','battleship','tictactoe']){
   await openRules(id);const form=page.locator('#room-rules-form');assert(await form.evaluate(node=>node.scrollWidth<=node.clientWidth+1),id+' form fits '+width);assert.equal(await form.locator('details').count(),0,id+' does not hide all parameters in a disclosure');
   const groups=await form.locator('[data-rule-section]:visible').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.ruleSection,label:node.querySelector('h3').textContent}))),expected=['order','parameters','ending'];assert.deepEqual(groups.map(group=>group.id),expected.filter(key=>groups.some(group=>group.id===key)),id+' sections follow order/parameters/ending');assert.deepEqual(groups.map(group=>group.label),groups.map(group=>({order:'Порядок игры',parameters:'Параметры',ending:'Завершение'}[group.id])));assert.equal(groups[0].id,'order',id+' multiplayer order is first');
   const placement=await form.evaluate(node=>{const spec=PlayroomCatalog[node.dataset.game],end=new Set((spec.ruleGroups||[]).filter(group=>group.end).flatMap(group=>group.fields));return (spec.settings||[]).map(field=>({key:field.key,expected:end.has(field.key)?'ending':'parameters',actual:node.querySelector('[data-rule-field="'+field.key+'"]')?.closest('[data-rule-section]')?.dataset.ruleSection}));});assert(placement.every(field=>field.actual===field.expected),id+' each actual schema field belongs to its semantic section');
   assert(await form.locator('.rules-v021-fields:visible').evaluateAll((nodes,width)=>nodes.every(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length===(width>=360?2:1)),width),id+' uses compact columns where the viewport allows');
   const controls=await form.evaluate(node=>{const spec=PlayroomCatalog[node.dataset.game];return (spec.settings||[]).map(field=>{const input=node.elements['option-'+field.key],range=field.options.length>1&&field.control==='slider'&&field.options.every(option=>typeof option.value==='number'&&Number.isFinite(option.value));return {key:field.key,tag:input.tagName,type:input.type,expected:field.options.length===1?'hidden':range?'range':'select-one'};});});assert(controls.every(control=>control.type===control.expected),id+' preserves declared numeric ranges and native categorical IDs');
   assert(await form.locator('.rules-v021-field:visible .setting-title').evaluateAll(nodes=>nodes.every(node=>{const title=node.querySelector('.setting-title-text'),button=node.querySelector('.rule-help>button');if(!button)return true;const a=title.getBoundingClientRect(),b=button.getBoundingClientRect();return b.left>=a.right-1&&b.left-a.right<=8&&Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2;})),id+' contextual help stays beside its title');
   if(['gofish','oldmaid'].includes(id)){assert.deepEqual(await form.locator('[name=option-deck] option').evaluateAll(nodes=>nodes.map(node=>node.value)),['36','52']);if(id==='oldmaid')assert.deepEqual(await form.locator('[name=option-deck] option').allTextContents(),['35 карт','51 карта']);}
   if(['ludo','snakes'].includes(id)){const rail=form.locator('[name=option-maxRounds]');await rail.focus();await rail.press('End');assert.equal(await readChoice(rail),'0');if(await rail.evaluate(node=>node.type)==='range'){assert.equal(await rail.getAttribute('aria-valuetext'),'Без ограничения');assert.equal(await form.locator('#rule-option-maxRounds-value').innerText(),'∞');}else assert.equal(await rail.locator('option:checked').innerText(),'∞','native limit select preserves the unlimited label');}
   if(id==='durak'){assert.equal(await form.locator('[name=option-deck]').inputValue(),'54');assert(await form.locator('[data-rule-field=jokerMode]').isVisible());await form.locator('[name=option-deck]').selectOption('36');assert.equal(await form.locator('[data-rule-field=jokerMode]').isVisible(),false);await form.locator('[name=option-deck]').selectOption('54');assert(await form.locator('[data-rule-field=jokerMode]').isVisible());}
   if(id==='uno'){const before=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules));await selectChoice(form.locator('[name=preset]'),'quick');assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),before,'editing has no accepted-state side effects');const help=form.locator('[data-rule-field=preset] .rule-help>button');await help.click();await page.locator('.mini-help-popover:popover-open').waitFor();await page.keyboard.press('Escape');assert(await form.isVisible(),'Escape closes help without discarding the editor');await page.screenshot({path:path.join(shots,engine+'-uno-'+width+'.png')});}
   if(id==='ludo')await page.screenshot({path:path.join(shots,engine+'-ludo-'+width+'.png')});await leave();
  }
  await openRules('uno');let form=page.locator('#room-rules-form');assert.equal(await readChoice(form.locator('[name=preset]')),'classic','Cancel did not persist quick preset');await selectChoice(form.locator('[name=preset]'),'quick');await selectChoice(form.locator('[name=option-unoMode]'),'auto');await selectChoice(form.locator('[name=option-endMode]'),'last');await form.evaluate(node=>node.requestSubmit());assert.deepEqual(await page.evaluate(()=>{const r=PlayroomAppBridge.room().rules;return [r.preset,r.options.unoMode,r.options.endMode];}),['quick','auto','last']);await leave();await page.reload();await openRules('uno');form=page.locator('#room-rules-form');assert.equal(await readChoice(form.locator('[name=preset]')),'quick');assert.equal(await readChoice(form.locator('[name=option-unoMode]')),'auto');assert.equal(provider.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('rulebooks: all games explain play before settings and show the current match values',{timeout:180000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 const close=()=>page.locator('#modal-root .modal-head [data-command=close-modal]').click();
 const shots=path.resolve(root,'../tmp_files/player-rulebooks/screenshots');fs.mkdirSync(shots,{recursive:true});
 try{
  await page.goto(process.env.PLAYROOM_URL||server.url);
  for(const id of ['mage-brawl','uno','durak','gofish','oldmaid','domino','battleship','checkers','ludo','snakes','pexeso','klondike','spider','tictactoe','yatzy']){
   await page.locator('[data-start="'+id+'"]').first().click();await page.locator('[data-command=room-rules-view]').click();
   const book=page.locator('.game-rules-help');assert(await book.locator('.rulebook-section').count()>=3,id+' has a full rulebook');
   assert(await book.evaluate(e=>e.firstElementChild.classList.contains('rules-selected-settings')&&e.children[1].classList.contains('rulebook-contents')&&e.children[2].classList.contains('rulebook-main')&&e.children[3].tagName==='HR'&&e.lastElementChild.classList.contains('rulebook-config')),id+' reading order');
   assert.equal(await page.locator('.rulebook-head h2').innerText(),'Правила',id+' concise title');
   assert.equal(await page.locator('.rulebook-toolbar button').count(),3,id+' three navigation actions');
   assert(await book.locator('.rulebook-option').evaluateAll(nodes=>nodes.every(node=>node.querySelectorAll('.rulebook-choices').length===1)),id+' consistent choices for every setting');
   const helps=book.locator('.rules-selected-settings dt .rule-help>button');
   assert.equal(await helps.count(),await book.locator('.rules-selected-settings dt').count(),id+' every selected parameter has help');
   for(let i=0;i<await helps.count();i++){
    await helps.nth(i).click();assert(await page.locator('.mini-help-popover:popover-open').isVisible(),id+' parameter help');
    assert((await page.locator('.mini-help-popover:popover-open').innerText()).trim().length>0);await page.keyboard.press('Escape');
    assert(await book.isVisible(),id+' Escape keeps rules open');
   }
   assert(await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-options]').evaluate(e=>!e.innerHTML.includes('M4 7h16M4 17h16')),id+' parameter explanations do not use settings icon');
   const originalUrl=page.url();
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-options]').click();
   await page.waitForFunction(()=>{const e=document.getElementById('rulebook-options'),b=e.closest('.modal-body');return Math.abs(e.getBoundingClientRect().top-b.getBoundingClientRect().top)<3;});
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-contents]').click();
   await book.locator('.rulebook-contents a').first().click();
   await page.waitForFunction(()=>document.activeElement?.id==='rulebook-section-0');
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-top]').click();
   await page.waitForFunction(()=>document.querySelector('.modal-body').scrollTop<2);
   assert.equal(page.url(),originalUrl,id+' navigation does not change URL/back stack');
   const text=await book.innerText();assert(!/поезд|пакетный урон|Windows XP|Доступные действия подсвечиваются|[a-z-]+\.(?:rules\.\d|book\.)/.test(text),id+' no obsolete text or unresolved keys');
   assert(await book.locator('.rulebook-config .rules-mode-note').count()>0,id+' selected values');
   if(id!=='mage-brawl'){
    assert(await book.locator('.rule-art').count()>=2,id+' includes game pieces and UI examples');
    assert.equal(await book.locator('.rule-art:not([inert])').count(),0,id+' rule examples are inert');
    assert.equal(await book.locator('.rule-art [data-action]').count(),0,id+' examples cannot dispatch game commands');
   }
   for(const viewport of [{width:320,height:740},{width:390,height:740},{width:740,height:390}]){
    await page.setViewportSize(viewport);assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' fits '+viewport.width);assert(await page.locator('.rulebook-head').evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' header fits '+viewport.width);
    assert(await book.locator('.rule-art [data-size-role=card]').evaluateAll(cards=>cards.every(card=>{const b=card.getBoundingClientRect();return b.width>=30&&b.width<=61&&b.height<=90;})),id+' example cards stay compact');
    assert(await book.locator('.rule-art-row').evaluateAll(rows=>rows.every(row=>{const cards=[...row.querySelectorAll('[data-size-role=card]')].map(c=>c.getBoundingClientRect());return cards.length<2||cards.every(c=>Math.abs(c.top+c.height/2-cards[0].top-cards[0].height/2)<1);})),id+' cards in one example step stay on one row');
   }
   await page.setViewportSize({width:390,height:740});
   if(id!=='mage-brawl'){
    const figures=book.locator('.rulebook-figure');
    for(let i=0;i<await figures.count();i++){
     await figures.nth(i).scrollIntoViewIfNeeded();
     await page.screenshot({path:path.join(shots,id+'-illustrations'+(i?'-'+i:'')+'.png')});
    }
    await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));
    await figures.first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(shots,id+'-illustrations-dark.png')});
    assert(await book.locator('.rule-art').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)),id+' artwork fits in dark theme');
    await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('light'));
   }
   if(id==='mage-brawl'){
    assert(text.includes('его атаки не усиливаются'));
    assert.equal(await book.locator('.rulebook-figure').count(),23);
    assert.equal(await book.locator('.rulebook-illustration>svg').count(),23);
    assert(text.includes('В каждом — 8 фаз'));
    assert(text.includes('Летящий кулак'));
    assert.equal(await page.evaluate(()=>PlayroomAppBridge.packs.exportView('mage-brawl').rulebook.sections.length),11,'network export includes public illustrated rules');assert(text.includes('Общее число жизней'));
    await page.screenshot({path:path.join(shots,'mage-rulebook-start.png')});
    await book.locator('.rulebook-config').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'mage-rulebook-settings.png')});
   }
   await close();await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-confirm-accept]').click();
  }
  await page.locator('[data-start="mage-brawl"]').first().click();await page.locator('[data-command=room-rules]').click();
  await selectChoice(page.locator('[name=option-health]'),'6');await page.locator('#room-rules-form').evaluate(e=>e.requestSubmit());
  await page.locator('[data-command=lobby-start]').click();await page.locator('#app .table-shell').waitFor();
  await page.locator('[data-learning-choice=no]').click();
  await page.locator('#app [data-command=settings]').click();await page.locator('.settings-quick [data-command=rules]').click();
  const health=page.locator('.rulebook-option').filter({has:page.getByRole('heading',{name:'Здоровье',exact:true})});
  assert.equal((await health.locator('.rules-mode-note').innerText()).trim(),'В этой партии: 6','live match uses saved rules, not defaults');
  assert.equal(await page.locator('.rulebook-config h4').filter({hasText:'Первый игрок'}).count(),0,'simultaneous game does not offer a nonexistent setting');
  assert.equal(await page.evaluate(()=>{const e=document.createElement('div');e.innerHTML=PlayroomLobbyView.gameRulesMarkup({rules:['<b>Title</b>\n<script>bad()</script>','Legacy line'],presets:[]});return e.querySelectorAll('script,b').length;}),0,'rule text is escaped, old single-line rules supported');
  await close();await page.locator('.settings-overview').waitFor();await close();assert(await page.locator('#app .table-shell').isVisible());
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('illustrated rules: offline digital faces, network view and colored help in both themes',{timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
 const out=path.resolve(root,'../tmp_files/illustrated-rules/screenshots');fs.mkdirSync(out,{recursive:true});
 try{
  await page.goto(require('node:url').pathToFileURL(path.join(root,'dist/playroom-all-games.html')).href);
  await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-command=room-rules-view]').click();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);
   for(const name of ['Движения','Тайлы']){
    const section=page.locator('.rulebook-section').filter({has:page.getByRole('heading',{name,exact:true})});await section.scrollIntoViewIfNeeded();
    assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    if(name==='Тайлы')assert(await section.locator('.is-list .rulebook-figure').evaluateAll(nodes=>nodes.length===9&&nodes.every(n=>{const a=n.querySelector('.rulebook-illustration').getBoundingClientRect(),t=n.querySelector('figcaption').getBoundingClientRect();return a.right<=t.left&&t.width>0;})),'tile descriptions sit beside their artwork');
    await page.screenshot({path:path.join(out,`${theme}-${name==='Движения'?'movement':'tiles'}.png`)});
   }
  }
  assert.equal(await page.locator('.rulebook-table').count(),4,'effect comparisons use tables');
  assert(await page.locator('.rulebook-section ol').count()>0,'planning and reward steps use numbered lists');
  assert.equal(await page.evaluate(()=>{
   const definition=PlayroomAppBridge.packs.exportView('mage-brawl');const view=PlayroomSharedViews.install(definition);
   const host=document.createElement('div');host.innerHTML=PlayroomLobbyView.gameRulesMarkup({id:view.manifest.id,rules:view.rules,rulebook:view.rulebook});
   return host.querySelectorAll('.rulebook-figure').length;
  }),23,'a view-only network client can render illustrated rules without rules code');
  await page.locator('#modal-root .modal-head [data-command=close-modal]').click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(let i=2;i<8;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'bot',nickname:'Бот '+i});b.renderLobby();});
  await page.locator('[data-command=lobby-start]').click();await page.locator('[data-learning-choice=no]').click();
  // Card skins can render main/compact variants; check each card instead of counting printed variants.
  assert(await page.locator('.mage-card:visible').evaluateAll(cards=>cards.length===4&&cards.every(card=>card.querySelector('.mage-spell-art rect[stroke]'))));
  for(let direction=0;direction<4;direction++){
   if(direction)await page.locator('[data-view-key=mageDirection]').last().click();
   await page.locator('[data-command=card-help]').click();
   assert(await page.locator('.card-help-list .mage-action-diagram>g[style*=color]').count()>0,'help uses elemental colors');
   assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(direction===1)await page.screenshot({path:path.join(out,'dark-hand-help.png')});
   await page.locator('#modal-root .modal-head [data-command=close-modal]').click();
  }
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);assert(await page.locator('.table-shell').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test('rule changes show localized before and after values above the screen',{timeout:25000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),page=await context.newPage();await page.goto(server.url);await page.locator('#profile-form input').fill('Игрок');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.evaluate(()=>{
  PlayroomCatalog.fixture={settings:[{key:'announce',label:'Объявление о потоплении',options:[{value:false,label:'Нет'},{value:true,label:'Да'}]}],presetSetting:{label:'Режим',options:[{value:'classic',label:'Классический'},{value:'russian',label:'Русский'}]}};
  const room={id:'change-fixture',game:{id:'fixture'},transportMode:'online',phase:'lobby',rulesRevision:1,previousRules:{preset:'classic',options:{announce:false}},rules:{preset:'russian',options:{announce:true}},participants:[{id:'guest',rulesNotice:true}]};window.rulesNotifications=[];PlayroomLobbyView.notifyRulesChange(room,'guest',m=>{rulesNotifications.push(m);PlayroomAppBridge.toast(m);});PlayroomLobbyView.notifyRulesChange(room,'guest',m=>rulesNotifications.push(m));
 });assert.deepEqual(await page.evaluate(()=>rulesNotifications),['Режим: Классический → Русский\nОбъявление о потоплении: Нет → Да']);assert.equal(await page.locator('#toast').getAttribute('class'),'toast show');await page.waitForFunction(()=>document.querySelector('#toast').getBoundingClientRect().top<20&&Number(getComputedStyle(document.querySelector('#toast')).opacity)>.99);const box=await page.locator('#toast').boundingBox();assert(box.y<20&&box.x>=0&&box.x+box.width<=390);await page.screenshot({path:path.resolve(root,'../tmp_files/push-events-020/rules-changed.png')});
 }finally{await browser.close();await server.close();}
});

test('0.21 reader uses one scroll, shared tabs and sticky contents without losing its parent',{timeout:180000},async()=>{
 const engine=process.env.LAB_ENGINE||'chromium',pw=require('playwright-core'),sync=require('./account-sync-fixture.cjs'),server=await serveBrowserFixture(root),browser=await pw[engine].launch(engine==='chromium'?{headless:true,executablePath:executablePath(),args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),counts=await sync.installFetch(context,sync(async route=>route.fulfill({status:200,json:{}}))),page=await context.newPage(),errors=[];
 const out=path.resolve(root,'../tmp_files/ux-021/reader-update-audit');fs.mkdirSync(out,{recursive:true});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'reader-test',name:'Анна',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});
 const active=s=>page.locator('#modal-root>[data-surface-state=active] '+s),report=[],offlineFile=path.resolve(process.env.PLAYROOM_OFFLINE_HTML||path.join(root,'dist/playroom-all-games.html')),offlineSHA256=require('node:crypto').createHash('sha256').update(fs.readFileSync(offlineFile)).digest('hex'),offlineCatalogRequests=[];let offlineMode=false;page.on('request',request=>{if(offlineMode&&/\/api\/packs\/catalog(?:\?|$)/.test(request.url()))offlineCatalogRequests.push(request.url());});
 try{
  await page.goto(server.url);await page.locator('[data-start=domino]').first().click();await active('[data-game-card-rules]').click();await active('.rulebook-modal').waitFor();
  assert.equal(await active('.rulebook-head [data-rulebook-jump]').count(),0);await active('.rulebook-head [popovertarget]').click();await page.locator('[popover]:popover-open').waitFor();await page.keyboard.press('Escape');
  for(const size of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);await active('[data-rulebook-mode=brief]').click();assert(await active('[data-rulebook-brief]').isVisible());assert.equal(await active('[data-rulebook-brief] .rulebook-section').count()>1,true);assert(await active('[data-rulebook-brief] button').evaluateAll(nodes=>nodes.every(node=>node.disabled||node.closest('[inert]'))),'the material has no wizard; illustrated controls are inert');
   await page.screenshot({path:path.join(out,`reader-brief-${size.width}-${engine}.png`),animations:'disabled'});await active('[data-rulebook-mode=brief]').focus();await page.keyboard.press('ArrowRight');assert.equal(await active('[data-rulebook-mode=full]').getAttribute('aria-selected'),'true');
   await active('.modal-body').evaluate(e=>e.scrollTop=700);const geometry=await active('.rulebook-toc').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,bodyTop:e.closest('.modal-body').getBoundingClientRect().top,overflow:e.closest('.modal-body').scrollWidth>e.closest('.modal-body').clientWidth+1}));assert(geometry.top>=geometry.bodyTop-1&&geometry.top<=geometry.bodyTop+8,'contents stays pinned inside scroll padding: '+JSON.stringify(geometry));assert(geometry.bottom<=size.height);assert(!geometry.overflow);await active('.rulebook-toc>summary').click();await active('[data-rulebook-jump=rulebook-options]').click();assert(await active('#rulebook-options').isVisible());assert.equal(await active('.rulebook-toc').evaluate(e=>e.open),false);await page.screenshot({path:path.join(out,`reader-full-${size.width}-${engine}.png`),animations:'disabled'});report.push({viewport:size,...geometry});
  }
  const oldScroll=await active('.modal-body').evaluate(e=>{e.scrollTop=350;window.readerBody=e;return e.scrollTop;});await page.evaluate(()=>{const back=PlayroomAppBridge.captureModalReturn();PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Проверка возврата')+'<input id="reader-child-draft" value="Черновик">','friend-profile-modal',{onBack:back});});await active('#reader-child-draft').fill('Сохранить ввод');await page.evaluate(()=>{document.querySelector('[data-surface-state=suspended] [data-rulebook-mode=brief]').click();});assert.equal(await page.locator('[data-surface-state=suspended] [data-rulebook-mode=full]').getAttribute('aria-selected'),'true','inactive parent ignores reader handlers');await active('.modal-head [data-command=close-modal]').click();assert.equal(await active('.modal-body').evaluate(e=>e===window.readerBody),true);assert.equal(await active('.modal-body').evaluate(e=>e.scrollTop),oldScroll);
  await active('.modal-head [data-command=close-modal]').click();await active('.game-card-modal').waitFor();await active('[data-game-mode=hotseat]').click();await active('[data-command=room-rules-view]').click();await active('.rulebook-modal').waitFor();await active('.modal-head [data-command=close-modal]').click();await active('.room-setup-modal').waitFor();
  // All current packs own a genuinely concise, illustrated introduction; full documents stay separate.
  await active('[data-room-context]').click();await active('[data-command=lobby-leave]').click();if(await active('[data-confirm-accept]').count())await active('[data-confirm-accept]').click();
  offlineMode=true;await page.goto(require('node:url').pathToFileURL(offlineFile).href);
  const briefs=[];for(const id of ['mage-brawl','uno','durak','gofish','oldmaid','domino','battleship','checkers','ludo','snakes','pexeso','klondike','spider','tictactoe','yatzy']){
   await page.locator('[data-start='+id+']').first().click();await active('[data-game-card-rules]').click();
   const brief=active('[data-rulebook-brief]'),countsForGame=await brief.evaluate(node=>({words:[...node.querySelectorAll('h3,p,figcaption')].filter(e=>!e.closest('.rulebook-illustration')).map(e=>e.textContent).join(' ').trim().split(/\s+/).length,sections:[...node.querySelectorAll('h3')].map(e=>e.textContent),figures:node.querySelectorAll('figure').length,art:[...node.querySelectorAll('.rulebook-illustration')].every(e=>!!e.querySelector('svg,.rule-art')&&e.textContent.indexOf('.brief.')<0)}));
   assert.deepEqual(countsForGame.sections,['Цель','Ваш ход','Финиш'],id+' three essential sections');assert(countsForGame.words>=60&&countsForGame.words<=(id==='mage-brawl'?140:100),id+' brief word budget '+countsForGame.words);assert(countsForGame.figures>=1&&countsForGame.figures<=2&&countsForGame.art,id+' actual game illustrations');assert(await brief.locator('button,input,a,select').evaluateAll(nodes=>nodes.every(node=>node.disabled||node.closest('[inert]'))),id+' illustrated controls are inert');assert.equal(await brief.locator('.rulebook-config,.rules-selected-settings,.rulebook-toc').count(),0,id+' no settings encyclopedia in the brief');
   for(const theme of ['light','dark']){await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);for(const size of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);const metrics=await brief.evaluate(node=>({overflow:node.scrollWidth>node.clientWidth+1,figures:[...node.querySelectorAll('.rulebook-illustration')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth+1}))}));assert(!metrics.overflow&&metrics.figures.every(f=>f.width>0&&f.height>0&&!f.overflow),id+' readable art fits '+theme+' '+size.width+' '+JSON.stringify(metrics));await page.screenshot({path:path.join(out,`brief-${id}-${theme}-${size.width}-${engine}.png`),animations:'disabled'});
   }}
   briefs.push({id,...countsForGame});await active('[data-rulebook-mode=full]').click();assert(await active('[data-rulebook-full] .rulebook-section').count()>=3,id+' full remains available');await active('.modal-head [data-command=close-modal]').click();await active('.modal-head [data-command=close-modal]').click();
  }
  await page.evaluate(()=>{const current=TabletopCore.GAMES.find(game=>game.id==='domino'),legacy={...current,rulebook:{sections:current.rulebook.sections}};PlayroomAppBridge.openModal(PlayroomRulebookView.header()+PlayroomLobbyView.gameRulesMarkup(legacy),'rulebook-modal');});
  assert.equal(await active('[data-rulebook-brief] .rulebook-section').count(),0,'old pack is not silently presented as a long brief');await active('[data-rulebook-brief] [data-rulebook-mode=full]').click();assert(await active('[data-rulebook-full]').isVisible(),'explicit fallback opens full rules');await active('.modal-head [data-command=close-modal]').click();
  await page.setViewportSize({width:390,height:844});await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=packs]').click();
  const offlineCatalog={reason:await active('[data-pack-catalog-unavailable]').innerText(),refreshDisabled:await active('[data-pack-catalog-refresh]').isDisabled(),availability:await page.evaluate(()=>PlayroomRemotePacks.availability()),nativeRequests:offlineCatalogRequests};assert.match(offlineCatalog.reason,/при открытии файла/);assert.equal(offlineCatalog.refreshDisabled,true);assert.equal(offlineCatalog.availability.available,false);assert.deepEqual(offlineCatalogRequests,[],'file catalogue does not attempt an impossible same-origin request');await page.screenshot({path:path.join(out,`offline-catalog-${engine}.png`),animations:'disabled'});
  fs.writeFileSync(path.join(out,`reader-${engine}-report.json`),JSON.stringify({report,briefs,counts,errors,offlineFile,offlineSHA256,offlineCatalog,scope:'card/lobby reader plus all15 autonomous HTML briefs, themes and viewports; shared tabs, keyboard, sticky TOC, suspended parent and Back; emulated browser only'},null,2));assert.equal(counts.nativeSupabaseRequests,0);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

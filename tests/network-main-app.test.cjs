const TestUI=require('./browser-origin.cjs');
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath,launchTestBrowser,phoneProfile}=require('../scripts/codex/browser.cjs');
const root=process.env.PLAYROOM_NETWORK_FIXTURE||path.resolve(__dirname,'..');
const installed=fs.readdirSync(root).find(name=>/^installed-packs(?:\.[a-f0-9]+)?\.js$/.test(name));
const hasUno=!!installed&&/"id"\s*:\s*"uno"/.test(fs.readFileSync(path.join(root,installed),'utf8'));

function server(){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),rel=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
  });return new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve({s,url:'http://127.0.0.1:'+s.address().port+'/'})));
}
async function profile(page,name){if(!page._onlineFixture){await require('./account-sync-fixture.cjs').installFetch(page.context(),async route=>route.fulfill({json:{}}));await page.context().route(/https:\/\/[^/]+\.supabase\.co\//,route=>route.abort());}await page.goto(page._url);await page.locator('#profile-form [name=playerName]').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();await page.evaluate(()=>{for(const game of PlayroomAppBridge.packs.list())PlayroomFirstTurnGuide.setEnabled(game.id,false);});}
async function value(page,selector){return page.locator(selector).inputValue();}
const active=TestUI.activeSurface;
async function textReceive(page){const receive=active(page).locator('[role=tab][data-nearby-direction=receive]');if(await receive.count()&&!await receive.isDisabled())await receive.click();await active(page).locator('[role=tab][data-nearby-method=text]').click();}
async function closeSettings(page){await active(page).locator('.modal-head [data-command=close-modal]').click();if(await active(page).locator('[data-game-menu-close]').count())await active(page).locator('.modal-head [data-game-menu-close]').click();}
async function ownProfile(page,name){const id=await page.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);await active(page).locator('[data-room-person="'+id+'"]').click();await active(page).locator('[data-command=profile-edit]').click();if(name!==undefined){await page.locator('#local-profile-editor [name=nickname]').fill(name);await active(page).locator('[type=submit][form=local-profile-editor],#local-profile-editor [type=submit]').click();await page.locator('#local-profile-editor').waitFor({state:'detached'});await active(page).locator('.modal-head [data-command=close-modal]').click();}}
async function savedAction(page,selector,id,status='active'){await page.locator('[data-hub-page=sessions]').click();await page.locator('[data-saved-status="'+status+'"]').click();await page.locator('.saved-game[data-network-session-id="'+id+'"]').click();await active(page).locator(selector).click();}
async function gameAction(page,command){if(!await active(page).locator('.game-menu-panel').count())await page.locator('[data-game-menu]').click();await active(page).locator('[data-game-menu-action][data-command="'+command+'"]').click();}

const invitationGuestEngine=process.env.PLAYROOM_TEST_BROWSER||'chromium';
const invitationHostEngines=process.env.PLAYROOM_TEST_BROWSER?['chromium','webkit']:['chromium'];
for(const hostEngine of invitationHostEngines)test('mobile invitation tolerates duplicate replies ('+hostEngine+' host, '+invitationGuestEngine+' guest)',{timeout:55000},async t=>{
 const origin=await TestUI.serveBrowserFixture(root);
 t.after(()=>origin.close());
 const hostBrowser=await launchTestBrowser(hostEngine);
 t.after(()=>hostBrowser.close());
 const guestBrowser=hostEngine===invitationGuestEngine?hostBrowser:await launchTestBrowser(invitationGuestEngine);
 if(guestBrowser!==hostBrowser)t.after(()=>guestBrowser.close());
 t.diagnostic('RTC host '+hostBrowser.browserType().name()+' '+hostBrowser.version()+
   '; guest '+guestBrowser.browserType().name()+' '+guestBrowser.version());
 const artifact=process.env.PLAYROOM_TEST_ARTIFACT;
 const html=artifact?fs.readFileSync(artifact):null;
 const issues=[];
 async function phone(browser,engine,name){
  const options=phoneProfile(engine);
  if(engine==='chromium')options.playroomProfile=false;
  const context=await browser.newContext(options);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!==new URL(origin.url).origin)return route.abort();
   if(html&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   return route.continue();
  });
  await context.addInitScript(()=>{
   const nativeAnswer=RTCPeerConnection.prototype.setRemoteDescription;
   const observations=window.invitationObservations={answers:[],toastErrors:[]};
   RTCPeerConnection.prototype.setRemoteDescription=function(description){
    if(description.type==='answer')observations.answers.push(this.signalingState);
    return nativeAnswer.call(this,description);
   };
   document.addEventListener('DOMContentLoaded',()=>{
    const toast=document.querySelector('#toast');
    const noInvite=PlayroomMessages.text('ui.network-ui.f7eb06f83d1f');
    if(toast)new MutationObserver(()=>{
     if(/wrong state|setRemoteDescription/i.test(toast.textContent)||toast.textContent===noInvite)
      observations.toastErrors.push(toast.textContent);
    }).observe(toast,{subtree:true,childList:true,characterData:true});
   },{once:true});
  });
  const page=await context.newPage();page._url=origin.url;page.setDefaultTimeout(12000);
  page.on('pageerror',error=>issues.push(error.message));
  await profile(page,name);
  return page;
 }
 const host=await phone(hostBrowser,hostEngine,'Хост');
 const guest=await phone(guestBrowser,invitationGuestEngine,'Гость');
 await TestUI.openGame(host,'tictactoe','network');
 await host.locator('[data-room-auto-start]').uncheck();
 await host.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});
  bridge.renderLobby();
 });
 await host.locator('#network-pair-button').tap();
 const offer=host.locator('#net-host-token');
 await offer.waitFor({state:'attached'});
 await guest.locator('#network-join-button').tap();
 await guest.locator('[data-lobby-online=manual]').tap();
 await textReceive(guest);
 await guest.locator('#net-client-offer textarea').fill(await offer.inputValue());
 await guest.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
 const reply=guest.locator('#net-client-token');
 await reply.waitFor({state:'attached'});
 await textReceive(host);
 const form=host.locator('#net-host-answer');
 const answerLink=await reply.inputValue();
 await form.locator('textarea').fill(answerLink);
 // Two delivered replies share the same real RTC offer, including the window
 // in which the first setRemoteDescription is still pending.
 await form.evaluate(node=>{node.requestSubmit();node.requestSubmit();});
 await guest.locator('#net-client-join').evaluate(node=>node.requestSubmit());
 await guest.locator('.lobby-shell').waitFor();
 await guest.locator('[data-net-seat]:not([disabled])').first().tap();
 await host.locator('.room-v021-person-copy').filter({hasText:'Гость'}).waitFor();
 assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1);
 await host.evaluate(async link=>{
  const token=PlayroomPairing.extract(link);
  navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}}));
  await new Promise(requestAnimationFrame);
 },answerLink);
 assert.deepEqual(await host.evaluate(()=>invitationObservations),{answers:['have-local-offer'],toastErrors:[]});
 await host.locator('[data-command=lobby-ready]').tap();
 await guest.locator('[data-net-action=ready]').tap();
 await host.locator('[data-command=lobby-start]:not([disabled])').tap();
 await host.locator('.network-game[data-viewer="0"]').waitFor();
 await guest.locator('.network-game[data-viewer="1"]').waitFor();
 const actor=await host.locator('.sdk-mark-cell:not([disabled])').count()?host:guest;
 await actor.locator('.sdk-mark-cell:not([disabled])').first().tap();
 for(const page of [host,guest])
  await page.locator('.sdk-mark-cell .mark-token-art').waitFor();
 assert.deepEqual(issues,[]);
});

for(const scenario of ['games','wins','score','handoff','handoff-return','handoff-reload','handoff-close','handoff-active'])test(`main app: WebRTC series keeps the same room and counts each result once (${scenario})`,{timeout:90000},async t=>{
 const activeHandoff=scenario==='handoff-active';
 const handoff=scenario.startsWith('handoff')&&!activeHandoff,handoffReturn=scenario==='handoff-return',handoffReload=scenario==='handoff-reload',handoffClose=scenario==='handoff-close';
 const mode=handoff||activeHandoff?'games':scenario;
 const restart=mode==='wins',usesPoints=mode==='score',game=usesPoints?'dice-poker':'tictactoe',target=usesPoints?24:2;
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath()});
 t.after(async()=>{await browser.close();await new Promise(resolve=>s.close(resolve));});
 const errors=[];
 async function player(name,width){
  const context=await browser.newContext({playroomProfile:false,viewport:{width,height:844},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  const page=await context.newPage();page._url=url;page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  await profile(page,name);
  await observe(page);
  return page;
 }
 function observe(page){return page.evaluate(gameId=>{
   PlayroomFirstTurnGuide.setEnabled(gameId,false);
   const prototype=PlayroomClientConnectionService.prototype,accept=prototype.accept;
   prototype.accept=function(frame,...args){
    if(frame?.kind==='snapshot'&&frame.game===gameId){
     window.seriesFrame=frame;window.seriesTransport=this.transport;
    }
    return accept.call(this,frame,...args);
   };
  },game);}
 async function join(guest,host,{resume=false}={}){
  await host.evaluate(()=>PlayroomNetworkLibrary.showManualInvite());
  await host.waitForFunction(()=>document.querySelector('#net-host-token')?.value);
  await guest.evaluate(()=>PlayroomNetworkLibrary.showManualJoin());
  await active(guest).locator('[data-nearby-method=text]').click();
  await guest.locator('#net-client-offer textarea[name=offer]').fill(await value(host,'#net-host-token'));
  await guest.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
  await guest.waitForFunction(()=>document.querySelector('#net-client-token')?.value);
  await textReceive(host);
  await host.locator('#net-host-answer textarea[name=answer]').fill(await value(guest,'#net-client-token'));
  await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
  if(!resume){
   await guest.locator('#net-client-join').evaluate(form=>form.requestSubmit());
   await guest.locator('[data-net-seat]:not([disabled])').first().click();
  }
  await guest.locator('.lobby-shell').waitFor();
  await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());
 }
 async function openResult(page,id){
  await page.locator('[data-hub-page=sessions]').click();
  await page.locator('[data-saved-status=history]').click();
  await page.locator('.saved-game[data-network-session-id="'+id+'"]').click();
  await active(page).locator('[data-network-results="'+id+'"]').click();
  await active(page).locator('[data-series-result]').waitFor();
 }
 async function transfer(outgoing,incoming){
  const id=await incoming.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);
  await outgoing.locator('[data-room-person="'+id+'"]').click();
  await outgoing.locator('[data-profile-transfer]').click();
  await incoming.locator('[data-host-offer-open]').click();
  await active(incoming).locator('[data-host-offer-accept]').click();
  await incoming.waitForFunction(id=>PlayroomAppBridge.room()?.ownerId===id,id);
  await outgoing.waitForFunction(id=>PlayroomNetworkLibrary.transferClient()?.room.ownerId===id,id);
  assert.equal(await outgoing.evaluate(()=>Object.hasOwn(PlayroomNetworkLibrary.transferClient().room,'seriesProgress')),false);
 }
 const [host,guest]=await Promise.all([player('Анна',1000),player('Борис',390)]);
 await TestUI.openGame(host,game,'network');
 await host.locator('[data-room-auto-start]').uncheck();
 await host.evaluate(usesPoints=>{
  const b=PlayroomAppBridge,r=b.room();
  b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});
  if(usesPoints){
   b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,maxRounds:'3'}});
   const create=TabletopCore.createGame;
   TabletopCore.createGame=(id,options)=>create(id,id==='dice-poker'?{...options,seed:17}:options);
  }
  b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});
  b.renderLobby();
 },usesPoints);
 await host.locator('.room-v021-series>summary').click();
 await host.locator('[data-series-mode]').selectOption(mode);
 await host.locator('[data-series-target]').fill(String(target));
 await host.locator('[data-series-target]').press('Tab');

 await join(guest,host);
 const room=await host.evaluate(()=>PlayroomAppBridge.room().id),sessions=[],scores=[0,0];
 const participantId=await guest.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);
 let roomHost=host,client=guest,seriesPackVersion;
 for(let match=1;match<=2;match++){
  assert.equal(await client.locator('.lobby-shell').getAttribute('data-room-id'),room);
  assert.match(await client.locator('.room-v021-series').innerText(),new RegExp(String(target)));
  await roomHost.locator('[data-command=lobby-ready]').click();
  await client.locator('[data-net-action=ready]').click();
  await roomHost.locator('[data-command=lobby-start]:not([disabled])').click();
  await client.waitForFunction(previous=>window.seriesFrame?.sessionId&&window.seriesFrame.sessionId!==previous,sessions.at(-1)??null);
  const start=await client.evaluate(()=>({id:window.seriesFrame.sessionId,version:window.seriesFrame.packVersion,revision:window.seriesFrame.revision}));
  seriesPackVersion??=start.version;
  assert.equal(start.version,seriesPackVersion);
  assert.equal(start.revision,0);sessions.push(start.id);
  if(match===2&&handoffReturn){
   const current=await client.evaluate(async room=>{
    const credential=new PlayroomIdentityStore.ResumeStore().load(room);
    if(!credential)return null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credential.token));
    return {participantId:credential.participantId,digest:Array.from(new Uint8Array(digest))};
   },room);
   assert.equal(current?.participantId,participantId);
   const tokensMatch=await roomHost.evaluate(async({sessions,current})=>{
    const store=PlayroomNetworkLibrary.transferStore;
    const saved=await Promise.all(sessions.map(id=>store.readPrivate(id)));
    const tokens=saved.map(({record})=>record.recovery.tokens.find(row=>row.participantId===current.participantId)?.token);
    if(!tokens[0]||!tokens[1]||tokens[0]===tokens[1])return false;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokens[1]));
    return new Uint8Array(digest).every((value,index)=>value===current.digest[index]);
   },{sessions,current});
   assert.equal(tokensMatch,true,'the next journal keeps the new lobby resume credential when hosting returns');
  }
  if(usesPoints){
   let revision=0;
   for(const key of ['chance','ones','twos'])for(const page of [host,guest]){
    await page.locator('[data-sdk-dice-port] .sdk-score-roll').click();
    await guest.waitForFunction(value=>window.seriesFrame?.revision===value,++revision);
    await page.locator('[data-score-row='+key+'] button').click();
    await active(page).locator('[data-command=confirm-action]').click();
    await guest.waitForFunction(value=>window.seriesFrame?.revision===value,++revision);
   }
   const points=await guest.evaluate(()=>window.seriesFrame.state.result.metrics.find(metric=>metric.id==='points').values);
   assert.deepEqual(points,[23,19]);
   points.forEach((value,player)=>{scores[player]+=value;});
  }else for(const [index,cell] of [0,3,1,4,2].entries()){
   const actor=index%2?guest:host,button=actor.locator('.sdk-mark-cell').nth(cell);
   await button.click();
   await client.waitForFunction(revision=>window.seriesFrame?.revision===revision,index+1);
   if(activeHandoff&&match===2&&index===1){
    const before=await roomHost.evaluate(()=>{
     const context=PlayroomNetworkLibrary.transferContext();
     return {room:context.room.id,seats:context.room.seats.map(seat=>seat.participantId)};
    });
    const previousTransport=await roomHost.evaluateHandle(()=>window.seriesTransport);
    await roomHost.evaluate(()=>PlayroomHostTransferUI.show());
    await active(roomHost).locator('[data-host-transfer-target]').click();
    await client.locator('[data-host-offer-open]').click();
    await active(client).locator('[data-host-offer-accept]').click();
    await client.waitForFunction(()=>PlayroomNetworkLibrary.transferContext()?.kind==='game');
    assert.deepEqual(await client.evaluate(()=>{
     const context=PlayroomNetworkLibrary.transferContext();
     return {room:context.room.id,seats:context.room.seats.map(seat=>seat.participantId),owner:context.room.ownerId,session:context.sessionId};
    }),{...before,owner:participantId,session:start.id});
    await roomHost.waitForFunction(previous=>PlayroomNetworkLibrary.transferClient()&&window.seriesTransport!==previous,previousTransport);
    await previousTransport.dispose();
    [roomHost,client]=[client,roomHost];
    assert.deepEqual(await client.evaluate(()=>{
     const frame=window.seriesFrame;
     return {session:frame.sessionId,version:frame.packVersion,revision:frame.revision,viewer:frame.viewer};
    }),{session:start.id,version:start.version,revision:2,viewer:0});
   }
  }
  if(!usesPoints)scores[0]++;
  for(const page of [host,guest]){
   const result=active(page).locator('[data-series-result]');await result.waitFor();
   assert.deepEqual((await result.locator('dd').allTextContents()).map(Number),scores);
   assert.match(await result.innerText(),new RegExp('Сыграно партий: '+match));
   assert.equal(await result.locator('[data-series-leader]').count(),match===2?1:0);
  }
  const frame=await client.evaluate(()=>window.seriesFrame);
  assert.equal(frame.packVersion,start.version);
  assert.deepEqual(frame.state.matchSeriesResult.rules,{mode,target});
  assert.equal(frame.state.matchSeriesResult.complete,match===2);
  assert.deepEqual(Object.keys(frame.state.matchSeriesResult).sort(),['complete','played','rows','rules']);
  assert.deepEqual(Object.keys(frame.state.matchSeriesResult.rows[0]).sort(),['leader','player','value']);
  if(match===1&&restart){
   await Promise.all([host.reload(),guest.reload()]);
   await observe(host);await observe(guest);
   const fence='playroom.lobby-fence.v1.'+room;
   await host.evaluate(({fence,id})=>PlayroomData.transact(()=>PlayroomData.setItem(fence,JSON.stringify({seriesSessionId:id}))),{fence,id:sessions[0]});
   await openResult(host,sessions[0]);
   assert.equal(await active(host).locator('[data-command=continue-series]').count(),0,'a fenced predecessor stays read-only');
   await active(host).locator('[data-command=home]').click();
   await host.evaluate(key=>PlayroomData.transact(()=>PlayroomData.removeItem(key)),fence);
   await openResult(host,sessions[0]);
   await active(host).locator('[data-command=continue-series]').click();
   await host.locator('.lobby-shell').waitFor();
   await join(guest,host,{resume:true});
   assert.equal(await guest.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId),participantId);
  }else if(match===1&&handoff){
   await active(host).locator('[data-command=rematch]').click();
   await active(guest).locator('[data-command=rematch]').click();
   await guest.locator('[data-net-action=ready]').waitFor();
   const roster=await host.evaluate(()=>PlayroomAppBridge.room().seats.map(seat=>seat.participantId));
   await transfer(host,guest);
   assert.deepEqual(await guest.evaluate(()=>PlayroomAppBridge.room().seats.map(seat=>seat.participantId)),roster);
   if(handoffClose){
    await active(guest).locator('[data-room-context]').click();
    await active(guest).locator('[data-command=lobby-leave]').click();
    await active(guest).locator('[data-confirm-accept]').click();
    await guest.waitForFunction(()=>PlayroomAppBridge.room()===null);
    await guest.reload();
    await guest.locator('[data-start=tictactoe]').waitFor();
    const saved=await guest.evaluate(()=>PlayroomNetworkLibrary.transferStore.listLobbyHandoffs(PlayroomAppBridge.profile().id));
    assert.deepEqual(saved,[],'a deliberately closed lobby has no checkpoint to reopen');
    assert.deepEqual(errors,[]);
    return;
   }
   if(handoffReturn){
    await transfer(guest,host);
    assert.deepEqual(await host.evaluate(()=>PlayroomAppBridge.room().seats.map(seat=>seat.participantId)),roster);
   }else{
    [roomHost,client]=[guest,host];
    if(handoffReload){
     const previousActor=await client.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);
     const name='Серия после передачи';
     await roomHost.evaluate(name=>{
      const b=PlayroomAppBridge,r=b.room();
      b.roomService.configure(r.id,r.ownerId,{name});
      b.renderLobby();
     },name);
     await roomHost.waitForFunction(async({room,name})=>{
      const checkpoints=await PlayroomNetworkLibrary.transferStore.listLobbyHandoffs(PlayroomAppBridge.profile().id);
      return checkpoints.some(record=>record.roomId===room&&record.payload.lobby.recovery.room.name===name);
     },{room,name});
     await Promise.all([roomHost.reload(),client.reload()]);
     await Promise.all([observe(roomHost),observe(client)]);
     await roomHost.waitForFunction(id=>globalThis.PlayroomAppBridge?.room()?.id===id,room);
     assert.deepEqual(await roomHost.evaluate(()=>{
      const r=PlayroomAppBridge.room();return {name:r.name,seats:r.seats.map(seat=>seat.participantId)};
     }),{name,seats:roster});
     await join(client,roomHost,{resume:true});
     assert.equal(await client.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId),previousActor);
    }
   }
  }else if(match===1){
   const eager=await active(host).locator('[data-command=rematch]').evaluate(button=>{
    const prototype=SessionAuthority.prototype,original=prototype._snapshot;
    let count=0;
    prototype._snapshot=function(viewer,index,...rest){
     if(index!==undefined)count++;
     return original.call(this,viewer,index,...rest);
    };
    try{button.click();return count;}finally{prototype._snapshot=original;}
   });
   assert.equal(eager,0,'returning to the lobby does not project history eagerly');
   const history=await guest.evaluate(async()=>{
    const single=await window.seriesTransport.history(0),range=await window.seriesTransport.historyRange(0,2);
    const describe=frame=>({sessionId:frame.sessionId,revision:frame.revision,viewer:frame.viewer,kind:frame.kind,actions:frame.actions??[]});
    return {single:describe(single),range:range.frames.map(describe)};
   });
   const expected={sessionId:start.id,viewer:1,revision:0,kind:'history',actions:[]};
   assert.deepEqual(history,{single:expected,range:[expected,{...expected,revision:1}]});
   await active(guest).locator('[data-command=rematch]').click();
   await guest.locator('[data-net-action=ready]').waitFor();
  }else{
   await active(client).locator('[data-command=result-replay]').click();
   await client.locator('#replay-range').waitFor();
   const activeGameControl=usesPoints?'.sdk-score-roll:not([disabled]):visible':'.sdk-mark-cell:not([disabled])';
   assert.equal(await client.locator(activeGameControl).count(),0);
  }
 }
 assert.notEqual(sessions[0],sessions[1]);
 if(handoff||activeHandoff){
  // A later transfer in the same room can replace the old room-level key.
  await host.evaluate(key=>PlayroomData.transact(()=>PlayroomData.removeItem(key)),'playroom.lobby-fence.v1.'+room);
  await host.reload();
  await openResult(host,sessions[0]);
  assert.equal(await active(host).locator('[data-command=continue-series]').count(),0,'only the current host can continue an already handed-off series');
  if(handoffReload){
   await roomHost.reload();
   await openResult(roomHost,sessions[1]);
   assert.equal(await roomHost.evaluate(()=>PlayroomAppBridge.room()),null,'the journal of the started match supersedes the transferred lobby');
  }
 }else if(restart||usesPoints){
  await host.reload();await openResult(host,sessions[usesPoints?1:0]);
  assert.equal(await active(host).locator('[data-command=continue-series]').count(),0,'a prior result cannot branch the series');
 }
 assert.deepEqual(errors,[]);
});

test('main app: sealed choices and host deadline over WebRTC with a public Table',{timeout:90000},async t=>{
 const pack=process.env.PLAYROOM_SDK_SEALED_SIGNAL_PACK;
 if(!pack){t.skip('Use the compiled sealed-signal SDK example');return;}
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath()});
 t.after(async()=>{await browser.close();await new Promise(resolve=>s.close(resolve));});
 const errors=[];
 async function participant(name,width){
  const context=await browser.newContext({playroomProfile:false,viewport:{width,height:844},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  const page=await context.newPage();page._url=url;
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await profile(page,name);
  await page.locator('[data-hub-page=profile]').click();
  await page.locator('#hub-profile-page [data-command=packs]').click();
  const dialog=active(page);
  await dialog.locator('#pack-file').setInputFiles(pack);
  await dialog.locator('[data-pack-install]').click();
  await dialog.locator('[data-installed-pack][data-pack-id=sealed-signal]').waitFor();
  await dialog.locator('.modal-head [data-command=close-modal]').click();
  await page.locator('[data-hub-page=games]').click();
  await observeFrames(page);
  return page;
 }
 async function observeFrames(page){
  await page.evaluate(()=>{
   window.signalFrames=new Map();
   const service=PlayroomClientConnectionService.prototype,accept=service.accept;
   service.accept=function(frame,...args){
    if(frame?.game==='sealed-signal'&&frame.kind==='snapshot'){window.signalClient=this;signalFrames.set(frame.revision,frame);}
    return accept.call(this,frame,...args);
   };
  });
 }
 const [host,phone,table]=await Promise.all([participant('Ведущий',1000),participant('Игрок',390),participant('Стол',620)]);
 await TestUI.openGame(host,'sealed-signal','network');
 await host.locator('[data-room-auto-start]').uncheck();
 async function join(page,{resume=false}={}){
  await host.evaluate(()=>PlayroomNetworkLibrary.showManualInvite());
  await host.locator('#net-host-token').waitFor({state:'attached'});
  const offer=await value(host,'#net-host-token');
  await page.evaluate(()=>PlayroomNetworkLibrary.showManualJoin());
  await active(page).locator('[data-nearby-method=text]').click();
  await page.locator('#net-client-offer textarea[name=offer]').fill(offer);
  await page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('#net-client-token')?.value);
  await textReceive(host);
  await host.locator('#net-host-answer textarea[name=answer]').fill(await value(page,'#net-client-token'));
  await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
  if(resume){await page.locator('.table-shell.network-game').waitFor();return;}
  await page.locator('#net-client-join').waitFor();
  await page.locator('#net-client-join').evaluate(form=>form.requestSubmit());
  await page.locator('.lobby-shell').waitFor();
  await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());
 }
 await join(phone);
 await phone.locator('[data-net-seat]:not([disabled])').first().click();
 await join(table);
 const spectator=await table.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);
 await active(table).locator('[data-room-person="'+spectator+'"]').click();
 await active(table).locator('[data-net-action=table]').click();
 await active(table).locator('.modal-head [data-command=close-modal]').click();
 await host.waitForFunction(()=>PlayroomAppBridge.room().participants.some(person=>person.role==='table'));
 await host.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.configure(room.id,room.ownerId,{firstPlayerMode:'assigned',firstParticipantId:room.ownerId});
  bridge.renderLobby();
 });
 await host.locator('[data-command=lobby-ready]').click();
 await phone.locator('[data-net-action=ready]').click();
 await host.clock.install();
 await host.locator('[data-command=lobby-start]:not([disabled])').click();
 const pages=[host,phone,table],prompt=page=>page.locator('.network-game .sdk-prompt');
 await Promise.all(pages.map(page=>prompt(page).filter({hasText:'готовы 0 из 2'}).waitFor()));
 const choice=(page,label)=>page.locator('.network-game').getByRole('button',{name:label,exact:true});
 assert.equal(await choice(table,'Взять').count(),0);
 assert(await phone.evaluate(()=>{const first=signalFrames.get(0);return first.viewer!==first.state.turn;}),'the second seat can choose before the assigned first player');
 await choice(phone,'Взять').click();
 await Promise.all(pages.map(page=>page.waitForFunction(()=>signalFrames.has(1))));
 const at=async(page,revision)=>page.evaluate(revision=>{
  const frame=signalFrames.get(revision),data=frame.state.sdkProjection?.data??frame.state.modelProjection?.data;
  return {viewer:frame.viewer,role:frame.role,data,actions:frame.actions.map(action=>action.type),
   events:frame.events.filter(event=>event.type?.startsWith('signal.')).map(({type,params})=>({type,params}))};
 },revision);
 const [owner,privatePlayer,publicTable]=await Promise.all(pages.map(page=>at(page,1)));
 assert.equal(privatePlayer.data.selected,'claim');
 for(const frame of [owner,publicTable]){
  assert.equal(frame.data.selected,null);
  assert.equal(frame.data.reveal,null);
  assert.deepEqual(Object.keys(frame.data).sort(),['deadline','die','reveal','selected','startedAt']);
  assert.deepEqual(frame.events,[{type:'signal.committed',params:{}}]);
 }
 assert.equal(publicTable.role,'table');
 assert.equal(publicTable.viewer,-1);
 assert.deepEqual(publicTable.actions,[]);
 const member=await phone.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);
 await phone.reload({waitUntil:'domcontentloaded'});
 await TestUI.ready(phone);
 await observeFrames(phone);
 await join(phone,{resume:true});
 await phone.waitForFunction(()=>signalFrames.has(1));
 assert.equal(await phone.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId),member);
 assert.deepEqual(await at(phone,1),privatePlayer,'resume restores the same private viewer and already accepted decision');
 await host.clock.fastForward(21000);
 await Promise.all(pages.map(page=>page.waitForFunction(()=>signalFrames.has(2))));
 const finals=await Promise.all(pages.map(page=>at(page,2)));
 const result=finals[0].data.reveal,actor=privatePlayer.viewer;
 assert.deepEqual(result,{choices:actor===0?['claim',null]:[null,'claim'],scores:actor===0?[owner.data.die,0]:[0,owner.data.die],reason:'timeout'});
 for(const frame of finals)assert.deepEqual(frame.events.filter(event=>event.type==='signal.revealed'),[{type:'signal.revealed',params:result}]);
 await Promise.all(pages.map(page=>prompt(page).filter({hasText:'Раскрытие:'}).waitFor({state:'attached'})));
 await host.clock.fastForward(21000);
 assert.deepEqual(await Promise.all(pages.map(page=>page.evaluate(()=>Math.max(...signalFrames.keys())))),[2,2,2]);
 await Promise.all([phone,table].map(async page=>{
  await active(page).locator('[data-command=result-replay]').click();
  const slider=page.locator('#replay-range');
  await prompt(page).filter({hasText:'готовы 0 из 2'}).waitFor();
  await page.evaluate(()=>{
   // Read this revision through the transport, even when a live frame or
   // background history backfill has already populated the local cache.
   const client=signalClient,read=client.readHistory,transport=client.transport,history=transport.history;
   client.historyFrames.delete(1);
   client.readHistory=(index,...args)=>index===1?null:read?.(index,...args);
   client.transport={...transport,async history(index){
    const frame=await history.call(this,index);
    if(index===1)window.signalHistoryFrame=frame;
    return frame;
   }};
  });
  await slider.focus();await slider.press('ArrowRight');
  await page.waitForFunction(()=>!!window.signalHistoryFrame);
  await page.waitForFunction(()=>document.querySelector('.network-game')?.dataset.revision==='1');
  const history=await page.evaluate(()=>{
   const f=signalHistoryFrame,p=f.state.sdkProjection??f.state.modelProjection;
   return {viewer:f.viewer,revision:f.revision,kind:f.kind,selected:p.data.selected,reveal:p.data.reveal,actions:f.actions};
  });
  const player=page===phone;
  assert.deepEqual(history,{viewer:player?actor:-1,revision:1,kind:'history',selected:player?'claim':null,reveal:null,actions:[]});
  assert.match(await prompt(page).innerText(),player?/Ваш выбор: Взять/:/готовы 1 из 2/);
  assert.equal(await choice(page,'Взять').count(),0);
  await slider.press('End');
  await prompt(page).filter({hasText:'Раскрытие:'}).waitFor();
 }));
 assert.deepEqual(errors,[]);
});

test('main app: public Table over WebRTC shares moves with a player without gaining private viewer rights',{timeout:90000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),tc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),pc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});
 const host=await hc.newPage(),table=await tc.newPage(),phone=await pc.newPage(),errors=[];host._url=url;table._url=url;phone._url=url;
 for(const page of [host,table,phone]){page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));}
 try{
  await profile(host,'Анна');await profile(table,'Стол');await profile(phone,'Борис');
  await TestUI.openGame(host,'tictactoe','network');await host.locator('[data-room-auto-start]').uncheck();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  async function join(page){
   await host.locator('#network-pair-button').click();await host.locator('#net-host-token').waitFor({state:'attached'});
   const offer=await value(host,'#net-host-token');
   await page.locator('#network-join-button').click();await page.locator('[data-lobby-online=manual]').click();await textReceive(page);await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
   await page.locator('#net-client-token').waitFor({state:'attached'});
   await textReceive(host);await host.locator('#net-host-answer textarea[name=answer]').fill(await value(page,'#net-client-token'));await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(form=>form.requestSubmit());
   await page.locator('.lobby-shell').waitFor();
  }
  await join(phone);await phone.locator('[data-net-seat]:not([disabled])').first().click();await join(table);
  await phone.locator('.lobby-avatar-wrap[data-quick-reaction]').click();await phone.locator('[data-quick-emoji=":nice:"]').click();await host.locator('.avatar-message-bubble').filter({hasText:':nice:'}).waitFor();
  if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await host.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'lobby-reaction.png')});}
  await phone.locator('[data-room-person]').filter({hasText:'Борис'}).click();await phone.locator('[data-command=profile-edit]').click();await phone.locator('[data-local-profile-avatar]').click();await phone.locator('[data-avatar-option=star-yellow]').click();await active(phone).locator('[type=submit][form=local-profile-editor],#local-profile-editor [type=submit]').click();
  await host.waitForFunction(()=>PlayroomAppBridge.room().participants.some(p=>p.nickname==='Борис'&&p.avatar==='star-yellow'));await active(phone).locator('.modal-head [data-command=close-modal]').click();
  await active(phone).locator('.modal-head [data-net-action=dismiss-room]').click();await TestUI.openSettings(phone);await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'room',id:'missed-in-settings',body:'Сообщение, пока открыты настройки'}));
  await phone.evaluate(()=>PlayroomChatActivity.poll());assert.equal((await phone.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'}))).room,1);
  await closeSettings(phone);await phone.locator('[data-hub-page=games]').click();await phone.locator('#network-join-button').click();await phone.bringToFront();await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'room',id:'seen-in-lobby',body:'Это видно в лобби'}));
  await phone.waitForFunction(async()=>{const s=await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'});return s.room===1;});await phone.evaluate(()=>PlayroomChatActivity.poll());await phone.locator('[data-room-chat-open] .chat-counter-messages').filter({hasText:'1'}).waitFor();
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'lobby-unread.png')});
  await phone.locator('[data-room-chat-open]').click();await phone.locator('[data-room-chat-messages]').filter({hasText:'открыты настройки'}).waitFor();await phone.waitForFunction(async()=>{const s=await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'});return s.room===0;});await phone.locator('.game-chat-panel [data-command=close-modal]').click();await phone.locator('.game-chat-panel').waitFor({state:'detached'});
  const tableParticipant=await table.evaluate(()=>PlayroomNetworkLibrary.inviteContext().participantId);await active(table).locator('[data-room-person="'+tableParticipant+'"]').click();await active(table).locator('[data-net-action=table]').click();await active(table).locator('.modal-head [data-command=close-modal]').click();
  await host.waitForFunction(()=>PlayroomAppBridge.room().participants.some(person=>!person.isHost&&person.role==='table'));
  await host.evaluate(()=>{
   const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});
   b.renderLobby();
  });
  await host.locator('[data-command=lobby-ready]').click();await phone.locator('[data-net-action=ready]').click();
  await host.locator('[data-command=lobby-start]:not([disabled])').click();
  await phone.locator('.network-game').waitFor();await phone.evaluate(()=>PlayroomNetworkLibrary.setAvatar('circle-blue'));
  await host.waitForFunction(()=>{const b=PlayroomAppBridge;return b.roomService.snapshot(b.room().id).participants.some(p=>p.nickname==='Борис'&&p.avatar==='circle-blue');});
  await phone.waitForFunction(()=>[...document.querySelectorAll('.player-avatar-wrap .avatar-art')].some(img=>img.getAttribute('src')===PlayroomAvatars.source('circle-blue')));
  assert.equal(await phone.locator('.network-game').count(),1,'cosmetic update keeps the live game mounted');
  await phone.locator('[data-quick-reaction]').click();assert.equal(await phone.locator('[data-quick-emoji]').count(),9);
  if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'game-reactions-picker.png')});}
  await phone.locator('[data-quick-emoji=":wow:"]').click();
  for(const page of [host,phone,table]){await page.locator('.quick-reaction-bubble').filter({hasText:':wow:'}).waitFor();assert.equal(await page.locator('.quick-reaction-bubble').getAttribute('data-reaction-player'),'1');}
  if(process.env.PLAYROOM_CAPTURE_DIR)await host.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'game-reaction-bubble.png')});
  assert.equal(await table.locator('[data-quick-reaction]').count(),0,'public Table cannot impersonate a player');
  await phone.locator('.quick-reaction-bubble').waitFor({state:'detached',timeout:3000});
  await host.locator('[data-quick-reaction]').click();await host.locator('[data-quick-emoji=":thanks:"]').click();await phone.locator('.quick-reaction-bubble').filter({hasText:':thanks:'}).waitFor();
  assert.equal(await host.locator('.game-frame-tools [data-command=history]').count(),0);
  const fieldBeforeChat=await host.locator('.scene').boundingBox();await host.evaluate(()=>window.chatSceneBefore=document.querySelector('.scene'));
  await host.locator('.game-frame-tools [data-room-chat-open]').click();
  await host.locator('.game-chat-panel').waitFor();assert.equal(await host.locator('#app').evaluate(e=>e.inert),false);assert.deepEqual(await host.locator('.scene').boundingBox(),fieldBeforeChat);assert(await host.evaluate(()=>chatSceneBefore===document.querySelector('.scene')));
  await host.locator('[data-game-chat-resize]').hover();const panelBefore=await host.locator('.game-chat-panel').boundingBox();const grip=await host.locator('[data-game-chat-resize]').boundingBox();await host.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await host.mouse.down();await host.mouse.move(grip.x+grip.width/2-80,grip.y+grip.height/2,{steps:5});await host.mouse.up();assert((await host.locator('.game-chat-panel').boundingBox()).width>panelBefore.width+50,JSON.stringify({before:panelBefore,after:await host.locator('.game-chat-panel').boundingBox(),grip}));assert.deepEqual(await host.locator('.scene').boundingBox(),fieldBeforeChat);
  await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Черновик панели');await host.locator('.game-chat-panel [data-command=close-modal]').click();await host.locator('.game-chat-panel').waitFor({state:'detached'});await host.locator('.game-chat-launcher').click();assert.equal(await host.locator('[data-room-chat-form] [data-chat-editor]').innerText(),'Черновик панели');
await host.locator('[data-room-chat-messages]').filter({hasText:':wow:'}).waitFor();assert.equal(await host.locator('[data-room-chat-tabs]').isVisible(),false);
  await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Длинное сообщение комнаты. '.repeat(20));await host.locator('[data-room-chat-form] [type=submit]').click();
  await phone.locator('.room-message-bubble').waitFor();assert((await phone.locator('.room-message-bubble').boundingBox()).width<=230);assert.equal(await phone.locator('.room-message-bubble>span').evaluate(e=>getComputedStyle(e).webkitLineClamp),'2');assert((await phone.locator('.room-message-bubble').innerText()).endsWith('…'));
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'room-message-bubble.png')});
  await phone.bringToFront();await phone.evaluate(()=>PlayroomRoomChatUI.show());await phone.locator('[data-room-chat-messages]').filter({hasText:'Длинное сообщение комнаты.'}).waitFor();assert.equal(await phone.locator('.game-chat-panel').getAttribute('aria-label'),'Чат комнаты');assert.equal(await phone.evaluate(()=>PlayroomNetworkLibrary.chatContext().game.name),'Крестики-нолики','drawer retains the live game conversation');
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'room-chat-390.png'),animations:'disabled'});
  await phone.locator('[data-room-chat-content][data-reply-support=true]').waitFor();const parentMessage=phone.locator('.chat-message').filter({hasText:'Длинное сообщение комнаты.'}).last();const beforeReaction=await phone.locator('.chat-message').count();await parentMessage.locator('p').click();await phone.locator('[data-quick-emoji=":nice:"]').click();
  await parentMessage.locator('[data-chat-react-emoji=":nice:"][aria-pressed=true]').waitFor();assert.equal(await phone.locator('.chat-message').count(),beforeReaction,'attached reaction creates no extra message');await host.locator('[data-chat-react-emoji=":nice:"]').waitFor();
  await parentMessage.locator('p').click();await phone.locator('.quick-reaction-picker:not([inert]) [data-chat-message-action=reply]').click();await phone.locator('[data-chat-reply]:not([hidden])').waitFor();await phone.locator('[data-room-chat-form] [data-chat-editor]').fill('Ответ на сообщение');
  await phone.locator('.game-chat-panel [data-command=close-modal]').click();await phone.locator('.game-chat-panel').waitFor({state:'detached'});await phone.locator('.game-chat-launcher').click();assert.equal(await phone.locator('[data-room-chat-form] [data-chat-editor]').innerText(),'Ответ на сообщение');await phone.locator('[data-chat-reply]:not([hidden])').waitFor();
  await phone.locator('[data-room-chat-form] [type=submit]').click();const replied=host.locator('.chat-message').filter({hasText:'Ответ на сообщение'});await replied.locator('[data-chat-reply-jump]').waitFor();assert.match(await replied.locator('[data-chat-reply-jump]').innerText(),/Длинное сообщение комнаты/);await phone.locator('[data-chat-reply]').waitFor({state:'hidden'});
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'chat-reply-reactions.png'),animations:'disabled'});
  await host.bringToFront();await host.locator('.chat-message.mine .message-receipt.is-read').first().waitFor();
  await phone.locator('.game-chat-panel [data-command=close-modal]').click();await phone.locator('.game-chat-panel').waitFor({state:'detached'});await host.locator('.game-chat-panel [data-command=close-modal]').click();await host.locator('.game-chat-panel').waitFor({state:'detached'});
  // Identity can change while a read is in flight: neither its history nor resume may leak into the next owner.
  for(const changed of ['roomId','participantId']){
   await host.evaluate(changed=>{
    const live=PlayroomNetworkLibrary.chatContext();window.chatOwner={...live,roomId:'chat-lifecycle-'+changed,call:()=>new Promise(resolve=>window.finishOldChatRead=resolve)};
    PlayroomRoomChatUI.show({source:()=>window.chatOwner});window.restoreOldChat=PlayroomRoomChatUI.captureReturn();
   },changed);
   await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Черновик прежнего участника');
   await host.evaluate(changed=>{window.chatOwner={...window.chatOwner,[changed]:window.chatOwner[changed]+'-next'};document.querySelector('#app').append(document.createComment('context changed'));},changed);
   await host.locator('.game-chat-panel').waitFor({state:'detached'});
   await host.evaluate(()=>window.restoreOldChat());assert.equal(await host.locator('.game-chat-panel').count(),0,'old resume cannot reopen for another room/participant');
   await host.evaluate(()=>PlayroomRoomChatUI.show());
   await host.evaluate(()=>window.finishOldChatRead({messages:[{id:'late-old-read',seq:900,body:'STALE OLD OWNER',at:Date.now()}],older:false,through:0}));
   assert.equal(await host.locator('[data-room-chat-messages]').filter({hasText:'STALE OLD OWNER'}).count(),0,'late history cannot contaminate the current chat');
   assert.notEqual(await host.locator('[data-room-chat-form] [data-chat-editor]').innerText(),'Черновик прежнего участника');
   await host.locator('.game-chat-panel [data-command=close-modal]').click();await host.locator('.game-chat-panel').waitFor({state:'detached'});
  }
  const cell='.sdk-mark-cell',enabled=cell+':not([disabled])';
  await table.locator('.network-game[data-viewer="-1"] '+enabled).first().waitFor();
  await table.locator(cell).nth(4).click();await host.locator(cell+'.is-cross').waitFor();
  await phone.locator(enabled).first().waitFor();if(await phone.locator('[data-learning-choice=no]').isVisible())await phone.locator('[data-learning-choice=no]').click();await phone.locator(cell).nth(0).click();
  await host.locator(cell+':not(.is-cross) .mark-token-art').waitFor();
  await table.locator(enabled).first().waitFor();await table.locator(cell).nth(1).click();
  await table.waitForFunction(()=>document.querySelectorAll('.sdk-mark-cell.is-cross').length===2);
  assert.equal(await table.locator('.network-game').getAttribute('data-viewer'),'-1');
  assert.equal(await host.locator('.network-game').getAttribute('data-viewer'),'0');
  await table.locator('[data-game-menu]').click();await table.locator('[data-command=history]').click();await table.locator('#replay-range').waitFor();
  assert.equal(await table.locator(enabled).count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>s.close(resolve));}
});

test('main app: two browsers join UNO lobby, ready, countdown and share a move',{timeout:90000,skip:!hasUno},async()=>{
  const externalUrl=process.env.PLAYROOM_URL||'';
  const hosted=externalUrl?{s:null,url:externalUrl}:await server();
  const {s,url}=hosted,browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await cc.addInitScript(()=>{
    const RTC=window.RTCPeerConnection;window.qaRTCs=[];
    window.RTCPeerConnection=class extends RTC{constructor(...args){super(...args);qaRTCs.push(this);}};
  });
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;host.setDefaultTimeout(10000);client.setDefaultTimeout(10000);
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await profile(client,'Клиент');
    await host.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await client.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await TestUI.openGame(host,'uno','network');await host.locator('[data-room-auto-start]').uncheck();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});
    assert.equal(await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).autoStart),false);
    await active(host).locator('[data-room-context]').click();await host.locator('[data-room-title]').fill('Тестовая комната');
    await host.locator('[data-room-name-save]').click();
    await host.locator('.lobby-shell').waitFor();await host.locator('#network-pair-button').click();
    // Every ICE candidate supplied by the browser is visible in the IP selector;
    // manual choice remains available for browsers that hide interfaces behind mDNS.
    await host.locator('.nearby-advanced>summary').click();await host.locator('[data-net-scan="host"]').waitFor();
    assert.equal(await host.locator('[data-net-scan="host"]').count(),1);
    assert.ok(await host.locator('#acoustic-host-address option').count()>=1);
    assert.match((await host.locator('#acoustic-host-address').innerText()),/Ввести IPv4 вручную/);
    assert.equal(await host.locator('#acoustic-host-protocol').inputValue(),'fastest');

    assert.equal(await host.locator('#net-host-acoustic-send').count(),1,
      'The host must be able to send a sound invitation without microphone access');
    assert.equal(await host.locator('#net-host-acoustic-listen').count(),1,
      'Audio listening and playback are independent actions');

    const previousAddress=await host.locator('#acoustic-host-address').inputValue();
    const previousManual=await host.locator('#acoustic-host-manual').inputValue();
    assert.equal(await host.locator('#acoustic-host-manual').getAttribute('placeholder'),'Например: 192.168.1.100',
      'Manual IP placeholder is an example, not a detected network address');
    await host.locator('#acoustic-host-address').selectOption('manual');
    await host.locator('#acoustic-host-manual').fill('192.168.44.66');
    const manualLink=await value(host,'#net-host-token');
    const manualToken=await host.evaluate(link=>PlayroomPairing.extract(link),manualLink);
    assert.ok(manualToken.startsWith('PR3.'),'a manually chosen real IP must yield compact QR/link');
    const manualInfo=await host.evaluate(token=>PlayroomPairing.decode(token),manualToken);
    assert.equal(manualInfo.ip,'192.168.44.66');
    assert.ok(manualToken.length<200);
    assert.match(await host.locator('#acoustic-host-mode').innerText(),/компактное приглашение/);
    // A saved manual address remains a selectable, explicitly tagged option.
    await host.locator('[data-net-save-ip="host"]').click();
    assert.match(await host.locator('#acoustic-host-address').innerText(),/192.168.44.66/);
    assert.equal(await host.locator('#acoustic-host-address [data-saved-address="192.168.44.66"]').count(),1);
    assert.match(await host.locator('#acoustic-host-discovery').textContent(),/сохранённые IP: 1/i);
    if(previousAddress==='manual'){
      await host.locator('#acoustic-host-address').selectOption('manual');
      await host.locator('#acoustic-host-manual').fill(previousManual);
    }else await host.locator('#acoustic-host-address').selectOption(previousAddress);

    const offerLink=await value(host,'#net-host-token');
    const offerToken=await host.evaluate(link=>PlayroomPairing.extract(link),offerLink);
    assert.match(offerToken||'',/^PR[23]\./);
    assert.equal(await host.locator('#net-host-token-qr').count(),1);
    const pwaHandoff=new URL(url).protocol!=='file:';
    if(pwaHandoff){
      await client.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),offerToken);
    }else{
      await client.locator('#network-join-button').click();await client.locator('[data-lobby-online=manual]').click();await textReceive(client);
      await client.locator('#net-client-offer textarea[name=offer]').fill(offerLink);
      await client.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    }
    await client.locator('#net-client-token').waitFor({state:'attached'});
    const answerLink=await value(client,'#net-client-token');
    const answerToken=await client.evaluate(link=>PlayroomPairing.extract(link),answerLink);
    assert.match(answerToken||'',/^PR[23]\./);
    assert.equal(await client.locator('#net-client-token-qr').count(),1);
    if(pwaHandoff){
      await host.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),answerToken);
    }else{
      await textReceive(host);await host.locator('#net-host-answer textarea[name=answer]').fill(answerLink);
      await host.locator('#net-host-answer').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    }
    try{await host.locator('#net-host-answer').waitFor({state:'detached',timeout:12000});}
    catch(_){
      const diag=await host.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||''}));
      assert.fail('Host did not accept WebRTC answer: '+JSON.stringify(diag));
    }
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1,'repeated reply attaches exactly one peer');
    try{await client.locator('#net-client-join').waitFor({timeout:12000});}
    catch(_){
      const [clientDiag,hostDiag]=await Promise.all([
        client.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||'',network:globalThis.PlayroomNetworkDebug?.()})),
        host.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||'',network:globalThis.PlayroomNetworkDebug?.()}))
      ]);
      assert.fail('Client did not receive room preview after host accepted answer: '+JSON.stringify({client:clientDiag,host:hostDiag}));
    }
    assert.match(await active(client).locator('.modal').innerText(),/Тестовая комната/);
    assert.match(await active(client).locator('.modal').innerText(),/UNO/);
    assert.match(await active(client).locator('.modal').innerText(),/Объявление UNO/);
    assert.match(await active(client).locator('.modal').innerText(),/Объявление UNO[\s\S]*Вручную/);
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();

    assert.equal(await client.locator('[data-room-auto-start]').isDisabled(),true,'guest cannot change room auto-start');await client.locator('[data-net-action=parameters]').click();assert.equal(await client.locator('#room-rules-form').getAttribute('data-readonly'),'true');assert.equal(await client.locator('[type=submit][form=room-rules-form]').count(),0);await active(client).locator('.modal-head [data-command=close-modal]').click();
    await client.locator('[data-net-action=rules]').click();
    assert.equal(await client.locator('.modal .rulebook-config').count(),1);
    assert(await client.locator('.modal .rulebook-main').innerText().then(text=>text.length>100));
    assert.match(await client.locator('.modal .rulebook-config').innerText(),/Объявление UNO[\s\S]*Вручную/);
    await active(client).locator('.modal-head [data-command=close-modal]').click();
    await ownProfile(client,'Клиент новый');await host.locator('.room-v021-person-copy').filter({hasText:'Клиент новый'}).waitFor();
    assert.equal(await client.evaluate(()=>document.querySelector('#app').inert),true,'nickname ACK preserves native lobby modal inert');
    await ownProfile(client,'Клиент');

    const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();
    await host.locator('.room-v021-person-copy').filter({hasText:'Клиент'}).waitFor();
    if(process.env.PLAYROOM_CAPTURE_DIR){
      fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});
      await host.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'host-lobby-1000.png')});
      for(const width of [390,320]){await client.setViewportSize({width,height:740});await client.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'player-lobby-'+width+'.png')});assert(await client.locator('.lobby-shell').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'player lobby fits viewport');}
      await client.setViewportSize({width:390,height:740});
    }
    if(await client.locator('.shared-modal-backdrop [data-command=rematch]').count())await client.locator('.shared-modal-backdrop [data-command=rematch]').click();
    await host.locator('[data-command=lobby-ready]').click();
    await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();

    await host.locator('.table-shell.network-game').waitFor({timeout:10000});await client.locator('.table-shell.network-game').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),'0');
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
    const hostRole=host.locator('.player-panel .is-host-avatar');
    assert.equal(await hostRole.count(),1,'network owner keeps its shared host marker');
    assert.match(await hostRole.locator('[data-participant-role=player]').getAttribute('aria-label'),/хост/,'the live host role remains accessible');
    const iconHandle=await hostRole.elementHandle();
    await host.waitForTimeout(800);assert(await iconHandle.evaluate(node=>node.isConnected),'unchanged presence must preserve the role node and avoid a DOM observer loop');
    // Network mode MUST use the local bot/hot-seat GameScreen, not a compact
    // second shell. Opponent hands are visible without exposing hidden faces.
    for(const page of [host,client]){
      assert.equal(await page.locator('.table-shell.network-game .table-header').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .player-panel .player-info .avatar').count(),2);
      assert.equal(await page.locator('.table-shell.network-game .layout-participants').isVisible(),true);
      assert.equal(await page.locator('.table-shell.network-game .scene .opponent-hand').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .scene .own-hand').count(),1);
      assert.equal(await page.locator('.game-frame-tools [data-command=history] svg').count(),0);
      assert.equal(await page.locator('.game-frame-tools [data-room-chat-open] svg').count(),1);
      assert.equal(await page.locator('.game-frame-tools [data-command=rules] svg').count(),0);
      assert.equal(await page.locator('.opponent-hand .uno-art-face').count(),0,'Opponent private card faces must stay hidden');
    }
    for(const page of [host,client]){
      await TestUI.openSettings(page);for(const selector of ['#setting-volume','#setting-speed','#setting-quick-play'])assert.equal(await page.locator(selector).count(),1,'shared network setting '+selector);
      await page.locator('[data-settings-tab=behavior]').click();await page.locator('#setting-tutorials').uncheck();assert.equal(await page.locator('#setting-auto-pass').count(),1,'global handoff preference remains available');await page.locator('#setting-auto-pass').check();
      await closeSettings(page);assert.equal(await page.locator('.network-game').getAttribute('data-viewer'),page===host?'0':'1','global handoff preference never transfers a network viewer');assert.equal(await page.locator('.handoff').count(),0);await gameAction(page,'rules');assert.match(await active(page).innerText(),/^Правила/);await active(page).locator('.modal-head [data-command=close-modal]').click();await active(page).locator('.modal-head [data-game-menu-close]').click();
    }
    const menuIdentity=await client.evaluate(()=>({id:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length}));
    await gameAction(client,'home');
    await client.locator('.game-grid').first().waitFor();
    assert.equal(await client.evaluate(()=>PlayroomNetworkDebug().client.channel),'connected');
    assert.equal(await client.locator('.network-resume-card .transport-badge svg[data-ui-icon=wifi]').count(),1);
    assert.equal(await client.locator('#network-return-button').innerText(),'');
    assert.equal(await client.locator('.network-resume-card [data-net-action=leave-active]').count(),1);
    await client.locator('[data-hub-page=sessions]').click();await client.locator('.saved-self').first().waitFor();assert.equal(await client.locator('.saved-self').first().innerText(),'Клиент');await client.locator('[data-hub-page=games]').click();

    const before=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
    await host.locator('.app-game-layout[aria-busy=false]').waitFor();const action=host.locator('.table-shell.network-game .scene [data-action]').first();await action.waitFor();await action.click();
    await host.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.equal(await client.locator('.network-game').count(),0,'background snapshots must not replace the menu');
    await client.locator('[data-net-action=return-game]').click();
    await client.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.deepEqual(await client.evaluate(()=>({id:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length})),menuIdentity,'return reuses the same participant and RTC');
    assert.ok(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'))>before);
    // History is the same inline panel as local play, read-only and not a
    // detached modal with a lone slider. Its navigation does not move live game.
    const latest=Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'));
    await gameAction(client,'history');
    await client.locator('.history-panel').waitFor();
    assert.equal(await client.locator('.history-panel #replay-range').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-prev]').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-play]').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-next]').count(),1);
    assert.equal(await client.locator('.table-shell.network-game .scene [data-action]').count(),0,'History is read-only');
    await client.locator('.history-controls [data-command=replay-prev]').click();
    await client.waitForFunction(()=>document.querySelector('.history-panel .replay-badge')?.textContent?.trim().startsWith('0 /'));
    assert.equal(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision')),0,'Replay displays the selected historical revision');
    assert.equal(Number(await host.locator('.table-shell.network-game').getAttribute('data-revision')),latest,'Replay must not change the live revision');
    // Wake-up resynchronizes live state without closing or advancing review.
    await client.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='recovering');
    await client.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');
    assert.equal(await client.locator('#replay-range').inputValue(),'0','Wake-up preserves selected history');
    assert.equal(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision')),0);
    assert.equal(await client.locator('.history-latest-hint').count(),0,'History review has no layout-shifting notice');
    await client.waitForFunction(async()=>{const store=new PlayroomNetworkClientHistory();try{const rows=await store.list();return rows.some(r=>r.reviewedRevision===0&&r.presentedRevision>0&&r.receivedRevision>=r.presentedRevision);}finally{store.close();}});
    await client.locator('.table-shell [data-command=history-close]').click();
    assert.equal(await client.locator('.history-panel').count(),0);
    assert.equal(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision')),latest,'Closing history restores the unchanged live revision');

    const identity=await client.evaluate(()=>{
      window.qaLiveRTC=qaRTCs.find(peer=>peer.connectionState==='connected');
      return {participant:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length};
    });
    // Finish after a real legal command, keeping authority persistence, RTC
    // snapshots and all result/lobby lifecycle code in the real application.
    // The fixture shortens UNO only in this browser; published packs are intact.
    await host.evaluate(()=>{
      const apply=TabletopCore.applyAction;
      TabletopCore.applyAction=(...args)=>{const next=apply(...args);TabletopCore.finish(next,args[1],'Тестовая партия завершена');return next;};
    });
    const ordinaryAction='.scene [data-action*=draw],.scene [data-action*=pass]';
    // During presentation neither browser may expose an ordinary action yet.
    // Wait for the eligible viewer instead of choosing from a transient count.
    const ordinaryPlayer=()=>Promise.any([host,client].map(async page=>{
      await page.waitForFunction(selector=>document.querySelector('.app-game-layout')?.getAttribute('aria-busy')==='false'&&
        [...document.querySelectorAll(selector)].some(node=>!node.disabled&&!node.closest('[inert]')&&node.getClientRects().length),ordinaryAction,{timeout:10000});
      return page;
    }));
    assert.equal(await host.locator('.game-frame-tools #network-pair-button').count(),0);
    assert.equal(await host.locator('.game-frame-tools button').count(),3);
    await TestUI.openSettings(host);
    assert.equal(await host.locator('.modal #network-pair-button').count(),0,'invitations belong to the lobby, not settings');
    await closeSettings(host);
    for(const exit of ['guest','host']){
      const primaryPositions=await Promise.all([host,client].map(page=>page.locator('.game-frame-tools').boundingBox()));
      const actor=await ordinaryPlayer();
      await actor.locator(ordinaryAction).first().click();
      await host.locator('.shared-modal-backdrop').waitFor();
      await client.locator('.shared-modal-backdrop').waitFor();
      for(const [i,page] of [host,client].entries()){const b=await page.locator('.game-frame-tools').boundingBox();assert(Math.abs(b.y-primaryPositions[i].y)<1,'result preserves toolbar row');assert.equal(b.width,primaryPositions[i].width);assert.equal(b.height,primaryPositions[i].height);}
      assert.equal(await client.locator('.shared-modal-backdrop [data-command=close-modal]').count(),0,'network results offer history and room, without dismiss/exit');
      assert.equal(await client.locator('.shared-modal-backdrop [data-command=rematch]').count(),1);
      await client.locator('.shared-modal-backdrop [data-command=result-replay]').click();
      await client.locator('.history-panel').waitFor();
      await client.locator('#replay-range').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await client.waitForFunction(()=>document.querySelector('#replay-range').value==='0'&&document.querySelector('.history-panel').getAttribute('aria-busy')==='false');
      assert.equal(await client.locator('.game-frame-tools [data-command=result],.game-frame-tools [data-command=room]').count(),0,'native game actions stay in the menu');
      if(process.env.PLAYROOM_CAPTURE_DIR&&exit==='guest')await client.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'network-finished-history.png')});
      await client.locator('[data-command=history-close]').click();await active(client).locator('[data-command=result-replay]').waitFor();
      if(exit==='guest'){
        await client.locator('.shared-modal-backdrop [data-command=rematch]').click();
        await client.locator('.lobby-shell').waitFor();
        assert.equal(await client.locator('.shared-modal-backdrop').count(),0,'Guest exit must remove its result dialog');
      }
      await host.locator('.shared-modal-backdrop [data-command=rematch]').click();
      await host.locator('.lobby-shell').waitFor();
      if(exit!=='guest'){
        assert.equal(await client.locator('.shared-modal-backdrop').count(),1,'Host transition leaves guest results open');
        await client.locator('.shared-modal-backdrop [data-command=result-replay]').click();await client.locator('.history-panel').waitFor();
        await client.locator('[data-command=history-close]').click();await active(client).locator('[data-command=result-replay]').waitFor();
        await client.locator('.shared-modal-backdrop [data-command=rematch]').click();
      }
      await client.locator('[data-net-action=ready]:not(:disabled)').waitFor();
      assert.equal(await client.locator('.shared-modal-backdrop').count(),0,'Guest explicitly returns to lobby');
      assert.equal(await client.locator('#app').evaluate(e=>e.inert),true);
      await host.locator('[data-command=lobby-ready]').click();
      await client.locator('[data-net-action=ready]').click();
      await host.locator('[data-command=lobby-start]:not(:disabled)').click();
      await client.locator('.table-shell.network-game').waitFor({timeout:10000});
      await host.locator('.table-shell.network-game').waitFor({timeout:10000});
      assert.deepEqual(await client.evaluate(()=>({participant:PlayroomNetworkDebug().client.participantId,
        peers:qaRTCs.length,state:qaLiveRTC.connectionState})),{...identity,state:'connected'});
    }

    // A completed match remains available as history. A later unfinished
    // match must release this room and restore into its recovery lobby.
    const lastActor=await ordinaryPlayer();
    await lastActor.locator(ordinaryAction).first().click();
    await host.locator('.shared-modal-backdrop [data-command=rematch]').click();
    await host.locator('.lobby-shell').waitFor();
    const archiveId=await host.evaluate(async()=>
      (await PlayroomNetworkLibrary.list()).find(item=>item.role==='host').sessionId);
    await host.evaluate(id=>PlayroomNetworkLibrary.continue(id),archiveId);
    assert.match(await host.locator('#toast').innerText(),/Сначала покиньте текущую комнату/,
      'an active lobby must still prevent restoring a second room');
    if(await client.locator('.shared-modal-backdrop [data-command=rematch]').count())await client.locator('.shared-modal-backdrop [data-command=rematch]').click();
    await host.locator('[data-command=lobby-ready]').click();
    await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not(:disabled)').click();
    await host.locator('.table-shell.network-game').waitFor();
    await gameAction(host,'pause');
    await host.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot?.paused===true);
    const parked=await host.evaluate(async()=>{
      const item=(await PlayroomNetworkLibrary.list()).find(item=>item.role==='host'&&!item.finished);
      return {id:item.sessionId,revision:Number(document.querySelector('.network-game').dataset.revision)};
    });
    await gameAction(host,'home');
    await host.locator('.game-grid').first().waitFor();
    await host.locator('[data-hub-page=sessions]').click();
    assert.equal(await host.locator('.saved-self').first().innerText(),'Хост');
    await host.locator('[data-saved-status=history]').click();await host.locator('.saved-game[data-network-session-id="'+archiveId+'"]').click();assert.equal(await active(host).locator('[data-network-continue]').count(),0,'completed matches have no Continue action');await active(host).locator('[data-network-history]').click();
    await host.locator('.table-shell.network-game .history-panel').waitFor();
    await host.locator('.table-shell.network-game [data-command=history-close]').first().click();
    await savedAction(host,'[data-network-continue]',parked.id);
    await host.locator('.table-shell.network-game').waitFor();
    assert.equal(Number(await host.locator('.network-game').getAttribute('data-revision')),parked.revision);
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1,'menu and archive browsing retain RTC');
    await gameAction(host,'room');
    await active(host).locator('.modal-head [data-command=close-modal]').click();
    assert.equal(await host.locator('.network-game').count(),1);
    await gameAction(host,'room');await host.locator('[data-net-action=stop-match]').click();
    await host.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await host.locator('[data-net-action=stop-match]').count(),1,'cancel keeps the match running');
    await host.locator('[data-net-action=stop-match]').click();await active(host).locator('[data-command=confirm-operation]').click();
    await active(host).locator('[data-command=lobby-start]').waitFor();await client.locator('.lobby-shell').waitFor();
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1,'Stop keeps RTC room peers');
    assert.equal((await host.evaluate(async id=>(await PlayroomNetworkLibrary.list()).find(x=>x.sessionId===id),parked.id)).finished,false);
    await active(host).locator('[data-room-context]').click();await active(host).locator('[data-command=lobby-leave]').click();
    await active(host).locator('[data-confirm-accept],[data-command=confirm-operation]').click();
    await host.locator('[data-hub-page=sessions]').click();
    await savedAction(host,'[data-network-continue]',parked.id,'history');
    await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').count(),0,'Recovery waits for the original players in the lobby');
    assert.equal(await host.locator('.room-v021-person-copy').filter({hasText:'Клиент'}).count(),1);
    assert.equal(await host.locator('[data-command=lobby-start]').isDisabled(),true);
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),0,
      'leaving the lobby must close its old RTC connections');
    const restored=await host.evaluate(async id=>{
      const store=new PlayroomNetworkSessionStore();
      try{const saved=await store.load(id,TabletopCore,TabletopSession);return {revision:saved.session.current.move,paused:saved.paused};}
      finally{store.close();}
    },parked.id);
    assert.deepEqual(restored,{revision:parked.revision,paused:true},'Recovery preserves the paused revision');

    assert.deepEqual(errors,[]);
  }catch(error){console.error('Network UI page errors',JSON.stringify(errors));if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});for(const [name,page] of [['host',host],['player',client]]){await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,name+'-failure.png')});console.error(name+' UI',await page.locator('.modal,.game-frame-tools').allTextContents());}}throw error;}finally{await Promise.all([hc.close(),cc.close()]);await browser.close();if(s)await new Promise(r=>s.close(r));}
});

test('cloud rendezvous: two real RTC clients resume the same playing seat after full page reload',{timeout:90000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const h=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),c=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),host=await h.newPage(),client=await c.newPage(),errors=[];
 const cloudId='00000000-0000-4000-8000-000000000001',hostId='00000000-0000-4000-8000-000000000002',userId='00000000-0000-4000-8000-000000000003',boundId='00000000-0000-4000-8000-000000000004';
 let lease=null,slot=null,requests=0,identityReads=0,compactPolls=0;const joinTimes=[];
 await c.addInitScript(()=>{const Native=window.RTCPeerConnection;window.testCloudPeers=[];window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);window.testCloudPeers.push(this);}};});
 for(const context of [h,c])await context.addInitScript(()=>{let api;Object.defineProperty(globalThis,'PlayroomIceConfig',{configurable:true,get:()=>api,set:value=>{api={...value,credentials:async()=>({configuration:{iceServers:[]},expiresAt:Date.now()+86400000,diagnosticsEnabled:false})};}});});
 for(const [context,uid] of [[h,hostId],[c,userId]])await require('./account-sync-fixture.cjs').installFetch(context,require('./account-sync-fixture.cjs')(async route=>{
  const req=route.request();requests++;let result;
  if(req.url().includes('/auth/')){const user={id:uid,email:uid+'@example.test',is_anonymous:false};result=req.url().endsWith('/user')?user:{user,access_token:'access-'+uid,refresh_token:'refresh-'+uid,expires_in:3600};}
  else if(req.url().endsWith('/playroom_push')){const action=req.postDataJSON().p_action;assert(['config','room-message','game-state'].includes(action),action);result=action==='config'?{ready:false,publicKey:null}:{};}
  else if(req.url().endsWith('/playroom_online')){const action=req.postDataJSON().p_action;assert(['presence','unread','inbox','group-inbox','hub','group-list'].includes(action));result=action==='presence'?{}:action==='hub'?{friends:[],rooms:[],invitations:[],conversations:[]}:action==='group-list'?{groups:[]}:action==='unread'?{chats:[]}:{cursor:'0',items:[]};}
  else if(req.url().endsWith('/playroom_cloud_saves_rpc'))result={enabled:false,entries:[],used:0,limit:10485760};
  else if(req.url().endsWith('/playroom_social')){assert.equal(req.postDataJSON().p_action,'list');result={profile:{id:uid,nickname:'Игрок'},friends:[],rooms:[],invitations:[]};}
  else{
   assert(req.url().endsWith('/playroom_signal_sync'));const {p_action:action,p_data:d}=req.postDataJSON();assert.equal(d.roomId,cloudId);
   if(action==='host'){assert.equal(uid,hostId);lease={epoch:d.epoch,localRoomId:d.localRoomId};result={};}
   else if(action==='poll-host'){assert.equal(uid,hostId);if(d.known?.length)compactPolls++;result={contract:1,signals:slot?[{...slot,participantId:boundId,...(d.known?.includes(slot.id)?{offer:null,answer:null}:{})}]:[],peers:d.peers.map(p=>({id:p.id,allowed:true}))};}
   else if(action==='request'){assert.equal(uid,userId);slot={id:require('node:crypto').randomUUID(),userId,offer:null,answer:null};result={id:slot.id,...lease};}
   else if(action==='authorize'){if(d.id)identityReads++;assert.equal(uid,hostId);result={userId,participantId:boundId};}
   else if(action==='offer'){assert.equal(uid,hostId);assert.equal(d.id,slot.id);if(slot.offer)assert.equal(slot.offer,d.signal);slot.offer=d.signal;result={};}
   else if(action==='poll'){assert.equal(uid,userId);assert.equal(d.id,slot.id);result={offer:slot.offer,epoch:lease.epoch};}
   else if(action==='answer'){assert.equal(uid,userId);assert.equal(d.id,slot.id);slot.answer=d.signal;result={};}
   else throw Error('Unexpected action '+action);
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 }));
 for(const context of [h,c])await context.route(/https:\/\/[^/]+\.supabase\.co\//,route=>route.abort());
 for(const p of [host,client]){p._onlineFixture=true;p._url=url;p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));}
 try{
  await profile(host,'Хост');await profile(client,'Игрок');assert.equal(requests,0);
  await host.evaluate(()=>PlayroomAccountUI.service.login('host@example.test','password123'));await client.evaluate(()=>PlayroomAccountUI.service.login('client@example.test','password123'));
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-game-mode=network]').click();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{transportMode:'online'});b.renderLobby();});
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  await host.evaluate(id=>PlayroomCloudNetwork.host(id),cloudId);
  {const started=Date.now();await client.evaluate(id=>PlayroomCloudNetwork.connect(id),cloudId);joinTimes.push(Date.now()-started);}
  await client.locator('.lobby-shell').waitFor();await client.locator('[data-net-seat]:not([disabled])').first().click();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  await host.locator('[data-command=lobby-ready]').click();await client.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
  await client.locator('.network-game[data-viewer="1"]').waitFor();await host.locator('.app-game-layout[aria-busy=false]').waitFor();await host.locator('.ttt-cell[data-action]').first().click();await client.locator('.ttt-cell.cross').waitFor();
  const before=await client.evaluate(()=>PlayroomNetworkDebug().client.participantId);assert.equal(before,boundId);
  await client.reload();await client.locator('.game-grid').first().waitFor();await client.evaluate(id=>PlayroomCloudNetwork.connect(id),cloudId);
  await client.locator('.network-game[data-viewer="1"]').waitFor();assert.equal(await client.evaluate(()=>PlayroomNetworkDebug().client.participantId),before);
  assert.equal(await host.evaluate(()=>{const b=PlayroomAppBridge;return b.roomService.snapshot(b.room().id).participants.length;}),2);
  assert.equal(identityReads,0,'inline binding removes the extra authorize round trip');
  const intro=client.locator('[data-learning-choice=no]');if(await intro.isVisible())await intro.click();
  await client.evaluate(()=>window.testCloudPeers.at(-1).close());
  await client.waitForFunction(()=>window.testCloudPeers.length>=2&&PlayroomNetworkDebug().client.channel==='connected'&&PlayroomNetworkDebug().client.participantId!==null,{},{timeout:30000});
  assert.equal(await client.evaluate(()=>PlayroomNetworkDebug().client.participantId),before);
  assert.equal(await host.evaluate(()=>{const b=PlayroomAppBridge;return b.roomService.snapshot(b.room().id).participants.length;}),2);
  await client.locator('.app-game-layout[aria-busy=false]').waitFor();await client.locator('.ttt-cell[data-action]').first().click();await host.locator('.ttt-cell.nought').waitFor();
  assert.deepEqual(errors,[]);
  assert.equal(identityReads,0);assert(compactPolls>0);console.log('Local Online join timing ms:',joinTimes,'compact polls:',compactPolls);
 }finally{await browser.close();await new Promise(resolve=>s.close(resolve));}
});

test('main app: team chat delivers only to allies and keeps a colored history',{timeout:90000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const pages=[],errors=[];const capture=async(page,name)=>{if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,name+'.png'),animations:'disabled'});}};
 try{
  for(const name of ['Анна','Борис','Вера']){const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),page=await context.newPage();page._url=url;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await profile(page,name);pages.push(page);}
  const [host,enemy,ally]=pages;
  await TestUI.openGame(host,'ludo','network');await host.locator('[data-room-auto-start]').uncheck();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.updateRules(r.id,r.ownerId,{...r.rules,preset:'teams'});for(const id of ['seat-2','seat-3'])b.roomService.setLocalSeat(r.id,r.ownerId,id,{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-4',{kind:'bot',nickname:'Бот'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  for(const [page,seat] of [[enemy,'seat-2'],[ally,'seat-3']]){
   await host.locator('#network-pair-button').click();await host.locator('#net-host-token').waitFor({state:'attached'});const offer=await value(host,'#net-host-token');
   await page.locator('#network-join-button').click();await page.locator('[data-lobby-online=manual]').click();await textReceive(page);await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());await page.locator('#net-client-token').waitFor({state:'attached'});
   await textReceive(host);await host.locator('#net-host-answer textarea[name=answer]').fill(await value(page,'#net-client-token'));await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator(`[data-net-seat="${seat}"]`).click();
  }
  await host.locator('[data-command=lobby-ready]').click();for(const page of [enemy,ally])await page.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();for(const page of pages)await page.locator('.network-game').waitFor();
  await host.evaluate(()=>PlayroomRoomChatUI.show());await host.locator('[data-room-chat-tab=team]').click();await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Синий командный план');await host.locator('[data-room-chat-form] [type=submit]').click();
  await ally.locator('.room-message-bubble.is-team').waitFor();assert.equal(await enemy.locator('.room-message-bubble').count(),0);await capture(ally,'team-bubble-blue');
  const enemyHistory=await enemy.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-read',scope:'team'}));assert(!JSON.stringify(enemyHistory).includes('Синий командный план'));assert.equal(enemyHistory.team,'red');
  await ally.locator('[data-game-menu]').click();await ally.locator('[data-command=preferences]').click();
  await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'team',id:'unread-team-message',body:'Пропущенное командное сообщение'}));
  await ally.evaluate(()=>PlayroomChatActivity.poll());await closeSettings(ally);await ally.locator('.game-frame-tools [data-room-chat-open] .chat-counter-team').waitFor();assert.equal((await enemy.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'}))).team,0);
  await capture(ally,'team-unread-counter');
  await ally.bringToFront();await ally.evaluate(()=>PlayroomRoomChatUI.show());await ally.locator('[data-room-chat-tab=team]').click();await ally.locator('[data-room-chat-messages]').filter({hasText:'Синий командный план'}).waitFor();await capture(ally,'team-chat-blue');
  assert(await ally.locator('[data-room-chat-content]').evaluate(el=>getComputedStyle(el.querySelector('.chat-messages')).backgroundColor!==getComputedStyle(el.querySelector('.chat-message')).backgroundColor));
  // The native room→team switch must restart polling; receipts update without Retry or reopening.
  await ally.waitForFunction(async()=>{const summary=await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'});return summary.team===0;});await host.bringToFront();try{await host.locator('.message-receipt.is-read').nth(1).waitFor();}catch(error){console.error('team receipt diagnostic',JSON.stringify(await host.evaluate(async()=>({receipts:[...document.querySelectorAll('.message-receipt')].map(x=>x.getAttribute('aria-label')),entries:(await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-read',scope:'team'})).messages.map(x=>({body:x.body,mine:x.mine,read:x.read,seq:x.seq,version:x.version}))}))));throw error;}
  await ally.locator('[data-room-chat-content][data-reply-support=true]').waitFor();const teamMessage=ally.locator('.chat-message').filter({hasText:'Синий командный план'});await teamMessage.locator('p').click();await ally.locator('[data-quick-emoji=":nice:"]').click();await teamMessage.locator('[data-chat-react-emoji=":nice:"][aria-pressed=true]').waitFor();await host.locator('[data-chat-react-emoji=":nice:"]').waitFor();
  await teamMessage.locator('p').click();await ally.locator('.quick-reaction-picker:not([inert]) [data-chat-message-action=reply]').click();await ally.locator('[data-chat-reply]:not([hidden])').waitFor();await ally.locator('[data-room-chat-form] [data-chat-editor]').fill('Ответ синей команде');await ally.locator('[data-room-chat-form] [type=submit]').click();await host.locator('.chat-message').filter({hasText:'Ответ синей команде'}).locator('[data-chat-reply-jump]').waitFor();
  const safeEnemy=await enemy.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-read',scope:'team'}));assert(!JSON.stringify(safeEnemy).includes('Ответ синей команде'));assert(!JSON.stringify(safeEnemy).includes(':nice:'));
  if(process.env.PLAYROOM_CAPTURE_DIR)await ally.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'team-reply-attached.png'),animations:'disabled'});
  await ally.locator('[data-room-chat-tab=room]').click();assert.equal(await ally.locator('[data-room-chat-messages]').filter({hasText:'Синий командный план'}).count(),0);
  await enemy.evaluate(()=>PlayroomRoomChatUI.show());await enemy.locator('[data-room-chat-tab=team]').click();await enemy.locator('[data-room-chat-form] [data-chat-editor]').fill('Красная команда');await enemy.locator('[data-room-chat-form] [type=submit]').click();await enemy.locator('.chat-message.mine').waitFor();await capture(enemy,'team-chat-red');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>s.close(resolve));}
});

test('cloud host renews membership only for a connected RTC channel and rejects non-Online rooms',{timeout:30000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
 try{
  page._url=url;await profile(page,'Хост');await TestUI.openGame(page,'tictactoe','network');
  const result=await page.evaluate(async()=>{
   const b=PlayroomAppBridge,r=b.room(),identity={userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'};let validations=0;
   const create=()=>PlayroomNetworkLibrary.cloudHostPeer({identity,check:()=>{},validate:()=>{validations++;}});
   let denied=false;try{await create();}catch(error){denied=error.message==='CLOUD_LOBBY_REQUIRED';}
   b.roomService.configure(r.id,r.ownerId,{transportMode:'online'});b.renderLobby();
   const Native=window.RTCPeerConnection;let connectionState='new',readyState='connecting',pc,channel;
   window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);pc=this;}createDataChannel(...args){const created=super.createDataChannel(...args);if(args[1]?.protocol!==PlayroomRealtimePeer.PROTOCOL)channel=created;return created;}};
   const handle=await create();Object.defineProperty(pc,'connectionState',{get:()=>connectionState});Object.defineProperty(channel,'readyState',{get:()=>readyState});
   await handle.validate();const before=validations;
   connectionState='connected';readyState='open';await handle.validate();const connected=validations;
   connectionState='disconnected';await handle.validate();const disconnected=validations,canRecover=!handle.closed();
   connectionState='failed';await handle.validate();const failed=validations,closed=handle.closed();
   readyState='closed';handle.close();return {denied,before,connected,disconnected,failed,canRecover,closed};
  });
  assert.deepEqual(result,{denied:true,before:0,connected:1,disconnected:1,failed:1,canRecover:true,closed:true});
 }finally{await context.close();await browser.close();await new Promise(resolve=>s.close(resolve));}
});

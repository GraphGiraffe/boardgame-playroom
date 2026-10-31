'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const accountSyncRoute=require('./account-sync-fixture.cjs');
const root=path.resolve(__dirname,'..');
test('lobby host transfer: three RTC peers preserve the room without Supabase and can start a match',{timeout:120000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),pages=[],errors=[],supabaseRequests=[];
 try{
  for(const name of ['Анна','Борис','Вера']){const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});if(name==='Борис')await context.addInitScript(()=>{let authority;Object.defineProperty(window,'SessionAuthority',{configurable:true,get:()=>authority,set:value=>{authority=class extends value{constructor(session,options){super(session,options);if(options?.sessionId===window.trackedTransferSession)window.handoffAuthorityStarts=(window.handoffAuthorityStarts||0)+1;}};}});});context.on('request',r=>{if(/\.supabase\.co\//.test(r.url()))supabaseRequests.push(r.url().split('?')[0]);});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.stack));await page.goto(server.url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('ludo',false));pages.push(page);}
  const [host,next,other]=pages;
  await host.locator('[data-start=ludo]').click();await host.locator('[data-room-option=transportMode][value=network]').check();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);for(const id of ['seat-2','seat-3'])b.roomService.setLocalSeat(r.id,r.ownerId,id,{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-4',{kind:'bot',nickname:'Бот'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  for(const [page,seat] of [[next,'seat-2'],[other,'seat-3']]){
   await host.locator('#network-pair-button').click();const offer=await host.locator('#net-host-token').inputValue();await page.locator('#network-join-button').click();await page.locator('[data-lobby-online=manual]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
   const answer=await page.locator('#net-client-token').inputValue();await host.locator('#net-host-answer textarea[name=answer]').fill(answer);await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator(`[data-net-seat=${seat}]`).click();
  }
  const expected=await host.evaluate(()=>{const r=PlayroomAppBridge.room();return {id:r.id,owner:r.ownerId,seats:r.seats.map(s=>[s.id,s.participantId]),rules:r.rules};}),target=await next.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);
  await other.evaluate(()=>{window.transferPackets=[];PlayroomNetworkLibrary.transferClient().channel.addEventListener('message',e=>{try{const p=JSON.parse(e.data);if(p.kind==='host-transfer-v1')transferPackets.push(p.text);}catch{}});});
  await host.locator('[data-room-person="'+target+'"]').click();assert.equal(await host.locator('[data-profile-invite],[data-profile-play]').count(),0);await host.locator('[data-profile-transfer]').click();await next.locator('[data-confirm-cancel]').click();await host.waitForFunction(()=>PlayroomHostTransferUI.senderState()===null);assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().ownerId),expected.owner);assert.equal(await host.locator('.host-transfer-modal').count(),0);await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());
  await host.locator('[data-room-person="'+target+'"]').click();assert.equal(await host.locator('[data-profile-invite],[data-profile-play]').count(),0);await host.locator('[data-profile-transfer]').click();await next.locator('[data-confirm-accept]').click();
  await next.waitForFunction(target=>PlayroomAppBridge.room()?.ownerId===target,target,{timeout:60000});await host.waitForFunction(target=>PlayroomNetworkLibrary.transferClient()?.room.ownerId===target,target,{timeout:60000});await other.waitForFunction(target=>PlayroomNetworkLibrary.transferClient()?.room.ownerId===target,target,{timeout:30000});
  const actual=await next.evaluate(()=>{const r=PlayroomAppBridge.room();return {id:r.id,owner:r.ownerId,seats:r.seats.map(s=>[s.id,s.participantId]),rules:r.rules,ready:r.participants.filter(p=>!p.bot).map(p=>p.ready)};});assert.equal(actual.id,expected.id);assert.equal(actual.owner,target);assert.deepEqual(actual.seats,expected.seats);assert.deepEqual(actual.rules,expected.rules);assert(actual.ready.every(x=>!x));
  assert.equal(await other.evaluate(()=>transferPackets.join('').includes('"tokens"')),false,'ordinary peers must not receive room resume credentials');
  await next.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  for(const p of [host,other])await p.locator('[data-net-action=ready]').click();await next.locator('[data-command=lobby-ready]').click();await next.locator('[data-command=lobby-start]:not([disabled])').click();await next.locator('.table-shell.network-game').waitFor();await other.locator('.table-shell.network-game').waitFor();
  assert(await next.evaluate(()=>PlayroomHostTransferUI.markup(PlayroomAppBridge.room(),PlayroomAppBridge.participantId()).includes('data-host-transfer-open')),'voluntary transfer remains available during a match');
  await host.close();const before=Number(await other.locator('.network-game').getAttribute('data-revision'));await next.locator('.network-game [data-action]').first().click();await other.waitForFunction(before=>Number(document.querySelector('.network-game')?.dataset.revision)>before,before);assert.deepEqual(errors,[]);assert.deepEqual(supabaseRequests,[],'network handoff never calls Supabase');
 }finally{await browser.close();await server.close();}
});

test('planned host transfer: three real RTC players change host, keep seats and continue after old device closes',{timeout:120000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),pages=[],errors=[];
 try{
  for(const name of ['Анна','Борис','Вера']){const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});if(name==='Борис')await context.addInitScript(()=>{let authority;Object.defineProperty(window,'SessionAuthority',{configurable:true,get:()=>authority,set:value=>{authority=class extends value{constructor(session,options){super(session,options);if(options?.sessionId===window.trackedTransferSession)window.handoffAuthorityStarts=(window.handoffAuthorityStarts||0)+1;}};}});});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('ludo',false));pages.push(page);}
  const [host,next,other]=pages;
  await host.locator('[data-start=ludo]').click();await host.locator('[data-room-option=transportMode][value=network]').check();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(const id of ['seat-2','seat-3'])b.roomService.setLocalSeat(r.id,r.ownerId,id,{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-4',{kind:'bot',nickname:'Бот'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  for(const [page,seat] of [[next,'seat-2'],[other,'seat-3']]){
   await host.locator('#network-pair-button').click();const offer=await host.locator('#net-host-token').inputValue();await page.locator('#network-join-button').click();await page.locator('[data-lobby-online=manual]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
   const answer=await page.locator('#net-client-token').inputValue();await host.locator('#net-host-answer textarea[name=answer]').fill(answer);await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator(`[data-net-seat=${seat}]`).click();
  }
  const firstTarget=await next.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);
  await host.evaluate(id=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:id});b.renderLobby();},firstTarget);
  for(const page of [next,other])await page.locator('[data-net-action=ready]').click();
  await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await host.locator('.table-shell.network-game').waitFor();await next.locator('.table-shell.network-game').waitFor();
  const expected=await host.evaluate(()=>{const c=PlayroomNetworkLibrary.transferContext();return {room:c.room.id,owner:c.room.ownerId,seats:c.room.seats.map((s,i)=>[s.participantId,s.playerIndex??i]),target:c.peers[0].id,session:c.sessionId};});
  await other.evaluate(()=>{window.otherTransferText=[];PlayroomNetworkLibrary.transferClient().channel.addEventListener('message',event=>{try{const p=JSON.parse(event.data);if(p.kind==='host-transfer-v1')otherTransferText.push(p.text);}catch{}});});
  const target=await next.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);assert.equal(expected.target,target);
  await host.evaluate(()=>PlayroomHostTransferUI.show());await host.screenshot({path:path.join(root,'../tmp_files/host-transfer-020/select-390.png')});
  await host.locator('[data-host-transfer-target]').first().click();await next.locator('[data-confirm-cancel]').click();await host.waitForFunction(()=>PlayroomHostTransferUI.senderState()===null);
  assert.equal(await next.evaluate(async id=>!!(await PlayroomNetworkLibrary.transferStore.readPrivate(id)).record,expected.session),false,'declined peer receives no private journal');
  await other.evaluate(async()=>{const c=PlayroomNetworkLibrary.playerControlContext();const r=await c.call({type:'player-control',operation:'away',sessionId:c.snapshot.sessionId,authorityEpoch:c.snapshot.authorityEpoch,requestId:'handoff-away',expectedRevision:c.snapshot.playerControlRevision});if(!r.ok)throw Error(r.code);});
  await host.evaluate(async()=>{const c=PlayroomNetworkLibrary.playerControlContext(),target=c.room.participants.find(p=>p.nickname==='Третий');const id=target?.id||c.room.participants.filter(p=>!p.bot&&p.id!==c.room.ownerId).at(-1).id;const r=await c.call({type:'player-control',operation:'bot',target:id,sessionId:c.snapshot.sessionId,authorityEpoch:c.snapshot.authorityEpoch,requestId:'handoff-bot',expectedRevision:c.snapshot.playerControlRevision});if(!r.ok)throw Error(r.code);});
  await next.evaluate(id=>window.trackedTransferSession=id,expected.session);
  await host.evaluate(()=>PlayroomHostTransferUI.show());await host.locator('[data-host-transfer-target]').first().click();await next.locator('[data-confirm-accept]').waitFor();
  await host.evaluate(()=>{const wire=PlayroomHostTransferUI.senderState().wire,request=wire.request.bind(wire);wire.request=(method,data,...args)=>method==='activate'?Promise.allSettled([request(method,data,...args),request(method,data,...args)]):request(method,data,...args);});await next.screenshot({path:path.join(root,'../tmp_files/host-transfer-020/consent-390.png')});
  await next.locator('[data-confirm-accept]').click();
  await next.waitForFunction(()=>!!PlayroomNetworkLibrary.transferContext(),null,{timeout:60000});
  await host.waitForFunction(()=>!!PlayroomNetworkLibrary.transferClient(),null,{timeout:60000});
  assert.equal(await next.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.playerControls.some(p=>p.bot)),true);
  await other.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.playerControls.some(p=>p.bot));
  await other.evaluate(async()=>{const c=PlayroomNetworkLibrary.playerControlContext(),r=await c.call({type:'player-control',operation:'return',sessionId:c.snapshot.sessionId,authorityEpoch:c.snapshot.authorityEpoch,requestId:'handoff-return',expectedRevision:c.snapshot.playerControlRevision});if(!r.ok)throw Error(r.code);});
  await next.waitForFunction(()=>!PlayroomNetworkLibrary.playerControlContext().snapshot.playerControls.some(p=>p.bot));
  assert.equal(await next.evaluate(()=>handoffAuthorityStarts),1,'concurrent activation creates one authority');
  const actual=await next.evaluate(()=>{const c=PlayroomNetworkLibrary.transferContext();return {room:c.room.id,owner:c.room.ownerId,seats:c.room.seats.map((s,i)=>[s.participantId,s.playerIndex??i]),session:c.sessionId};});assert.equal(actual.room,expected.room);assert.equal(actual.owner,target);assert.equal(actual.session,expected.session);assert.deepEqual(actual.seats,expected.seats);
  await other.waitForFunction(id=>PlayroomNetworkLibrary.transferClient()?.room.ownerId===id,target,{timeout:30000});
  assert.equal(await other.evaluate(()=>otherTransferText.join('').includes('\"archive\"')),false,'ordinary peer never receives full private archive');
  await host.close();
  await next.evaluate(async()=>{const ctx=PlayroomNetworkLibrary.chatContext();await ctx.call({type:'room-chat-send',id:crypto.randomUUID(),body:'После передачи',scope:'room'});});
  await other.evaluate(()=>PlayroomRoomChatUI.show());await other.locator('[data-room-chat-messages]').getByText('После передачи',{exact:true}).waitFor();
  await other.locator('.modal [data-command=close-modal]').click();
  await next.screenshot({path:path.join(root,'../tmp_files/host-transfer-020/after.png')});
  const revision=Number(await next.locator('.network-game').getAttribute('data-revision'));
  await next.locator('.network-game [data-action]').first().click();
  await other.waitForFunction(before=>Number(document.querySelector('.network-game')?.dataset.revision)>before,revision);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('handoff storage stages privately, fences reload, keeps receipts and permits a later transfer back',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext(),page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomAccountUI?.service);
  const result=await page.evaluate(async()=>{
   const source=new PlayroomNetworkSessionStore({name:'handoff-storage-source'}),target=new PlayroomNetworkSessionStore({name:'handoff-storage-target'});
   const session=new TabletopSession(TabletopCore,'tictactoe',{seed:'PRIVATE-TRANSFER-SEED',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]});
   const room={id:'storage-room',phase:'playing',ownerId:'a',hostMode:'player',game:{id:session.game,version:session.packVersion},revision:1,lobbyRevision:1,seats:[{id:'s1',index:0,participantId:'a',playerIndex:0},{id:'s2',index:1,participantId:'b',playerIndex:1}],participants:[{id:'a',nickname:'A',isHost:true,connected:true,role:'player'},{id:'b',nickname:'B',isHost:false,connected:true,role:'player'}]},recovery={version:1,room:structuredClone(room),tokens:[{participantId:'b',token:'b'.repeat(64)}]};
   await source.create({sessionId:'transfer-store',room,session,recovery,packDigest:'sha256:'+'a'.repeat(64)});
   const authority=new SessionAuthority(session,{sessionId:'transfer-store',persistence:{commit:x=>source.commit(x),recordReceipt:x=>source.recordReceipt(x)}}),connection=authority.connect(0),command=PlayroomProtocol.command(connection.snapshot(),{type:'place',cell:0},'lost-ack');await connection.dispatch(command);await authority.suspendForTransfer();
   const raw=await source.readPrivate('transfer-store'),value=PlayroomHostTransfer.bundle(raw,{id:'first',target:'b',sourceToken:'a'.repeat(64)});
   await target.stageTransfer(value,TabletopCore,TabletopSession,'device-b');let pending=false;try{await target.load('transfer-store',TabletopCore,TabletopSession);}catch{pending=true;}
   await target.stageTransfer(value,TabletopCore,TabletopSession,'device-b');
   await source.transferState('transfer-store','first','outgoing',{target:'b'});authority.dispose();let fenced=false;try{await source.load('transfer-store',TabletopCore,TabletopSession);}catch{fenced=true;}
   await target.transferState('transfer-store','first','active');const saved=await target.load('transfer-store',TabletopCore,TabletopSession);
   const promoted=new SessionAuthority(saved.session,{sessionId:saved.sessionId,authorityEpoch:'next',restoredReceipts:saved.receipts,persistence:{commit:x=>target.commit(x),recordReceipt:x=>target.recordReceipt(x)}});const replay=await promoted.connect(0).dispatch(command);promoted.dispose();
   const back=PlayroomHostTransfer.bundle(await target.readPrivate('transfer-store'),{id:'second',target:'a',sourceToken:'c'.repeat(64)});await target.transferState('transfer-store','second','outgoing',{target:'a'});await source.stageTransfer(back,TabletopCore,TabletopSession,'device-a');await source.transferState('transfer-store','second','active');const returned=await source.load('transfer-store',TabletopCore,TabletopSession);
   return {pending,fenced,duplicate:replay.duplicate,revision:saved.revision,states:returned.session.states.length,receipts:returned.receipts.length,device:returned.hostDeviceId,owner:returned.room.ownerId};
  });
  assert.deepEqual(result,{pending:true,fenced:true,duplicate:true,revision:1,states:2,receipts:1,device:'device-a',owner:'a'});
 }finally{await browser.close();await server.close();}
});

test('online handoff changes server owner, preserves bound participant identity and prepares reconnect to new host',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const aid='00000000-0000-4000-8000-000000000001',bid='00000000-0000-4000-8000-000000000002',pid='00000000-0000-4000-8000-000000000003',rid='00000000-0000-4000-8000-000000000004';
 let owner=aid,lease=null,slot=null,transfer=null;const errors=[],contexts=[];
 try{
  for(const [uid,name] of [[aid,'Анна'],[bid,'Борис']]){
   const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});contexts.push(context);
   await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',accountSyncRoute(async route=>{
    const req=route.request(),url=req.url(),d=req.postDataJSON()?.p_data||{},action=req.postDataJSON()?.p_action;let result={};
    if(url.includes('/auth/')){const user={id:uid,email:uid+'@example.test',is_anonymous:false};result=url.endsWith('/user')?user:{user,access_token:'access-'+uid,refresh_token:'refresh-'+uid,expires_in:3600};}
    else if(url.endsWith('/playroom_social'))result=action==='list'?{profile:{id:uid,nickname:name},friends:[],rooms:[],invitations:[]}:{id:uid,nickname:name};
    else if(url.endsWith('/playroom_cloud_saves_rpc'))result={enabled:false,items:[],revision:0,usedBytes:0,quota:10485760};
    else if(url.endsWith('/playroom_push'))result=action==='config'?{ready:false,publicKey:null}:{};
    else if(url.endsWith('/playroom_online'))result=action==='hub'?{friends:[],conversations:[],rooms:[],invitations:[]}:action==='group-list'?{groups:[]}:action==='unread'?{chats:[]}:action==='inbox'||action==='group-inbox'?{cursor:'0',items:[]}:{};
    else if(url.endsWith('/playroom_host_transfer')){
     if(action==='offer'){assert.equal(uid,aid);assert.equal(d.target,pid);transfer={id:d.id,state:'offered',source:d.source};}
     else if(action==='accept'){assert.equal(uid,bid);transfer.state='accepted';}
     else if(action==='seal'){assert.equal(uid,aid);transfer.digest=d.digest;transfer.revision=d.revision;}
     else if(action==='ready'){assert.equal(uid,bid);assert.equal(d.digest,transfer.digest);transfer.state='ready';}
     else if(action==='commit'){assert.equal(uid,aid);assert.equal(transfer.state,'ready');transfer.state='committed';owner=bid;lease=null;slot=null;}
     else if(action==='check-peer'){assert.equal(uid,bid);assert.equal(d.participantId,transfer.source);}
     else if(action==='status')assert.equal(uid,bid);
     else throw Error('Unexpected transfer action '+action);
     result={state:transfer.state,digest:transfer.digest,revision:transfer.revision,owner};
    }else if(url.endsWith('/playroom_signal')){
     if(action==='host'){assert.equal(uid,owner);lease={epoch:d.epoch,localRoomId:d.localRoomId};}
     else if(action==='poll-host'){assert.equal(uid,owner);result=slot?[slot]:[];}
     else if(action==='request'){assert(uid!==owner);slot={id:require('node:crypto').randomUUID(),userId:uid,offer:null,answer:null};result={id:slot.id,...lease};}
     else if(action==='authorize'){assert.equal(uid,owner);result={userId:d.userId||slot.userId,participantId:(d.userId||slot.userId)===bid?pid:transfer.source};}
     else if(action==='offer'){slot.offer=d.signal;}
     else if(action==='answer'){slot.answer=d.signal;}
     else if(action==='poll')result={offer:slot?.offer,epoch:lease.epoch};
     else throw Error('Unexpected signal '+action);
    }else throw Error('Unexpected RPC '+url);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
   }));
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('tictactoe',false));await page.evaluate(()=>PlayroomAccountUI.service.login('player@example.test','password123'));
  }
  const host=contexts[0].pages()[0],next=contexts[1].pages()[0];await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=network]').check();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.configure(r.id,r.ownerId,{transportMode:'online'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  await host.evaluate(rid=>PlayroomCloudNetwork.host(rid),rid);await next.evaluate(rid=>PlayroomCloudNetwork.connect(rid),rid);await next.locator('.lobby-shell').waitFor();await next.locator('[data-net-seat=seat-2]').click();
  await host.locator('[data-command=lobby-ready]').click();await next.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await next.locator('.network-game').waitFor();
  const session=await host.evaluate(()=>PlayroomNetworkLibrary.transferContext().sessionId);
  await host.evaluate(pid=>{void PlayroomHostTransferUI.start(pid);},pid);await next.locator('[data-confirm-accept]').click();await next.waitForFunction(()=>!!PlayroomNetworkLibrary.transferContext(),null,{timeout:45000});await host.waitForFunction(()=>!!PlayroomNetworkLibrary.transferClient(),null,{timeout:45000});
  assert.equal(owner,bid);assert.equal(transfer.state,'committed');assert.equal(await next.evaluate(()=>PlayroomAppBridge.participantId()),pid);assert.equal(await host.evaluate(()=>PlayroomCloudNetwork.roomId()),rid);assert.equal(await next.evaluate(()=>PlayroomCloudNetwork.isHosting()),true);
  const record=await next.evaluate(async session=>{const r=(await PlayroomNetworkLibrary.transferStore.readPrivate(session)).record;return {owner:r.room.ownerId,device:r.hostDeviceId,profile:PlayroomAppBridge.profile().id};},session);assert.equal(record.owner,pid);assert.equal(record.device,record.profile);assert.notEqual(record.owner,record.profile);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

for(const role of ['spectator','table'])test('live game transfer to '+role+' allows play while waiting for consent',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),pages=[],errors=[],requests=[];
 try{
  for(const name of ['Хост','Новый хост']){const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:844}});context.on('request',r=>{if(/\.supabase\.co\//.test(r.url()))requests.push(r.url());});const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('ludo',false));pages.push(page);}
  const [host,next]=pages;await host.locator('[data-start=ludo]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  await host.locator('#network-pair-button').click();const offer=await host.locator('#net-host-token').inputValue();await next.locator('#network-join-button').click();await next.locator('[data-lobby-online=manual]').click();await next.locator('#net-client-offer textarea[name=offer]').fill(offer);await next.locator('#net-client-offer').evaluate(f=>f.requestSubmit());const answer=await next.locator('#net-client-token').inputValue();await host.locator('#net-host-answer textarea[name=answer]').fill(answer);await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());await next.locator('#net-client-join').waitFor();await next.locator('#net-client-join').evaluate(f=>f.requestSubmit());
  if(role==='table')await next.locator('[data-net-action=table]').click();
  await next.waitForFunction(()=>!!PlayroomNetworkLibrary.transferClient());const target=await next.evaluate(()=>PlayroomNetworkLibrary.transferClient().id);await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await host.locator('.table-shell.network-game').waitFor();await next.locator('.table-shell.network-game').waitFor();
  await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());await host.locator('[data-room-person="'+target+'"]').click();await host.locator('[data-profile-transfer]:not([disabled])').waitFor();const boxes=await host.locator('.participant-profile-actions>button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert(boxes.every((b,i)=>!i||Math.abs((b.left-boxes[i-1].right)-(boxes[1].left-boxes[0].right))<2),'participant actions keep equal gaps '+JSON.stringify(boxes));
  const before=await host.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.revision);await host.locator('[data-profile-transfer]').click();await next.locator('[data-confirm-accept]').waitFor();assert.equal(await host.locator('#modal-root .modal').count(),0,'sender continues on the table while consent is pending');
  await host.locator('.network-game [data-action]').first().click();await host.waitForFunction(before=>PlayroomNetworkLibrary.playerControlContext().snapshot.revision>before,before);
  await next.locator('[data-confirm-accept]').click();await next.waitForFunction(()=>!!PlayroomNetworkLibrary.transferContext(),null,{timeout:45000});await host.waitForFunction(()=>!!PlayroomNetworkLibrary.transferClient(),null,{timeout:45000});
  const actual=await next.evaluate(()=>{const c=PlayroomNetworkLibrary.transferContext();return {owner:c.room.ownerId,role:c.room.participants.find(p=>p.id===c.room.ownerId).role,hostMode:c.room.hostMode,viewer:PlayroomNetworkLibrary.playerControlContext()?.snapshot.viewer,revision:PlayroomNetworkLibrary.playerControlContext()?.snapshot.revision};});assert.equal(actual.owner,target);assert.equal(actual.role,role);assert.equal(actual.hostMode,'table');assert.equal(actual.viewer,-1);assert(actual.revision>before);
  const previous=await host.evaluate(()=>{window.returnChannels=[];const serve=PlayroomWebRTCTransport.serve;PlayroomWebRTCTransport.serve=(channel,connection)=>{returnChannels.push(channel);return serve(channel,connection);};return PlayroomNetworkLibrary.transferClient().id;});await next.evaluate(id=>{void PlayroomHostTransferUI.start(id);},previous);await host.locator('[data-confirm-accept]').click();await host.waitForFunction(()=>!!PlayroomNetworkLibrary.transferContext(),null,{timeout:45000});try{await next.waitForFunction(()=>!!PlayroomNetworkLibrary.transferClient(),null,{timeout:10000});}catch{throw Error('Return diagnostics '+JSON.stringify(await host.evaluate(()=>returnChannels.map(c=>c.__playroomDebug))));}assert.equal(await next.evaluate(()=>PlayroomNetworkLibrary.transferClient().room.participants.find(p=>p.id===PlayroomNetworkLibrary.transferClient().id).role),role,'former spectator/table host reconnects with its original role');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'Network transfer does not signal through Supabase');
 }finally{await browser.close();await server.close();}
});

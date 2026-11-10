'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..'),hasUno=fs.existsSync(path.join(root,'packs/uno/manifest.json'))&&fs.existsSync(path.join(root,'installed-packs.js'));
function server(){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const s=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost'),rel=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve({server:s,url:'http://127.0.0.1:'+s.address().port+'/'})));
}
async function profile(page,name){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});
  await page.goto(page._url);await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
  const diagnostics=await page.evaluate(()=>({
    bridge:!!globalThis.PlayroomAppBridge,network:!!globalThis.PlayroomNetworkDebug,
    multiplayer:!!globalThis.PlayroomMultiplayer,
    resumeStore:typeof globalThis.PlayroomMultiplayer?.ResumeStore,
    scanner:!!globalThis.PlayroomQRScanner,
    profileForm:!!document.getElementById('profile-form'),
    modal:document.getElementById('modal-root')?.innerText.slice(0,250),
    body:document.body?.innerText.slice(0,250)
  }));
  if(!diagnostics.bridge||!diagnostics.network)assert.fail('PlayRoom failed startup: '+JSON.stringify({diagnostics,errors}));
  try{await page.locator('#profile-form input').fill(name,{timeout:8000});}
  catch(error){assert.fail('No profile modal: '+JSON.stringify({diagnostics,errors,error:error.message}));}
  await page.locator('#profile-form').evaluate(f=>f.requestSubmit());
  await page.locator('.game-grid').first().waitFor();
  // This suite exercises reconnect, not the first-turn learning consent modal.
  await page.evaluate(()=>{const store=new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id);for(const game of ['uno','battleship'])store.setEnabled(game,false);});
}
async function qrPng(page,selector){
  // The UI replaces its QR when asynchronous IP discovery completes.
  // Read the current SVG atomically rather than screenshot a detached node.
  const svg=await page.locator(selector).evaluate(node=>node.outerHTML);
  const base64=await page.evaluate(async markup=>{
    const blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
    try{
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=700;canvas.height=700;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,700,700);
      ctx.drawImage(image,0,0,700,700);
      return canvas.toDataURL('image/png').split(',')[1];
    }finally{URL.revokeObjectURL(url);}
  },svg);
  return Buffer.from(base64,'base64');
}
async function pair(host,client,{offerButton=false,photo=false}={}){
  if(offerButton)await host.locator('#network-pair-button').click();
  await host.locator('#net-host-token').waitFor();
  const address=photo?Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address:null;
  if(photo){
    assert.ok(address,'Chromium LAN QR test needs the current host IPv4');
    assert.equal(await host.locator('.pairing-network-choice').isVisible(),true);
    await host.locator('#acoustic-host-address').selectOption('manual');
    await host.locator('#acoustic-host-manual').fill(address);
  }
  const offer=await host.locator('#net-host-token').inputValue();
  const token=await host.evaluate(value=>PlayroomPairing.extract(value),offer);
  assert.match(token,/^PR[23]\./);
  if(photo)assert.ok(token.startsWith('PR3.'),'QR photo test requires the same compact PR3 used on Android');
  await client.locator('#network-join-button').click();await client.locator('[data-lobby-online=manual]').click();
  if(photo){
    const qr=host.locator('#net-host-token-qr svg');await qr.waitFor({timeout:10000});
    const image=await qrPng(host,'#net-host-token-qr svg');
    await client.locator('#net-client-qr-gallery').setInputFiles({name:'offer.png',mimeType:'image/png',buffer:image});
  }else{
    await client.locator('#net-client-offer textarea[name=offer]').fill(offer);
    await client.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
  }
  try{await client.locator('#net-client-token').waitFor({timeout:15000});}
  catch(error){
    const diagnosis=await client.evaluate(()=>({
      status:document.getElementById('net-client-qr-status')?.textContent,
      toast:document.getElementById('toast')?.textContent,
      modal:document.getElementById('modal-root')?.innerText.slice(0,500),
      network:globalThis.PlayroomNetworkDebug?.()
    }));
    assert.fail('QR Offer did not produce an Answer: '+JSON.stringify({diagnosis,message:error.message}));
  }
  if(photo){
    assert.equal(await client.locator('.pairing-network-choice').isVisible(),true);
    await client.locator('#acoustic-client-address').selectOption('manual');
    await client.locator('#acoustic-client-manual').fill(address);
    const answer=await client.locator('#net-client-token').inputValue();
    assert.match(answer,/PR3\./,'QR Answer must also use compact PR3');
  }
  const answer=await client.locator('#net-client-token').inputValue();
  if(photo){
    const qr=client.locator('#net-client-token-qr svg');await qr.waitFor({timeout:10000});
    const image=await qrPng(client,'#net-client-token-qr svg');
    await host.locator('#net-host-qr-gallery').setInputFiles({name:'answer.png',mimeType:'image/png',buffer:image});
  }else{
    await host.locator('#net-host-answer textarea[name=answer]').fill(answer);
    await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
  }
  await host.locator('#net-host-answer').waitFor({state:'detached',timeout:15000});
}
for(const game of ['uno','battleship'])test(game+': guest reload + fresh QR reconnect preserves authority viewer, room seat and rotated secret', {timeout:90000,skip:!hasUno},async()=>{
  const hosted=await server(),{server:listener,url}=hosted;
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await profile(client,'Гость');
    await host.locator('[data-start="'+game+'"]').click();
    await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});
    await host.locator('[data-room-title]').fill('Возвратный стол');
    await host.locator('[data-room-title]').press('Tab');
    await host.locator('.lobby-shell').waitFor();
    await host.locator('#network-pair-button').click();
    await pair(host,client);
    await client.locator('#net-client-join').waitFor();
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();
    await client.locator('[data-net-seat]:not([disabled])').first().click();
    const before=await client.evaluate(()=>{
      const room=PlayroomNetworkDebug().client.room;
      const participantId=PlayroomNetworkDebug().client.participantId;
      const key=Object.keys(localStorage).find(k=>k.startsWith('playroom.network-resume.v1.'));
      return {participantId,entry:key?JSON.parse(localStorage.getItem(key)):null};
    });
    assert.ok(before.participantId&&before.entry?.token?.length===64);
    assert.equal(before.entry.participantId,before.participantId);
    const leaked=await host.evaluate(()=>JSON.stringify(PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id)));
    assert.equal(leaked.includes(before.entry.token),false,'secret must never be in public room state');
    await host.locator('[data-command=lobby-ready]').click();
    await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();
    await host.locator('.table-shell.network-game').waitFor({timeout:12000});
    await client.locator('.table-shell.network-game').waitFor({timeout:12000});
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
    await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');
    assert.equal(await client.locator('.network-reconnect-banner,.network-presence').count(),0,'connection status is shown on player cards without text on the game field');
    if(game==='battleship'){
      // Guest can finish placement before the starter has placed any ships.
      await client.getByRole('button',{name:'Расставить флот',exact:true}).click();
      await client.getByRole('button',{name:'Готово',exact:true}).waitFor();
      await client.getByRole('button',{name:'Готово',exact:true}).click();
      await host.locator('.battle-fields.is-setup').waitFor();
      await host.waitForFunction(()=>[...document.querySelectorAll('.shared-action-row button')].some(button=>button.textContent==='Расставить флот'&&!button.disabled));
      assert(await host.getByRole('button',{name:'Расставить флот',exact:true}).isEnabled(),'guest readiness does not block host setup');
      await host.getByRole('button',{name:'Расставить флот',exact:true}).click();
      await host.getByRole('button',{name:'Готово',exact:true}).click();
      await Promise.all([host,client].map(page=>page.waitForFunction(()=>!document.querySelector('.battle-fields.is-setup'))));
    }
    const previousRevision=await client.locator('.table-shell.network-game').getAttribute('data-revision');
    await client.reload();
    await client.locator('#network-join-button').waitFor();
    await host.locator('.table-tools [data-command=settings]').click();
    await host.locator('#network-pair-button').waitFor();
    await pair(host,client,{offerButton:true,photo:true});
    await client.locator('.table-shell.network-game').waitFor({timeout:15000});
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-revision'),previousRevision);
    const after=await client.evaluate(()=>{
      const identity=PlayroomNetworkDebug().client;
      const key=Object.keys(localStorage).find(k=>k.startsWith('playroom.network-resume.v1.'));
      return {participantId:identity.participantId,entry:key?JSON.parse(localStorage.getItem(key)):null};
    });
    assert.equal(after.participantId,before.participantId);
    assert.notEqual(after.entry.token,before.entry.token,'resume token rotates after successful authentication');
    const hostRoom=await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id));
    assert.equal(hostRoom.participants.filter(p=>p.id===before.participantId).length,1);
    assert.equal(hostRoom.seats[1].participantId,before.participantId);
    assert.equal(hostRoom.participants.find(p=>p.id===before.participantId).connected,true);
    assert.deepEqual(errors,[]);
  }finally{await Promise.all([hc.close(),cc.close()]);await browser.close();await new Promise(done=>listener.close(done));}
});

test('completed guest returns to lobby and recovery cannot reopen the finished table',{timeout:90000,skip:!hasUno},async()=>{
 const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const hc=await browser.newContext({playroomProfile:false}),cc=await browser.newContext({playroomProfile:false});const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  await profile(host,'Хост');await profile(client,'Гость');
  for(const p of [host,client])await p.evaluate(()=>new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id).setEnabled('tictactoe',false));
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  await host.locator('#network-pair-button').click();await pair(host,client);await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());await client.locator('[data-net-seat]:not([disabled])').first().click();await host.locator('[data-command=lobby-ready]').click();await client.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await client.locator('.table-shell.network-game').waitFor();
  await client.locator('[data-command=room]').click();await client.locator('.lobby-shell').waitFor();
  await client.locator('[data-net-action=dismiss-room]').click();
  assert.equal(await client.evaluate(()=>document.getElementById('app').inert),false);
  await client.locator('[data-command=room]').click();await client.locator('.lobby-shell').waitFor();await client.locator('[data-net-action=dismiss-room]').click();
  for(let i=0;i<10;i++){
   if(await client.evaluate(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.state.status==='finished'))break;
   const turn=await host.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.state.turn);const p=turn===0?host:client;
   const before=await p.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.revision);await p.locator('.scene [data-action]:enabled').first().click();await client.waitForFunction(rev=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.revision>rev,before);
  }
  await client.locator('[data-command=result-replay]').waitFor();
  await client.evaluate(()=>PlayroomNetworkLibrary.openRoom());await client.locator('[data-net-action=dismiss-room]').click();
  assert.equal(await client.evaluate(()=>document.getElementById('app').inert),false);
  await client.locator('[data-command=settings]').click();await client.locator('.settings-overview').waitFor();await client.locator('.modal [data-command=close-modal]').first().click();
  await client.locator('[data-command=result]').click();
  await client.locator('[data-command=result-replay]').click();await client.locator('[data-command=history-close]').click();
  await client.evaluate(()=>PlayroomNetworkLibrary.openRoom());await client.locator('.lobby-shell').waitFor();await client.locator('[data-net-action=dismiss-room]').click();
  assert.equal(await client.evaluate(()=>document.getElementById('app').inert),false);
  await client.locator('[data-command=result]').click();
  await client.locator('[data-command=rematch]').click();await client.locator('.lobby-shell').waitFor();assert.equal(await client.locator('.lobby-seat.mine .lobby-ready').count(),0,'finished lobby does not retain human ready state');
  await client.locator('[data-net-action=ready]').click();assert.equal(await client.locator('[data-net-action=ready]').getAttribute('aria-pressed'),'true','readiness is available before the playing host returns');
  await client.locator('[data-net-action=dismiss-room]').click();await client.locator('.game-grid').waitFor();assert.equal(await client.locator('.network-game').count(),0,'disposed game/history must not remain on screen');
  await client.locator('[data-net-action=room]').click();await client.locator('.lobby-shell').waitFor();assert.equal(await client.locator('[data-net-action=ready]').getAttribute('aria-pressed'),'true');
  // The periodic recovery snapshot still describes the host's completed game.
  await client.waitForTimeout(6500);assert(await client.locator('.lobby-shell').isVisible());assert.equal(await client.evaluate(()=>!!PlayroomNetworkLibrary.playerControlContext()),false);
  await host.locator('[data-command=rematch]').click();await client.waitForFunction(()=>PlayroomNetworkLibrary.inviteContext().room.phase==='lobby');assert(await client.locator('.lobby-shell').isVisible());await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.find(p=>p.nickname==='Гость').ready);
  await client.evaluate(()=>{const cloud=PlayroomCloudNetwork;window.PlayroomCloudNetwork={...cloud,roomId:()=> 'cloud-test-room'};window.leaveCalls=[];window.PlayroomSocialUI={...PlayroomSocialUI,service:{perform:async(action,data)=>leaveCalls.push({action,...data})}};});
  await client.locator('[data-net-action=leave]').click();await client.locator('[data-command=confirm-operation]').click();await client.waitForFunction(()=>leaveCalls.length===1);assert.deepEqual(await client.evaluate(()=>leaveCalls),[{action:'leave',roomId:'cloud-test-room'}]);assert.equal(await client.evaluate(()=>PlayroomNetworkLibrary.hasActiveRoom()),false);

 }finally{await browser.close();await new Promise(r=>listener.close(r));}
});

for(const departure of ['kick','leave','bot-change'])test('live replacement '+departure+' preserves the match and resumes with a bot',{timeout:90000,skip:!hasUno},async()=>{
 const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const hc=await browser.newContext({playroomProfile:false}),cc=await browser.newContext({playroomProfile:false}),host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  await profile(host,'Хост');await profile(client,'Гость');for(const p of [host,client])await p.evaluate(()=>new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id).setEnabled('tictactoe',false));
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});await host.locator('#network-pair-button').click();await pair(host,client);await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());await client.locator('[data-net-seat]:not([disabled])').first().click();if(departure==='bot-change')await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.becomeSpectator(r.id,r.ownerId);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-1',{kind:'bot'});b.renderLobby();});else await host.locator('[data-command=lobby-ready]').click();await client.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await client.locator('.table-shell.network-game').waitFor();
  const initial=await host.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot);const actor=initial.state.turn===0?host:client;if(departure!=='bot-change')await actor.locator('.scene [data-action]:enabled').first().click();await host.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.revision>0);
  const before=await host.evaluate(()=>({id:PlayroomNetworkLibrary.playerControlContext().snapshot.sessionId,revision:PlayroomNetworkLibrary.playerControlContext().snapshot.revision}));
  await host.evaluate(()=>PlayroomNetworkLibrary.openRoom());await host.locator('.lobby-shell').waitFor();
  if(departure==='kick'||departure==='bot-change'){const id=await host.evaluate(bot=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.find(p=>bot?p.bot:!p.isHost&&!p.bot).id,departure==='bot-change');await host.locator('[data-kick-participant="'+id+'"]').click();await host.locator('[data-command=confirm-operation]').click();}
  else{await client.evaluate(()=>PlayroomNetworkLibrary.openRoom());await client.locator('[data-net-action=leave]').click();await client.locator('[data-command=confirm-operation]').click();}
  await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).phase==='lobby');const slot=departure==='bot-change'?0:1;await host.waitForFunction(i=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).seats[i].participantId===null,slot);
  const collected=await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id));assert.equal(collected.recovery.sessionId,before.id);assert.equal(collected.seats[slot].closed,false);assert.equal(collected.seats[slot].playerIndex,slot);if(departure==='bot-change'){await client.locator('.room-needs-ready').waitFor();assert.equal(await client.locator('.lobby-shell').count(),0);await client.locator('[data-command=room]').click();await client.locator('.lobby-shell').waitFor();assert.equal(await client.evaluate(()=>PlayroomNetworkLibrary.inviteContext().room.participants.find(p=>p.nickname==='Гость').ready),false);}
  await host.locator('[data-room-cycle=seat-'+(slot+1)+']').click();await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.some(p=>p.bot));if(departure==='bot-change')await client.locator('[data-net-action=ready]').click();else await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).phase==='playing'&&!!PlayroomNetworkLibrary.playerControlContext());
  const resumed=await host.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot);assert.equal(resumed.sessionId,before.id);assert(resumed.revision>=before.revision);assert(resumed.state.players[slot].bot);
 }finally{await browser.close();await new Promise(r=>listener.close(r));}
});

test('cloud-bound RTC recovers the reserved player after local resume data is lost',{timeout:60000,skip:!hasUno},async()=>{
 const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const hc=await browser.newContext({playroomProfile:false}),cc=await browser.newContext({playroomProfile:false}),host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;await profile(host,'Хост');await profile(client,'Гость');
 await host.locator('[data-start=uno]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});const localId=await host.evaluate(()=>PlayroomAppBridge.room().id);
 const connect=async()=>{const offer=await host.evaluate(async()=>{window.boundPeer=await PlayroomNetworkLibrary.cloudHostPeer({identity:{userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'},check:()=>{},validate:()=>{}});return boundPeer.offer;});const answer=await client.evaluate(async value=>{window.boundClient=await PlayroomWebRTCTransport.createClientPeer(value);return boundClient.answer;},offer);await host.evaluate(value=>boundPeer.accept(value),answer);await client.evaluate(id=>PlayroomNetworkLibrary.cloudAttachClient(boundClient,id),localId);await client.locator('.lobby-shell').waitFor();};
 await connect();await client.locator('[data-net-seat]:not([disabled])').first().click();const participant=await client.evaluate(()=>PlayroomNetworkDebug().client.participantId);await client.evaluate(()=>{PlayroomNetworkLibrary.leaveClientRoom();for(const key of Object.keys(localStorage))if(key.startsWith('playroom.network-resume.v1.'))localStorage.removeItem(key);});await host.waitForFunction(()=>!PlayroomAppBridge.room().participants.find(p=>p.nickname==='Гость').connected);
 await connect();assert.equal(await client.evaluate(()=>PlayroomNetworkDebug().client.participantId),participant);assert.equal(await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.filter(p=>p.nickname==='Гость').length),1);assert.equal(await client.locator('.lobby-seat.mine').count(),1);await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');await client.locator('[data-net-action=ready]').click();await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.find(p=>p.nickname==='Гость').ready);
 }finally{await browser.close();await new Promise(r=>listener.close(r));}
});


test('offline readiness replays safely and automatic countdown can be cancelled by one player',{timeout:90000,skip:!hasUno},async()=>{
 const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const hc=await browser.newContext({playroomProfile:false}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  await cc.addInitScript(()=>{const Native=RTCPeerConnection,get=Object.getOwnPropertyDescriptor(Native.prototype,'connectionState').get;window.readyTestState=null;window.readyTestPeers=[];Object.defineProperty(Native.prototype,'connectionState',{configurable:true,get(){return readyTestState||get.call(this);}});window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);readyTestPeers.push(this);}};});
  await profile(host,'Хост');await profile(client,'Гость');
  for(const p of [host,client])await p.evaluate(()=>new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id).setEnabled('tictactoe',false));
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  await host.locator('#network-pair-button').click();await pair(host,client);await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());await client.locator('[data-net-seat]:not([disabled])').first().click();
  await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');
  await client.evaluate(()=>{readyTestState='disconnected';readyTestPeers.forEach(peer=>peer.dispatchEvent(new Event('connectionstatechange')));});
  await client.locator('[data-net-action=ready]').click();assert.equal(await client.locator('[data-net-action=ready]').getAttribute('aria-pressed'),'true',JSON.stringify(await client.evaluate(()=>({debug:PlayroomNetworkDebug().client,toast:document.getElementById('toast')?.textContent,room:PlayroomNetworkLibrary.inviteContext()?.room?.phase}))));
  assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.nickname==='Гость').ready),false);
  await client.locator('[data-net-action=ready]').click();assert.equal(await client.locator('[data-net-action=ready]').getAttribute('aria-pressed'),'false');await client.locator('[data-net-action=ready]').click();
  await client.locator('[data-net-action=dismiss-room]').click();assert.equal(await client.evaluate(()=>document.getElementById('app').inert),false);await client.locator('[data-net-action=room]').click();assert.equal(await client.locator('[data-net-action=ready]').getAttribute('aria-pressed'),'true');
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'random'});b.renderLobby();});
  await client.evaluate(()=>{readyTestState=null;readyTestPeers.forEach(peer=>peer.dispatchEvent(new Event('connectionstatechange')));});await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');
  assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.nickname==='Гость').ready),false,'changed configuration must discard queued readiness');
  await client.evaluate(()=>{readyTestState='disconnected';readyTestPeers.forEach(peer=>peer.dispatchEvent(new Event('connectionstatechange')));});await client.locator('[data-net-action=ready]').click();
  await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-room-auto-start]').check();await client.locator('.lobby-auto-start-note').waitFor();assert.equal(await client.locator('.lobby-auto-start-note').evaluate(e=>getComputedStyle(e).fontStyle),'italic');
  await client.evaluate(()=>{readyTestState=null;readyTestPeers.forEach(peer=>peer.dispatchEvent(new Event('connectionstatechange')));});await client.waitForFunction(()=>PlayroomNetworkDebug().client.recovery?.state==='connected');await client.locator('.lobby-countdown').waitFor();assert.equal(await client.locator('.table-shell.network-game').count(),0,'countdown stays in lobby');
  await client.locator('.lobby-countdown [data-net-action=ready]').click();await client.locator('.lobby-countdown').waitFor({state:'detached'});
  const stopped=await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id));assert.equal(stopped.phase,'lobby');assert.equal(stopped.participants.find(p=>p.isHost).ready,true);assert.equal(stopped.participants.find(p=>p.nickname==='Гость').ready,false);
  await host.locator('[data-room-auto-start]').uncheck();await client.locator('.lobby-auto-start-note').waitFor({state:'detached'});await host.locator('[data-room-auto-start]').check();await client.locator('.lobby-auto-start-note').waitFor();
  await client.locator('[data-net-action=ready]').click();await client.locator('.lobby-countdown').waitFor();assert.equal(await client.locator('.table-shell.network-game').count(),0);await client.locator('.table-shell.network-game').waitFor();await host.locator('.table-shell.network-game').waitFor();
 }finally{await browser.close();await new Promise(r=>listener.close(r));}
});


for(const role of ['spectator','table'])test(`observer host ${role} automatically returns to lobby after completion without delaying players`,{timeout:90000,skip:!hasUno},async()=>{
 const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const hc=await browser.newContext({playroomProfile:false}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  await profile(host,'Хост');await profile(client,'Гость');
  for(const p of [host,client])await p.evaluate(()=>new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id).setEnabled('tictactoe',false));
  await host.evaluate(()=>{
   const transport=PlayroomWebRTCTransport,subscribe=transport.subscribeAuthorized;
   transport.subscribeAuthorized=(connection,listener,authorize,options)=>subscribe(connection,listener,authorize||(()=>new Promise(resolve=>setTimeout(resolve,150))),options);
  });
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=network]').check();
  await host.evaluate(role=>{const b=PlayroomAppBridge,r=b.room();if(role==='spectator')b.roomService.becomeSpectator(r.id,r.ownerId);else b.roomService.claimTable(r.id,r.ownerId);b.renderLobby();},role);
  await host.locator('#network-pair-button').click();await pair(host,client);await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());await client.locator('[data-net-seat]:not([disabled])').first().click();
  await host.locator('[data-room-auto-start]').check();await client.locator('.lobby-auto-start-note').waitFor();
  const alignment=await client.locator('.lobby-auto-start-note').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.querySelector('[data-net-action=ready]').getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2);});assert(alignment<1,'autostart label is vertically centred');
  await client.locator('[data-net-action=ready]').click();await client.locator('.table-shell.network-game').waitFor();
  for(let i=0;i<10;i++){
   await client.waitForFunction(()=>{const c=PlayroomNetworkLibrary.playerControlContext();return c&&(c.snapshot.state.status==='finished'||c.snapshot.state.turn===c.snapshot.viewer&&!c.client?.pending);});
   if(await client.evaluate(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.state.status==='finished'))break;
   const before=await client.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.revision);await client.locator('.scene [data-action]:enabled').first().click();await client.waitForFunction(rev=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.revision>rev,before);
  }
  await client.locator('[data-command=rematch]').waitFor();await host.waitForFunction(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).phase==='lobby');
  const owner=await host.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.isHost));assert.equal(owner.role,role);assert.equal(owner.ready,false);
  await client.locator('[data-command=rematch]').click();await client.locator('[data-net-action=ready]:not(:disabled)').waitFor();await client.locator('[data-net-action=ready]').click();await client.locator('.lobby-countdown').waitFor();assert.equal(await client.locator('.network-game').count(),0);
  await client.locator('.lobby-countdown [data-net-action=ready]').click();await client.locator('.lobby-countdown').waitFor({state:'detached'});
 }finally{await browser.close();await new Promise(r=>listener.close(r));}
});

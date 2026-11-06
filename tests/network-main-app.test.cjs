'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
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
async function profile(page,name){await page.goto(page._url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();}
async function value(page,selector){return page.locator(selector).inputValue();}

test('main app: public Table over WebRTC shares moves with a player without gaining private viewer rights',{timeout:90000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),tc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),pc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});
 const host=await hc.newPage(),table=await tc.newPage(),phone=await pc.newPage(),errors=[];host._url=url;table._url=url;phone._url=url;
 for(const page of [host,table,phone]){page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));}
 try{
  await profile(host,'Анна');await profile(table,'Стол');await profile(phone,'Борис');
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-game-mode=hotseat]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.locator('[data-room-auto-start]').uncheck();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  async function join(page){
   await host.locator('#network-pair-button').click();await host.locator('#net-host-token').waitFor();
   const offer=await value(host,'#net-host-token');
   await page.locator('#network-join-button').click();await page.locator('.connection-alternative>summary').click();await page.locator('[data-lobby-online=manual]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
   await page.locator('#net-client-token').waitFor();
   await host.locator('#net-host-answer textarea[name=answer]').fill(await value(page,'#net-client-token'));await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(form=>form.requestSubmit());
   await page.locator('.lobby-shell').waitFor();
  }
  await join(phone);await phone.locator('[data-net-seat]:not([disabled])').first().click();await join(table);
  await phone.locator('.lobby-avatar-wrap[data-quick-reaction]').click();await phone.locator('[data-quick-emoji=":nice:"]').click();await host.locator('.avatar-message-bubble').filter({hasText:':nice:'}).waitFor();
  if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await host.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'lobby-reaction.png')});}
  await phone.locator('[data-room-person]').filter({hasText:'Борис'}).click();await phone.locator('[data-command=profile-edit]').click();await phone.locator('[data-local-profile-avatar]').click();await phone.locator('[data-avatar-option=star-yellow]').click();await phone.locator('button[form=local-profile-editor]').click();
  await host.waitForFunction(()=>PlayroomAppBridge.room().participants.some(p=>p.nickname==='Борис'&&p.avatar==='star-yellow'));await phone.locator('.modal [data-command=close-modal]').click();
  await phone.locator('[data-net-action=settings]').click();await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'room',id:'missed-in-settings',body:'Сообщение, пока открыты настройки'}));
  await phone.evaluate(()=>PlayroomChatActivity.poll());assert.equal((await phone.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'}))).room,1);
  await phone.locator('.modal [data-command=close-modal]').click();await phone.bringToFront();await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'room',id:'seen-in-lobby',body:'Это видно в лобби'}));
  await phone.waitForFunction(async()=>{const s=await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'});return s.room===1;});await phone.evaluate(()=>PlayroomChatActivity.poll());await phone.locator('[data-room-chat-open] .chat-counter-messages').filter({hasText:'1'}).waitFor();
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'lobby-unread.png')});
  await phone.locator('[data-room-chat-open]').click();await phone.locator('[data-room-chat-messages]').filter({hasText:'открыты настройки'}).waitFor();await phone.waitForFunction(async()=>{const s=await PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'});return s.room===0;});await phone.locator('.modal [data-command=close-modal]').click();
  await table.locator('[data-net-action=table]').click();
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
  assert.equal(await host.locator('.table-tools [data-command=history]').count(),0);
  const fieldBeforeChat=await host.locator('.scene').boundingBox();await host.evaluate(()=>window.chatSceneBefore=document.querySelector('.scene'));
  await host.locator('.table-tools [data-room-chat-open]').click();
  await host.locator('.game-chat-panel').waitFor();assert.equal(await host.locator('#app').evaluate(e=>e.inert),false);assert.deepEqual(await host.locator('.scene').boundingBox(),fieldBeforeChat);assert(await host.evaluate(()=>chatSceneBefore===document.querySelector('.scene')));
  const panelBefore=await host.locator('.game-chat-panel').boundingBox();const grip=await host.locator('[data-game-chat-resize]').boundingBox();await host.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await host.mouse.down();await host.mouse.move(grip.x+grip.width/2-80,grip.y+grip.height/2,{steps:5});await host.mouse.up();assert((await host.locator('.game-chat-panel').boundingBox()).width>panelBefore.width+50);assert.deepEqual(await host.locator('.scene').boundingBox(),fieldBeforeChat);
  await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Черновик панели');await host.locator('.game-chat-panel [data-command=close-modal]').click();await host.locator('.game-chat-launcher').click();assert.equal(await host.locator('[data-room-chat-form] textarea').inputValue(),'Черновик панели');
await host.locator('[data-room-chat-messages]').filter({hasText:':wow:'}).waitFor();assert.equal(await host.locator('[data-room-chat-tabs]').isVisible(),false);
  await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Длинное сообщение комнаты. '.repeat(20));await host.locator('[data-room-chat-form] [type=submit]').click();
  await phone.locator('.room-message-bubble').waitFor();assert((await phone.locator('.room-message-bubble').boundingBox()).width<=230);assert.equal(await phone.locator('.room-message-bubble>span').evaluate(e=>getComputedStyle(e).webkitLineClamp),'2');assert((await phone.locator('.room-message-bubble').innerText()).endsWith('…'));
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'room-message-bubble.png')});
  await phone.bringToFront();await phone.evaluate(()=>PlayroomRoomChatUI.show());await phone.locator('[data-room-chat-messages]').filter({hasText:'Длинное сообщение комнаты.'}).waitFor();assert.equal(await phone.locator('.room-chat-game strong').innerText(),'Крестики-нолики');
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'room-chat-390.png'),animations:'disabled'});
  await phone.locator('[data-room-chat-content][data-reply-support=true]').waitFor();const parentMessage=phone.locator('.chat-message').filter({hasText:'Длинное сообщение комнаты.'}).last();const beforeReaction=await phone.locator('.chat-message').count();await parentMessage.locator('p').click();await phone.locator('[data-quick-emoji=":nice:"]').click();
  await parentMessage.locator('[data-chat-react-emoji=":nice:"][aria-pressed=true]').waitFor();assert.equal(await phone.locator('.chat-message').count(),beforeReaction,'attached reaction creates no extra message');await host.locator('[data-chat-react-emoji=":nice:"]').waitFor();
  await parentMessage.locator('p').click();await phone.locator('[data-chat-message-action=reply]').click();await phone.locator('[data-chat-reply]:not([hidden])').waitFor();await phone.locator('[data-room-chat-form] [data-chat-editor]').fill('Ответ на сообщение');
  await phone.locator('.game-chat-panel [data-command=close-modal]').click();await phone.locator('.game-chat-launcher').click();assert.equal(await phone.locator('[data-room-chat-form] textarea').inputValue(),'Ответ на сообщение');await phone.locator('[data-chat-reply]:not([hidden])').waitFor();
  await phone.locator('[data-room-chat-form] [type=submit]').click();const replied=host.locator('.chat-message').filter({hasText:'Ответ на сообщение'});await replied.locator('[data-chat-reply-jump]').waitFor();assert.match(await replied.locator('[data-chat-reply-jump]').innerText(),/Длинное сообщение комнаты/);await phone.locator('[data-chat-reply]').waitFor({state:'hidden'});
  if(process.env.PLAYROOM_CAPTURE_DIR)await phone.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'chat-reply-reactions.png'),animations:'disabled'});
  await host.locator('[data-room-chat-refresh]').click();await host.locator('.chat-message.mine .message-receipt.is-read').first().waitFor();
  await phone.locator('.modal-head [data-command=close-modal]').click();await host.locator('.modal-head [data-command=close-modal]').click();
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
   assert.notEqual(await host.locator('[data-room-chat-form] textarea').inputValue(),'Черновик прежнего участника');
   await host.locator('.game-chat-panel [data-command=close-modal]').click();
  }
  await table.locator('.network-game[data-viewer="-1"] .ttt-cell[data-action]').first().waitFor();
  await table.locator('.ttt-cell').nth(4).click();await host.locator('.ttt-cell.cross').waitFor();
  await phone.locator('.ttt-cell[data-action]').first().waitFor();if(await phone.locator('[data-learning-choice=no]').isVisible())await phone.locator('[data-learning-choice=no]').click();await phone.locator('.ttt-cell').nth(0).click();
  await host.locator('.ttt-cell.nought').waitFor();
  await table.locator('.ttt-cell[data-action]').first().waitFor();await table.locator('.ttt-cell').nth(1).click();
  await table.waitForFunction(()=>document.querySelectorAll('.ttt-cell.cross').length===2);
  assert.equal(await table.locator('.network-game').getAttribute('data-viewer'),'-1');
  assert.equal(await host.locator('.network-game').getAttribute('data-viewer'),'0');
  await table.locator('[data-game-menu]').click();await table.locator('[data-command=history]').click();await table.locator('#replay-range').waitFor();
  assert.equal(await table.locator('.ttt-cell[data-action]').count(),0);
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
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await profile(client,'Клиент');
    await host.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await client.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await host.locator('[data-start="uno"]').click();
    await host.locator('[data-room-option=transportMode][value=network]').check();await host.locator('[data-room-auto-start]').uncheck();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});
    assert.equal(await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).autoStart),false);
    await host.locator('[data-room-title]').fill('Тестовая комната');
    await host.locator('[data-room-title]').press('Tab');
    await host.locator('.lobby-shell').waitFor();await host.locator('#network-pair-button').click();
    // Every ICE candidate supplied by the browser is visible in the IP selector;
    // manual choice remains available for browsers that hide interfaces behind mDNS.
    await host.locator('[data-net-scan="host"]').waitFor();
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
      await client.locator('#network-join-button').click();await client.locator('.connection-alternative>summary').click();await client.locator('[data-lobby-online=manual]').click();
      await client.locator('#net-client-offer textarea[name=offer]').fill(offerLink);
      await client.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    }
    await client.locator('#net-client-token').waitFor();
    const answerLink=await value(client,'#net-client-token');
    const answerToken=await client.evaluate(link=>PlayroomPairing.extract(link),answerLink);
    assert.match(answerToken||'',/^PR[23]\./);
    assert.equal(await client.locator('#net-client-token-qr').count(),1);
    if(pwaHandoff){
      await host.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),answerToken);
    }else{
      await host.locator('#net-host-answer textarea[name=answer]').fill(answerLink);
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
    assert.match(await client.locator('.modal').innerText(),/Тестовая комната/);
    assert.match(await client.locator('.modal').innerText(),/UNO/);
    assert.match(await client.locator('.modal').innerText(),/Объявление UNO/);
    assert.match(await client.locator('.modal').innerText(),/Объявление UNO[\s\S]*Вручную/);
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();

    assert.equal(await client.locator('.lobby-shell input,.lobby-rules-summary,.lobby-participants').count(),0);
    await client.locator('[data-net-action=rules]').click();
    assert.equal(await client.locator('.modal .rulebook-config').count(),1);
    assert(await client.locator('.modal .rulebook-main').innerText().then(text=>text.length>100));
    assert.match(await client.locator('.modal .rulebook-config').innerText(),/Объявление UNO[\s\S]*Вручную/);
    await client.locator('.modal [data-command=close-modal]').click();
    await client.locator('[data-net-action=settings]').click();
    await client.locator('#net-client-nickname input').fill('Клиент новый');
    await client.locator('.modal [data-command=close-modal]').click();
    await host.locator('.lobby-person').filter({hasText:'Клиент новый'}).waitFor();
    assert.equal(await client.evaluate(()=>document.querySelector('#app').inert),true,'nickname ACK must preserve modal inert');
    await client.locator('[data-net-action=settings]').click();await client.locator('#net-client-nickname input').fill('Клиент');
    await client.locator('.modal [data-command=close-modal]').click();

    const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();
    await host.locator('.lobby-person').filter({hasText:'Клиент'}).waitFor();
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
    const hostRole=host.locator('.player-panel [data-participant-role=player]:has(svg[data-ui-icon=host])');
    assert.equal(await hostRole.locator('svg[data-ui-icon=player]').count(),0,'Host crown replaces the network-player icon');
    assert.equal(await hostRole.locator('svg[data-ui-icon=host]').count(),1,'Network host keeps one crown');
    const iconHandle=await hostRole.elementHandle();
    await host.waitForTimeout(800);assert(await iconHandle.evaluate(node=>node.isConnected),'unchanged presence must preserve the role node and avoid a DOM observer loop');
    // Network mode MUST use the local bot/hot-seat GameScreen, not a compact
    // second shell. Opponent hands are visible without exposing hidden faces.
    for(const page of [host,client]){
      assert.equal(await page.locator('.table-shell.network-game .table-header').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .player-panel .player-token').count(),2);
      assert.equal(await page.locator('.table-shell.network-game .layout-participants').isVisible(),true);
      assert.equal(await page.locator('.table-shell.network-game .scene .opponent-hand').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .scene .own-hand').count(),1);
      assert.equal(await page.locator('.table-tools [data-command=history] svg').count(),0);
      assert.equal(await page.locator('.table-tools [data-room-chat-open] svg').count(),1);
      assert.equal(await page.locator('.table-tools [data-command=rules] svg').count(),0);
      assert.equal(await page.locator('.opponent-hand .uno-art-face').count(),0,'Opponent private card faces must stay hidden');
    }
    for(const page of [host,client]){
      await page.locator('.table-tools [data-command=settings]').click();
      for(const selector of ['#setting-scale','#setting-volume','#setting-speed','#setting-quick-play'])assert.equal(await page.locator(selector).count(),1,'shared network setting '+selector);
      await page.locator('#setting-learning-enabled').uncheck();
      assert.equal(await page.locator('#setting-auto-pass').count(),0,'hotseat option does not apply to network');
      await page.locator('.modal [data-shared-rules],.modal [data-quick-shortcut][data-command=rules]').click();assert.match(await page.locator('.modal').innerText(),/^Правила/);await page.locator('.modal [data-command=close-modal]').click();
      await page.locator('.settings-overview').waitFor();await page.locator('.modal [data-command=close-modal]').click();
    }
    const menuIdentity=await client.evaluate(()=>({id:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length}));
    await client.locator('.table-heading [data-command=home]').click();
    await client.locator('.game-grid').first().waitFor();
    assert.equal(await client.evaluate(()=>PlayroomNetworkDebug().client.channel),'connected');
    assert.equal(await client.locator('.network-resume-card .transport-badge svg[data-ui-icon=wifi]').count(),1);
    assert.equal(await client.locator('#network-return-button').innerText(),'');
    assert.equal(await client.locator('.network-resume-card [data-net-action=leave-active]').count(),1);
    await client.locator('[data-command=sessions]').click();await client.locator('.saved-self').first().waitFor();assert.equal(await client.locator('.saved-self').first().innerText(),'Клиент');await client.locator('.side-nav [data-command=home]').click();

    const before=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
    const action=host.locator('.table-shell.network-game .scene [data-action]').first();await action.waitFor();await action.click();
    await host.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.equal(await client.locator('.network-game').count(),0,'background snapshots must not replace the menu');
    await client.locator('[data-net-action=return-game]').click();
    await client.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.deepEqual(await client.evaluate(()=>({id:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length})),menuIdentity,'return reuses the same participant and RTC');
    assert.ok(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'))>before);
    // History is the same inline panel as local play, read-only and not a
    // detached modal with a lone slider. Its navigation does not move live game.
    const latest=Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'));
    await client.locator('.table-tools [data-command=settings]').click();
    await client.locator('.modal [data-command=history]').click();
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
    await client.locator('.table-heading [data-command=history-close]').click();
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
      await page.waitForFunction(selector=>document.querySelector('.scene')?.getAttribute('aria-busy')!=='true'&&
        [...document.querySelectorAll(selector)].some(node=>!node.disabled&&!node.closest('[inert]')&&node.getClientRects().length),ordinaryAction,{timeout:10000});
      return page;
    }));
    assert.equal(await host.locator('.table-tools #network-pair-button').count(),0);
    assert.equal(await host.locator('.table-tools button').count(),4);
    await host.locator('.table-tools [data-command=settings]').click();
    assert.equal(await host.locator('.modal #network-pair-button').count(),0,'invitations belong to the lobby, not settings');
    await host.locator('.modal [data-command=close-modal]').click();
    for(const exit of ['guest','host']){
      const primaryPositions=await Promise.all([host,client].map(async page=>{
        assert.equal(await page.locator('.table-tools [data-command=room],.table-tools [data-net-action=room]').count(),1,JSON.stringify(await page.evaluate(()=>({live:PlayroomNetworkLibrary.playerControlContext()?.snapshot?.state?.status,history:!!document.querySelector('.history-panel'),head:[...document.querySelectorAll('.table-tools button')].map(b=>b.dataset.command||b.dataset.netAction)}))));
        assert.equal(await page.locator('.table-tools [data-command=result]').count(),0);
        return page.locator('.table-tools [data-game-primary]').boundingBox();
      }));
      const actor=await ordinaryPlayer();
      await actor.locator(ordinaryAction).first().click();
      await host.locator('.shared-modal-backdrop').waitFor();
      await client.locator('.shared-modal-backdrop').waitFor();
      for(const [i,page] of [host,client].entries()){
        assert.equal(await page.locator('.table-tools [data-command=room],.table-tools [data-net-action=room]').count(),0);
        assert.equal(await page.locator('.table-tools [data-command=result]').count(),1);
        const b=await page.locator('.table-tools [data-game-primary]').boundingBox();assert(Math.abs(b.y-primaryPositions[i].y)<1,'result must stay on the same toolbar row');assert.equal(b.width,primaryPositions[i].width);assert.equal(b.height,primaryPositions[i].height);
      }
      assert.equal(await client.locator('.shared-modal-backdrop [data-command=close-modal]').count(),0,'network results offer history and room, without dismiss/exit');
      assert.equal(await client.locator('.shared-modal-backdrop [data-command=rematch]').count(),1);
      await client.locator('.shared-modal-backdrop [data-command=result-replay]').click();
      await client.locator('.history-panel').waitFor();
      await client.locator('#replay-range').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await client.waitForFunction(()=>document.querySelector('#replay-range').value==='0'&&document.querySelector('.history-panel').getAttribute('aria-busy')==='false');
      assert.equal(await client.locator('.table-tools [data-command=result]').count(),1);
      assert.equal(await client.locator('.table-tools [data-command=room],.table-tools [data-net-action=room]').count(),0);
      if(process.env.PLAYROOM_CAPTURE_DIR&&exit==='guest')await client.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'network-finished-history.png')});
      await client.locator('[data-command=history-close]').click();
      await client.locator('[data-command=result]').click();
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
        await client.locator('[data-command=history-close]').click();await client.locator('[data-command=result]').click();
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
    await host.locator('.table-tools [data-command=settings]').click();
    await host.locator('.modal [data-command=pause]').click();
    await host.waitForFunction(()=>document.querySelector('.table-status')?.textContent.includes('Пауза'));
    const parked=await host.evaluate(async()=>{
      const item=(await PlayroomNetworkLibrary.list()).find(item=>item.role==='host'&&!item.finished);
      return {id:item.sessionId,revision:Number(document.querySelector('.network-game').dataset.revision)};
    });
    await host.locator('.table-header [data-command=home]').click();
    await host.locator('.game-grid').first().waitFor();
    await host.locator('[data-command=sessions]').click();
    assert.equal(await host.locator('.saved-self').first().innerText(),'Хост');
    assert.equal(await host.locator(`[data-network-continue="${archiveId}"]`).isDisabled(),true,'Completed matches cannot continue');
    await host.locator(`[data-network-history="${archiveId}"]`).click();
    await host.locator('.table-shell.network-game .history-panel').waitFor();
    await host.locator('.table-shell.network-game .table-heading [data-command=history-close]').first().click();
    await host.locator(`[data-network-continue="${parked.id}"]`).click();
    await host.locator('.table-shell.network-game').waitFor();
    assert.equal(Number(await host.locator('.network-game').getAttribute('data-revision')),parked.revision);
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1,'menu and archive browsing retain RTC');
    await host.locator('[data-command=room]').click();
    await host.locator('.lobby-header [data-command=close-modal]').click();
    assert.equal(await host.locator('.network-game').count(),1);
    await host.locator('[data-command=room]').click();await host.locator('[data-net-action=stop-match]').click();
    await host.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await host.locator('[data-net-action=stop-match]').count(),1,'cancel keeps the match running');
    await host.locator('[data-net-action=stop-match]').click();await host.locator('[data-command=confirm-operation]').click();
    await host.locator('.lobby-shell [data-command=lobby-start]').waitFor();await client.locator('.lobby-shell').waitFor();
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),1,'Stop keeps RTC room peers');
    assert.equal((await host.evaluate(async id=>(await PlayroomNetworkLibrary.list()).find(x=>x.sessionId===id),parked.id)).finished,false);
    await host.locator('[data-command=lobby-leave]').click();
    await host.locator('[data-confirm-accept]').click();
    await host.locator('[data-command=sessions]').click();
    await host.locator(`[data-network-continue="${parked.id}"]`).click();
    await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').count(),0,'Recovery waits for the original players in the lobby');
    assert.equal(await host.locator('.lobby-person').filter({hasText:'Клиент'}).count(),1);
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
  }catch(error){console.error('Network UI page errors',JSON.stringify(errors));if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});for(const [name,page] of [['host',host],['player',client]]){await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,name+'-failure.png')});console.error(name+' UI',await page.locator('.modal,.table-tools').allTextContents());}}throw error;}finally{await Promise.all([hc.close(),cc.close()]);await browser.close();if(s)await new Promise(r=>s.close(r));}
});

test('cloud rendezvous: two real RTC clients resume the same playing seat after full page reload',{timeout:90000},async()=>{
 const {s,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const h=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),c=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),host=await h.newPage(),client=await c.newPage(),errors=[];
 const cloudId='00000000-0000-4000-8000-000000000001',hostId='00000000-0000-4000-8000-000000000002',userId='00000000-0000-4000-8000-000000000003',boundId='00000000-0000-4000-8000-000000000004';
 let lease=null,slot=null,requests=0,identityReads=0,compactPolls=0;const joinTimes=[];
 await c.addInitScript(()=>{const Native=window.RTCPeerConnection;window.testCloudPeers=[];window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);window.testCloudPeers.push(this);}};});
 for(const context of [h,c])await context.addInitScript(()=>{let api;Object.defineProperty(globalThis,'PlayroomIceConfig',{configurable:true,get:()=>api,set:value=>{api={...value,credentials:async()=>({configuration:{iceServers:[]},expiresAt:Date.now()+86400000,diagnosticsEnabled:false})};}});});
 for(const [context,uid] of [[h,hostId],[c,userId]])await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',require('./account-sync-fixture.cjs')(async route=>{
  const req=route.request();requests++;let result;
  if(req.url().includes('/auth/')){const user={id:uid,email:uid+'@example.test',is_anonymous:false};result=req.url().endsWith('/user')?user:{user,access_token:'access-'+uid,refresh_token:'refresh-'+uid,expires_in:3600};}
  else if(req.url().endsWith('/playroom_push')){const action=req.postDataJSON().p_action;assert(['config','room-message','game-state'].includes(action),action);result=action==='config'?{ready:false,publicKey:null}:{};}
  else if(req.url().endsWith('/playroom_online')){const action=req.postDataJSON().p_action;assert(['presence','unread','inbox','group-inbox','hub','group-list'].includes(action));result=action==='presence'?{}:action==='hub'?{friends:[],rooms:[],invitations:[],conversations:[]}:action==='group-list'?{groups:[]}:action==='unread'?{chats:[]}:{cursor:'0',items:[]};}
  else if(req.url().endsWith('/playroom_cloud_saves_rpc'))result={enabled:false,entries:[],used:0,limit:10485760};
  else if(req.url().endsWith('/playroom_social')){assert.equal(req.postDataJSON().p_action,'list');result={profile:{id:uid,nickname:'Игрок'},friends:[],rooms:[],invitations:[]};}
  else{
   assert(req.url().endsWith('/playroom_signal'));const {p_action:action,p_data:d}=req.postDataJSON();assert.equal(d.roomId,cloudId);
   if(action==='host'){assert.equal(uid,hostId);lease={epoch:d.epoch,localRoomId:d.localRoomId};result={};}
   else if(action==='poll-host'){assert.equal(uid,hostId);if(d.known?.length)compactPolls++;result=slot?[{...slot,participantId:boundId,...(d.known?.includes(slot.id)?{offer:null,answer:null}:{})}]:[];}
   else if(action==='request'){assert.equal(uid,userId);slot={id:require('node:crypto').randomUUID(),userId,offer:null,answer:null};result={id:slot.id,...lease};}
   else if(action==='authorize'){if(d.id)identityReads++;assert.equal(uid,hostId);result={userId,participantId:boundId};}
   else if(action==='offer'){assert.equal(uid,hostId);assert.equal(d.id,slot.id);if(slot.offer)assert.equal(slot.offer,d.signal);slot.offer=d.signal;result={};}
   else if(action==='poll'){assert.equal(uid,userId);assert.equal(d.id,slot.id);result={offer:slot.offer,epoch:lease.epoch};}
   else if(action==='answer'){assert.equal(uid,userId);assert.equal(d.id,slot.id);slot.answer=d.signal;result={};}
   else throw Error('Unexpected action '+action);
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 }));
 for(const p of [host,client]){p._url=url;p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));}
 try{
  await profile(host,'Хост');await profile(client,'Игрок');assert.equal(requests,0);
  await host.evaluate(()=>PlayroomAccountUI.service.login('host@example.test','password123'));await client.evaluate(()=>PlayroomAccountUI.service.login('client@example.test','password123'));
  await host.locator('[data-start=tictactoe]').click();await host.locator('[data-room-option=transportMode][value=online]').check();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.renderLobby();});
  await host.evaluate(id=>PlayroomCloudNetwork.host(id),cloudId);
  {const started=Date.now();await client.evaluate(id=>PlayroomCloudNetwork.connect(id),cloudId);joinTimes.push(Date.now()-started);}
  await client.locator('.lobby-shell').waitFor();await client.locator('[data-net-seat]:not([disabled])').first().click();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  await host.locator('[data-command=lobby-ready]').click();await client.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
  await client.locator('.network-game[data-viewer="1"]').waitFor();await host.locator('.ttt-cell[data-action]').first().click();await client.locator('.ttt-cell.cross').waitFor();
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
  await client.locator('.ttt-cell[data-action]').first().click();await host.locator('.ttt-cell.nought').waitFor();
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
  await host.locator('[data-start=ludo]').click();await host.locator('[data-game-mode=hotseat]').click();await host.locator('[data-room-option=transportMode][value=network]').check();await host.locator('[data-room-auto-start]').uncheck();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setAutoStart(r.id,r.ownerId,false);b.roomService.updateRules(r.id,r.ownerId,{...r.rules,preset:'teams'});for(const id of ['seat-2','seat-3'])b.roomService.setLocalSeat(r.id,r.ownerId,id,{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-4',{kind:'bot',nickname:'Бот'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});
  for(const [page,seat] of [[enemy,'seat-2'],[ally,'seat-3']]){
   await host.locator('#network-pair-button').click();await host.locator('#net-host-token').waitFor();const offer=await value(host,'#net-host-token');
   await page.locator('#network-join-button').click();await page.locator('.connection-alternative>summary').click();await page.locator('[data-lobby-online=manual]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());await page.locator('#net-client-token').waitFor();
   await host.locator('#net-host-answer textarea[name=answer]').fill(await value(page,'#net-client-token'));await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator(`[data-net-seat="${seat}"]`).click();
  }
  await host.locator('[data-command=lobby-ready]').click();for(const page of [enemy,ally])await page.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();for(const page of pages)await page.locator('.network-game').waitFor();
  await host.evaluate(()=>PlayroomRoomChatUI.show());await host.locator('[data-room-chat-tab=team]').click();await host.locator('[data-room-chat-form] [data-chat-editor]').fill('Синий командный план');await host.locator('[data-room-chat-form] [type=submit]').click();
  await ally.locator('.room-message-bubble.is-team').waitFor();assert.equal(await enemy.locator('.room-message-bubble').count(),0);await capture(ally,'team-bubble-blue');
  const enemyHistory=await enemy.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-read',scope:'team'}));assert(!JSON.stringify(enemyHistory).includes('Синий командный план'));assert.equal(enemyHistory.team,'red');
  await ally.locator('[data-game-menu]').click();await ally.locator('[data-command=preferences]').click();
  await host.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-send',scope:'team',id:'unread-team-message',body:'Пропущенное командное сообщение'}));
  await ally.evaluate(()=>PlayroomChatActivity.poll());await ally.locator('.modal [data-command=close-modal]').click();await ally.locator('[data-room-chat-open] .chat-counter-team').waitFor();assert.equal((await enemy.evaluate(()=>PlayroomNetworkLibrary.chatContext().call({type:'room-chat-summary'}))).team,0);
  await capture(ally,'team-unread-counter');
  await ally.bringToFront();await ally.evaluate(()=>PlayroomRoomChatUI.show());await ally.locator('[data-room-chat-tab=team]').click();await ally.locator('[data-room-chat-messages]').filter({hasText:'Синий командный план'}).waitFor();await capture(ally,'team-chat-blue');
  assert(await ally.locator('[data-room-chat-content]').evaluate(el=>getComputedStyle(el.querySelector('.chat-messages')).backgroundColor!==getComputedStyle(el.querySelector('.chat-message')).backgroundColor));
  await host.locator('[data-room-chat-refresh]').click();await host.locator('.message-receipt.is-read').nth(1).waitFor();
  await ally.locator('[data-room-chat-content][data-reply-support=true]').waitFor();const teamMessage=ally.locator('.chat-message').filter({hasText:'Синий командный план'});await teamMessage.locator('p').click();await ally.locator('[data-quick-emoji=":nice:"]').click();await teamMessage.locator('[data-chat-react-emoji=":nice:"][aria-pressed=true]').waitFor();await host.locator('[data-chat-react-emoji=":nice:"]').waitFor();
  await teamMessage.locator('p').click();await ally.locator('[data-chat-message-action=reply]').click();await ally.locator('[data-chat-reply]:not([hidden])').waitFor();await ally.locator('[data-room-chat-form] [data-chat-editor]').fill('Ответ синей команде');await ally.locator('[data-room-chat-form] [type=submit]').click();await host.locator('.chat-message').filter({hasText:'Ответ синей команде'}).locator('[data-chat-reply-jump]').waitFor();
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
  page._url=url;await profile(page,'Хост');await page.locator('[data-start=tictactoe]').click();
  const result=await page.evaluate(async()=>{
   const b=PlayroomAppBridge,r=b.room(),identity={userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'};let validations=0;
   const create=()=>PlayroomNetworkLibrary.cloudHostPeer({identity,check:()=>{},validate:()=>{validations++;}});
   let denied=false;try{await create();}catch(error){denied=error.message==='CLOUD_LOBBY_REQUIRED';}
   b.roomService.configure(r.id,r.ownerId,{transportMode:'online'});b.renderLobby();
   const Native=window.RTCPeerConnection;let connectionState='new',readyState='connecting',pc,channel;
   window.RTCPeerConnection=class extends Native{constructor(...args){super(...args);pc=this;}createDataChannel(...args){channel=super.createDataChannel(...args);return channel;}};
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

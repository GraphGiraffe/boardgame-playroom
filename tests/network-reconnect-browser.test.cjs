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
  await page.goto(page._url);
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
  await page.locator('.game-grid').waitFor();
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
  await client.locator('#network-join-button').click();
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
test('guest reload + fresh QR reconnect preserves authority viewer, room seat and rotated secret', {timeout:90000,skip:!hasUno},async()=>{
  const hosted=await server(),{server:listener,url}=hosted;
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await profile(client,'Гость');
    await host.locator('[data-start="uno"]').click();
    await host.locator('[data-room-option=transportMode]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});
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
    const previousRevision=await client.locator('.table-shell.network-game').getAttribute('data-revision');
    await client.reload();
    await client.locator('#network-join-button').waitFor();
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

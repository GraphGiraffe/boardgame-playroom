'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
async function fixture(browser,{microphone=false,share=false,standalone=false,candidate=true,viewport={width:390,height:740}}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="network-pair-button">Хост</button><button id="network-join-button">Гость</button><div id="app"></div><div id="modal-root"></div></body></html>');
  for(const css of ['app/styles.css','app/lobby.css'])await page.addStyleTag({content:read(css)});
  for(const script of ['app/vendor/qrcode.js','app/qr.js','app/acoustic-pairing.js','app/pairing.js'])await page.addScriptTag({content:read(script)});
  await page.addScriptTag({content:`
    globalThis.__testState={microphone:${microphone},share:${share},standalone:${standalone},candidate:${candidate}};
    const original=globalThis.PlayroomAcousticPairing;
    globalThis.PlayroomAcousticPairing={...original,microphoneIssue:()=>__testState.microphone?null:'Микрофон заблокирован.',probeAddresses:async()=>[]};
    globalThis.PlayroomQRScanner={scan:async()=>{throw Error('unneeded scan')}};
    globalThis.ggwave_factory=async()=>({});
    globalThis.PlayroomPWA={secure:__testState.standalone,standalone:__testState.standalone,canShare:()=>__testState.share,canInstall:()=>false,
      pairingUrl:token=>PlayroomPairing.protocolUrl(token),protocolUrl:PlayroomPairing.protocolUrl,subscribePair:()=>()=>{},shareToken:async()=>{},};
    globalThis.__signal=type=>JSON.stringify({v:1,type,pairingId:'123e4567-e89b-12d3-a456-426614174000',
      sdp:['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
        'a=fingerprint:sha-256 '+Array(32).fill('AB').join(':'),
        ...(__testState.candidate?['a=candidate:1 1 UDP 2122260223 192.168.1.44 53001 typ host']:['a=candidate:1 1 UDP 2122260223 hidden.local 53001 typ host']),''].join('\\r\\n')});
    globalThis.PlayroomWebRTCTransport={createHostPeer:async()=>({offer:__signal('offer'),channel:{readyState:'connecting'},close(){},acceptAnswer:async()=>{}}),
      createClientPeer:async()=>({answer:__signal('answer'),pc:{addEventListener(){}},waitOpen:()=>new Promise(()=>{}),close(){}}),serve:()=>()=>{}};
    globalThis.PlayroomMultiplayer={ResumeStore:class{load(){return null}},SwitchableConnection:class{constructor(c){this.c=c}snapshot(){return {}}dispatch(){}close(){}}};
    globalThis.PlayroomAppBridge={room:()=>({id:'room-1'}),roomService:{connection:()=>({participantId:'user',close(){},snapshot(){return {}}})},
      modalHead:title=>'<header class="modal-head"><h2>'+title+'</h2><button class="icon-btn" data-command="close-modal">×</button></header>',
      openModal(html){document.querySelector('#modal-root').innerHTML='<div class="modal-backdrop"><section class="modal" role="dialog">'+html+'</section></div>'},
      closeModal(){document.querySelector('#modal-root').innerHTML=''},toast(message){globalThis.__toast=message},renderLobby(){}};
  `});
  await page.addScriptTag({content:read('app/network-ui.js')});
  return {context,page,errors};
}
const browserOptions={headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']};
const methodState=page=>page.evaluate(()=>({
  available:[...document.querySelectorAll('.pairing-methods-available>.pairing-method')].map(e=>({name:e.dataset.pairingMethod,open:e.open})),
  unavailable:[...document.querySelectorAll('.pairing-methods-unavailable-items>.pairing-method')].map(e=>({name:e.dataset.pairingMethod,open:e.open})),
  unavailableExpanded:document.querySelector('.pairing-methods-unavailable')?.open,
  helpOpen:document.querySelector('.pairing-help')?.open
}));
test('join on content://-like unsupported capture: QR/Text first, blocked Share/Sound collapsed, help on demand', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser);
  try{
    await f.page.locator('#network-join-button').click();
    assert.deepEqual(await methodState(f.page),{available:[{name:'qr',open:true},{name:'text',open:true}],
      unavailable:[{name:'share',open:false},{name:'sound',open:false}],unavailableExpanded:false,helpOpen:false});
    assert.equal(await f.page.locator('#net-client-offer').isVisible(),true);
    assert.equal(await f.page.locator('.pairing-help-popover').isVisible(),false);
    await f.page.locator('.pairing-help>summary').click();
    assert.equal(await f.page.locator('.pairing-help-popover').isVisible(),true);
    assert.match(await f.page.locator('.pairing-help-popover').innerText(),/PR3.*PR2/s);
    assert.match(await f.page.locator('.pairing-help-popover').innerText(),/Микрофон заблокирован/);
    const modal=await f.page.locator('.modal').boundingBox();assert.ok(modal.width<400);
    if(process.env.PLAYROOM_CAPTURE_DIR)await f.page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'pairing-join-mobile.png')});
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('host QR precedes scan buttons; manual IP save is inline/conditional and updates sound availability', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:false,microphone:false});
  try{
    await f.page.locator('#network-pair-button').click();
    await f.page.locator('#net-host-token-qr svg').waitFor();
    const before=await methodState(f.page);
    assert.deepEqual(before.available.map(x=>x.name),['qr','text']);
    assert.deepEqual(before.unavailable.map(x=>x.name),['share','sound']);
    const relative=await f.page.locator('[data-pairing-method="qr"]').evaluate(el=>[...el.querySelectorAll('.pairing-qr,[data-net-qr-camera],[data-net-qr-gallery]')].map(e=>e.className?.baseVal||e.className||e.dataset.netQrCamera||e.dataset.netQrGallery));
    assert.equal(relative.length,3);assert.match(relative[0],/^pairing-qr pairing-qr-ready/);
    await f.page.locator('.pairing-methods-unavailable>summary').click();
    await f.page.locator('[data-pairing-method="sound"]>summary').click();
    await f.page.locator('.pairing-sound-settings>summary').click();
    const input=f.page.locator('#acoustic-host-manual');
    assert.equal(await f.page.locator('#acoustic-host-manual-row').isVisible(),true);
    assert.equal(await f.page.locator('#acoustic-host-save').isVisible(),true);
    await input.fill('192.168.1.77');
    await f.page.locator('#acoustic-host-save').click();
    // An opaque test origin cannot persist the IP, but the click must not be
    // swallowed when a formerly unavailable sound block changes groups.
    assert.match(await f.page.evaluate(()=>globalThis.__toast||''),/IP добавлен|Браузер не разрешает сохранять адрес/);
    await f.page.waitForFunction(()=>!!document.querySelector('.pairing-methods-available>[data-pairing-method=\"sound\"]'));
    const after=await methodState(f.page);
    assert.deepEqual(after.available.map(x=>x.name),['sound','qr','text']);
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR3\./);
    assert.equal(await f.page.locator('#net-host-acoustic-send').isEnabled(),true);
    if(process.env.PLAYROOM_CAPTURE_DIR)await f.page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'pairing-host-mobile.png')});
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('guest answer uses the same four method groups, QR before text and shorter controls', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:true,share:true,microphone:true,standalone:true});
  try{
    await f.page.locator('#network-join-button').click();
    await f.page.locator('#net-client-offer textarea').fill(await f.page.evaluate(()=>__signal('offer')));
    await f.page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    await f.page.locator('#net-client-token-qr svg').waitFor({timeout:10000});
    const after=await methodState(f.page);
    assert.deepEqual(after.available.map(x=>x.name),['share','sound','qr','text']);
    assert.equal(await f.page.locator('#net-client-acoustic-send').isEnabled(),true);
    assert.equal(await f.page.locator('.pairing-help-popover').isVisible(),false);
    if(process.env.PLAYROOM_CAPTURE_DIR)await f.page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'pairing-answer-mobile.png')});
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('the initial QR/Text join screen fits narrow 320px devices without horizontal overflow', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{viewport:{width:320,height:640}});
  try{
    await f.page.locator('#network-join-button').click();
    const sizes=await f.page.evaluate(()=>({screen:innerWidth,html:document.documentElement.scrollWidth,
      modal:document.querySelector('.modal').getBoundingClientRect().width,
      controls:[...document.querySelectorAll('.pairing-methods-available .btn')].every(b=>{
        const r=b.getBoundingClientRect(),m=document.querySelector('.modal').getBoundingClientRect();
        return r.left>=m.left&&r.right<=m.right;
      })}));
    assert.ok(sizes.html<=sizes.screen,JSON.stringify(sizes));
    assert.ok(sizes.modal<=sizes.screen,JSON.stringify(sizes));
    assert.equal(sizes.controls,true,JSON.stringify(sizes));
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});

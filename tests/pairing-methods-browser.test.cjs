'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
async function fixture(browser,{microphone=false,share=false,standalone=false,candidate=true,addresses=null,viewport={width:390,height:740}}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="network-pair-button">Хост</button><button id="network-join-button">Гость</button><div id="app"></div><div id="modal-root"></div></body></html>');
  for(const css of ['app/styles.css','app/lobby.css'])await page.addStyleTag({content:read(css)});
  for(const script of ['app/vendor/qrcode.js','app/qr.js','app/acoustic-pairing.js','app/pairing.js'])await page.addScriptTag({content:read(script)});
  await page.addScriptTag({content:`
    globalThis.__testState={microphone:${microphone},share:${share},standalone:${standalone},candidate:${candidate},addresses:${JSON.stringify(addresses)}};
    const original=globalThis.PlayroomAcousticPairing;
    globalThis.PlayroomAcousticPairing={...original,microphoneIssue:()=>__testState.microphone?null:'Микрофон заблокирован.',probeAddresses:async()=>[]};
    globalThis.PlayroomQRScanner={scan:async()=>{throw Error('unneeded scan')}};
    globalThis.ggwave_factory=async()=>({});
    globalThis.PlayroomPWA={secure:__testState.standalone,standalone:__testState.standalone,canShare:()=>__testState.share,canInstall:()=>false,
      pairingUrl:token=>PlayroomPairing.protocolUrl(token),protocolUrl:PlayroomPairing.protocolUrl,subscribePair:()=>()=>{},shareToken:async()=>{},};
    globalThis.__signal=type=>JSON.stringify({v:1,type,pairingId:'123e4567-e89b-12d3-a456-426614174000',
      sdp:['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
        'a=fingerprint:sha-256 '+Array(32).fill('AB').join(':'),
        ...(__testState.addresses||(__testState.candidate?['192.168.1.44']:['hidden.local'])).map((ip,i)=>'a=candidate:'+(i+1)+' 1 UDP '+(2122260223-i)+' '+ip+' '+(53001+i)+' typ host'),''].join('\\r\\n')});
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
test('host QR precedes scan buttons; saved manual IP keeps send-only sound under unavailable methods', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:false,microphone:false});
  try{
    await f.page.locator('#network-pair-button').click();
    await f.page.locator('#net-host-token-qr svg').waitFor();
    const before=await methodState(f.page);
    assert.deepEqual(before.available.map(x=>x.name),['qr','text']);
    assert.deepEqual(before.unavailable.map(x=>x.name),['share','sound']);
    assert.equal(await f.page.locator('#acoustic-host-address').inputValue(),'all');
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR2\./);
    assert.equal(await f.page.locator('.pairing-network-choice').count(),1,'network selection is shared by every method');
    const relative=await f.page.locator('[data-pairing-method="qr"]').evaluate(el=>[...el.querySelectorAll('.pairing-qr,[data-net-qr-camera],[data-net-qr-gallery]')].map(e=>e.className?.baseVal||e.className||e.dataset.netQrCamera||e.dataset.netQrGallery));
    assert.equal(relative.length,3);assert.match(relative[0],/^pairing-qr pairing-qr-ready/);
    await f.page.locator('#acoustic-host-address').selectOption('manual');
    const input=f.page.locator('#acoustic-host-manual');
    assert.equal(await f.page.locator('#acoustic-host-manual-row').isVisible(),true);
    assert.equal(await f.page.locator('#acoustic-host-save').isVisible(),true);
    await input.fill('192.168.1.77');
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR3\./,
      'manual IPv4 must take effect before pressing Save');
    await f.page.locator('#acoustic-host-save').click();
    // An opaque test origin cannot persist the IP, but the click must not be
    // swallowed when a formerly unavailable sound block changes groups.
    assert.match(await f.page.evaluate(()=>globalThis.__toast||''),/IP добавлен|Браузер не разрешает сохранять адрес/);
    const after=await methodState(f.page);
    // PR3 enables speaker-only transmission, but Sound is not a complete
    // available method when the microphone is blocked.
    assert.deepEqual(after.available.map(x=>x.name),['qr','text']);
    assert.deepEqual(after.unavailable.map(x=>x.name),['share','sound']);
    assert.equal(after.unavailableExpanded,false);
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR3\./);
    assert.equal(await f.page.locator('#net-host-acoustic-send').isEnabled(),true);
    assert.equal(await f.page.locator('#net-host-acoustic-listen').isEnabled(),false);
    if(process.env.PLAYROOM_CAPTURE_DIR)await f.page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'pairing-host-mobile.png')});
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('local RFC1918 candidate is selected by default: 192.168/16, 10/8, then 172.16/12', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions);
  const cases=[
    {addresses:['100.80.1.3','172.21.3.1','10.8.7.6','192.168.7.9'],expected:'192.168.7.9'},
    {addresses:['100.80.1.3','172.31.7.9','10.32.0.15'],expected:'10.32.0.15'},
    {addresses:['172.15.0.9','172.20.1.3','169.254.4.1'],expected:'172.20.1.3'},
    {addresses:['100.80.1.3','169.254.4.1'],expected:null}
  ];
  try{
    for(const item of cases){
      const f=await fixture(browser,{addresses:item.addresses});
      try{
        await f.page.locator('#network-pair-button').click();
        const token=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-host-token').value));
        const choice=await f.page.locator('#acoustic-host-address').inputValue();
        if(item.expected){
          assert.match(token,/^PR3\./);
          assert.equal((await f.page.evaluate(value=>PlayroomPairing.decode(value),token)).ip,item.expected);
          assert.notEqual(choice,'all');
        }else{assert.match(token,/^PR2\./);assert.equal(choice,'all');}
        assert.equal(f.errors.length,0,f.errors.join('\n'));
      }finally{await f.context.close();}
    }
  }finally{await browser.close();}
});
test('All connections forces complete PR2 SDP even with valid IPv4; selecting one restores PR3', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:true,microphone:false});
  try{
    await f.page.locator('#network-pair-button').click();
    const choose=f.page.locator('#acoustic-host-address');
    assert.notEqual(await choose.inputValue(),'all');
    const initial=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-host-token').value));
    assert.match(initial,/^PR3\./);
    const selected=await choose.inputValue();
    await choose.selectOption('all');
    const all=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-host-token').value));
    assert.match(all,/^PR2\./);
    assert.match((await f.page.evaluate(token=>PlayroomPairing.decode(token),all)).signal,/192\.168\.1\.44/);
    assert.equal(await f.page.locator('#net-host-acoustic-send').isEnabled(),false);
    assert.match(await f.page.locator('#acoustic-host-mode').innerText(),/Все соединения/);
    await choose.selectOption(selected);
    const compact=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-host-token').value));
    assert.match(compact,/^PR3\./);assert.equal(await f.page.locator('#net-host-acoustic-send').isEnabled(),true);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('an invalid manual IP cannot leave a stale QR/Share and becomes PR3 without being saved', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:true,share:true,microphone:false});
  try{
    await f.page.locator('#network-pair-button').click();
    await f.page.locator('#net-host-token-qr svg').waitFor();
    await f.page.locator('#acoustic-host-address').selectOption('manual');
    assert.equal(await f.page.locator('#net-host-token').inputValue(),'');
    assert.equal(await f.page.locator('#net-host-token-qr svg').count(),0);
    assert.equal(await f.page.locator('[data-net-share="offer"]').isEnabled(),false);
    await f.page.locator('#acoustic-host-manual').fill('192.0.2.99');
    assert.equal(await f.page.locator('#net-host-token').inputValue(),'');
    assert.equal(await f.page.locator('[data-net-share="offer"]').isEnabled(),false);
    await f.page.locator('#acoustic-host-manual').fill('192.168.5.77');
    const current=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-host-token').value));
    assert.match(current,/^PR3\./);
    assert.equal((await f.page.evaluate(token=>PlayroomPairing.decode(token),current)).ip,'192.168.5.77');
    assert.equal(await f.page.locator('[data-net-share="offer"]').isEnabled(),true);
    assert.equal(await f.page.locator('#acoustic-host-save').isVisible(),true);
    await f.page.locator('#acoustic-host-address').selectOption('all');
    assert.equal(await f.page.locator('#acoustic-host-save').isVisible(),false);
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR2\./);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('saved IP is never auto-selected after a new WebRTC offer hides local interfaces', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:false});
  try{
    // about:blank intentionally denies localStorage; emulate only the storage
    // boundary to check that a previously saved address is never presumed live.
    await f.page.evaluate(()=>{
      const data=new Map([['playroom.acoustic-known-addresses.v1',JSON.stringify(['192.168.5.3'])]]);
      Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
        getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))
      }});
    });
    await f.page.locator('#network-pair-button').click();
    const select=f.page.locator('#acoustic-host-address');
    assert.equal(await select.inputValue(),'all');
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR2\./);
    const saved=await select.evaluate(el=>[...el.options].find(x=>x.text.includes('192.168.5.3'))?.value);
    assert.ok(saved);
    await select.selectOption(saved);
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR3\./);
    const decoded=await f.page.evaluate(()=>PlayroomPairing.decode(PlayroomPairing.extract(document.getElementById('net-host-token').value)));
    assert.equal(decoded.ip,'192.168.5.3');
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('no usable UDP host route fails closed when manual PR3 is requested, with explicit All recovery', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{addresses:[]});
  try{
    await f.page.locator('#network-pair-button').click();
    assert.equal(await f.page.locator('#acoustic-host-address').inputValue(),'all');
    await f.page.locator('#acoustic-host-address').selectOption('manual');
    await f.page.locator('#acoustic-host-manual').fill('192.168.1.12');
    assert.equal(await f.page.locator('#net-host-token').inputValue(),'');
    assert.equal(await f.page.locator('#net-host-token-qr svg').count(),0);
    assert.match(await f.page.locator('#acoustic-host-mode').innerText(),/UDP|ICE/);
    await f.page.locator('#acoustic-host-address').selectOption('all');
    assert.match(await f.page.locator('#net-host-token').inputValue(),/PR2\./);
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});
test('client Answer supports PR2 on All and PR3 on selected IPv4 without changing the received Offer', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:true});
  try{
    await f.page.locator('#network-join-button').click();
    const offered=await f.page.evaluate(()=>__signal('offer'));
    await f.page.locator('#net-client-offer textarea').fill(offered);
    await f.page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    await f.page.locator('#net-client-token-qr svg').waitFor();
    const select=f.page.locator('#acoustic-client-address');
    assert.notEqual(await select.inputValue(),'all');
    assert.match(await f.page.locator('#net-client-token').inputValue(),/PR3\./);
    await select.selectOption('all');
    const value=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-client-token').value));
    const parsed=await f.page.evaluate(token=>PlayroomPairing.decode(token),value);
    assert.match(value,/^PR2\./);assert.equal(parsed.kind,'answer');
    assert.match(parsed.signal,/192\.168\.1\.44/);
    assert.equal(await f.page.locator('#net-client-acoustic-send').isEnabled(),false);
    await select.selectOption('manual');await f.page.locator('#acoustic-client-manual').fill('192.168.1.111');
    const compact=await f.page.evaluate(()=>PlayroomPairing.extract(document.getElementById('net-client-token').value));
    assert.match(compact,/^PR3\./);
    assert.equal((await f.page.evaluate(token=>PlayroomPairing.decode(token),compact)).ip,'192.168.1.111');
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

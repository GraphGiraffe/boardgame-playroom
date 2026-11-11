'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
async function fixture(browser,{microphone=false,share=false,standalone=false,candidate=true,addresses=null,viewport={width:390,height:740},reducedMotion,hasTouch=false}={}){
  const context=await browser.newContext({viewport,reducedMotion,hasTouch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="network-pair-button">Хост</button><button id="network-join-button">Гость</button><div id="app"></div><div id="modal-root"></div></body></html>');
  for(const css of ['app/styles.css','app/lobby.css','app/design-system.css','app/mobile-surfaces.css','app/nearby-021.css'])await page.addStyleTag({content:read(css)});
  for(const script of ['core/messages.js','core/vector-art.js','core/component-assets.js','core/game-components.js','core/token-layout.js','core/ui.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','app/lobby-view.js','app/vendor/qrcode.js','app/qr.js','app/acoustic-pairing.js','app/pairing.js'])await page.addScriptTag({content:read(script)});
  await page.addScriptTag({content:`
    globalThis.__testState={microphone:${microphone},share:${share},standalone:${standalone},candidate:${candidate},addresses:${JSON.stringify(addresses)}};
    const original=globalThis.PlayroomAcousticPairing;
    globalThis.PlayroomAcousticPairing={...original,microphoneIssue:()=>__testState.microphone?null:'Микрофон заблокирован.',probeAddresses:async()=>[],play:async()=>{__testState.sent=(__testState.sent||0)+1},listen:async()=>{__testState.listened=(__testState.listened||0)+1;return {stop(){__testState.stopped=(__testState.stopped||0)+1}}}};
    globalThis.PlayroomQRScanner={scan:async()=>{throw Error('unneeded scan')}};
    globalThis.ggwave_factory=async()=>({});
    globalThis.PlayroomPWA={secure:__testState.standalone,standalone:__testState.standalone,canShare:()=>__testState.share,canInstall:()=>false,
      pairingUrl:token=>PlayroomPairing.protocolUrl(token),protocolUrl:PlayroomPairing.protocolUrl,subscribePair:()=>()=>{},shareToken:async()=>{},};
    globalThis.__signal=type=>JSON.stringify({v:1,type,pairingId:'123e4567-e89b-12d3-a456-426614174000',
      sdp:['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
        'a=fingerprint:sha-256 '+Array(32).fill('AB').join(':'),
        ...(__testState.addresses||(__testState.candidate?['192.168.1.44']:['hidden.local'])).map((ip,i)=>'a=candidate:'+(i+1)+' 1 UDP '+(2122260223-i)+' '+ip+' '+(53001+i)+' typ host'),''].join('\\r\\n')});
    globalThis.PlayroomWebRTCTransport={createHostPeer:async()=>({offer:__signal('offer'),channel:Object.assign(new EventTarget(),{readyState:'connecting',send(){}}),close(){},acceptAnswer:async()=>{}}),
      createClientPeer:async()=>{__testState.answers=(__testState.answers||0)+1;return {answer:__signal('answer'),pc:{addEventListener(){}},waitOpen:()=>new Promise(()=>{}),close(){}}},serve:()=>()=>{}};
    globalThis.PlayroomMultiplayer={ResumeStore:class{load(){return null}},SwitchableConnection:class{constructor(c){this.c=c}snapshot(){return {}}dispatch(){}close(){}}};
    const modalController=new PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app'),prepareSurface:element=>{const modal=element.querySelector(':scope>.modal');if(modal)PlayroomGameScreen.normalizeSurfaceHead(modal.querySelector(':scope>.modal-head'),modal.className);}});globalThis.__room={id:'room-1',phase:'lobby',transportMode:'network',ownerId:'user',participants:[{id:'user',nickname:'Хост',connected:true,role:'player'}],seats:[],rules:{preset:'basic'},game:{id:'fixture',name:'Проверка'}};globalThis.PlayroomAppBridge={room:()=>__room,participantId:()=> 'user',profile:()=>({id:'user',name:'Хост'}),roomService:{snapshot:()=>__room,subscribe:()=>()=>{},connection:()=>({participantId:'user',close(){},snapshot(){return {}}})},
      modalHead:PlayroomGameScreen.modalHead,
      openModal(html,className='',options={}){return modalController.open('<div class="modal-backdrop"><section class="modal '+className+'" data-ui-surface="'+PlayroomGameScreen.classifySurface(className)+'" role="dialog">'+PlayroomGameScreen.modalContent(html)+'</section></div>',{mode:options.mode||'reset',valid:options.valid,onDispose:options.onDispose});},
      closeModal(){modalController.reset()},toast(message){globalThis.__toast=message},renderLobby(){}};
  `});
  await page.addScriptTag({content:['core/messages.js','application/history-sync-service.js','application/host-session-service.js','application/quick-reactions.js','application/room-chat.js','app/network-invitations.js','platform/web/host-transfer-wire.js','app/pairing-presenter.js','app/network-social.js','application/connection-indicators.js','app/network-presence.js','app/nearby-view.js','app/network-ui.js'].map(read).join('\n')});
  if(errors.length){await context.close();await browser.close();assert.deepEqual(errors,[],'Pairing bootstrap must load before interactions');}
  return {context,page,errors};
}
const browserOptions={headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']};
const methodState=page=>page.evaluate(()=>({method:document.querySelector('[data-nearby-screen]')?.dataset.nearbyMethod,direction:document.querySelector('[data-nearby-screen]')?.dataset.nearbyDirection,visible:[...document.querySelectorAll('[data-nearby-pane]:not([hidden])')].map(e=>e.dataset.nearbyPane)}));
test('nearby receive uses one method and preserves manual input across tabs; cancelled QR cannot reopen it',{timeout:25000},async()=>{
 const browser=await chromium.launch(browserOptions),f=await fixture(browser);
 try{
  await f.page.locator('#network-join-button').click();assert.deepEqual(await methodState(f.page),{method:'qr',direction:'receive',visible:['receive:qr']});assert.equal(await f.page.locator('.nearby-modal').getAttribute('data-ui-surface'),'screen');assert.equal(await f.page.locator('[role=tab][data-nearby-direction=show]').isDisabled(),true);
  await f.page.locator('[role=tab][data-nearby-method=text]').click();await f.page.locator('#net-client-offer textarea').fill('Сохранённый код');await f.page.locator('[role=tab][data-nearby-method=sound]').click();assert.match(await f.page.locator('[data-nearby-pane="receive:sound"]').innerText(),/Звук недоступен|микрофон|звуков/i);assert(await f.page.locator('#net-client-acoustic-listen').isDisabled());await f.page.locator('[role=tab][data-nearby-method=text]').click();assert.equal(await f.page.locator('#net-client-offer textarea').inputValue(),'Сохранённый код');
  await f.page.locator('[role=tab][data-nearby-method=qr]').click();await f.page.evaluate(()=>{PlayroomQRScanner.scan=()=>new Promise(resolve=>window.releaseQR=()=>resolve({kind:'offer',signal:__signal('offer'),token:'PR2.test',method:'fixture'}));});await f.page.locator('#net-client-qr-gallery').setInputFiles({name:'qr.png',mimeType:'image/png',buffer:Buffer.from('fixture')});await f.page.waitForFunction(()=>!!window.releaseQR);await f.page.evaluate(()=>PlayroomAppBridge.closeModal());await f.page.evaluate(()=>releaseQR());await f.page.waitForFunction(()=>!document.querySelector('[data-nearby-screen]'));assert.equal(await f.page.evaluate(()=>__testState.answers||0),0,'late scanner result cannot start a peer after Back');
  await f.page.locator('#network-join-button').click();await f.page.locator('[role=tab][data-nearby-method=text]').click();await f.page.locator('#net-client-offer textarea').fill(await f.page.evaluate(()=>__signal('offer')));await f.page.evaluate(()=>{PlayroomWebRTCTransport.createClientPeer=()=>new Promise((resolve,reject)=>window.rejectPeer=()=>reject(Error('late peer failure')));});await f.page.locator('[form=net-client-offer]').click();await f.page.waitForFunction(()=>!!window.rejectPeer);await f.page.evaluate(()=>PlayroomAppBridge.closeModal());await f.page.locator('#network-join-button').click();await f.page.evaluate(()=>rejectPeer());assert.equal(await f.page.locator('[data-nearby-screen]').getAttribute('data-nearby-stage'),'client-join');assert.equal(await f.page.evaluate(()=>globalThis.__toast||''),'','obsolete peer failure does not disturb the new receive screen');assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();await browser.close();}
});
test('nearby host shows invitation then receives answer; address and sound permissions remain independent',{timeout:25000},async()=>{
 const engine=process.env.LAB_ENGINE||'chromium',browser=engine==='webkit'?await require('playwright-core').webkit.launch({headless:true}):await chromium.launch(browserOptions),f=await fixture(browser,{candidate:false,microphone:false});
 try{
  await f.page.locator('#network-pair-button').click();await f.page.waitForFunction(()=>!!document.querySelector('[data-nearby-screen]')||!!globalThis.__toast);assert.equal(await f.page.evaluate(()=>globalThis.__toast||''),'','host entry succeeds');await f.page.locator('#net-host-token-qr svg').waitFor();assert.deepEqual(await methodState(f.page),{method:'qr',direction:'show',visible:['show:qr']});assert.equal(await f.page.locator('.nearby-advanced').getAttribute('open'),null);
  const permission=await f.page.evaluate(()=>{const b=PlayroomAppBridge,input=document.querySelector('[data-manual-invite-permission]');let calls=0,captured=null;b.setRoomInvitationPermission=(allowed,source)=>{calls++;captured=source;const r=__room;if(!source.current()||r.id!==source.roomId||r.ownerId!==source.owner||source.actor!==b.participantId()||r.phase!=='lobby'||r.transportMode!=='network'||r.recovery)return null;r.allowPlayerInvites=allowed;return {...r};};input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));const enabled=__room.allowPlayerInvites;__room={...__room,id:'other-room',allowPlayerInvites:false};input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));const rejected=!__room.allowPlayerInvites&&captured.roomId==='room-1'&&captured.actor==='user'&&captured.owner==='user';__room={...__room,id:'room-1'};const before=calls,parent=input.parentNode;document.body.append(input);input.dispatchEvent(new Event('change',{bubbles:true}));const detached=calls===before;parent.append(input);return {enabled,rejected,detached};});assert.deepEqual(permission,{enabled:true,rejected:true,detached:true});
  await f.page.locator('.nearby-advanced>summary').click();await f.page.locator('#acoustic-host-address').selectOption('manual');await f.page.locator('#acoustic-host-manual').fill('192.168.1.77');assert.match(await f.page.locator('#net-host-token').inputValue(),/PR3\./);await f.page.locator('#acoustic-host-save').click();assert.match(await f.page.evaluate(()=>globalThis.__toast||''),/IP добавлен|Браузер не разрешает сохранять адрес/);
  await f.page.locator('[role=tab][data-nearby-method=sound]').click();assert(await f.page.locator('#net-host-acoustic-send').isEnabled());await f.page.locator('#net-host-acoustic-send').click();await f.page.waitForFunction(()=>document.querySelector('[data-nearby-screen]').dataset.nearbyDirection==='receive');assert.equal(await f.page.evaluate(()=>__testState.sent),1);assert.equal(await f.page.evaluate(()=>__testState.listened||0),0);assert(await f.page.locator('#net-host-acoustic-listen').isDisabled());
  await f.page.locator('[role=tab][data-nearby-method=text]').click();await f.page.locator('#net-host-answer textarea').fill('Ответ в поле');await f.page.locator('[role=tab][data-nearby-method=qr]').click();assert.equal(await f.page.locator('[data-net-qr-camera=host]').isVisible(),true);await f.page.locator('[role=tab][data-nearby-method=text]').click();assert.equal(await f.page.locator('#net-host-answer textarea').inputValue(),'Ответ в поле');assert.match(await f.page.locator('[data-nearby-step]').innerText(),/2.*Ответ/);assert.deepEqual(f.errors,[]);
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
    await f.page.locator('.nearby-advanced>summary').click();const choose=f.page.locator('#acoustic-host-address');
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
    await f.page.locator('.nearby-advanced>summary').click();await f.page.locator('#acoustic-host-address').selectOption('manual');
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
    await f.page.locator('.nearby-advanced>summary').click();const select=f.page.locator('#acoustic-host-address');
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
    await f.page.locator('.nearby-advanced>summary').click();await f.page.locator('#acoustic-host-address').selectOption('manual');
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
    await f.page.locator('[role=tab][data-nearby-method=text]').click();await f.page.locator('#net-client-offer textarea').fill(offered);
    await f.page.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    await f.page.locator('#net-client-token-qr svg').waitFor();
    await f.page.locator('.nearby-advanced>summary').click();const select=f.page.locator('#acoustic-client-address');
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
test('nearby answer shows the real second step and stops listening when switching methods',{timeout:25000},async()=>{
 const browser=await chromium.launch(browserOptions),f=await fixture(browser,{candidate:true,share:true,microphone:true,standalone:true});
 try{await f.page.locator('#network-join-button').click();await f.page.locator('[role=tab][data-nearby-method=sound]').click();await f.page.locator('#net-client-acoustic-listen').click();await f.page.waitForFunction(()=>__testState.listened===1);await f.page.locator('[role=tab][data-nearby-method=text]').click();assert.equal(await f.page.evaluate(()=>__testState.stopped),1);await f.page.locator('#net-client-offer textarea').fill(await f.page.evaluate(()=>__signal('offer')));await f.page.locator('[form=net-client-offer]').click();await f.page.locator('#net-client-token-qr svg').waitFor();assert.deepEqual(await methodState(f.page),{method:'qr',direction:'show',visible:['show:qr']});assert.match(await f.page.locator('[data-nearby-step]').innerText(),/2.*Ответ/);assert.equal(await f.page.locator('[role=tab][data-nearby-direction=receive]').isDisabled(),true);assert.equal(await f.page.locator('.nearby-wait').isVisible(),true);assert.equal(await f.page.evaluate(()=>__testState.answers),1);assert.deepEqual(f.errors,[]);
 }finally{await f.context.close();await browser.close();}
});
test('the initial QR/Text join screen fits narrow 320px devices without horizontal overflow', {timeout:25000},async()=>{
  const browser=await chromium.launch(browserOptions),f=await fixture(browser,{viewport:{width:320,height:640}});
  try{
    await f.page.locator('#network-join-button').click();
    const sizes=await f.page.evaluate(()=>({screen:innerWidth,html:document.documentElement.scrollWidth,
      modal:document.querySelector('.modal').getBoundingClientRect().width,
      controls:[...document.querySelectorAll('[data-nearby-pane]:not([hidden]) .btn,.nearby-actions [data-nearby-action-for]:not([hidden]) .btn')].every(b=>{
        const r=b.getBoundingClientRect(),m=document.querySelector('.modal').getBoundingClientRect();
        return r.left>=m.left&&r.right<=m.right;
      })}));
    assert.ok(sizes.html<=sizes.screen,JSON.stringify(sizes));
    assert.ok(sizes.modal<=sizes.screen,JSON.stringify(sizes));
    assert.equal(sizes.controls,true,JSON.stringify(sizes));
    assert.equal(f.errors.length,0,f.errors.join('\n'));
  }finally{await f.context.close();await browser.close();}
});

test('nearby choice 0.21: shared panels retain the source and reject stale options',{timeout:35000},async()=>{
 const engine=process.env.LAB_ENGINE||'chromium',browser=engine==='webkit'?await require('playwright-core').webkit.launch({headless:true}):await chromium.launch(browserOptions),f=await fixture(browser,{addresses:['192.168.1.44','10.0.0.7'],viewport:{width:390,height:844},reducedMotion:'reduce'});
 const out=path.resolve(root,'../tmp_files/ux-021/nearby-choice-021');fs.mkdirSync(out,{recursive:true});const report=[];
 try{
  await f.page.evaluate(()=>{const values=new Map([['playroom.acoustic-known-addresses.v1',JSON.stringify(['192.168.5.3'])]]);window.choiceStorage=values;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}});});
  await f.page.locator('#network-pair-button').click();await f.page.locator('.nearby-advanced>summary').click();const select=f.page.locator('#acoustic-host-address');await select.evaluate(el=>{window.choiceSelect=el;window.choiceParent=el.closest('[data-surface-state]');});
  const initial=await select.inputValue(),active=()=>f.page.locator('#modal-root>[data-surface-state=active]');
  for(const [width,height] of [[390,844],[844,390]]){
   await f.page.setViewportSize({width,height});await select.click();assert(await f.page.evaluate(()=>choiceParent.inert&&choiceParent.dataset.surfaceState==='suspended'));const panel=active().locator('.pairing-choice-dialog[data-ui-surface=panel]');await panel.waitFor();assert.equal(await panel.locator('[data-surface-fullscreen]').count(),0,'choice panel has no fullscreen');await active().evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
   const box=await panel.boundingBox(),content=await f.page.locator('body').boundingBox();assert(Math.abs(box.width-content.width)<2&&Math.abs(box.x-content.x)<2&&box.y>=0&&box.y+box.height<=height+1,JSON.stringify({box,content}));assert(await panel.locator('.pairing-choice-option').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
   await f.page.screenshot({path:path.join(out,engine+'-choice-'+width+'.png'),animations:'disabled'});await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('.pairing-choice-dialog').count(),0);assert(await select.evaluate(el=>el===choiceSelect&&el===document.activeElement&&el.closest('[data-surface-state]')===choiceParent));assert.equal(await select.inputValue(),initial);report.push({width,state:'cancel-retains-selector-and-value'});
  }
  await select.click();const allIndex=await select.evaluate(el=>[...el.options].findIndex(option=>option.value==='all'));await active().locator('[data-choice="'+allIndex+'"]').click();assert.equal(await select.inputValue(),'all');assert.match(await f.page.locator('#net-host-token').inputValue(),/PR2\./);assert.equal(await f.page.locator('.pairing-choice-dialog').count(),0);report.push('actual selection updates pairing token through existing change handler');
  await select.click();const staleIndex=await select.evaluate(el=>[...el.options].findIndex(option=>option.value!=='all'));await select.evaluate((el,index)=>{const old=el.options[index];old.replaceWith(new Option('Другой кандидат',old.value));},staleIndex);await active().locator('[data-choice="'+staleIndex+'"]').click();assert.equal(await select.inputValue(),'all','stale row does not select a replacement candidate');assert.match(await f.page.evaluate(()=>__toast),/Параметры изменились/);report.push('replaced option cannot reuse old numeric index');
  await select.click();await active().locator('[data-delete-address="192.168.5.3"]').click();await active().locator('.pairing-choice-dialog').waitFor();assert.equal(await active().locator('[data-delete-address="192.168.5.3"]').count(),0);assert.deepEqual(await f.page.evaluate(()=>JSON.parse(choiceStorage.get('playroom.acoustic-known-addresses.v1'))),[]);assert(await select.evaluate(el=>el===choiceSelect));report.push('delete saved address rebuilds only owned choice panel');
  await active().locator('[data-choice]').first().evaluate(el=>window.oldChoice=el);await f.page.evaluate(()=>{PlayroomAppBridge.closeModal();PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Настройки')+'<input id="new-choice-draft" value="Новый ввод">','settings-modal');window.replacementChoice=document.querySelector('#modal-root>[data-surface-state=active]');oldChoice.click();});assert(await f.page.evaluate(()=>document.querySelector('#modal-root>[data-surface-state=active]')===replacementChoice));assert.equal(await f.page.locator('#new-choice-draft').inputValue(),'Новый ввод');assert.equal(await f.page.locator('.pairing-choice-dialog').count(),0);report.push('retired panel cannot mutate or close a replacement surface');assert.deepEqual(f.errors,[]);
  await f.page.evaluate(()=>document.body.classList.add('reduced-motion'));await f.page.emulateMedia({reducedMotion:'no-preference'});
  const oldSurfaceToggle=await f.page.evaluate(()=>{const frame=document.querySelector('#modal-root>[data-surface-state=active]'),modal=frame.querySelector('.modal'),editor=frame.querySelector('input'),before=modal.getBoundingClientRect().toJSON();document.body.classList.remove('reduced-motion');const animations=modal.getAnimations().map(animation=>({name:animation.animationName,running:animation.playState==='running'}));return {sameFrame:frame===document.querySelector('#modal-root>[data-surface-state=active]'),sameEditor:editor===frame.querySelector('input'),before,after:modal.getBoundingClientRect().toJSON(),animations};});const motionOut=path.resolve(root,'../tmp_files/ux-021/reduced-motion-entry');fs.mkdirSync(motionOut,{recursive:true});fs.writeFileSync(path.join(motionOut,engine+'-old-surface-toggle.json'),JSON.stringify(oldSurfaceToggle,null,2));report.push({scope:'old-reduced-screen-becomes-normal',...oldSurfaceToggle});assert.equal(oldSurfaceToggle.animations.filter(animation=>animation.running&&animation.name?.endsWith('-in')).length,0,'turning motion back on must not replay entry on an existing screen');assert(oldSurfaceToggle.sameFrame&&oldSurfaceToggle.sameEditor);
  const appInterrupted=await f.page.evaluate(async()=>{PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Настройки')+'<input id="motion-preference-input" value="Сохранённый ввод">','settings-modal');window.motionPreferenceFrame=document.querySelector('#modal-root>[data-surface-state=active]');const modal=motionPreferenceFrame.querySelector('.modal');window.motionPreferenceInput=modal.querySelector('input');motionPreferenceInput.focus();motionPreferenceInput.setSelectionRange(2,8);const entered=modal.getAnimations().some(animation=>animation.animationName?.endsWith('-in'));document.body.classList.add('reduced-motion');await Promise.resolve();const consumed=motionPreferenceFrame.dataset.uiMotion!=='enter';document.body.classList.remove('reduced-motion');return {entered,consumed,replayed:modal.getAnimations().filter(animation=>animation.animationName?.endsWith('-in')).length,sameFrame:motionPreferenceFrame===document.querySelector('#modal-root>[data-surface-state=active]'),sameInput:motionPreferenceInput===modal.querySelector('input'),focused:document.activeElement===motionPreferenceInput,selection:[motionPreferenceInput.selectionStart,motionPreferenceInput.selectionEnd],value:motionPreferenceInput.value};});assert.deepEqual(appInterrupted,{entered:true,consumed:true,replayed:0,sameFrame:true,sameInput:true,focused:true,selection:[2,8],value:'Сохранённый ввод'});report.push({scope:'app-reduced-interrupts-entry-once',...appInterrupted});
  assert(await f.page.evaluate(()=>{PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Настройки')+'<input id="motion-system-input" value="Системный режим">','settings-modal');window.motionSystemFrame=document.querySelector('#modal-root>[data-surface-state=active]');window.motionSystemInput=motionSystemFrame.querySelector('input');motionSystemInput.focus();motionSystemInput.setSelectionRange(1,5);return motionSystemFrame.querySelector('.modal').getAnimations().some(animation=>animation.animationName?.endsWith('-in'));}));await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.waitForFunction(()=>motionSystemFrame.dataset.uiMotion!=='enter',null,{timeout:1000});await f.page.emulateMedia({reducedMotion:'no-preference'});const systemInterrupted=await f.page.evaluate(()=>({sameFrame:motionSystemFrame===document.querySelector('#modal-root>[data-surface-state=active]'),sameInput:motionSystemInput===motionSystemFrame.querySelector('input'),focused:document.activeElement===motionSystemInput,selection:[motionSystemInput.selectionStart,motionSystemInput.selectionEnd],replayed:motionSystemFrame.querySelector('.modal').getAnimations().filter(animation=>animation.animationName?.endsWith('-in')).length}));assert.deepEqual(systemInterrupted,{sameFrame:true,sameInput:true,focused:true,selection:[1,5],replayed:0});report.push({scope:'system-reduced-interrupts-entry-once',...systemInterrupted});
  const entryOwnership=await f.page.evaluate(async()=>{const node=document.createElement('aside');node.className='chat-notification';node.textContent='Общий lifecycle';const first=PlayroomDOM.prepareVisualEntry(node);document.body.append(node);first.start();const second=PlayroomDOM.prepareVisualEntry(node);second.start();first.finish();const newerOwns=node.dataset.uiMotion==='enter';node.remove();await Promise.resolve();const removedConsumed=node.dataset.uiMotion!=='enter';const parent=document.createElement('aside');parent.className='chat-notification';const child=document.createElement('span');child.style.animation='ui-banner-in 30ms linear';parent.append(child);const capability=PlayroomDOM.prepareVisualEntry(parent);document.body.append(parent);capability.start();await Promise.all(child.getAnimations().map(animation=>animation.finished.catch(()=>{})));const childCannotCompleteParent=parent.dataset.uiMotion==='enter';capability.finish();parent.remove();const list=document.createElement('div');document.body.append(list);PlayroomDOM.ListController.update(list,'<aside class="chat-notification" data-entity="live-entry">Первое</aside>');const original=list.firstElementChild;PlayroomDOM.enterVisual(original);const updatingDuringEntry=original.getAnimations().some(animation=>animation.animationName==='ui-banner-in');PlayroomDOM.ListController.update(list,'<aside class="chat-notification" data-entity="live-entry">Обновлено</aside>');await Promise.resolve();const keyedSameNode=list.firstElementChild===original,keyedEntryConsumed=original.dataset.uiMotion!=='enter',keyedBodyUpdated=original.textContent==='Обновлено';list.remove();return {newerOwns,removedConsumed,childCannotCompleteParent,updatingDuringEntry,keyedSameNode,keyedEntryConsumed,keyedBodyUpdated};});assert.deepEqual(entryOwnership,{newerOwns:true,removedConsumed:true,childCannotCompleteParent:true,updatingDuringEntry:true,keyedSameNode:true,keyedEntryConsumed:true,keyedBodyUpdated:true});report.push({scope:'shared-entry-exact-capability',...entryOwnership});
  for(const profile of [{motion:'no-preference',touch:false},{motion:'no-preference',touch:true},{motion:'reduce',touch:false},{motion:'reduce',touch:true}]){
   const m=await fixture(browser,{addresses:Array.from({length:8},(_,i)=>'10.0.0.'+(i+1)),viewport:{width:390,height:844},reducedMotion:profile.motion,hasTouch:profile.touch});
   try{
    const activate=async locator=>profile.touch?locator.tap():locator.click();
    await activate(m.page.locator('#network-pair-button'));await activate(m.page.locator('.nearby-advanced>summary'));const source=m.page.locator('#acoustic-host-address');
    await source.evaluate(el=>{window.motionSource=el;window.motionEntryAtClick=null;window.motionSelectEvents=[];for(const name of ['pointerdown','pointerup','click'])document.addEventListener(name,event=>motionSelectEvents.push({type:name,target:event.target.tagName,prevented:event.defaultPrevented}),{once:true});document.addEventListener('click',()=>{const frame=document.querySelector('#modal-root>[data-surface-state=active]'),animations=frame.getAnimations({subtree:true});window.motionEntryAtClick={count:animations.length,running:animations.some(a=>a.playState==='running')};},{once:true});});await activate(source);await m.page.waitForFunction(()=>!!motionEntryAtClick,null,{timeout:1000}).catch(()=>{});
    const entry=await m.page.evaluate(()=>{window.motionClosing=document.querySelector('#modal-root>[data-surface-state=active]');return motionEntryAtClick||{count:0,running:false,events:motionSelectEvents};});
    assert.equal(entry.count>0,profile.motion==='no-preference','ordinary panel entry animates; reduced motion does not '+JSON.stringify({profile,entry}));
    await m.page.keyboard.press('Escape');
    const closed=await m.page.evaluate(()=>({connected:motionClosing.isConnected,inert:motionClosing.inert,exit:motionClosing.closest('[data-ui-surface-exit]')?.outerHTML.slice(0,250),active:document.querySelector('#modal-root>[data-surface-state=active]')===motionSource.closest('[data-surface-state]'),animations:motionClosing.getAnimations({subtree:true}).map(a=>a.animationName||a.id)}));
    report.push({profile,entry,closed});
    assert.equal(closed.active,true,'Back during entry immediately restores the exact source capability');
    if(profile.motion==='no-preference'){assert.equal(closed.connected,true,'closing surface remains visible until its exit finishes');assert.equal(closed.inert,true,'retired surface cannot receive input during exit');assert(closed.animations.length,'exit has an actual animation');}
    else assert.equal(closed.connected,false,'reduced motion removes the visual surface immediately');
    await activate(source);const replacement=await m.page.evaluate(()=>{window.motionReplacement=document.querySelector('#modal-root>[data-surface-state=active]');return motionReplacement!==motionClosing;});assert(replacement,'reopening while closing creates one current owned panel');
    await m.page.evaluate(()=>Promise.all(motionReplacement.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    assert(await m.page.evaluate(()=>motionReplacement.isConnected&&!motionReplacement.inert&&document.querySelectorAll('#modal-root>[data-surface-state=active]').length===1),'old completion cannot retire the replacement');assert(await m.page.evaluate(()=>motionReplacement.dataset.uiMotion!=='enter'),'completed entry capability is consumed');
    await m.page.setViewportSize({width:844,height:390});await m.page.waitForFunction(()=>document.querySelector('.pairing-choice-dialog')?.dataset.panelScrollable==='true');const scrollBody=m.page.locator('#modal-root>[data-surface-state=active] .modal-body');assert(await scrollBody.evaluate(el=>el.scrollHeight>el.clientHeight));const scrollBox=await scrollBody.boundingBox();
    if(profile.touch&&engine==='chromium'){const cdp=await m.context.newCDPSession(m.page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scrollBox.x+scrollBox.width/2,y:scrollBox.y+scrollBox.height-30}]});for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scrollBox.x+scrollBox.width/2,y:scrollBox.y+scrollBox.height-30-step*20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await m.page.mouse.move(scrollBox.x+scrollBox.width/2,scrollBox.y+scrollBox.height/2);await m.page.mouse.wheel(0,160);}await scrollBody.evaluate(el=>new Promise(resolve=>{if(el.scrollTop>0)return resolve();el.addEventListener('scroll',()=>resolve(),{once:true});}));assert(await scrollBody.evaluate(el=>el.scrollTop>0));assert.equal(await m.page.locator('#modal-root>[data-surface-state=active] .pairing-choice-dialog').count(),1,'scrolling real choices must not dismiss the panel');
    await m.page.setViewportSize({width:390,height:844});await m.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const blank=m.page.locator('#modal-root>[data-surface-state=active] [data-surface-symbol]'),blankBox=await blank.boundingBox(),point={x:blankBox.x+blankBox.width/2,y:blankBox.y+blankBox.height/2};const original=await source.inputValue();await m.page.evaluate(point=>{window.panelPoint=point;window.panelEvents=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,event=>panelEvents.push({type:name,target:event.target.tagName,selection:getSelection()?.toString(),pull:document.querySelector('.pairing-choice-dialog')?.dataset.surfacePulling}),{capture:true});},point);
    await blank.evaluate(el=>{const title=el.closest('.modal-head').querySelector('h2').firstChild;getSelection().setBaseAndExtent(title,0,title,Math.min(3,title.length));window.panelSelectedText=getSelection().toString();});await blank.dispatchEvent('pointerdown',{button:0,pointerId:61,pointerType:'touch',clientX:point.x,clientY:point.y});await blank.dispatchEvent('pointermove',{pointerId:61,pointerType:'touch',clientX:point.x,clientY:point.y+90});await blank.dispatchEvent('pointerup',{pointerId:61,pointerType:'touch',clientX:point.x,clientY:point.y+90});assert.equal(await m.page.locator('#modal-root>[data-surface-state=active] .pairing-choice-dialog').count(),1);assert(await m.page.evaluate(()=>getSelection().toString()===panelSelectedText));await m.page.evaluate(()=>getSelection().removeAllRanges());
    if(profile.touch&&engine==='chromium'){const cdp=await m.context.newCDPSession(m.page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+step*18}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else if(profile.touch){await blank.dispatchEvent('pointerdown',{button:0,pointerId:62,pointerType:'touch',clientX:point.x,clientY:point.y});await blank.dispatchEvent('pointermove',{pointerId:62,pointerType:'touch',clientX:point.x,clientY:point.y+90});await blank.dispatchEvent('pointerup',{pointerId:62,pointerType:'touch',clientX:point.x,clientY:point.y+90});}else{await m.page.mouse.move(point.x,point.y);await m.page.mouse.down();await m.page.mouse.move(point.x,point.y+90,{steps:5});await m.page.mouse.up();}
    await m.page.waitForFunction(()=>!document.querySelector('.pairing-choice-dialog'),null,{timeout:1500}).catch(async error=>{throw new Error(JSON.stringify({profile,point,debug:await m.page.evaluate(()=>({selected:getSelection()?.toString(),target:document.elementFromPoint(window.panelPoint.x,window.panelPoint.y)?.outerHTML.slice(0,350),events:window.panelEvents,panel:document.querySelector('.pairing-choice-dialog')?.outerHTML.slice(0,450)}))})+' '+error.message);});assert(await source.evaluate(el=>el===motionSource&&el===document.activeElement));assert.equal(await source.inputValue(),original,'blank swipe does not choose an option or click through');report.push({profile,blankSwipe:true,nativeScroll:true,selectionPreserved:true,touchGesture:profile.touch?(engine==='chromium'?'native CDP touch':'controlled PointerEvent; native wheel scroll'):'native mouse'});assert.deepEqual(m.errors,[]);
    await activate(source);await m.page.keyboard.press('Escape');await m.page.evaluate(()=>PlayroomAppBridge.closeModal());assert.equal(await m.page.locator('[data-ui-surface-exit]').count(),0,'root reset flushes already running visual exits');
    await m.page.evaluate(()=>PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Справка')+'<button class="icon-btn" popovertarget="motion-help" aria-label="Пояснение">?</button><aside id="motion-help" class="mini-help-popover" popover="auto">Пояснение рядом с пунктом.</aside><input value="Сохранённый ввод">','settings-modal'));
    await m.page.locator('#modal-root>[data-surface-state=active]').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    if(profile.touch)await activate(m.page.locator('[popovertarget=motion-help]'));else{const button=m.page.locator('[popovertarget=motion-help]'),box=await button.boundingBox();await m.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await m.page.mouse.down();await button.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));const pressed=await button.evaluate(el=>getComputedStyle(el).scale);await m.page.mouse.up();await button.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));const released=await button.evaluate(el=>getComputedStyle(el).scale);if(profile.motion==='no-preference'){assert(Number(pressed)<1,'press feedback visibly compresses the chrome action');assert(['none','1'].includes(released),'release returns to resting size');}report.push({profile,pressed,released});}await m.page.locator('#motion-help:popover-open').waitFor();const nativeEntry=await m.page.locator('#motion-help').evaluate(el=>{window.motionHelp=el;return {animations:el.getAnimations().length,box:el.getBoundingClientRect().toJSON()};});await m.page.locator('#motion-help').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));const nativeResting=await m.page.locator('#motion-help').evaluate(el=>el.getBoundingClientRect().toJSON());await m.page.locator('#motion-help').evaluate(el=>el.addEventListener('toggle',event=>{if(event.newState==='closed')window.motionNativeClosedAtToggle={display:getComputedStyle(el).display,animations:el.getAnimations().map(a=>({end:a.effect.getComputedTiming().endTime,state:a.playState}))};}));await m.page.keyboard.press('Escape');assert.equal(await m.page.locator('#motion-help:popover-open').count(),0);const nativeExit=await m.page.locator('#motion-help').evaluate(el=>({display:getComputedStyle(el).display,pointerEvents:getComputedStyle(el).pointerEvents,visibility:getComputedStyle(el).visibility,inert:el.inert,ariaHidden:el.getAttribute('aria-hidden'),box:el.getBoundingClientRect().toJSON(),atToggle:window.motionNativeClosedAtToggle||null,supportsOverlay:CSS.supports('overlay','auto'),supportsDiscrete:CSS.supports('transition-behavior','allow-discrete'),animations:el.getAnimations().map(a=>({state:a.playState,end:a.effect.getComputedTiming().endTime}))}));report.push({profile,nativeExitDiagnostic:nativeExit});if(profile.motion==='no-preference'){assert(nativeExit.animations.length>0&&nativeExit.animations.every(a=>Number.isFinite(a.end)&&a.end<=250),'native popover close has finite actual transitions');assert.notEqual(nativeExit.display,'none','native popover remains painted for its exit');assert.equal(nativeExit.pointerEvents,'none');assert(nativeExit.inert&&nativeExit.ariaHidden==='true','native closing body is immediately outside keyboard and accessibility interaction');assert(Math.abs((nativeExit.box.left+nativeExit.box.right-nativeResting.left-nativeResting.right)/2)<1&&Math.abs((nativeExit.box.top+nativeExit.box.bottom-nativeResting.top-nativeResting.bottom)/2)<1,'native exit keeps its anchored position after top-layer removal');}else assert.equal(nativeExit.animations.length,0);await m.page.keyboard.press('Enter');assert.equal(await m.page.locator('#motion-help:popover-open').count(),1,'reopen reverses the same native popover');assert(await m.page.locator('#motion-help').evaluate(el=>el===motionHelp&&!el.inert&&el.getAttribute('aria-hidden')===null));await m.page.locator('#motion-help').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));await m.page.keyboard.press('Escape');await m.page.keyboard.press('Tab');assert.equal(await m.page.locator('input').evaluate(el=>el===document.activeElement),true,'closed popover cannot trap keyboard focus');if(profile.motion==='no-preference')await m.page.screenshot({path:path.join(out,engine+'-native-popover-exit-'+(profile.touch?'touch':'desktop')+'.png'),animations:'allow'});await m.page.locator('#motion-help').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));assert(await m.page.locator('#motion-help').evaluate(el=>getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden'),'native popover finishes hidden');assert.equal(await m.page.locator('input').inputValue(),'Сохранённый ввод');report.push({profile,nativePopover:nativeEntry,nativeExit});
    const rapid=await m.page.evaluate(()=>{const dialogs=new PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')}),disposed=[];window.motionRetiredClicks=0;const markup=title=>'<div class="modal-backdrop"><section class="modal" data-ui-surface="panel"><button>'+title+'</button></section></div>';const parent=dialogs.open(markup('Parent'),{mode:'push',onDispose:()=>disposed.push('parent')}),child=dialogs.open(markup('Child'),{mode:'push',onDispose:()=>disposed.push('child')});document.addEventListener('click',event=>{if(child.element.contains(event.target))motionRetiredClicks++;},true);dialogs.close(child,{reason:'back'});dialogs.close(parent,{reason:'back'});child.element.querySelector('button').click();const layers=[...document.querySelectorAll('[data-ui-surface-exit]')],ordered=!child.element.isConnected||layers.indexOf(parent.element.parentElement)<layers.indexOf(child.element.parentElement);return {disposed,states:[parent.state,child.state],retiredClicks:motionRetiredClicks,ordered,focusRetired:!!document.activeElement.closest('[data-ui-surface-exit]')};});assert.deepEqual(rapid.disposed,['child','parent']);assert.deepEqual(rapid.states,['disposed','disposed']);assert.equal(rapid.retiredClicks,0);assert(rapid.ordered&&!rapid.focusRetired);await m.page.waitForFunction(()=>!document.querySelector('[data-ui-surface-exit]'));report.push({profile,rapidBack:rapid});
    report.push({motion:profile.motion,touch:profile.touch,entry,closed,reopen:'same source, one active frame, completed exit'});
   }finally{await m.context.close();}
  }
 }finally{fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify({report,errors:f.errors,scope:'controlled pairing presenter and actual shared ModalController; no RTC/provider/device claim'},null,2));await f.context.close();await browser.close();}
});

test('shared visual entry waits for animation readiness after synchronous panel preparation',{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']}),report=[];
 try{for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const f=await fixture(browser,{viewport,reducedMotion:'no-preference',hasTouch:true});
  try{await f.page.evaluate(()=>{window.busyEntry={events:[],click:0};const button=document.createElement('button');button.id='busy-panel-trigger';button.textContent='Параметры';document.body.prepend(button);for(const type of ['animationstart','animationend','animationcancel'])document.addEventListener(type,event=>{if(event.target.matches('.room-rules-modal'))busyEntry.events.push({type,elapsed:event.elapsedTime,at:performance.now()-busyEntry.click});},true);button.onclick=()=>{busyEntry.click=performance.now();PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Параметры игры')+'<p>Подготовка содержимого</p>','room-rules-modal');const until=performance.now()+320;while(performance.now()<until){}requestAnimationFrame(()=>{busyEntry.firstFrame=performance.now()-busyEntry.click;});};});
   await f.page.locator('#busy-panel-trigger').tap();await f.page.waitForTimeout(650);const value=await f.page.evaluate(()=>({...busyEntry,remaining:document.querySelector('#modal-root>[data-surface-state=active]')?.dataset.uiMotion}));report.push({viewport,...value});assert(value.firstFrame>=300,'fixture actually delays the first rendering opportunity');assert(value.events.some(e=>e.type==='animationend'&&e.elapsed>=.17),'entry must complete its full180ms after preparation: '+JSON.stringify(value));assert(!value.events.some(e=>e.type==='animationcancel'),'wall-clock watchdog must not cut pending entry');assert.notEqual(value.remaining,'enter','entry lifecycle is consumed after completion');
   const cleanup=await f.page.evaluate(async()=>{PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Настройки')+'<input value="Черновик">','settings-modal');const frame=document.querySelector('#modal-root>[data-surface-state=active]'),input=frame.querySelector('input');input.focus();input.setSelectionRange(1,4);document.body.classList.add('reduced-motion');frame.querySelector('.modal').getAnimations();await Promise.resolve();document.body.classList.remove('reduced-motion');const preference={consumed:frame.dataset.uiMotion!=='enter',replayed:frame.querySelector('.modal').getAnimations().filter(a=>a.animationName?.endsWith('-in')).length,sameInput:frame.querySelector('input')===input,value:input.value,selection:[input.selectionStart,input.selectionEnd]};const node=document.createElement('aside');node.className='chat-notification';const entry=PlayroomDOM.prepareVisualEntry(node);document.body.append(node);entry.start();entry.finish();node.remove();await new Promise(requestAnimationFrame);return {preference,unmountedConsumed:node.dataset.uiMotion!=='enter'};});assert.deepEqual(cleanup,{preference:{consumed:true,replayed:0,sameInput:true,value:'Черновик',selection:[1,4]},unmountedConsumed:true});assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
 }}finally{if(process.env.PLAYROOM_ENTRY_REPORT){fs.mkdirSync(path.dirname(process.env.PLAYROOM_ENTRY_REPORT),{recursive:true});fs.writeFileSync(process.env.PLAYROOM_ENTRY_REPORT,JSON.stringify(report,null,2));}await browser.close();}
});

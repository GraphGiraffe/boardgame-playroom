'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchTestBrowser,phoneProfile}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const engine=process.env.PLAYROOM_TEST_BROWSER||'chromium';
const launch=()=>launchTestBrowser(engine);
async function secureFixture(){const server=await serveBrowserFixture(path.resolve(__dirname,'..'));return {...server,async open(page){await page.route(server.url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>RTC test</title>'}));await page.goto(server.url);}};}
const source=['core/messages.js','core/protocol.js','application/recovery-coordinator.js','application/replay-codec.js','presentation/event-stream.js','presentation/projection-sync.js','presentation/transition.js','presentation/network-projection.js','platform/web/realtime-peer.js','application/wire-codec.js','app/transports/reliable-channel.js','application/command-wire.js','app/transports/webrtc.js'].map(file=>{if(!process.env.WEBRTC_ARTIFACT)return fs.readFileSync(path.join(__dirname,'..',file),'utf8');const html=fs.readFileSync(process.env.WEBRTC_ARTIFACT,'utf8'),script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.trimStart().startsWith('// '+file+'\n'));assert(script,'missing artifact module '+file);return script;}).join('\n');

test('two browser pages connect by manual WebRTC offer/answer and exchange RPC', {timeout:30000}, async t=>{
  const origin=await secureFixture();t.after(()=>origin.close());
  const browser=await launch();t.after(()=>browser.close());
  const hostContext=await browser.newContext(phoneProfile(engine)),clientContext=await browser.newContext(phoneProfile(engine)),host=await hostContext.newPage(),client=await clientContext.newPage();
  t.diagnostic(browser.browserType().name()+' '+browser.version());
  try{
    await Promise.all([origin.open(host),origin.open(client)]);await host.addScriptTag({content:source});await client.addScriptTag({content:source});
    const offer=await host.evaluate(async()=>{window.peer=await PlayroomWebRTCTransport.createHostPeer();let value=1;window.stop=PlayroomWebRTCTransport.serve(peer.channel,{snapshot:()=>({kind:'test',value}),dispatch:c=>({ok:true,value:value+=c.add}),history:i=>({index:i,value,...(i===99?{large:'Линия😀'.repeat(100000)}:{})}),subscribe:()=>()=>{},close(){}});return peer.offer;});
    const answer=await client.evaluate(async offer=>{window.peer=await PlayroomWebRTCTransport.createClientPeer(offer);return peer.answer;},offer);
    await host.evaluate(()=>{window.appliedAnswers=[];const apply=peer.pc.setRemoteDescription.bind(peer.pc);
      peer.pc.setRemoteDescription=description=>{appliedAnswers.push(peer.pc.signalingState);return apply(description);};});
    await Promise.all([
      host.evaluate(answer=>Promise.all([peer.acceptAnswer(answer),peer.acceptAnswer(answer)]),answer),
      client.evaluate(async()=>{window.transport=await peer.transport({timeout:5000});})
    ]);
    await client.evaluate(()=>transport.ready());
    await host.evaluate(answer=>peer.acceptAnswer(answer),answer);
    assert.deepEqual(await host.evaluate(()=>appliedAnswers),['have-local-offer']);
    const clientDebug=await client.evaluate(()=>transport.debug());
    const hostDebug=await host.evaluate(()=>peer.channel.__playroomDebug);
    assert.equal(clientDebug.ready,1);assert.ok(clientDebug.hellos>=1);
    assert.equal(hostDebug.ready>=1,true);assert.ok(hostDebug.hellos>=1);
    assert.deepEqual(await client.evaluate(()=>transport.snapshot()),{kind:'test',value:1});
    assert.deepEqual(await client.evaluate(()=>transport.dispatch({add:2})),{ok:true,value:3});
    assert.deepEqual(await client.evaluate(()=>transport.history(4)),{index:4,value:3});
    await host.evaluate(()=>{window.chunkSizes=[];const raw=peer.channel.send.bind(peer.channel);peer.channel.send=text=>{chunkSizes.push(typeof text==='string'?new TextEncoder().encode(text).length:text.byteLength);return raw(text);};});
    assert.equal(await client.evaluate(async()=>{const value=await transport.history(99);return value.large.length;}),'Линия😀'.repeat(100000).length);assert(await host.evaluate(()=>chunkSizes.length>10&&chunkSizes.every(size=>size<=16384)),'real SCTP history reply uses bounded chunks');
    const staleAnswer=answer;
    const nextOffer=await host.evaluate(async()=>{window.nextPeer=await PlayroomWebRTCTransport.createHostPeer();return nextPeer.offer;});
    assert.notEqual(JSON.parse(nextOffer).pairingId,JSON.parse(offer).pairingId);
    await assert.rejects(()=>host.evaluate(stale=>nextPeer.acceptAnswer(stale),staleAnswer),/другому приглашению/i);
  }finally{await Promise.all([hostContext.close(),clientContext.close()]);}
});

test('RTC status avoids state downloads and commands have a single pushed state',{timeout:30000},async t=>{
 const origin=await secureFixture();t.after(()=>origin.close());
 const browser=await launch();t.after(()=>browser.close());
 const hc=await browser.newContext(),gc=await browser.newContext(),host=await hc.newPage(),guest=await gc.newPage();
 const clientSource=['application/client-connection-service.js','application/local-input-draft.js','platform/web/input-draft-store.js','app/session-client.js'].map(f=>{if(!process.env.WEBRTC_ARTIFACT)return fs.readFileSync(path.join(__dirname,'..',f),'utf8');return [...fs.readFileSync(process.env.WEBRTC_ARTIFACT,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.trimStart().startsWith('// '+f+'\n'));}).join('\n');
 try{await Promise.all([origin.open(host),origin.open(guest)]);await host.addScriptTag({content:source});await guest.addScriptTag({content:source+'\n'+clientSource});
 const offer=await host.evaluate(async()=>{
  window.peer=await PlayroomWebRTCTransport.createHostPeer();window.revision=0;window.calls={snapshot:0,status:0};const listeners=new Set();
  window.frame=()=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',game:'fixture',packVersion:'1',viewer:0,role:'player',revision,historyLength:revision+1,state:{move:revision,players:[],game:'fixture',packVersion:'1'},events:[],actions:[]});
  window.stop=PlayroomWebRTCTransport.serve(peer.channel,{snapshot:()=>{calls.snapshot++;return frame();},status:async()=>{calls.status++;return PlayroomProtocol.status(frame());},dispatch:async command=>{revision++;const snapshot=frame();for(const f of listeners)f(snapshot);return {ok:true,commandId:command.commandId,revision,snapshot};},history:index=>({...frame(),kind:'history',revision:index,state:{...frame().state,move:index}}),historyRange:(start,count)=>PlayroomProtocol.historyRange(index=>({...frame(),kind:'history',revision:index,state:{...frame().state,move:index}}),start,count,revision+1),subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},close(){}});return peer.offer;
 });
 const answer=await guest.evaluate(async offer=>{window.peer=await PlayroomWebRTCTransport.createClientPeer(offer);return peer.answer;},offer);
 await Promise.all([host.evaluate(answer=>peer.acceptAnswer(answer),answer),guest.evaluate(async()=>{window.transport=await peer.transport({timeout:5000});await transport.ready();window.client=new PlayroomSessionClient(transport);await client.refresh();})]);
 const result=await guest.evaluate(async()=>{for(let i=0;i<12;i++)if(!PlayroomProtocol.sameStatus(await transport.status(),client.snapshot))throw Error('status mismatch');const before=transport.debug(),receipt=await client.send({type:'increment'});const after=transport.debug();client.historyFrames.delete(0);const range=await client.historyRange(0,1);return {receipt,revision:client.snapshot.revision,before,after,historical:range.frames[0].revision};});
 assert.equal(result.receipt.ok,true);assert(!Object.hasOwn(result.receipt,'snapshot'));assert.equal(result.revision,1);assert.equal(result.historical,0);assert.equal(result.after.snapshots-result.before.snapshots,1);assert.equal(result.after.requests-result.before.requests,1);
 assert.deepEqual(await host.evaluate(()=>calls),{snapshot:1,status:12});
 }finally{await Promise.all([hc.close(),gc.close()]);}
});

test('real RTC resumes a stale in-flight visibility probe without waiting for a periodic poll',{timeout:30000},async t=>{
 const origin=await secureFixture();t.after(()=>origin.close());
 const browser=await launch();t.after(()=>browser.close());
 const hc=await browser.newContext(),gc=await browser.newContext(),host=await hc.newPage(),guest=await gc.newPage();
 try{
  await Promise.all([origin.open(host),origin.open(guest)]);await host.addScriptTag({content:source});await guest.addScriptTag({content:source});
  const offer=await host.evaluate(async()=>{window.calls={status:0,snapshot:0};window.peer=await PlayroomWebRTCTransport.createHostPeer();window.stop=PlayroomWebRTCTransport.serve(peer.channel,{snapshot:()=>{calls.snapshot++;return {kind:'fixture',revision:0};},status:async()=>{if(++calls.status===1)await new Promise(resolve=>window.releaseStatus=resolve);return {kind:'status',revision:0};},subscribe:()=>()=>{},close:()=>{}});return peer.offer;});
  const answer=await guest.evaluate(async offer=>{window.peer=await PlayroomWebRTCTransport.createClientPeer(offer);return peer.answer;},offer);
  await Promise.all([host.evaluate(answer=>peer.acceptAnswer(answer),answer),guest.evaluate(async()=>{window.transport=await peer.transport({timeout:5000});await transport.ready();window.visibilityPort={hidden:false,subscribe(fn){this.changed=fn;return ()=>{};}};window.periodic=0;window.reconciled=0;window.monitor=new PlayroomRecoveryCoordinator({link:peer.pc,transport,visibility:visibilityPort,currentStatus:()=>({kind:'status',revision:0}),clock:{now:()=>performance.now(),setInterval:()=>{periodic++;return 1;},clearInterval(){},setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},reconcile:async()=>{reconciled++;}});})]);
  await host.waitForFunction(()=>calls.status===1&&typeof releaseStatus==='function');
  await guest.evaluate(()=>{window.resumedAt=performance.now();visibilityPort.hidden=true;visibilityPort.changed();visibilityPort.hidden=false;visibilityPort.changed();window.recovered=monitor.check({recover:true});});await host.evaluate(()=>releaseStatus());
  const result=await guest.evaluate(async()=>{await recovered;return {state:monitor.state,notice:monitor.report().notice,reconciled,periodic,elapsedMs:performance.now()-resumedAt};});assert.deepEqual(await host.evaluate(()=>calls),{status:2,snapshot:1});assert.equal(result.state,'connected');assert.equal(result.notice,false);assert.equal(result.reconciled,1);assert.equal(result.periodic,1);
  if(process.env.RECOVERY_EVIDENCE){fs.mkdirSync(process.env.RECOVERY_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.RECOVERY_EVIDENCE,'rtc-resume.json'),JSON.stringify(result,null,2));}
 }finally{try{await guest.evaluate(()=>monitor?.close());}catch{}await Promise.all([hc.close(),gc.close()]);}
});

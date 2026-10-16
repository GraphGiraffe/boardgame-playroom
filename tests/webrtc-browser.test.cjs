'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const source=['core/messages.js','core/protocol.js','application/recovery-coordinator.js','app/transports/webrtc.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');

test('two browser pages connect by manual WebRTC offer/answer and exchange RPC', {timeout:30000}, async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hostContext=await browser.newContext(),clientContext=await browser.newContext(),host=await hostContext.newPage(),client=await clientContext.newPage();
  try{
    await host.addScriptTag({content:source});await client.addScriptTag({content:source});
    const offer=await host.evaluate(async()=>{window.peer=await PlayroomWebRTCTransport.createHostPeer();let value=1;window.stop=PlayroomWebRTCTransport.serve(peer.channel,{snapshot:()=>({kind:'test',value}),dispatch:c=>({ok:true,value:value+=c.add}),history:i=>({index:i,value}),subscribe:()=>()=>{},close(){}});return peer.offer;});
    const answer=await client.evaluate(async offer=>{window.peer=await PlayroomWebRTCTransport.createClientPeer(offer);return peer.answer;},offer);
    await Promise.all([
      host.evaluate(answer=>peer.acceptAnswer(answer),answer),
      client.evaluate(async()=>{window.transport=await peer.transport({timeout:5000});})
    ]);
    await client.evaluate(()=>transport.ready());
    const clientDebug=await client.evaluate(()=>transport.debug());
    const hostDebug=await host.evaluate(()=>peer.channel.__playroomDebug);
    assert.equal(clientDebug.ready,1);assert.ok(clientDebug.hellos>=1);
    assert.equal(hostDebug.ready>=1,true);assert.ok(hostDebug.hellos>=1);
    assert.deepEqual(await client.evaluate(()=>transport.snapshot()),{kind:'test',value:1});
    assert.deepEqual(await client.evaluate(()=>transport.dispatch({add:2})),{ok:true,value:3});
    assert.deepEqual(await client.evaluate(()=>transport.history(4)),{index:4,value:3});
    const staleAnswer=answer;
    const nextOffer=await host.evaluate(async()=>{window.nextPeer=await PlayroomWebRTCTransport.createHostPeer();return nextPeer.offer;});
    assert.notEqual(JSON.parse(nextOffer).pairingId,JSON.parse(offer).pairingId);
    await assert.rejects(()=>host.evaluate(stale=>nextPeer.acceptAnswer(stale),staleAnswer),/другому приглашению/i);
  }finally{await Promise.all([hostContext.close(),clientContext.close()]);await browser.close();}
});

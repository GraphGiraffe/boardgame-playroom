'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const source=fs.readFileSync(path.join(__dirname,'../app/acoustic-pairing.js'),'utf8');
const rtcSource=['core/messages.js','core/protocol.js','application/recovery-coordinator.js','app/transports/webrtc.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
const pairingSource=fs.readFileSync(path.join(__dirname,'../app/pairing.js'),'utf8');
function localIPv4(){
  return Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address||null;
}
test('compact acoustic SDP opens an actual Chromium RTCDataChannel', {timeout:45000},async()=>{
  const address=localIPv4();assert.ok(address,'Runner must have LAN IPv4');
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const ctxA=await browser.newContext(),ctxB=await browser.newContext(),a=await ctxA.newPage(),b=await ctxB.newPage();
  try{
    for(const page of [a,b]){await page.addScriptTag({content:rtcSource});await page.addScriptTag({content:pairingSource});await page.addScriptTag({content:source});}
    const offer=await a.evaluate(async()=>{window.peer=await PlayroomWebRTCTransport.createHostPeer();return peer.offer;});
    const offerToken=await a.evaluate(([signal,address])=>PlayroomPairing.fromSignal('offer',signal,{address}),[offer,address]);
    assert.ok(offerToken.startsWith('PR3.'));
    assert.ok(offerToken.length<=144);
    const answer=await b.evaluate(async token=>{const decoded=PlayroomPairing.decode(token);window.peer=await PlayroomWebRTCTransport.createClientPeer(decoded.signal);return peer.answer;},offerToken);
    const answerToken=await b.evaluate(([signal,address])=>PlayroomPairing.fromSignal('answer',signal,{address}),[answer,address]);
    assert.ok(answerToken.startsWith('PR3.'));
    await Promise.all([
      a.evaluate(token=>peer.acceptAnswer(PlayroomPairing.decode(token).signal),answerToken),
      b.evaluate(async()=>{const channel=await peer.waitOpen({timeout:12000});window.channel=channel;})
    ]);
    await Promise.all([
      a.waitForFunction(()=>globalThis.peer?.channel?.readyState==='open',null,{timeout:12000}),
      b.waitForFunction(()=>globalThis.channel?.readyState==='open',null,{timeout:12000})
    ]);
    const states=await Promise.all([
      a.evaluate(()=>peer.channel.readyState),
      b.evaluate(()=>channel.readyState)
    ]);
    assert.deepEqual(states,['open','open']);
    await b.evaluate(()=>{window.gotMessage=new Promise(resolve=>channel.addEventListener('message',event=>resolve(event.data),{once:true}));});
    await a.evaluate(()=>peer.channel.send('acoustic-pairing-ok'));
    assert.equal(await b.evaluate(()=>gotMessage),'acoustic-pairing-ok');
  }finally{await Promise.all([ctxA.close(),ctxB.close()]);await browser.close();}
});

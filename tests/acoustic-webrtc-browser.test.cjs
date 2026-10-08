'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const source=fs.readFileSync(path.join(__dirname,'../app/acoustic-pairing.js'),'utf8');
const rtcSource=fs.readFileSync(path.join(__dirname,'../app/transports/webrtc.js'),'utf8');
function localIPv4(){
  return Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address||null;
}
test('compact acoustic SDP opens an actual Chromium RTCDataChannel', {timeout:45000},async()=>{
  const address=localIPv4();assert.ok(address,'Runner must have LAN IPv4');
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const ctxA=await browser.newContext(),ctxB=await browser.newContext(),a=await ctxA.newPage(),b=await ctxB.newPage();
  try{
    for(const page of [a,b]){await page.addScriptTag({content:rtcSource});await page.addScriptTag({content:source});}
    const offer=await a.evaluate(async()=>{window.peer=await PlayroomWebRTCTransport.createHostPeer();return peer.offer;});
    const encoded=await a.evaluate(([signal,address])=>PlayroomAcousticPairing.pack(signal,{address}),[offer,address]);
    assert.ok(encoded.length<=140);
    const answer=await b.evaluate(async msg=>{const received=PlayroomAcousticPairing.unpack(msg);window.peer=await PlayroomWebRTCTransport.createClientPeer(received.signal);return peer.answer;},encoded);
    const reply=await b.evaluate(([signal,address])=>PlayroomAcousticPairing.pack(signal,{address}),[answer,address]);
    await Promise.all([
      a.evaluate(reply=>peer.acceptAnswer(PlayroomAcousticPairing.unpack(reply).signal),reply),
      b.evaluate(async()=>{const channel=await peer.waitOpen({timeout:12000});window.channel=channel;})
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

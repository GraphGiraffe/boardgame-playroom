'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../app/transports/webrtc.js');

test('manual signaling descriptions are versioned and validated',()=>{
  const offer={type:'offer',sdp:'v=0\r\na=test\r\n'},encoded=W.serializeDescription(offer);
  assert.deepEqual(W.parseDescription(encoded,'offer'),offer);
  const withPair=W.serializeDescription(offer,{pairingId:'pair-123'});
  assert.equal(W.parseSignal(withPair,'offer').pairingId,'pair-123');
  assert.throws(()=>W.parseDescription('not-json'),/код подключения/i);
  assert.throws(()=>W.parseDescription(JSON.stringify({v:2,type:'offer',sdp:'x'})),/код подключения/i);
  assert.throws(()=>W.parseDescription(W.serializeDescription({type:'answer',sdp:'x'}),'offer'),/Ожидался offer/i);
});

test('browser peer creation fails clearly when WebRTC is unavailable',async()=>{
  await assert.rejects(()=>W.createHostPeer(),/не поддерживает WebRTC/i);
  await assert.rejects(()=>W.createClientPeer(W.serializeDescription({type:'offer',sdp:'x'})),/не поддерживает WebRTC/i);
});

test('recovery serializes probes, validates before enabling input and excludes RTC secrets',async()=>{
 const pc=new EventTarget();Object.assign(pc,{connectionState:'connected',iceConnectionState:'connected',getStats:async()=>new Map([
  ['p',{type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'l',remoteCandidateId:'r'}],
  ['l',{candidateType:'host',protocol:'udp',address:'192.168.1.99',usernameFragment:'SECRET'}],['r',{candidateType:'srflx',address:'SECRET'}]])});
 let respond,calls=0,reconciled=false;
 const monitor=new W.Recovery({pc,transport:{snapshot(){calls++;return new Promise(r=>respond=r);}},reconcile:async()=>{reconciled=true;},interval:100000});
 try{assert.equal(monitor.state,'recovering');const a=monitor.check(),b=monitor.check();assert.equal(a,b);assert.equal(calls,1);
  respond({revision:3});await a;assert.equal(reconciled,true);assert.equal(monitor.state,'connected');
  assert.deepEqual(monitor.report().route,{local:'host',remote:'srflx',protocol:'udp'});assert(!JSON.stringify(monitor.report()).includes('SECRET'));
  assert(!JSON.stringify(monitor.report()).includes('192.168'));pc.connectionState='closed';pc.dispatchEvent(new Event('connectionstatechange'));assert.equal(monitor.state,'invite');
 }finally{monitor.close();}
});
test('late probe cannot re-enable a disconnected or replaced connection',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';let respond,reconciled=false;
 const monitor=new W.Recovery({pc,transport:{snapshot:()=>new Promise(r=>respond=r)},reconcile:async()=>{reconciled=true;},interval:100000});
 try{const flight=monitor.check();pc.connectionState='disconnected';pc.dispatchEvent(new Event('connectionstatechange'));respond({});await flight;
  assert.equal(reconciled,false);assert.equal(monitor.state,'recovering');
 }finally{monitor.close();}
});
test('failed resynchronization requests a fresh invitation, without leaving the room',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';
 const monitor=new W.Recovery({pc,transport:{snapshot:async()=>({})},reconcile:async()=>{throw Error('SECRET bad identity');},interval:100000});
 try{await monitor.check();assert.equal(monitor.state,'invite');assert.equal(monitor.report().error,'sync-failed');assert(!JSON.stringify(monitor.report()).includes('SECRET'));}finally{monitor.close();}
});

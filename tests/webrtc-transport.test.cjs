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

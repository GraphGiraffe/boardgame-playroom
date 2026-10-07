'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Pairing=require('../app/pairing.js');

test('pairing token round trips offer and answer signals',()=>{
  const signal=JSON.stringify({v:1,type:'offer',pairingId:'abc',sdp:'v=0\r\na=test\r\n'});
  const token=Pairing.fromSignal('offer',signal),value=Pairing.decode(token);
  assert.equal(value.v,2);assert.equal(value.kind,'offer');assert.equal(value.signal,signal);
  assert.ok(token.startsWith('PR2.'));
});

test('pairing token can travel as share text or custom protocol URL',()=>{
  const token=Pairing.fromSignal('answer','{"v":1,"type":"answer","sdp":"x"}');
  assert.equal(Pairing.extract(Pairing.shareText(token)),token);
  assert.equal(Pairing.extract(Pairing.protocolUrl(token)),token);
  assert.match(Pairing.protocolUrl(token),/^web\+playroom:pair\/PR2\./);
});

test('pairing parser rejects malformed payloads',()=>{
  assert.throws(()=>Pairing.decode('PR2.bad'),/приглашение/i);
  assert.throws(()=>Pairing.decode(Pairing.encode({v:2,kind:'other',signal:'x'})),/неподдерживаемое/i);
});

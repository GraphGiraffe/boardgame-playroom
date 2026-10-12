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

test('PR3 uses the EXACT SAME binary SDP frame in audio, QR, share and text',()=>{
  const A=require('../app/acoustic-pairing.js');
  const fingerprint=Array.from({length:32},()=> 'AB').join(':');
  for(const kind of ['offer','answer']){
    const signal=JSON.stringify({v:1,type:kind,pairingId:'123e4567-e89b-12d3-a456-426614174000',
      sdp:['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
        'a=fingerprint:sha-256 '+fingerprint,
        'a=candidate:1 1 udp 2122260223 192.168.0.112 43221 typ host',''].join('\r\n')});
    const compact=Pairing.fromSignal(kind,signal,{address:'192.168.0.112',port:43221});
    const legacy=Pairing.fromSignal(kind,signal,{legacy:true});
    assert.ok(compact.startsWith('PR3.'));
    assert.ok(compact.length<legacy.length/2,'compact must be substantially shorter');
    const audioBytes=compact.slice(Pairing.COMPACT_PREFIX.length);
    const acoustic=A.unpack(audioBytes);
    const decoded=Pairing.decode(compact);
    assert.equal(decoded.v,3);assert.equal(decoded.kind,kind);
    assert.equal(decoded.signal,acoustic.signal);
    assert.equal(decoded.ip,'192.168.0.112');
    assert.equal(Pairing.extract(Pairing.shareText(compact)),compact);
    assert.equal(Pairing.extract(Pairing.protocolUrl(compact)),compact);
    assert.equal(Pairing.extract('https://example.org/?pair='+encodeURIComponent(compact)),compact);
    assert.match(Pairing.protocolUrl(compact),/^web\+playroom:pair\/PR3\./);
  }
});

test('PR3 fallback and legacy PR2 are both accepted, corrupt PR3 is rejected',()=>{
  const noIce=JSON.stringify({v:1,type:'offer',pairingId:'abc',sdp:'v=0\r\n'});
  const fallback=Pairing.fromSignal('offer',noIce);
  assert.ok(fallback.startsWith('PR2.'));
  assert.deepEqual(Pairing.decode(fallback),{v:2,kind:'offer',signal:noIce});
  assert.throws(()=>Pairing.decode('PR3.bad'),/компактное/i);
});

test('TEST-NET-only browser SDP never masquerades as LAN; explicit manual IP switches QR/link to PR3',()=>{
  const sig=JSON.stringify({v:1,type:'offer',
    pairingId:'123e4567-e89b-12d3-a456-426614174000',
    sdp:['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
      'a=fingerprint:sha-256 '+Array(32).fill('AB').join(':'),
      'a=candidate:1 1 UDP 2122260223 192.0.2.1 60960 typ host',''].join('\r\n')});
  const without=Pairing.fromSignal('offer',sig);
  assert.ok(without.startsWith('PR2.'),'cannot pretend 192.0.2.1 is a routable local IP');
  const explicit=Pairing.fromSignal('offer',sig,{address:'192.168.0.112',port:60960});
  assert.ok(explicit.startsWith('PR3.'),'manual real IPv4 creates a compact QR/Share/audio frame');
  const packet=Pairing.decode(explicit);
  assert.equal(packet.ip,'192.168.0.112');
  assert.equal(packet.port,60960);
  assert.ok(explicit.length<200);
  assert.equal(Pairing.extract(Pairing.protocolUrl(explicit)),explicit);
});

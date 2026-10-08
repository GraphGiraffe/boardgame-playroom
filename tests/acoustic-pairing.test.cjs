'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/acoustic-pairing.js');

const id='123e4567-e89b-12d3-a456-426614174000';
const fp=Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0').toUpperCase()).join(':');
function signal(type='offer',{hostname=false,multiple=false}={}){
  const lines=['v=0','o=- 1 2 IN IP4 127.0.0.1','s=-','t=0 0',
    'a=group:BUNDLE 0','m=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'a=ice-ufrag:Ab1x','a=ice-pwd:Abcdefghijklmnopqrstu123',
    'a=fingerprint:sha-256 '+fp,'a=setup:'+(type==='offer'?'actpass':'active'),
    'a=candidate:1 1 udp 2122260223 '+(hostname?'a1b2.local':'192.168.1.52')+' 53920 typ host'];
  if(multiple)lines.push('a=candidate:2 1 UDP 2122187007 10.0.0.9 51332 typ host');
  return JSON.stringify({v:1,type,pairingId:id,sdp:lines.join('\r\n')+'\r\n'});
}

test('compact acoustic offer/answer round-trip keeps ICE and DTLS identity',()=>{
  for(const kind of ['offer','answer']){
    const msg=A.pack(signal(kind)),packet=A.unpack(msg),parsed=JSON.parse(packet.signal);
    assert.ok(msg.length<=140,'ggwave variable length limit');
    assert.equal(packet.kind,kind);
    assert.equal(packet.ip,'192.168.1.52');assert.equal(packet.port,53920);
    assert.equal(packet.pairingId,id);assert.equal(parsed.pairingId,id);
    assert.match(parsed.sdp,/a=ice-ufrag:Ab1x/);
    assert.match(parsed.sdp,/a=ice-pwd:Abcdefghijklmnopqrstu123/);
    assert.ok(parsed.sdp.includes('a=fingerprint:sha-256 '+fp));
    assert.match(parsed.sdp,/a=candidate:1 1 UDP 2122260223 192\.168\.1\.52 53920 typ host/);
    assert.match(parsed.sdp,new RegExp('a=setup:'+(kind==='offer'?'actpass':'active')));
  }
});

test('private candidate ordering favours 192.168 and 10.0; manual IP supports mDNS',()=>{
  const candidates=A.hostCandidates(signal('offer',{multiple:true}));
  assert.deepEqual(candidates.map(c=>c.address),['192.168.1.52','10.0.0.9']);
  const manual=A.unpack(A.pack(signal('offer',{hostname:true}),{address:'192.168.0.78'}));
  assert.equal(manual.ip,'192.168.0.78');assert.equal(manual.port,53920);
});

test('invalid LAN addresses, malformed packets and unsupported signaling fail safely',()=>{
  for(const addr of ['127.0.0.1','0.0.0.0','999.1.2.3','abc.local']){
    assert.throws(()=>A.pack(signal(),{address:addr}),/IPv4|LAN/i);
  }
  assert.throws(()=>A.pack('not-a-signal'),/WebRTC/);
  assert.throws(()=>A.unpack('not base64!'),/повреждено/i);
  const message=A.pack(signal());
  assert.throws(()=>A.unpack(message.slice(2)),/несовместимо|повреждено/i);
  assert.deepEqual(Object.keys(A.protocols),['normal','fast','fastest']);
});

test('bundled ggwave encodes short audio payload without network dependencies',async()=>{
  const factory=require('../app/vendor/ggwave.js');
  const gg=await factory(),params=gg.getDefaultParameters(),inst=gg.init(params);
  try{
    const payload=A.pack(signal()),wave=gg.encode(inst,payload,gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST,12);
    assert.ok(wave.byteLength>4096);
    assert.equal(wave.byteLength%4,0);
  }finally{gg.free(inst);}
});

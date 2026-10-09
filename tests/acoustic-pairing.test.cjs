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


test('enumerates ALL browser-visible addresses including VPN, public, test, TCP, IPv6 and mDNS',()=>{
  const src=JSON.parse(signal()).sdp;
  const rows=[
    'a=candidate:2 1 UDP 2122260223 192.0.2.1 38808 typ host',
    'a=candidate:3 1 UDP 2122260222 192.168.0.112 40011 typ host',
    'a=candidate:4 1 UDP 2122260221 10.24.205.39 40012 typ host',
    'a=candidate:5 1 UDP 2122260220 12.96.74.147 40013 typ host',
    'a=candidate:6 1 UDP 2122260219 198.51.100.22 40014 typ srflx raddr 10.0.0.1 rport 30101',
    'a=candidate:7 1 TCP 2122260218 10.24.205.39 9 typ host tcptype active',
    'a=candidate:8 1 UDP 2122260217 fe80::1020 40015 typ host',
    'a=candidate:9 1 UDP 2122260216 foo-bar.local 40016 typ host'
  ];
  const datum=JSON.stringify({...JSON.parse(signal()),sdp:src+'\r\n'+rows.join('\r\n')});
  const items=A.allCandidates(datum);
  assert.equal(items.length,9,'no ICE connection type silently discarded');
  for(const address of ['192.0.2.1','192.168.0.112','10.24.205.39','12.96.74.147',
    '198.51.100.22','fe80::1020','foo-bar.local'])
    assert.ok(items.some(c=>c.address===address),'missing '+address);
  assert.equal(items.find(c=>c.address==='192.0.2.1').kind,'documentation');
  assert.equal(items.find(c=>c.address==='192.0.2.1').audio,false);
  assert.equal(items.find(c=>c.address==='fe80::1020').kind,'ipv6');
  assert.equal(items.find(c=>c.type==='srflx').audio,false);
  assert.equal(items.find(c=>c.transport==='tcp').audio,false);
  assert.equal(items[0].kind,'lan','a private LAN route should be recommended, not a VPN/test address');
  assert.throws(()=>A.pack(datum,{address:'192.0.2.1',port:38808}),/host|тестов|LAN/);
  assert.throws(()=>A.pack(datum,{address:'198.51.100.22',port:40014}),/host/);
  const chosen=A.unpack(A.pack(datum,{address:'10.24.205.39',port:40012}));
  assert.equal(chosen.ip,'10.24.205.39');assert.equal(chosen.port,40012);
});

test('dedicated WebRTC interface probe returns additional IPs without external STUN',async()=>{
  const previous=globalThis.RTCPeerConnection;
  const observed=[];
  class Probe {
    constructor(configuration){observed.push(configuration);this.iceGatheringState='new';this.events=new Map();}
    addEventListener(name,fn){this.events.set(name,fn);}
    removeEventListener(name){this.events.delete(name);}
    createDataChannel(){}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};}
    async setLocalDescription(){
      this.localDescription={sdp:'v=0\r\n'+
        'a=candidate:1 1 udp 2122260223 192.168.0.112 31222 typ host\r\n'+
        'a=candidate:2 1 udp 2122260222 10.24.205.39 31223 typ host\r\n'};
      this.iceGatheringState='complete';
    }
    close(){this.closed=true;}
  }
  globalThis.RTCPeerConnection=Probe;
  try{
    const values=await A.probeAddresses({timeout:200});
    assert.deepEqual(values.map(c=>c.address),['192.168.0.112','10.24.205.39']);
    assert.ok(values.every(c=>c.source==='probe'&&c.port===null&&!c.audio));
    assert.deepEqual(observed,[{iceServers:[]}]);
  }finally{if(previous===undefined)delete globalThis.RTCPeerConnection;else globalThis.RTCPeerConnection=previous;}
});

test('RTCStats discovery reveals additional exposed interfaces without inventing IPs',()=>{
  const report=new Map([
    ['a',{type:'local-candidate',address:'192.0.2.1',protocol:'udp',candidateType:'host'}],
    ['b',{type:'local-candidate',address:'192.168.0.112',protocol:'udp',candidateType:'host'}],
    ['c',{type:'local-candidate',ip:'10.24.205.39',protocol:'udp',candidateType:'host'}],
    ['d',{type:'local-candidate',address:'fe80::1234',protocol:'udp',candidateType:'host'}],
    ['e',{type:'remote-candidate',address:'8.8.8.8'}]
  ]);
  const addresses=A.statsAddresses(report);
  assert.deepEqual(addresses.map(v=>v.address),['192.0.2.1','192.168.0.112','10.24.205.39','fe80::1234']);
  assert.equal(addresses.find(v=>v.address==='192.0.2.1').kind,'documentation');
  assert.ok(addresses.every(v=>v.source==='stats'&&!v.audio&&v.port===null),
    'diagnostic stats are not candidates of the active offer');
  assert.deepEqual(A.statsAddresses(null),[]);
});

test('secondary probe merges ICE and RTCStats addresses, preserving independent provenance',async()=>{
  const previous=globalThis.RTCPeerConnection;
  class StatsProbe {
    constructor(configuration){assert.deepEqual(configuration,{iceServers:[]});this.iceGatheringState='complete';}
    addEventListener(){}
    removeEventListener(){}
    createDataChannel(){}
    async createOffer(){return {type:'offer',sdp:'v=0\r\n'};}
    async setLocalDescription(){this.localDescription={sdp:'v=0\r\na=candidate:1 1 UDP 2122260223 192.0.2.1 60960 typ host\r\n'};}
    async getStats(){return new Map([['candidate',{type:'local-candidate',address:'192.168.0.112',protocol:'udp',candidateType:'host'}]]);}
    close(){}
  }
  globalThis.RTCPeerConnection=StatsProbe;
  try{
    const found=await A.probeAddresses({timeout:100});
    assert.deepEqual(found.map(v=>v.address),['192.168.0.112','192.0.2.1']);
    assert.equal(found[0].source,'stats');
    assert.equal(found[1].source,'probe');
  }finally{if(previous===undefined)delete globalThis.RTCPeerConnection;else globalThis.RTCPeerConnection=previous;}
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

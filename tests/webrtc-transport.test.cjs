'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../app/transports/webrtc.js');

// Probe fixtures drive the status request; snapshots are now a separate resync.
const probe=transport=>({status:()=>transport.snapshot(),snapshot:async()=>({})});

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
 const monitor=new W.Recovery({pc,transport:probe({snapshot(){calls++;return new Promise(r=>respond=r);}}),reconcile:async()=>{reconciled=true;},interval:100000});
 try{await new Promise(r=>setImmediate(r));assert.equal(monitor.state,'recovering');const a=monitor.check(),b=monitor.check();assert.equal(a,b);assert.equal(calls,1);
  respond({revision:3});await a;assert.equal(reconciled,true);assert.equal(monitor.state,'connected');
  assert.deepEqual(monitor.report().route,{local:'host',remote:'srflx',protocol:'udp'});assert(!JSON.stringify(monitor.report()).includes('SECRET'));
  assert(!JSON.stringify(monitor.report()).includes('192.168'));pc.connectionState='closed';pc.dispatchEvent(new Event('connectionstatechange'));assert.equal(monitor.state,'invite');
 }finally{monitor.close();}
});
test('late probe cannot re-enable a disconnected or replaced connection',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';let respond,reconciled=false;
 const monitor=new W.Recovery({pc,transport:probe({snapshot:()=>new Promise(r=>respond=r)}),reconcile:async()=>{reconciled=true;},interval:100000});
 try{await new Promise(r=>setImmediate(r));const flight=monitor.check();pc.connectionState='disconnected';pc.dispatchEvent(new Event('connectionstatechange'));respond({});await flight;
  assert.equal(reconciled,false);assert.equal(monitor.state,'recovering');
 }finally{monitor.close();}
});
test('failed resynchronization requests a fresh invitation, without leaving the room',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';
 const monitor=new W.Recovery({pc,transport:probe({snapshot:async()=>({})}),reconcile:async()=>{throw Error('SECRET bad identity');},interval:100000});
 try{await monitor.check();assert.equal(monitor.state,'invite');assert.equal(monitor.report().error,'sync-failed');assert(!JSON.stringify(monitor.report()).includes('SECRET'));}finally{monitor.close();}
});


test('successful heartbeat reasserts connected after pending-command reconciliation',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';let enabled=false,count=0;
 const monitor=new W.Recovery({pc,transport:probe({snapshot:async()=>({})}),reconcile:async()=>{enabled=false;},onState:r=>{enabled=r.state==='connected';if(enabled)count++;},interval:100000});
 try{await monitor.check();assert(enabled);await monitor.check();assert(enabled);assert.equal(count,2);assert.equal(monitor.events.filter(e=>e.state==='connected').length,1);}finally{monitor.close();}
});
test('temporary snapshot timeout retries the live link before requesting a new invitation',async()=>{
 const pc=new EventTarget();pc.connectionState='connected';let calls=0;
 const monitor=new W.Recovery({pc,transport:probe({snapshot:async()=>{if(++calls===1)throw Error('timeout');return {};}}),reconcile:async()=>{},interval:100000});
 try{await monitor.check();assert.equal(monitor.state,'recovering');assert.equal(monitor.error,'request-timeout');await monitor.check();assert.equal(monitor.state,'connected');assert.equal(monitor.graceTimer,null);}finally{monitor.close();}
});

test('brief recovery stays silent, prolonged recovery notifies, successful host sync clears notice',async()=>{
 const Recovery=require('../application/recovery-coordinator.js'),link=new EventTarget();link.connectionState='connected';
 const timers=new Map();let seq=0,fail=false,reconciles=0;
 const monitor=new Recovery({link,transport:probe({snapshot:async()=>{if(fail)throw Error('timeout');return {};}}),reconcile:async()=>{reconciles++;},visibility:{hidden:false,subscribe:()=>()=>{}},clock:{now:()=>0,setInterval:()=>0,clearInterval(){},setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout(id){timers.delete(id);}}});
 try{
  await monitor.check();fail=true;await monitor.check();assert.equal(monitor.report().notice,false);
  fail=false;await monitor.check();assert.equal(monitor.state,'connected');assert.equal(timers.size,0);
  fail=true;await monitor.check();const notice=[...timers.values()].find(t=>t.ms===5000);notice.fn();assert.equal(monitor.report().notice,true);
  fail=false;await monitor.check();assert.equal(monitor.report().notice,false);assert.equal(monitor.state,'connected');assert.equal(reconciles,3);
 }finally{monitor.close();}
});


test('authorized final snapshot reaches guest before lobby even when authorization finishes out of order',async()=>{
 let publish;const approvals=[],delivered=[];const connection={subscribe(fn){publish=fn;return()=>{};}};
 const off=W.subscribeAuthorized(connection,s=>delivered.push(s),()=>new Promise((resolve,reject)=>approvals.push({resolve,reject})));
 publish({kind:'snapshot',sessionId:'match',state:{status:'finished'}});publish({kind:'lobby',room:{id:'room'}});
 approvals[1].resolve();await new Promise(r=>setImmediate(r));assert.equal(delivered.length,0,'lobby must wait for its final game projection');
 approvals[0].resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(delivered.map(s=>s.kind),['snapshot','lobby']);off();
});

test('authorized snapshot stream still rejects revoked peers and ignores detached subscriptions',async()=>{
 let publish,resolve,reject,denied=0;const delivered=[];const connection={subscribe(fn){publish=fn;return()=>{};}};
 const off=W.subscribeAuthorized(connection,s=>delivered.push(s),()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),{deny:()=>denied++});publish({kind:'snapshot',state:{status:'finished'}});reject(Error('forbidden'));await new Promise(r=>setImmediate(r));assert.equal(denied,1);assert.equal(delivered.length,0);off();
 const off2=W.subscribeAuthorized(connection,s=>delivered.push(s),()=>new Promise(yes=>resolve=yes));publish({kind:'snapshot',state:{status:'finished'}});off2();resolve();await new Promise(r=>setImmediate(r));assert.equal(delivered.length,0);
});


test('authorized intermediate snapshots coalesce while revoked final state blocks queued lobby',async()=>{
 let publish;const approvals=[],delivered=[];let denied=0;
 const connection={subscribe(fn){publish=fn;return()=>{};}};
 const off=W.subscribeAuthorized(connection,s=>delivered.push(s),()=>new Promise((resolve,reject)=>approvals.push({resolve,reject})),{deny:()=>denied++});
 publish({kind:'snapshot',revision:1,state:{status:'playing'}});publish({kind:'snapshot',revision:2,state:{status:'playing'}});
 approvals[0].resolve();approvals[1].resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(delivered.map(s=>s.revision),[2]);
 publish({kind:'snapshot',state:{status:'finished'}});publish({kind:'lobby'});
 approvals[3].resolve();approvals[2].reject(Error('revoked'));await new Promise(r=>setImmediate(r));assert.equal(denied,1);assert.equal(delivered.length,1);off();
});

function fakePairingRTC(){
 const instances=[];
 class Channel extends EventTarget{constructor(){super();this.readyState='connecting';}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
 class PC extends EventTarget{
  constructor(){super();instances.push(this);this.iceGatheringState='complete';this.signalingState='stable';this.connectionState='new';this.remoteSets=0;}
  createDataChannel(label,options){const channel=new Channel();channel.protocol=options?.protocol||'';if(channel.protocol==='playroom.preview.v2')this.previewChannel=channel;else this.channel=channel;return channel;}async createOffer(){return {type:'offer',sdp:'offer'};}async createAnswer(){return {type:'answer',sdp:'answer'};}
  async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable';}
  async setRemoteDescription(d){if(d.type==='answer'&&this.signalingState==='stable')throw Error('Called in wrong state: stable');this.remoteSets++;this.remoteDescription=d;this.signalingState=d.type==='answer'?'stable':'have-remote-offer';}
  close(){this.connectionState='closed';this.dispatchEvent(new Event('connectionstatechange'));}
 }
 return {PC,instances};
}
test('repeated answer acceptance is idempotent during and after negotiation',{timeout:1000},async()=>{
 const previous=globalThis.RTCPeerConnection,{PC,instances}=fakePairingRTC();globalThis.RTCPeerConnection=PC;
 try{const host=await W.createHostPeer(),answer=W.serializeDescription({type:'answer',sdp:'answer'},{pairingId:host.pairingId});const first=host.acceptAnswer(answer),second=host.acceptAnswer(answer);await new Promise(r=>setImmediate(r));instances[0].channel.readyState='open';instances[0].channel.dispatchEvent(new Event('open'));await Promise.all([first,second]);await host.acceptAnswer(answer);assert.equal(instances[0].remoteSets,1);await assert.rejects(host.acceptAnswer(W.serializeDescription({type:'answer',sdp:'different'},{pairingId:host.pairingId})),/приглашению/i);host.close();}finally{globalThis.RTCPeerConnection=previous;}
});
test('incoming datachannel wait has a deadline even before the channel exists',{timeout:1000},async()=>{
 const previous=globalThis.RTCPeerConnection,{PC}=fakePairingRTC();globalThis.RTCPeerConnection=PC;
 try{const peer=await W.createClientPeer(W.serializeDescription({type:'offer',sdp:'offer'}));await assert.rejects(peer.waitOpen({timeout:20}),/соедин|канал|подключ/i);peer.close();}finally{globalThis.RTCPeerConnection=previous;}
});

test('incoming datachannel wait stops on ICE failure and explicit close',{timeout:1000},async()=>{
 const previous=globalThis.RTCPeerConnection,{PC,instances}=fakePairingRTC();globalThis.RTCPeerConnection=PC;
 try{const peer=await W.createClientPeer(W.serializeDescription({type:'offer',sdp:'offer'}));let pending=peer.waitOpen({timeout:500});instances[0].connectionState='failed';instances[0].dispatchEvent(new Event('connectionstatechange'));await assert.rejects(pending,/закрыт/i);peer.close();const other=await W.createClientPeer(W.serializeDescription({type:'offer',sdp:'offer'}));pending=other.waitOpen({timeout:500});other.close();await assert.rejects(pending,/закрыт/i);}finally{globalThis.RTCPeerConnection=previous;}
});


test('ICE selected method uses selected transport pair and excludes addresses and secrets',async()=>{
 const stats=new Map([['t',{type:'transport',selectedCandidatePairId:'turn'}],['old',{type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'h',remoteCandidateId:'h'}],['h',{candidateType:'host',address:'SECRET'}],['turn',{type:'candidate-pair',state:'succeeded',localCandidateId:'l',remoteCandidateId:'r'}],['l',{candidateType:'relay',protocol:'udp',relayProtocol:'tls',address:'SECRET',credential:'SECRET'}],['r',{candidateType:'host',address:'SECRET'}]]);
 const pc={getStats:async()=>stats};assert.deepEqual(await W.selectedMethod(pc),{method:'turn',protocol:'tls'});stats.delete('t');stats.delete('old');stats.get('turn').nominated=true;stats.get('l').candidateType='srflx';assert.deepEqual(await W.selectedMethod(pc),{method:'stun',protocol:'udp'});stats.get('l').candidateType='host';assert.equal((await W.selectedMethod(pc)).method,'direct');assert(!JSON.stringify(await W.selectedMethod(pc)).includes('SECRET'));assert.equal((await W.selectedMethod({})).method,'unknown');
});

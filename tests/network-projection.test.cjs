'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),Projection=require('../presentation/network-projection.js');
const Stream=require('../presentation/event-stream.js');
const packs=path.resolve(__dirname,'../../playroom-paks/packs');
for(const id of fs.readdirSync(packs).filter(id=>fs.existsSync(path.join(packs,id,'rules.js')))){
 const manifest=require(path.join(packs,id,'manifest.json'));require(path.join(packs,id,'rules.js'));
 test(`compact ${id} snapshots restore events, sounds and transfers for every audience`,()=>{
  const pack=E.get(id,manifest.version),count=Math.max(pack.min,Math.min(pack.max,3));
  const session=new Session(E,id,{seed:17,players:Array.from({length:count},(_,i)=>({name:'Player '+i}))});
  const authority=new Authority(session),bindings=Array.from({length:count+1},(_,i)=>authority.connect(i-1));let fullBytes=0,wireBytes=0;const streams=bindings.map(()=>({encode:Stream.encoder(Projection.compact),decode:Stream.decoder()}));
  try{for(let step=0;step<64;step++){
   for(const binding of bindings){
    const stream=streams[bindings.indexOf(binding)],full=binding.snapshot(),wire=JSON.parse(JSON.stringify(stream.encode(binding.snapshot({wire:true})))),restored=Projection.restore(stream.decode(wire),(event,s)=>pack.presentEvent(event,s.state.players));
    assert(!Object.hasOwn(wire,'cues'));assert(!Object.hasOwn(wire,'effects'));assert(!Object.hasOwn(wire.body?.state||wire.state,'events'));
    assert.deepEqual(restored.actions,full.actions);assert.deepEqual(restored.independentActions,full.independentActions);
    assert.deepEqual(restored.events,full.events,`${id} visible events`);assert.deepEqual(restored.state,full.state,`${id} visible state`);
    assert.deepEqual(restored.cues,full.cues,`${id} sound cues`);assert.deepEqual(restored.effects,full.effects,`${id} transfers`);
    fullBytes+=Buffer.byteLength(JSON.stringify(full));wireBytes+=Buffer.byteLength(JSON.stringify(wire));
   }
   if(session.current.status!=='playing')break;
   const s=session.current,w=E.decisionWindow(s),actor=w?.participants.find(i=>!w.ready.includes(i))??s.turn;
   const action=E.botAction(s,actor);if(!action)break;session.act(actor,action);
  }
  assert(wireBytes<fullBytes,`${id} wire must shrink: ${wireBytes}/${fullBytes}`);
  console.log(JSON.stringify({pack:id,fullBytes,wireBytes,savedPercent:Math.round(100*(1-wireBytes/fullBytes))}));
  }finally{authority.dispose();}
 });
}

test('RTC always carries the compact format; client reconstructs it before rendering',async()=>{
 const W=require('../app/transports/webrtc.js'),Client=require('../app/session-client.js');
 class Channel extends EventTarget{constructor(){super();this.readyState='open';this.sent=[];}send(data){this.sent.push(require('../application/wire-codec.js').decode(data));queueMicrotask(()=>this.peer.dispatchEvent(new MessageEvent('message',{data})));}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
 const host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;
 const session=new Session(E,'uno',{seed:17,players:[{name:'Host'},{name:'Guest'}]}),authority=new Authority(session),binding=authority.connect(1),close=W.serve(host,binding),transport=W.client(guest),client=new Client(transport);
 try{await transport.ready();await client.refresh();
 const wire=host.sent.find(message=>message.kind==='response').result;
 assert.equal(wire.kind,'projection');assert.equal(wire.mode,'checkpoint');assert.equal(wire.body.eventFormat,Projection.format);assert(!Object.hasOwn(wire,'cues'));assert(!Object.hasOwn(wire.body?.state||wire.state,'events'));assert.deepEqual(client.snapshot.events,binding.snapshot().events);
 assert.equal(guest.sent.find(message=>message.kind==='hello').version,14);
 }finally{client.close();close();authority.dispose();}
});

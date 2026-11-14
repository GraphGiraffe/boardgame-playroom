/* Compact unordered points. Stroke context is reliable; repair/commit stay authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRealtimePeer=api;})(globalThis,function(){
 'use strict';
 const PROTOCOL='playroom.preview.v3',MAX_BYTES=4096,INTERVAL=1000/30,MAGIC=0x50525433,HEADER=20,transmitters=new WeakMap();
 const codec=()=>globalThis.PlayroomWireCodec||(typeof require==='function'?require('../../application/wire-codec.js'):null);
 const validPoints=points=>Array.isArray(points)&&points.length<=128&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isInteger(v)&&v>=0&&v<=65535));
 function encode(envelope){if(!validPoints(envelope?.data?.points))throw Error('PREVIEW_INVALID');const bytes=codec().encode(envelope);if(bytes.length>MAX_BYTES)throw Error('PREVIEW_LIMIT');return bytes.buffer;}
 function decode(buffer){const value=codec().decode(buffer);if(!validPoints(value?.data?.points))throw Error('PREVIEW_INVALID');return value;}
 function encodePoints(reference,data){
  if(!validPoints(data.points)||!Number.isSafeInteger(data.seq)||data.seq<1||data.seq>0xffffffff||!Number.isSafeInteger(data.from)||data.from<0||data.from>8192)throw Error('PREVIEW_INVALID');
  const buffer=new ArrayBuffer(HEADER+data.points.length*4),view=new DataView(buffer);view.setUint32(0,MAGIC);view.setUint32(4,reference);view.setUint32(8,data.seq);view.setUint32(12,data.from);view.setUint16(16,data.points.length);data.points.forEach((p,i)=>{view.setUint16(HEADER+i*4,p[0]);view.setUint16(HEADER+i*4+2,p[1]);});return buffer;
 }
 function decodePoints(buffer){
  const bytes=buffer instanceof ArrayBuffer?new Uint8Array(buffer):ArrayBuffer.isView(buffer)?new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength):null;
  if(!bytes||bytes.length<HEADER||bytes.length>MAX_BYTES)throw Error('PREVIEW_INVALID');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),reference=view.getUint32(4),seq=view.getUint32(8),from=view.getUint32(12),count=view.getUint16(16);
  if(view.getUint32(0)!==MAGIC||view.getUint16(18)!==0||!reference||!seq||from>8192||count>128||HEADER+count*4!==bytes.length)throw Error('PREVIEW_INVALID');return {reference,seq,from,points:Array.from({length:count},(_,i)=>[view.getUint16(HEADER+i*4),view.getUint16(HEADER+i*4+2)])};
 }
 function bind(peer,{scope,onPreview,clock={now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}){
  if(typeof scope!=='function'||typeof onPreview!=='function'||!peer.channel)throw Error('REALTIME_PREVIEW_PORT_REQUIRED');
  const Reliable=globalThis.PlayroomReliableChannel||(typeof require==='function'?require('../../app/transports/reliable-channel.js'):null),pipe=Reliable.bind(peer.channel),pending=new Map(),contexts=new Map(),unknown=new Map();let channel=null,timer=null,last=-Infinity,closed=false,credits=60,refill=clock.now();
  let tx=transmitters.get(peer.channel);if(!tx){tx={next:0,entries:new Map(),keys:new Map(),resent:new Map()};transmitters.set(peer.channel,tx);}
  const key=value=>JSON.stringify([value?.sessionId,value?.authorityEpoch,value?.roundId]);
  const sendControl=value=>{if(!closed&&peer.channel.readyState==='open')void pipe.send(value,{priority:'control'}).catch(()=>{});};
  const metadata=envelope=>({scope:envelope.scope,id:envelope.data.id,style:envelope.data.style,...(envelope.data.kind===undefined?{}:{kind:envelope.data.kind}),...(envelope.data.actor===undefined?{}:{actor:envelope.data.actor})});
  function validContext(c){return c&&Number.isSafeInteger(c.reference)&&c.reference>0&&c.reference<=0xffffffff&&typeof c.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(c.id)&&key(c.scope)===key(scope())&&c.style&&Object.keys(c.style).every(k=>['color','width'].includes(k))&&typeof c.style.color==='string'&&/^#[0-9a-f]{6}$/i.test(c.style.color)&&Number.isInteger(c.style.width)&&c.style.width>0&&c.style.width<=4096&&(c.kind===undefined||c.kind==='ink.append')&&(c.actor===undefined||Number.isInteger(c.actor)&&c.actor>=0&&c.actor<32);}
  function reference(envelope){
   const meta=metadata(envelope),signature=JSON.stringify(meta);let id=tx.keys.get(signature);if(id!==undefined)return id;
   if(tx.next===0xffffffff)throw Error('PREVIEW_CONTEXT_LIMIT');id=++tx.next;const value={...meta,reference:id};if(!validContext(value))throw Error('PREVIEW_CONTEXT_INVALID');tx.entries.set(id,value);tx.keys.set(signature,id);while(tx.entries.size>32){const first=tx.entries.keys().next().value,entry=tx.entries.get(first);tx.keys.delete(JSON.stringify(metadata({scope:entry.scope,data:entry})));tx.entries.delete(first);tx.resent.delete(first);}
   sendControl({kind:'realtime-preview-context',context:value});return id;
  }
  function deliver(packet){
   const c=contexts.get(packet.reference);if(!c||key(c.scope)!==key(scope()))return;const {reference:_,scope:bound,...data}=c;
   try{const result=onPreview({scope:bound,data:{...data,seq:packet.seq,from:packet.from,points:packet.points}});if(result?.catch)void result.catch(()=>{});}catch{}
  }
  const unlisten=pipe.listen(event=>{
   const value=event.value;if(closed)return;
   if(value?.kind==='realtime-preview-context'){
    const c=value.context;if(!validContext(c))return;const previous=contexts.get(c.reference);if(previous&&JSON.stringify(previous)!==JSON.stringify(c))return;contexts.set(c.reference,c);while(contexts.size>32)contexts.delete(contexts.keys().next().value);
    const held=unknown.get(c.reference);if(held){unknown.delete(c.reference);clock.clearTimeout(held.timer);deliver(held.packet);}
   }else if(value?.kind==='realtime-preview-context-needed'){
    const id=value.reference,c=tx.entries.get(id),now=clock.now();if(c&&key(c.scope)===key(scope())&&now-(tx.resent.get(id)??-Infinity)>=500){tx.resent.set(id,now);sendControl({kind:'realtime-preview-context',context:c});}
   }
  });
  const accept=event=>{
   const now=clock.now();credits=Math.min(60,credits+Math.max(0,now-refill)*.03);refill=now;if(credits<1)return;credits--;if(closed)return;let packet;try{packet=decodePoints(event.data);}catch{return;}
   if(contexts.has(packet.reference)){deliver(packet);return;}
   const held=unknown.get(packet.reference);if(held){if(packet.seq>held.packet.seq)held.packet=packet;return;}if(unknown.size>=4)return;
   unknown.set(packet.reference,{packet,timer:clock.setTimeout(()=>unknown.delete(packet.reference),1000)});sendControl({kind:'realtime-preview-context-needed',reference:packet.reference});
  };
  function attach(next){if(next?.protocol!==PROTOCOL||next===channel)return;channel?.removeEventListener('message',accept);channel=next;channel.binaryType='arraybuffer';channel.addEventListener('message',accept);channel.addEventListener('open',flush);}
  const incoming=event=>attach(event.channel);peer.pc.addEventListener('datachannel',incoming);attach(peer.previewChannel);
  function flush(){timer=null;if(closed||!pending.size)return;const delay=INTERVAL-(clock.now()-last);if(delay>0){timer=clock.setTimeout(flush,delay);return;}if(channel?.readyState!=='open'){pending.clear();return;}const [id,value]=pending.entries().next().value;pending.delete(id);last=clock.now();if(channel.bufferedAmount<=16384)try{channel.send(value);}catch{}if(pending.size)timer=clock.setTimeout(flush,INTERVAL);}
  return Object.freeze({send(envelope){if(closed||key(envelope?.scope)!==key(scope()))return false;const data=envelope?.data;if(typeof data?.id!=='string'||!validPoints(data.points))return false;let packet;try{packet=encodePoints(reference(envelope),data);}catch{return false;}if(!pending.has(data.id)&&pending.size>=4)return false;pending.set(data.id,packet);if(timer===null)flush();return true;},close(){closed=true;clock.clearTimeout(timer);pending.clear();for(const held of unknown.values())clock.clearTimeout(held.timer);unknown.clear();contexts.clear();unlisten();peer.pc.removeEventListener('datachannel',incoming);channel?.removeEventListener('message',accept);}});
 }
 return Object.freeze({bind,encode,decode,encodePoints,decodePoints,PROTOCOL,MAX_BYTES,INTERVAL});
});

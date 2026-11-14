/* One bounded reliable RTC pipe: prioritized messages, SCTP-safe chunks, backpressure. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomReliableChannel=api;})(globalThis,function(){
 'use strict';
 const Codec=globalThis.PlayroomWireCodec||(typeof require==='function'?require('../../application/wire-codec.js'):null);
 const ports=new WeakMap(),LIMIT=4*1024*1024,HIGH=256*1024,LOW=64*1024;
 const utf8=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
 const MAGIC=0x50525733,HEADER=24;
 function bind(channel,{maxMessageSize=()=>16384}={}){
  if(ports.has(channel))return ports.get(channel);
  const queues=[[],[],[]],listeners=new Set(),parts=new Map();let queued=0,assembling=0,sequence=0,closed=false,pumping=false,lastError=null;
  channel.bufferedAmountLowThreshold=LOW;channel.binaryType='arraybuffer';
  function fail(error){if(closed)return;closed=true;lastError=/^WIRE_[A-Z_]+$/.test(error?.message)?error.message:'channel-error';for(const q of queues)for(const item of q)item.reject(error);queues.forEach(q=>q.splice(0));queued=0;for(const item of parts.values())clearTimeout(item.timer);parts.clear();assembling=0;listeners.clear();channel.removeEventListener('message',receive);channel.removeEventListener('bufferedamountlow',pump);channel.removeEventListener('open',pump);}
  const stop=()=>fail(Error('WIRE_CLOSED'));
  function violation(){fail(Error('WIRE_INVALID'));try{channel.close();}catch(_){}}
  function deliver(text,value){for(const listener of [...listeners])listener({data:text,value});}
  function parse(text){const P=globalThis.PlayroomProtocol||(typeof require==='function'?require('../../core/protocol.js'):null);return P.parse(text);}
  function receive(event){
   try{
    const maximum=Math.min(16384,maxMessageSize()||16384);
    if(typeof event.data==='string')throw Error('WIRE_BINARY_REQUIRED');
    const packet=event.data instanceof ArrayBuffer?new Uint8Array(event.data):ArrayBuffer.isView(event.data)?new Uint8Array(event.data.buffer,event.data.byteOffset,event.data.byteLength):null;
    if(!packet||packet.byteLength<4||packet.byteLength>maximum)throw Error('WIRE_MESSAGE_LIMIT');
    if(new DataView(packet.buffer,packet.byteOffset,4).getUint32(0)===Codec.MAGIC){deliver(null,Codec.decode(packet));return;}
    if(packet.byteLength<=HEADER)throw Error('WIRE_CHUNK_INVALID');
    const header=new DataView(packet.buffer,packet.byteOffset,HEADER),id=header.getUint32(4),index=header.getUint16(8),count=header.getUint16(10),total=header.getUint32(12),length=header.getUint32(16);
    if(header.getUint32(0)!==MAGIC||header.getUint32(20)!==0||!id||count<2||count>8192||index>=count||total<1||total>LIMIT||length!==packet.byteLength-HEADER)throw Error('WIRE_CHUNK_INVALID');
    const data=packet.slice(HEADER);let batch=parts.get(id);
    if(!batch){if(parts.size>=4||assembling+total>2*LIMIT)throw Error('WIRE_RECEIVE_LIMIT');batch={count,bytes:total,parts:new Map(),size:0,timer:setTimeout(violation,30000)};parts.set(id,batch);assembling+=total;}
    if(batch.count!==count||batch.bytes!==total)throw Error('WIRE_CHUNK_INVALID');
    if(batch.parts.has(index)){const previous=batch.parts.get(index);if(previous.length!==data.length||previous.some((v,i)=>v!==data[i]))throw Error('WIRE_CHUNK_CONFLICT');return;}
    batch.parts.set(index,data);batch.size+=data.length;if(batch.size>batch.bytes)throw Error('WIRE_CHUNK_LIMIT');
    if(batch.parts.size===count){if(batch.size!==batch.bytes)throw Error('WIRE_CHUNK_INVALID');const bytes=new Uint8Array(batch.bytes);let offset=0;for(let i=0;i<count;i++){const part=batch.parts.get(i);bytes.set(part,offset);offset+=part.length;}clearTimeout(batch.timer);parts.delete(id);assembling-=batch.bytes;deliver(null,Codec.decode(bytes));}

   }catch(_){violation();}
  }
  function pump(){
   if(closed||pumping||channel.readyState!=='open')return;pumping=true;
   try{while((channel.bufferedAmount||0)<HIGH){
    const queue=queues.find(q=>q.length);if(!queue)break;const item=queue[0];
    const maximum=Math.min(16384,maxMessageSize()||16384);if(maximum<512)throw Error('WIRE_SCTP_LIMIT');
    let packet;
    if(item.bytes.length<=maximum)packet=item.bytes;
    else{
     if(!item.chunkSize){item.chunkSize=maximum-HEADER;item.count=Math.ceil(item.bytes.length/item.chunkSize);if(item.count>8192)throw Error('WIRE_CHUNK_LIMIT');}
     const data=item.bytes.subarray(item.index*item.chunkSize,(item.index+1)*item.chunkSize),buffer=new ArrayBuffer(HEADER+data.length),header=new DataView(buffer);
     header.setUint32(0,MAGIC);header.setUint32(4,item.id);header.setUint16(8,item.index);header.setUint16(10,item.count);header.setUint32(12,item.bytes.length);header.setUint32(16,data.length);new Uint8Array(buffer,HEADER).set(data);packet=buffer;
    }
    if((typeof packet==='string'?utf8.encode(packet).length:packet.byteLength)>maximum)throw Error('WIRE_SCTP_LIMIT');
    channel.send(packet);item.index++;
    if(!item.count||item.index===item.count){queue.shift();queued-=item.bytes.length;item.resolve();}
   }}catch(error){fail(error);try{channel.close();}catch(_){}}finally{pumping=false;}
  }
  const api=Object.freeze({
   send(value,{priority='state'}={}){
    if(closed||channel.readyState!=='open')return Promise.reject(Error('WIRE_CLOSED'));
    let bytes;try{bytes=Codec.encode(value);}catch(error){return Promise.reject(error);}
    if(!bytes.length||bytes.length>LIMIT||queued+bytes.length>LIMIT)return Promise.reject(Error('WIRE_QUEUE_LIMIT'));
    if(!['control','state','bulk'].includes(priority))return Promise.reject(Error('WIRE_PRIORITY_INVALID'));
    return new Promise((resolve,reject)=>{queued+=bytes.length;queues[['control','state','bulk'].indexOf(priority)].push({bytes,id:sequence=sequence>=0xffffffff?1:sequence+1,index:0,resolve,reject});pump();});
   },
   listen(listener){if(closed)throw Error('WIRE_CLOSED');listeners.add(listener);return()=>listeners.delete(listener);},
   metrics:()=>({queuedBytes:queued,assemblingBytes:assembling,incomplete:parts.size,closed,...(lastError?{lastError}:{})}),close:stop
  });
  ports.set(channel,api);channel.addEventListener('message',receive);channel.addEventListener('bufferedamountlow',pump);channel.addEventListener('open',pump);channel.addEventListener('close',stop,{once:true});return api;
 }
 return Object.freeze({bind,LIMIT,HIGH,LOW});
});

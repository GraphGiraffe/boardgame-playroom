/* Versioned, bounded binary JSON values and common RPC envelopes. No game schemas. */
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomWireCodec=api;})(globalThis,function(P){
 'use strict';
 const MAGIC=0x50524333,LIMIT=4*1024*1024,DEPTH=64,NODES=1000000,utf8=new TextEncoder(),utf8Read=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const methods=['dispatch','snapshot','status','history','history-range','realtime','presentation-ready'];
 const fail=()=>{throw Error('WIRE_CODEC_INVALID');},only=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));
 function pack(v){
  if(v?.kind==='request'&&only(v,['kind','requestId','method','value'])){const method=methods.indexOf(v.method);return v.value===undefined?[0,v.requestId,method<0?v.method:method]:[0,v.requestId,method<0?v.method:method,v.value];}
  if(v?.kind==='response'&&only(v,['kind','requestId','result','error','code']))return v.error?[2,v.requestId,v.error,...(v.code===undefined?[]:[v.code])]:v.result===undefined?[1,v.requestId]:[1,v.requestId,v.result];
  if(v?.kind==='snapshot'&&only(v,['kind','snapshot']))return [3,v.snapshot];
  if(v?.kind==='hello'&&only(v,['kind','version']))return [4,v.version];
  if(v?.kind==='transport-ready'&&only(v,['kind','version','error']))return [5,v.version,...(v.error===undefined?[]:[v.error])];
  return [15,v];
 }
 function unpack(v){
  if(!Array.isArray(v))fail();const tag=v[0],id=v[1],rpc=()=>{if(!Number.isSafeInteger(id)||id<1)fail();};
  if(tag===0&&(v.length===3||v.length===4)){rpc();const method=typeof v[2]==='string'?v[2]:methods[v[2]];if(typeof method!=='string')fail();return P.composeRecord({kind:'request',requestId:id,method,...(v.length===4?{value:v[3]}:{})});}
  if(tag===1&&(v.length===2||v.length===3)){rpc();return P.composeRecord({kind:'response',requestId:id,...(v.length===3?{result:v[2]}:{})});}
  if(tag===2&&(v.length===3||v.length===4)){rpc();if(typeof v[2]!=='string'||v.length===4&&typeof v[3]!=='string')fail();return P.composeRecord({kind:'response',requestId:id,error:v[2],...(v.length===4?{code:v[3]}:{})});}
  if(tag===3&&v.length===2)return P.composeRecord({kind:'snapshot',snapshot:v[1]});
  if((tag===4&&v.length===2||tag===5&&(v.length===2||v.length===3))&&Number.isSafeInteger(id))return P.composeRecord({kind:tag===4?'hello':'transport-ready',version:id,...(v.length===3?{error:v[2]}:{})});
  if(tag===15&&v.length===2)return v[1];fail();
 }
 function encode(value){
  if(value===undefined||typeof value==='function'||typeof value==='symbol')fail();
  let buffer=new Uint8Array(1024),offset=4,nodes=0;new DataView(buffer.buffer).setUint32(0,MAGIC);const ancestors=new Set();
  const reserve=n=>{if(offset+n>LIMIT)throw Error('WIRE_CODEC_LIMIT');if(offset+n>buffer.length){const next=new Uint8Array(Math.min(LIMIT,Math.max(offset+n,buffer.length*2)));next.set(buffer);buffer=next;}};
  const byte=n=>{reserve(1);buffer[offset++]=n;};
  const number=n=>{while(n>=128){byte(n%128+128);n=Math.floor(n/128);}byte(n);};
  const raw=bytes=>{reserve(bytes.length);buffer.set(bytes,offset);offset+=bytes.length;};
  const write=(v,depth,key='')=>{
   if(++nodes>NODES||depth>DEPTH)throw Error('WIRE_CODEC_LIMIT');if(v&&typeof v.toJSON==='function')v=v.toJSON(key);
   if(v===null||v===undefined||typeof v==='function'||typeof v==='symbol'){byte(0);return;}
   if(v===false||v===true){byte(v?2:1);return;}
   if(typeof v==='number'){if(!Number.isFinite(v)){byte(0);return;}if(Number.isSafeInteger(v)){byte(v>=0?3:4);number(v>=0?v:-v-1);}else{byte(5);reserve(8);new DataView(buffer.buffer).setFloat64(offset,v);offset+=8;}return;}
   if(typeof v==='string'){
    const hash=/^sha256:[0-9a-f]{64}$/.test(v),uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(v);
    if(hash||uuid){byte(hash?9:10);const hex=hash?v.slice(7):v.replaceAll('-','');for(let i=0;i<hex.length;i+=2)byte(parseInt(hex.slice(i,i+2),16));return;}
    let well=true;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=v.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff)i++;else well=false;}else if(c>=0xdc00&&c<=0xdfff)well=false;}
    if(!well){byte(11);number(v.length);for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);byte(c>>>8);byte(c&255);}return;}
    const bytes=utf8.encode(v);byte(6);number(bytes.length);raw(bytes);return;
   }
   if(typeof v!=='object'||ancestors.has(v))fail();ancestors.add(v);
   if(Array.isArray(v)){byte(7);number(v.length);for(let i=0;i<v.length;i++)write(v[i],depth+1,String(i));}
   else{const entries=Object.entries(v).filter(([,x])=>x!==undefined&&typeof x!=='function'&&typeof x!=='symbol');byte(8);number(entries.length);for(const [k,x]of entries){write(k,depth+1);write(x,depth+1,k);}}
   ancestors.delete(v);
  };
  write(pack(value),0);return buffer.slice(0,offset);
 }
 function decode(input){
  const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
  if(!bytes||bytes.length<5||bytes.length>LIMIT)fail();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(0)!==MAGIC)fail();let offset=4,nodes=0;
  const byte=()=>{if(offset>=bytes.length)fail();return bytes[offset++];};
  const number=()=>{let value=0,multiple=1;for(let i=0;i<8;i++){const b=byte();value+=(b%128)*multiple;if(!Number.isSafeInteger(value))fail();if(b<128)return value;multiple*=128;}fail();};
  const take=n=>{if(!Number.isSafeInteger(n)||n<0||offset+n>bytes.length)fail();const out=bytes.subarray(offset,offset+n);offset+=n;return out;};
  const read=depth=>{
   if(++nodes>NODES||depth>DEPTH)throw Error('WIRE_CODEC_LIMIT');const tag=byte();if(tag===0)return null;if(tag===1)return false;if(tag===2)return true;
   if(tag===3||tag===4){const n=number(),value=tag===3?n:-n-1;if(!Number.isSafeInteger(value))fail();return value;}
   if(tag===5){take(8);const n=view.getFloat64(offset-8);if(!Number.isFinite(n))fail();return n;}
   if(tag===6)return utf8Read.decode(take(number()));
   if(tag===11){const length=number(),data=take(length*2),parts=[];let piece='';for(let i=0;i<length;i++){piece+=String.fromCharCode(data[i*2]*256+data[i*2+1]);if(piece.length===4096){parts.push(piece);piece='';}}parts.push(piece);return parts.join('');}
   if(tag===9||tag===10){const hex=Array.from(take(tag===9?32:16),b=>b.toString(16).padStart(2,'0')).join('');return tag===9?'sha256:'+hex:hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
   if(tag===7||tag===8){const length=number();if(length>NODES||length*(tag===8?2:1)>bytes.length-offset)fail();if(tag===7){const out=[];for(let i=0;i<length;i++)out.push(read(depth+1));return P.composeArray(out);}const out={};for(let i=0;i<length;i++){const key=read(depth+1);if(typeof key!=='string'||Object.hasOwn(out,key))fail();Object.defineProperty(out,key,{value:read(depth+1),enumerable:true});}return P.composeRecord(out);}
   fail();
  };
  const value=read(0);if(offset!==bytes.length)fail();return unpack(value);
 }
 return Object.freeze({encode,decode,MAGIC,LIMIT,pack,unpack});
});

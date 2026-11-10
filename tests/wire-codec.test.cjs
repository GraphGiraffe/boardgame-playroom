'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Codec=require('../application/wire-codec.js');
const uuid='01234567-89ab-4cde-8fab-0123456789ab',hash='sha256:'+'0123456789abcdef'.repeat(4);
test('binary values preserve exact IDs, SHA-256 bits, Unicode and inert object keys',()=>{
 const value=JSON.parse('{"__proto__":{"safe":true},"text":"Линия 😀","values":[null,false,true,0,-1,9007199254740991,-9007199254740991,0.25],"constructor":"inert"}');value.uuid=uuid;value.hash=hash;value.unicode=['\uFEFFprefix','\ud800','\udfff','a\ud800b'];
 const bytes=Codec.encode(value);assert.deepEqual(Codec.decode(bytes),value);assert.equal({}.safe,undefined);assert.deepEqual(Codec.decode(bytes.buffer),value);assert(bytes.length<Buffer.byteLength(JSON.stringify(value)));
 const changed=Codec.encode({...value,hash:'sha256:'+'f'.repeat(64)});assert.notDeepEqual(bytes,changed);assert.equal(Codec.decode(changed).hash,'sha256:'+'f'.repeat(64));
});
test('one RPC envelope codec preserves requests, receipts, failures, state and custom SDK messages',()=>{
 const messages=[...['dispatch','snapshot','status','history','history-range','realtime','presentation-ready','unknown-method'].map(method=>({kind:'request',requestId:4,method,value:[0,1,uuid,42,{type:'play',card:'u102',color:'red'}]})),{kind:'request',requestId:1,method:'snapshot'},{kind:'response',requestId:1,result:{ok:true,code:'OK',commandId:uuid,revision:43}},{kind:'response',requestId:2,error:'Ошибка',code:'COMMAND_CONTEXT_EXPIRED'},{kind:'response',requestId:3},{kind:'snapshot',snapshot:{kind:'projection',hash,baseHash:hash,body:[]}},{kind:'hello',version:14},{kind:'transport-ready',version:14,error:'VERSION_MISMATCH'},{kind:'realtime-event',envelope:{data:{points:[[1,2],[3,4]]}}}];
 for(const message of messages)assert.deepEqual(Codec.decode(Codec.encode(message)),message);
 assert(Codec.encode(messages[0]).length<Buffer.byteLength(JSON.stringify(messages[0]))*.65);assert(Codec.encode(messages[10]).length<Buffer.byteLength(JSON.stringify(messages[10]))*.65);
});
test('malformed, truncated, trailing, oversized and cyclic binary data fail within bounds',()=>{
 const valid=Codec.encode({kind:'hello',version:14});for(let end=0;end<valid.length;end++)assert.throws(()=>Codec.decode(valid.subarray(0,end)));const trailing=new Uint8Array(valid.length+1);trailing.set(valid);assert.throws(()=>Codec.decode(trailing));const corrupt=valid.slice();corrupt[0]=0;assert.throws(()=>Codec.decode(corrupt));assert.throws(()=>Codec.decode('{}'));assert.throws(()=>Codec.encode({text:'x'.repeat(Codec.LIMIT)}),/LIMIT/);
 const cycle={};cycle.self=cycle;assert.throws(()=>Codec.encode(cycle));let deep={};for(let i=0;i<70;i++)deep={deep};assert.throws(()=>Codec.encode(deep),/LIMIT/);assert.throws(()=>Codec.decode(Uint8Array.from([80,82,67,51,255])));
 const sparse=[undefined,,NaN];assert.deepEqual(Codec.decode(Codec.encode({drop:undefined,sparse})),{sparse:[null,null,null]});
});

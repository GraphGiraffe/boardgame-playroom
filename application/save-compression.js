/* Bounded portable-file compression. Browser-native, no downloaded dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSaveCompression=api;})(globalThis,function(){
 'use strict';
 const encoding='gzip-base64-v1',fail=code=>{throw Object.assign(Error(code),{code});};
 async function stream(bytes,compress,maxBytes){
  const Type=compress?globalThis.CompressionStream:globalThis.DecompressionStream;
  if(!Type)fail('SAVE_FORMAT');
  const reader=new Blob([bytes]).stream().pipeThrough(new Type('gzip')).getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)fail('SAVE_TOO_LARGE');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});if(error.code==='SAVE_TOO_LARGE')throw error;fail('SAVE_INVALID');}
  finally{reader.releaseLock();}
  const result=new Uint8Array(size);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
 }
 async function encode(text,maxBytes){
  if(!globalThis.CompressionStream)return null;
  const bytes=await stream(new TextEncoder().encode(text),true,maxBytes);let binary='';
  for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));
  return btoa(binary);
 }
 async function decode(data,maxBytes){
  if(typeof data!=='string'||data.length>maxBytes||data.length%4||!(/^[A-Za-z0-9+/]*={0,2}$/).test(data))fail('SAVE_INVALID');
  let binary;try{binary=atob(data);}catch{fail('SAVE_INVALID');}
  const bytes=await stream(Uint8Array.from(binary,c=>c.charCodeAt(0)),false,maxBytes);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('SAVE_INVALID');}
 }
 return Object.freeze({encoding,encode,decode});
});

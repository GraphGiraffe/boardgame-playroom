/* Compress the durable pack snapshot; the manager still owns its exact logical format. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../../application/save-compression.js'):root.PlayroomSaveCompression);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPackStorage=api;})(globalThis,function(compression){
 'use strict';
 const FORMAT='playroom-pack-storage',LIMIT=48*1024*1024,bytes=value=>new TextEncoder().encode(value).byteLength;
 async function create({data,key,codec=compression}){
  let logical=data.getItem(key);
  try{const value=JSON.parse(logical);if(value?.format===FORMAT){if(value.version!==1||value.encoding!==codec?.encoding)throw Error('PACK_STORAGE_FORMAT');logical=await codec.decode(value.data,LIMIT);}}
  catch(_){/* Retain invalid original bytes for the manager's existing quarantine/export path. */}
  return {
   get:()=>logical,
   async commit(value,{guard=()=>{}}={}){
    guard();let physical=value;
    if(value!==null&&bytes(value)>512&&bytes(value)<=LIMIT&&codec){
     let encoded;try{encoded=await codec.encode(value,LIMIT);}catch(error){if(error.code!=='SAVE_TOO_LARGE')throw error;}
     if(encoded){const wrapped=JSON.stringify({format:FORMAT,version:1,encoding:codec.encoding,data:encoded});if(bytes(wrapped)<bytes(value))physical=wrapped;}
    }
    guard();await data.transact(()=>{guard();return physical===null?data.removeItem(key):data.setItem(key,physical);},{guard});logical=value;
   }
  };
 }
 return Object.freeze({create});
});

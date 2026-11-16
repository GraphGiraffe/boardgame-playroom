'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// Local author history keeps every checkpoint without retaining every scene in
// memory. Private authority data stays in a 0700 temporary directory and is
// removed when the studio closes. This is not an exported save format.
class FrameHistory{
 constructor(){this.entries=[];this.bytes=0;this.cache=new Map();this.directory=null;this.fd=null;}
 get length(){return this.entries.length;}
 push(encoded){
  if(this.fd===null){this.directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-sdk-history-'));fs.chmodSync(this.directory,0o700);this.fd=fs.openSync(path.join(this.directory,'frames'),'wx+',0o600);}
  const bytes=Buffer.from(encoded),offset=this.bytes;
  try{let done=0;while(done<bytes.length){const count=fs.writeSync(this.fd,bytes,done,bytes.length-done,offset+done);if(count===0)throw Error('History write interrupted');done+=count;}}
  catch(error){fs.ftruncateSync(this.fd,offset);throw error;}
  this.entries.push({offset,bytes:bytes.length});this.bytes+=bytes.length;
 }
 get(index){
  const entry=this.entries[index];if(!entry)return undefined;
  if(this.cache.has(index)){const text=this.cache.get(index);this.cache.delete(index);this.cache.set(index,text);return JSON.parse(text);}
  const buffer=Buffer.alloc(entry.bytes);let done=0;
  while(done<buffer.length){const count=fs.readSync(this.fd,buffer,done,buffer.length-done,entry.offset+done);if(count===0)throw Error('History read interrupted');done+=count;}
  const text=buffer.toString('utf8');this.cache.set(index,text);if(this.cache.size>8)this.cache.delete(this.cache.keys().next().value);return JSON.parse(text);
 }
 close(){if(this.fd!==null){fs.closeSync(this.fd);this.fd=null;}if(this.directory){fs.rmSync(this.directory,{recursive:true,force:true});this.directory=null;}this.entries=[];this.cache.clear();this.bytes=0;}
}
module.exports={FrameHistory};

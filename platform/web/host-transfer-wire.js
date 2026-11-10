/* Private, bounded RTC RPC; the caller binds a wire to one authenticated peer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHostTransferWire=api;})(globalThis,function(){
 'use strict';const Reliable=globalThis.PlayroomReliableChannel||(typeof require==='function'?require('../../app/transports/reliable-channel.js'):null);const wires=new WeakMap(),LIMIT=32*1024*1024,CHUNK=8000;
 class Wire{
  constructor(channel,handler){this.channel=channel;this.handler=handler;this.pending=new Map();this.parts=new Map();this.closed=false;this.onMessage=e=>{void this.receive(e).catch(()=>{});};this.pipe=Reliable.bind(channel);this.unlisten=this.pipe.listen(this.onMessage);channel.addEventListener('close',()=>this.close(),{once:true});}
  async send(id,value){const json=JSON.stringify(value);if(json.length>LIMIT)throw Error('HOST_TRANSFER_TOO_LARGE');const count=Math.ceil(json.length/CHUNK);for(let index=0;index<count;index++){
   if(this.closed||this.channel.readyState!=='open')throw Error('HOST_TRANSFER_DISCONNECTED');
   await this.pipe.send({kind:'host-transfer-v1',id,index,count,text:json.slice(index*CHUNK,(index+1)*CHUNK)},{priority:'bulk'});
  }}
  async receive(event){let p;try{p=event.value??JSON.parse(event.data);}catch{return;}
   if(p?.kind!=='host-transfer-v1'||typeof p.id!=='string'||!/^[-a-zA-Z0-9:]{1,100}$/.test(p.id)||!Number.isInteger(p.index)||!Number.isInteger(p.count)||p.count<1||p.count>Math.ceil(LIMIT/CHUNK)||p.index<0||p.index>=p.count||typeof p.text!=='string'||p.text.length>CHUNK)return;
   let batch=this.parts.get(p.id);if(!batch){if(this.parts.size>=4)return;batch={parts:[],count:p.count,size:0,timer:setTimeout(()=>this.clear(p.id),60000)};this.parts.set(p.id,batch);}
   if(batch.count!==p.count||batch.parts[p.index]!==undefined)return;batch.parts[p.index]=p.text;batch.size+=p.text.length;if(batch.size>LIMIT){this.clear(p.id);return;}
   if(batch.parts.filter(x=>x!==undefined).length!==p.count)return;
   const value=JSON.parse(batch.parts.join(''));this.clear(p.id);
   if(value.reply){const item=this.pending.get(p.id);if(!item)return;clearTimeout(item.timer);this.pending.delete(p.id);value.error?item.reject(Error(value.error)):item.resolve(value.value);return;}
   try{const result=await this.handler(value.method,value.data);await this.send(p.id,{reply:true,value:result});}
   catch{await this.send(p.id,{reply:true,error:'HOST_TRANSFER_FAILED'});}
  }
  clear(id){const batch=this.parts.get(id);if(batch)clearTimeout(batch.timer);this.parts.delete(id);}
  request(method,data,timeout=60000){const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('HOST_TRANSFER_TIMEOUT'));},timeout);this.pending.set(id,{resolve,reject,timer});void this.send(id,{method,data}).catch(error=>{clearTimeout(timer);this.pending.delete(id);reject(error);});});}
  close(){if(this.closed)return;this.closed=true;this.unlisten?.();for(const id of this.parts.keys())this.clear(id);for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(Error('HOST_TRANSFER_DISCONNECTED'));}this.pending.clear();}
 }
 function bind(channel,handler){let wire=wires.get(channel);if(!wire||wire.closed){wire=new Wire(channel,handler);wires.set(channel,wire);}else wire.handler=handler;return wire;}
 return Object.freeze({bind});
});

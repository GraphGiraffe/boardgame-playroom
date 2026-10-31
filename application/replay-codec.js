/* Lossless event interning for projected histories; never adds authority data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomReplayCodec=api;})(globalThis,function(){
 'use strict';
 const encoding='event-pool-v1',copy=value=>JSON.parse(JSON.stringify(value));
 const fail=()=>{throw Error('SAVE_REPLAY');};
 function writer(pool=[]){
  const events=pool.slice(),index=new Map(events.map((event,i)=>[JSON.stringify(event),i]));
  function refs(items){if(!Array.isArray(items))fail();return items.map(event=>{const key=JSON.stringify(event);if(!index.has(key)){index.set(key,events.length);events.push(copy(event));}return index.get(key);});}
  function frame(value){
   const {events:journal=[],state,...rest}=value,out={...rest,encoding,state:{...state},events:refs(journal)};
   if(Object.hasOwn(out.state,'events'))out.state.events=refs(out.state.events);
   return out;
  }
  return {events,frame};
 }
 function reader(pool){
  if(!Array.isArray(pool)||pool.length>100000)fail();
  function refs(items){if(!Array.isArray(items)||items.length>100000)fail();return items.map(i=>{if(!Number.isSafeInteger(i)||i<0||i>=pool.length)fail();return pool[i];});}
  return value=>{
   if(!value||typeof value!=='object'||value.encoding!==encoding)fail();
   const {encoding:_,state,events,...rest}=value,out={...rest,state:{...state},events:refs(events)};
   if(Object.hasOwn(out.state,'events'))out.state.events=refs(out.state.events);
   return out;
  };
 }
 function encode(value){
  const w=writer();let bytes=0;
  const frames=value.frames.map(frame=>{bytes+=new TextEncoder().encode(JSON.stringify(frame)).length;if(bytes>48*1024*1024)fail();return w.frame(frame);});
  return {...value,encoding,eventPool:w.events,frames};
 }
 function decode(value,{maxBytes=48*1024*1024}={}){
  if(value.encoding!==encoding||!Array.isArray(value.frames)||value.frames.length>100000)fail();
  const read=reader(value.eventPool);let bytes=0;
  const frames=value.frames.map(frame=>{const decoded=read(frame);bytes+=new TextEncoder().encode(JSON.stringify(decoded)).length;if(bytes>maxBytes)fail();return decoded;});
  const {encoding:_,eventPool,...rest}=value;return {...rest,frames};
 }
 return Object.freeze({encoding,writer,reader,encode,decode});
});

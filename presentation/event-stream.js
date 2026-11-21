/* Per-connection authorized event cursors. Historical replies never move live cursors. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomEventStream=api;})(globalThis,function(){
 'use strict';
 const scope=s=>JSON.stringify([s.sessionId,s.authorityEpoch,s.game,s.packVersion,s.viewer,s.role]);
 const isFrame=s=>s&&['snapshot','history'].includes(s.kind)&&s.state;
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const plain=e=>{const {scene,...fact}=e;return fact;};
 // Authority journals and validated receiver journals are in increasing ID
 // order. Gaps are normal when an event belongs to a different audience.
 function after(events,id){
  let start=0,end=events.length;
  while(start<end){
   const middle=Math.floor((start+end)/2);
   if(events[middle].id<=id)start=middle+1;
   else end=middle;
  }
  return start;
 }
 function encoder(compact){let key=null,cursor=0;
  return (value,{checkpoint=false}={})=>{
   if(!isFrame(value))return compact(value);
   const events=value.events||[],next=events.at(-1)?.id||0,k=scope(value),live=value.kind==='snapshot';
   const reset=checkpoint||!live||key!==k||next<cursor,base=reset?null:cursor;
   // Compact only the facts that will travel on this connection. A
   // historical response or repair still sends the full authorized journal.
   const delta=base===null?value:{...value,events:next===base?[]:events.slice(after(events,base))};
   const encoded=compact(delta);
   const out={...encoded,eventBase:base,eventCursor:next,events:encoded.events||[]};
   if(live){key=k;cursor=next;}return out;
  };
 }
 function decoder(){const P=globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);let key=null,cursor=0,events=[],sceneSlots=[];
  return value=>{
   if(!isFrame(value))return value;
   const {eventBase,eventCursor,...s}=value,k=scope(s),incoming=s.events||[],live=s.kind==='snapshot';
   if(!integer(eventCursor)||eventBase!==null&&!integer(eventBase)||!Array.isArray(incoming))throw Error('EVENT_STREAM_INVALID');
   const addedScenes=[];
   let previous=eventBase??0;
   for(let index=0;index<incoming.length;index++){
    const event=incoming[index],id=event?.id;
    if(!integer(id)||id<=previous||id>eventCursor)throw Error('EVENT_STREAM_INVALID');
    previous=id;
    if(event.scene)addedScenes.push(index);
   }
   if(incoming.length&&incoming.at(-1).id!==eventCursor)throw Error('EVENT_STREAM_INVALID');
   let merged,count=0;
   if(eventBase===null){merged=incoming;}
   else{
    if(!live||key!==k||eventBase>cursor||eventCursor>cursor&&eventBase!==cursor)throw Error('EVENT_STREAM_GAP');
    count=eventBase===cursor&&eventCursor>=cursor?events.length:after(events,Math.min(eventBase,eventCursor));
    const prefix=count===events.length?events:events.slice(0,count);
    merged=incoming.length?prefix.concat(incoming):prefix;
    if((merged.at(-1)?.id||0)!==eventCursor)throw Error('EVENT_STREAM_GAP');
   }
   // Previous slots belong only to the retained prefix of this audience's
   // live journal. A historical reply gets its own slots and never updates it.
   const nextSlots=[];
   const keepCurrentScene=index=>{
    const event=merged[index];
    if(event.revision===s.revision){nextSlots.push(index);return;}
    if(merged===events||merged===incoming)merged=merged.slice();
    merged[index]=P.composeRecord(plain(event));
   };
   for(const index of sceneSlots){
    if(index>=count)break;
    keepCurrentScene(index);
   }
   for(const index of addedScenes)keepCurrentScene(count+index);
   const result=P.composeRecord({...s,events:merged===events?events:P.composeArray(merged)});
   if(live&&(key!==k||eventCursor>=cursor)){key=k;cursor=eventCursor;events=result.events;sceneSlots=nextSlots;}
   return result;
  };
 }
 return Object.freeze({encoder,decoder});
});

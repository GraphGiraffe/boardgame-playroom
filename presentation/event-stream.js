/* Per-connection authorized event cursors. Historical replies never move live cursors. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomEventStream=api;})(globalThis,function(){
 'use strict';
 const scope=s=>JSON.stringify([s.sessionId,s.authorityEpoch,s.game,s.packVersion,s.viewer,s.role]);
 const isFrame=s=>s&&['snapshot','history'].includes(s.kind)&&s.state;
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const plain=e=>{const {scene,...fact}=e;return fact;};
 function encoder(compact){let key=null,cursor=0;
  return (value,{checkpoint=false}={})=>{
   const s=compact(value);if(!isFrame(s))return s;
   const events=s.events||[],next=events.at(-1)?.id||0,k=scope(s),live=s.kind==='snapshot';
   const reset=checkpoint||!live||key!==k||next<cursor,base=reset?null:cursor;
   const out={...s,eventBase:base,eventCursor:next,events:base===null?events:events.filter(e=>e.id>base)};
   if(live){key=k;cursor=next;}return out;
  };
 }
 function decoder(){const P=globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);let key=null,cursor=0,events=[];
  return value=>{
   if(!isFrame(value))return value;
   const {eventBase,eventCursor,...s}=value,k=scope(s),incoming=s.events||[],live=s.kind==='snapshot';
   if(!integer(eventCursor)||eventBase!==null&&!integer(eventBase)||!Array.isArray(incoming))throw Error('EVENT_STREAM_INVALID');
   let previous=eventBase??0;for(const e of incoming){if(!integer(e?.id)||e.id<=previous||e.id>eventCursor)throw Error('EVENT_STREAM_INVALID');previous=e.id;}
   if(incoming.length&&incoming.at(-1).id!==eventCursor)throw Error('EVENT_STREAM_INVALID');
   let merged;
   if(eventBase===null){merged=incoming;}
   else{
    if(!live||key!==k||eventBase>cursor||eventCursor>cursor&&eventBase!==cursor)throw Error('EVENT_STREAM_GAP');
    const prefix=events.filter(e=>e.id<=eventBase&&e.id<=eventCursor);
    merged=[...prefix,...incoming];
    if((merged.at(-1)?.id||0)!==eventCursor)throw Error('EVENT_STREAM_GAP');
   }
   const result=P.composeRecord({...s,events:P.composeArray(merged.map(e=>e.scene&&e.revision!==s.revision?P.composeRecord(plain(e)):e))});
   if(live&&(key!==k||eventCursor>=cursor)){key=k;cursor=eventCursor;events=result.events;}
   return result;
  };
 }
 return Object.freeze({encoder,decoder});
});

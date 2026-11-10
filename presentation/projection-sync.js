/* Authorized projection checkpoints/patches. No authority state or RNG enters here. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomProjectionSync=api;})(globalThis,function(){
 'use strict';
 const P=()=>globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);
 const frame=s=>s&&['snapshot','history'].includes(s.kind)&&s.state;
 const scope=s=>JSON.stringify([s.sessionId,s.authorityEpoch,s.game,s.packVersion,s.viewer,s.role]);
 const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
 const hash=value=>P().fingerprint(typeof value==='string'?value:P().canonical(value));
 const zero='sha256:'+ '0'.repeat(64),signature=v=>typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.test(v);
 // Display strings do not define the synchronized position.
 function semantic(body){const result=body.state?.result;if(!result)return body;const {label,detailLabel,metrics,...rest}=result;return {...body,state:{...body.state,result:{...rest,...(metrics?{metrics:metrics.map(({label,...metric})=>metric)}:{})}}};}
 const fact=e=>{const {scene,text,message,...rest}=e;return rest;};
 async function eventHash(events,base=zero){let value=base;for(const e of events)value=await hash(value+'\n'+P().canonical(fact(e)));return value;}
 function diff(a,b,path=[],ops=[]){
  if(a===b||P().canonical(a)===P().canonical(b))return ops;
  if(Array.isArray(a)&&Array.isArray(b)){
   if(a.length===b.length){for(let i=0;i<b.length;i++)diff(a[i],b[i],[...path,i],ops);}
   else{let start=0,end=0;while(start<Math.min(a.length,b.length)&&P().canonical(a[start])===P().canonical(b[start]))start++;while(end<Math.min(a.length,b.length)-start&&P().canonical(a[a.length-1-end])===P().canonical(b[b.length-1-end]))end++;ops.push({op:'splice',path,index:start,deleteCount:a.length-start-end,values:b.slice(start,b.length-end)});}
  }else if(record(a)&&record(b)){
   for(const key of Object.keys(a))if(!Object.hasOwn(b,key))ops.push({op:'remove',path:[...path,key]});
   for(const key of Object.keys(b))if(!Object.hasOwn(a,key))ops.push({op:'set',path:[...path,key],value:b[key]});else diff(a[key],b[key],[...path,key],ops);
  }else ops.push({op:'set',path,value:b});
  return ops;
 }
   function apply(value,ops){
   if(!Array.isArray(ops)||ops.length>4096)throw Error('PROJECTION_PATCH_INVALID');
   let out=value;
   for(const operation of ops){
    if(!operation||!['set','remove','splice'].includes(operation.op)||!Array.isArray(operation.path)||operation.path.length>64||operation.path.some(k=>typeof k!=='string'&&(!Number.isSafeInteger(k)||k<0)||typeof k==='string'&&k.length>256)||operation.op==='set'&&!Object.hasOwn(operation,'value'))throw Error('PROJECTION_PATCH_INVALID');
    const visit=(node,index)=>{
     if(index===operation.path.length){
      if(operation.op==='set')return operation.value;
      if(operation.op!=='splice'||!Array.isArray(node)||!Number.isSafeInteger(operation.index)||operation.index<0||operation.index>node.length||!Number.isSafeInteger(operation.deleteCount)||operation.deleteCount<0||operation.deleteCount>node.length-operation.index||!Array.isArray(operation.values)||operation.values.length>65536||node.length-operation.deleteCount+operation.values.length>65536)throw Error('PROJECTION_PATCH_INVALID');
      return P().composeArray([...node.slice(0,operation.index),...operation.values,...node.slice(operation.index+operation.deleteCount)]);
     }
     const array=Array.isArray(node),key=operation.path[index];
     if(!record(node)&&!array||array&&(typeof key!=='number'||key>=node.length)||!array&&typeof key!=='string')throw Error('PROJECTION_PATCH_INVALID');
     const next=array?[...node]:{...node};
     if(index===operation.path.length-1&&operation.op==='remove'){if(array||!Object.hasOwn(node,key))throw Error('PROJECTION_PATCH_INVALID');delete next[key];}
     else{if(index<operation.path.length-1&&!Object.hasOwn(node,key))throw Error('PROJECTION_PATCH_INVALID');Object.defineProperty(next,key,{value:visit(node[key],index+1),enumerable:true,configurable:true,writable:true});}
     return array?P().composeArray(next):P().composeRecord(next);
    };
    out=visit(out,0);
   }
   return out;
  }
 function packOps(operations){
  let previous=[];
  return operations.map(op=>{let keep=0;while(keep<Math.min(previous.length,op.path.length)&&previous[keep]===op.path[keep])keep++;const tail=op.path.slice(keep);previous=op.path;return op.op==='set'?[0,keep,tail,op.value]:op.op==='remove'?[1,keep,tail]:[2,keep,tail,op.index,op.deleteCount,op.values];});
 }
 function unpackOps(operations){
  if(!Array.isArray(operations)||operations.length>4096)throw Error('PROJECTION_PATCH_INVALID');let previous=[];
  return operations.map(op=>{
   if(!Array.isArray(op)||![0,1,2].includes(op[0])||op.length!==[4,3,6][op[0]]||!Number.isSafeInteger(op[1])||op[1]<0||op[1]>previous.length||!Array.isArray(op[2])||op[1]+op[2].length>64)throw Error('PROJECTION_PATCH_INVALID');
   const path=previous.slice(0,op[1]).concat(op[2]);previous=path;
   return op[0]===0?{op:'set',path,value:op[3]}:op[0]===1?{op:'remove',path}:{op:'splice',path,index:op[3],deleteCount:op[4],values:op[5]};
  });
 }
 function sequential(work){let pending=Promise.resolve();return (...args)=>{const next=pending.then(()=>work(...args));pending=next.catch(()=>{});return next;};}
 function encoder(){let live=null;
  const encode=sequential(async value=>{
   if(!frame(value))return value;
   const {events,eventBase,eventCursor,...body}=value,key=scope(body),isLive=body.kind==='snapshot';
   const previous=isLive&&live?.key===key?live:null;
   if(eventBase!==null&&(!previous||previous.cursor!==eventBase))throw Error('PROJECTION_EVENT_BASE');
   const chain=await eventHash(events,eventBase===null?zero:previous.eventsHash),digest=await hash({position:semantic(body),eventsHash:chain,eventCursor});
   const changes=previous&&eventBase!==null?diff(previous.body,body):null;
   const packed=changes&&changes.length<=4096?packOps(changes):null,patch=packed&&bytes(packed)<bytes(body),out={kind:'projection',format:3,mode:patch?'patch':'checkpoint',...(!patch?{scope:key}:{}),baseHash:patch?previous.hash:null,hash:digest,eventBase,eventCursor,events,body:patch?packed:body};
   if(isLive)live={key,body:P().immutable(body),hash:digest,eventsHash:chain,cursor:eventCursor};return out;
  });
  encode.status=header=>live&&P().sameStatus(header,P().status(live.body))?{...header,projectionHash:live.hash}:header;
  return encode;
 }
 function decoder(){let live=null;
  return sequential(async value=>{
   if(value?.kind!=='projection')return value;
   if(value.format!==3||!['patch','checkpoint'].includes(value.mode)||!signature(value.hash)||value.mode==='checkpoint'&&typeof value.scope!=='string'||!Array.isArray(value.events)||!Number.isSafeInteger(value.eventCursor)||value.eventCursor<0)throw Error('PROJECTION_SYNC_INVALID');
   const key=value.mode==='patch'?live?.key:value.scope,previous=live?.key===key?live:null;
   if(previous?.hash===value.hash)return P().composeRecord({...previous.body,eventBase:null,eventCursor:previous.cursor,events:previous.events,projectionHash:previous.hash});
   let body;
   if(value.mode==='patch'){
    if(!previous||value.baseHash!==previous.hash)throw Error('PROJECTION_SYNC_GAP');body=apply(previous.body,unpackOps(value.body));
   }else{if(value.baseHash!==null||!record(value.body))throw Error('PROJECTION_SYNC_INVALID');body=value.body;}
   if(!frame(body)||scope(body)!==key)throw Error('PROJECTION_SCOPE_INVALID');
   if(value.eventBase!==null&&(!previous||previous.cursor!==value.eventBase))throw Error('PROJECTION_EVENT_GAP');
   const chain=await eventHash(value.events,value.eventBase===null?zero:previous.eventsHash);
   if(await hash({position:semantic(body),eventsHash:chain,eventCursor:value.eventCursor})!==value.hash)throw Error('PROJECTION_HASH_MISMATCH');
   const events=value.eventBase===null?value.events:[...previous.events,...value.events];
   if(body.kind==='snapshot'&&(!previous||body.revision>=previous.body.revision))live={key,body:P().immutable(body),hash:value.hash,eventsHash:chain,cursor:value.eventCursor,events:P().composeArray(events)};
   return P().composeRecord({...body,eventBase:value.eventBase,eventCursor:value.eventCursor,events:value.events,projectionHash:value.hash});
  });
 }
 return Object.freeze({encoder,decoder,diff,apply,packOps,unpackOps});
});

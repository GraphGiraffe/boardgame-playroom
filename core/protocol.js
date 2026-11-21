(function(root,factory){
  const Values=root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null);
  const api=factory(Values);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomProtocol=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Values){
  'use strict';
  const version=3, record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const clone=x=>JSON.parse(JSON.stringify(x));
  async function fingerprint(signature){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));return 'sha256:'+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  // The protocol and model runtime both own validated immutable JSON.
  // Model ownership proves safe sharing here, never a viewer's permissions.
  const ownedValues=new WeakSet(),projectionModels=new WeakMap(),draftSources=new WeakMap();
  const ownsImmutable=value=>ownedValues.has(value)||Values?.ownsSnapshot(value)===true;
  function immutable(value){
    if(value===undefined)return undefined; // Optional wire replies may omit a result.
    if(ownsImmutable(value))return value;
    return own(clone(value));
  }
  function own(value){if(value&&typeof value==='object'&&!ownedValues.has(value)){Object.values(value).forEach(own);Object.freeze(value);ownedValues.add(value);}return value;}
  function withProjection(value,model){const frame=immutable(value);projectionModels.set(frame,immutable(model));return frame;}
  const projectedModel=value=>projectionModels.get(value);
  function withDraft(value,base){const frame=immutable(value),source=immutable(base);if(!sameAudience(frame,source)||['sessionId','authorityEpoch','game','packVersion','revision'].some(key=>frame[key]!==source[key]))throw Error('DRAFT_SCOPE_INVALID');draftSources.set(frame,source);return frame;}
  const authoritativeFrame=value=>draftSources.get(value)||value;
  function parse(text){if(typeof text!=='string')throw Error('JSON_WIRE_INVALID');return own(JSON.parse(text));}
  // Preserve descendants owned by the model or protocol. Frozen foreign
  // objects still cross the normal detached boundary.
  function composeRecord(fields){
    if(!record(fields)||![Object.prototype,null].includes(Object.getPrototypeOf(fields)))throw Error('IMMUTABLE_RECORD_INVALID');
    const out={};for(const [key,value] of Object.entries(fields))if(value!==undefined)Object.defineProperty(out,key,{value:immutable(value),enumerable:true});
    Object.freeze(out);ownedValues.add(out);return out;
  }
  function composeArray(values){
    if(!Array.isArray(values))throw Error('IMMUTABLE_ARRAY_INVALID');
    const out=Array.from(values,value=>value===undefined?null:immutable(value));Object.freeze(out);ownedValues.add(out);return out;
  }
  // Memoize only detached, recursively immutable values owned by this port.
  // A bounded cache cannot retain a whole match through old history frames.
  const canonicalCache=new Map();let canonicalBytes=0;
  function canonical(value){
    const ancestors=new Set();
    const write=(v,key='')=>{
      if(v&&typeof v.toJSON==='function')v=v.toJSON(key);
      if(!v||typeof v!=='object')return JSON.stringify(v);
      if(ownedValues.has(v)&&canonicalCache.has(v))return canonicalCache.get(v);
      if(ancestors.has(v))throw TypeError('Circular JSON');ancestors.add(v);
      let text;
      if(Array.isArray(v))text='['+Array.from(v,(item,i)=>write(item,String(i))??'null').join(',')+']';
      else{
        // JSON's integer property order precedes lexically sorted string keys.
        const index=k=>String(Number(k))===k&&Number(k)>=0&&Number(k)<4294967295;
        const keys=Object.keys(v).sort((a,b)=>index(a)?index(b)?Number(a)-Number(b):-1:index(b)?1:a<b?-1:a>b?1:0);
        text='{'+keys.flatMap(k=>{const item=write(v[k],k);return item===undefined?[]:[JSON.stringify(k)+':'+item];}).join(',')+'}';
      }
      ancestors.delete(v);
      if(ownedValues.has(v)&&text.length>=64&&text.length<=1024*1024){canonicalCache.set(v,text);canonicalBytes+=text.length*2;while(canonicalCache.size>2048||canonicalBytes>8*1024*1024){const first=canonicalCache.keys().next().value;canonicalBytes-=canonicalCache.get(first).length*2;canonicalCache.delete(first);}}
      return text;
    };return write(value);
  }
  const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
  function validate(command){
    if(!record(command)||Object.keys(command).some(k=>!['protocolVersion','sessionId','authorityEpoch','commandId','expectedRevision','action','actor'].includes(k))||command.protocolVersion!==version||!id(command.sessionId)||!id(command.authorityEpoch)||!id(command.commandId)||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||!record(command.action)||typeof command.action.type!=='string'||(Object.hasOwn(command,'actor')&&(!Number.isInteger(command.actor)||command.actor<0||command.actor>=32)))return false;
    try{return new TextEncoder().encode(JSON.stringify(command)).length<=16384;}catch(_){return false;}
  }
  const role=snapshot=>snapshot.role||(snapshot.viewer<0?'spectator':'player');
  const sameAudience=(a,b)=>a.viewer===b.viewer&&role(a)===role(b);
  // UI actions may carry labels and pack-defined choice metadata. Prefer the
  // complete command and never infer a target from the order of legal moves.
  const choiceIndexes=new WeakMap();
  function choiceIndex(commands) {
    // A published list is shared by input bridges and scene refreshes.
    // Iterators and unowned arrays still describe a fresh set of choices.
    const owned=Array.isArray(commands)&&ownsImmutable(commands);
    const cached=owned&&choiceIndexes.get(commands);
    if(cached)return cached;
    const byKey=new Map(), fieldsByType=new Map();
    for (const command of commands || []) {
      byKey.set(canonical(command),command);
      if (!fieldsByType.has(command.type)) fieldsByType.set(command.type,new Set());
      const fields=fieldsByType.get(command.type);
      for (const key of Object.keys(command)) fields.add(key);
    }
    const resolve=(action,decorated=false)=>{
      if (!record(action)) return;
      const exact=byKey.get(canonical(action));
      if (exact || !decorated) return exact;
      const fields=fieldsByType.get(action.type);
      if (!fields) return;
      const value=Object.fromEntries(Object.entries(action).filter(([key])=>fields.has(key)));
      return byKey.get(canonical(value));
    };
    if(owned)choiceIndexes.set(commands,resolve);
    return resolve;
  }
  function resolveChoice(commands, action, decorated=false) {
    return choiceIndex(commands)(action,decorated);
  }
  function command(snapshot,action,commandId){
    // The projection owns complete commands. Scene interactions can omit
    // buttons or expose only a gesture-specific subset of the legal moves.
    const model=projectedModel(snapshot) || snapshot.state?.sdkProjection || snapshot.state?.modelProjection;
    const commands=model?.actions || snapshot.actions || [];
    const offered=resolveChoice(snapshot.actions,action);
    let allowed=model && resolveChoice(commands,action,!!offered);
    if (!allowed && record(action)) {
      // Legacy shell buttons can add display text. Preserve typed inputs and
      // any fields actually declared by a finite command, even named "label".
      const candidates=model ? commands : (snapshot.state?.scene?.interactions||[]).map(row=>row.command);
      const displayKeys=['label','tooltip'].filter(key=>
        !candidates.some(choice=>choice.type===action.type && Object.hasOwn(choice,key)) &&
        !(model?.inputs||[]).some(input=>input.command.type===action.type && Object.hasOwn(input.fields,key)));
      const plain=Object.fromEntries(Object.entries(action).filter(([key])=>!displayKeys.includes(key)));
      allowed=resolveChoice(candidates,plain);
    }
    return {protocolVersion:version,sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,commandId,
      expectedRevision:snapshot.revision,action:clone(allowed||action),...(role(snapshot)==='table'?{actor:snapshot.actor}:{})};
  }
  function presentationReady(snapshot){return {protocolVersion:version,kind:'presentation-ready',sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,controlRevision:snapshot.controlRevision||0,revision:snapshot.reactionWindow?.revision??snapshot.revision,windowId:snapshot.reactionWindow?.id};}
  function validatePresentationReady(message){return record(message)&&Object.keys(message).every(k=>['protocolVersion','kind','sessionId','authorityEpoch','controlRevision','revision','windowId'].includes(k))&&message.protocolVersion===version&&message.kind==='presentation-ready'&&id(message.sessionId)&&id(message.authorityEpoch)&&id(message.windowId)&&Number.isSafeInteger(message.controlRevision)&&message.controlRevision>=0&&Number.isSafeInteger(message.revision)&&message.revision>=0;}
  async function historyRange(read,start,count,length){
    if(!Number.isSafeInteger(start)||start<0||start>=length||!Number.isSafeInteger(count)||count<1||count>64)throw Error('HISTORY_RANGE_INVALID');
    const frames=[];let bytes=256;
    for(let index=start;index<Math.min(length,start+count);index++){
      const frame=await read(index),size=new TextEncoder().encode(JSON.stringify(frame)).byteLength+1;
      if(bytes+size>256*1024)return {frames,next:start+frames.length,...(!frames.length?{oversized:start}:{})};
      frames.push(frame);bytes+=size;
    }
    return {frames,next:start+frames.length};
  }
  function status(value){
    if(value?.kind==='status')return value;
    if(value?.kind==='snapshot')return {kind:'status',scope:'session',sessionId:value.sessionId,authorityEpoch:value.authorityEpoch,game:value.game,packVersion:value.packVersion,viewer:value.viewer,role:role(value),revision:value.revision,controlRevision:value.controlRevision||0,playerControlRevision:value.playerControlRevision||0,reactionRevision:value.reactionRevision||0,rosterRevision:value.rosterRevision||0,...(value.projectionHash?{projectionHash:value.projectionHash}:{})};
    if(value?.room)return {kind:'status',scope:'room',roomId:value.room.id,participantId:value.participantId||null,phase:value.room.phase,revision:value.room.revision};
    throw Error('STATUS_INVALID');
  }
  const sameStatus=(a,b)=>!!a&&!!b&&canonical(status(a))===canonical(status(b));
  return {parse,withDraft,authoritativeFrame,withProjection,projectedModel,composeRecord,composeArray,historyRange,status,sameStatus,version,clone,freeze,immutable,ownsImmutable,canonical,validate,choiceIndex,resolveChoice,command,fingerprint,role,sameAudience,presentationReady,validatePresentationReady};
});

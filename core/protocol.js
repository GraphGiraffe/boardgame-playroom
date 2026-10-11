(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomProtocol=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const version=1, record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  const canonical=x=>JSON.stringify(x,(_,v)=>record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
  function validate(command){
    if(!record(command)||Object.keys(command).some(k=>!['protocolVersion','sessionId','authorityEpoch','commandId','expectedRevision','action'].includes(k))||command.protocolVersion!==version||!id(command.sessionId)||!id(command.authorityEpoch)||!id(command.commandId)||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||!record(command.action)||typeof command.action.type!=='string')return false;
    try{return new TextEncoder().encode(JSON.stringify(command)).length<=16384;}catch(_){return false;}
  }
  function command(snapshot,action,commandId){return {protocolVersion:version,sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,commandId,expectedRevision:snapshot.revision,action:clone(action)};}
  function presentationReady(snapshot){return {protocolVersion:version,kind:'presentation-ready',sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,controlRevision:snapshot.controlRevision||0,revision:snapshot.reactionWindow?.revision??snapshot.revision,windowId:snapshot.reactionWindow?.id};}
  function validatePresentationReady(message){return record(message)&&Object.keys(message).every(k=>['protocolVersion','kind','sessionId','authorityEpoch','controlRevision','revision','windowId'].includes(k))&&message.protocolVersion===version&&message.kind==='presentation-ready'&&id(message.sessionId)&&id(message.authorityEpoch)&&id(message.windowId)&&Number.isSafeInteger(message.controlRevision)&&message.controlRevision>=0&&Number.isSafeInteger(message.revision)&&message.revision>=0;}
  return {version,clone,freeze,canonical,validate,command,presentationReady,validatePresentationReady};
});

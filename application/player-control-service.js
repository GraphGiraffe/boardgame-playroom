/* Authenticate room identities before invoking the host-only control capability. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerControlService=api;})(globalThis,function(){
 'use strict';
 async function dispatch({authority,room,requester},command){
  const fail=code=>{throw Error(code);};
  if(!authority||room.phase!=='playing'||room.transportMode==='hotseat')fail('UNAVAILABLE');
  const person=room.participants.find(p=>p.id===requester),frame=authority.connect(-1);let snapshot;try{snapshot=frame.snapshot();}finally{frame.close();}
  if(!person?.connected||person.bot||command?.type!=='player-control')fail('READ_ONLY');
  if(command.sessionId!==snapshot.sessionId||command.authorityEpoch!==snapshot.authorityEpoch)fail('WRONG_SESSION');
  let id=requester,changes;
  if(command.operation==='bot'){
   if(room.ownerId!==requester||typeof command.target!=='string')fail('READ_ONLY');if(room.game?.capabilities?.bots===false)fail('BOTS_UNSUPPORTED');id=command.target;changes={bot:true};
  }else if(command.operation==='away'){if(command.target!==undefined)fail('BAD_COMMAND');changes={away:true};}
  else if(command.operation==='return'){if(command.target!==undefined)fail('BAD_COMMAND');changes={away:false,bot:false};}
  else fail('BAD_COMMAND');
  const target=room.participants.find(p=>p.id===id);
  if(target?.role!=='player'||target.bot)fail('READ_ONLY');
  const access=(globalThis.PlayroomSessionAccess||(typeof require==='function'?require('./session-access.js'):null)).resolve(room,id);
  if(access.role!=='player')fail('READ_ONLY');
  // Presence is host-owned; client payload cannot claim another player is offline.
  authority.setViewerConnected(access.viewer,!!target.connected);
  return authority.setPlayerControl(access.viewer,changes,{requestId:command.requestId,expectedRevision:command.expectedRevision});
 }
 return Object.freeze({dispatch});
});

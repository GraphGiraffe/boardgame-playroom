/* Planned host handoff. No transport, browser, timer or game-rule dependencies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHostTransfer=api;})(globalThis,function(){
 'use strict';const clone=x=>JSON.parse(JSON.stringify(x));
 function bundle(raw,{id,target,sourceToken,cloudRoomId=null}){
  const value=clone(raw),r=value.record,room=r?.room,person=room?.participants?.find(p=>p.id===target);
  if(!r||room.phase!=='playing'||!person?.connected||person.bot||person.local||!['player','spectator','table'].includes(person.role)||person.isHost||!r.recovery||r.revision!==value.steps.length)throw Error('HOST_TRANSFER_UNAVAILABLE');
  const source=room.ownerId;room.ownerId=target;room.hostMode=person.role==='player'?'player':'table';room.recovery={sessionId:r.sessionId,revision:r.revision};room.revision++;room.lobbyRevision++;
  room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index).forEach((s,i)=>{if(!Number.isInteger(s.playerIndex))s.playerIndex=i;});
  for(const p of room.participants)p.isHost=p.id===target;
  r.recovery.room=clone(room);r.recovery.tokens=r.recovery.tokens.filter(t=>t.participantId!==target);
  r.recovery.tokens.push({participantId:source,token:sourceToken});
  r.transfer={id,role:'incoming',state:'prepared',source,target,cloudRoomId};
  return value;
 }
 function lobbyBundle(raw,{id,target,sourceToken,cloudRoomId=null}){
  const recovery=clone(raw),room=recovery?.room,person=room?.participants?.find(p=>p.id===target);
  if(recovery?.version!==1||room.phase!=='lobby'||room.recovery||!person?.connected||person.bot||person.local||!['player','spectator','table'].includes(person.role)||person.isHost||!Array.isArray(recovery.tokens)||!/^[0-9a-f]{64}$/.test(sourceToken))throw Error('HOST_TRANSFER_UNAVAILABLE');
  const source=room.ownerId;room.ownerId=target;room.hostMode=person.role==='player'?'player':'table';room.revision++;room.lobbyRevision++;delete room.hostTransferPending;room.countdownEndsAt=null;
  for(const p of room.participants){p.isHost=p.id===target;p.ready=!!p.bot;}
  recovery.tokens=recovery.tokens.filter(t=>t.participantId!==target);recovery.tokens.push({participantId:source,token:sourceToken});
  return {id,source,target,cloudRoomId,recovery};
 }
 class Sender{
  constructor(ports){this.ports=ports;this.state=null;}
  async start(target){
   if(this.state)throw Error('HOST_TRANSFER_BUSY');
   const p=this.ports,s=this.state={id:p.id(),target,stage:'consent'};
   try{
    if(!await p.consent(s)){this.state=null;return {cancelled:true};}
    s.stage='prepare';await p.freeze(s);await p.prepare(s);await p.connections(s);
    s.stage='fence';await p.fence(s);s.stage='fenced';
    return await this.finish();
   }catch(error){
    if(s.stage!=='fenced'){await p.cancel(s).catch(()=>{});await p.thaw(s);this.state=null;}
    throw error;
   }
  }
  async finish(){if(this.finishing)return this.finishing;const s=this.state,p=this.ports;if(s?.stage!=='fenced')throw Error('HOST_TRANSFER_NOT_FENCED');this.finishing=(async()=>{await p.commit(s);await p.activate(s);s.stage='complete';return {id:s.id,complete:true};})();try{return await this.finishing;}finally{this.finishing=null;}}
 }
 return Object.freeze({Sender,bundle,lobbyBundle});
});

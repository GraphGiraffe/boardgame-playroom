/* Authority creation commits private initial state before publishing any frame. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHostSessionService=api;})(globalThis,function(){
  'use strict';
  class HostSessionService {
    constructor({engine,Session,Authority,store,packs,fingerprint,recovery,idFactory}){Object.assign(this,{engine,Session,Authority,store,packs,fingerprint,recovery,idFactory});}
    async start(room,{restored=null,rosterReady=Promise.resolve()}={}){
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);
      const players=occupied.map(seat=>{const person=room.participants.find(value=>value.id===seat.participantId);if(!person)throw Error('HOST_PARTICIPANT_MISSING');return {name:person.nickname,bot:!!person.bot};});
      if(players.length<room.constraints.min)throw Error('HOST_PLAYERS_REQUIRED');
      if(room.recovery&&!restored)throw Error('HOST_RECOVERY_REQUIRED');
      this.packs.activate(room.game.id,room.game.version);
      const session=restored?.session||new this.Session(this.engine,room.game.id,{packVersion:room.game.version,players,mode:'solo',preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:!!room.rules.openHands,firstPlayerMode:room.firstPlayerMode||'random',firstPlayer:occupied.findIndex(seat=>seat.participantId===room.firstParticipantId),...(room.rules.options||{})});
      const sessionId=restored?.sessionId||this.idFactory();
      if(!this.store)throw Error('HOST_STORAGE_REQUIRED');
      let releaseLock=null,persisted=false;
      try{
        if(restored){
          await rosterReady;
          if(occupied.length!==session.current.players.length||occupied.some((seat,index)=>seat.playerIndex!==index))throw Error('HOST_SEATS_CHANGED');
          players.forEach((person,index)=>session.setPlayerMetadata(index,person));
        }else{
          releaseLock=await this.store.acquireHostLock(sessionId);
          const packDigest=await this.fingerprint(this.packs,room.game.id,room.game.version);
          await this.store.create({sessionId,room,session,recovery:this.recovery(room.id),packDigest});
        }
        persisted=true;
        const authority=new this.Authority(session,{sessionId,restoredReceipts:restored?.receipts||[],paused:!!restored?.paused,controlRevision:restored?.controlRevision||0,persistence:{commit:entry=>this.store.commit(entry),recordReceipt:entry=>this.store.recordReceipt(entry),setControl:entry=>this.store.setControl(entry)}});
        return {session,sessionId,authority,releaseLock,persisted};
      }catch(error){releaseLock?.();error.persisted=persisted;throw error;}
    }
  }
  return HostSessionService;
});

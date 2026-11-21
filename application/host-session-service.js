/* Authority creation commits private initial state before publishing any frame. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHostSessionService=api;})(globalThis,function(){
  'use strict';
  const results=new WeakMap();
  const hasSeriesSource=saved=>saved.recovery?.room.phase==='playing'&&!!saved.packDigest&&!saved.seriesSuccessor&&!saved.seriesHandoff;
  function terminalSeries(session,sessionId,playerIds){
    const entry=session.options?.matchSeries;
    // Replacing a seat during recovery ends the original roster's series.
    if(!Array.isArray(entry?.playerIds)||entry.playerIds.length!==playerIds.length||
      !playerIds.every((id,index)=>entry.playerIds[index]===id))return null;
    const Series=globalThis.PlayroomMatchSeries||(typeof require==='function'?require('./match-series.js'):null);
    let completed=null;
    return state=>{
      if(state.status!=='finished')return null;
      if(!completed){
        try{
          const snapshot=Series.finish(entry,sessionId,state);
          completed={snapshot,summary:Series.summary(snapshot,playerIds)};
        }catch(_){completed={snapshot:null,summary:{unavailable:true}};}
      }
      return completed;
    };
  }
  class HostSessionService {
    constructor({engine,Session,Authority,store,packs,fingerprint,recovery,idFactory,seriesEntry=()=>null}){Object.assign(this,{engine,Session,Authority,store,packs,fingerprint,recovery,idFactory,seriesEntry});}
    static completedSeries(authority){return results.get(authority)?.()??null;}
    static archivedSeries(saved,playerIds){
      const complete=terminalSeries(saved.session,saved.sessionId,playerIds);
      return {project:complete?state=>complete(state)?.summary:null,
        canResume:hasSeriesSource(saved)&&complete?.(saved.session.current)?.summary.complete===false};
    }
    static resumableSeries(saved,playerIds){
      if(!hasSeriesSource(saved))return null;
      const complete=terminalSeries(saved.session,saved.sessionId,playerIds)?.(saved.session.current);
      return complete?.summary.complete===false?complete.snapshot:null;
    }
    async start(room,{restored=null,rosterReady=Promise.resolve(),lobbyHandoff=null}={}){
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);
      const {players,seatIndices}=(globalThis.PlayroomRooms||(typeof require==='function'?require('./rooms.js'):null)).sessionSetup(room);
      if(players.length<room.constraints.min)throw Error('HOST_PLAYERS_REQUIRED');
      if(room.recovery&&!restored)throw Error('HOST_RECOVERY_REQUIRED');
      this.packs.activate(room.game.id,room.game.version);
      // Pack commands use dense player indices, which may differ from lobby seats.
      const ownerPlayer=occupied.findIndex(seat=>seat.participantId===room.ownerId);
      const sessionId=restored?.sessionId||this.idFactory();
      const definition=this.engine.get(room.game.id,room.game.version),playerIds=occupied.map(seat=>seat.participantId);
      const entry=restored?.session.options.matchSeries??(!restored?this.seriesEntry(room.id,sessionId,playerIds):null);
      if(entry?.series?.rules.mode==='score'&&entry.series.rules.metricId!==definition.seriesScoreMetric)throw Error('SERIES_POLICY_INVALID');
      const session=restored?.session||new this.Session(this.engine,room.game.id,{packVersion:room.game.version,players,seatIndices,mode:'solo',preset:room.rules.preset,presetLabel:room.rules.presetLabel,firstPlayerMode:room.firstPlayerMode||'random',firstPlayer:occupied.findIndex(seat=>seat.participantId===room.firstParticipantId),...(room.rules.options||{}),hostPlayer:definition.clockActions?-1:ownerPlayer,openHands:false,...(entry?{matchSeries:entry}:{})});
      const complete=terminalSeries(session,sessionId,playerIds);
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
          await this.store.create({sessionId,room,session,recovery:this.recovery(room.id),packDigest,lobbyHandoff});
        }
        persisted=true;
        const authority=new this.Authority(session,{sessionId,...(complete?{seriesResult:state=>complete(state)?.summary}:{}),restoredReceipts:restored?.receipts||[],paused:!!restored?.paused,...(restored?.clockTime!==undefined?{clockTime:restored.clockTime,clockUpdatedAt:restored.clockUpdatedAt}:{}),controlRevision:restored?.controlRevision||0,playerControls:restored?.playerControls?.map((control,index)=>occupied[index]?.previousParticipant&&occupied[index].participantId!==occupied[index].previousParticipant.id?{...control,away:false,bot:false}:control),playerControlRevision:restored?.playerControlRevision||0,playerControlReceipts:restored?.playerControlReceipts||[],persistence:{commit:entry=>this.store.commit(entry),...(typeof this.store.commitBatch==='function'?{commitBatch:entry=>this.store.commitBatch(entry)}:{}),recordReceipt:entry=>this.store.recordReceipt(entry),setControl:entry=>this.store.setControl(entry),setPlayerControls:entry=>this.store.setPlayerControls(entry)}});
        if(complete)results.set(authority,()=>complete(session.current)?.snapshot);
        return {session,sessionId,authority,releaseLock,persisted};
      }catch(error){releaseLock?.();error.persisted=persisted;throw error;}
    }
  }
  return HostSessionService;
});

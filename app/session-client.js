(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSessionClient=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  let sequence=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`client-${Date.now()}-${++sequence}`;
  class SessionClient {
    constructor(transport,{onEffect=()=>{}}={}){
      this.transport=transport;this.snapshot=null;this.pending=null;this.deliveryError=null;this.inFlight=null;this.listeners=new Set();this.onEffect=onEffect;this.lastEvent=0;this.lastEffectRevision=-1;this.epoch=null;this.closed=false;this.recovering=false;
      this.unsubscribe=transport.subscribe?.(s=>this.accept(s));
    }
    accept(snapshot){
      if(this.closed||snapshot?.kind!=='snapshot'||snapshot.protocolVersion!==1||!Number.isSafeInteger(snapshot.revision))return false;
      if(this.snapshot&&(snapshot.sessionId!==this.snapshot.sessionId||snapshot.authorityEpoch!==this.epoch))throw Error('Исполнитель изменился. Откройте новую ссылку.');
      if(this.snapshot&&(snapshot.revision<this.snapshot.revision||(snapshot.controlRevision||0)<(this.snapshot.controlRevision||0)||!P.sameAudience(snapshot,this.snapshot)||snapshot.packVersion!==this.snapshot.packVersion||snapshot.game!==this.snapshot.game))return false;
      if((snapshot.reactionRevision!==undefined&&(!Number.isSafeInteger(snapshot.reactionRevision)||snapshot.reactionRevision<0))||(snapshot.paused!==undefined&&typeof snapshot.paused!=='boolean')||(snapshot.controlRevision!==undefined&&(!Number.isSafeInteger(snapshot.controlRevision)||snapshot.controlRevision<0)))return false;
      const initial=!this.snapshot;
      if(!initial&&snapshot.revision===this.snapshot.revision&&(snapshot.controlRevision||0)<=(this.snapshot.controlRevision||0)&&(snapshot.reactionRevision||0)<=(this.snapshot.reactionRevision||0))return false;
      this.epoch=snapshot.authorityEpoch;this.snapshot=P.freeze(P.clone(snapshot));
      if(!initial&&!this.recovering){
        for(const cue of snapshot.cues||[])if(cue.eventId>this.lastEvent)this.onEffect({type:'sound',...cue});
        for(const effect of snapshot.effects||[])if(effect.revision>this.lastEffectRevision)this.onEffect({type:'transfer',...effect});
      }
      this.lastEvent=Math.max(this.lastEvent,...(snapshot.events||[]).map(e=>e.id),0);
      this.lastEffectRevision=snapshot.revision;
      for(const listener of this.listeners)listener(this.snapshot);
      return true;
    }
    async refresh(){const snapshot=await this.transport.snapshot();this.accept(snapshot);return this.snapshot;}
    async reconcile(snapshot){
      if(this.closed)throw Error('Подключение закрыто.');
      const previous=this.snapshot;
      if(!snapshot||snapshot.kind!=='snapshot'||snapshot.protocolVersion!==1||!Number.isSafeInteger(snapshot.revision)||
        (previous&&((['sessionId','authorityEpoch','game','packVersion'].some(k=>snapshot[k]!==previous[k])||!P.sameAudience(snapshot,previous))||
          snapshot.revision<previous.revision||(snapshot.controlRevision||0)<(previous.controlRevision||0))))throw Error('Состояние подключения изменилось. Нужно новое приглашение.');
      this.recovering=true;
      try{
        this.accept(snapshot);
        if(this.inFlight)await this.inFlight.catch(()=>{});
        if(this.pending){const receipt=await this.retry();if(!receipt.ok&&!receipt.ignored)this.deliveryError=receipt.message;}
        return this.snapshot;
      }finally{this.recovering=false;}
    }
    subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
    async send(action){if(this.closed||!this.snapshot)throw Error('Нет подключения.');if(this.pending)throw Error('Предыдущая команда ещё не подтверждена.');this.pending=P.command(this.snapshot,action,uid());return this.retry();}
    retry(){
      if(this.inFlight)return this.inFlight;
      if(!this.pending)return Promise.reject(Error('Нет команды для повтора.'));
      const command=this.pending;this.deliveryError=null;
      this.inFlight=Promise.resolve().then(async()=>{
        let receipt;
        try{
          for(let attempt=0;attempt<2;attempt++){
            try{receipt=await this.transport.dispatch(P.clone(command));break;}
            catch(error){if(this.closed||attempt===1)throw error;}
          }
          if(receipt.commandId!==command.commandId)throw Error('Некорректное подтверждение.');
          this.pending=null;
          if(receipt.snapshot)this.accept(receipt.snapshot);
          return receipt;
        }catch(error){this.deliveryError=error.message;throw error;}
        finally{this.inFlight=null;for(const listener of this.listeners)listener(this.snapshot);}
      });
      return this.inFlight;
    }
    history(index){return this.transport.history(index);}
    presentationReady(snapshot=this.snapshot){
      if(this.closed||!snapshot||snapshot.viewer!==snapshot.reactionWindow?.owner)return Promise.resolve(null);
      return Promise.resolve(this.transport.presentationReady?.(P.presentationReady(snapshot)));
    }
    close({keepTransport=false}={}){this.closed=true;this.unsubscribe?.();if(!keepTransport)this.transport.close?.();this.listeners.clear();}
  }
  return SessionClient;
});

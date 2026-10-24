if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomClientConnectionService=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  class SessionClient {
    constructor(transport,{onEffect=()=>{},idFactory}={}){
      if(typeof idFactory!=='function')throw Error('CLIENT_ID_SOURCE_REQUIRED');this.idFactory=idFactory;
      this.transport=transport;this.snapshot=null;this.pending=null;this.deliveryError=null;this.inFlight=null;this.listeners=new Set();this.onEffect=onEffect;this.lastEvent=0;this.lastEffectRevision=-1;this.epoch=null;this.closed=false;this.recovering=false;
      this.unsubscribe=transport.subscribe?.(s=>this.accept(s));
    }
    accept(snapshot){
      if(this.closed||snapshot?.kind!=='snapshot'||snapshot.protocolVersion!==3||!Number.isSafeInteger(snapshot.revision))return false;
      if(this.snapshot&&(snapshot.sessionId!==this.snapshot.sessionId||snapshot.authorityEpoch!==this.epoch))throw Error(globalThis.PlayroomMessages.text("ui.session-client.c5aa2db0f54c"));
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
      if(this.closed)throw Error(globalThis.PlayroomMessages.text("ui.session-client.b8adaa326e7c"));
      const previous=this.snapshot;
      if(!snapshot||snapshot.kind!=='snapshot'||snapshot.protocolVersion!==3||!Number.isSafeInteger(snapshot.revision)||
        (previous&&((['sessionId','authorityEpoch','game','packVersion'].some(k=>snapshot[k]!==previous[k])||!P.sameAudience(snapshot,previous))||
          snapshot.revision<previous.revision||(snapshot.controlRevision||0)<(previous.controlRevision||0))))throw Error(globalThis.PlayroomMessages.text("ui.session-client.f7a7f94750b3"));
      this.recovering=true;
      try{
        this.accept(snapshot);
        if(this.inFlight)await this.inFlight.catch(()=>{});
        if(this.pending){const receipt=await this.retry();if(!receipt.ok&&!receipt.ignored)this.deliveryError=receipt.message;}
        return this.snapshot;
      }finally{this.recovering=false;}
    }
    subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
    async send(action){if(this.closed||!this.snapshot)throw Error(globalThis.PlayroomMessages.text("ui.session-client.a0444837bb86"));if(this.pending)throw Error(globalThis.PlayroomMessages.text("ui.session-client.34ce9807af57"));this.pending=P.command(this.snapshot,action,this.idFactory());const w=this.snapshot.state?.scene?.decisionWindow;this.pendingDecision=w?{id:w.id,version:w.versions[this.snapshot.viewer],viewer:this.snapshot.viewer,control:this.snapshot.controlRevision||0}:null;return this.retry();}
    retry(){
      if(this.inFlight)return this.inFlight;
      if(!this.pending)return Promise.reject(Error(globalThis.PlayroomMessages.text("ui.session-client.c86acc5fddaa")));
      let command=this.pending;this.deliveryError=null;
      this.inFlight=Promise.resolve().then(async()=>{
        let receipt;
        try{
          for(let rebases=0;rebases<9;rebases++){
            for(let attempt=0;attempt<2;attempt++){
              try{receipt=await this.transport.dispatch(P.clone(command));break;}
              catch(error){if(this.closed||attempt===1)throw error;}
            }
            if(receipt.commandId!==command.commandId)throw Error(globalThis.PlayroomMessages.text("ui.session-client.70e1cfc955f9"));
            const next=receipt.snapshot,w=next?.state?.scene?.decisionWindow,token=this.pendingDecision;
            const legal=next?.state?.scene?.interactions?.some(({command:c})=>P.canonical(c)===P.canonical(command.action));
            if(receipt.code!=='STALE'||rebases===8||!token||!w||w.id!==token.id||w.versions[token.viewer]!==token.version||next.viewer!==token.viewer||next.sessionId!==command.sessionId||next.authorityEpoch!==command.authorityEpoch||(next.controlRevision||0)!==token.control||next.paused||!legal)break;
            // The authority still checks every global revision. Only unchanged own
            // decisions in the same barrier can be submitted with a fresh receipt ID.
            this.accept(next);command=P.command(next,command.action,this.idFactory());this.pending=command;
          }
          this.pending=null;
          if(receipt.snapshot)this.accept(receipt.snapshot);
          return receipt;
        }catch(error){this.deliveryError=globalThis.PlayroomMessages.error(error);throw error;}
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

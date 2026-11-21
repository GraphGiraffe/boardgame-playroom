if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomClientConnectionService=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const historyEncoder=new TextEncoder();
  const jsonBytes=value=>historyEncoder.encode(JSON.stringify(value)).byteLength;
  class SessionClient {
    constructor(transport,{onEffect=()=>{},idFactory,readHistory=null,writeHistory=null,writeHistoryRange=null,restoreFrame=frame=>frame,historyBudget=16*1024*1024}={}){
      if(typeof idFactory!=='function')throw Error('CLIENT_ID_SOURCE_REQUIRED');this.idFactory=idFactory;
      if(!Number.isSafeInteger(historyBudget)||historyBudget<1)throw Error('HISTORY_BUDGET_INVALID');
      this.historyPayloadSizes=new WeakMap();
      this.historyBudget=historyBudget;this.historyBytes=0;this.historySizes=new Map();this.restoreFrame=restoreFrame;this.readHistory=readHistory;this.writeHistory=writeHistory;this.writeHistoryRange=writeHistoryRange;this.historyFrames=new Map();this.historyPending=new Map();
      this.transport=transport;this.snapshot=null;this.confirmedFrame=null;this.pending=null;this.deliveryError=null;this.inFlight=null;this.listeners=new Set();this.onEffect=onEffect;this.lastEvent=0;this.lastEffectRevision=-1;this.epoch=null;this.closed=false;this.recovering=false;
      this.unsubscribe=transport.subscribe?.(s=>this.accept(s));
    }
    _acceptsSnapshotHeader(snapshot){
      if(this.closed||snapshot?.kind!=='snapshot'||snapshot.protocolVersion!==3||!Number.isSafeInteger(snapshot.revision))return false;
      const previous=this.snapshot;
      if(previous&&(snapshot.sessionId!==previous.sessionId||snapshot.authorityEpoch!==this.epoch))throw Error(globalThis.PlayroomMessages.text("ui.session-client.c5aa2db0f54c"));
      if((snapshot.reactionRevision!==undefined&&(!Number.isSafeInteger(snapshot.reactionRevision)||snapshot.reactionRevision<0))||(snapshot.paused!==undefined&&typeof snapshot.paused!=='boolean')||(snapshot.controlRevision!==undefined&&(!Number.isSafeInteger(snapshot.controlRevision)||snapshot.controlRevision<0)))return false;
      if(!previous)return true;
      if(!P.sameAudience(snapshot,previous)||snapshot.packVersion!==previous.packVersion||snapshot.game!==previous.game)return false;
      const revision=snapshot.revision-previous.revision,roster=(snapshot.rosterRevision||0)-(previous.rosterRevision||0),
        players=(snapshot.playerControlRevision||0)-(previous.playerControlRevision||0),control=(snapshot.controlRevision||0)-(previous.controlRevision||0);
      if(revision<0||roster<0||players<0||control<0)return false;
      return revision>0||roster>0||players>0||control>0||(snapshot.reactionRevision||0)>(previous.reactionRevision||0);
    }
    accept(snapshot){
      // The transport has decoded the frame, but the presentation port has
      // not executed a pack. Reject obsolete and out-of-scope headers here.
      if(!this._acceptsSnapshotHeader(snapshot))return false;
      snapshot=this.restoreFrame(snapshot);
      if(!this._acceptsSnapshotHeader(snapshot))return false;
      if(snapshot.playerControlRevision!==undefined&&(!Number.isSafeInteger(snapshot.playerControlRevision)||snapshot.playerControlRevision<0||!Array.isArray(snapshot.playerControls)||snapshot.playerControls.length!==snapshot.state?.players?.length||snapshot.playerControls.some(v=>!v||typeof v.away!=='boolean'||typeof v.bot!=='boolean')))return false;
      const initial=!this.snapshot;
      this.epoch=snapshot.authorityEpoch;this.confirmedFrame=P.immutable(snapshot);this._rememberHistory(this.confirmedFrame,this.confirmedFrame);this.snapshot=this.presentSnapshot(this.confirmedFrame);
      if(!initial&&!this.recovering){
        for(const cue of snapshot.cues||[])if(cue.eventId>this.lastEvent)this.onEffect({type:'sound',...cue});
        for(const effect of snapshot.effects||[])if(effect.revision>this.lastEffectRevision)this.onEffect({type:'transfer',...effect});
      }
      this.lastEvent=Math.max(this.lastEvent,...(snapshot.events||[]).map(e=>e.id),0);
      this.lastEffectRevision=snapshot.revision;
      for(const listener of this.listeners)listener(this.snapshot);
      return true;
    }
    presentSnapshot(frame){return frame;}
    refresh(){
      if(this.refreshPending)return this.refreshPending;
      this.refreshPending=Promise.resolve().then(()=>this.transport.snapshot()).then(snapshot=>{this.accept(snapshot);return this.snapshot;}).finally(()=>{this.refreshPending=null;});return this.refreshPending;
    }
    waitForReceipt(receipt,timeout=750){
      const ready=()=>this.snapshot&&this.snapshot.sessionId===receipt.sessionId&&this.snapshot.authorityEpoch===receipt.authorityEpoch&&this.snapshot.revision>=receipt.revision&&(this.snapshot.controlRevision||0)>=(receipt.controlRevision||0);
      if(ready())return Promise.resolve(true);
      return new Promise(resolve=>{let timer;const finish=value=>{clearTimeout(timer);off();resolve(value);},off=this.subscribe(()=>{if(this.closed||ready())finish(!this.closed);});timer=setTimeout(()=>finish(false),timeout);if(ready())finish(true);});
    }
    async reconcile(snapshot){
      if(this.closed)throw Error(globalThis.PlayroomMessages.text("ui.session-client.b8adaa326e7c"));
      const previous=this.snapshot;
      if(!snapshot||snapshot.kind!=='snapshot'||snapshot.protocolVersion!==3||!Number.isSafeInteger(snapshot.revision)||
        (previous&&((['sessionId','authorityEpoch','game','packVersion'].some(k=>snapshot[k]!==previous[k])||!P.sameAudience(snapshot,previous))||
          snapshot.revision<previous.revision||(snapshot.playerControlRevision||0)<(previous.playerControlRevision||0)||(snapshot.controlRevision||0)<(previous.controlRevision||0))))throw Error(globalThis.PlayroomMessages.text("ui.session-client.f7a7f94750b3"));
      this.recovering=true;
      try{
        this.accept(snapshot);
        if(this.inFlight)await this.inFlight.catch(()=>{});
        if(this.pending){const receipt=await this.retry();if(!receipt.ok&&!receipt.ignored)this.deliveryError=receipt.message;}
        return this.snapshot;
      }finally{this.recovering=false;}
    }
    subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
    async send(action){if(this.closed||!this.snapshot)throw Error(globalThis.PlayroomMessages.text("ui.session-client.a0444837bb86"));if(this.pending||this.inFlight)throw Error(globalThis.PlayroomMessages.text("ui.session-client.34ce9807af57"));this.pending=P.command(this.snapshot,action,this.idFactory());const w=this.snapshot.state?.scene?.decisionWindow;this.pendingDecision=w?{id:w.id,version:w.versions[this.snapshot.viewer],viewer:this.snapshot.viewer,control:this.snapshot.controlRevision||0}:null;return this.retry();}
    canRebase(snapshot,action){return !!snapshot?.state?.scene?.interactions?.some(({command:c})=>P.canonical(c)===P.canonical(action));}
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
            const legal=this.canRebase(next,command.action);
            if(receipt.code!=='STALE'||rebases===8||!token||!w||w.id!==token.id||w.versions[token.viewer]!==token.version||next.viewer!==token.viewer||next.sessionId!==command.sessionId||next.authorityEpoch!==command.authorityEpoch||(next.controlRevision||0)!==token.control||next.paused||!legal)break;
            // The authority still checks every global revision. Only unchanged own
            // decisions in the same barrier can be submitted with a fresh receipt ID.
            this.accept(next);command=P.command(next,command.action,this.idFactory());this.pending=command;
          }
          if(receipt.snapshot)this.accept(receipt.snapshot);
          else if(receipt.ok&&(receipt.revision>this.snapshot.revision||(receipt.controlRevision||0)>(this.snapshot.controlRevision||0))&&!await this.waitForReceipt({...receipt,sessionId:command.sessionId,authorityEpoch:command.authorityEpoch})&&!this.closed)await this.refresh();
          this.pending=null;return receipt;
        }catch(error){this.deliveryError=globalThis.PlayroomMessages.error(error);throw error;}
        finally{this.inFlight=null;for(const listener of this.listeners)listener(this.snapshot);}
      });
      return this.inFlight;
    }
    _matchesHistoryHeader(frame,index,scope){
      return !!frame&&!!scope&&frame.revision===index&&frame.sessionId===scope.sessionId&&frame.authorityEpoch===scope.authorityEpoch&&
        frame.game===scope.game&&frame.packVersion===scope.packVersion&&P.sameAudience(frame,scope);
    }
    _historyFrame(frame,index,scope=this.snapshot){
      return this._matchesHistoryHeader(frame,index,scope)&&frame.state?.move===index?frame:null;
    }
    _restoreHistoryFrame(raw,index,scope){
      // Compact history omits state.move. Check scope and index before
      // reconstruction, then validate the restored state's revision.
      if(this.closed||!this._matchesHistoryHeader(raw,index,scope))return null;
      return this._historyFrame(this.restoreFrame(raw),index,scope);
    }
    _historySize(frame){
      let payloadBytes=0;
      const sizeOf=(value,measure=jsonBytes)=>{
        if(!value||typeof value!=='object')return jsonBytes(value);
        let bytes=this.historyPayloadSizes.get(value);
        if(bytes===undefined){bytes=measure(value);this.historyPayloadSizes.set(value,bytes);}
        return bytes;
      };
      const eventBytes=value=>{
        if(!Array.isArray(value))return jsonBytes(value);
        let bytes=2+Math.max(0,value.length-1);
        for(const event of value)bytes+=sizeOf(event);
        return bytes;
      };
      const placeholder=(value,measure)=>{
        if(!value||typeof value!=='object')return value;
        // Each null occupies four bytes in the envelope. The budget still
        // counts every occurrence, even when two fields share the same value.
        payloadBytes+=sizeOf(value,measure)-4;
        return null;
      };
      const state={...frame.state,scene:placeholder(frame.state.scene),events:placeholder(frame.state.events,eventBytes)};
      const envelopeBytes=jsonBytes({...frame,state,events:placeholder(frame.events,eventBytes)});
      return envelopeBytes+payloadBytes;
    }
    _rememberHistory(frame,scope=this.snapshot){
      const valid=this._historyFrame(frame,frame.revision,scope);if(!valid)return null;
      const source=P.immutable(valid);
      const history=P.composeRecord({...source,protocolVersion:3,kind:'history',...(scope.role?{role:scope.role}:{}),actions:[],independentActions:[],cues:source.cues||[],effects:source.effects||[],reactionWindow:null,reactionWindows:[]});
      this.historyBytes-=this.historySizes.get(frame.revision)||0;
      const size=this._historySize(history);
      this.historySizes.set(frame.revision,size);this.historyBytes+=size;
      this.historyFrames.delete(frame.revision);this.historyFrames.set(frame.revision,history);
      while(this.historyFrames.size>1&&(this.historyFrames.size>128||this.historyBytes>this.historyBudget)){
        const key=[...this.historyFrames.keys()].find(key=>key!==scope.revision);
        if(key===undefined)break;this.historyFrames.delete(key);this.historyBytes-=this.historySizes.get(key)||0;this.historySizes.delete(key);
      }
      return history;
    }
    async history(index){
      if(this.closed||!this.snapshot)throw Error('HISTORY_CLOSED');
      if(!Number.isSafeInteger(index)||index<0||index>=this.snapshot.historyLength)throw Error('HISTORY_REVISION_INVALID');
      if(this.historyFrames.has(index)){const frame=this.historyFrames.get(index);this.historyFrames.delete(index);this.historyFrames.set(index,frame);return frame;}
      if(this.historyPending.has(index))return this.historyPending.get(index);
      const scope=this.snapshot;
      const pending=Promise.resolve().then(async()=>{
        let frame,fetched=false;
        try{frame=this._restoreHistoryFrame(await this.readHistory?.(index,scope),index,scope);}catch(_){/* Storage failure does not block remote recovery. */}
        if(this.closed)throw Error('HISTORY_CLOSED');
        if(!frame){fetched=true;frame=this._restoreHistoryFrame(await this.transport.history(index),index,scope);}
        if(this.closed||!frame||!this._historyFrame(frame,index))throw Error('HISTORY_FRAME_INVALID');
        const history=this._rememberHistory(frame);
        try{if(fetched)await this.writeHistory?.(history);}catch(_){/* The memory copy remains available if durable storage fails. */}
        return history;
      }).finally(()=>this.historyPending.delete(index));
      this.historyPending.set(index,pending);return pending;
    }
    async historyRange(start,count=64){
      if(this.closed||!this.snapshot)throw Error('HISTORY_CLOSED');
      if(!Number.isSafeInteger(start)||start<0||start>=this.snapshot.historyLength||!Number.isSafeInteger(count)||count<1||count>64)throw Error('HISTORY_RANGE_INVALID');
      const scope=this.snapshot,end=Math.min(start+count,scope.historyLength),found=new Map(),missing=[];
      for(let index=start;index<end;index++){
        if(this.historyFrames.has(index)){found.set(index,this.historyFrames.get(index));continue;}
        if(this.historyPending.has(index)){found.set(index,await this.historyPending.get(index));continue;}
        let frame;try{frame=this._restoreHistoryFrame(await this.readHistory?.(index,scope),index,scope);}catch(_){}
        if(frame)found.set(index,this._rememberHistory(frame));else missing.push(index);
      }
      for(let offset=0;offset<missing.length;){
        const first=missing[offset];let length=1;while(offset+length<missing.length&&missing[offset+length]===first+length)length++;
        const group=missing.slice(offset,offset+length);offset+=length;
        if(group.some(index=>this.historyPending.has(index)||this.historyFrames.has(index))){await Promise.all(group.map(index=>this.history(index).then(frame=>found.set(index,frame))));continue;}
        if(this.closed)throw Error('HISTORY_CLOSED');
        const request=Promise.resolve().then(async()=>{
           const frames=new Map();let cursor=first;
           while(cursor<first+length){
             if(this.closed)throw Error('HISTORY_CLOSED');
             const reply=await this.transport.historyRange(cursor,first+length-cursor);
             if(!reply||!Array.isArray(reply.frames)||reply.next!==cursor+reply.frames.length||reply.next>first+length)throw Error('HISTORY_RANGE_INVALID');
             for(const frame of reply.frames){if(frame.kind!=='history'||frame.revision!==cursor||frames.has(cursor))throw Error('HISTORY_RANGE_INVALID');frames.set(cursor++,frame);}
             if(!reply.frames.length){
               if(reply.oversized!==cursor)throw Error('HISTORY_RANGE_INVALID');
               frames.set(cursor,await this.transport.history(cursor));cursor++;
             }
           }
           return frames;
         });
         const prepared=group.map(index=>request.then(frames=>{
           const frame=this._restoreHistoryFrame(frames.get(index),index,scope);
           if(this.closed||!frame||!this._historyFrame(frame,index))throw Error('HISTORY_FRAME_INVALID');return this._rememberHistory(frame);
         }));
        const committed=Promise.all(prepared).then(async frames=>{
          if(this.closed)throw Error('HISTORY_CLOSED');
          try{if(this.writeHistoryRange)await this.writeHistoryRange(frames);else await Promise.all(frames.map(frame=>this.writeHistory?.(frame)));}catch(_){}return frames;
        });
        const pending=group.map((index,offset)=>{
          const promise=committed.then(frames=>frames[offset]).finally(()=>this.historyPending.delete(index));
          this.historyPending.set(index,promise);return promise.then(frame=>found.set(index,frame));
        });
        await Promise.all(pending);
      }
      return {frames:Array.from({length:end-start},(_,i)=>found.get(start+i)),next:end};
    }
    presentationReady(snapshot=this.snapshot){
      if(this.closed||!snapshot||snapshot.viewer!==snapshot.reactionWindow?.owner)return Promise.resolve(null);
      return Promise.resolve(this.transport.presentationReady?.(P.presentationReady(snapshot)));
    }
    close({keepTransport=false}={}){this.closed=true;for(const listener of this.listeners)listener(this.snapshot);this.unsubscribe?.();if(!keepTransport)this.transport.close?.();this.listeners.clear();this.historyFrames.clear();this.historySizes.clear();this.historyBytes=0;this.historyPending.clear();}
  }
  return SessionClient;
});

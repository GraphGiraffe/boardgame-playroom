/* Serialize client archive writes and fence obsolete reconnect backfills. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHistorySyncService=api;})(globalThis,function(){
  'use strict';
  class HistorySyncService {
    constructor({store,key,current,boundary=()=>{},warning=()=>{}}){Object.assign(this,{store,key,current,boundary,warning});this.queue=Promise.resolve();this.epoch=0;this.warned=false;}
    get idle(){return this.queue;}
    cancel(){this.epoch++;}
    enqueue(operation){
      this.queue=this.queue.catch(()=>{}).then(operation);
      this.queue.catch(error=>{if(!this.warned){this.warned=true;this.warning(error);}});
      return this.queue;
    }
    save(snapshot,context){if(!this.store||!snapshot||snapshot.kind!=='snapshot'||!context.roomId||!context.participantId)return;return this.enqueue(()=>this.store.save({...context,snapshot}));}
    mark(snapshot,context,kind,revision){if(!this.store||!snapshot||!context.roomId||!context.participantId)return;return this.enqueue(()=>this.store.mark(this.key(context.roomId,context.participantId,snapshot.sessionId),kind,revision));}
    async backfill(initial,transport,context){
      if(!this.store||!initial||initial.viewer< -1)return;
      const epoch=++this.epoch,isCurrent=()=>epoch===this.epoch&&this.current(initial,transport);
      try{
        await this.queue;if(!isCurrent())return;
        const key=this.key(context.roomId,context.participantId,initial.sessionId);
        const archive=(await this.store.list()).find(item=>item.id===key),progress=await this.store.progress(key,initial.revision);
        const boundary=archive?.presentedRevision!=null&&progress.missing.some(revision=>revision>archive.presentedRevision)?archive.presentedRevision+1:null;
        await this.store.backfill({...context,snapshot:initial,transport,isCurrent});
        if(isCurrent()&&boundary!==null)this.boundary(boundary);
      }catch(_){/* Durable frames remain; recovery requests only missing revisions. */}
    }
    dispose(){this.cancel();}
  }
  return HistorySyncService;
});

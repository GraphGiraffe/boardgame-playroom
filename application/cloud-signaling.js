/* Rendezvous only. RTC ports own connections; existing authority owns gameplay. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCloudSignaling=api;})(globalThis,function(){
 'use strict';
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const fail=code=>Object.assign(Error(code),{code});
 class CloudSignaling{
  constructor({remote,peers,idFactory,report=()=>{},clock={setTimeout:(...args)=>globalThis.setTimeout(...args),clearTimeout:id=>globalThis.clearTimeout(id)}}){Object.assign(this,{remote,peers,idFactory,report,clock});this.generation=0;this.handles=new Map();this.mode=null;}
  stop(){this.generation++;this.mode=null;this.wake?.();for(const item of this.handles.values())item.close?.();this.handles.clear();}
  wait(ms=2000){return new Promise(resolve=>{const timer=this.clock.setTimeout(done,ms),self=this;function done(){self.clock.clearTimeout(timer);if(self.wake===done)self.wake=null;resolve();}this.wake=done;});}
  async host(roomId,localRoomId){
   this.stop();const ticket=this.generation,epoch=this.idFactory();await this.remote('host',{roomId,localRoomId,epoch});
   if(ticket!==this.generation)throw fail('cancelled');this.mode='host';
   const loop=async()=>{
    while(ticket===this.generation){
     try{
      const rows=await this.remote('poll-host',{roomId,epoch});
      if(ticket!==this.generation)return;
      for(const [id,item] of this.handles)if(item.closed?.()||!item.accepted&&!rows.some(r=>r.id===id)){item.close();this.handles.delete(id);}
      await Promise.allSettled([...this.handles].map(async([id,item])=>{if(!item.accepted)return;try{await item.validate?.();}catch(error){if(['forbidden','not-found','account-changed','cancelled'].includes(error.code)){item.close();this.handles.delete(id);}}}));
      const outcomes=await Promise.allSettled(rows.map(async row=>{
       let handle=this.handles.get(row.id);
       if(!handle&&row.offer&&row.answer)return;
       if(!handle){
        // RPC-derived identity is bound to this specific offered RTC connection.
        const identity=await this.remote('authorize',{roomId,epoch,id:row.id});
        if(!uuid(identity?.userId)||!uuid(identity?.participantId))throw fail('forbidden');
        const check=async()=>{if(ticket!==this.generation)throw fail('cancelled');const current=await this.remote('authorize',{roomId,epoch,userId:identity.userId});if(ticket!==this.generation||current.participantId!==identity.participantId)throw fail('forbidden');};
        handle=await this.peers.host({identity,check});
        if(ticket!==this.generation){handle.close();return;}
        this.handles.set(row.id,handle);
       }
       if(!handle.offerPublished){await this.remote('offer',{roomId,epoch,id:row.id,signal:handle.offer});handle.offerPublished=true;
       }
       if(row.answer&&!handle.accepted){await handle.accept(row.answer);handle.accepted=true;}
      }));
      const rejected=outcomes.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
      this.report({state:'hosting'});
     }catch(error){if(ticket===this.generation){this.report({state:'error',code:error.code||'network'});if(error.code==='host-offline'){try{await this.remote('host',{roomId,localRoomId,epoch});}catch(next){if(['forbidden','host-busy','account-changed','not-found'].includes(next.code)){this.stop();return;}}}else if(['forbidden','host-busy','account-changed','not-found'].includes(error.code)){this.stop();return;}}}
     if(ticket===this.generation)await this.wait();
    }
   };
   this.running=loop();return {epoch};
  }
  async connect(roomId){
   this.stop();const ticket=this.generation;this.mode='client';
   const slot=await this.remote('request',{roomId});
   for(let attempts=0;attempts<60&&ticket===this.generation;attempts++){
    const result=await this.remote('poll',{roomId,id:slot.id});
    if(ticket!==this.generation)throw fail('cancelled');
    if(result.epoch!==slot.epoch)throw fail('host-offline');
    if(result.offer){
     const peer=await this.peers.client(result.offer);
     if(ticket!==this.generation){peer.close();throw fail('cancelled');}
     this.handles.set('client',peer);
     try{await this.remote('answer',{roomId,id:slot.id,signal:peer.answer});if(ticket!==this.generation)throw fail('cancelled');await this.peers.attach(peer,slot.localRoomId);if(ticket!==this.generation)throw fail('cancelled');return;}
     catch(error){peer.close();this.handles.delete('client');throw error;}
    }
    await this.wait();
   }
   throw fail(ticket!==this.generation?'cancelled':'host-offline');
  }
 }
 return CloudSignaling;
});

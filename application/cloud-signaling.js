/* Rendezvous only. RTC ports own connections; existing authority owns gameplay. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCloudSignaling=api;})(globalThis,function(){
 'use strict';
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const fail=code=>Object.assign(Error(code),{code});
 class CloudSignaling{
  constructor({remote,peers,idFactory,report=()=>{},clock={setTimeout:(...args)=>globalThis.setTimeout(...args),clearTimeout:id=>globalThis.clearTimeout(id)}}){Object.assign(this,{remote,peers,idFactory,report,clock});this.generation=0;this.handles=new Map();this.grants=new Map();this.mode=null;}
  stop(){this.generation++;this.mode=null;this.wake?.();for(const item of this.handles.values())item.close?.();this.handles.clear();this.grants.clear();}
  releaseHost(){if(this.mode!=='host')throw fail('forbidden');this.generation++;this.mode=null;this.wake?.();this.handles.clear();this.grants.clear();}
  wait(ms=2000){return new Promise(resolve=>{const timer=this.clock.setTimeout(done,ms),self=this;function done(){self.clock.clearTimeout(timer);if(self.wake===done)self.wake=null;resolve();}this.wake=done;});}
  async host(roomId,localRoomId){
   this.stop();const ticket=this.generation,epoch=this.idFactory();await this.remote('host',{roomId,localRoomId,epoch});
   if(ticket!==this.generation)throw fail('cancelled');this.mode='host';
   const loop=async()=>{
    while(ticket===this.generation){
     let joining=false;
     try{
      const known=[...this.handles].filter(([,item])=>item.accepted&&!item.closed?.()).map(([id])=>id);
      const peers=[...this.handles].filter(([,item])=>item.accepted&&!item.closed?.()&&(!item.active||item.active())).map(([id])=>({id,...this.grants.get(id).identity}));
      const batch=await this.remote('poll-host',{roomId,epoch,known,peers});
      if(ticket!==this.generation)return;
      if(!batch||batch.contract!==1||!Array.isArray(batch.signals)||batch.signals.length>32||!Array.isArray(batch.peers)||batch.peers.length!==peers.length||new Set(batch.peers.map(p=>p.id)).size!==peers.length||batch.peers.some(p=>typeof p.allowed!=='boolean'||!peers.some(sent=>sent.id===p.id)))throw fail('signaling-contract');
      const rows=batch.signals;
      for(const result of batch.peers)if(!result.allowed){const grant=this.grants.get(result.id);if(grant)grant.authorized=false;this.handles.get(result.id)?.close();this.handles.delete(result.id);this.grants.delete(result.id);}
      if(ticket!==this.generation)return;
      joining=rows.some(row=>!this.handles.get(row.id)?.accepted&&!(row.offer&&row.answer&&!this.handles.has(row.id)));
      for(const [id,item] of this.handles)if(item.closed?.()||!item.accepted&&!rows.some(r=>r.id===id)){item.close();this.handles.delete(id);this.grants.delete(id);}
      const outcomes=await Promise.allSettled(rows.map(async row=>{
       let handle=this.handles.get(row.id);
       if(!handle&&(known.includes(row.id)||row.offer&&row.answer))return;
       if(!handle){
        // RPC-derived identity is bound to this specific offered RTC connection.
        const identity={userId:row.userId,participantId:row.participantId};
        if(!uuid(identity?.userId)||!uuid(identity?.participantId))throw fail('forbidden');
        const grant={identity,authorized:true};this.grants.set(row.id,grant);
        const check=()=>{if(ticket!==this.generation)throw fail('cancelled');if(!grant.authorized)throw fail('forbidden');};
        // One poll refreshes all connected grants; commands consult this local
        // capability. Temporary API errors retain the last successful grant.
        const validate=async()=>check();
        try{handle=await this.peers.host({identity,check,validate});}catch(error){if(this.grants.get(row.id)===grant)this.grants.delete(row.id);throw error;}
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
     if(ticket===this.generation)await this.wait(joining?500:2000);
    }
   };
   this.running=loop();return {epoch};
  }
  async signal(action,data,ticket){
   // Retry only bounded signaling operations, never gameplay mutations. A new
   // request may replace its unconsumed SDP slot; identities remain room-bound.
   for(let attempt=0;;attempt++){
    if(ticket!==this.generation)throw fail('cancelled');
    try{const value=await this.remote(action,data);if(ticket!==this.generation)throw fail('cancelled');return value;}
    catch(error){if(ticket!==this.generation)throw fail('cancelled');if(attempt>=3||!(error.code==='network'||error.status>=500))throw error;await this.wait([500,1000,2000][attempt]);}
   }
  }
  async connect(roomId,{background=false}={}){
   this.stop();const ticket=this.generation;this.mode='client';
   const slot=await this.signal('request',{roomId},ticket);
   const preparation=this.peers.prepare?.(roomId);preparation?.catch(()=>{});
   for(let attempts=0;attempts<60&&ticket===this.generation;attempts++){
    const result=await this.signal('poll',{roomId,id:slot.id},ticket);
    if(ticket!==this.generation)throw fail('cancelled');
    if(result.epoch!==slot.epoch)throw fail('host-offline');
    if(result.offer){
     await preparation;if(ticket!==this.generation)throw fail('cancelled');
     const peer=await this.peers.client(result.offer);
     if(ticket!==this.generation){peer.close();throw fail('cancelled');}
     this.handles.set('client',peer);
     try{await this.signal('answer',{roomId,id:slot.id,signal:peer.answer},ticket);if(ticket!==this.generation)throw fail('cancelled');await this.peers.attach(peer,slot.localRoomId,{background});if(ticket!==this.generation)throw fail('cancelled');return;}
     catch(error){peer.close();this.handles.delete('client');throw error;}
    }
    await this.wait(attempts<10?500:attempts<20?1000:2000);
   }
   throw fail(ticket!==this.generation?'cancelled':'host-offline');
  }
 }
 return CloudSignaling;
});

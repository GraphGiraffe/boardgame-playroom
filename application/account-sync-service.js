/* Coalesce independent account reads; game transport and file writes stay separate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAccountSyncService=api;})(globalThis,function(){
 'use strict';const fail=code=>Object.assign(Error(code),{code});
 const reads={playroom_social:new Set(['list']),playroom_online:new Set(['unread','inbox','group-inbox','hub','group-list','group-info','chat','group-read','settings','presence','discover']),playroom_cloud_saves_rpc:new Set(['list']),playroom_push:new Set(['config'])};
 class AccountSync{
  constructor({account,remote,schedule=fn=>setTimeout(fn,0),now=()=>Date.now()}){Object.assign(this,{account,remote,schedule,now});this.pending=new Map();this.flights=new Map();this.cache=new Map();this.generation=0;this.sequence=0;this.scheduled=false;this.identity=this.key();account.subscribe(()=>{if(this.key()!==this.identity){this.identity=this.key();this.generation++;this.cache.clear();for(const request of this.pending.values())for(const p of request.waiters)p.reject(fail('account-changed'));this.pending.clear();this.flights.clear();}});}
  key(){const s=this.account.snapshot();return s.kind+':'+s.id+':'+!!s.recovery;}
  supports(rpc,action){const s=this.account.snapshot();return s.kind==='account'&&!s.recovery&&!!reads[rpc]?.has(action);}
  invalidate(){this.cache.clear();}
  request(rpc,action,data={},options={}){
   const s=this.account.snapshot();if(!this.supports(rpc,action)||options.userId&&options.userId!==s.id)return Promise.reject(fail('account-changed'));
   const key=JSON.stringify([rpc,action,data]),cached=this.cache.get(key);if(cached&&cached.until>this.now())return Promise.resolve(structuredClone(cached.value));
   const old=this.flights.get(key);if(old)return old.then(structuredClone);
   const promise=new Promise((resolve,reject)=>{let request=this.pending.get(key);if(!request){request={key,id:'r'+(++this.sequence),rpc,action,data,waiters:[]};this.pending.set(key,request);}request.waiters.push({resolve,reject});});
   this.flights.set(key,promise);promise.finally(()=>{if(this.flights.get(key)===promise)this.flights.delete(key);}).catch(()=>{});
   if(!this.scheduled){this.scheduled=true;this.schedule(()=>void this.flush());}return promise;
  }
  async flush(){
   this.scheduled=false;const items=[...this.pending.values()];this.pending.clear();if(!items.length)return;const ticket=this.generation,s=this.account.snapshot();
   try{
    const result=await this.remote.call('sync',{requests:items.map(({id,rpc,action,data})=>({id,rpc,action,data}))},{userId:s.id});
    if(ticket!==this.generation)throw fail('account-changed');if(!Array.isArray(result?.results))throw fail('request');
    const replies=new Map(result.results.map(row=>[row.id,row]));
    for(const item of items){const reply=replies.get(item.id);if(!reply||reply.error){const error=Object.assign(fail(reply?.error?.code||'request'),{serverCode:reply?.error?.serverCode});for(const p of item.waiters)p.reject(error);continue;}
     if(item.rpc==='playroom_push'&&item.action==='config')this.cache.set(item.key,{value:reply.data,until:this.now()+10000});
     for(const p of item.waiters)p.resolve(structuredClone(reply.data));
    }
   }catch(error){for(const item of items)for(const p of item.waiters)p.reject(error);}
  }
 }
 return AccountSync;
});

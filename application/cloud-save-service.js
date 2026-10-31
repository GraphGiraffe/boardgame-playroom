/* Account-scoped cloud synchronization. Local archives remain the source on failure. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCloudSaveService=api;})(globalThis,function(){
 'use strict';const fail=code=>{throw Object.assign(Error(code),{code});};
 class CloudSaves{
  constructor({account,remote,storage,local,id=()=>crypto.randomUUID()}){
   Object.assign(this,{account,remote,storage,local,id});this.listeners=new Set();this.generation=0;this.user=null;this.enabled=false;this.used=0;this.limit=10485760;this.entries=[];this.bindings={};this.jobs=new Map();this.error=null;this.loading=false;this.clearing=false;
   this.unsubscribe=account.subscribe(()=>this.accountChanged());this.accountChanged();
  }
  accountChanged(){const s=this.account.snapshot(),user=s.kind==='account'&&!s.recovery?s.id:null;if(user===this.user)return;this.user=user;this.generation++;this.entries=[];this.jobs=new Map();this.used=0;this.loaded=false;this.cachedUsage=false;this.enabled=false;this.error=null;this.loading=false;this.clearing=false;try{const saved=JSON.parse(this.storage.getItem('playroom.cloud-saves.v1:'+user)||'{}');this.bindings=saved.bindings||{};this.enabled=!!saved.enabled;if(Number.isSafeInteger(saved.used)&&saved.used>=0){this.used=saved.used;this.cachedUsage=true;}}catch{this.bindings={};}this.emit();}
  persist(){this.storage.setItem('playroom.cloud-saves.v1:'+this.user,JSON.stringify({enabled:this.enabled,bindings:this.bindings,...(this.loaded||this.cachedUsage?{used:this.used}:{})}));}
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)fn(this);}
  guard(ticket){if(ticket!==this.generation||!this.user)fail('account-changed');}
  async call(action,data={},ticket=this.generation){this.guard(ticket);const result=await this.remote.call(action,data,{userId:this.user});this.guard(ticket);return result;}
  accept(result){if(!Array.isArray(result?.entries)||typeof result.enabled!=='boolean'||!Number.isSafeInteger(result.used)||result.used<0||result.limit!==10485760)fail('request');this.entries=result.entries;this.used=result.used;this.limit=result.limit;this.loaded=true;this.enabled=result.enabled;this.error=null;this.persist();this.emit();}
  async refresh(){if(!this.user||!this.remote)return;const ticket=this.generation;this.loading=true;this.emit();try{this.accept(await this.call('list',{},ticket));}catch(error){if(ticket===this.generation){this.error=error.code||'request';this.emit();}throw error;}finally{if(ticket===this.generation){this.loading=false;this.emit();}}}
  async settings(enabled){const result=await this.call('settings',{enabled});this.accept(result);}
  binding(key){if(!this.bindings[key]){this.bindings[key]={id:this.id(),revision:0,base:null};this.persist();}return this.bindings[key];}
  remoteFor(key){return this.entries.find(e=>e.id===this.bindings[key]?.id);}
  automatic(key){const b=this.bindings[key],r=this.remoteFor(key);return !r?.deleted&&(b?.enabled??r?.enabled??this.enabled);}
  state(key){const b=this.bindings[key],r=this.remoteFor(key);return this.jobs.has(key)?'busy':b?.error==='conflict'?'conflict':b?.pending?'pending':b?.error?'error':r&&!r.deleted&&r.checksum===b?.base&&!b?.dirty?'synced':r&&!r.deleted?'changed':this.automatic(key)?'pending':'off';}
  dirty(key){const b=this.bindings[key];if(b){b.dirty=true;this.persist();this.emit();}}
  async run(key,action,{dedupe=false}={}){const ticket=this.generation;this.guard(ticket);if(this.clearing)fail('busy');if(this.jobs.has(key)){const previous=this.jobs.get(key);if(dedupe)return previous;return previous.catch(()=>{}).then(()=>{this.guard(ticket);return this.run(key,action);});}const promise=Promise.resolve().then(()=>action(ticket)).catch(error=>{if(ticket===this.generation){const b=this.binding(key);b.error=error.code||'request';b.pending=b.error==='network';this.persist();this.emit();}throw error;}).finally(()=>{if(ticket===this.generation){this.jobs.delete(key);this.emit();}});this.jobs.set(key,promise);this.emit();return promise;}
  async upload(key,{force=false}={}){return this.run(key,async ticket=>{
   const b=this.binding(key),copy=await this.local.capture(key);this.guard(ticket);await this.refresh();this.guard(ticket);const r=this.remoteFor(key);
   if(r?.deleted&&!force){Object.assign(b,{enabled:false,pending:false,error:null});this.persist();this.emit();return;}
   if(r&&!force&&r.checksum!==b.base&&r.checksum!==copy.checksum)fail('conflict');
   if(r&&!r.deleted&&r.checksum===copy.checksum){Object.assign(b,{base:copy.checksum,revision:r.revision,dirty:false,pending:false,error:null});this.persist();this.emit();return;}
   const result=await this.call('put',{id:b.id,revision:r?.revision||0,file:copy.text,checksum:copy.checksum,summary:copy.summary,enabled:b.enabled??null},ticket);
   this.accept(result);Object.assign(b,{base:copy.checksum,revision:this.remoteFor(key).revision,dirty:false,pending:false,error:null});this.persist();this.emit();
  },{dedupe:!force});}
  async download(key,{force=false}={}){return this.run(key,async ticket=>{
   const b=this.binding(key);await this.refresh();const r=this.remoteFor(key);if(!r||r.deleted)fail('not-found');
   if(!force){const local=await this.local.capture(key);this.guard(ticket);if(local.checksum!==b.base&&local.checksum!==r.checksum)fail('conflict');}
   const value=await this.call('get',{id:b.id},ticket),newKey=await this.local.receive(value,()=>this.guard(ticket),key);this.guard(ticket);
   // Keep the previous local archive as a backup; follow the downloaded copy.
   if(newKey!==key)this.bindings[key]={id:this.id(),revision:0,base:null,enabled:false};this.bindings[newKey]={id:b.id,revision:value.revision,base:value.checksum,enabled:value.enabled,dirty:false};this.persist();this.emit();return newKey;
  });}
  async sync(key){const ticket=this.generation;try{await this.refresh();this.guard(ticket);const b=this.binding(key),r=this.remoteFor(key);if(!r)return await this.upload(key);if(r.deleted){b.enabled=false;this.persist();this.emit();return;}
   const copy=await this.local.capture(key);this.guard(ticket);if(copy.checksum===r.checksum){Object.assign(b,{base:r.checksum,revision:r.revision,dirty:false,pending:false,error:null});this.persist();this.emit();return;}
   if(r.checksum===b.base)return await this.upload(key);if(copy.checksum===b.base)return await this.download(key);fail('conflict');
   }catch(error){if(ticket===this.generation&&this.user){this.binding(key).error=error.code||'request';this.persist();this.emit();}throw error;}
  }
  async toggle(key,enabled){const b=this.binding(key),r=this.remoteFor(key);if(r&&!r.deleted)this.accept(await this.call('enable',{id:b.id,revision:r.revision,enabled}));b.enabled=enabled;b.error=null;this.persist();this.emit();}
  async remove(key){return this.run(key,async()=>{await this.refresh();const b=this.binding(key),r=this.remoteFor(key);if(r&&!r.deleted)this.accept(await this.call('delete',{id:b.id,revision:r.revision}));Object.assign(b,{enabled:false,base:null,revision:this.remoteFor(key)?.revision||0,error:null,pending:false});this.persist();this.emit();});}
  async removeAll(keys=[]){
   const ticket=this.generation;this.guard(ticket);if(this.clearing)fail('busy');this.clearing=true;
   try{
    for(const key of keys)this.binding(key);
    for(const binding of Object.values(this.bindings))Object.assign(binding,{enabled:false,pending:false,error:null});this.persist();this.emit();
    await Promise.allSettled([...this.jobs.values()]);this.guard(ticket);await this.refresh();this.guard(ticket);
    for(const row of [...this.entries].filter(entry=>!entry.deleted)){
     this.accept(await this.call('delete',{id:row.id,revision:row.revision},ticket));
     for(const binding of Object.values(this.bindings))if(binding.id===row.id)Object.assign(binding,{enabled:false,base:null,revision:this.entries.find(entry=>entry.id===row.id)?.revision||0,error:null,pending:false});
     this.persist();
    }
    if(this.entries.some(entry=>!entry.deleted))fail('conflict');this.error=null;
   }catch(error){if(ticket===this.generation){this.error=error.code||'request';this.emit();}throw error;}
   finally{if(ticket===this.generation){this.clearing=false;this.emit();}}
  }
  async receiveRemote(id){const ticket=this.generation,value=await this.call('get',{id},ticket),key=await this.local.receive(value,()=>this.guard(ticket));this.guard(ticket);this.bindings[key]={id,revision:value.revision,base:value.checksum,enabled:value.enabled};this.persist();this.emit();return key;}
  async auto(keys){if(!this.user||!this.remote)return;const ticket=this.generation;for(const key of keys){if(ticket!==this.generation)break;if(this.automatic(key))try{await this.upload(key);}catch{/* Per-save status retains errors; local files are untouched. */}}}
 }
 return CloudSaves;
});

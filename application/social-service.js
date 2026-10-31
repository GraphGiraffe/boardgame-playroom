/* Social use cases. No provider, DOM, storage, transport or game authority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSocialService=api;})(globalThis,function(){
 'use strict';
 const fail=code=>Object.assign(Error(code),{code});
 class SocialService{
  constructor({account,remote}){this.account=account;this.remote=remote;this.listeners=new Set();this.data={profile:null,friends:[],rooms:[],invitations:[]};this.room=null;this.busy=false;this.error=null;this.generation=0;this.identity=this.key();account.subscribe(()=>{const key=this.key();if(key!==this.identity){this.identity=key;this.clear();}});}
  key(){const s=this.account.snapshot();return s.kind+':'+s.id+':'+!!s.recovery;}
  clear(){this.generation++;this.data={profile:null,friends:[],rooms:[],invitations:[]};this.room=null;this.busy=false;this.error=null;this.emit();}
  snapshot(){return structuredClone({busy:this.busy,error:this.error,...this.data,room:this.room});}
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)fn(this.snapshot());}
  async perform(action,data={}){
   const s=this.account.snapshot();if(!this.remote||s.kind==='local'||s.recovery)throw fail('account-required');
   if(s.busy||this.busy)throw fail('busy');
   if(s.kind==='guest'&&!['join','list','room','leave'].includes(action))throw fail('account-required');
   const ticket=this.generation,key=this.key();this.busy=true;this.error=null;this.emit();
   const current=()=>ticket===this.generation&&key===this.key();
   try{
    const result=await this.remote.call(action,data,{userId:s.id});
    if(!current())throw fail('account-changed');
    if(action==='search')return result;
    if(action==='room')this.room=result;
    else {const next=action==='list'?result:await this.remote.call('list',{}, {userId:s.id});if(!current())throw fail('account-changed');this.data=next;this.room=null;}
    return result;
   }catch(error){if(current())this.error=error.code||'request';throw error;}
   finally{if(current()){this.busy=false;this.emit();}}
  }
  refresh(){return this.perform('list');}
  acceptSync(data,userId){if(this.account.snapshot().id!==userId||this.account.snapshot().kind!=='account'||this.busy)return;if(!data||!Array.isArray(data.friends)||!Array.isArray(data.rooms)||!Array.isArray(data.invitations))return;this.data=data;this.emit();}
 }
 return SocialService;
});

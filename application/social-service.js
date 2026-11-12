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
    const result=await this.remote.call(action,action==='search'?{...data,format:'page-v2'}:data,{userId:s.id});
    if(!current())throw fail('account-changed');
    if(action==='search'){
     const legacy=Array.isArray(result),items=legacy?result:result?.items,query=String(data.username||'').trim().replace(/^@+/,'').toLowerCase();
     if(!Array.isArray(items)||!legacy&&items.length>30||!legacy&&result.next!=null&&typeof result.next!=='string')throw fail('request');
     const people=items.slice(0,30).filter(p=>p&&typeof p.id==='string'&&typeof p.username==='string'&&typeof p.nickname==='string'&&p.id!==s.id).map(({id,username,nickname})=>({id,username,nickname}));
     people.sort((a,b)=>Number(b.username.toLowerCase()===query)-Number(a.username.toLowerCase()===query)||a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
     return {items:people,next:legacy?null:result.next||null,legacy};
    }
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

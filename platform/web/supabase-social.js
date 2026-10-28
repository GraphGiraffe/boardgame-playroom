/* Social REST/credentials adapter. Only explicit RPC calls, no startup polling. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSupabaseSocial=api;})(globalThis,function(){
 'use strict';
 const fail=(code,status=0)=>Object.assign(Error(code),{code,status});
 const reasons=['account-required','invalid','profile-required','not-found','forbidden','limit','invite-invalid','owner-leave','friend-required','host-offline','host-busy'];
 class SupabaseSocial{
  constructor({auth,fetch=(...args)=>globalThis.fetch(...args),rpc='playroom_social'}){if(!['playroom_social','playroom_signal'].includes(rpc))throw fail('configuration');this.auth=auth;this.fetch=fetch;this.rpc=rpc;}
  async call(action,data={}, {userId}={}){
   const session=await this.auth.session();if(!session)throw fail('account-required');
   if(userId&&session.user?.id!==userId)throw fail('account-changed');
   let response;try{response=await this.fetch(this.auth.config.url+'/rest/v1/rpc/'+this.rpc,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.auth.config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data})});}catch(_){throw fail('network');}
   let result;try{result=await response.json();}catch(_){throw fail('request',response.status);}
   if(!response.ok){const reason=reasons.find(code=>result?.message==='social:'+code);throw fail(reason||(['PGRST202','42P01','42883'].includes(result?.code)?'setup':response.status===429?'rate-limit':response.status===401?'credentials':'request'),response.status);}
   return result;
  }
 }
 return SupabaseSocial;
});

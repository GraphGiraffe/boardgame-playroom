/* Supabase Auth REST adapter. Tokens stay in this adapter and its scoped store. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSupabaseAuth=api;})(globalThis,function(){
 'use strict';
 const fail=(code,status=0)=>Object.assign(Error(code),{code,status});
 function configuration(value){
  if(!value?.url||!value?.publishableKey)return null;
  const url=new URL(value.url);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw fail('configuration');
  let legacy=false;try{const payload=JSON.parse(globalThis.atob(value.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));legacy=payload.role==='anon';}catch(_){}
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey)&&!legacy)throw fail('configuration');
  return Object.freeze({url:url.origin,publishableKey:value.publishableKey});
 }
 class SupabaseAuth{
  constructor(config,{storage=()=>globalThis.localStorage,fetch=(...args)=>globalThis.fetch(...args),crypto=globalThis.crypto,location=globalThis.location,history=globalThis.history,locks=globalThis.navigator?.locks,now=()=>Date.now()}={}){
   this.config=configuration(config);if(!this.config)throw fail('configuration');
   Object.assign(this,{storage,fetch,crypto,location,history,locks,now});
   this.key='playroom.cloud-auth.v1:'+this.config.url;this.pendingKey=this.key+':pkce';this.memory=null;
  }
  read(key=this.key){try{return JSON.parse(this.storage()?.getItem(key)||'null');}catch(_){return key===this.key?this.memory:null;}}
  cachedUser(){const value=this.read();if(!value?.access_token||!value?.refresh_token||typeof value?.user?.id!=='string')return null;return {id:value.user.id,email:typeof value.user.email==='string'?value.user.email:'',is_anonymous:value.user.is_anonymous===true};}
  write(key,value){try{if(value===null)this.storage()?.removeItem(key);else this.storage()?.setItem(key,JSON.stringify(value));}catch(_){throw fail('storage');}}
  save(result,{recovery=false}={}){
   if(!result?.access_token||!result?.refresh_token||!result?.user?.id||!Number.isFinite(Number(result.expires_in)))throw fail('response');
   const value={access_token:result.access_token,refresh_token:result.refresh_token,user:result.user,expires_at:this.now()+Number(result.expires_in)*1000,recovery};
   this.write(this.key,value);this.memory=value;return value.user;
  }
  async request(path,{body,method=body?'POST':'GET',token,api='auth/v1'}={}){
   let response;try{response=await this.fetch(this.config.url+'/'+api+'/'+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch(error){throw fail(error?.name==='TimeoutError'?'timeout':'network');}
   let result;try{result=await response.json();}catch(_){if(response.ok&&response.status===204)return null;throw fail('response',response.status);}
   if(!response.ok){const known={PGRST202:'setup',over_email_send_rate_limit:'email-rate-limit',email_address_not_authorized:'email-sender-unavailable',same_password:'same-password',weak_password:'weak-password',email_not_confirmed:'email-not-confirmed',invalid_credentials:'credentials',reauthentication_needed:'reauthentication',reauthentication_not_valid:'reauthentication',current_password_invalid:'current-password',current_password_mismatch:'current-password',current_password_required:'current-password'};const code=known[result?.error_code||result?.code]||(response.status===429?'rate-limit':response.status===401||response.status===403?'credentials':response.status>=500?'unavailable':'request');throw fail(code,response.status);}
   return result;
  }
  async locked(fn){return this.locks?.request?this.locks.request(this.key,fn):fn();}
  async session(){return this.locked(async()=>{
   const value=this.read();if(!value?.refresh_token||!value?.access_token)return null;
   if(value.expires_at>this.now()+60000)return value;
   try{const result=await this.request('token?grant_type=refresh_token',{body:{refresh_token:value.refresh_token}});this.save(result,{recovery:!!value.recovery});return this.read();}
   catch(error){if([400,401,403].includes(error.status)){this.write(this.key,null);this.memory=null;}throw error;}
  });}
  async restore(){const session=await this.session();if(!session)return null;try{return await this.request('user',{token:session.access_token});}catch(error){if(error.status===401){this.write(this.key,null);this.memory=null;}throw error;}}
  async login(email,password){return this.locked(async()=>this.save(await this.request('token?grant_type=password',{body:{email,password}})));}
  redirect(){const url=new URL(this.location.href);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw fail('redirect');return url.origin+url.pathname;}
  async challenge(kind){
   const bytes=new Uint8Array(32);this.crypto.getRandomValues(bytes);
   const base64=value=>globalThis.btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   const verifier=base64(bytes),challenge=base64(new Uint8Array(await this.crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   this.write(this.pendingKey,{verifier,kind,createdAt:this.now()});return {code_challenge:challenge,code_challenge_method:'s256'};
  }
  async signup(email,password,username){const handle=String(username||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z][a-z0-9_]{2,23}$/.test(handle))throw fail('username-invalid');const available=await this.request('playroom_signup_name_available',{api:'rest/v1/rpc',body:{p_username:handle}});if(typeof available!=='boolean')throw fail('response');if(!available)throw fail('username-taken');const pkce=await this.challenge('signup');const result=await this.request('signup?redirect_to='+encodeURIComponent(this.redirect()),{body:{email,password,data:{username:handle},...pkce}});if(!result.access_token)return null;this.write(this.pendingKey,null);return this.save(result);}
  async guest(){return this.save(await this.request('signup',{body:{}}));}
  isRecovery(){return !!this.read()?.recovery;}
  async recover(email){const pkce=await this.challenge('recovery');await this.request('recover?redirect_to='+encodeURIComponent(this.redirect()),{body:{email,...pkce}});}
  hasCallback(){const url=new URL(this.location.href);return url.searchParams.has('code')||url.searchParams.has('error_code');}
  async callback(){
   const url=new URL(this.location.href),code=url.searchParams.get('code'),error=url.searchParams.get('error_code');if(!code&&!error)return null;
   for(const key of ['code','error','error_code','error_description'])url.searchParams.delete(key);
   this.history.replaceState(this.history.state,'',url.href);
   const pending=this.read(this.pendingKey);
   if(error||!pending?.verifier||this.now()-pending.createdAt>3600000){this.write(this.pendingKey,null);throw fail('recovery-link');}
   const result=await this.request('token?grant_type=pkce',{body:{auth_code:code,code_verifier:pending.verifier}});
   this.write(this.pendingKey,null);const recovery=pending.kind==='recovery',user=this.save(result,{recovery});return {user,recovery};
  }
  async setPassword(session,password,currentPassword){if(!session)throw fail('credentials');const user=await this.request('user',{method:'PUT',token:session.access_token,body:{password,...(currentPassword===undefined?{}:{current_password:currentPassword})}});this.memory={...session,user,recovery:false};this.write(this.key,this.memory);return user;}
  async changePassword(password){return this.setPassword(await this.session(),password);}
  async updatePassword(currentPassword,password){
   const original=await this.session();if(!original)throw fail('credentials');
   return this.locked(async()=>{
    const session=this.read();if(session?.user?.id!==original.user.id)throw fail('credentials');
    const user=await this.request('user',{token:session.access_token});if(user.is_anonymous||!user.email)throw fail('credentials');
    // Verify on Auth even when the project's optional current-password check is off.
    let fresh;try{fresh=await this.request('token?grant_type=password',{body:{email:user.email,password:currentPassword}});}catch(error){if(error.code==='credentials')throw fail('current-password',error.status);throw error;}
    if(fresh?.user?.id!==user.id)throw fail('credentials');this.save(fresh);
    return this.setPassword(this.read(),password,currentPassword);
   });
  }
  async logout(){return this.locked(async()=>{const value=this.read();this.write(this.key,null);this.memory=null;this.write(this.pendingKey,null);if(value?.access_token)try{await this.request('logout?scope=local',{body:{},token:value.access_token});}catch(error){if(error.status!==401&&error.status!==403)throw error;}});}
 }
 return Object.freeze({configuration,SupabaseAuth});
});

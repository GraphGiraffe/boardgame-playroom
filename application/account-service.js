/* Account use cases. No DOM, browser storage, game state or provider protocol. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAccountService=api;})(globalThis,function(){
 'use strict';
 class AccountService{
  constructor({auth,guestId}){this.auth=auth;this.guestId=guestId;this.listeners=new Set();this.busy=false;this.user=auth?.cachedUser?.()||null;this.validatedUserId=null;this.recovery=!!this.user&&!!auth?.isRecovery?.();this.error=null;}
  acceptUser(user){this.user=user;this.validatedUserId=user?.id||null;}
  snapshot(){return Object.freeze({configured:!!this.auth,busy:this.busy,error:this.error,kind:this.user?(this.user.is_anonymous?'guest':'account'):'local',id:this.user?.id||(typeof this.guestId==='function'?this.guestId():this.guestId),email:this.user?.is_anonymous?'':this.user?.email||'',recovery:this.recovery});}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  emit(){const state=this.snapshot();for(const listener of this.listeners)listener(state);}
  async perform(action){
   if(!this.auth)throw Object.assign(Error('unavailable'),{code:'unavailable'});
   if(this.busy)throw Object.assign(Error('busy'),{code:'busy'});
   this.busy=true;this.error=null;this.emit();
   try{return await action();}catch(error){this.error=['network','credentials','rate-limit','storage','unavailable'].includes(error.code)?error.code:'request';throw error;}finally{this.busy=false;this.emit();}
  }
  async restore({ifNeeded=false}={}){
   // Readiness avoids navigation work; it never authorizes an RPC or a mutation.
   // A cold cached identity has no marker, and explicit restore always validates.
   if(ifNeeded&&this.validatedUserId&&typeof this.auth?.cachedUser==='function'){
    const cached=this.auth.cachedUser();
    if(cached?.id!==this.user?.id||!!cached?.is_anonymous!==!!this.user?.is_anonymous||typeof this.auth.isRecovery==='function'&&!!this.auth.isRecovery()!==this.recovery)this.validatedUserId=null;
   }
   if(ifNeeded&&this.user&&this.validatedUserId===this.user.id){if(this.busy)throw Object.assign(Error('busy'),{code:'busy'});return this.snapshot();}
   return this.perform(async()=>{try{this.acceptUser(await this.auth.restore());this.recovery=!!this.user&&!!this.auth.isRecovery?.();return this.snapshot();}catch(error){this.validatedUserId=null;if([400,401,403].includes(error.status)){this.user=null;this.recovery=false;}throw error;}});
  }
  async login(email,password){return this.perform(async()=>{this.acceptUser(await this.auth.login(email.trim(),password));this.recovery=false;return this.snapshot();});}
  async signup(email,password,username){return this.perform(async()=>{const user=await this.auth.signup(email.trim(),password,username);if(user)this.acceptUser(user);return {confirmationRequired:!user};});}
  async ensureGuest(){return this.perform(async()=>{this.acceptUser(await this.auth.restore()||await this.auth.guest());return this.snapshot();});}
  async recover(email){return this.perform(()=>this.auth.recover(email.trim()));}
  async callback(){return this.perform(async()=>{const result=await this.auth.callback();if(result){this.acceptUser(result.user);this.recovery=result.recovery;}return !!result;});}
  async changePassword(password){return this.perform(async()=>{if(!this.recovery)throw Object.assign(Error('recovery-required'),{code:'recovery-required'});this.acceptUser(await this.auth.changePassword(password));this.recovery=false;});}
  async updatePassword(currentPassword,password){return this.perform(async()=>{if(!this.user||this.user.is_anonymous||this.recovery)throw Object.assign(Error('credentials'),{code:'credentials'});if(!currentPassword)throw Object.assign(Error('current-password'),{code:'current-password'});if(currentPassword===password)throw Object.assign(Error('same-password'),{code:'same-password'});this.acceptUser(await this.auth.updatePassword(currentPassword,password));});}
  async logout(){return this.perform(async()=>{try{await this.auth.logout();}finally{this.acceptUser(null);this.recovery=false;}});}
 }
 return AccountService;
});

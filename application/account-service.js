/* Account use cases. No DOM, browser storage, game state or provider protocol. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAccountService=api;})(globalThis,function(){
 'use strict';
 class AccountService{
  constructor({auth,guestId}){this.auth=auth;this.guestId=guestId;this.listeners=new Set();this.busy=false;this.user=null;this.recovery=false;}
  snapshot(){return Object.freeze({configured:!!this.auth,busy:this.busy,kind:this.user?(this.user.is_anonymous?'guest':'account'):'local',id:this.user?.id||(typeof this.guestId==='function'?this.guestId():this.guestId),email:this.user?.is_anonymous?'':this.user?.email||'',recovery:this.recovery});}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  emit(){const state=this.snapshot();for(const listener of this.listeners)listener(state);}
  async perform(action){
   if(!this.auth)throw Object.assign(Error('unavailable'),{code:'unavailable'});
   if(this.busy)throw Object.assign(Error('busy'),{code:'busy'});
   this.busy=true;this.emit();
   try{return await action();}finally{this.busy=false;this.emit();}
  }
  async restore(){return this.perform(async()=>{try{this.user=await this.auth.restore();this.recovery=!!this.user&&!!this.auth.isRecovery?.();return this.snapshot();}catch(error){if([400,401,403].includes(error.status)){this.user=null;this.recovery=false;}throw error;}});}
  async login(email,password){return this.perform(async()=>{this.user=await this.auth.login(email.trim(),password);this.recovery=false;return this.snapshot();});}
  async signup(email,password){return this.perform(async()=>{const user=await this.auth.signup(email.trim(),password);if(user)this.user=user;return {confirmationRequired:!user};});}
  async ensureGuest(){return this.perform(async()=>{this.user=await this.auth.restore()||await this.auth.guest();return this.snapshot();});}
  async recover(email){return this.perform(()=>this.auth.recover(email.trim()));}
  async callback(){return this.perform(async()=>{const result=await this.auth.callback();if(result){this.user=result.user;this.recovery=result.recovery;}return !!result;});}
  async changePassword(password){return this.perform(async()=>{if(!this.recovery)throw Object.assign(Error('recovery-required'),{code:'recovery-required'});this.user=await this.auth.changePassword(password);this.recovery=false;});}
  async logout(){return this.perform(async()=>{try{await this.auth.logout();}finally{this.user=null;this.recovery=false;}});}
 }
 return AccountService;
});

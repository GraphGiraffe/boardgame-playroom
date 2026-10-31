/* Online community port: no DOM, browser timers or game authority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCommunityService=api;})(globalThis,function(){
 'use strict';
 class CommunityService{
  constructor({account,remote}){Object.assign(this,{account,remote});this.generation=0;this.revision=0;this.identity=this.key();account.subscribe(()=>{if(this.identity!==this.key()){this.identity=this.key();this.generation++;this.revision++;}});}
  key(){const s=this.account.snapshot();return s.kind+':'+s.id+':'+s.recovery;}
  async call(action,data={}){const s=this.account.snapshot(),ticket=this.generation;if(!this.remote||s.kind!=='account'||s.recovery)throw Object.assign(Error('account-required'),{code:'account-required'});const result=await this.remote.call(action,data,{userId:s.id});if(ticket!==this.generation)throw Object.assign(Error('account-changed'),{code:'account-changed'});if(!['room-person','unread','hub','presence','settings','group-list','group-info','chat','group-read','inbox','group-inbox','discover','read-messages','group-seen'].includes(action))this.revision++;return result;}
 }
 return CommunityService;
});

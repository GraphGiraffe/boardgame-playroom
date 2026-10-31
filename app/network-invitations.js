/* Delegated manual signaling. Offers always originate at the room host. */
(function(root){
 'use strict';
 class Invitations{
  constructor({authorize,create,accept,dispose}){Object.assign(this,{authorize,create,accept,dispose});this.pending=new Map();this.generations=new Map();}
  clear(id){const entry=this.pending.get(id);if(entry){clearTimeout(entry.timer);this.dispose(entry.value);this.pending.delete(id);}this.generations.set(id,(this.generations.get(id)||0)+1);}
  prune(){for(const id of this.pending.keys())try{this.authorize(id);}catch(_){this.clear(id);}}
  close(){for(const id of this.generations.keys())this.clear(id);}
  async dispatch(id,command){
   this.authorize(id);
   if(command.type==='invitation-offer'){
    this.clear(id);const generation=this.generations.get(id),value=await this.create(id);
    try{this.authorize(id);if(generation!==this.generations.get(id))throw Error('Invitation expired');}catch(error){this.dispose(value);throw error;}
    this.pending.set(id,{value,timer:setTimeout(()=>this.clear(id),120000)});
    return {ok:true,offer:value.offer};
   }
   const entry=this.pending.get(id);if(!entry)throw Error(root.PlayroomMessages.text('ui.social.error.invite-expired'));
   if(command.type!=='invitation-answer')throw Error('Invalid invitation action');
   await this.accept(entry.value,command.answer);clearTimeout(entry.timer);this.pending.delete(id);return {ok:true};
  }
 }
 root.PlayroomNetworkInvitations=Invitations;
 if(typeof module==='object'&&module.exports)module.exports=Invitations;
})(globalThis);

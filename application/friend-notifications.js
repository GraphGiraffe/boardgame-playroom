/* Account-scoped friendship transitions; persist only edge ids and states. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomFriendNotifications=api;})(globalThis,function(){
 'use strict';
 return class FriendNotifications{
  constructor({states={},save=()=>{}}={}){this.states=states;this.save=save;}
  update(friends,forced=[]){
   const next={},events=[],force=new Set(forced);
   for(const friend of friends){
    const state=friend.accepted?'accepted':friend.incoming?'incoming':'outgoing',previous=this.states[friend.id];next[friend.id]=state;
    if(state==='incoming'&&previous!=='incoming')events.push({kind:'friend-request',person:friend});
    if(state==='accepted'&&previous!=='accepted'&&(previous==='outgoing'||force.has('friend-accepted:'+friend.id)))events.push({kind:'friend-accepted',person:friend});
   }
   this.states=next;this.save(next);return events;
  }
 };
});

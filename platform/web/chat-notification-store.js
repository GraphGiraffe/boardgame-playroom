/* Per-account notification cursor. No message bodies or credentials are persisted. */
(function(root){
 'use strict';
 class ChatNotificationStore{
  constructor(storage){this.storage=storage;}
  readFriends(account){try{const value=JSON.parse(this.storage()?.getItem('playroom.friend-notifications.v1:'+account)||'{}');return Object.fromEntries(Object.entries(value).filter(([id,state])=>/^[0-9a-f-]{36}$/i.test(id)&&['incoming','outgoing','accepted'].includes(state)).slice(0,200));}catch{return {};}}
  writeFriends(account,value){try{this.storage()?.setItem('playroom.friend-notifications.v1:'+account,JSON.stringify(value));}catch{}}
  read(account){try{const value=this.storage()?.getItem('playroom.chat-notifications.v1:'+account);return /^\d+$/.test(value||'')?value:null;}catch(_){return null;}}
  write(account,value){if(!/^\d+$/.test(String(value)))return;try{this.storage()?.setItem('playroom.chat-notifications.v1:'+account,String(value));}catch(_){}}
 }
 root.PlayroomChatNotificationStore=ChatNotificationStore;
})(globalThis);

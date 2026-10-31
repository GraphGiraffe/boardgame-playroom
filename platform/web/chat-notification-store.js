/* Per-account notification cursor. No message bodies or credentials are persisted. */
(function(root){
 'use strict';
 class ChatNotificationStore{
  constructor(storage){this.storage=storage;}
  read(account){try{const value=this.storage()?.getItem('playroom.chat-notifications.v1:'+account);return /^\d+$/.test(value||'')?value:null;}catch(_){return null;}}
  write(account,value){if(!/^\d+$/.test(String(value)))return;try{this.storage()?.setItem('playroom.chat-notifications.v1:'+account,String(value));}catch(_){}}
 }
 root.PlayroomChatNotificationStore=ChatNotificationStore;
})(globalThis);

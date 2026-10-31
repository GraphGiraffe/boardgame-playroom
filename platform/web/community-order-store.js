/* Device-local ordering of friends and groups, isolated by account. */
(function(root){
 'use strict';
 class CommunityOrderStore{
  constructor(storage){this.storage=storage;}
  read(user){try{const value=JSON.parse(this.storage().getItem('playroom.community-order.v1:'+user)||'[]');return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&/^(friend|group):[a-zA-Z0-9-]+$/.test(x)))].slice(0,500):[];}catch(_){return [];}}
  write(user,ids){try{this.storage().setItem('playroom.community-order.v1:'+user,JSON.stringify(ids.slice(0,500)));return true;}catch(_){return false;}}
 }
 root.PlayroomCommunityOrderStore=CommunityOrderStore;
})(globalThis);

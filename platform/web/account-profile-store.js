/* Small public identity metadata only; credentials stay in the Auth adapter. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAccountProfileStore=api;})(globalThis,function(){
 'use strict';
 const key=user=>typeof user==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(user)?'playroom.account-profile.v1:'+user:null;
 function profile(value){
  const username=typeof value?.username==='string'?value.username.trim().toLowerCase():'';
  return /^[a-z][a-z0-9_]{2,23}$/.test(username)?{username,nickname:typeof value.nickname==='string'?value.nickname.slice(0,24):''}:null;
 }
 class AccountProfileStore{
  constructor(storage){this.storage=storage;}
  read(user){const name=key(user);if(!name)return null;try{const raw=this.storage().getItem(name);if(!raw||raw.length>512)return null;const value=JSON.parse(raw);return value?.version===1?profile(value):null;}catch(_){return null;}}
  write(user,value){const name=key(user);if(!name)return false;try{const data=profile(value);if(data)this.storage().setItem(name,JSON.stringify({version:1,...data}));else this.storage().removeItem(name);return true;}catch(_){return false;}}
 }
 return AccountProfileStore;
});

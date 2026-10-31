/* Public list metadata only, partitioned by authenticated account. No chat bodies or credentials. */
(function(root){
 'use strict';
 const fields=['id','userId','nickname','username','avatar','accepted','incoming','requested','online','game','name','ownerId','memberCount','count','membersCount'];
 function rows(values){return (Array.isArray(values)?values:[]).slice(0,500).map(value=>Object.fromEntries(fields.filter(key=>['string','boolean','number'].includes(typeof value?.[key])).map(key=>[key,value[key]])));}
 class CommunityCacheStore{
  constructor(storage){this.storage=storage;}
  read(user){if(!user)return null;try{const data=JSON.parse(this.storage().getItem('playroom.community-cache.v1:'+user)||'null');return data?.version===1?{friends:rows(data.friends),conversations:rows(data.conversations),groups:rows(data.groups),invitations:[],rooms:[]}:null;}catch(_){return null;}}
  write(user,data){if(!user||!data)return;try{this.storage().setItem('playroom.community-cache.v1:'+user,JSON.stringify({version:1,friends:rows(data.friends),conversations:rows(data.conversations),groups:rows(data.groups)}));}catch(_){}}
 }
 root.PlayroomCommunityCacheStore=CommunityCacheStore;
})(globalThis);

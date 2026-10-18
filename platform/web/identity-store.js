if(typeof module==='object'&&module.exports&&typeof require==='function')require("../../core/messages.js");
(function(root,factory){const api=factory(root.PlayroomRooms||(typeof require==='function'?require('../../application/rooms.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomIdentityStore=api;})(globalThis,function(Rooms){
'use strict';
const {normalizeName,resumeTokenValid,normalizeAvatar}=Rooms;
const PROFILE_KEY='playroom.player-profile.v1',RESUME_KEY='playroom.network-resume.v1';
function secureResumeToken(){
    const cryptoProvider=globalThis.crypto?.getRandomValues?globalThis.crypto:
      (typeof require==='function'?require('node:crypto').webcrypto:null);
    if(!cryptoProvider?.getRandomValues)throw Error(globalThis.PlayroomMessages.text("ui.identity-store.f24e150ccb94"));
    const bytes=new Uint8Array(32);cryptoProvider.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
let sequence=0;const now=()=>Date.now(),uuid=()=>globalThis.crypto?.randomUUID?.()||'id-'+now().toString(36)+'-'+(++sequence).toString(36);
class ProfileStore{
    constructor(storageProvider=()=>globalThis.localStorage){this.storageProvider=storageProvider;}
    _storage(){const storage=this.storageProvider?.();if(!storage)throw Error(globalThis.PlayroomMessages.text("ui.identity-store.d401aa27da29"));return storage;}
    load(){
      try{
        const raw=this._storage().getItem(PROFILE_KEY);if(!raw)return null;
        const value=JSON.parse(raw);
        if(value?.version!==1||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||!value.name.trim())return null;
        return Object.freeze({version:1,id:value.id,name:normalizeName(value.name),avatar:normalizeAvatar(value.avatar),createdAt:Number(value.createdAt)||0,updatedAt:Number(value.updatedAt)||0});
      }catch(_){return null;}
    }
    save(name,options={}){
      const previous=this.load(),timestamp=now();
      const profile={version:1,id:previous?.id||uuid(),name:normalizeName(name),avatar:normalizeAvatar(Object.hasOwn(options,'avatar')?options.avatar:previous?.avatar),createdAt:previous?.createdAt||timestamp,updatedAt:timestamp};
      this._storage().setItem(PROFILE_KEY,JSON.stringify(profile));
      return Object.freeze({...profile});
    }
  }
class ResumeStore{
    constructor(storageProvider=()=>globalThis.localStorage){this.storageProvider=storageProvider;this.memory=new Map();}
    _key(roomId){if(typeof roomId!=='string'||!roomId||roomId.length>128)throw Error(globalThis.PlayroomMessages.text("ui.identity-store.f93e0e78a5f2"));return RESUME_KEY+'.'+roomId;}
    load(roomId){
      const key=this._key(roomId);
      let value=this.memory.get(key);
      if(!value)try{const raw=this.storageProvider?.()?.getItem(key);if(raw)value=JSON.parse(raw);}catch(_){/* Private or content:// storage can be blocked. */}
      return value?.version===1&&typeof value.participantId==='string'&&value.participantId&&resumeTokenValid(value.token)?
        {...value}:null;
    }
    save(roomId,participantId,token){
      if(typeof participantId!=='string'||!participantId||!resumeTokenValid(token))throw Error(globalThis.PlayroomMessages.text("ui.identity-store.877775cdee2e"));
      const key=this._key(roomId),value={version:1,roomId,participantId,token};
      this.memory.set(key,value);
      try{this.storageProvider?.()?.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}
    }
    remove(roomId){
      const key=this._key(roomId);this.memory.delete(key);
      try{this.storageProvider?.()?.removeItem(key);}catch(_){}
    }
  }
return Object.freeze({PROFILE_KEY,RESUME_KEY,ProfileStore,ResumeStore,secureResumeToken,resumeTokenValid,uuid,now});
});

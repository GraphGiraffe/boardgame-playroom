/* Detect an incompatible installed runtime without deleting the owner's data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomUpgradeService=api;})(globalThis,function(){
  'use strict';
  const KEY='playroom.accepted-engine-api',VERSION=4;
  const portableKey=key=>key?.startsWith('playroom.')&&!key.startsWith('playroom.network-resume.');
  function redact(value,parent=''){if(Array.isArray(value))return value.map(v=>redact(v,parent));if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!['resumeToken','previousToken','nextToken','password','accessToken','refreshToken','access_token','refresh_token'].includes(k)&&!(parent==='recovery'&&k==='tokens')).map(([k,v])=>[k,redact(v,k)]));}
  function portableValue(raw){try{const value=JSON.parse(raw),clean=redact(value);return JSON.stringify(value)===JSON.stringify(clean)?raw:JSON.stringify(clean);}catch{return raw;}}
  class UpgradeService {
    constructor(storage,payloads=storage,packs=null){this.storage=storage;this.payloads=payloads;this.packs=packs;}
    payload(key){return key==='playroom.packs.v1'&&this.packs?this.packs.get():this.payloads.getItem(key);}
    inspect(){
      if(this.storage.getItem(KEY)===String(VERSION))return false;
      try{const saved=JSON.parse(this.payload('playroom.packs.v1')||'null');return !!saved?.packs?.some(pack=>pack?.manifest?.engineApi!==VERSION)||!!saved?.quarantined?.some(pack=>pack?.bundle?.manifest?.engineApi!==VERSION);}catch(_){return false;}
    }
    export(archives={}){const entries={};for(let index=0;index<this.storage.length;index++){const key=this.storage.key(index);if(portableKey(key))entries[key]=portableValue(this.storage.getItem(key));}for(let i=0;i<this.payloads.length;i++){const key=this.payloads.key(i);if(portableKey(key))entries[key]=portableValue(this.payload(key));}return JSON.stringify({format:'playroom-before-upgrade',version:1,engineApi:VERSION,entries,archives:redact(archives)},null,2);}
    accept(){this.storage.setItem(KEY,String(VERSION));}
  }
  return UpgradeService;
});

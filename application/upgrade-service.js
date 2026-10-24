/* Detect an incompatible installed runtime without deleting the owner's data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomUpgradeService=api;})(globalThis,function(){
  'use strict';
  const KEY='playroom.accepted-engine-api',VERSION=4;
  class UpgradeService {
    constructor(storage){this.storage=storage;}
    inspect(){
      if(this.storage.getItem(KEY)===String(VERSION))return false;
      try{const saved=JSON.parse(this.storage.getItem('playroom.packs.v1')||'null');return !!saved?.packs?.some(pack=>pack?.manifest?.engineApi!==VERSION)||!!saved?.quarantined?.some(pack=>pack?.bundle?.manifest?.engineApi!==VERSION);}catch(_){return false;}
    }
    export(archives={}){const entries={};for(let index=0;index<this.storage.length;index++){const key=this.storage.key(index);if(key?.startsWith('playroom.')&&!key.startsWith('playroom.network-resume.'))entries[key]=this.storage.getItem(key);}return JSON.stringify({format:'playroom-before-upgrade',version:1,engineApi:VERSION,entries,archives},null,2);}
    accept(){this.storage.setItem(KEY,String(VERSION));}
  }
  return UpgradeService;
});

/* User-owned learning records. Pack versions never own or reset this storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomGuidePreferences=api;})(globalThis,function(){
 'use strict';
 const prefix='playroom.learning.v1.';
 class GuidePreferences {
  #storage;#user;#memory=new Map();
  constructor(storageProvider,userProvider=()=> 'default'){this.#storage=storageProvider;this.#user=userProvider;}
  #key(){return prefix+encodeURIComponent(this.#user()||'default');}
  #read(){const key=this.#key();try{const value=JSON.parse(this.#storage()?.getItem(key)||'null');if(value&&typeof value==='object'&&!Array.isArray(value)){this.#memory.set(key,value);return value;}}catch(_){}return this.#memory.get(key)||{};}
  #write(records){const key=this.#key();this.#memory.set(key,records);try{this.#storage()?.setItem(key,JSON.stringify(records));}catch(_){}}
  read(game){const row=this.#read()[game]||{};return {enabled:row.enabled!==false,prompted:row.prompted===true,epoch:Number.isSafeInteger(row.epoch)?row.epoch:0,scope:this.#key(),mastered:{...(row.mastered||{})}};}
  #change(game,change){const records=this.#read();records[game]=change(this.read(game));delete records[game].scope;this.#write(records);}
  setEnabled(game,enabled){this.#change(game,row=>({...row,enabled:!!enabled,prompted:true,epoch:row.epoch+1}));}
  learn(game,goals,expected){const row=this.read(game);if(!row.enabled||expected&&(row.epoch!==expected.epoch||row.scope!==expected.scope)||Object.entries(goals).every(([id,revision])=>row.mastered[id]===revision))return;this.#change(game,row=>({...row,mastered:{...row.mastered,...goals}}));}
  reset(game){this.#change(game,row=>({...row,enabled:true,prompted:true,mastered:{},epoch:row.epoch+1}));}
  skipped(game){return !this.read(game).enabled;}
  setSkipped(game,value){this.setEnabled(game,!value);}
 }
 return GuidePreferences;
});

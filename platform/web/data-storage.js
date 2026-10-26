/* Durable local payloads. Preferences remain in Web Storage; rules/history formats are unchanged. */
(function(root){
 'use strict';
 const PACKS='playroom.packs.v1',ACTIVE='playroom.session.v1',PREFIX='playroom.paused.v1.';
 const owned=key=>key===PACKS||key===ACTIVE||key.startsWith(PREFIX);
 const bytes=value=>new TextEncoder().encode(value).byteLength;
 class DataStorage {
  constructor({indexedDB=root.indexedDB,legacy=root.localStorage,name='playroom.data.v1'}={}){Object.assign(this,{indexedDB,legacy,name});this.values=new Map();this.queue=Promise.resolve();this.pending=0;}
  get length(){return (this.draft||this.values).size;}
  key(index){return [...(this.draft||this.values).keys()][index]??null;}
  getItem(key){return (this.draft||this.values).get(key)??null;}
  setItem(key,value){if(!this.draft)throw Error('Use a durable transaction');this.draft.set(key,String(value));}
  removeItem(key){if(!this.draft)throw Error('Use a durable transaction');this.draft.delete(key);}
  async open(){
   this.db=await new Promise((resolve,reject)=>{const r=this.indexedDB.open(this.name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('records');r.result.createObjectStore('legacy');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Хранилище занято другой вкладкой. Закройте её и повторите.'));});
   this.db.onversionchange=()=>this.db.close();
   await new Promise((resolve,reject)=>{const tx=this.db.transaction('records'),r=tx.objectStore('records').openCursor();r.onsuccess=()=>{const c=r.result;if(c){this.values.set(c.key,c.value);c.continue();}};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   // Keep the original bytes separately until read-back succeeds. Existing IDB data wins.
   const old=new Map();for(let i=0;i<this.legacy.length;i++){const key=this.legacy.key(i);if(owned(key)){const value=this.legacy.getItem(key);if(value!==null)old.set(key,value);}}
   if(old.size){
    await new Promise((resolve,reject)=>{const tx=this.db.transaction(['records','legacy'],'readwrite');for(const [key,value]of old){tx.objectStore('legacy').put(value,key);if(!this.values.has(key))tx.objectStore('records').put(value,key);}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    for(const [key,value]of old){const copied=await new Promise((resolve,reject)=>{const r=this.db.transaction('legacy').objectStore('legacy').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(copied!==value)throw Error('Не удалось проверить перенос данных');if(!this.values.has(key))this.values.set(key,value);}
    // Legacy backup is retained in IndexedDB even for invalid/incompatible saves.
    for(const [key,value]of old)if(this.legacy.getItem(key)===value)this.legacy.removeItem(key);
    // Identical copies need no permanent duplicate; conflicts retain recovery bytes.
    await new Promise((resolve,reject)=>{const tx=this.db.transaction('legacy','readwrite');for(const [key,value]of old)if(this.values.get(key)===value)tx.objectStore('legacy').delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   }
   return this;
  }
  transact(operation){
   this.pending++;
   const result=this.queue.then(async()=>{
    const draft=new Map(this.values);let value;
    this.draft=draft;try{value=operation();if(value?.then)throw Error('Storage transaction callback must be synchronous');}finally{this.draft=null;}
    const changes=[];for(const [key,raw]of draft)if(this.values.get(key)!==raw)changes.push([key,raw]);for(const key of this.values.keys())if(!draft.has(key))changes.push([key,null]);
    if(changes.length)await new Promise((resolve,reject)=>{const tx=this.db.transaction('records','readwrite'),store=tx.objectStore('records');for(const [key,raw]of changes){const read=store.get(key);read.onsuccess=()=>{if((read.result??null)!==(this.values.get(key)??null)){tx.abort();return;}raw===null?store.delete(key):store.put(raw,key);};}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));});
    this.values=draft;return value;
   });
   this.queue=result.catch(()=>{}).finally(()=>{this.pending--;});return result;
  }
  put(key,value){return this.transact(()=>this.setItem(key,value));}
  async usage(){
   await this.queue;
   let packs=0,saves=0;for(const [key,value]of this.values){if(key===PACKS)packs+=bytes(value);else saves+=bytes(value);}
   let backups=0;await new Promise((resolve,reject)=>{const tx=this.db.transaction('legacy'),r=tx.objectStore('legacy').openCursor();r.onsuccess=()=>{const c=r.result;if(c){backups+=bytes(c.value);c.continue();}};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
   return {packs,saves,backups};
  }
 }
 root.PlayroomDataStorage=DataStorage;
 if(typeof module==='object'&&module.exports)module.exports=DataStorage;
})(globalThis);

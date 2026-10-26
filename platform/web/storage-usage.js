/* On-demand payload accounting. Does not poll, decode sessions, or retain cache bodies. */
(function(root){
 'use strict';
 const bytes=value=>new TextEncoder().encode(value).byteLength;
 async function databaseSize(name){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>{r.transaction.abort();resolve(null);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(!db)return 0;let size=0;
  try{for(const name of db.objectStoreNames)await new Promise((resolve,reject)=>{const tx=db.transaction(name),r=tx.objectStore(name).openCursor();r.onsuccess=()=>{const c=r.result;if(c){size+=bytes(JSON.stringify(c.value));c.continue();}};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}return size;
 }
 async function measure(){
  const local=await root.PlayroomData.usage();let app=0,saves=local.saves+local.backups,partial=false;
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('playroom.'))app+=bytes(key)+bytes(localStorage.getItem(key)||'');}
  for(const name of ['playroom.network-host.v1','playroom.network-client-history.v1'])try{saves+=await databaseSize(name);}catch(_){partial=true;}
  try{if(root.caches)for(const name of await caches.keys())if(name.startsWith('playroom-')){const cache=await caches.open(name);for(const request of await cache.keys()){const response=await cache.match(request);if(response)app+=(await response.blob()).size;}}}catch(_){partial=true;}
  return {app,packs:local.packs,saves,total:app+local.packs+saves,partial};
 }
 function format(value){return new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(value/1024/(value>=1048576?1024:1))+(value>=1048576?' МиБ':' КиБ');}
 root.PlayroomStorageUsage={measure,format};
})(globalThis);

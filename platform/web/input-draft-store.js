/* Local selections only: no credentials, full hands, RNG or remote storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomInputDraftStore=api;})(globalThis,function(){
 'use strict';const KEY='playroom.input-drafts.v1';
 function create({storage=null,now=()=>Date.now()}={}){
  const port=()=>storage||globalThis.sessionStorage;
  function read(){try{const text=port()?.getItem(KEY);if(!text||text.length>128*1024)return [];const rows=JSON.parse(text);return Array.isArray(rows)?rows.filter(r=>typeof r.id==='string'&&r.id.length<=2048&&r.expires>now()&&typeof r.key==='string'&&r.key.length<=4096&&Array.isArray(r.actions)&&r.actions.length<=16):[];}catch{return [];}}
  function write(rows){try{const text=JSON.stringify(rows.slice(-32));if(text.length<=128*1024)port()?.setItem(KEY,text);}catch{}}
  return Object.freeze({load:id=>read().find(r=>r.id===id),save(id,value){write([...read().filter(r=>r.id!==id),{id,key:value.key,actions:value.actions,expires:now()+24*60*60*1000}]);},remove(id){write(read().filter(r=>r.id!==id));}});
 }
 return Object.freeze({create});
});

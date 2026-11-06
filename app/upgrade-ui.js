/* Explicit upgrade notice; exporting/accepting never removes archived data. */
(function(root){
  'use strict';
  async function archivedData(){
    const result={};if(!root.indexedDB)return result;
    const names=['playroom.network-host.v1','playroom.network-client-history.v1'];
    const known=typeof indexedDB.databases==='function'?new Set((await indexedDB.databases()).map(db=>db.name)):null;
    for(const name of names){
      if(known&&!known.has(name))continue;
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onupgradeneeded=()=>{request.transaction.abort();resolve(null);};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
      if(!db)continue;
      try{const stores={};for(const store of db.objectStoreNames){stores[store]=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),request=tx.objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}result[name]={version:db.version,stores};}finally{db.close();}
    }
    return result;
  }
  let current=null;
  root.PlayroomUpgradeUI={show(){
    const service=new root.PlayroomUpgradeService(root.localStorage,root.PlayroomData||root.localStorage);if(!service.inspect())return false;
    if(current&&current.frame?.state!=='disposed')return true;
    const H=root.PlayroomGameScreen,t=key=>root.PlayroomMessages.text('upgrade.'+key),dialogs=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});
    const view={frame:null,busy:false},id='upgrade-title';current=view;
    view.frame=dialogs.open(`<div class="modal-backdrop"><section class="modal upgrade-notice-modal" data-ui-surface="screen" role="dialog" aria-modal="true" aria-labelledby="${id}"><header class="modal-head"><h2 id="${id}">${H.esc(t('title'))}</h2></header><div class="modal-body"><p>${H.esc(t('detail'))}</p><p data-upgrade-error role="alert"></p></div><div class="modal-foot" data-fixed-footer><button type="button" class="btn secondary" data-upgrade-export>${H.esc(t('export'))}</button><button type="button" class="btn" data-upgrade-accept>${H.esc(t('accept'))}</button></div></section></div>`,{
      mode:'push',valid:()=>current===view&&service.inspect(),meta:{owner:'upgrade-notice',dismiss:()=>false},onDispose:()=>{if(current===view)current=null;}
    });
    if(!view.frame){current=null;return false;}
    const own=()=>current===view&&dialogs.isActive(view.frame),element=view.frame.element;
    const busy=value=>{view.busy=value;for(const button of element.querySelectorAll('button'))button.disabled=value;element.querySelector('.modal').setAttribute('aria-busy',String(value));};
    const feedback=error=>{if(own())element.querySelector('[data-upgrade-error]').textContent=root.PlayroomMessages.error(error);};
    element.addEventListener('cancel',event=>event.preventDefault());
    element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}});
    element.addEventListener('click',async event=>{
      if(!own()||view.busy)return;
      if(event.target.closest('[data-upgrade-export]')){
        busy(true);element.querySelector('[data-upgrade-error]').textContent='';
        try{
          const archives=await archivedData();if(!own())return;
          const payload=service.export(archives);if(!own())return;
          const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='playroom-before-0.18.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
        }catch(error){feedback(error);}finally{if(own())busy(false);}
      }else if(event.target.closest('[data-upgrade-accept]')){
        try{service.accept();dialogs.close(view.frame,{reason:'accept'});}catch(error){feedback(error);}
      }
    });
    return true;
  }};
})(globalThis);

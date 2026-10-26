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
  root.PlayroomUpgradeUI={show(){
    const service=new root.PlayroomUpgradeService(root.localStorage,root.PlayroomData||root.localStorage);if(!service.inspect())return false;
    const t=key=>root.PlayroomMessages.text('upgrade.'+key),dialog=document.createElement('dialog');dialog.className='appearance-dialog';
    dialog.setAttribute('aria-labelledby','upgrade-title');dialog.innerHTML='<div class="appearance-body"><h2 id="upgrade-title">'+t('title')+'</h2><p>'+t('detail')+'</p><div class="appearance-actions"><button class="btn secondary" data-upgrade-export>'+t('export')+'</button><button class="btn" data-upgrade-accept>'+t('accept')+'</button></div></div>';
    dialog.addEventListener('cancel',event=>event.preventDefault());
    dialog.addEventListener('click',async event=>{if(event.target.closest('[data-upgrade-export]')){const button=event.target.closest('button');button.disabled=true;try{const url=URL.createObjectURL(new Blob([service.export(await archivedData())],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='playroom-before-0.18.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}catch(error){root.PlayroomAppBridge?.toast?.(root.PlayroomMessages.error(error));}finally{button.disabled=false;}}if(event.target.closest('[data-upgrade-accept]')){service.accept();dialog.close();dialog.remove();}});
    document.body.append(dialog);dialog.showModal();return true;
  }};
})(globalThis);

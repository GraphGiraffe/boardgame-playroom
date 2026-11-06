if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const Pairing=root.PlayroomPairing;
  // The encrypted Pages gate may receive the browser event before this runtime
  // exists. Keep that exact event (prompt() requires a real browser invitation).
  const installHandoff=root.PlayroomInstallHandoff;
  let installPrompt=installHandoff?.prompt||null;
  if(installHandoff){installHandoff.prompt=null;delete root.PlayroomInstallHandoff;}
  function workerRequest(worker,kind,{timeout=5500,...options}={}){return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();let timer;
    const clear=()=>{clearTimeout(timer);root.removeEventListener('playroom-update-progress',progress);channel.port1.close();};
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{clear();reject(Error(root.PlayroomMessages.text('ui.pwa.16263196d581')));},timeout);};
    const progress=()=>{if(kind==='playroom-download-update'&&worker===infoWorker)arm();};
    root.addEventListener('playroom-update-progress',progress);arm();
    channel.port1.onmessage=event=>{clear();resolve(event.data);};
    try{worker.postMessage({kind,...options},[channel.port2]);}catch(error){clear();reject(error);}
  });}
  const updates=new root.PlayroomPwaUpdateCoordinator({request:worker=>workerRequest(worker,'playroom-activate-update',{manual:true})});
  const pairListeners=new Set(),pairQueue=[];
  const secure=location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  function validToken(token){try{Pairing.decode(token);return true;}catch(_){return false;}}
  function emitPair(token){
    if(!token||!validToken(token))return false;
    if(pairListeners.size){for(const listener of pairListeners)listener(token);}
    else if(!pairQueue.includes(token))pairQueue.push(token);
    return true;
  }
  function subscribePair(listener){
    if(typeof listener!=='function')throw Error(globalThis.PlayroomMessages.text("ui.pwa.a5afa4158796"));
    pairListeners.add(listener);
    while(pairQueue.length)listener(pairQueue.shift());
    return ()=>pairListeners.delete(listener);
  }
  function cleanUrl(){
    const url=new URL(location.href);let changed=false;
    for(const key of ['pair','protocol','share-target','title','text','url'])if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true;}
    if(changed)history.replaceState(history.state,'',url.pathname+(url.search||'')+(url.hash||''));
  }
  function tokenFromUrl(href){
    let url;try{url=new URL(href,location.href);}catch(_){return null;}
    const values=[url.searchParams.get('pair'),url.searchParams.get('protocol'),url.searchParams.get('text'),url.searchParams.get('url')];
    for(const value of values){
      if(!value)continue;
      let decoded=value;try{decoded=decodeURIComponent(value);}catch(_){}
      const token=Pairing.extract(decoded)||Pairing.extract(value);
      if(token)return token;
    }
    return null;
  }
  function pairingUrl(token){
    Pairing.decode(token);
    if(location.protocol==='http:'||location.protocol==='https:'){
      const url=new URL('./',location.href);url.search='';url.hash='';url.searchParams.set('pair',token);return url.href;
    }
    return Pairing.protocolUrl(token);
  }
  function sharePayload(token){
    const value=Pairing.decode(token);
    const data={title:value.kind==='offer'?globalThis.PlayroomMessages.text("ui.pwa.13f53907b42d"):globalThis.PlayroomMessages.text("ui.pwa.e8542cfb3224"),text:Pairing.shareText(token)};
    // Android content:// and file:// may expose navigator.share yet refuse the
    // web+playroom URL. Only offer the system action on a secure, stable origin.
    if(location.protocol==='http:'||location.protocol==='https:')data.url=pairingUrl(token);
    return data;
  }
  function canShare(token=null){
    if(!secure||!root.isSecureContext||typeof navigator.share!=='function')return false;
    // Check the exact payload (including long PR2). Some Android browsers
    // expose the API but reject a particular URL/text combination.
    const data=token?sharePayload(token):{text:globalThis.PlayroomMessages.text("ui.pwa.74ea78921c0c")};
    try{return typeof navigator.canShare!=='function'||navigator.canShare(data);}catch(_){return false;}
  }
  async function shareToken(token){
    if(!canShare(token))throw Error(globalThis.PlayroomMessages.text("ui.pwa.f59b68edf77d"));
    await navigator.share(sharePayload(token));
  }
  async function install(){
    if(!installPrompt)throw Error(globalThis.PlayroomMessages.text("ui.pwa.30950cf49d2a"));
    const event=installPrompt;installPrompt=null;root.dispatchEvent(new Event('playroom-install-state'));await event.prompt();return event.userChoice;
  }
  let updateInfo=null,infoWorker=null,downloadJob=null,announceJob=null;
  function receiveUpdateState(worker,data){
    if(worker!==infoWorker||data?.version&&updateInfo?.version&&data.version!==updateInfo.version||!data?.download)return;
    updateInfo={...updateInfo,download:data.download};root.dispatchEvent(new CustomEvent('playroom-update-progress'));
  }
  const announceUpdate=worker=>{
    if(!worker)return Promise.resolve();
    if(infoWorker===worker)return announceJob||Promise.resolve();
    infoWorker=worker;downloadJob=null;announceJob=null;if(!updates.announce(worker))return Promise.resolve();
    const task=(async()=>{
      let info;try{info=await workerRequest(worker,'playroom-update-info',{timeout:2500});}catch{info={};}
      if(infoWorker!==worker)return;
      updateInfo={...info,download:info.download||{phase:info.version?'ready':'available',received:0,total:0}};
      root.dispatchEvent(new CustomEvent('playroom-update-ready'));
    })();
    announceJob=task;const clear=()=>{if(announceJob===task)announceJob=null;};task.then(clear,clear);return task;
  };
  async function downloadUpdate(){
    if(downloadJob)return downloadJob;if(!infoWorker)throw Error('UPDATE_NOT_READY');
    const worker=infoWorker;receiveUpdateState(worker,{download:{...updateInfo.download,phase:'downloading',error:null}});
    downloadJob=(async()=>{try{
      const result=await workerRequest(worker,'playroom-download-update',{timeout:180000});
      if(worker!==infoWorker)throw Object.assign(Error('UPDATE_CHANGED'),{code:'update-changed'});receiveUpdateState(worker,result);
      if(!result?.ok)throw Error(root.PlayroomUpdateDialog.errorText(result?.download?.error));return result;
    }catch(error){if(worker===infoWorker){receiveUpdateState(worker,{download:{...updateInfo.download,phase:'paused',error:updateInfo.download.error||{code:'network'}}});}throw error;}
    finally{if(worker===infoWorker)downloadJob=null;}})();return downloadJob;
  }
  const setUpdateGuard=guard=>updates.setGuard(guard),releaseUpdate=()=>updates.release();
  const checkUpdate=port=>port?.postMessage({kind:updates.reserve()?'playroom-update-idle':'playroom-update-busy'});
  for(const type of ['click','submit','keydown'])document.addEventListener(type,event=>{
    if(updates.locked){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  const receiptKey='playroom.after-update.v1';
  function updateReceipt(){const rows=root.PlayroomPacks?.list?.()||[];return {from:root.PlayroomAppVersion||'0.0.0',to:updateInfo?.version,cache:updateInfo?.cache,releases:updateInfo?.releases||[],packs:rows.filter(p=>!rows.some(other=>other.id===p.id&&root.TabletopPacks.compareVersions(other.version,p.version)>0)).map(p=>({id:p.id,version:p.version}))};}
  function reloadUpdatedDocument(){if(root.__playroomUpdateReloading)return;try{if(updateInfo?.version&&!root.sessionStorage.getItem(receiptKey))root.sessionStorage.setItem(receiptKey,JSON.stringify(updateReceipt()));}catch(_){}root.__playroomUpdateReloading=true;location.reload();}
  async function activateUpdate(){
    if(updateInfo?.download?.phase!=='ready')throw Error('Сначала загрузите обновление.');
    const before=root.sessionStorage.getItem(receiptKey),receipt=JSON.stringify(updateReceipt());root.sessionStorage.setItem(receiptKey,receipt);
    let result;const worker=infoWorker;try{result=await updates.activate();}catch(error){if(root.sessionStorage.getItem(receiptKey)===receipt){if(before===null)root.sessionStorage.removeItem(receiptKey);else root.sessionStorage.setItem(receiptKey,before);}throw error;}

    // Another window may already have activated this worker, or Android may
    // miss controllerchange. Observe its state locally; never reload early.
    let timer=null;
    const check=()=>{
      if(root.__playroomUpdateReloading){clearTimeout(timer);worker.removeEventListener?.('statechange',check);return;}
      if(worker.state==='activated'){clearTimeout(timer);worker.removeEventListener?.('statechange',check);reloadUpdatedDocument();return;}
      if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener?.('statechange',check);return;}
      clearTimeout(timer);timer=setTimeout(check,500);
    };
    worker.addEventListener?.('statechange',check);check();return result;
  }
  let installationObserved=false,relatedInstalled=false,installationCheck=null,installationRevision=0;
  const standaloneMode=matchMedia('(display-mode: standalone)');
  const manifestUrl=()=>{const url=new URL(document.querySelector?.('link[rel="manifest"]')?.href||'./manifest.webmanifest',location.href);url.username='';url.password='';url.hash='';return url.href;};
  async function refreshInstallation(){
    if(!secure||typeof navigator.getInstalledRelatedApps!=='function')return false;
    if(installationCheck)return installationCheck;
    const revision=installationRevision;
    installationCheck=Promise.resolve().then(()=>navigator.getInstalledRelatedApps()).then(apps=>{
      if(revision!==installationRevision)return relatedInstalled;
      const url=manifestUrl(),id=new URL('/playroom',url).href;
      const installed=Array.isArray(apps)&&apps.some(app=>{
        if(app?.platform!=='webapp'||!app.url)return false;
        try{return new URL(app.url,url).href===url&&(!app.id||new URL(app.id,url).href===id);}catch{return false;}
      });
      const changed=relatedInstalled!==installed;relatedInstalled=installed;
      if(installed)installPrompt=null;
      if(changed)root.dispatchEvent(new Event('playroom-install-state'));
      return installed;
    }).catch(()=>relatedInstalled).finally(()=>{installationCheck=null;if(revision!==installationRevision)void refreshInstallation();});
    return installationCheck;
  }
  root.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installationRevision++;installationObserved=false;relatedInstalled=false;installPrompt=event;root.dispatchEvent(new Event('playroom-install-available'));});
  root.addEventListener('appinstalled',()=>{installationRevision++;installPrompt=null;installationObserved=true;root.dispatchEvent(new Event('playroom-installed'));void refreshInstallation();});
  standaloneMode.addEventListener?.('change',()=>root.dispatchEvent(new Event('playroom-install-state')));
  root.addEventListener('focus',()=>{void refreshInstallation();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshInstallation();});
  function installState(){
    const standalone=standaloneMode.matches||navigator.standalone===true;
    if(standalone||installationObserved||relatedInstalled)return {mode:'installed',standalone,launchable:relatedInstalled&&!standalone};
    if(!secure)return {mode:'insecure',standalone:false};
    if(installPrompt)return {mode:'native',standalone:false};
    const ua=navigator.userAgent||'',platform=navigator.platform||'',ios=/iPhone|iPad|iPod/.test(ua)||platform==='MacIntel'&&navigator.maxTouchPoints>1;
    return {mode:ios?'ios':'manual',standalone:false,mac:!ios&&/Mac/.test(platform||ua)};
  }
  void refreshInstallation();
  let registrationReady=Promise.resolve(null);
  async function checkForUpdate(){
    if(navigator.onLine===false)throw Object.assign(Error('Нет сети. Подключитесь и повторите проверку.'),{code:'offline'});
    if(updates.started||updates.locked)throw Object.assign(Error('Дождитесь завершения установки.'),{code:'busy'});
    const registration=await registrationReady;
    if(!registration)throw Object.assign(Error('Проверка обновлений недоступна в этом браузере.'),{code:'unavailable'});
    await registration.update();
    const worker=registration.installing;
    if(worker&&!['installed','activated','redundant'].includes(worker.state))await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
      const changed=()=>{if(['installed','activated','redundant'].includes(worker.state))finish();};
      const timer=setTimeout(()=>finish(Object.assign(Error('Проверка заняла слишком много времени. Повторите её.'),{code:'timeout'})),12000);
      worker.addEventListener('statechange',changed);changed();
    });
    if(worker?.state==='redundant'&&!registration.waiting&&!updateInfo)throw Object.assign(Error('Не удалось проверить новую версию. Повторите проверку.'),{code:'network'});
    if(registration.waiting&&navigator.serviceWorker.controller)await announceUpdate(registration.waiting);
    return {available:!!updateInfo};
  }
  if('serviceWorker' in navigator&&secure){
    registrationReady=navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
      if(registration.waiting&&navigator.serviceWorker.controller)announceUpdate(registration.waiting);
      registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',()=>{
        if(registration.waiting&&navigator.serviceWorker.controller)announceUpdate(registration.waiting);
      }));
      let checking=false;
      const refresh=async()=>{
        if(checking||document.hidden||updates.started||updates.locked)return;
        checking=true;
        try{await registration.update();}catch(_){}finally{checking=false;}
      };
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
      root.addEventListener('focus',()=>{void refresh();});
      setInterval(()=>{void refresh();},15*60*1000);
      return registration;
    }).catch(()=>null);
    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.kind==='playroom-pair-token')emitPair(event.data.token);
      if(event.data?.kind==='playroom-update-ready')navigator.serviceWorker.getRegistration().then(registration=>announceUpdate(registration?.waiting)).catch(()=>{});
      if(event.data?.kind==='playroom-update-progress')receiveUpdateState(event.source,event.data);
      if(event.data?.kind==='playroom-update-check')checkUpdate(event.ports?.[0]);
      if(event.data?.kind==='playroom-update-release')releaseUpdate();
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updates.started||updates.locked)reloadUpdatedDocument();});
  }
  if(root.launchQueue?.setConsumer)root.launchQueue.setConsumer(params=>emitPair(tokenFromUrl(params?.targetURL||'')));
  const incoming=tokenFromUrl(location.href);if(incoming){emitPair(incoming);cleanUrl();}
  root.PlayroomPWA=Object.freeze({
    get updateInfo(){return updateInfo;},
    secure,
    get standalone(){return standaloneMode.matches||navigator.standalone===true;},
    installState,refreshInstallation,
    canShare,
    canInstall:()=>!!installPrompt,
    shareToken,install,pairingUrl,tokenFromUrl,subscribePair,setUpdateGuard,checkForUpdate,downloadUpdate,activateUpdate,isUpdateLocked:()=>updates.locked,
    protocolUrl:Pairing.protocolUrl
  });
})(globalThis);

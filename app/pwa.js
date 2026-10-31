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
    const event=installPrompt;installPrompt=null;await event.prompt();return event.userChoice;
  }
  let updateInfo=null,infoWorker=null,downloadJob=null;
  function receiveUpdateState(worker,data){
    if(worker!==infoWorker||data?.version&&updateInfo?.version&&data.version!==updateInfo.version||!data?.download)return;
    updateInfo={...updateInfo,download:data.download};root.dispatchEvent(new CustomEvent('playroom-update-progress'));
  }
  const announceUpdate=async worker=>{
    if(!worker||infoWorker===worker)return;infoWorker=worker;downloadJob=null;if(!updates.announce(worker))return;
    let info;try{info=await workerRequest(worker,'playroom-update-info',{timeout:2500});}catch{info={};}
    if(infoWorker!==worker)return;
    updateInfo={...info,download:info.download||{phase:info.version?'ready':'available',received:0,total:0}};
    root.dispatchEvent(new CustomEvent('playroom-update-ready'));
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
  function reloadUpdatedDocument(){if(root.__playroomUpdateReloading)return;root.__playroomUpdateReloading=true;location.reload();}
  async function activateUpdate(){
    if(updateInfo?.download?.phase!=='ready')throw Error('Сначала загрузите обновление.');
    const worker=infoWorker,result=await updates.activate();
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
  root.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;root.dispatchEvent(new Event('playroom-install-available'));});
  root.addEventListener('appinstalled',()=>{installPrompt=null;root.dispatchEvent(new Event('playroom-installed'));});
  if('serviceWorker' in navigator&&secure){
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
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
    }).catch(()=>{});
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
    standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
    canShare,
    canInstall:()=>!!installPrompt,
    shareToken,install,pairingUrl,tokenFromUrl,subscribePair,setUpdateGuard,downloadUpdate,activateUpdate,isUpdateLocked:()=>updates.locked,
    protocolUrl:Pairing.protocolUrl
  });
})(globalThis);

if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const Pairing=root.PlayroomPairing;
  let installPrompt=null;
  const updates=new root.PlayroomPwaUpdateCoordinator({request:worker=>new Promise((resolve,reject)=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error(globalThis.PlayroomMessages.text("ui.pwa.16263196d581")));},5500);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
    worker.postMessage({kind:'playroom-activate-update'},[channel.port2]);
  })});
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
  let updateInfo=null,infoWorker=null;
  const announceUpdate=async worker=>{
    if(!worker||infoWorker===worker)return;
    infoWorker=worker;if(!updates.announce(worker))return;
    const info=await new Promise(resolve=>{
      const channel=new MessageChannel();
      const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
      const timer=setTimeout(()=>finish({}),2000);
      channel.port1.onmessage=event=>finish(event.data||{});
      try{worker.postMessage({kind:'playroom-update-info'},[channel.port2]);}catch(_){finish({});}
    });
    if(infoWorker!==worker)return;
    updateInfo=info;root.dispatchEvent(new CustomEvent('playroom-update-ready'));
  };
  const setUpdateGuard=guard=>updates.setGuard(guard),releaseUpdate=()=>updates.release();
  const checkUpdate=port=>port?.postMessage({kind:updates.reserve()?'playroom-update-idle':'playroom-update-busy'});
  for(const type of ['click','submit','keydown'])document.addEventListener(type,event=>{
    if(updates.locked){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  const activateUpdate=()=>updates.activate();
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
        if(checking||document.hidden||registration.waiting)return;
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
      if(event.data?.kind==='playroom-update-check')checkUpdate(event.ports?.[0]);
      if(event.data?.kind==='playroom-update-release')releaseUpdate();
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if((updates.started||updates.locked)&&!root.__playroomUpdateReloading){root.__playroomUpdateReloading=true;location.reload();}});
  }
  if(root.launchQueue?.setConsumer)root.launchQueue.setConsumer(params=>emitPair(tokenFromUrl(params?.targetURL||'')));
  const incoming=tokenFromUrl(location.href);if(incoming){emitPair(incoming);cleanUrl();}
  root.PlayroomPWA=Object.freeze({
    get updateInfo(){return updateInfo;},
    secure,
    standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
    canShare,
    canInstall:()=>!!installPrompt,
    shareToken,install,pairingUrl,tokenFromUrl,subscribePair,setUpdateGuard,activateUpdate,isUpdateLocked:()=>updates.locked,
    protocolUrl:Pairing.protocolUrl
  });
})(globalThis);

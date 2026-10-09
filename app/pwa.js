(function(root){
  'use strict';
  const Pairing=root.PlayroomPairing;
  let installPrompt=null;
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
    if(typeof listener!=='function')throw Error('Нужен обработчик pairing.');
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
    const data={title:value.kind==='offer'?'ХОД · приглашение в игру':'ХОД · ответ на приглашение',text:Pairing.shareText(token)};
    // Android content:// and file:// may expose navigator.share yet refuse the
    // web+playroom URL. Only offer the system action on a secure, stable origin.
    if(location.protocol==='http:'||location.protocol==='https:')data.url=pairingUrl(token);
    return data;
  }
  function canShare(token=null){
    if(!secure||!root.isSecureContext||typeof navigator.share!=='function')return false;
    // Check the exact payload (including long PR2). Some Android browsers
    // expose the API but reject a particular URL/text combination.
    const data=token?sharePayload(token):{text:'ХОД · приглашение'};
    try{return typeof navigator.canShare!=='function'||navigator.canShare(data);}catch(_){return false;}
  }
  async function shareToken(token){
    if(!canShare(token))throw Error('Системное меню обмена на этой странице недоступно. Используйте QR или текст.');
    await navigator.share(sharePayload(token));
  }
  async function install(){
    if(!installPrompt)throw Error('Установка PWA сейчас недоступна. Откройте меню браузера → «Установить приложение».');
    const event=installPrompt;installPrompt=null;await event.prompt();return event.userChoice;
  }
  root.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;root.dispatchEvent(new Event('playroom-install-available'));});
  root.addEventListener('appinstalled',()=>{installPrompt=null;root.dispatchEvent(new Event('playroom-installed'));});
  if('serviceWorker' in navigator&&secure){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
    navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.kind==='playroom-pair-token')emitPair(event.data.token);});
  }
  if(root.launchQueue?.setConsumer)root.launchQueue.setConsumer(params=>emitPair(tokenFromUrl(params?.targetURL||'')));
  const incoming=tokenFromUrl(location.href);if(incoming){emitPair(incoming);cleanUrl();}
  root.PlayroomPWA=Object.freeze({
    secure,
    standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
    canShare,
    canInstall:()=>!!installPrompt,
    shareToken,install,pairingUrl,tokenFromUrl,subscribePair,
    protocolUrl:Pairing.protocolUrl
  });
})(globalThis);

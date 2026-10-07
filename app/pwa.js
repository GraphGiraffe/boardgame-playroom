(function(root){
  'use strict';
  const Pairing=root.PlayroomPairing;
  const PENDING='playroom.pending-pair-token.v2';
  let installPrompt=null;
  const secure=location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  function remember(token){
    if(!token)return false;
    try{Pairing.decode(token);sessionStorage.setItem(PENDING,token);return true;}catch(_){return false;}
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
  function incomingFromLocation(){
    const token=tokenFromUrl(location.href);if(token&&remember(token)){cleanUrl();return token;}return null;
  }
  function dispatch(token){
    if(!token)return;
    setTimeout(()=>root.dispatchEvent(new CustomEvent('playroom-pair-token',{detail:{token}})),0);
  }
  function consumePending(){
    const token=sessionStorage.getItem(PENDING);if(token)sessionStorage.removeItem(PENDING);return token;
  }
  function pairingUrl(token){
    Pairing.decode(token);
    if(location.protocol==='http:'||location.protocol==='https:'){
      const url=new URL('./',location.href);url.search='';url.hash='';url.searchParams.set('pair',token);return url.href;
    }
    return Pairing.protocolUrl(token);
  }
  async function shareToken(token){
    const value=Pairing.decode(token),data={title:value.kind==='offer'?'ХОД · приглашение в игру':'ХОД · ответ на приглашение',text:Pairing.shareText(token),url:pairingUrl(token)};
    if(typeof navigator.share!=='function')throw Error('Системное «Поделиться» не поддерживается этим браузером.');
    if(typeof navigator.canShare==='function'&&!navigator.canShare(data))throw Error('Браузер не может передать это приглашение через системное меню.');
    await navigator.share(data);
  }
  async function install(){
    if(!installPrompt)throw Error('Установка PWA сейчас недоступна. Откройте меню браузера → «Установить приложение».');
    const event=installPrompt;installPrompt=null;await event.prompt();return event.userChoice;
  }
  root.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;root.dispatchEvent(new Event('playroom-install-available'));});
  root.addEventListener('appinstalled',()=>{installPrompt=null;root.dispatchEvent(new Event('playroom-installed'));});
  if('serviceWorker' in navigator&&secure){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.kind!=='playroom-pair-token')return;
      const token=event.data.token;if(remember(token))dispatch(token);
    });
  }
  if(root.launchQueue?.setConsumer)root.launchQueue.setConsumer(params=>{
    const token=tokenFromUrl(params?.targetURL||'');if(token&&remember(token))dispatch(token);
  });
  const incoming=incomingFromLocation();
  root.PlayroomPWA=Object.freeze({
    secure,
    standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
    canShare:()=>typeof navigator.share==='function',
    canInstall:()=>!!installPrompt,
    shareToken,install,consumePending,pairingUrl,tokenFromUrl,
    protocolUrl:Pairing.protocolUrl
  });
  dispatch(incoming);
})(globalThis);

/* Browser subscription/worker port. No auth credentials are sent to the worker. */
(function(root){
 'use strict';
 const error=code=>Object.assign(Error(code),{code});
 function supported(){return !!(['https:','http:'].includes(root.location.protocol)&&root.isSecureContext&&root.Notification&&root.PushManager&&root.navigator.serviceWorker);}
 async function registration(){if(!supported())throw error('unsupported');const r=await navigator.serviceWorker.getRegistration();if(!r?.active)throw error('pwa-required');return r;}
 async function sendMessage(data){const r=await registration();return new Promise((resolve,reject)=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();reject(error('worker-timeout'));},3000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();e.data?.error?reject(error('storage')):resolve(e.data);};r.active.postMessage(data,[c.port2]);});}
 let messages=Promise.resolve();
 function message(data){const result=messages.catch(()=>{}).then(()=>sendMessage(data));messages=result;return result;}
 async function subscription(){
  if(!supported())throw error('unsupported');
  // An existing subscription requires granted permission. Avoid probing the
  // native push service before consent, including on first worker control.
  if(root.Notification.permission!=='granted')return null;
  return (await registration()).pushManager.getSubscription();
 }
 async function subscribe(publicKey){
  const permission=await Notification.requestPermission();if(permission!=='granted')throw error('permission');
  const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const r=await registration();let sub=await r.pushManager.getSubscription();
  const old=sub?.options?.applicationServerKey;
  if(sub&&old&&!equal(new Uint8Array(old),bytes)){await sub.unsubscribe();sub=null;}
  return sub||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
 }
 function equal(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i]);}
 root.PlayroomPushDevice=Object.freeze({supported,subscription,subscribe,message,permission:()=>supported()?Notification.permission:'unsupported'});
})(globalThis);

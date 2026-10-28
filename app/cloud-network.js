/* Web wiring: opt-in cloud rendezvous, existing RTC/game UI, no game rules. */
(function(root){
 'use strict';
 let account,driver,target=null,connecting=false,expectedId=null,retryTimer=null;
 const t=key=>root.PlayroomMessages.text('ui.social.'+key),B=()=>root.PlayroomAppBridge;
 function init({account:service,remote}){
  account=service;
  driver=new root.PlayroomCloudSignaling({remote:(action,data)=>remote.call(action,data,{userId:expectedId}),idFactory:()=>root.crypto.randomUUID(),
   peers:{host:options=>root.PlayroomNetworkLibrary.cloudHostPeer(options),client:offer=>root.PlayroomWebRTCTransport.createClientPeer(offer),attach:(peer,id)=>root.PlayroomNetworkLibrary.cloudAttachClient(peer,id)},
   report:state=>{const label=document.querySelector('[data-cloud-status]');if(label)label.textContent=t(state.state==='error'?'cloud-retrying':'cloud-hosting');}});
  let identity=account.snapshot().id;account.subscribe(()=>{if(identity!==account.snapshot().id){identity=account.snapshot().id;stop();}});
 }
 function ready(){const s=account.snapshot();if(!driver||!s.configured||s.kind==='local'||s.recovery)throw Object.assign(Error('account-required'),{code:'account-required'});expectedId=s.id;}
 async function host(roomId){ready();if(!root.PlayroomNetworkLibrary.canCloudHost())throw Object.assign(Error('lobby-required'),{code:'lobby-required'});target=null;await driver.host(roomId,B().room().id);}
 async function connect(roomId){
  ready();if(connecting)return;connecting=true;target={roomId,userId:expectedId};
  try{await driver.connect(roomId);}catch(error){if(error.code!=='cancelled')throw error;}finally{connecting=false;}
 }
 function reconnect(){if(!target||connecting||retryTimer||target.userId!==account.snapshot().id)return;const current=target;void connect(current.roomId).catch(error=>{if(!target||target.userId!==current.userId||target.roomId!==current.roomId)return;if(['network','host-offline','unavailable'].includes(error.code)){retryTimer=root.setTimeout(()=>{retryTimer=null;reconnect();},3000);}else B().toast(t('error.'+(['setup'].includes(error.code)?error.code:'request')));});}
 function stop(){target=null;root.clearTimeout(retryTimer);retryTimer=null;driver?.stop();}
 root.addEventListener('pagehide',stop);
 root.PlayroomCloudNetwork=Object.freeze({init,host,connect,reconnect,isHosting:()=>driver?.mode==='host',stop,stopHost:()=>{if(driver?.mode==='host')stop();},stopClient:()=>{if(driver?.mode==='client')stop();}});
})(globalThis);

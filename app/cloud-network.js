/* Web wiring: opt-in cloud rendezvous, existing RTC/game UI, no game rules. */
(function(root){
 'use strict';
 let account,driver,target=null,connecting=false,expectedId=null,retryTimer=null,hosting=null,connectFlight=null,connectSequence=0;
 const t=key=>root.PlayroomMessages.text('ui.social.'+key),B=()=>root.PlayroomAppBridge;
 function init({account:service,remote}){
  account=service;
  driver=new root.PlayroomCloudSignaling({remote:(action,data)=>remote.call(action,data,{userId:expectedId}),idFactory:()=>root.crypto.randomUUID(),
   peers:{host:options=>root.PlayroomNetworkLibrary.cloudHostPeer(options),client:offer=>root.PlayroomWebRTCTransport.createClientPeer(offer),attach:(peer,id,options)=>root.PlayroomNetworkLibrary.cloudAttachClient(peer,id,options)},
   report:state=>{const label=document.querySelector('[data-cloud-status]');if(label)label.textContent=t(state.state==='error'?'cloud-retrying':'cloud-hosting');}});
  let identity=account.snapshot().id;account.subscribe(()=>{if(identity!==account.snapshot().id){identity=account.snapshot().id;stop();}});
 }
 function ready(){const s=account.snapshot();if(!driver||!s.configured||s.kind!=='account'||s.recovery)throw Object.assign(Error('account-required'),{code:'account-required'});expectedId=s.id;}
 async function host(roomId){ready();if(driver.mode==='host'&&hosting?.cloud===roomId&&hosting?.local===B().room()?.id)return;if(!root.PlayroomNetworkLibrary.canCloudHost())throw Object.assign(Error('lobby-required'),{code:'lobby-required'});target=null;await root.PlayroomHostTransferUI?.cancelStale(roomId);await driver.host(roomId,B().room().id);hosting={cloud:roomId,local:B().room().id};}
 function connect(roomId,{background=false}={}){
  ready();const network=root.PlayroomNetworkLibrary,activeId=hosting?.cloud||target?.roomId;if(network.hasActiveRoom?.()){if(activeId!==roomId)throw Object.assign(Error('room-active'),{code:'room-active'});if(network.chatContext?.()?.connected)return Promise.resolve(background?undefined:(network.enterActiveRoom||network.openRoom)());}
  if(connecting&&target?.roomId===roomId&&target.userId===expectedId)return background?connectFlight:connectFlight.then(()=>{if(network.chatContext?.()?.connected)(network.enterActiveRoom||network.openRoom)();});
  const ticket=++connectSequence;connecting=true;target={roomId,userId:expectedId};
  connectFlight=(async()=>{let timer;try{await Promise.race([driver.connect(roomId,{background}),new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(Object.assign(Error('connection-timeout'),{code:'connection-timeout'})),45000);})]);}catch(error){if(ticket===connectSequence)driver.stop();throw error;}finally{root.clearTimeout(timer);if(ticket===connectSequence){connecting=false;connectFlight=null;}}})();return connectFlight;
 }
 function reconnect(){if(!target||connecting||retryTimer||target.userId!==account.snapshot().id)return;const current=target;void connect(current.roomId,{background:true}).catch(error=>{if(!target||target.userId!==current.userId||target.roomId!==current.roomId)return;if(!error.code||['network','host-offline','unavailable','connection-timeout','transport-timeout','transport-closed'].includes(error.code)){retryTimer=root.setTimeout(()=>{retryTimer=null;reconnect();},3000);}else B().toast(t('error.'+(['setup'].includes(error.code)?error.code:'request')));});}
 function roomClosed(roomId){if(!roomId||roomId!==(hosting?.cloud||target?.roomId))return;stop();root.PlayroomNetworkLibrary.closeCloudRoom?.();B().closeModal(true);B().showHub();B().toast('Комната закрыта.');}
 function stop(){connectSequence++;connecting=false;connectFlight=null;target=null;hosting=null;root.clearTimeout(retryTimer);retryTimer=null;driver?.stop();}
 root.addEventListener('pagehide',stop);
 root.PlayroomCloudNetwork=Object.freeze({init,host,connect,reconnect,roomClosed,isHosting:()=>driver?.mode==='host',active:()=>!!driver?.mode,roomId:()=>hosting?.cloud||target?.roomId||null,stop,adoptClient:roomId=>{ready();target={roomId,userId:expectedId};driver.mode='client';},releaseHost:()=>{driver?.releaseHost();hosting=null;target=null;},stopHost:()=>{if(driver?.mode==='host')stop();},stopClient:()=>{if(driver?.mode==='client')stop();}});
})(globalThis);

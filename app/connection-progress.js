/* Connection UI reflects ICE observations; no raw SDP/candidates enter this model. */
(function(root){
 'use strict';
 const names={direct:'Напрямую',stun:'Прямое соединение (STUN)',turn:'Через ретранслятор (TURN)',unknown:'WebRTC'},labels={searching:'Поиск адресов…',available:'Адрес найден',checking:'Проверяется…',selected:'Соединено',unused:'Не потребовалось',unavailable:'Недоступно'};
 function create({roomId=null,role='client',visible=false}={}){
  const started=Date.now(),id=root.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);}),userId=root.PlayroomAccountUI?.service?.snapshot().id,events=[];
  let ended=false,cancelled=false,config={},latest={stage:'preparing',direct:'searching',stun:roomId?'searching':'unavailable',turn:roomId?'searching':'unavailable'};
  const paint=()=>{if(!visible)return;const el=document.querySelector('[data-connection-progress]');if(!el)return;const H=root.PlayroomGameScreen;
   el.innerHTML='<p>'+({preparing:'Подготавливаем соединение…',rendezvous:'Ожидаем ответ хоста…',admitting:'Входим в комнату…',credentials:'Получаем доступ к ретранслятору…',gathering:'Ищем доступные маршруты…',checking:'Проверяем соединение…',connected:'Соединение установлено',failed:'Не удалось подключиться',cancelled:'Подключение отменено'}[latest.stage]||'Подключение…')+'</p>'+['direct','stun','turn'].filter(k=>roomId||k==='direct').map(k=>'<div class="connection-method" data-method="'+k+'"><span>'+names[k]+'</span><span>'+ (latest[k]==='selected'?H.icon('check'):'')+labels[latest[k]]+'</span></div>').join('')+(latest.stage==='connected'?'<p class="connection-success">'+H.icon('check')+' '+names[latest.method||'unknown']+(latest.protocol?' · '+latest.protocol.toUpperCase():'')+'</p>':'');
  };
  const update=value=>{if(ended)return;const next={...latest,...value};if(JSON.stringify(next)===JSON.stringify(latest)&&events.length)return;latest=next;if(events.length>=47)events.splice(1,1);events.push({...latest,at:Math.min(180000,Date.now()-started)});paint();};
  const finish=(result,value={})=>{if(ended)return;update({stage:result,...value});ended=true;if(config.diagnosticsEnabled!==false)void root.PlayroomIceConfig?.trace({p_room_id:roomId,p_attempt_id:id,p_mode:roomId?'online':'network',p_role:role,p_result:result,p_events:events},userId);};
  update({});
  return {update,paint,cancel(){cancelled=true;finish('cancelled',{code:'cancelled'});},fail(error){finish('failed',{code:['turn-setup','turn-auth','turn-network','connection-timeout','transport-closed','transport-timeout','host-offline','forbidden','account-required','account-changed','room-active','not-found','network','ice-failed'].includes(error?.code)?error.code:'unknown'});},
   async options(){if(!roomId)return {onProgress:update};update({stage:'credentials'});config=await root.PlayroomIceConfig.credentials(roomId);if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});if(config.code)update({turn:'unavailable',code:config.code});return {configuration:config.configuration,gatherTimeout:12000,allowPartial:true,onProgress:update};},
   async connected(peer,{delay=false}={}){if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});const route=await root.PlayroomWebRTCTransport.selectedMethod(peer.pc).catch(()=>({method:'unknown'}));if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});const status={};for(const k of ['direct','stun','turn'])status[k]=route.method===k?'selected':latest[k]==='unavailable'?'unavailable':'unused';finish('connected',{...status,...route});if(delay)await new Promise(resolve=>root.setTimeout(resolve,500));if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});}
  };
 }
 root.PlayroomConnectionProgress=Object.freeze({create});
})(globalThis);

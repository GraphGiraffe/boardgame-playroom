/* ICE observations are presentation data. SDP, credentials and addresses stay out of this view. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,states=new WeakMap();let feedbackSequence=0;
 const methodNames={direct:'Прямой канал',stun:'Прямое соединение · STUN',turn:'Ретранслятор · TURN',unknown:'WebRTC · маршрут не определён'},shortNames={direct:'прямой канал',stun:'STUN',turn:'TURN'};
 const stages={locating:'Ищем комнату',preparing:'Подготавливаем соединение…',rendezvous:'Ожидаем ответ хоста…',credentials:'Получаем доступ к TURN…',gathering:'Ищем доступные адреса…',checking:'Проверяем соединение…',admitting:'Входим в комнату…'};
 const errors={
  'connection-timeout':'Хост не ответил вовремя. Проверьте интернет и попробуйте ещё раз.',
  'host-offline':'Хост пока не в сети. Попросите его открыть комнату и повторите подключение.',
  'not-found':'Комната не найдена или закрыта. Проверьте приглашение.',
  forbidden:'Вход недоступен. Проверьте приглашение или разрешение хоста.',
  'account-required':'Для входа в онлайн-комнату нужен облачный аккаунт.',
  'account-changed':'Аккаунт изменился. Откройте приглашение заново.',
  'room-active':'Сначала вернитесь в текущую комнату или выйдите из неё.',
  'turn-setup':'Ретранслятор недоступен. Повторите подключение.',
  'turn-auth':'Не удалось получить доступ к ретранслятору. Повторите подключение.',
  'turn-network':'Не удалось связаться с ретранслятором. Проверьте интернет.',
  network:'Проверьте подключение к интернету и доступность хоста.',
  'ice-failed':'Доступные маршруты не сработали. Проверьте интернет и повторите подключение.',
  'transport-closed':'Соединение прервалось. Попробуйте подключиться ещё раз.',
  'transport-timeout':'Нет ответа по игровому каналу. Попробуйте подключиться ещё раз.'
 };
 function keys(online){return online?['direct','stun','turn']:['direct'];}
 function detail(state,online){
  if(state.stage==='connected'){const protocol=['udp','tcp','tls'].includes(state.protocol)?' · '+state.protocol.toUpperCase():'';return 'Сработало: '+(methodNames[state.method]||methodNames.unknown)+protocol;}
  if(state.stage==='failed')return errors[state.code]||'Проверьте подключение к интернету и доступность хоста.';
  if(state.stage==='cancelled')return 'Можно вернуться и подключиться ещё раз.';
  if(state.stage==='paused')return 'Подключение приостановлено, пока открыто другое окно. Нажмите «Повторить», чтобы продолжить.';
  const checking=keys(online).filter(key=>state[key]==='checking');
  if(checking.length)return 'Проверяем: '+checking.map(key=>shortNames[key]).join(' · ');
  return stages[state.stage]||stages.preparing;
 }
 function methodStatus(state,key){
  const value=state[key];
  if(['failed','cancelled','paused'].includes(state.stage))return value==='unavailable'?'Недоступно':value==='selected'?'Канал найден, вход не завершён':value==='unused'?'Не потребовалось':state.stage==='paused'?'Проверка приостановлена':'Проверка остановлена';
  return {searching:['gathering','checking'].includes(state.stage)?'Ищем адрес':'Ожидает проверки',available:'Адрес найден',checking:'Проверяется…',selected:'Сработало',unused:'Не потребовалось',unavailable:'Недоступно'}[value]||'Ожидает проверки';
 }
 function content(state,{online=true}={}){
  const completed=state.stage==='connected',failed=state.stage==='failed',cancelled=state.stage==='cancelled',paused=state.stage==='paused',heading=completed?'Соединение установлено':failed?'Не удалось подключиться':cancelled?'Подключение отменено':paused?'Подключение приостановлено':'Подключаемся';
  const meter=failed||cancelled||paused?'':root.PlayroomStatusMeter.markup({attrs:'data-connection-track',label:completed?'Соединение установлено':'Устанавливаем соединение',value:completed?1:null,max:completed?1:null,state:completed?'ready':'busy'});
  return `<div class="connection-v021-main" data-connection-main role="${failed?'alert':'status'}" aria-live="${failed?'assertive':'polite'}"><h3>${completed?H().icon('check'):''}${heading}</h3><p data-joining-message>${H().esc(detail(state,online))}</p>${meter}</div><details class="connection-v021-details" data-connection-details data-entity="connection-details"><summary>Подробности соединения</summary><ul>${keys(online).map(key=>`<li class="connection-method" data-method="${key}" data-entity="connection-method-${key}"><span>${methodNames[key]}</span><span>${completed&&state[key]==='selected'?H().icon('check'):''}${H().esc(methodStatus(state,key))}</span></li>`).join('')}</ul></details>`;
 }
 function markup({retryAttrs='data-lobby-retry-join',retryOnFailure=false}={}){
  return `${H().modalHead('Подключение')}<main class="connection-v021" data-connection-progress data-connection-mode="online" ${retryOnFailure?'data-connection-retry-auto':''}>${content({stage:'locating'})}</main><footer class="modal-foot connection-v021-footer" data-fixed-footer>${H().button({attrs:retryAttrs+' data-joining-actions hidden',label:'Повторить',icon:'reset'})}${H().button({attrs:'data-command="close-modal"',label:'Отменить',icon:'close',variant:'secondary'})}</footer>`;
 }
 function retryVisible(target,visible){const modal=target.closest('.online-connecting-modal');for(const action of modal?.querySelectorAll('[data-joining-actions]')||[])action.hidden=!visible;}
 function present(target,state,{online=true}={}){
  if(!target?.isConnected)return;const expanded=!!target.querySelector('[data-connection-details]')?.open;
  states.set(target,{...state});target.classList.add('connection-v021');target.dataset.connectionStage=state.stage||'preparing';target.dataset.connectionMode=online?'online':'network';target.removeAttribute('role');target.removeAttribute('aria-live');
  root.PlayroomDOM.ListController.update(target,content(state,{online}));target.querySelector('[data-connection-details]').open=expanded;
  if(state.stage!=='failed')retryVisible(target,false);else if(target.hasAttribute('data-connection-retry-auto'))retryVisible(target,true);
 }
 function showFailure(target,error){if(!target?.isConnected)return;present(target,{...(states.get(target)||{}),stage:'failed',code:error?.code||'unknown'},{online:target.dataset.connectionMode!=='network'});retryVisible(target,true);}
 function showPaused(target){if(!target?.isConnected)return;present(target,{...(states.get(target)||{}),stage:'paused'},{online:target.dataset.connectionMode!=='network'});retryVisible(target,true);}
 function activeTarget(){const modal=root.document.querySelector('#modal-root>[data-surface-state="active"] .modal');return modal?.matches('.online-connecting-modal,.nearby-modal')?modal.querySelector('[data-connection-progress]'):null;}
 function create({roomId=null,role='client',visible=false}={}){
  const feedbackId='connection-'+(++feedbackSequence);let latest={},target=null,retired=false;
  const paint=(mount=false)=>{
   if(!visible||retired)return;
   if(!target?.isConnected||target.dataset.connectionOwner!==feedbackId){
    if(target&&!mount)return;
    const candidate=activeTarget();if(!candidate||!mount&&candidate.dataset.connectionOwner)return;
    if(latest.stage==='cancelled')return;target=candidate;target.dataset.connectionOwner=feedbackId;
   }
   present(target,latest,{online:!!roomId});
  };
  const attempt=root.PlayroomConnectionAttempt.create({
   roomId,role,userId:root.PlayroomAccountUI?.service?.snapshot().id,now:()=>Date.now(),
   idFactory:()=>root.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);}),
   credentials:id=>root.PlayroomIceConfig.credentials(id),trace:(...args)=>root.PlayroomIceConfig?.trace(...args),selectedMethod:pc=>root.PlayroomWebRTCTransport.selectedMethod(pc),sleep:ms=>new Promise(resolve=>root.setTimeout(resolve,ms)),
   onChange:value=>{latest=value;if(value.stage==='connected')root.PlayroomUIFeedback?.emit('connection.success',{id:feedbackId});if(value.stage==='failed')root.PlayroomUIFeedback?.emit('error',{id:feedbackId});paint();}
  });
  return {...attempt,cancel(){retired=true;attempt.cancel();},paint:()=>paint(true)};
 }
 root.PlayroomConnectionProgress=Object.freeze({create,markup,showFailure,showPaused});
})(globalThis);

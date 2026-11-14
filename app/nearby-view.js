/* Nearby exchange presentation. Signals, QR/audio I/O and admission stay in their existing ports. */
(function(root){
 'use strict';
 const instances=new WeakMap(),H=()=>root.PlayroomGameScreen;
 const modeFor=stage=>stage==='client-join'?'receive':'show';
 function scanParts(markup){const template=document.createElement('template');template.innerHTML=markup||'';const camera=template.content.querySelector('[data-net-qr-camera]'),action=camera?.outerHTML||'';camera?.remove();return {body:template.innerHTML,action};}
 function instructions(stage,mode){
  if(stage==='client-join')return ['1 · Приглашение','На первом телефоне выберите «Показать». Получите приглашение, затем верните ему ответ.'];
  if(stage==='client-answer')return ['2 · Ответ второго телефона','На первом телефоне выберите «Получить» и передайте ему этот ответ. Дождитесь соединения.'];
  return mode==='show'?['1 · Приглашение','На втором телефоне выберите «Получить», затем верните ответ на первый.']:['2 · Ответ второго телефона','На втором телефоне выберите «Показать». Получите его ответ на этом телефоне.'];
 }
 function markup({stage,role,network='',permission='',qr='',scan='',outgoingText='',incomingText='',share='',sendSound='',receiveSound='',soundSettings=''}){
  const mode=modeFor(stage),[step,description]=instructions(stage,mode),incoming=scanParts(scan),canShow=stage!=='client-join',canReceive=stage!=='client-answer',outgoing=stage!=='client-join';
  const tabsId=H().pageTabsId();
  const pane=(direction,method,body)=>`<section class="nearby-method-pane pairing-method" id="${tabsId}-${direction}-${method}" role="tabpanel" aria-labelledby="${tabsId}-method-${method}" data-nearby-pane="${direction}:${method}" data-pairing-method="${method}" ${mode===direction&&method==='qr'?'':'hidden'}><div class="pairing-method-body">${body}</div></section>`;
  const action=(when,body)=>`<div data-nearby-action-for="${when}" ${when.split(' ').includes(mode+':qr')?'':'hidden'}>${body}</div>`;
  const waiting='<p class="nearby-wait" role="status">'+H().icon('network')+'<span>Ожидаем первый телефон</span></p>';
  const next=`<button type="button" class="btn" data-nearby-direction="receive">${H().icon('next')}<span>Получить ответ</span></button>`;
  const formId=stage==='client-join'?'net-client-offer':role==='delegated'?'net-delegated-answer':'net-host-answer';
  const submit=`<button type="submit" class="btn" form="${formId}">${H().icon('next')}<span>${stage==='client-join'?'Подготовить ответ':'Принять ответ'}</span></button>`;
  const soundBody=direction=>`<div class="nearby-method-empty">${H().icon(direction==='show'?'sound':'mic')}<h3>${direction==='show'?'Передать звуком':'Получить звуком'}</h3><p>Держите телефоны рядом. ${direction==='show'?'На втором телефоне включите прослушивание.':'На втором телефоне включите передачу.'}</p><p class="nearby-method-reason" data-nearby-reason="${direction}"></p></div>`;
  const qrReceive=`<div class="nearby-method-empty nearby-scan-hint">${H().icon('qr')}<h3>${stage==='client-join'?'Получите приглашение':'Получите ответ'}</h3><p>Наведите камеру на QR второго телефона или выберите снимок.</p></div>${incoming.body}`;
  return H().modalHead('Рядом',{actions:root.PlayroomLobbyView.fieldHelp('Два телефона обмениваются приглашением и ответом. Первый показывает приглашение, второй получает его и показывает ответ. Верните ответ первому телефону. Соединение готово только после подтверждения обоих устройств.').replace('class="rule-help"','class="rule-help nearby-help"')})+
   `<div class="nearby-screen" data-nearby-screen data-nearby-stage="${stage}" data-nearby-role="${role}" data-nearby-direction="${mode}" data-nearby-method="qr" data-nearby-revision="0">`+
    `<div class="app-page-tabs shared-page-tabs nearby-direction-tabs" role="tablist" aria-label="Действие на этом телефоне" style="--page-count:2;--page-index:${mode==='show'?0:1}">${[['show','Показать',canShow],['receive','Получить',canReceive]].map(([value,label,enabled])=>`<button type="button" role="tab" id="${tabsId}-direction-${value}" ${enabled?`aria-controls="${tabsId}-direction-panel-${value}"`:""} data-nearby-direction="${value}" aria-selected="${mode===value}" ${enabled?'':`disabled title="${stage==='client-join'?'Сначала получите приглашение':'Теперь покажите подготовленный ответ'}"`}>${label}</button>`).join('')}</div>`+
    `<div class="nearby-step" data-nearby-step>${step}</div><p class="nearby-instruction" data-nearby-instruction>${description}</p>`+
    `<div class="app-page-tabs shared-page-tabs nearby-method-tabs" role="tablist" aria-label="Способ обмена" style="--page-count:3;--page-index:0">${[['qr','QR'],['sound','Звук'],['text','Код']].map(([value,label])=>`<button type="button" role="tab" id="${tabsId}-method-${value}" aria-controls="${tabsId}-${mode}-${value}" data-nearby-method="${value}" aria-selected="${value==='qr'}">${label}</button>`).join('')}</div>`+
    `<div class="nearby-methods">${outgoing?`<section class="nearby-direction-panel" id="${tabsId}-direction-panel-show" data-nearby-direction-panel="show" role="tabpanel" aria-labelledby="${tabsId}-direction-show" ${mode==='show'?'':'hidden'}>${pane('show','qr',qr)+pane('show','sound',soundBody('show'))+pane('show','text',outgoingText+share)}</section>`:''}${canReceive?`<section class="nearby-direction-panel" id="${tabsId}-direction-panel-receive" data-nearby-direction-panel="receive" role="tabpanel" aria-labelledby="${tabsId}-direction-receive" ${mode==='receive'?'':'hidden'}>${pane('receive','qr',qrReceive)+pane('receive','sound',soundBody('receive'))+pane('receive','text',incomingText)}</section>`:''}</div>`+
    `${network||permission||soundSettings?`<details class="nearby-advanced"><summary>Параметры соединения ${H().icon('settings')}</summary>${network}${soundSettings}${permission}</details>`:''}`+
   `</div><footer class="nearby-actions" data-fixed-footer>${outgoing?action('show:qr show:text',stage==='client-answer'?waiting:next)+action('show:sound',sendSound):''}${canReceive?action('receive:qr',incoming.action)+action('receive:sound',receiveSound)+action('receive:text',submit):''}<div data-nearby-progress></div></footer>`;
 }
 function bind(host,{stage,eligibility=()=>({}),cancelIO=()=>{},valid=()=>true,isActive=()=>true}={}){
  const screen=host?.querySelector('[data-nearby-screen]');if(!screen)return ()=>{};
  instances.get(host)?.dispose();let disposed=false,method='qr',mode=modeFor(stage),revision=0;
  const events=new AbortController(),allowed=value=>stage==='client-join'?value==='receive':stage==='client-answer'?value==='show':true;
  function update(){
   if(disposed||!screen.isConnected||!valid())return;
   const state=eligibility(),[step,description]=instructions(stage,mode);screen.dataset.nearbyDirection=mode;screen.dataset.nearbyMethod=method;screen.querySelector('[data-nearby-step]').textContent=step;screen.querySelector('[data-nearby-instruction]').textContent=description;
   screen.querySelector('.nearby-direction-tabs').style.setProperty('--page-index',mode==='show'?0:1);screen.querySelector('.nearby-method-tabs').style.setProperty('--page-index',['qr','sound','text'].indexOf(method));
   for(const button of screen.querySelectorAll('[role=tab][data-nearby-direction]')){const selected=button.dataset.nearbyDirection===mode;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
   for(const button of screen.querySelectorAll('[role=tab][data-nearby-method]')){const selected=button.dataset.nearbyMethod===method;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
   for(const pane of screen.querySelectorAll('[data-nearby-pane]'))pane.hidden=pane.dataset.nearbyPane!==mode+':'+method;
   for(const pane of screen.querySelectorAll('[data-nearby-direction-panel]'))pane.hidden=pane.dataset.nearbyDirectionPanel!==mode;
   for(const tab of screen.querySelectorAll('[data-nearby-method]')){const pane=screen.querySelector('[data-nearby-pane="'+mode+':'+tab.dataset.nearbyMethod+'"]');if(pane)tab.setAttribute('aria-controls',pane.id);}
   for(const action of host.querySelectorAll('[data-nearby-action-for]'))action.hidden=!action.dataset.nearbyActionFor.split(' ').includes(mode+':'+method);
   for(const direction of ['show','receive']){const available=direction==='show'?state.soundOut:state.soundIn,reason=screen.querySelector('[data-nearby-reason="'+direction+'"]');if(reason){reason.textContent=available?'':state.soundReason||'Звук недоступен на этом устройстве. Используйте QR или код.';reason.hidden=!!available;}}
   for(const button of host.querySelectorAll('#net-host-acoustic-send,#net-client-acoustic-send'))button.disabled=!state.soundOut;
   for(const button of host.querySelectorAll('#net-host-acoustic-listen,#net-client-acoustic-listen'))button.disabled=!state.soundIn;
  }
  function cancel(){cancelIO();screen.dataset.nearbyRevision=String(++revision);}
  function select(nextMode=mode,nextMethod=method){if(!allowed(nextMode)||!['qr','sound','text'].includes(nextMethod)||disposed||!valid())return;if(nextMode!==mode||nextMethod!==method){cancel();}mode=nextMode;method=nextMethod;update();}
  host.addEventListener('click',event=>{const direction=event.target.closest('[data-nearby-direction]'),tab=event.target.closest('button[data-nearby-method]');if(direction?.tagName==='BUTTON'){event.preventDefault();select(direction.dataset.nearbyDirection);return;}if(tab){event.preventDefault();select(mode,tab.dataset.nearbyMethod);}},{signal:events.signal});
  host.addEventListener('keydown',event=>{const tab=event.target.closest('[role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const items=[...tab.parentElement.querySelectorAll('[role=tab]:not(:disabled)')];let index=items.indexOf(tab);index=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;event.preventDefault();items[index].click();items[index].focus({preventScroll:true});},{signal:events.signal});
  host.addEventListener('input',()=>queueMicrotask(update),{signal:events.signal});host.addEventListener('change',()=>queueMicrotask(update),{signal:events.signal});
  const observer=new MutationObserver(()=>update());for(const select of screen.querySelectorAll('[data-pairing-network] select'))observer.observe(select,{childList:true});
  let active=isActive();const stackObserver=new MutationObserver(()=>{const next=isActive();if(active&&!next)cancel();active=next;});const modalHost=document.getElementById('modal-root');if(modalHost)stackObserver.observe(modalHost,{childList:true,subtree:true,attributes:true,attributeFilter:['data-surface-state','hidden','inert']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancel();},{signal:events.signal});
  const api={select,update,dispose(){if(disposed)return;disposed=true;events.abort();observer.disconnect();stackObserver.disconnect();cancel();instances.delete(host);}};instances.set(host,api);update();return api.dispose;
 }
 function select(host,mode,method){instances.get(host)?.select(mode,method);}
 root.PlayroomNearbyView=Object.freeze({markup,bind,select});
})(globalThis);

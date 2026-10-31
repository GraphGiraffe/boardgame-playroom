/* Web adapter for private account archives. No live-room capabilities cross this boundary. */
(function(root){
 'use strict';const B=()=>root.PlayroomAppBridge,H=()=>root.PlayroomGameScreen,T=()=>root.PlayroomSaveTransfer;
 const labels={off:'Только на устройстве',pending:'Ожидает отправки',synced:'Сохранено в облаке',changed:'Облачная версия отличается',busy:'Синхронизация',conflict:'Конфликт версий',error:'Ошибка облачного сохранения'};
 const icons={off:'cloud-off',pending:'cloud',synced:'cloud-check',changed:'cloud-sync',busy:'cloud-sync',conflict:'cloud-alert',error:'cloud-alert'};
 const errors={network:'Нет связи. Локальное сохранение остаётся на устройстве.',quota:'В облаке занято 10 МБ. Удалите ненужные облачные копии и повторите.',conflict:'Данные изменились на другом устройстве. Выберите, какую версию получить или отправить.',setup:'Облачные сохранения ещё не настроены на сервере.','account-changed':'Аккаунт изменился. Откройте окно заново.','account-required':'Войдите в аккаунт.','not-found':'Облачная копия удалена.',SAVE_PACK_MISSING:'Установите точную версию пака в менеджере паков и повторите.'};
 let service,dialog=null,busy=false,message='',refreshJob=null,autoJob=null,pendingEntry=null;const pending=new Set(),localSizes=new Map();
 const size=value=>root.PlayroomStorageUsage?.format(value)||((value||0)/1048576).toFixed(2)+' МБ';
 function settings(){return `<label class="switch"><span title="Отправлять по завершении партии и при выходе в главное меню">Облачные сохранения</span><input type="checkbox" data-cloud-default ${service?.enabled?'checked':''} ${!service?.user?'disabled':''}></label>`;}
 function quotaValue(){return (service?.user&&(service.loaded||service.cachedUsage)?root.PlayroomStorageUsage.number(service.used/1048576):'—')+'/10 МБ';}
 function quotaLabel(){return H().icon('cloud')+'<b>'+H().esc(quotaValue())+'</b>';}
 function quotaInlineMarkup(){return `<span class="storage-cloud-label" data-cloud-usage data-cloud-inline title="Облако: ${H().esc(quotaValue())}" aria-label="Облако: ${H().esc(quotaValue())}">${quotaLabel()}</span>`;}
 function barMarkup(){return `<div class="storage-cloud-line" data-cloud-usage-bar role="meter" aria-label="Облачные сохранения" aria-valuemin="0" aria-valuemax="10485760" aria-valuenow="${service?.used||0}" style="--cloud-usage:${Math.min(100,(service?.used||0)/10485760*100)}%"><i></i></div>`;}
 function button(key){const state=service?.user?service.state(key):'off';return H().iconButton(`data-cloud-save="${H().esc(key)}" data-cloud-status="${state}"`,'Управление сохранением · '+labels[state],icons[state]);}
 function update(){
  for(const el of document.querySelectorAll('[data-cloud-usage]')){el.innerHTML=quotaLabel();el.setAttribute('aria-label','Облако: '+quotaValue());if(el.hasAttribute('data-cloud-inline'))el.title=service?.error?errors[service.error]||'Не удалось обновить счётчик':!service?.user?'Облако · Войдите в аккаунт':'Облако: '+quotaValue();}
  for(const el of document.querySelectorAll('[data-cloud-usage-bar]')){el.style.setProperty('--cloud-usage',Math.min(100,(service?.used||0)/10485760*100)+'%');el.setAttribute('aria-valuenow',String(service?.used||0));}
  for(const input of document.querySelectorAll('[data-cloud-default]')){if(!busy)input.checked=!!service?.enabled;input.disabled=!service?.user||busy;}
  for(const el of document.querySelectorAll('[data-cloud-save]')){const state=service?.user?service.state(el.dataset.cloudSave):'off';el.dataset.cloudStatus=state;el.innerHTML=H().icon(icons[state]);el.title=el.ariaLabel='Управление сохранением · '+labels[state];}
  if(dialog)renderDialog();root.dispatchEvent(new Event('playroom:cloud-saves-updated'));
 }
 async function refresh(){if(!service?.user)return;if(!refreshJob)refreshJob=service.refresh().catch(()=>{}).finally(()=>{refreshJob=null;});return refreshJob;}
 async function entries(){return [...B().saveLibrary.list().filter(e=>!e.invalid&&!e.missingPack).map(e=>({...e,key:'local:'+e.id})),...(await root.PlayroomNetworkLibrary.list()).filter(e=>!e.invalid&&!e.missingPack).map(e=>({...e,key:'network:'+(e.role==='client'?'client:'+e.id:e.sessionId)}))];}
 async function capture(key){
  const network=key.startsWith('network:'),id=key.slice(network?8:6);let source,entry;
  if(network){source=await root.PlayroomNetworkLibrary.portableSource(id);entry=(await entries()).find(e=>e.key===key);}
  else{const session=B().saveLibrary.open(id);entry=B().saveLibrary.list().find(e=>e.id===id);source={kind:'session',session,roomName:entry?.roomName||'',pack:B().packs.exportPack(session.game,session.packVersion)};}
  const file=await T().createRecord({...source,Session:root.TabletopSession,includePack:false}),s=source.session?.current||source.replay.frames.at(-1).state;localSizes.set(key,new TextEncoder().encode(file.text).length);
  return {...file,summary:{game:source.session?.game||source.replay.game,packVersion:source.session?.packVersion||source.replay.packVersion,kind:source.kind,name:source.roomName||'',players:s.players.map(p=>String(p.name).slice(0,40)),finished:s.status==='finished',move:s.move,updatedAt:entry?.updatedAt||Date.now()}};
 }
 async function receive(row,guard){
  const value=await T().inspect(row.file);if(value.pack||value.sha256!==row.checksum)throw Error('SAVE_CHECKSUM');
  const prepared=await T().prepare(value,{packs:B().packs,Session:root.TabletopSession,engine:root.TabletopCore});guard();
  const history=value.kind==='replay'?new root.PlayroomNetworkClientHistory():null;
  try{const imported=await T().install(prepared,{packs:B().packs,library:B().saveLibrary,clientHistory:history,guard});return imported.kind==='replay'?'network:client:'+imported.id:'local:'+imported.id;}finally{history?.close();}
 }
 async function auto(){
  if(autoJob||!service?.user)return autoJob;
  autoJob=(async()=>{while(pending.size){const keys=[...pending];pending.clear();await root.PlayroomNetworkLibrary.cloudIdle();await service.auto(keys);}})().catch(()=>{}).finally(()=>{autoJob=null;});return autoJob;
 }
 function saved(key,{finished=false,menu=false}={}){if(!service?.user)return;service.dirty(key);if(finished||menu){pending.add(key);void auto();}}
 async function scan(){const ticket=service?.generation;await refresh();if(!service?.user||ticket!==service.generation)return;for(const entry of await entries()){if(ticket!==service.generation)return;pending.add(entry.key);}return auto();}
 function renderDialog(){
  const content=document.querySelector('[data-cloud-dialog]');if(!content)return;
  const key=dialog,r=service?.remoteFor(key),state=service?.user?service.state(key):'off',enabled=pendingEntry?.key===key?pendingEntry.enabled:service?.automatic(key),bytes=localSizes.get(key)??(state==='synced'?r?.bytes:null);
  const meter=`<div class="storage-usage cloud-save-meter">${quotaInlineMarkup()}${barMarkup()}<span class="cloud-save-size">Это сохранение: <b>${bytes==null?'…':H().esc(size(bytes))}</b></span></div>`;
  const action=(name,label,icon,disabled=false)=>H().iconButton(`data-cloud-action="${name}"`,label,icon,{disabled:busy||service.jobs.has(key)||disabled,className:name==='delete'?'cloud-save-delete ui-action-danger':name==='sync'?'cloud-save-sync':''});
  const cloud=service?.user?`<label class="switch"><span>Автосохранение в облако</span><input type="checkbox" data-cloud-entry ${enabled?'checked':''} ${busy||service.jobs.has(key)?'disabled':''}></label><div class="cloud-save-actions ui-action-row">${action('delete','Удалить из облака','trash',!r||r.deleted)}${action('upload','Отправить в облако','cloud-upload')}${action('download','Получить из облака','cloud-download',!r||r.deleted)}${action('sync','Синхронизация','sync')}</div>`:H().button({attrs:'data-account-open',label:'Войти в аккаунт',icon:'cloud'});
  content.innerHTML=`${cloud}${meter}<p class="cloud-save-status" role="${message?'alert':'status'}">${H().esc(message||labels[state])}${!message&&r&&!r.deleted?' · '+H().esc(new Date(r.updated_at).toLocaleString('ru-RU')):''}</p>`;
 }
 async function show(key){dialog=key;message='';const network=key.startsWith('network:'),id=key.slice(network?8:6),head=H().modalHead('Сохранение').replace('</header>',H().iconButton(`data-save-export="${H().esc(id)}" ${network?'data-save-network="true"':''}`,'Экспорт в файл','file-export')+'</header>');B().openModal(head+'<div data-cloud-dialog></div>','cloud-save-modal');renderDialog();await Promise.all([refresh(),capture(key).catch(error=>{if(dialog===key)message=errors[error.code||error.message]||root.PlayroomMessages.error(error);})]);if(dialog===key)renderDialog();}
 function remoteCount(keys){if(!service?.user)return 0;const linked=new Set(keys.map(key=>service.bindings[key]?.id));return service.entries.filter(entry=>!entry.deleted&&!linked.has(entry.id)).length;}
 async function removeAll(){
  if(busy||!service?.user)return false;const ticket=service.generation;
  if(!await H().confirmDialog('Удалить все сохранения из облака? Локальные партии останутся.'))return false;
  service.guard(ticket);busy=true;update();
  try{const list=await entries();service.guard(ticket);await service.removeAll(list.map(entry=>entry.key));for(const entry of list)pending.delete(entry.key);B().showSessions();return true;}
  finally{busy=false;update();}
 }
 function remoteMarkup(keys){if(!service?.user)return '';const linked=new Set(keys.map(k=>service.bindings[k]?.id));return service.entries.filter(e=>!e.deleted&&!linked.has(e.id)).map(e=>{const s=e.summary||{};return H().sessionCard({className:'saved-game cloud-only-game',attrs:`data-cloud-id="${H().esc(e.id)}"`,gameName:B().meta(s.game)?.name||s.game||'Партия',mode:'hotseat',status:H().icon('cloud-check'),badgeTitle:'В облаке',roomName:s.name||'',progress:'В облаке · '+size(e.bytes),actions:H().iconButton(`data-cloud-fetch="${H().esc(e.id)}"`,'Получить из облака','down'),details:`<p>${H().esc(s.packVersion||'')} · ${H().esc(new Date(e.updated_at).toLocaleString('ru-RU'))}</p>`,bottomAction:H().iconButton(`data-cloud-remove-remote="${H().esc(e.id)}"`,'Удалить из облака','trash',{className:'ui-action-danger'})});}).join('');}
 async function execute(action){if(busy)return;busy=true;message='';update();try{await action();}catch(error){message=errors[error.code||error.message]||root.PlayroomMessages.error(error);}finally{busy=false;pendingEntry=null;update();}}
 function init({account,remote,storage=root.localStorage}){
  service=new root.PlayroomCloudSaveService({account,remote,storage,local:{capture,receive}});service.subscribe(update);let lastUser=service.user;account.subscribe(()=>{if(service.user===lastUser)return;lastUser=service.user;pending.clear();dialog=null;message='';void refresh();});void refresh();
  root.addEventListener('online',()=>void scan());root.addEventListener('playroom:hub-rendered',()=>void scan());
 }
 document.addEventListener('change',event=>{
  if(event.target.matches('[data-cloud-default]')){const checked=event.target.checked;void execute(async()=>{await service.settings(checked);await scan();});}
  if(event.target.matches('[data-cloud-entry]')&&dialog){const checked=event.target.checked,key=dialog;pendingEntry={key,enabled:checked};void execute(async()=>{await service.toggle(key,checked);if(checked)await service.upload(key,{force:!!service.remoteFor(key)?.deleted});});}
 });
 document.addEventListener('click',event=>{
  const open=event.target.closest('[data-cloud-save]');if(open){void show(open.dataset.cloudSave);return;}
  const fetch=event.target.closest('[data-cloud-fetch]');if(fetch){void execute(async()=>{if(!await H().confirmDialog('Получить сохранение из облака? На устройстве появится отдельная копия.'))return;await service.receiveRemote(fetch.dataset.cloudFetch);B().showSessions();});return;}
  const remove=event.target.closest('[data-cloud-remove-remote]');if(remove){void execute(async()=>{if(!await H().confirmDialog('Удалить облачную копию?'))return;await service.refresh();const r=service.entries.find(e=>e.id===remove.dataset.cloudRemoveRemote);if(r)service.accept(await service.call('delete',{id:r.id,revision:r.revision}));B().showSessions();});return;}
  const button=event.target.closest('[data-cloud-action]');if(!button||busy||!dialog)return;
  const key=dialog;void execute(async()=>{
   const action=button.dataset.cloudAction;
   if(action==='sync'){if(await H().confirmDialog('Синхронизировать сохранение? Локальные изменения отправятся в облако, а новые облачные данные будут получены отдельной копией.'))await service.sync(key);return;}
   if(action==='delete'){if(await H().confirmDialog('Удалить облачную копию? Локальная история останется.'))await service.remove(key);return;}
   if(action==='upload'){if(await H().confirmDialog('Отправить эту локальную версию в облако? Текущая облачная версия будет заменена.'))await service.upload(key,{force:true});return;}
   if(action==='download'&&await H().confirmDialog('Получить облачную версию отдельной копией?')){const next=await service.download(key,{force:true});dialog=next;}
  });
 });
 root.PlayroomCloudSavesUI=Object.freeze({init,settings,button,quotaInlineMarkup,barMarkup,remoteMarkup,remoteCount,removeAll,saved,scan,refresh,get service(){return service;}});
})(globalThis);

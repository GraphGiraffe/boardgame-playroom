/* Web adapter for private account archives. No live-room capabilities cross this boundary. */
(function(root){
 'use strict';const B=()=>root.PlayroomAppBridge,H=()=>root.PlayroomGameScreen,T=()=>root.PlayroomSaveTransfer;
 const Meter=root.PlayroomStatusMeter||(typeof require==='function'?require('./status-meter.js'):null);
 const labels={off:'Только на устройстве',pending:'Ожидает отправки',synced:'Сохранено в облаке',changed:'Облачная версия отличается',busy:'Синхронизация',conflict:'Конфликт версий',error:'Ошибка облачного сохранения'};
 const icons={off:'cloud-off',pending:'cloud',synced:'cloud-check',changed:'cloud-sync',busy:'cloud-sync',conflict:'cloud-alert',error:'cloud-alert'};
 const errors={request:'Не удалось выполнить действие с облачным сохранением. Попробуйте ещё раз.',network:'Нет связи. Локальное сохранение остаётся на устройстве.',quota:'В облаке занято 10 МБ. Удалите ненужные облачные копии и повторите.',conflict:'Данные изменились на другом устройстве. Выберите, какую версию получить или отправить.',setup:'Облачные сохранения ещё не настроены на сервере.','account-changed':'Аккаунт изменился. Откройте окно заново.','account-required':'Войдите в аккаунт.','not-found':'Облачная копия удалена.',SAVE_IN_USE:'Сначала остановите эту партию или закройте её историю.',SAVE_ID_CONFLICT:'Облачная копия относится к другой партии.',SAVE_NETWORK_REPLACE:'Облачная и сетевая версии отличаются. Сетевой журнал с правами хоста не заменяется переносимой копией.',SAVE_PACK_MISSING:'Установите точную версию пака в менеджере паков и повторите.'};
 let service,dialog=null,detailFrame=null,detailOpening=0,busy=false,message='',refreshJob=null,autoJob=null,pendingEntry=null;const pending=new Set(),localSizes=new Map();
 const savePlural=new Intl.PluralRules('ru'),saveCount=count=>count+' '+({one:'сохранение',few:'сохранения',many:'сохранений',other:'сохранения'}[savePlural.select(count)]);
 const size=value=>root.PlayroomStorageUsage?.format(value)||((value||0)/1048576).toFixed(2)+' МБ';
 // A cloud upload timestamp is not the time the game was saved.
 function savedTime(entry){
  for(const value of [entry.summary?.updatedAt,entry.summary?.createdAt,entry.updatedAt,entry.createdAt,entry.updated_at,entry.created_at]){
   const time=typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;
   if(Number.isFinite(time)&&time>0&&time<=8640000000000000)return time;
  }
  return 0;
 }
 function newestSaves(entries){return [...entries].sort((a,b)=>savedTime(b)-savedTime(a)||String(a.key||a.id||'').localeCompare(String(b.key||b.id||'')));}
 function savedDate(entry){const time=savedTime(entry);return time?new Date(time).toLocaleString('ru-RU'):'Дата неизвестна';}
 function saveLabel(entry,bytes){
  const summary=entry.summary||entry,time=savedTime(entry),name=B().meta(summary.game)?.name||summary.game||'Партия',version=summary.packVersion?'v'+summary.packVersion:'Версия неизвестна';
  return `<span class="data-save-label"><span class="data-save-title"><strong>${H().esc(name)}</strong><small>${Number.isFinite(bytes)?H().esc(size(bytes)):'Измеряем размер файла…'}</small></span><small class="data-save-meta"><span>${H().esc(version)}</span> · ${time?`<time datetime="${new Date(time).toISOString()}">${H().esc(savedDate(entry))}</time>`:'Дата неизвестна'}</small></span>`;
 }
 function settings(){return `<label class="switch ui-switch preference-row preference-row--control"><span title="Отправлять по завершении партии и при выходе в главное меню">Автосохранение в облако</span><input type="checkbox" data-cloud-default ${service?.enabled?'checked':''} ${!service?.user?'disabled':''}></label>`;}
 function quotaValue(){return (service?.user&&(service.loaded||service.cachedUsage)?root.PlayroomStorageUsage.number(service.used/1048576):'—')+'/10 МБ';}
 function quotaLabel(){return H().icon('cloud')+'<b>'+H().esc(quotaValue())+'</b>';}
 function quotaInlineMarkup(){return `<span class="storage-cloud-label" data-cloud-usage data-cloud-inline title="Облако: ${H().esc(quotaValue())}" aria-label="Облако: ${H().esc(quotaValue())}">${quotaLabel()}</span>`;}
 function quotaKnown(){return !!(service?.user&&(service.loaded||service.cachedUsage));}
 function barMarkup(){return Meter.markup({attrs:'data-cloud-usage-bar',kind:'meter',label:'Облачные сохранения',value:quotaKnown()?service.used:null,max:10485760,valueText:quotaKnown()?size(service.used)+' из 10 МБ':'Объём пока неизвестен',state:service?.error?'error':quotaKnown()?'ready':'busy'});}
 function quotaCardMarkup(){return Meter.card({title:service?.error?'Не удалось обновить объём':'Облачные сохранения',detail:quotaKnown()?size(service.used)+' из 10 МБ':service?.user?'Определяем занятое место…':'Войдите в аккаунт для облачных копий',meter:barMarkup()});}
 function button(key){const state=service?.user?service.state(key):'off';return H().iconButton(`data-cloud-save="${H().esc(key)}" data-cloud-status="${state}"`,'Управление сохранением · '+labels[state],icons[state]);}
 function update(){
  for(const el of document.querySelectorAll('[data-cloud-usage]')){el.innerHTML=quotaLabel();el.setAttribute('aria-label','Облако: '+quotaValue());if(el.hasAttribute('data-cloud-inline'))el.title=service?.error?errors[service.error]||'Не удалось обновить счётчик':!service?.user?'Облако · Войдите в аккаунт':'Облако: '+quotaValue();}
  for(const el of document.querySelectorAll('[data-cloud-usage-bar]'))Meter.update(el,{kind:'meter',label:'Облачные сохранения',value:quotaKnown()?service.used:null,max:10485760,valueText:quotaKnown()?size(service.used)+' из 10 МБ':'Объём пока неизвестен',state:service?.error?'error':quotaKnown()?'ready':'busy'});
  for(const input of document.querySelectorAll('[data-cloud-default]')){if(!busy)input.checked=!!service?.enabled;input.disabled=!service?.user||busy;}
  for(const el of document.querySelectorAll('[data-cloud-save]')){
   const state=service?.user?service.state(el.dataset.cloudSave):'off';el.dataset.cloudStatus=state;
   const template=document.createElement('template');template.innerHTML=H().icon(icons[state]);
   const slot=el.querySelector('[data-ui-icon]'),hasLabel=!!el.querySelector('.ui-button-label')||[...el.childNodes].some(node=>node.nodeType===3?!!node.textContent.trim():node.nodeType===1&&node.tagName.toLowerCase()!=='svg'&&!!node.textContent.trim());
   if(slot)slot.replaceWith(template.content);else if(hasLabel)el.prepend(template.content);else el.replaceChildren(template.content);
   el.title=el.ariaLabel='Управление сохранением · '+labels[state];
  }
  if(dialog)renderDialog();renderData();root.dispatchEvent(new Event('playroom:cloud-saves-updated'));
 }
 async function refresh(){
  if(!service?.user)return;const ticket=service.generation;
  if(!refreshJob||refreshJob.ticket!==ticket){const job={ticket};job.promise=service.refresh().catch(()=>{}).finally(()=>{if(refreshJob===job)refreshJob=null;});refreshJob=job;}
  return refreshJob.promise;
 }
 async function entries(){return [...B().saveLibrary.list().filter(e=>!e.invalid&&!e.missingPack).map(e=>({...e,key:'local:'+e.id})),...(await root.PlayroomNetworkLibrary.list()).filter(e=>!e.invalid&&!e.missingPack).map(e=>({...e,key:'network:'+(e.role==='client'?'client:'+e.id:e.sessionId)}))];}
 async function capture(key,{stored=false}={}){
  const network=key.startsWith('network:'),id=key.slice(network?8:6);let source,entry;
  if(network){source=await root.PlayroomNetworkLibrary.portableSource(id,{stored});entry=(await entries()).find(e=>e.key===key);}
  else{const session=B().saveLibrary.open(id);entry=B().saveLibrary.list().find(e=>e.id===id);source={kind:'session',session,roomName:entry?.roomName||'',pack:B().packs.exportPack(session.game,session.packVersion)};}
  const file=await T().createRecord({...source,Session:root.TabletopSession,includePack:false}),s=source.session?.current||source.replay.frames.at(-1).state;localSizes.set(key,new TextEncoder().encode(file.text).length);
  return {...file,summary:{game:source.session?.game||source.replay.game,packVersion:source.session?.packVersion||source.replay.packVersion,kind:source.kind,name:source.roomName||'',players:s.players.map(p=>String(p.name).slice(0,40)),finished:s.status==='finished',move:s.move,updatedAt:entry?.updatedAt||Date.now()}};
 }
 async function locate(row,guard){
  const value=await T().inspect(row.file);if(value.pack||value.sha256!==row.checksum)throw Error('SAVE_CHECKSUM');guard();
  const candidates=(await entries()).filter(e=>e.game===value.dependency.id&&e.packVersion===value.dependency.version).sort((a,b)=>Number(b.key.startsWith('network:'))-Number(a.key.startsWith('network:')));
  for(const entry of candidates){guard();const copy=await capture(entry.key,{stored:true});guard();if(copy.checksum===row.checksum)return entry.key;}
 }
 async function receive(row,guard,key=null){
  const value=await T().inspect(row.file);if(value.pack||value.sha256!==row.checksum)throw Error('SAVE_CHECKSUM');
  const prepared=await T().prepare(value,{packs:B().packs,Session:root.TabletopSession,engine:root.TabletopCore});guard();
  if(key){
   if(B().savedInUse(key))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});
   if(key.startsWith('local:')&&value.kind==='session'){
    const id=key.slice(6),existing=B().saveLibrary.open(id);if(existing.game!==prepared.session.game||existing.packVersion!==prepared.session.packVersion||existing.createdAt!==prepared.session.createdAt)throw Object.assign(Error('SAVE_ID_CONFLICT'),{code:'SAVE_ID_CONFLICT'});
    await B().replaceSavedLocal(id,prepared.session,value.roomName,guard);return key;
   }
   if(key.startsWith('network:client:')&&value.kind==='replay'){
    const history=new root.PlayroomNetworkClientHistory(),check=()=>{guard();if(B().savedInUse(key))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});};try{await history.replacePortable(key.slice(15),value.payload,value.roomName,check);root.dispatchEvent(new Event('playroom:save-library-changed'));return key;}finally{history.close();}
   }
   // A portable account archive intentionally has no host recovery authority.
   // Do not forge a network command journal or silently convert a live match.
   throw Object.assign(Error('SAVE_NETWORK_REPLACE'),{code:'SAVE_NETWORK_REPLACE'});
  }
  const history=value.kind==='replay'?new root.PlayroomNetworkClientHistory():null;
  try{const imported=await T().install(prepared,{packs:B().packs,library:B().saveLibrary,clientHistory:history,guard});return imported.kind==='replay'?'network:client:'+imported.id:'local:'+imported.id;}finally{history?.close();}
 }
 async function auto(){
  if(autoJob||!service?.user)return autoJob;const ticket=service.generation;
  const job=(async()=>{while(pending.size&&ticket===service.generation){const keys=[...pending];pending.clear();await root.PlayroomNetworkLibrary.cloudIdle();if(ticket!==service.generation)return;await service.auto(keys);}})().catch(()=>{}).finally(()=>{if(autoJob===job)autoJob=null;});autoJob=job;return job;
 }
 function saved(key,{finished=false,menu=false}={}){if(!service?.user)return;service.dirty(key);if(finished||menu){pending.add(key);void auto();}}
 async function scan(){const ticket=service?.generation;await refresh();if(!service?.user||ticket!==service.generation)return;for(const entry of await entries()){if(ticket!==service.generation)return;pending.add(entry.key);}return auto();}
 function renderDialog(){
  const content=detailFrame?.state!=='disposed'&&detailFrame?.element.querySelector('[data-cloud-dialog]');if(!content||!dialog)return;
  const key=dialog,r=service?.remoteFor(key),state=service?.user?service.state(key):'off',enabled=pendingEntry?.key===key?pendingEntry.enabled:service?.automatic(key),bytes=localSizes.get(key)??(state==='synced'?r?.bytes:null);
  const meter=`${quotaCardMarkup()}<p class="cloud-save-size">Это сохранение: <strong>${bytes==null?'Определяем размер…':H().esc(size(bytes))}</strong></p>${service?.jobs.has(key)?`<div class="status-meter-caption"><span>Передаём данные…</span></div>${Meter.markup({label:'Передача сохранения',state:'busy'})}`:''}`;
  const action=(name,label,icon,disabled=false)=>H().iconButton(`data-cloud-action="${name}"`,label,icon,{disabled:busy||service.jobs.has(key)||disabled,className:name==='delete'?'cloud-save-delete ui-action-danger':name==='sync'?'cloud-save-sync':''});
  const cloud=service?.user?`<label class="switch"><span>Автосохранение в облако</span><input type="checkbox" data-cloud-entry ${enabled?'checked':''} ${busy||service.jobs.has(key)?'disabled':''}></label><div class="cloud-save-actions ui-action-row">${action('delete','Удалить из облака','trash',!r||r.deleted)}${action('upload','Отправить в облако','cloud-upload')}${action('download','Получить из облака','cloud-download',!r||r.deleted)}${action('sync','Синхронизация','sync')}</div>`:H().button({attrs:'data-account-open',label:'Войти в аккаунт',icon:'cloud'});
  root.PlayroomDOM.ListController.update(content,`${cloud}${meter}<p class="cloud-save-status" role="${message?'alert':'status'}">${H().esc(message||labels[state])}${!message&&r&&!r.deleted?' · '+H().esc(new Date(r.updated_at).toLocaleString('ru-RU')):''}</p>`);
 }
 async function show(key){
  const ticket=++detailOpening,generation=service?.generation;dialog=key;message='';
  const network=key.startsWith('network:'),id=key.slice(network?8:6),head=H().modalHead('Сохранение').replace('</header>',H().iconButton(`data-save-export="${H().esc(id)}" ${network?'data-save-network="true"':''}`,'Экспорт в файл','file-export')+'</header>');
  detailFrame=B().openModal(head+'<div data-cloud-dialog></div>','cloud-save-modal',{valid:()=>ticket===detailOpening&&generation===service?.generation,onDispose:()=>{if(ticket===detailOpening){detailFrame=null;dialog=null;}}});
  renderDialog();await Promise.all([refresh(),capture(key,{stored:true}).catch(error=>{if(ticket===detailOpening&&detailFrame?.state!=='disposed')message=errors[error.code||error.message]||root.PlayroomMessages.error(error);})]);
  if(ticket===detailOpening)renderDialog();
 }
 function remoteEntries(keys,{finished}={}){
  if(!service?.user)return [];
  const linked=new Set(keys.map(key=>service.bindings[key]?.id));
  // Missing summaries stay available among active saves; invalid archives remain recoverable.
  return newestSaves(service.entries.filter(entry=>!entry.deleted&&!linked.has(entry.id)&&(typeof finished!=='boolean'||!!entry.summary?.finished===finished)));
 }
 function remoteCount(keys,options){return remoteEntries(keys,options).length;}
 async function removeAll(){
  if(busy||!service?.user)return false;const ticket=service.generation,origin=operationOrigin();
  if(!await H().confirmDialog('Удалить все сохранения из облака? Локальные партии останутся.'))return false;
  service.guard(ticket);busy=true;update();
  try{const list=await entries();service.guard(ticket);await service.removeAll(list.map(entry=>entry.key));for(const entry of list)pending.delete(entry.key);finishOperation(origin,ticket);return true;}
  finally{busy=false;update();}
 }
 function remoteMarkup(keys,options){return remoteEntries(keys,options).map(e=>{const s=e.summary||{};return H().sessionCard({className:'saved-game cloud-only-game',attrs:`data-cloud-id="${H().esc(e.id)}"`,gameName:B().meta(s.game)?.name||s.game||'Партия',mode:'hotseat',status:H().icon('cloud-check'),badgeTitle:'В облаке',roomName:s.name||'',progress:'В облаке · '+size(e.bytes),actions:H().iconButton(`data-cloud-fetch="${H().esc(e.id)}"`,'Получить из облака','down'),details:`<p>${H().esc(s.packVersion||'')} · ${H().esc(savedDate(e))}</p>`,bottomAction:H().iconButton(`data-cloud-remove-remote="${H().esc(e.id)}"`,'Удалить из облака','trash',{className:'ui-action-danger'})});}).join('');}
 // Each data screen owns its connected frame. Background updates may patch it,
 // but an old read must never target a later screen or another account's dialog.
 let dataTab='device',dataFrame=null,deviceEntries=[],dataLoading=false,dataError='',dataOpening=0,usage=null,usageLoading=false,usageError=false,usageDirty=false,deviceRead=0;
 const dataNode=()=>dataFrame?.state!=='disposed'&&dataFrame?.element.querySelector('[data-storage-content]');
 function dataRow(attrs,label,description='',disabled=false,danger=false){const glyph=danger?'trash':attrs.includes('data-save-import')?'file-import':attrs.includes('data-save-export')?'file-export':attrs.includes('data-storage-account')?'player':'refresh';return `<button type="button" class="menu-row${danger?' data-action-danger':''}" ${attrs} ${disabled?'disabled':''}><span><strong>${H().esc(label)}</strong>${description?`<small>${H().esc(description)}</small>`:''}</span>${H().icon(glyph)}</button>`;}
 function usageMarkup(){
  const known=usage&&!usageLoading,segments=['app','packs','saves'].map(category=>({category,value:known?usage[category]:null}));
  const detail=usageLoading?'Измеряем данные приложения…':usageError?'Не удалось измерить часть данных':usage?.partial?'Учтены доступные данные приложения':'';
  const appIcon='<svg viewBox="96 96 320 320" aria-hidden="true" class="data-app-icon"><g transform="translate(122 122) rotate(-9 134 134)" fill="currentColor"><rect width="122" height="122" rx="30"/><rect x="146" width="122" height="122" rx="30"/><rect y="146" width="122" height="122" rx="30"/><rect x="146" y="146" width="122" height="122" rx="30"/></g></svg>';
  return `<div class="data-overview" data-entity="device-overview"><section class="data-summary" data-entity="device-summary"><strong>${dataLoading?'Читаем сохранения…':dataError?'Сохранения недоступны':`${saveCount(deviceEntries.length)} на устройстве`}</strong><p class="data-total" ${detail?`title="${H().esc(detail)}"`:''}>${appIcon}<span>${known?H().esc(root.PlayroomStorageUsage.number(usage.total/1048576))+' МБ всего':H().esc(detail||'Объём пока неизвестен')}</span></p>${Meter.composition({segments,label:'Занятое место: приложение, игры и сохранения',attrs:'data-storage-composition',state:usageError?'error':'ready'})}<dl class="data-usage-legend">${[['app','Приложение'],['packs','Игры и арты'],['saves','Сохранения']].map(([key,label])=>`<div data-meter-category="${key}"><dt>${label}</dt><dd>${known?H().esc(size(usage[key])):'—'}</dd></div>`).join('')}</dl></section></div>`;
 }
 function localKeyFor(remoteId){return deviceEntries.find(entry=>service?.bindings[entry.key]?.id===remoteId)?.key;}
 function exportRows(){return deviceEntries.map(entry=>{const remote=service?.remoteFor(entry.key),linked=remote&&!remote.deleted,bytes=localSizes.get(entry.key),blocked=entry.invalid||entry.missingPack;
  return `<div class="menu-row" data-entity="${H().esc(entry.key)}">${saveLabel(entry,bytes)}<span class="data-entry-actions">${service?.user?H().iconButton(`data-cloud-transfer="${H().esc(entry.key)}"`,linked?'Синхронизировать':'Выгрузить в облако',linked?'cloud-sync':'cloud-upload',{disabled:busy||blocked}):''}${H().iconButton(`data-save-export="${H().esc(entry.exportId)}" ${entry.network?'data-save-network="true"':''}`,'Экспорт в файл','file-export',{disabled:blocked})}${H().iconButton(`data-device-remove="${H().esc(entry.key)}"`,'Удалить с устройства','trash',{disabled:busy,className:'ui-action-danger'})}</span></div>`;}).join('');}
 function cloudRows(){return remoteEntries([]).map(entry=>{const key=localKeyFor(entry.id);return `<div class="menu-row" data-entity="cloud:${H().esc(entry.id)}">${saveLabel(entry,entry.bytes)}<span class="data-entry-actions">${H().iconButton(key?`data-cloud-transfer="${H().esc(key)}"`:`data-cloud-fetch="${H().esc(entry.id)}"`,key?'Синхронизировать':'Получить на устройство',key?'cloud-sync':'cloud-download',{disabled:busy})}${H().iconButton(`data-cloud-remove-remote="${H().esc(entry.id)}"`,'Удалить из облака','trash',{disabled:busy,className:'ui-action-danger'})}</span></div>`;}).join('');}
 const sizeStamps=new Map();
 async function measureFiles(ticket,read){for(const entry of deviceEntries){
  if(ticket!==dataOpening||read!==deviceRead||!dataNode())return;const stamp=JSON.stringify([entry.updatedAt,entry.move,entry.revision,entry.packVersion]);if(sizeStamps.get(entry.key)===stamp&&localSizes.has(entry.key))continue;
  await new Promise(resolve=>(root.requestIdleCallback||root.setTimeout)(resolve,root.requestIdleCallback?{timeout:200}:0));if(ticket!==dataOpening||read!==deviceRead||!dataNode())return;
  try{await capture(entry.key,{stored:true});if(ticket!==dataOpening||read!==deviceRead)return;sizeStamps.set(entry.key,stamp);renderData();}catch{/* A missing dependency must not block the rest of the list. */}
 }}
 function renderData(){
  const node=dataNode();if(!node)return;
  const tabs=dataFrame.element.querySelector('[data-storage-tabs]');tabs.style.setProperty('--page-index',dataTab==='cloud'?1:0);for(const tab of tabs.querySelectorAll('button'))tab.setAttribute('aria-selected',String(tab.dataset.storageTab===dataTab));H().bindPageTabs(tabs,{panel:node,current:()=>dataFrame?.state==='active'});
  const quick=dataFrame.element.querySelector('[data-storage-quick]');root.PlayroomDOM.ListController.update(quick,(dataTab==='device'?H().iconButton('data-save-import','Импорт партии','file-import'):'')+H().iconButton(dataTab==='device'?'data-storage-measure':'data-storage-refresh','Обновить','refresh',{disabled:dataTab==='device'?usageLoading:service?.loading||busy}));
  let markup;
  if(dataTab==='device')markup=`${usageMarkup()}${dataError?`<p role="alert">${H().esc(dataError)}</p>`:''}<div class="menu-list" data-entity="device-actions">${dataRow('data-clear-games-confirm','Удалить все сохранения','Сохранения в облаке останутся',dataLoading||!!dataError||!deviceEntries.length||busy,true)}</div><section class="data-save-list menu-list" data-storage-exports aria-label="Сохранения на устройстве">${dataLoading?'<p role="status">Чтение сохранений…</p>':deviceEntries.length?exportRows():'<p class="data-note">Сохранений пока нет.</p>'}</section>`;
  else if(service?.user){
   const count=remoteEntries([]).length,state=service.error?'Не удалось обновить облако':service.loading?'Обновляем сохранения…':service.loaded?`${saveCount(count)} в облаке`:'Загружаем сохранения…';
   markup=`<div class="data-overview" data-entity="cloud-overview"><section class="data-summary" data-entity="cloud-summary"><strong>${H().esc(state)}</strong><p class="data-total" ${service.cachedUsage&&!service.loaded?'title="Последнее известное значение"':''}>${quotaInlineMarkup()} <span>всего</span></p>${barMarkup()}</section>${settings()}</div>${service.error?`<p role="alert">${H().esc(errors[service.error]||'Не удалось обновить сохранения. Повторите проверку.')}</p>`:''}<div class="menu-list" data-entity="cloud-actions">${dataRow('data-cloud-remove-all','Удалить все сохранения','Сохранения на устройстве останутся',!service.loaded||!count||service.loading||busy,true)}</div><section class="data-save-list menu-list" aria-label="Сохранения в облаке">${service.loaded&&count?cloudRows():service.loaded?'<p class="data-note">Сохранений пока нет.</p>':'<p role="status">Список ещё не загружен.</p>'}</section>`;
  }else markup=`<section class="data-summary"><strong>Сохранения на разных устройствах</strong><p>Войдите в аккаунт, чтобы сохранять партии в облаке и получать их на других устройствах.</p></section><nav class="menu-list">${dataRow('data-storage-account','Войти или создать аккаунт')}</nav>`;
  root.PlayroomDOM.ListController.update(node,markup);
 }
 async function measureUsage(ticket=dataOpening){
  if(!dataNode())return;if(usageLoading){usageDirty=true;return;}usageLoading=true;usageError=false;renderData();
  try{const value=await root.PlayroomStorageUsage.measure();if(ticket!==dataOpening)return;usage=value;}
  catch(_){if(ticket===dataOpening)usageError=true;}
  finally{if(ticket===dataOpening){usageLoading=false;renderData();if(usageDirty){usageDirty=false;void measureUsage(ticket);}}}
 }
 async function showData(){
  const back=B().captureModalReturn(),ticket=++dataOpening;dataTab='device';deviceEntries=[];dataLoading=true;dataError='';usage=null;usageLoading=false;usageError=false;usageDirty=false;
  dataFrame=B().openModal(H().modalHead('Данные').replace('</h2>','</h2><div class="data-quick-actions" data-storage-quick role="group" aria-label="Быстрые действия"></div>')+`<div class="parameter-screen-content">${H().pageTabs({label:'Место хранения',tabs:[['device','Устройство'],['cloud','Облако']],value:'device',attribute:'data-storage-tab',attrs:'data-storage-tabs'})}<div data-storage-content></div></div>`,'storage-data-modal',{size:'large',onBack:back,onDispose:()=>{if(ticket===dataOpening){dataFrame=null;dataOpening++;}}});renderData();void refresh();void measureUsage(ticket);
  await readDeviceEntries(ticket);
 }
 async function readDeviceEntries(ticket=dataOpening){
  const read=++deviceRead;
  try{const local=B().saveLibrary.list().map(e=>({...e,key:'local:'+e.id,exportId:e.id})),network=await root.PlayroomNetworkLibrary.list();if(ticket!==dataOpening||read!==deviceRead||!dataNode())return;dataError='';deviceEntries=newestSaves([...local,...network.map(e=>({...e,network:true,exportId:e.role==='client'?'client:'+e.id:e.sessionId,key:'network:'+(e.role==='client'?'client:'+e.id:e.sessionId)}))]);}
  catch(_){if(ticket===dataOpening&&read===deviceRead)dataError='Не удалось прочитать сохранения. Попробуйте открыть раздел ещё раз.';}
  finally{if(ticket===dataOpening&&read===deviceRead){dataLoading=false;renderData();void measureFiles(ticket,read);}}
 }
 function operationOrigin(){return document.querySelector('#modal-root>[data-surface-state="active"]');}
 function finishOperation(origin,generation){
  if(service?.user)service.guard(generation);else if(service?.generation!==generation)throw Object.assign(Error('account-changed'),{code:'account-changed'});
  const active=operationOrigin();if(origin!==active||origin&&!origin.isConnected)return;
  if(origin&&origin===dataFrame?.element){void readDeviceEntries();void measureUsage();}
  else B().showSessions();
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-surface-state="suspended"]'))return;
  if(event.target.closest('[data-storage-account]')){root.PlayroomAccountUI.show();return;}
  if(event.target.closest('[data-cloud-data-open]')){void showData();return;}
  const tab=event.target.closest('[data-storage-tab]');if(tab&&dataFrame?.state==='active'&&dataFrame.element.contains(tab)){dataTab=tab.dataset.storageTab;renderData();return;}
  if(event.target.closest('[data-storage-measure]'))void measureUsage();
  if(event.target.closest('[data-storage-refresh]'))void refresh();
  if(event.target.closest('[data-cloud-remove-all]'))void removeAll().catch(error=>B().toast(root.PlayroomMessages.error(error)));
 });
 async function execute(action){
  if(busy)return;
  const frame=detailFrame,origin=operationOrigin(),generation=service?.generation,hub=origin?null:document.querySelector('#app .shared-page-panel.is-active');
  busy=true;message='';update();
  try{await action();}
  catch(error){
   if(error.code==='cancelled'||generation!==service?.generation||operationOrigin()!==origin||origin&&!origin.isConnected||hub&&(!hub.isConnected||!hub.classList.contains('is-active')))return;
   const text=errors[error.code||error.message]||root.PlayroomMessages.error(error);
   if(detailFrame===frame&&frame?.state==='active'&&origin===frame.element)message=text;else B().toast(text);
  }finally{busy=false;pendingEntry=null;update();}
 }
 function init({account,remote,storage=root.localStorage}){
  service=new root.PlayroomCloudSaveService({account,remote,storage,local:{capture:key=>capture(key,{stored:true}),receive,locate,exists:async key=>(await entries()).some(e=>e.key===key)}});service.subscribe(update);let lastUser=service.user;account.subscribe(()=>{if(service.user===lastUser)return;lastUser=service.user;pending.clear();refreshJob=null;autoJob=null;dialog=null;message='';void refresh();});void refresh();
  root.addEventListener('online',()=>void scan());root.addEventListener('playroom:hub-rendered',()=>void scan());
 }
 root.addEventListener('playroom:save-library-changed',()=>{if(dataNode()){void readDeviceEntries();void measureUsage();}});
 root.addEventListener('playroom:modal-restored',()=>update());
 document.addEventListener('change',event=>{
  if(event.target.closest('[data-surface-state="suspended"]'))return;
  if(event.target.matches('[data-cloud-default]')){const checked=event.target.checked,generation=service.generation;void execute(async()=>{await service.settings(checked);service.guard(generation);await scan();});}
  if(event.target.matches('[data-cloud-entry]')&&dialog){const checked=event.target.checked,key=dialog,generation=service.generation;pendingEntry={key,enabled:checked};void execute(async()=>{await service.toggle(key,checked);service.guard(generation);if(checked)await service.upload(key,{force:!!service.remoteFor(key)?.deleted});});}
 });
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-surface-state="suspended"]'))return;
  const open=event.target.closest('[data-cloud-save]');if(open){void show(open.dataset.cloudSave);return;}
  const removeDevice=event.target.closest('[data-device-remove]');if(removeDevice){const generation=service?.generation,origin=operationOrigin(),key=removeDevice.dataset.deviceRemove;void execute(async()=>{if(!await H().confirmDialog('Удалить эту партию с устройства? Облачная копия останется.'))return;const guard=()=>{if(service?.generation!==generation)throw Object.assign(Error('account-changed'),{code:'account-changed'});if(origin!==operationOrigin()||!origin?.isConnected)throw Object.assign(Error('cancelled'),{code:'cancelled'});};await B().removeSavedDevice(key,guard);finishOperation(origin,generation);});return;}
  const transfer=event.target.closest('[data-cloud-transfer]');if(transfer){const generation=service.generation,origin=operationOrigin(),key=transfer.dataset.cloudTransfer;void execute(async()=>{if(service.remoteFor(key)?.deleted)await service.upload(key,{force:true});else await service.sync(key);service.guard(generation);finishOperation(origin,generation);});return;}
  const fetch=event.target.closest('[data-cloud-fetch]');if(fetch){const generation=service.generation,origin=operationOrigin();void execute(async()=>{if(!await H().confirmDialog('Получить сохранение из облака? Имеющаяся запись этой партии будет синхронизирована.'))return;service.guard(generation);await service.receiveRemote(fetch.dataset.cloudFetch);finishOperation(origin,generation);});return;}
  const remove=event.target.closest('[data-cloud-remove-remote]');if(remove){const generation=service.generation,origin=operationOrigin();void execute(async()=>{if(!await H().confirmDialog('Удалить облачную копию?'))return;service.guard(generation);await service.refresh();service.guard(generation);const r=service.entries.find(e=>e.id===remove.dataset.cloudRemoveRemote);if(r)service.accept(await service.call('delete',{id:r.id,revision:r.revision},generation));finishOperation(origin,generation);});return;}
  const button=event.target.closest('[data-cloud-action]');if(!button||busy||!dialog)return;
  const key=dialog,frame=detailFrame,generation=service.generation;void execute(async()=>{
   const action=button.dataset.cloudAction;
   if(action==='sync'){if(await H().confirmDialog('Синхронизировать сохранение? Локальные изменения отправятся в облако, а новая облачная версия обновит эту же партию.')){service.guard(generation);await service.sync(key);};return;}
   if(action==='delete'){if(await H().confirmDialog('Удалить облачную копию? Локальная история останется.')){service.guard(generation);await service.remove(key);};return;}
   if(action==='upload'){if(await H().confirmDialog('Отправить эту локальную версию в облако? Текущая облачная версия будет заменена.')){service.guard(generation);await service.upload(key,{force:true});};return;}
   if(action==='download'&&await H().confirmDialog('Обновить эту партию облачной версией?')){service.guard(generation);const next=await service.download(key,{force:true});service.guard(generation);if(detailFrame===frame&&frame?.state!=='disposed')dialog=next;}
  });
 });
 root.PlayroomCloudSavesUI=Object.freeze({init,showData,settings,button,quotaInlineMarkup,barMarkup,quotaCardMarkup,remoteMarkup,remoteCount,removeAll,saved,scan,refresh,get service(){return service;}});
})(globalThis);

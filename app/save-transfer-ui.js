/* File transfer UI; private room archives remain behind host-only ports. */
(function(root){
 'use strict';const T=()=>root.PlayroomSaveTransfer,H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge;
 let pending=null,operation=0,returnBack=null;
 const errors={SAVE_TOO_LARGE:'Файл слишком большой (максимум 48 МБ).',SAVE_INVALID:'Не удалось прочитать файл сохранения.',SAVE_FORMAT:'Этот формат сохранения не поддерживается.',SAVE_CHECKSUM:'Файл повреждён: контрольная сумма не совпадает.',SAVE_DEPENDENCY:'Версия игры в файле не совпадает с сохранением.',SAVE_PACK_MISSING:'Нужна точная версия пака. Установите её в менеджере паков и повторите импорт.',SAVE_PACK_CONFLICT:'Установлен другой пак с тем же номером версии. Исходные партии не изменены.',SAVE_REPLAY:'История в файле повреждена.'};
 function error(value){const node=document.querySelector('[data-save-error]');if(node)node.textContent=errors[value.code||value.message]||root.PlayroomMessages.error(value);}
 function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function exportDialog(id,network){pending=null;const back=B().captureModalReturn();B().openModal(H().modalHead('Экспорт партии')+`<p>${network?(id.startsWith('client:')?'Сохранится доступная вам история.':'Сетевая партия станет отдельной локальной копией.'):'Отдельная копия партии.'} Для открытия используется точная версия установленного пака.</p><label class="switch"><span>Включить пак для автономного переноса</span><input type="checkbox" data-save-include-pack></label><p data-save-error role="status"></p><div class="modal-foot">${H().button({attrs:`data-save-download="${H().esc(id)}" ${network?'data-save-network="true"':''}`,label:'Сохранить файл',icon:'file-export'})}</div>`,'save-transfer-modal',{onBack:back});}
 async function select(file){
  const ticket=++operation;pending=null;returnBack=B().captureModalReturn();
  B().openModal(H().modalHead('Импорт партии')+'<p role="status">Чтение файла…</p>','save-transfer-modal',{onBack:()=>{operation++;pending=null;returnBack?.();}});
  try{
   if(file.size>T().MAX_BYTES)throw Error('SAVE_TOO_LARGE');const value=await T().inspect(await file.text());if(ticket!==operation||!document.querySelector('.save-transfer-modal'))return;
   pending={value,ticket};const d=value.dependency,pack=value.pack?'Включена точная версия пака.':'Используется установленная версия пака.';
   B().openModal(H().modalHead('Импорт партии')+`<p><strong>${H().esc(B().meta(d.id)?.name||value.pack?.manifest?.name||d.id)}</strong> · ${H().esc(d.version)}</p><p>${value.kind==='replay'?'История для просмотра.':'Независимая локальная копия партии.'} ${pack}</p><p data-save-error role="status"></p><div class="modal-foot">${H().button({attrs:'data-save-import-cancel',label:'Отмена',variant:'secondary'})}${H().button({attrs:'data-save-import-confirm',label:'Добавить'})}</div>`,'save-transfer-modal',{onBack:()=>{operation++;pending=null;returnBack?.();}});
  }catch(e){if(ticket!==operation||!document.querySelector('.save-transfer-modal'))return;B().openModal(H().modalHead('Импорт партии')+'<p data-save-error role="alert"></p>','save-transfer-modal',{onBack:()=>{operation++;pending=null;returnBack?.();}});error(e);}
 }
 document.addEventListener('click',async event=>{
  const exportButton=event.target.closest('[data-save-export]');if(exportButton){exportDialog(exportButton.dataset.saveExport,exportButton.hasAttribute('data-save-network'));return;}
  if(event.target.closest('[data-save-import]')){const input=document.createElement('input');input.type='file';input.accept='.json,.playroom-save';input.addEventListener('change',()=>{const file=input.files?.[0];if(file)void select(file);},{once:true});input.click();return;}
  if(event.target.closest('[data-save-import-cancel]')){operation++;pending=null;B().closeModal();return;}
  const save=event.target.closest('[data-save-download]');if(save&&!save.disabled){save.disabled=true;try{
   const b=B(),id=save.dataset.saveDownload,source=save.hasAttribute('data-save-network')?await root.PlayroomNetworkLibrary.portableSource(id):(()=>{const session=b.saveLibrary.open(id),entry=b.saveLibrary.list().find(v=>v.id===id);return {kind:'session',session,roomName:entry?.roomName||'',pack:b.packs.exportPack(session.game,session.packVersion)};})();
   const text=await T().create({...source,Session:root.TabletopSession,includePack:!!document.querySelector('[data-save-include-pack]')?.checked});download(text,`${source.session?.game||source.replay.game}-${Date.now()}.playroom-save.json`);B().closeModal();
  }catch(e){error(e);save.disabled=false;}return;}
  const accept=event.target.closest('[data-save-import-confirm]');if(!accept||accept.disabled||!pending)return;
  const request=pending;accept.disabled=true;
  try{
   if(root.PlayroomNetworkLibrary.hasActiveRoom()||B().room())throw Error('Сначала выйдите из текущей комнаты.');
   const prepared=await T().prepare(request.value,{packs:B().packs,Session:root.TabletopSession,engine:root.TabletopCore});
   if(pending!==request||!document.querySelector('.save-transfer-modal'))return;
   const history=request.value.kind==='replay'?new root.PlayroomNetworkClientHistory():null;
   try{await T().install(prepared,{packs:B().packs,library:B().saveLibrary,clientHistory:history});}finally{history?.close();}
   if(pending===request&&document.querySelector('.save-transfer-modal')){pending=null;operation++;B().closeModal(true);B().showSessions();}
  }catch(e){error(e);accept.disabled=false;}
 });
 root.PlayroomSaveTransferUI=Object.freeze({select,exportDialog});
})(globalThis);

/* File transfer UI; private room archives remain behind host-only ports. */
(function(root){
 'use strict';
 const T=()=>root.PlayroomSaveTransfer,H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,N=()=>root.PlayroomNetworkLibrary;
 let current=null;
 const errors={SAVE_TOO_LARGE:'Файл слишком большой (максимум 48 МБ).',SAVE_INVALID:'Не удалось прочитать файл сохранения.',SAVE_FORMAT:'Этот формат сохранения не поддерживается.',SAVE_CHECKSUM:'Файл повреждён: контрольная сумма не совпадает.',SAVE_DEPENDENCY:'Версия игры в файле не совпадает с сохранением.',SAVE_PACK_MISSING:'Нужна точная версия пака. Установите её в менеджере паков и повторите импорт.',SAVE_PACK_CONFLICT:'Установлен другой пак с тем же номером версии. Исходные партии не изменены.',SAVE_REPLAY:'История в файле повреждена.',SAVE_ROOM_ACTIVE:'Сначала выйдите из текущей комнаты.'};
 const top=()=>document.getElementById('modal-root')?.querySelector(':scope>[data-surface-state="active"]');
 const alive=view=>!!view&&!view.disposed&&view.frame?.state!=='disposed'&&!!view.frame?.element.isConnected;
 const active=view=>alive(view)&&view.frame.state==='active';
 const modal=view=>alive(view)?view.frame.element.querySelector('.save-transfer-modal'):null;
 const cancelled=()=>Object.assign(Error('cancelled'),{code:'cancelled'});
 function error(view,value){
  if(!alive(view)||value?.code==='cancelled')return;
  const node=modal(view)?.querySelector('[data-save-error]');
  if(node)node.textContent=errors[value.code||value.message]||root.PlayroomMessages.error(value);
 }
 function open(kind,body,options={}){
  const previous=current,back=B().captureModalReturn(),view={kind,...options,previous,disposed:false,frame:null,operation:0,pending:null,busy:false};current=view;
  view.frame=B().openModal(H().modalHead(kind==='import'?'Импорт партии':'Экспорт партии')+body,'save-transfer-modal',{
   valid:()=>!view.disposed,
   onBack:back,
   onDispose:()=>{view.disposed=true;view.operation++;view.pending=null;if(current===view)current=alive(previous)?previous:null;}
  });
  return view;
 }
 function renderImport(view,body){
  const node=modal(view);if(!node)return;
  const headingId=node.querySelector('.modal-head h2')?.id;
  H().updateModal(node,H().modalHead('Импорт партии')+body);
  if(headingId)node.querySelector('.modal-head h2').id=headingId;
 }
 function pop(view){if(active(view))B().closeModal();}
 function download(text,name){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function exportDialog(id,network){
  return open('export',`<p>${network?(id.startsWith('client:')?'Сохранится доступная вам история.':'Сетевая партия станет отдельной локальной копией.'):'Отдельная копия партии.'} Для открытия используется точная версия установленного пака.</p><label class="switch"><span>Включить пак для автономного переноса</span><input type="checkbox" data-save-include-pack></label><p data-save-error role="status"></p><div class="modal-foot">${H().button({attrs:`data-save-download="${H().esc(id)}" ${network?'data-save-network="true"':''}`,label:'Сохранить файл',icon:'file-export'})}</div>`,{id,network});
 }
 async function select(file){
  if(!file)return;
  const view=open('import','<p role="status">Чтение файла…</p><p data-save-error role="alert"></p>'),ticket=++view.operation;
  try{
   if(file.size>T().MAX_BYTES)throw Error('SAVE_TOO_LARGE');
   const text=await file.text();if(!alive(view)||ticket!==view.operation)return;
   const value=await T().inspect(text);if(!alive(view)||ticket!==view.operation)return;
   view.pending=value;const dependency=value.dependency,pack=value.pack?'Включена точная версия пака.':'Используется установленная версия пака.';
   renderImport(view,`<p><strong>${H().esc(B().meta(dependency.id)?.name||value.pack?.manifest?.name||dependency.id)}</strong> · ${H().esc(dependency.version)}</p><p>${value.kind==='replay'?'История для просмотра.':'Независимая локальная копия партии.'} ${pack}</p><p data-save-error role="alert"></p><div class="modal-foot">${H().button({attrs:'data-save-import-cancel',label:'Отмена',variant:'secondary'})}${H().button({attrs:'data-save-import-confirm',label:'Добавить'})}</div>`);
  }catch(failure){if(alive(view)&&ticket===view.operation)error(view,failure);}
 }
 function accountKey(){const service=root.PlayroomCommunityUI?.service,state=root.PlayroomAccountUI?.service?.snapshot();return JSON.stringify([state?.kind,state?.id,!!state?.recovery,service?.generation]);}
 async function exportFile(view,button){
  const ticket=++view.operation,includePack=!!modal(view).querySelector('[data-save-include-pack]')?.checked,identity=view.network?accountKey():null;
  const liveHost=view.network?N().transferContext?.():null,host=liveHost?.sessionId===view.id?{roomId:liveHost.room.id,ownerId:liveHost.room.ownerId,sessionId:liveHost.sessionId}:null;
  const guard=()=>{const live=host?N().transferContext?.():null;if(!active(view)||ticket!==view.operation||view.network&&identity!==accountKey()||host&&(!live||live.room.id!==host.roomId||live.room.ownerId!==host.ownerId||live.sessionId!==host.sessionId))throw cancelled();};
  view.busy=true;button.disabled=true;
  try{
   guard();const b=B(),source=view.network?await N().portableSource(view.id):(()=>{const session=b.saveLibrary.open(view.id),entry=b.saveLibrary.list().find(row=>row.id===view.id);return {kind:'session',session,roomName:entry?.roomName||'',pack:b.packs.exportPack(session.game,session.packVersion)};})();guard();
   const text=await T().create({...source,Session:root.TabletopSession,includePack});guard();
   download(text,`${source.session?.game||source.replay.game}-${Date.now()}.playroom-save.json`);pop(view);
  }catch(failure){if(ticket===view.operation)error(view,failure);}
  finally{if(alive(view)&&ticket===view.operation){view.busy=false;button.disabled=false;}}
 }
 async function importFile(view,button){
  const value=view.pending,ticket=++view.operation;
  const guard=()=>{if(!active(view)||ticket!==view.operation||view.pending!==value)throw cancelled();if(N().hasActiveRoom()||B().room())throw Object.assign(Error('SAVE_ROOM_ACTIVE'),{code:'SAVE_ROOM_ACTIVE'});};
  view.busy=true;button.disabled=true;
  try{
   guard();const prepared=await T().prepare(value,{packs:B().packs,Session:root.TabletopSession,engine:root.TabletopCore});guard();
   const history=value.kind==='replay'?new root.PlayroomNetworkClientHistory():null;let result;
   try{result=await T().install(prepared,{packs:B().packs,library:B().saveLibrary,clientHistory:history,guard});}finally{history?.close();}
   guard();view.pending=null;pop(view);
   root.dispatchEvent(new CustomEvent('playroom:save-library-changed',{detail:result}));
   if(!top())B().showSessions();
  }catch(failure){if(ticket===view.operation)error(view,failure);}
  finally{if(alive(view)&&ticket===view.operation){view.busy=false;button.disabled=false;}}
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[inert],[data-surface-state="suspended"]'))return;
  const exportButton=event.target.closest('[data-save-export]');
  if(exportButton){exportDialog(exportButton.dataset.saveExport,exportButton.hasAttribute('data-save-network'));return;}
  const chooser=event.target.closest('[data-save-import]');
  if(chooser){
   const origin=top(),input=document.createElement('input');input.type='file';input.accept='.json,.playroom-save';
   input.addEventListener('change',()=>{const file=input.files?.[0];if(file&&chooser.isConnected&&top()===origin&&!chooser.closest('[inert],[hidden]')&&chooser.getClientRects().length)void select(file);},{once:true});input.click();return;
  }
  const view=current;if(!active(view)||!view.frame.element.contains(event.target))return;
  if(event.target.closest('[data-save-import-cancel]')){pop(view);return;}
  const button=event.target.closest('[data-save-download],[data-save-import-confirm]');if(!button||button.disabled||view.busy)return;
  if(button.hasAttribute('data-save-download')&&view.kind==='export')void exportFile(view,button);
  else if(button.hasAttribute('data-save-import-confirm')&&view.kind==='import'&&view.pending)void importFile(view,button);
 });
 root.PlayroomSaveTransferUI=Object.freeze({select,exportDialog});
})(globalThis);

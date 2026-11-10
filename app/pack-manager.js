if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORAGE = 'playroom.packs.v1';
  const DISPLAY_STORAGE = 'playroom.pack-display.v1';
  const DEFAULT_ORDER = ['mage-brawl','uno','ludo','battleship','klondike','spider','durak','pexeso','oldmaid','gofish','yatzy','snakes','domino','checkers','tictactoe'];
  const validId = value => typeof value === 'string' && /^[a-z0-9_-]{1,100}$/.test(value);
  function displayPreferences() {
    try {
      const saved=JSON.parse(localStorage.getItem(DISPLAY_STORAGE)||'{}');
      const clean=key=>Array.isArray(saved[key])?[...new Set(saved[key].filter(validId))]:[];
      const hidden=clean('hidden');
      return {order:clean('order'),hidden,favorites:clean('favorites').filter(id=>!hidden.includes(id))};
    } catch (_) { return {order:[],hidden:[],favorites:[]}; }
  }
  function storeDisplay(preferences) {
    const hidden=[...new Set(preferences.hidden)],favorites=[...new Set(preferences.favorites)].filter(id=>!hidden.includes(id));
    localStorage.setItem(DISPLAY_STORAGE,JSON.stringify({...preferences,hidden,favorites}));
  }
  function category(id,preferences=displayPreferences()) {
    return preferences.hidden.includes(id)?'hidden':preferences.favorites.includes(id)?'favorites':'normal';
  }
  function setCategory(id,target) {
    if(!validId(id)||!['favorites','normal','hidden'].includes(target))return;
    const preferences=displayPreferences();
    preferences.hidden=preferences.hidden.filter(item=>item!==id);
    preferences.favorites=preferences.favorites.filter(item=>item!==id);
    if(target==='hidden')preferences.hidden.push(id);
    if(target==='favorites')preferences.favorites.push(id);
    storeDisplay(preferences);
  }
  function moveGame(id,target,beforeId,ids) {
    if(!validId(id)||!['favorites','normal','hidden'].includes(target)||!Array.isArray(ids)||!ids.includes(id))return;
    const preferences=displayPreferences(),sequence=ordered(ids,preferences).filter(item=>item!==id);
    const targetItems=sequence.filter(item=>category(item,preferences)===target);
    const insertion=beforeId&&targetItems.includes(beforeId)?sequence.indexOf(beforeId):targetItems.length?sequence.indexOf(targetItems.at(-1))+1:sequence.length;
    sequence.splice(insertion,0,id);
    preferences.order=sequence;
    preferences.hidden=preferences.hidden.filter(item=>item!==id);
    preferences.favorites=preferences.favorites.filter(item=>item!==id);
    if(target==='hidden')preferences.hidden.push(id);
    if(target==='favorites')preferences.favorites.push(id);
    storeDisplay(preferences);
  }
  function ordered(ids,preferences=displayPreferences()) {
    const sequence=[...new Set(ids)];
    const order=new Map([...new Set([...preferences.order,...DEFAULT_ORDER,...sequence])].map((id,index)=>[id,index]));
    return sequence.sort((a,b)=>order.get(a)-order.get(b));
  }
  function toggleFavorite(id) {
    if(!validId(id))return;
    setCategory(id,category(id)==='favorites'?'normal':'favorites');
  }
  root.PlayroomCatalog ||= {};
  root.PlayroomPacksReady=(async()=>{
    if(!root.TabletopPacks)return;
    const data=await new root.PlayroomDataStorage().open();root.PlayroomData=data;
    root.PlayroomPacks=new root.TabletopPacks({engine:root.TabletopCore,views:root.PlayroomViews,catalog:root.PlayroomCatalog,
      storage:await root.PlayroomPackStorage.create({data,key:STORAGE})});
    await root.PlayroomPacks.bootstrap(root.PlayroomInstalledPacks||[]);
    root.PlayroomPackLoadError=root.PlayroomPacks.warnings.join(' ');
    root.PlayroomRemotePacks=root.PlayroomRemoteCatalog?new root.PlayroomRemoteCatalog.RemoteCatalog({manager:root.PlayroomPacks}):null;
  })();
  // A removed save no longer pins conflicting code under the same version.
  // The default loader remains conservative until explicit references can be checked.
  async function reconcile(manager,library,bundles=root.PlayroomInstalledPacks||[]) {
    if(!manager?.bootstrap||!library?.references||!Array.isArray(bundles))return manager?.list?.()||[];
    const list=await manager.bootstrap(bundles,{preserveSavedConflict:(id,version)=>library.references(id,version).length>0});
    root.PlayroomPackLoadError=manager.warnings?.join(' ')||'';
    return list;
  }
  function create({manager,library,networkLibrary,openModal,modalHead,toast,onChange,onCatalog=()=>{},captureOperation=()=>({current:()=>true,guard:()=>{}})}) {
    let pending = null, message = '', reading = 0, savedScroll = null, busy = false,previewReturn=null;
    const remote=root.PlayroomRemotePacks;
    const availableIds=new Set(),onlineStates=new Map();
    const title = manifest => manifest.name || manifest.title || manifest.id;
    const references = (id,version) => library.references(id,version);
    const cleanup=new root.PlayroomPackUpdateCleanup({manager,localReferences:references,networkArchives:()=>networkLibrary.list({strict:true}),activeRoom:()=>!!networkLibrary.hasActiveRoom?.(),compare:manager.constructor.compareVersions});
    function currentBootWarnings(){
      const warnings=root.PlayroomPacks?.warnings||[];
      // A bundled version conflict matters to the user while a saved game
      // still references it. Re-evaluate instead of freezing startup warnings.
      const quarantineTemplate=globalThis.PlayroomMessages.text('ui.packs.acf425f8c8f5',{p0:'__PACK_COUNT__'}).split('__PACK_COUNT__');
      const visible=warnings.filter(warning=>{
        if(quarantineTemplate.length===2&&warning.startsWith(quarantineTemplate[0])&&warning.endsWith(quarantineTemplate[1]))return false;
        const match=/^Встроенный пакет ([a-z0-9_-]+)@([^\s]+) отличается/.exec(warning);
        return !match||references(match[1],match[2]).length>0;
      });
      const loadError=root.PlayroomPackLoadError;
      const fatal=loadError&&loadError!==warnings.join(' ')?loadError:'';
      return [fatal,...visible,...(manager.quarantined?.length?[globalThis.PlayroomMessages.text('ui.packs.acf425f8c8f5',{p0:String(manager.quarantined.length)})]:[])].filter(Boolean).join(' ');
    }
    const H=root.PlayroomGameScreen;
    const actionRow=(attrs,label,{disabled=false,danger=false,icon='next'}={})=>`<button type="button" class="packs-v021-action ${danger?'is-danger ui-action-danger':''}" ${attrs} ${busy||disabled?'disabled':''}><span>${esc(label)}</span>${H.icon(icon)}</button>`;
    const catalogEntries=()=>remote?.pending()||[];
    const catalogAvailability=()=>remote?.availability?.()||{available:!!remote,reason:remote?'':'Каталог игр сейчас недоступен.'};
    const updates=()=>{const ids=new Set(manager.list().map(item=>item.id));return catalogEntries().filter(item=>ids.has(item.id));};
    const cover=(id,manifest)=>`<span class="packs-v021-art" data-theme="${H.tileTheme(manifest)}" aria-hidden="true">${root.PlayroomViews?.cover(id)||H.icon('gamepad')}</span>`;
    function listMarkup() {
      const source=manager?.list()||[],preferences=displayPreferences(),ids=ordered(source.filter(item=>item.active).map(item=>item.id),preferences),position=id=>ids.indexOf(id)<0?ids.length:ids.indexOf(id);
      const list=source.slice().sort((a,b)=>position(a.id)-position(b.id)||Number(b.active)-Number(a.active));
      if(!list.length)return '<p class="packs-v021-empty">На устройстве пока нет игр. Выберите игру во вкладке «Доступно» или импортируйте файл кнопкой вверху.</p>';
      return `<ul class="packs-v021-list">${list.map(item=>{
        const count=references(item.id,item.version).length,name=title(item.manifest),update=item.active?catalogEntries().find(next=>next.id===item.id):null,key=item.id+'@'+item.version;
        const status=update?'Доступно обновление · '+update.version:item.active?'Установлено':'Предыдущая версия';
        const controls=item.active?`<div class="packs-v021-order-steps" role="group" aria-label="Порядок в каталоге">${actionRow(`data-pack-move="${esc(item.id)}" data-direction="-1"`,'Выше',{icon:'up',disabled:ids.indexOf(item.id)===0})}${actionRow(`data-pack-move="${esc(item.id)}" data-direction="1"`,'Ниже',{icon:'down',disabled:ids.indexOf(item.id)===ids.length-1})}</div>`+actionRow(`data-pack-visibility="${esc(item.id)}" aria-pressed="${preferences.hidden.includes(item.id)}"`,preferences.hidden.includes(item.id)?'Показать':'Скрыть',{icon:preferences.hidden.includes(item.id)?'eye':'eye-off'})+actionRow(`data-pack-favorite="${esc(item.id)}" aria-pressed="${preferences.favorites.includes(item.id)}"`,preferences.favorites.includes(item.id)?'Убрать из избранного':'В избранное',{icon:'star'}):'';
        return `<li class="packs-v021-game" data-installed-pack ${item.active?`data-pack-order-key="${esc(item.id)}"`:''} data-pack-id="${esc(item.id)}" data-pack-version="${esc(item.version)}" data-entity="installed-${esc(key)}"><details class="packs-v021-details" data-pack-details="${esc(key)}"><summary class="packs-v021-game-summary">${item.active?`<button type="button" class="packs-v021-drag-handle" data-pack-drag aria-label="Перетащить ${esc(name)}" title="Перетащить" ${busy?'disabled':''}><span aria-hidden="true">⠿</span></button>`:''}<span class="packs-v021-summary">${cover(item.id,item.manifest)}<span><strong>${esc(name)}</strong><small>v${esc(item.version)} · ${esc(root.PlayroomStorageUsage?.format(item.byteSize||0)||'Размер неизвестен')} · ${esc(status)}${preferences.hidden.includes(item.id)?' · скрыта':preferences.favorites.includes(item.id)?' · избранное':''}</small></span></span><span class="packs-v021-chevron" aria-hidden="true">${H.icon('down')}</span></summary><div>${controls}${actionRow(`data-pack-remove="${esc(item.id)}" data-pack-version="${esc(item.version)}"`,'Удалить версию',{icon:'trash',danger:true})}</div><p class="packs-v021-hint">${count?`Эту версию используют сохранения: ${count}. Перед удалением потребуется отдельное подтверждение.`:'Сохранения используют конкретную версию игры. Перед удалением проверим связанные партии.'}</p></details>${update?H.button({attrs:`data-pack-online="${esc(item.id)}"`,label:'Обновить',icon:'download',variant:'secondary',disabled:busy||!catalogAvailability().available}):''}</li>`;
      }).join('')}</ul>`;
    }
    function previewMarkup() {
      if (!pending) return '';
      const manifest = pending.manifest, known = manager.list().some(item=>item.id===manifest.id);
      return `<section class="pack-preview packs-v021-preview" tabindex="-1" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.13eb691fe3b3")}"><span class="eyebrow">${globalThis.PlayroomMessages.text("ui.pack-manager.080b18f6ca51")}</span><h3>${esc(title(manifest))}</h3><p>${esc(manifest.id)} · ${globalThis.PlayroomMessages.text("ui.pack-manager.d9ae8e2e1567")}${esc(manifest.version)}</p>${manifest.description||manifest.tagline?`<p>${esc(manifest.description||manifest.tagline)}</p>`:''}${manifest.author?`<p>${globalThis.PlayroomMessages.text("ui.pack-manager.745b218447d3")}${esc(typeof manifest.author==='string'?manifest.author:manifest.author.name||globalThis.PlayroomMessages.text("ui.pack-manager.0d836c1579f1"))}</p>`:''}<p class="pack-trust">${globalThis.PlayroomMessages.text("ui.pack-manager.48eac42eff92")}</p>${known?("<p>"+globalThis.PlayroomMessages.text("ui.pack-manager.3c343bc73176")+"</p>"):''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel>${globalThis.PlayroomMessages.text("ui.pack-manager.8fbe9b75cbdf")}</button><button class="btn" data-pack-install ${busy?'disabled':''}>${known?globalThis.PlayroomMessages.text("ui.pack-manager.e6acd89e236f"):globalThis.PlayroomMessages.text("ui.pack-manager.b7cd6fae08d9")}</button></div></section>`;
    }
    let packTab='installed',catalogLoading=false,catalogJob=null,opening=0,packFrame=null,confirmationFrame=null,returnToManager=null,operation=null,packOrder=null,installBatch=null,installAllWhenReady=false;
    const currentModal=()=>packFrame?.state!=='disposed'?packFrame?.element.querySelector('.pack-manager-modal'):null;
    function quickMarkup(){const access=catalogAvailability();return H.iconButton('data-pack-file-open','Импорт файла','file-import',{disabled:busy})+H.iconButton('data-pack-catalog-refresh',catalogLoading?'Проверяем…':'Проверить обновления','refresh',{disabled:busy||catalogLoading||!access.available});}
    function catalogMarkup(){
      const pendingUpdates=updates(),failure=remote?.warning,access=catalogAvailability();
      return `<div class="packs-v021-catalog" data-pack-catalog-status>${operation?`<div class="packs-v021-operation"><p role="status">${esc(operation.label)} · установлено ${operation.done} из ${operation.total}</p>${root.PlayroomStatusMeter.markup({label:'Установлено игр',value:operation.done,max:operation.total,state:'busy',valueText:operation.done+' из '+operation.total})}</div>`:''}${!access.available?`<p role="status" data-pack-catalog-unavailable>${esc(access.reason)}</p>`:catalogLoading?'<p role="status">Проверяем игры и обновления…</p>':failure?`<p role="alert">Не удалось загрузить список игр. Проверьте соединение и повторите проверку.</p><details data-pack-catalog-error><summary>Технические подробности</summary><p>${esc(failure)}</p></details>`:''}${pendingUpdates.length?H.button({attrs:'data-pack-update-all',label:busy?'Обновляем игры…':'Обновить игры · '+pendingUpdates.length,icon:'download',disabled:busy||catalogLoading||!access.available}):''}</div>`;
    }
    function installButton(item,done){
      const job=onlineStates.get(item.id),loading=job?.phase==='loading',name=item.name||item.id;
      return H.iconButton(`data-pack-online="${esc(item.id)}" data-pack-install-state="${done?'ready':loading?'loading':job?.error?'error':'available'}" aria-disabled="${busy||done||!catalogAvailability().available}" aria-busy="${loading}"`,done?'Установлено: '+name:loading?'Устанавливаем: '+name:job?.error?'Повторить установку: '+name:'Установить: '+name,done?'check':loading?'sync':'download',{className:'packs-v021-install'});
    }
    function onlineMarkup(){
      const rows=manager.list(),installed=new Set(rows.map(item=>item.id)),versions=new Set(rows.map(item=>item.id+'@'+item.version)),available=(remote?.current?.packs||[]).filter(item=>!installed.has(item.id)||availableIds.has(item.id)),access=catalogAvailability();
      if(!available.length)return !access.available||catalogLoading||remote?.warning?'':'<p class="packs-v021-empty">Новых игр в каталоге пока нет. Установленные игры находятся в соседней вкладке.</p>';
      const missing=available.filter(item=>!installed.has(item.id)).length,bulk=H.button({attrs:'data-pack-install-all data-entity="install-all"',label:installBatch?`Устанавливаем · ${installBatch.done}/${installBatch.total}`:missing?`Установить все · ${missing}`:'Все игры установлены',icon:missing?'download':'check',className:'packs-v021-install-all',disabled:busy||catalogLoading||!access.available||!missing});
      return `${bulk}<ul class="packs-v021-list">${available.map(item=>{
        availableIds.add(item.id);
        const manifest=root.PlayroomCatalog[item.id]||(root.PlayroomInstalledPacks||[]).find(bundle=>bundle.manifest?.id===item.id)?.manifest||item,name=title(manifest),description=item.tagline||manifest.tagline||'',latest=root.PlayroomUpdateDialog?.releases(item.releases,'0.0.0',item.version).at(-1),error=onlineStates.get(item.id)?.error;
        return `<li class="packs-v021-game" data-available-pack="${esc(item.id)}" data-entity="available-${esc(item.id)}"><div class="packs-v021-summary">${cover(item.id,manifest)}<span class="packs-v021-copy"><strong>${esc(name)}</strong><small>v${esc(item.version)}${item.byteSize?' · '+esc(root.PlayroomStorageUsage.format(item.byteSize)):''}</small></span>${installButton(item,versions.has(item.id+'@'+item.version))}</div>${description?`<p class="packs-v021-description">${esc(description)}</p>`:''}${error?`<p class="packs-v021-install-error" role="alert">${esc(error)}</p>`:''}${!access.available?`<p class="packs-v021-status">Для установки откройте веб-версию</p>`:''}${latest?`<details class="packs-v021-details" data-pack-details="available-${esc(item.id)}"><summary>Последнее обновление</summary>${root.PlayroomUpdateDialog.changes([latest],'0.0.0',item.version,esc)}</details>`:''}</li>`;
      }).join('')}</ul>`;
    }
    function rememberView(modal){return {scroll:modal?.querySelector('.modal-body')?.scrollTop||0,focus:modal?.contains(document.activeElement)?document.activeElement:null,details:new Set([...(modal?.querySelectorAll('[data-pack-details][open]')||[])].map(node=>node.dataset.packDetails))};}
    function restoreView(modal,state){
      if(!modal||!state)return;for(const node of modal.querySelectorAll('[data-pack-details]'))node.open=state.details.has(node.dataset.packDetails);
      if(state.focus?.isConnected&&modal.contains(state.focus)&&!state.focus.disabled)state.focus.focus({preventScroll:true});
      const body=modal.querySelector('.modal-body');if(body)body.scrollTop=state.scroll;
    }
    function refreshOnline(modal){
      if(!modal?.isConnected||currentModal()!==modal)return;
      const state=rememberView(modal),region=modal.querySelector('[data-pack-online-region]'),status=modal.querySelector('[data-pack-catalog-region]'),installed=modal.querySelector('[data-pack-installed-region]');
      const quick=modal.querySelector('[data-pack-quick]');if(quick)root.PlayroomDOM.ListController.update(quick,quickMarkup());
      if(status)root.PlayroomDOM.ListController.update(status,catalogMarkup());
      if(region)root.PlayroomDOM.ListController.update(region,onlineMarkup());
      if(installed)root.PlayroomDOM.ListController.update(installed,listMarkup());restoreView(modal,state);bindOrder();
    }
    function maintenanceMarkup(){
      return `<div class="packs-v021-maintenance menu-list" data-pack-maintenance>${actionRow('data-pack-bulk="old"','Удалить старые версии',{icon:'trash',disabled:!manager.list().some(item=>!item.active),danger:true})}${actionRow('data-pack-bulk="all"','Удалить все игры',{icon:'trash',disabled:!manager.list().length&&!manager.quarantined?.length,danger:true})}${root.PlayroomInstalledPacks?.length?actionRow('data-pack-restore','Восстановить встроенные',{icon:'undo',disabled:busy}):''}${quarantineMarkup()}</div>`;
    }
    function open() {
      if(packFrame&&packFrame.state!=='active')return;
      const state=rememberView(currentModal());
      let disposeTabs=()=>{};const epoch=opening;packFrame=openModal(`${modalHead('Игры').replace('</h2>','</h2><div class="packs-v021-quick" data-pack-quick role="group" aria-label="Быстрые действия">'+quickMarkup()+'</div>')}<main class="packs-v021">${H.pageTabs({label:'Игры',tabs:[['installed','Установлено'],['available','Доступно']],value:packTab,attribute:'data-pack-tab',className:'packs-v021-tabs',idPrefix:'packs-tab-',panelPrefix:'packs-panel-'})}<div class="packs-v021-content">${message?`<p class="pack-message packs-v021-message" role="alert" tabindex="-1">${esc(message)}</p>`:''}${previewMarkup()}<div data-pack-catalog-region>${catalogMarkup()}</div><section id="packs-panel-installed" role="tabpanel" aria-labelledby="packs-tab-installed" data-pack-tab-panel="installed" ${packTab==='installed'?'':'hidden'}><div data-pack-installed-region>${listMarkup()}</div></section><section id="packs-panel-available" role="tabpanel" aria-labelledby="packs-tab-available" data-pack-tab-panel="available" ${packTab==='available'?'':'hidden'}><div data-pack-online-region>${onlineMarkup()}</div></section></div>${maintenanceMarkup()}<input id="pack-file" type="file" hidden accept=".playroom-pack.json,application/json"></main>`,'pack-manager-modal',{valid:()=>epoch===opening,onDispose:()=>{disposeTabs();if(epoch===opening){reading++;packOrder?.dispose();packOrder=null;}}});
      const next=currentModal();if(!next)return;
      disposeTabs=H.bindPageTabs(next.querySelector('.packs-v021-tabs'),{current:()=>epoch===opening&&packFrame?.state==='active'&&currentModal()===next});
      restoreView(next,state);
      if(savedScroll!==null){next.querySelector('.modal-body')?.scrollTo(0,savedScroll);savedScroll=null;}
      bindOrder();
    }
    function bindOrder(){
      packOrder?.dispose();packOrder=null;const owner=packFrame,epoch=opening,modal=currentModal(),list=modal?.querySelector('.packs-v021-list');if(!list||!root.PlayroomOrderUI)return;
      const current=()=>owner===packFrame&&owner.state==='active'&&epoch===opening&&currentModal()===modal&&packTab==='installed'&&!busy;
      packOrder=root.PlayroomOrderUI.create({list,rows:()=>[...list.querySelectorAll(':scope>[data-pack-order-key]')],key:row=>row.dataset.packOrderKey,handle:'[data-pack-drag]',current,scroll:()=>modal.querySelector('.modal-body'),previewClass:'packs-v021-drag-preview',previewOmit:'.packs-v021-details>div,.packs-v021-hint,[data-pack-online]',move:({key,targetKey,after})=>{
        if(!current())return;
        try{const preferences=displayPreferences(),ids=ordered(manager.list().filter(item=>item.active).map(item=>item.id),preferences);if(!ids.includes(key)||!ids.includes(targetKey))return;const next=ids.filter(id=>id!==key);next.splice(next.indexOf(targetKey)+(after?1:0),0,key);preferences.order=next;storeDisplay(preferences);onChange();open();}
        catch(error){message=globalThis.PlayroomMessages.text('ui.pack-manager.25e60c5c8569',{p0:String(globalThis.PlayroomMessages.error(error))});open();}
      }});
    }
    function restoreManager(){const back=returnToManager;returnToManager=null;confirmationFrame=null;return back?.()||false;}
    function quarantineMarkup(){
      const entries=manager.quarantined||[];return entries.length?`<section class="pack-quarantine"><h3>${globalThis.PlayroomMessages.text("ui.pack-manager.6e7a653acf43")}</h3>${entries.map((item,i)=>`<div class="pack-version"><span>${esc(item.bundle?.manifest?.name||item.bundle?.manifest?.id||globalThis.PlayroomMessages.text("ui.pack-manager.3b81a9cb03fe"))} · ${esc(item.bundle?.manifest?.version||'')}<small>${esc(item.reason)}</small></span><button class="icon-btn" data-pack-quarantine="${i}" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.28cee15450c6")}">${root.PlayroomGameScreen.icon('trash')}</button></div>`).join('')}<button class="btn secondary" data-pack-quarantine="all">${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.032311941d8f")}</button></section>`:'';
    }
    async function read(file) {
      const ticket=++reading;if(!previewReturn)previewReturn=rememberView(currentModal());pending=null;message='';
      if(!file)return;
      try {
        if(file.size>4*1024*1024)throw Error(globalThis.PlayroomMessages.text("ui.pack-manager.21a0186eb4e6"));
        const candidate=manager.parse(await file.text());
        if(ticket!==reading)return;
        pending=candidate;
      } catch(error) { if(ticket!==reading)return;message=globalThis.PlayroomMessages.text("ui.pack-manager.2b5db8b50485",{p0:String(globalThis.PlayroomMessages.error(error))}); }
      if(packFrame?.state==='active'){open();const target=currentModal()?.querySelector(pending?'.pack-preview':'.pack-message');target?.focus({preventScroll:true});target?.scrollIntoView({block:'start'});}
    }
    async function install() {
      if(!pending||busy)return;const candidate=pending,id=candidate.manifest.id,owner=packFrame,epoch=opening,capability=captureOperation({idle:true});
      const here=()=>epoch===opening&&owner===packFrame&&owner?.state==='active';busy=true;operation={done:0,total:1,label:'Устанавливаем '+title(candidate.manifest)};open();
      let installed=false;
      try {
        await manager.install(manager.prepare(candidate),{activate:true});installed=true;
        if(epoch===opening){if(pending===candidate)pending=null;previewReturn=null;}

        if(here())message='';
      }catch(error){if(here()&&error.code!=='cancelled')message=globalThis.PlayroomMessages.text("ui.pack-manager.9dfa32b39696",{p0:String(globalThis.PlayroomMessages.error(error))});}
      finally{busy=false;if(epoch===opening){operation=null;if(here()){packTab='installed';open();}}if(installed)onChange();if(here()&&!pending){const item=currentModal()?.querySelector('[data-installed-pack][data-pack-id="'+id+'"] summary');item?.focus({preventScroll:true});item?.scrollIntoView({block:'center'});if(!message)toast(globalThis.PlayroomMessages.text("ui.pack-manager.3c381137bf00",{p0:String(id)}));}}
    }
    async function removalPlan(items,all=false){
      const keys=new Set(items.map(item=>item.id+'@'+item.version));
      const local=[...new Set(items.flatMap(item=>references(item.id,item.version)))];
      const network=(await networkLibrary.list({strict:true})).filter(item=>keys.has(item.game+'@'+item.packVersion)).map(item=>item.role==='client'?'client:'+item.id:item.sessionId);
      return {items,local,network:[...new Set(network)],all,quarantine:all?(manager.quarantined?.length||0):0};
    }
    function confirmation(plan,stage){
      const count=plan.local.length+plan.network.length,all=plan.all;
      const heading=stage===2?globalThis.PlayroomMessages.text("ui.pack-manager.380475d678e5"):all?globalThis.PlayroomMessages.text("ui.pack-manager.c7f7f452038d"):plan.items.length>1?globalThis.PlayroomMessages.text("ui.pack-manager.82c9ddfc1920"):globalThis.PlayroomMessages.text("ui.pack-manager.b1bfe27b597d");
      const description=globalThis.PlayroomMessages.text("ui.pack-manager.324f71e2331b",{p0:String(plan.items.length),p1:String(plan.items.length===1?globalThis.PlayroomMessages.text("ui.pack-manager.2ea58b4c6ceb"):globalThis.PlayroomMessages.text("ui.pack-manager.4a6ab3d027a1")),p2:String(plan.quarantine?globalThis.PlayroomMessages.text("ui.pack-manager.e644f8ebd8ca",{p0:String(plan.quarantine)}):''),p3:String(count?globalThis.PlayroomMessages.text("ui.pack-manager.8f5f617353e2",{p0:String(count),p1:String(plan.local.length),p2:String(plan.network.length)}):'')});
      confirmationFrame=openModal(`${modalHead(heading)}<p class="lead">${esc(description)}</p>${stage===2?("<p class=\"recovery-note\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.pack-manager.2f51c4a895cb")+"</p>"):''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel-remove>${globalThis.PlayroomMessages.text("ui.pack-manager.97b65905439a")}</button><button class="btn coral" data-pack-confirm="${stage}">${root.PlayroomGameScreen.icon('trash')} ${stage===2?globalThis.PlayroomMessages.text("ui.pack-manager.01a2406a32b3"):globalThis.PlayroomMessages.text("ui.pack-manager.be99b1361201")}</button></div>`,'pack-removal-modal',{valid:()=>plan.capability.current({retained:true}),onBack:()=>{planned=null;restoreManager();}});
    }
    let planned=null,quarantineOperation=null;
    async function askRemove(items,all=false){
      if(busy)return;const owner=packFrame,epoch=opening,capability=captureOperation({idle:true});busy=true;savedScroll=currentModal()?.querySelector('.modal-body')?.scrollTop??null;
      try{capability.guard();if(networkLibrary.hasActiveRoom?.())throw Error(globalThis.PlayroomMessages.text("ui.pack-manager.8f8a5c5c96ff"));const plan=await removalPlan(items.map(item=>({id:item.id,version:item.version})),all);capability.guard();if(owner!==packFrame||owner?.state!=='active')return;planned={...plan,capability};returnToManager=root.PlayroomAppBridge?.captureModalReturn?.();confirmation(planned,1);}
      catch(error){if(epoch===opening&&owner===packFrame&&owner?.state==='active'&&error.code!=='cancelled'){planned=null;message=globalThis.PlayroomMessages.error(error);open();}}
      finally{busy=false;}
    }
    async function commitRemove(){
      if(!planned||busy)return;busy=true;const plan=planned,owner=confirmationFrame,epoch=opening,back=returnToManager,capability=captureOperation({idle:true});let changed=false;
      const guard=()=>{plan.capability.guard({retained:true});capability.guard();};
      try{
        for(const id of plan.network){guard();await networkLibrary.remove(id,{guard});changed=true;guard();}
        for(const id of plan.local){guard();await library.removeAsync(id,{guard});changed=true;guard();}
        for(const item of plan.items){guard();await manager.remove(item.id,item.version,{guard});changed=true;guard();}
        if(plan.all&&plan.quarantine){guard();await manager.discardQuarantine(null,{guard});changed=true;guard();}
        guard();const existing=new Set(manager.list().map(item=>item.id)),preferences=displayPreferences();
        for(const key of ['order','hidden','favorites'])preferences[key]=preferences[key].filter(id=>existing.has(id));
        guard();storeDisplay(preferences);message='';
      }catch(error){if(capability.current()&&error.code!=='cancelled')message=globalThis.PlayroomMessages.text("ui.pack-manager.493487ffffd3",{p0:String(globalThis.PlayroomMessages.error(error))});}
      finally{
        busy=false;if(planned===plan)planned=null;
        if(epoch===opening&&confirmationFrame===owner&&capability.current()){confirmationFrame=null;returnToManager=null;back?.();open();if(!message)toast(globalThis.PlayroomMessages.text("ui.pack-manager.73588c6b9a30"));}
        if(changed)onChange();
      }
    }
    async function installOnline(ids) {
      if(busy||!ids.length)return;
      const epoch=opening,owner=packFrame,here=()=>epoch===opening&&owner===packFrame&&owner?.state==='active',refresh=()=>{if(here())refreshOnline(currentModal());};
      busy=true;message='';const errors=[];let completed=0;if(ids.length>1)installBatch={done:0,total:ids.length};
      try {
        for(const id of [...ids]){
          if(epoch===opening)onlineStates.set(id,{phase:'loading'});refresh();
          try{await remote.install(id,{activate:true});completed++;if(epoch===opening){onlineStates.set(id,{phase:'ready'});if(installBatch)installBatch.done++;}}
          catch(error){const detail=globalThis.PlayroomMessages.error(error);errors.push(`${id}: ${detail}`);if(epoch===opening)onlineStates.set(id,{phase:'error',error:detail});}
          refresh();
        }
      }finally{
        busy=false;if(epoch===opening)installBatch=null;
        if(epoch===opening&&ids.length>1&&errors.length)message=globalThis.PlayroomMessages.text('ui.pack-manager.update-errors',{count:completed,errors:errors.join('; ')});
        if(completed)onChange();if(here())refresh();else if(packFrame?.state==='active')refreshOnline(currentModal());
      }
    }
    document.addEventListener('change',event=>{if(!busy&&packFrame?.state==='active'&&currentModal()?.contains(event.target)&&event.target.id==='pack-file')void read(event.target.files?.[0]);});
    document.addEventListener('click',async event=>{
      const confirmationTarget=event.target.closest('[data-pack-confirm],[data-pack-cancel-remove],[data-pack-quarantine-confirm]');if(confirmationTarget&&(!confirmationFrame||confirmationFrame.state!=='active'||!confirmationFrame.element.contains(confirmationTarget)))return;
      if(!confirmationTarget&&(!currentModal()?.contains(event.target)||packFrame?.state!=='active'))return;
      if(event.target.closest('[data-pack-catalog-refresh]')){availableIds.clear();loadCatalog(currentModal(),opening);return;}
      const tab=event.target.closest('[data-pack-tab]');if(tab){packTab=tab.dataset.packTab;tab.parentElement.style.setProperty('--page-index',packTab==='available'?1:0);const modal=currentModal();if(!modal)return;for(const item of modal.querySelectorAll('[data-pack-tab]'))item.setAttribute('aria-selected',String(item.dataset.packTab===packTab));for(const item of modal.querySelectorAll('[data-pack-tab]'))item.tabIndex=item===tab?0:-1;for(const panel of modal.querySelectorAll('[data-pack-tab-panel]'))panel.hidden=panel.dataset.packTabPanel!==packTab;return;}
      const button=event.target.closest('[data-pack-file-open],[data-pack-install],[data-pack-cancel],[data-pack-remove],[data-pack-bulk],[data-pack-confirm],[data-pack-cancel-remove],[data-pack-restore],[data-pack-quarantine],[data-pack-quarantine-confirm],[data-pack-move],[data-pack-visibility],[data-pack-favorite],[data-pack-online],[data-pack-update-all],[data-pack-install-all]');if(!button||button.disabled||busy)return;
      if(button.hasAttribute('data-pack-install-all')){const installed=new Set(manager.list().map(item=>item.id));void installOnline((remote?.current?.packs||[]).filter(item=>!installed.has(item.id)).map(item=>item.id));return;}
      if(button.hasAttribute('data-pack-file-open')){document.getElementById('pack-file')?.click();return;}
      if(button.hasAttribute('data-pack-update-all')){const installed=new Set(manager.list().map(item=>item.id));void installOnline((remote?.pending()||[]).filter(item=>installed.has(item.id)).map(item=>item.id));return;}
      if(button.dataset.packOnline){event.preventDefault();if(button.getAttribute('aria-disabled')!=='true')void installOnline([button.dataset.packOnline]);return;}
      if(button.hasAttribute('data-pack-cancel-remove')){planned=null;restoreManager();open();return;}
      if(button.hasAttribute('data-pack-confirm')){if(!planned)return;if(button.dataset.packConfirm==='1'&&planned.local.length+planned.network.length){confirmation(planned,2);return;}void commitRemove();return;}
      if(button.hasAttribute('data-pack-bulk')){const all=button.dataset.packBulk==='all';void askRemove(manager.list().filter(item=>all||!item.active),all);return;}
      if(button.hasAttribute('data-pack-remove')){const item=manager.list().find(item=>item.id===button.dataset.packRemove&&item.version===button.dataset.packVersion);if(item)void askRemove([item]);return;}
      if(button.hasAttribute('data-pack-move')||button.hasAttribute('data-pack-visibility')||button.hasAttribute('data-pack-favorite')){
        try {
          const id=button.dataset.packMove||button.dataset.packVisibility||button.dataset.packFavorite;
          if(!manager.list().some(item=>item.id===id&&item.active))return;
          if(button.hasAttribute('data-pack-favorite'))toggleFavorite(id);
          else {
            const preferences=displayPreferences();
            if(button.hasAttribute('data-pack-visibility'))setCategory(id,category(id,preferences)==='hidden'?'normal':'hidden');
            else {const ids=ordered(manager.list().filter(item=>item.active).map(item=>item.id),preferences),at=ids.indexOf(id),to=at+Number(button.dataset.direction);if(to<0||to>=ids.length)return;[ids[at],ids[to]]=[ids[to],ids[at]];preferences.order=ids;}
            if(!button.hasAttribute('data-pack-visibility'))storeDisplay(preferences);
          }
          onChange();open();
        } catch(error) {message=globalThis.PlayroomMessages.text("ui.pack-manager.25e60c5c8569",{p0:String(globalThis.PlayroomMessages.error(error))});open();}
        return;
      }
      if(button.hasAttribute('data-pack-restore')){try{await manager.bootstrap(root.PlayroomInstalledPacks||[],{restoreBuiltins:true});onChange();message='';open();}catch(error){message=globalThis.PlayroomMessages.error(error);open();}return;}
      if(button.hasAttribute('data-pack-quarantine')){quarantineOperation=captureOperation({idle:true});returnToManager=root.PlayroomAppBridge?.captureModalReturn?.();confirmationFrame=openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.pack-manager.221ed3d4d098"))}<p>${globalThis.PlayroomMessages.text("ui.pack-manager.552b9b7cc90b")}</p><button class="btn coral" data-pack-quarantine-confirm="${esc(button.dataset.packQuarantine)}">${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.be99b1361201")}</button>`,'pack-quarantine-modal',{valid:()=>quarantineOperation?.current({retained:true})!==false,onBack:()=>restoreManager()});return;}
      if(button.hasAttribute('data-pack-quarantine-confirm')){
        const parent=quarantineOperation,capability=captureOperation({idle:true}),owner=confirmationFrame,epoch=opening,back=returnToManager,index=button.dataset.packQuarantineConfirm==='all'?null:Number(button.dataset.packQuarantineConfirm);
        const guard=()=>{parent?.guard({retained:true});capability.guard();};let changed=false;busy=true;
        try{guard();await manager.discardQuarantine(index,{guard});changed=true;guard();message='';}
        catch(error){if(capability.current()&&error.code!=='cancelled')message=globalThis.PlayroomMessages.error(error);}
        finally{busy=false;if(epoch===opening&&confirmationFrame===owner&&capability.current()){confirmationFrame=null;returnToManager=null;quarantineOperation=null;back?.();open();}if(changed)onChange();}
        return;
      }
      if(button.hasAttribute('data-pack-install'))install();
      else if(button.hasAttribute('data-pack-cancel')){reading++;pending=null;message='';const state=previewReturn;previewReturn=null;open();restoreView(currentModal(),state);}
      else return;
    });

    function loadCatalog(modal,epoch){
      if(!remote||!modal||catalogLoading||busy)return;if(!catalogAvailability().available){refreshOnline(modal);return;}catalogLoading=true;refreshOnline(modal);
      if(!catalogJob)catalogJob=Promise.resolve().then(()=>remote.load()).finally(()=>{catalogJob=null;});
      void catalogJob.then(()=>{
        if(epoch!==opening||!modal.isConnected||currentModal()!==modal)return;catalogLoading=false;refreshOnline(modal);onCatalog();
        if(installAllWhenReady&&!remote.warning&&remote.current){installAllWhenReady=false;const installed=new Set(manager.list().map(item=>item.id));void installOnline(remote.current.packs.filter(item=>!installed.has(item.id)).map(item=>item.id));}
      }).catch(error=>{if(epoch===opening&&modal.isConnected&&currentModal()===modal){catalogLoading=false;message=globalThis.PlayroomMessages.error(error);open();}});
    }
    return {open({installAll=false}={}){
      const epoch=++opening;reading++;availableIds.clear();onlineStates.clear();installBatch=null;installAllWhenReady=installAll;packTab=installAll||!manager.list().length?'available':'installed';catalogLoading=false;pending=null;previewReturn=null;planned=null;confirmationFrame=null;returnToManager=null;message=currentBootWarnings();packFrame=null;open();
      loadCatalog(currentModal(),epoch);
    }};
  }
  root.PlayroomPackManager = {create,reconcile,displayPreferences,ordered,category,setCategory,moveGame,toggleFavorite};
})(globalThis);

(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORAGE = 'playroom.packs.v1';
  const DISPLAY_STORAGE = 'playroom.pack-display.v1';
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
    const sequence=[...new Set(ids)],original=new Map(sequence.map((id,index)=>[id,index]));
    return sequence.sort((a,b)=>{
      const ia=preferences.order.indexOf(a),ib=preferences.order.indexOf(b);
      return (ia<0?preferences.order.length+original.get(a):ia)-(ib<0?preferences.order.length+original.get(b):ib);
    });
  }
  function toggleFavorite(id) {
    if(!validId(id))return;
    setCategory(id,category(id)==='favorites'?'normal':'favorites');
  }
  root.PlayroomCatalog ||= {};
  if (root.TabletopPacks) {
    root.PlayroomPacks = new root.TabletopPacks({engine:root.TabletopCore,views:root.PlayroomViews,catalog:root.PlayroomCatalog,
      storage:{get:()=>localStorage.getItem(STORAGE),set:value=>localStorage.setItem(STORAGE,value)}});
    try {
      root.PlayroomPacks.bootstrap(root.PlayroomInstalledPacks || []);
      if (root.PlayroomPacks.warnings.length) root.PlayroomPackLoadError = root.PlayroomPacks.warnings.join(' ');
    }
    catch (error) { root.PlayroomPackLoadError = error.message || 'Не удалось загрузить установленные паки.'; }
  }
  root.PlayroomRemotePacks=root.PlayroomRemoteCatalog&&root.PlayroomPacks?new root.PlayroomRemoteCatalog.RemoteCatalog({manager:root.PlayroomPacks}):null;
  // A removed save no longer pins conflicting code under the same version.
  // The default loader remains conservative until explicit references can be checked.
  function reconcile(manager,library,bundles=root.PlayroomInstalledPacks||[]) {
    if(!manager?.bootstrap||!library?.references||!Array.isArray(bundles))return manager?.list?.()||[];
    const list=manager.bootstrap(bundles,{preserveSavedConflict:(id,version)=>library.references(id,version).length>0});
    root.PlayroomPackLoadError=manager.warnings?.join(' ')||'';
    return list;
  }
  function create({manager,library,networkLibrary,openModal,modalHead,toast,onChange,onCatalog=()=>{}}) {
    let pending = null, message = '', reading = 0, savedScroll = null, busy = false;
    const remote=root.PlayroomRemotePacks;
    const title = manifest => manifest.name || manifest.title || manifest.id;
    const references = (id,version) => library.references(id,version);
    function currentBootWarnings(){
      const warnings=root.PlayroomPacks?.warnings||[];
      // A bundled version conflict matters to the user while a saved game
      // still references it. Re-evaluate instead of freezing startup warnings.
      const visible=warnings.filter(warning=>{
        const match=/^Встроенный пакет ([a-z0-9_-]+)@([^\s]+) отличается/.exec(warning);
        return !match||references(match[1],match[2]).length>0;
      });
      const loadError=root.PlayroomPackLoadError;
      const fatal=loadError&&loadError!==warnings.join(' ')?loadError:'';
      return [fatal,...visible].filter(Boolean).join(' ');
    }
    function listMarkup() {
      const source = manager?.list() || [],preferences=displayPreferences(),ids=ordered(source.filter(item=>item.active).map(item=>item.id),preferences);
      const position=id=>ids.indexOf(id)<0?ids.length:ids.indexOf(id);
      const list=source.slice().sort((a,b)=>position(a.id)-position(b.id)||Number(b.active)-Number(a.active));
      if (!list.length) return '<div class="pack-empty"><strong>Пока нет игр</strong><p>Выберите файл пака, чтобы добавить правила, оформление и звуки игры. Подключение к интернету не нужно.</p></div>';
      return `<ul class="pack-list">${list.map(item=>{
        const count = references(item.id,item.version).length;
        const controls=item.active?`<div class="pack-display-actions"><button type="button" data-pack-move="${esc(item.id)}" data-direction="-1" ${ids.indexOf(item.id)===0?'disabled':''} aria-label="Поднять ${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('up')}</button><button type="button" data-pack-move="${esc(item.id)}" data-direction="1" ${ids.indexOf(item.id)===ids.length-1?'disabled':''} aria-label="Опустить ${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('down')}</button><button type="button" data-pack-visibility="${esc(item.id)}" aria-pressed="${preferences.hidden.includes(item.id)}" aria-label="${preferences.hidden.includes(item.id)?'Показать':'Скрыть'} ${esc(title(item.manifest))}" title="${preferences.hidden.includes(item.id)?'Показать':'Скрыть'}">${root.PlayroomGameScreen.icon('eye')}</button><button type="button" data-pack-favorite="${esc(item.id)}" aria-pressed="${preferences.favorites.includes(item.id)}" aria-label="${preferences.favorites.includes(item.id)?'Убрать из избранного':'В избранное'} ${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('star')}</button></div>`:'';
        return `<li class="pack-entry" data-pack-id="${esc(item.id)}" data-pack-version="${esc(item.version)}"><div><strong>${esc(title(item.manifest))}</strong><p>${esc(item.id)} · ${esc(item.version)}${item.active?' · выбранная версия':''}</p>${count?`<small>${count} локальных партий используют эту версию</small>`:''}${controls}</div><button class="icon-btn" data-pack-remove="${esc(item.id)}" data-pack-version="${esc(item.version)}" aria-label="Удалить ${esc(title(item.manifest))}, версия ${esc(item.version)}">${root.PlayroomGameScreen.icon('trash')}</button></li>`;
      }).join('')}</ul>`;
    }
    function previewMarkup() {
      if (!pending) return '';
      const manifest = pending.manifest, known = manager.list().some(item=>item.id===manifest.id);
      return `<section class="pack-preview" aria-label="Предпросмотр пака"><span class="eyebrow">ПАК ГОТОВ К УСТАНОВКЕ</span><h3>${esc(title(manifest))}</h3><p>${esc(manifest.id)} · версия ${esc(manifest.version)}</p>${manifest.description||manifest.tagline?`<p>${esc(manifest.description||manifest.tagline)}</p>`:''}${manifest.author?`<p>Автор: ${esc(typeof manifest.author==='string'?manifest.author:manifest.author.name||'Не указан')}</p>`:''}<p class="pack-trust">Пак содержит код, который запускается на этом устройстве. Устанавливайте его, только если доверяете автору.</p>${known?'<p>Сохранённые партии продолжат использовать прежнюю версию.</p>':''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel>Отмена</button><button class="btn" data-pack-install>${known?'Установить / обновить':'Установить'}</button></div></section>`;
    }
    function open() {
      const online=remote?.pending()||[];
      const onlineMarkup=online.length?`<section class="pack-online"><h3>Доступны паки</h3>${online.map(item=>`<div class="pack-online-entry"><span>${esc(item.id)} · ${esc(item.version)}</span><button class="btn secondary" data-pack-online="${esc(item.id)}" ${busy?'disabled':''}>${manager.list().some(installed=>installed.id===item.id)?'Установить обновление':'Установить'}</button></div>`).join('')}</section>`:'';
      openModal(`${modalHead('Паки игр')}<p class="lead">Добавляйте игры и обновляйте их независимо от приложения. Прежние версии остаются для ваших партий.</p>${onlineMarkup}<label class="btn pack-file">Выбрать файл пака<input id="pack-file" type="file" accept=".playroom-pack.json,application/json" aria-label="Выбрать файл пака"></label><p class="pack-format">Формат: .playroom-pack.json</p>${message?`<p class="pack-message" role="alert">${esc(message)}</p>`:''}${previewMarkup()}${listMarkup()}<div class="pack-bulk-actions"><button class="btn secondary" data-pack-bulk="old" ${manager.list().some(item=>!item.active)?'':'disabled'}>${root.PlayroomGameScreen.icon('trash')} Удалить все старые версии</button><button class="btn secondary" data-pack-bulk="all" ${manager.list().length||manager.quarantined?.length?'':'disabled'}>${root.PlayroomGameScreen.icon('trash')} Удалить все паки</button></div><button class="btn secondary" data-pack-restore>Восстановить встроенные игры</button>${quarantineMarkup()}`,'pack-manager-modal');
      if(savedScroll!==null){document.querySelector('.pack-manager-modal .modal-body')?.scrollTo(0,savedScroll);savedScroll=null;}
    }
    function quarantineMarkup(){
      const entries=manager.quarantined||[];return entries.length?`<section class="pack-quarantine"><h3>Несовместимые паки</h3>${entries.map((item,i)=>`<div class="pack-version"><span>${esc(item.bundle?.manifest?.name||item.bundle?.manifest?.id||'Пак')} · ${esc(item.bundle?.manifest?.version||'')}<small>${esc(item.reason)}</small></span><button class="icon-btn" data-pack-quarantine="${i}" aria-label="Удалить несовместимый пак">${root.PlayroomGameScreen.icon('trash')}</button></div>`).join('')}<button class="btn secondary" data-pack-quarantine="all">${root.PlayroomGameScreen.icon('trash')} Удалить все несовместимые паки</button></section>`:'';
    }
    async function read(file) {
      const ticket=++reading;pending=null;message='';
      if(!file)return;
      try {
        if(file.size>4*1024*1024)throw Error('Файл слишком большой. Максимум — 4 МБ.');
        const candidate=manager.parse(await file.text());
        if(ticket!==reading)return;
        pending=candidate;
      } catch(error) { if(ticket!==reading)return;message='Не удалось прочитать пак. '+error.message; }
      if(document.querySelector('.pack-manager-modal'))open();
    }
    function install() {
      if(!pending)return;
      try {
        const id=pending.manifest.id;
        manager.install(manager.prepare(pending),{activate:true});
        pending=null;message='';onChange();open();toast('Пак '+id+' установлен');
      } catch(error) {message='Не удалось установить пак. '+error.message;open();}
    }
    async function removalPlan(items,all=false){
      const keys=new Set(items.map(item=>item.id+'@'+item.version));
      const local=[...new Set(items.flatMap(item=>references(item.id,item.version)))];
      const network=(await networkLibrary.list({strict:true})).filter(item=>keys.has(item.game+'@'+item.packVersion)).map(item=>item.role==='client'?'client:'+item.id:item.sessionId);
      return {items,local,network:[...new Set(network)],all,quarantine:all?(manager.quarantined?.length||0):0};
    }
    function confirmation(plan,stage){
      const count=plan.local.length+plan.network.length,all=plan.all;
      const heading=stage===2?'Подтвердить удаление партий?':all?'Удалить все паки?':plan.items.length>1?'Удалить старые версии?':'Удалить версию пака?';
      const description=`Будет удалено ${plan.items.length} ${plan.items.length===1?'версия пака':'версий паков'}${plan.quarantine?` и ${plan.quarantine} несовместимых паков`:''}.${count?` Вместе с ними будут безвозвратно удалены ${count} сохранённых партий и их истории (${plan.local.length} локальных, ${plan.network.length} сетевых).`:''}`;
      openModal(`${modalHead(heading)}<p class="lead">${esc(description)}</p>${stage===2?'<p class="recovery-note" role="alert">Это второе подтверждение. Восстановить удалённые партии и истории нельзя.</p>':''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel-remove>Оставить</button><button class="btn coral" data-pack-confirm="${stage}">${root.PlayroomGameScreen.icon('trash')} ${stage===2?'Удалить партии и паки':'Удалить'}</button></div>`);
    }
    let planned=null;
    async function askRemove(items,all=false){
      if(busy)return;busy=true;savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;
      try{if(networkLibrary.hasActiveRoom?.())throw Error('Сначала покиньте текущую сетевую комнату.');planned=await removalPlan(items,all);confirmation(planned,1);}catch(error){planned=null;message=error.message;open();}finally{busy=false;}
    }
    async function commitRemove(){
      if(!planned||busy)return;busy=true;
      try{
        for(const id of planned.network)await networkLibrary.remove(id);
        for(const id of planned.local)library.remove(id);
        for(const item of planned.items)manager.remove(item.id,item.version);
        if(planned.all&&planned.quarantine)manager.discardQuarantine();
        const existing=new Set(manager.list().map(item=>item.id)),preferences=displayPreferences();
        for(const key of ['order','hidden','favorites'])preferences[key]=preferences[key].filter(id=>existing.has(id));
        storeDisplay(preferences);
        planned=null;onChange();message='';open();toast('Паки и связанные истории удалены');
      }catch(error){planned=null;message='Удаление остановлено: '+error.message;onChange();open();}finally{busy=false;}
    }
    document.addEventListener('change',event=>{if(event.target.id==='pack-file')void read(event.target.files?.[0]);});
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-pack-install],[data-pack-cancel],[data-pack-remove],[data-pack-bulk],[data-pack-confirm],[data-pack-cancel-remove],[data-pack-restore],[data-pack-quarantine],[data-pack-quarantine-confirm],[data-pack-move],[data-pack-visibility],[data-pack-favorite],[data-pack-online]');if(!button||button.disabled)return;
      if(button.dataset.packOnline){if(busy)return;busy=true;savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;void remote.install(button.dataset.packOnline,{activate:true}).then(()=>{message='';onChange();toast('Пак установлен');}).catch(error=>{message='Не удалось установить пак: '+error.message;}).finally(()=>{busy=false;open();});return;}
      if(button.hasAttribute('data-pack-cancel-remove')){planned=null;open();return;}
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
        } catch(error) {message='Не удалось сохранить порядок игр. '+error.message;open();}
        return;
      }
      if(button.hasAttribute('data-pack-restore')){try{manager.bootstrap(root.PlayroomInstalledPacks||[],{restoreBuiltins:true});onChange();message='';open();}catch(error){message=error.message;open();}return;}
      if(button.hasAttribute('data-pack-quarantine')){openModal(`${modalHead('Удалить несовместимые паки?')}<p>Сохранённые партии останутся на устройстве.</p><button class="btn coral" data-pack-quarantine-confirm="${esc(button.dataset.packQuarantine)}">${root.PlayroomGameScreen.icon('trash')} Удалить</button>`);return;}
      if(button.hasAttribute('data-pack-quarantine-confirm')){try{manager.discardQuarantine(button.dataset.packQuarantineConfirm==='all'?null:Number(button.dataset.packQuarantineConfirm));message='';open();}catch(error){message=error.message;open();}return;}
      if(button.hasAttribute('data-pack-install'))install();
      else if(button.hasAttribute('data-pack-cancel')){reading++;pending=null;message='';open();}
      else return;
    });
    return {open(){pending=null;message=currentBootWarnings();open();void remote?.load().then(()=>{if(document.querySelector('.pack-manager-modal')){savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;open();onCatalog();}});}};
  }
  root.PlayroomPackManager = {create,reconcile,displayPreferences,ordered,category,setCategory,moveGame,toggleFavorite};
})(globalThis);

(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORAGE = 'playroom.packs.v1';
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
  // A removed save no longer pins conflicting code under the same version.
  // The default loader remains conservative until explicit references can be checked.
  function reconcile(manager,library,bundles=root.PlayroomInstalledPacks||[]) {
    if(!manager?.bootstrap||!library?.references||!Array.isArray(bundles))return manager?.list?.()||[];
    const list=manager.bootstrap(bundles,{preserveSavedConflict:(id,version)=>library.references(id,version).length>0});
    root.PlayroomPackLoadError=manager.warnings?.join(' ')||'';
    return list;
  }
  function create({manager,library,openModal,modalHead,toast,onChange}) {
    let pending = null, message = '', reading = 0;
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
      const list = manager?.list() || [];
      if (!list.length) return '<div class="pack-empty"><strong>Пока нет игр</strong><p>Выберите файл пака, чтобы добавить правила, оформление и звуки игры. Подключение к интернету не нужно.</p></div>';
      return `<ul class="pack-list">${list.map(item=>{
        const count = references(item.id,item.version).length;
        return `<li class="pack-entry" data-pack-id="${esc(item.id)}" data-pack-version="${esc(item.version)}"><div><strong>${esc(title(item.manifest))}</strong><p>${esc(item.id)} · ${esc(item.version)}${item.active?' · выбранная версия':''}</p>${count?`<small>${count} сохранённых партий используют эту версию</small>`:''}</div><button class="text-btn" data-pack-remove="${esc(item.id)}" data-pack-version="${esc(item.version)}" ${count?'disabled':''} aria-label="Удалить ${esc(title(item.manifest))}, версия ${esc(item.version)}" ${count?'title="Сначала завершите работу с сохранениями этой версии"':''}>Удалить</button></li>`;
      }).join('')}</ul>`;
    }
    function previewMarkup() {
      if (!pending) return '';
      const manifest = pending.manifest, known = manager.list().some(item=>item.id===manifest.id);
      return `<section class="pack-preview" aria-label="Предпросмотр пака"><span class="eyebrow">ПАК ГОТОВ К УСТАНОВКЕ</span><h3>${esc(title(manifest))}</h3><p>${esc(manifest.id)} · версия ${esc(manifest.version)}</p>${manifest.description||manifest.tagline?`<p>${esc(manifest.description||manifest.tagline)}</p>`:''}${manifest.author?`<p>Автор: ${esc(typeof manifest.author==='string'?manifest.author:manifest.author.name||'Не указан')}</p>`:''}<p class="pack-trust">Пак содержит код, который запускается на этом устройстве. Устанавливайте его, только если доверяете автору.</p>${known?'<p>Сохранённые партии продолжат использовать прежнюю версию.</p>':''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel>Отмена</button><button class="btn" data-pack-install>${known?'Установить / обновить':'Установить'}</button></div></section>`;
    }
    function open() {
      openModal(`${modalHead('Паки игр')}<p class="lead">Добавляйте игры и обновляйте их независимо от приложения. Прежние версии остаются для ваших партий.</p><label class="btn pack-file">Выбрать файл пака<input id="pack-file" type="file" accept=".playroom-pack.json,application/json" aria-label="Выбрать файл пака"></label><p class="pack-format">Формат: .playroom-pack.json</p>${message?`<p class="pack-message" role="alert">${esc(message)}</p>`:''}${previewMarkup()}${listMarkup()}`,'pack-manager-modal');
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
    function remove(id,version) {
      try {
        if(references(id,version).length)throw Error('Эту версию используют сохранённые партии. Сохранения и пак оставлены на устройстве.');
        manager.remove(id,version);onChange();message='';open();toast('Версия пака удалена');
      } catch(error) {message=error.message;open();}
    }
    document.addEventListener('change',event=>{if(event.target.id==='pack-file')void read(event.target.files?.[0]);});
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-pack-install],[data-pack-cancel],[data-pack-remove]');if(!button||button.disabled)return;
      if(button.hasAttribute('data-pack-install'))install();
      else if(button.hasAttribute('data-pack-cancel')){reading++;pending=null;message='';open();}
      else remove(button.dataset.packRemove,button.dataset.packVersion);
    });
    return {open(){pending=null;message=currentBootWarnings();open();}};
  }
  root.PlayroomPackManager = {create,reconcile};
})(globalThis);

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
      storage:{get:()=>data.getItem(STORAGE),commit:value=>value===null?data.transact(()=>data.removeItem(STORAGE)):data.put(STORAGE,value)}});
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
  function create({manager,library,networkLibrary,openModal,modalHead,toast,onChange,onCatalog=()=>{}}) {
    let pending = null, message = '', reading = 0, savedScroll = null, busy = false;
    const remote=root.PlayroomRemotePacks;
    const title = manifest => manifest.name || manifest.title || manifest.id;
    const references = (id,version) => library.references(id,version);
    const cleanup=new root.PlayroomPackUpdateCleanup({manager,localReferences:references,networkArchives:()=>networkLibrary.list({strict:true}),activeRoom:()=>!!networkLibrary.hasActiveRoom?.(),compare:manager.constructor.compareVersions});
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
      if (!list.length) return ("<div class=\"pack-empty\"><strong>"+globalThis.PlayroomMessages.text("ui.pack-manager.8845175f546e")+"</strong><p>"+globalThis.PlayroomMessages.text("ui.pack-manager.c3b7666b0e32")+"</p></div>");
      return `<ul class="pack-list">${list.map(item=>{
        const count = references(item.id,item.version).length;
        const controls=item.active?`<div class="pack-display-actions"><button type="button" data-pack-move="${esc(item.id)}" data-direction="-1" ${ids.indexOf(item.id)===0?'disabled':''} aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.31780d6c4a33")}${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('up')}</button><button type="button" data-pack-move="${esc(item.id)}" data-direction="1" ${ids.indexOf(item.id)===ids.length-1?'disabled':''} aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.324de4c19b50")}${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('down')}</button><button type="button" data-pack-visibility="${esc(item.id)}" aria-pressed="${preferences.hidden.includes(item.id)}" aria-label="${preferences.hidden.includes(item.id)?globalThis.PlayroomMessages.text("ui.pack-manager.1e5bec3aab1c"):globalThis.PlayroomMessages.text("ui.pack-manager.0a2a4b837761")} ${esc(title(item.manifest))}" title="${preferences.hidden.includes(item.id)?globalThis.PlayroomMessages.text("ui.pack-manager.1e5bec3aab1c"):globalThis.PlayroomMessages.text("ui.pack-manager.0a2a4b837761")}">${root.PlayroomGameScreen.icon('eye')}</button><button type="button" data-pack-favorite="${esc(item.id)}" aria-pressed="${preferences.favorites.includes(item.id)}" aria-label="${preferences.favorites.includes(item.id)?globalThis.PlayroomMessages.text("ui.pack-manager.334c3299a899"):globalThis.PlayroomMessages.text("ui.pack-manager.05f7734c7fbc")} ${esc(title(item.manifest))}">${root.PlayroomGameScreen.icon('star')}</button></div>`:'';
        return root.PlayroomGameScreen.packRow({id:item.id,version:item.version,sizeLabel:root.PlayroomStorageUsage?.format(item.byteSize||0),name:title(item.manifest),manifest:item.manifest,nameSuffix:count?globalThis.PlayroomMessages.text("ui.pack-manager.usage-count",{count}):'',usageDescription:count?`${count} ${globalThis.PlayroomMessages.text("ui.pack-manager.1b04cb684fde")}`:'',controls:controls+`<button class="icon-btn" data-pack-remove="${esc(item.id)}" data-pack-version="${esc(item.version)}" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.1c6789d896d4")}${esc(title(item.manifest))}, ${globalThis.PlayroomMessages.text("ui.pack-manager.d9ae8e2e1567")}${esc(item.version)}">${root.PlayroomGameScreen.icon('trash')}</button>`});
      }).join('')}</ul>`;
    }
    function previewMarkup() {
      if (!pending) return '';
      const manifest = pending.manifest, known = manager.list().some(item=>item.id===manifest.id);
      return `<section class="pack-preview" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.13eb691fe3b3")}"><span class="eyebrow">${globalThis.PlayroomMessages.text("ui.pack-manager.080b18f6ca51")}</span><h3>${esc(title(manifest))}</h3><p>${esc(manifest.id)} · ${globalThis.PlayroomMessages.text("ui.pack-manager.d9ae8e2e1567")}${esc(manifest.version)}</p>${manifest.description||manifest.tagline?`<p>${esc(manifest.description||manifest.tagline)}</p>`:''}${manifest.author?`<p>${globalThis.PlayroomMessages.text("ui.pack-manager.745b218447d3")}${esc(typeof manifest.author==='string'?manifest.author:manifest.author.name||globalThis.PlayroomMessages.text("ui.pack-manager.0d836c1579f1"))}</p>`:''}<p class="pack-trust">${globalThis.PlayroomMessages.text("ui.pack-manager.48eac42eff92")}</p>${known?("<p>"+globalThis.PlayroomMessages.text("ui.pack-manager.3c343bc73176")+"</p>"):''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel>${globalThis.PlayroomMessages.text("ui.pack-manager.8fbe9b75cbdf")}</button><button class="btn" data-pack-install>${known?globalThis.PlayroomMessages.text("ui.pack-manager.e6acd89e236f"):globalThis.PlayroomMessages.text("ui.pack-manager.b7cd6fae08d9")}</button></div></section>`;
    }
    let usageTicket=0;
    function storageMarkup(){return `<div class="storage-usage" aria-live="polite">${root.PlayroomMessages.text('ui.storage.loading')}</div>`;}
    async function showUsage(){
      const ticket=++usageTicket;
      try{const data=await root.PlayroomStorageUsage.measure(),node=document.querySelector('.pack-manager-modal .storage-usage');if(ticket!==usageTicket||!node)return;const format=root.PlayroomStorageUsage.format,t=(key,size)=>root.PlayroomMessages.text('ui.storage.'+key,{size});
      node.innerHTML=`<strong>${t('total',data.partial?t('minimum',format(data.total)):format(data.total))}</strong><div class="storage-usage-line" aria-hidden="true">${['app','packs','saves'].map(key=>`<i class="storage-${key}" style="flex:${data[key]}"></i>`).join('')}</div><div class="storage-usage-labels"><span>${t('app',format(data.app))}</span><span>${t('packs',format(data.packs))}</span><span>${t('saves',format(data.saves))}</span></div><small>${t('note')}</small>`;
      }catch(_){const node=document.querySelector('.pack-manager-modal .storage-usage');if(node&&ticket===usageTicket)node.textContent=root.PlayroomMessages.text('ui.storage.measure-failed');}
    }
    function open() {
      const online=remote?.pending()||[],installedIds=new Set(manager.list().map(item=>item.id)),updates=online.filter(item=>installedIds.has(item.id));
      const onlineMarkup=online.length?`<section class="pack-online"><h3>${globalThis.PlayroomMessages.text("ui.pack-manager.38fe3394cbf8")}</h3>${updates.length?`<button class="btn" data-pack-update-all ${busy?'disabled':''}>${globalThis.PlayroomMessages.text(busy?"ui.pack-manager.updating-all":"ui.pack-manager.update-all",{count:updates.length})}</button>`:''}${online.map(item=>`<div class="pack-online-entry"><span>${esc(item.id)} · ${esc(item.version)}</span><button class="btn secondary" data-pack-online="${esc(item.id)}" ${busy?'disabled':''}>${manager.list().some(installed=>installed.id===item.id)?globalThis.PlayroomMessages.text("ui.pack-manager.8a858910555f"):globalThis.PlayroomMessages.text("ui.pack-manager.b7cd6fae08d9")}</button></div>`).join('')}</section>`:'';
      openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.pack-manager.61384528c752"))}${storageMarkup()}<p class="lead">${globalThis.PlayroomMessages.text("ui.pack-manager.ef2ae8b855ad")}</p>${onlineMarkup}<label class="btn pack-file">${globalThis.PlayroomMessages.text("ui.pack-manager.a069bb09bb4f")}<input id="pack-file" type="file" accept=".playroom-pack.json,application/json" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.a069bb09bb4f")}"></label><p class="pack-format">${globalThis.PlayroomMessages.text("ui.pack-manager.0eea560e855d")}</p>${message?`<p class="pack-message" role="alert">${esc(message)}</p>`:''}${previewMarkup()}${listMarkup()}<div class="pack-bulk-actions"><button class="btn secondary" data-pack-bulk="old" ${manager.list().some(item=>!item.active)?'':'disabled'}>${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.a36f32b9cd54")}</button><button class="btn secondary" data-pack-bulk="all" ${manager.list().length||manager.quarantined?.length?'':'disabled'}>${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.3c99ffe023e4")}</button></div><button class="btn secondary" data-pack-restore>${globalThis.PlayroomMessages.text("ui.pack-manager.cc9319e91546")}</button>${quarantineMarkup()}`,'pack-manager-modal');
      void showUsage();
      if(savedScroll!==null){document.querySelector('.pack-manager-modal .modal-body')?.scrollTo(0,savedScroll);savedScroll=null;}
    }
    function quarantineMarkup(){
      const entries=manager.quarantined||[];return entries.length?`<section class="pack-quarantine"><h3>${globalThis.PlayroomMessages.text("ui.pack-manager.6e7a653acf43")}</h3>${entries.map((item,i)=>`<div class="pack-version"><span>${esc(item.bundle?.manifest?.name||item.bundle?.manifest?.id||globalThis.PlayroomMessages.text("ui.pack-manager.3b81a9cb03fe"))} · ${esc(item.bundle?.manifest?.version||'')}<small>${esc(item.reason)}</small></span><button class="icon-btn" data-pack-quarantine="${i}" aria-label="${globalThis.PlayroomMessages.text("ui.pack-manager.28cee15450c6")}">${root.PlayroomGameScreen.icon('trash')}</button></div>`).join('')}<button class="btn secondary" data-pack-quarantine="all">${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.032311941d8f")}</button></section>`:'';
    }
    async function read(file) {
      const ticket=++reading;pending=null;message='';
      if(!file)return;
      try {
        if(file.size>4*1024*1024)throw Error(globalThis.PlayroomMessages.text("ui.pack-manager.21a0186eb4e6"));
        const candidate=manager.parse(await file.text());
        if(ticket!==reading)return;
        pending=candidate;
      } catch(error) { if(ticket!==reading)return;message=globalThis.PlayroomMessages.text("ui.pack-manager.2b5db8b50485",{p0:String(globalThis.PlayroomMessages.error(error))}); }
      if(document.querySelector('.pack-manager-modal'))open();
    }
    async function install() {
      if(!pending)return;
      try {
        const id=pending.manifest.id;
        await manager.install(manager.prepare(pending),{activate:true});
        pending=null;await cleanup.run(id);message='';onChange();open();toast(globalThis.PlayroomMessages.text("ui.pack-manager.3c381137bf00",{p0:String(id)}));
      } catch(error) {message=globalThis.PlayroomMessages.text("ui.pack-manager.9dfa32b39696",{p0:String(globalThis.PlayroomMessages.error(error))});open();}
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
      openModal(`${modalHead(heading)}<p class="lead">${esc(description)}</p>${stage===2?("<p class=\"recovery-note\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.pack-manager.2f51c4a895cb")+"</p>"):''}<div class="modal-foot"><button class="btn secondary" data-pack-cancel-remove>${globalThis.PlayroomMessages.text("ui.pack-manager.97b65905439a")}</button><button class="btn coral" data-pack-confirm="${stage}">${root.PlayroomGameScreen.icon('trash')} ${stage===2?globalThis.PlayroomMessages.text("ui.pack-manager.01a2406a32b3"):globalThis.PlayroomMessages.text("ui.pack-manager.be99b1361201")}</button></div>`);
    }
    let planned=null;
    async function askRemove(items,all=false){
      if(busy)return;busy=true;savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;
      try{if(networkLibrary.hasActiveRoom?.())throw Error(globalThis.PlayroomMessages.text("ui.pack-manager.8f8a5c5c96ff"));planned=await removalPlan(items,all);confirmation(planned,1);}catch(error){planned=null;message=globalThis.PlayroomMessages.error(error);open();}finally{busy=false;}
    }
    async function commitRemove(){
      if(!planned||busy)return;busy=true;
      try{
        for(const id of planned.network)await networkLibrary.remove(id);
        for(const id of planned.local)await library.removeAsync(id);
        for(const item of planned.items)await manager.remove(item.id,item.version);
        if(planned.all&&planned.quarantine)await manager.discardQuarantine();
        const existing=new Set(manager.list().map(item=>item.id)),preferences=displayPreferences();
        for(const key of ['order','hidden','favorites'])preferences[key]=preferences[key].filter(id=>existing.has(id));
        storeDisplay(preferences);
        planned=null;onChange();message='';open();toast(globalThis.PlayroomMessages.text("ui.pack-manager.73588c6b9a30"));
      }catch(error){planned=null;message=globalThis.PlayroomMessages.text("ui.pack-manager.493487ffffd3",{p0:String(globalThis.PlayroomMessages.error(error))});onChange();open();}finally{busy=false;}
    }
    async function installOnline(ids) {
      if(busy||!ids.length)return;
      busy=true;message='';
      savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;
      open();
      const errors=[];let completed=0;
      try {
        for(const id of ids){
          try{await remote.install(id,{activate:true});completed++;await cleanup.run(id);}
          catch(error){errors.push(`${id}: ${globalThis.PlayroomMessages.error(error)}`);}
        }
      } finally {
        busy=false;
        message=errors.length?globalThis.PlayroomMessages.text('ui.pack-manager.update-errors',{count:completed,errors:errors.join('; ')}):'';
        if(completed)onChange();
        if(document.querySelector('.pack-manager-modal'))open();
        if(!errors.length)toast(globalThis.PlayroomMessages.text('ui.pack-manager.c45e419df7a2'));
        else toast(message);
      }
    }
    document.addEventListener('change',event=>{if(!busy&&event.target.id==='pack-file')void read(event.target.files?.[0]);});
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-pack-install],[data-pack-cancel],[data-pack-remove],[data-pack-bulk],[data-pack-confirm],[data-pack-cancel-remove],[data-pack-restore],[data-pack-quarantine],[data-pack-quarantine-confirm],[data-pack-move],[data-pack-visibility],[data-pack-favorite],[data-pack-online],[data-pack-update-all]');if(!button||button.disabled||busy)return;
      if(button.hasAttribute('data-pack-update-all')){const installed=new Set(manager.list().map(item=>item.id));void installOnline((remote?.pending()||[]).filter(item=>installed.has(item.id)).map(item=>item.id));return;}
      if(button.dataset.packOnline){void installOnline([button.dataset.packOnline]);return;}
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
        } catch(error) {message=globalThis.PlayroomMessages.text("ui.pack-manager.25e60c5c8569",{p0:String(globalThis.PlayroomMessages.error(error))});open();}
        return;
      }
      if(button.hasAttribute('data-pack-restore')){try{await manager.bootstrap(root.PlayroomInstalledPacks||[],{restoreBuiltins:true});onChange();message='';open();}catch(error){message=globalThis.PlayroomMessages.error(error);open();}return;}
      if(button.hasAttribute('data-pack-quarantine')){openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.pack-manager.221ed3d4d098"))}<p>${globalThis.PlayroomMessages.text("ui.pack-manager.552b9b7cc90b")}</p><button class="btn coral" data-pack-quarantine-confirm="${esc(button.dataset.packQuarantine)}">${root.PlayroomGameScreen.icon('trash')} ${globalThis.PlayroomMessages.text("ui.pack-manager.be99b1361201")}</button>`);return;}
      if(button.hasAttribute('data-pack-quarantine-confirm')){try{await manager.discardQuarantine(button.dataset.packQuarantineConfirm==='all'?null:Number(button.dataset.packQuarantineConfirm));message='';open();}catch(error){message=globalThis.PlayroomMessages.error(error);open();}return;}
      if(button.hasAttribute('data-pack-install'))install();
      else if(button.hasAttribute('data-pack-cancel')){reading++;pending=null;message='';open();}
      else return;
    });
    return {open(){pending=null;message=currentBootWarnings();open();void remote?.load().then(()=>{if(document.querySelector('.pack-manager-modal')){savedScroll=document.querySelector('.pack-manager-modal .modal-body')?.scrollTop??null;open();onCatalog();}});}};
  }
  root.PlayroomPackManager = {create,reconcile,displayPreferences,ordered,category,setCategory,moveGame,toggleFavorite};
})(globalThis);

(function (root, factory) {
  'use strict';
  const Packs = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Packs;
  root.TabletopPacks = Packs;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const FORMAT='playroom-pack', STORAGE='playroom.packs.v1', MAX_BYTES=4*1024*1024, MAX_TOTAL=20*1024*1024;
  const ID=/^[a-z][a-z0-9_-]{0,63}$/;
  const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  const prepared = new WeakMap();
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const bytes=value=>new TextEncoder().encode(value).byteLength;
  const key=(id,version)=>id+'@'+version;
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  function canonical(value){return JSON.stringify(value,(_,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);}
  function compare(a,b){
    const ma=SEMVER.exec(a),mb=SEMVER.exec(b);
    for(let i=1;i<4;i++){const x=BigInt(ma[i]),y=BigInt(mb[i]);if(x!==y)return x>y?1:-1;}
    if(!ma[4]||!mb[4])return ma[4]? -1:mb[4]?1:0;
    const x=ma[4].split('.'),y=mb[4].split('.');
    for(let i=0;i<Math.max(x.length,y.length);i++){
      if(x[i]===undefined||y[i]===undefined)return x[i]===undefined?-1:1;
      if(x[i]===y[i])continue;
      const nx=/^\d+$/.test(x[i]),ny=/^\d+$/.test(y[i]);
      if(nx&&ny)return BigInt(x[i])>BigInt(y[i])?1:-1;
      if(nx!==ny)return nx?-1:1;
      return x[i]>y[i]?1:-1;
    }return 0;
  }
  function pathOK(path){return typeof path==='string'&&path.length<=180&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'&&/^[\w. -]+$/.test(part));}
  function parse(value){
    const text=typeof value==='string'?value:JSON.stringify(value);
    if(typeof text!=='string'||bytes(text)>MAX_BYTES)throw Error('Файл пакета слишком большой (максимум 4 MiB)');
    let bundle;try{bundle=JSON.parse(text);}catch(_){throw Error('Некорректный JSON пакета');}
    if(!record(bundle)||bundle.format!==FORMAT||bundle.formatVersion!==1||!record(bundle.manifest)||!record(bundle.files))throw Error('Неподдерживаемый формат пакета');
    const m=bundle.manifest;
    if(typeof m.id!=='string'||!ID.test(m.id)||typeof m.version!=='string'||!SEMVER.test(m.version))throw Error('Некорректные id или версия пакета');
    if(m.engineApi!==1||!Number.isSafeInteger(m.stateVersion)||m.stateVersion<1)throw Error('Пакет требует другую версию API движка');
    if(typeof m.name!=='string'||!m.name.trim()||m.name.length>120)throw Error('У пакета отсутствует название');
    const paths=Object.keys(bundle.files);if(paths.length>128)throw Error('Слишком много файлов в пакете');
    for(const path of paths){if(!pathOK(path)||typeof bundle.files[path]!=='string')throw Error('Некорректный путь или содержимое файла: '+path);if(!/\.(?:js|css|svg|json|txt|md)$/i.test(path))asset(bundle,path);}
    for(const [entry,fallback]of [['rules','rules.js'],['view','view.js'],['styles','styles.css']]){
      if(m[entry]!==undefined&&m[entry]!==fallback)throw Error('Неподдерживаемая точка входа: '+entry);
      if(typeof bundle.files[fallback]!=='string'||!bundle.files[fallback].trim())throw Error('В пакете отсутствует '+fallback);
    }
    if(m.sounds!==undefined&&m.sounds!=='sounds.js')throw Error('Неподдерживаемая точка входа звуков');
    if(m.sounds&&!bundle.files['sounds.js'])throw Error('В пакете отсутствует sounds.js');
    return freeze(bundle);
  }
  function asset(bundle,path){
    if(!pathOK(path)||!Object.hasOwn(bundle.files,path))throw Error('Ресурс отсутствует в пакете: '+path);
    const text=bundle.files[path];if(/^data:/i.test(text)){
      if(!/^data:(?:image|audio|font)\/[\w.+-]+(?:;[\w=.+-]+)*(?:;base64)?,/i.test(text)&&!/^data:application\/(?:octet-stream|json|font-[\w-]+)(?:;[\w=.+-]+)*(?:;base64)?,/i.test(text))throw Error('Неподдерживаемый встроенный ресурс');
      return text;
    }
    const ext=path.split('.').pop().toLowerCase(),mime={svg:'image/svg+xml',css:'text/css',js:'text/javascript',json:'application/json',txt:'text/plain',md:'text/plain'}[ext];
    if(!mime)throw Error('Двоичный ресурс должен быть data URL: '+path);
    return 'data:'+mime+';charset=utf-8,'+encodeURIComponent(text);
  }
  function styles(bundle){
    const css=bundle.files['styles.css'];
    if(/@import\b|expression\s*\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g,'')))throw Error('CSS пакета не должен загружать внешние стили');
    return css.replace(/url\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gis,(_,quote,quoted,plain)=>{
      const url=(quoted??plain).trim();if(url.startsWith('#'))return `url("${url}")`;
      if(/^data:/i.test(url)){if(!/^data:(?:image|font|application)\//i.test(url))throw Error('Неподдерживаемый CSS ресурс');return `url("${url.replace(/"/g,'%22')}")`;}
      const resolved=asset(bundle,url.startsWith('./')?url.slice(2):url);return `url("${resolved.replace(/"/g,'%22')}")`;
    });
  }
  class Packs {
    constructor({engine=root.TabletopCore,views=root.PlayroomViews,catalog=root.PlayroomCatalog,storage,document=root.document}={}){
      if(!engine?.registerVersion||!engine?.activatePack||!views?.register||!views?.get||!views?.remove||!record(catalog))throw Error('Нужны движок, UI registry и каталог пакетов');
      this.engine=engine;this.views=views;this.catalog=catalog;this.document=document;this.storage=storage||{get:()=>root.localStorage?.getItem(STORAGE),set:value=>root.localStorage?.setItem(STORAGE,value)};
      this._items=new Map();this._active=new Map();this._bundled=new Set();this._removed=new Set();this._styles=new Map();this.warnings=[];
    }
    parse(value){return parse(value);}
    prepare(value){
      const bundle=parse(value),m=bundle.manifest,css=styles(bundle);let rules=null,view=null;
      const compiledCatalog=Object.assign(Object.create(null),clone(m));
      const scope={PlayroomCatalog:{[m.id]:compiledCatalog},PlayroomPack:Object.freeze({asset:path=>asset(bundle,path),id:m.id,version:m.version})};
      const deny=()=>{throw Error('Регистрация версий недоступна во время подготовки пакета');};
      scope.TabletopCore=scope.PlayroomEngine=Object.freeze({...this.engine,register:pack=>{if(rules||pack?.id!==m.id)throw Error('Пакет регистрирует неверную или повторную игру');rules=pack;return pack;},registerVersion:deny,activatePack:deny,unregisterVersion:deny});
      scope.PlayroomViews=Object.freeze({helpers:this.views.helpers,register:(id,render,cover)=>{if(view||id!==m.id||typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Некорректный интерфейс пакета');view={render,cover};}});
      scope.TabletopUI=Object.freeze({...this.views.helpers,helpers:this.views.helpers});
      for(const entry of ['rules.js','view.js','sounds.js']){
        if(bundle.files[entry]===undefined)continue;
        const module={exports:{}};
        // Trusted executable plugins, not a security sandbox. Staging keeps
        // ordinary registration/compilation failures out of the live registries.
        Function('globalThis','module','exports','"use strict";\n'+bundle.files[entry])(scope,module,module.exports);
      }
      if(!rules||!view||typeof rules.name!=='string'||!Number.isInteger(rules.min)||!Number.isInteger(rules.max)||rules.min<1||rules.max<rules.min||rules.max>32||!Array.isArray(rules.presets)||!rules.presets.length||!rules.presets.every(p=>p&&typeof p.id==='string')||!['create','legal','apply'].every(method=>typeof rules[method]==='function'))throw Error('В пакете нет корректных правил и интерфейса');
      if((rules.version&&rules.version!==m.version)||(rules.stateVersion&&rules.stateVersion!==m.stateVersion))throw Error('Версия правил не совпадает с manifest');
      const compiled={bundle,rules:{...rules,id:m.id,version:m.version,stateVersion:m.stateVersion},view,catalog:scope.PlayroomCatalog[m.id],styles:css};
      if(!record(compiled.catalog))throw Error('Некорректные метаданные интерфейса');
      const token=Object.freeze({id:m.id,version:m.version,manifest:clone(m)});prepared.set(token,{owner:this,compiled});return token;
    }
    _descriptor(item){const m=item.bundle.manifest;return{id:m.id,version:m.version,manifest:clone(m),active:this._active.get(m.id)===m.version,bundled:this._bundled.has(key(m.id,m.version))};}
    list(){return [...this._items.values()].map(item=>this._descriptor(item)).sort((a,b)=>a.id.localeCompare(b.id)||compare(b.version,a.version));}
    _resolve(id,version){
      const candidates=[...this._items.values()].filter(item=>item.bundle.manifest.id===id).sort((a,b)=>compare(b.bundle.manifest.version,a.bundle.manifest.version));
      const item=version?this._items.get(key(id,version)):candidates[0];
      if(!item){const error=Error(`Нужен установленный пакет ${id}${version?' версии '+version:''}`);Object.assign(error,{code:'PACK_VERSION_MISSING',game:id,packVersion:version});throw error;}return item;
    }
    _serialized(items=this._items,active=this._active,removed=this._removed){const text=JSON.stringify({format:'playroom-packs',formatVersion:1,packs:[...items.values()].map(item=>item.bundle),active:Object.fromEntries(active),removed:[...removed]});if(bytes(text)>MAX_TOTAL)throw Error('Библиотека пакетов слишком большая');return text;}
    _style(id,css){
      if(!this.document?.createElement)return;
      let node=this._styles.get(id)||this.document.querySelector?.(`style[data-playroom-pack="${id}"]`);
      if(css===null){node?.remove();this._styles.delete(id);return;}
      if(!node){node=this.document.createElement('style');node.setAttribute('data-playroom-pack',id);node.textContent=css;(this.document.head||this.document.documentElement).appendChild(node);}
      else node.textContent=css;
      this._styles.set(id,node);
    }
    _apply(item){
      const m=item.bundle.manifest;let previousRules,previousVersion;
      try{previousRules=this.engine.get(m.id);}catch(_){}
      try{previousVersion=this.engine.get(m.id,m.version);}catch(_){}
      const previousView=this.views.get(m.id),hadCatalog=Object.hasOwn(this.catalog,m.id),previousCatalog=this.catalog[m.id];
      const oldStyle=this._styles.get(m.id)||this.document?.querySelector?.(`style[data-playroom-pack="${m.id}"]`),previousCSS=oldStyle?.textContent??null;
      try{this.engine.activatePack(item.rules);this.views.register(m.id,item.view.render,item.view.cover);this.catalog[m.id]=item.catalog;this._style(m.id,item.styles);}
      catch(error){
        this.engine.unregisterVersion(m.id,m.version);
        if(previousVersion)this.engine.registerVersion(previousVersion,{replace:true});
        if(previousRules)this.engine.activatePack(previousRules);
        if(previousView)this.views.register(m.id,previousView.render,previousView.cover);else this.views.remove(m.id);
        if(hadCatalog)this.catalog[m.id]=previousCatalog;else delete this.catalog[m.id];
        this._style(m.id,previousCSS);throw error;
      }
      this._active.set(m.id,m.version);
      return {...this._descriptor(item),styles:item.styles,sounds:item.catalog.sounds||{},catalog:item.catalog};
    }
    activate(id,version){return this._apply(this._resolve(id,version));}
    install(token,{activate=true}={}){
      const entry=prepared.get(token);if(!entry||entry.owner!==this)throw Error('Сначала подтвердите доверие и подготовьте пакет');
      const item=entry.compiled,m=item.bundle.manifest,k=key(m.id,m.version),existing=this._items.get(k);
      if(existing&&canonical(existing.bundle)!==canonical(item.bundle))throw Error('Эта версия уже установлена с другим содержимым; увеличьте version');
      if(existing)return activate?this.activate(m.id,m.version):this._descriptor(existing);
      const before=this._serialized(),priorItems=this._items,priorRemoved=this._removed,items=new Map(this._items),active=new Map(this._active),removed=new Set(this._removed);items.set(k,item);removed.delete(k);if(activate)active.set(m.id,m.version);
      let previousVersion,previousActive;try{previousVersion=this.engine.get(m.id,m.version);}catch(_){}try{previousActive=this.engine.get(m.id);}catch(_){}
      this.storage.set(this._serialized(items,active,removed));
      try{this.engine.registerVersion(item.rules,{replace:true});this._items=items;this._removed=removed;return activate?this._apply(item):this._descriptor(item);}
      catch(error){this._items=priorItems;this._removed=priorRemoved;this.engine.unregisterVersion(m.id,m.version);if(previousVersion)this.engine.registerVersion(previousVersion,{replace:true});if(previousActive)this.engine.activatePack(previousActive);try{this.storage.set(before);}catch(_){}throw error;}
    }
    exportPack(id,version){return JSON.stringify(this._resolve(id,version).bundle,null,2);}
    remove(id,version){
      const item=this._resolve(id,version),m=item.bundle.manifest,k=key(id,m.version),items=new Map(this._items),active=new Map(this._active),removed=new Set(this._removed);items.delete(k);removed.add(k);
      const remaining=[...items.values()].filter(item=>item.bundle.manifest.id===id).sort((a,b)=>compare(b.bundle.manifest.version,a.bundle.manifest.version));
      if(active.get(id)===m.version){if(remaining.length)active.set(id,remaining[0].bundle.manifest.version);else active.delete(id);}
      const before=this._serialized();this.storage.set(this._serialized(items,active,removed));
      let result=null;
      try{
        if(active.has(id))result=this._apply(items.get(key(id,active.get(id))));
        else{this.views.remove(id);delete this.catalog[id];this._style(id,null);}
      }catch(error){try{this.storage.set(before);}catch(_){}throw error;}
      this._items=items;this._active=active;this._removed=removed;this._bundled.delete(k);this.engine.unregisterVersion(id,m.version);
      return result;
    }
    bootstrap(bundles=[]){
      if(!Array.isArray(bundles))throw Error('Некорректный встроенный каталог');
      const sources=new Map(),bundled=new Set(),removed=new Set();
      for(const input of bundles){const bundle=parse(input),k=key(bundle.manifest.id,bundle.manifest.version);sources.set(k,bundle);bundled.add(k);}
      let saved=null,raw=null,readable=true;this.warnings=[];try{raw=this.storage.get();}catch(error){readable=false;this.warnings.push('Не удалось прочитать библиотеку пакетов: '+error.message);}
      if(raw){try{if(bytes(raw)>MAX_TOTAL)throw Error();saved=JSON.parse(raw);if(saved.format!=='playroom-packs'||saved.formatVersion!==1||!Array.isArray(saved.packs)||!record(saved.active))throw Error();if(saved.removed!==undefined&&(!Array.isArray(saved.removed)||saved.removed.some(k=>typeof k!=='string'||!ID.test(k.split('@')[0])||!SEMVER.test(k.split('@')[1])||k.split('@').length!==2)))throw Error();for(const k of saved.removed||[])removed.add(k);for(const input of saved.packs){const bundle=parse(input),k=key(bundle.manifest.id,bundle.manifest.version),included=sources.get(k);if(included&&bundled.has(k)&&canonical(included)!==canonical(bundle))this.warnings.push('Встроенный пакет '+k+' отличается от сохранённой версии. Для совместимости партий используется сохранённая версия.');sources.set(k,bundle);}}catch(_){throw Error('Хранилище пакетов повреждено; исходные данные сохранены без изменений');}}
      for(const k of removed){sources.delete(k);bundled.delete(k);}
      const items=new Map(),active=new Map();
      for(const [k,bundle]of sources){const token=this.prepare(bundle);items.set(k,prepared.get(token).compiled);}
      for(const item of items.values()){const m=item.bundle.manifest;if(!active.has(m.id)||compare(m.version,active.get(m.id))>0)active.set(m.id,m.version);}
      for(const [id,version]of Object.entries(saved?.active||{}))if(items.has(key(id,version)))active.set(id,version);
      try{if(readable)this.storage.set(this._serialized(items,active,removed));}catch(error){this.warnings.push('Не удалось сохранить библиотеку пакетов: '+error.message);}
      for(const item of items.values())this.engine.registerVersion(item.rules,{replace:true});
      this._items=items;this._bundled=bundled;this._removed=removed;this._active=active;
      for(const [id,version]of active)this.activate(id,version);
      return this.list();
    }
  }
  Packs.parse=parse;Packs.compareVersions=compare;Packs.STORAGE_KEY=STORAGE;
  return Packs;
});

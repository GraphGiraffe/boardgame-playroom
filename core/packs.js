if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root, factory) {
  'use strict';
  const Packs = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Packs;
  root.TabletopPacks = Packs;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const Loader=root.PlayroomPackLoader||(typeof require==='function'?require('../platform/web/pack-loader.js'):null);
  const Tags=root.PlayroomTags||(typeof require==='function'?require('./tags.js'):null);
  const FORMAT='playroom-pack', STORAGE='playroom.packs.v1', MAX_BYTES=4*1024*1024;
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
    // Numeric version first; a test suffix only outranks its own base release.
    // Saved sessions continue to resolve their exact version.
    for(let i=1;i<4;i++){const x=BigInt(ma[i]),y=BigInt(mb[i]);if(x!==y)return x>y?1:-1;}
    if(!ma[4]||!mb[4])return ma[4]?1:mb[4]?-1:0;
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
  const SDK_FEATURES=Object.freeze(['local-input-v1','turn-order-v1','parameter-previews-v2','parameter-illustrations-v1','standard-parameter-ui-v1','arrival-departures-v1','concurrent-reactions-v1','player-status-v1']);
  function validateParameterPreviews(m){
    const invalid=()=>{throw Object.assign(Error(globalThis.PlayroomMessages.text('ui.packs.aa1f11edec45')),{code:'PACK_PARAMETER_PREVIEW_INVALID'});};
    const settings=m.settings===undefined?[]:m.settings,preset=m.presetSetting===undefined?{}:m.presetSetting,quantities=['cards','dice','health','lives'];
    const symbols=['undo','first','people','shuffle','rules','player','bot','trophy','clock','eye','eye-off','hand','board','ship','cards','dice','check','close','play','pause','history','stop','grid','teams','shield','sword','refresh','star','pieces','solitaire','lock','unlock'];
    if(!Array.isArray(settings)||!record(preset))invalid();
    if(settings.some(f=>record(f)&&(f.presentation==='mode'||Object.hasOwn(f,'inactiveWhen')||Object.hasOwn(f,'inactivePresentation')))&&!m.sdkFeatures?.includes?.('parameter-previews-v2'))invalid();
    const fields=new Map(settings.filter(record).filter(f=>typeof f.key==='string').map(f=>[f.key,f]));
    const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=100;
    const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
    const common=(p,parent={},partial=false)=>{
      const v={...parent,...p},allowed={declaration:['kind','actor','label'],symbol:['kind','icon'],illustrations:['kind','ids']}[v.kind];
      if(Object.keys(p).some(k=>!allowed.includes(k)))invalid();
      if(v.kind==='declaration'){
        if((!partial||Object.hasOwn(v,'actor'))&&!['human','bot'].includes(v.actor)||(!partial||Object.hasOwn(v,'label'))&&!text(v.label,24))invalid();
      }else if(v.kind==='illustrations'){
        if(!m.sdkFeatures?.includes?.('parameter-illustrations-v1')||(!partial||Object.hasOwn(v,'ids'))&&(!Array.isArray(v.ids)||v.ids.length<1||v.ids.length>4||v.ids.some(id=>typeof id!=='string'||! /^[A-Za-z0-9._-]{1,64}$/.test(id))))invalid();
      }else if(v.kind==='symbol'){
        if((!partial||Object.hasOwn(v,'icon'))&&!symbols.includes(v.icon))invalid();
      }
    };
    if([preset,...settings].filter(record).filter(f=>f.presentation==='mode').length>1)invalid();
    for(const field of [preset,...settings]){
      if(!record(field)||field.presentation!==undefined&&field.presentation!=='mode')invalid();
      const parent=field.preview;
      if(parent!==undefined){if(!record(parent)||typeof parent.kind!=='string')invalid();if(['declaration','symbol','illustrations'].includes(parent.kind))common(parent,{},true);else if(Object.keys(parent).length!==1||!quantities.includes(parent.kind))invalid();}
      let options=field.options===undefined?[]:field.options;if(!Array.isArray(options)||field.presentation==='mode'&&!options.length)invalid();
      if(Object.hasOwn(field,'inactiveWhen')||Object.hasOwn(field,'inactivePresentation')){
        const condition=field.inactiveWhen,inactive=field.inactivePresentation;
        if(!record(condition)||!Object.keys(condition).length||Object.keys(condition).length>16||Object.entries(condition).some(([key,value])=>!fields.has(key)||typeof value!=='string'||!Array.isArray(fields.get(key).options)||!fields.get(key).options.filter(record).some(o=>String(o.value)===value))||!record(inactive)||Object.keys(inactive).length!==2||!Object.hasOwn(inactive,'preview')||!Object.hasOwn(inactive,'description'))invalid();
        options=[...options,inactive];
      }
      for(const option of options){
        if(!record(option)||option.description!==undefined&&!text(option.description,360))invalid();const p=option.preview;
        if(p===undefined){if(field.presentation==='mode'&&!parent)invalid();if(['declaration','symbol','illustrations'].includes(parent?.kind))common({},parent);continue;}
        if(!record(p))invalid();const kind=Object.hasOwn(p,'kind')?p.kind:parent?.kind;
        if(['fleet','teams'].includes(kind)){
          const key=kind==='fleet'?'pieces':'teamSizes',values=p[key];
          if(field.presentation!=='mode'||Object.keys(p).length!==2||!Object.hasOwn(p,'kind')||!Array.isArray(values)||values.length<1||values.length>(kind==='fleet'?16:8)||values.some(n=>!Number.isSafeInteger(n)||n<1||n>(kind==='fleet'?16:32))||values.reduce((a,b)=>a+b,0)>(kind==='fleet'?100:32))invalid();
        }else if(['declaration','symbol','illustrations'].includes(kind)){
          common(p,parent);
        }else if(quantities.includes(kind)){
          if(Object.keys(p).some(k=>!['kind','count','countFrom'].includes(k))||Object.hasOwn(p,'count')&&Object.hasOwn(p,'countFrom')||Object.hasOwn(p,'count')&&!count(p.count))invalid();
          if(Object.hasOwn(p,'countFrom')){
            const s=p.countFrom;
            if(!record(s)||Object.keys(s).length!==2||typeof s.field!=='string'||!fields.has(s.field)||!record(s.values)||!Object.hasOwn(s,'values'))invalid();
            const referenced=fields.get(s.field).options;if(!Array.isArray(referenced)||referenced.some(o=>!record(o)))invalid();
            const ids=new Set(referenced.map(o=>String(o.value))),entries=Object.entries(s.values);
            if(!entries.length||entries.length>16||entries.some(([id,n])=>!ids.has(id)||!count(n)))invalid();
          }
        }else invalid();
      }
    }
  }
  function parse(value){
    const text=typeof value==='string'?value:JSON.stringify(value);
    if(typeof text!=='string'||bytes(text)>MAX_BYTES)throw Error(globalThis.PlayroomMessages.text("ui.packs.f5b2ba2ded85"));
    let bundle;try{bundle=JSON.parse(text);}catch(_){throw Error(globalThis.PlayroomMessages.text("ui.packs.86bb3a858015"));}
    if(!record(bundle)||bundle.format!==FORMAT||bundle.formatVersion!==1||!record(bundle.manifest)||!record(bundle.files))throw Error(globalThis.PlayroomMessages.text("ui.packs.aa1f11edec45"));
    const m=bundle.manifest;
    validateParameterPreviews(m);
    if(m.tags!==undefined||m.playModes!==undefined){if(!Tags)throw Error(globalThis.PlayroomMessages.text("ui.packs.ab9cbd0aeab5"));Tags.validate(m);}
    if(typeof m.id!=='string'||!ID.test(m.id)||typeof m.version!=='string'||!SEMVER.test(m.version))throw Error(globalThis.PlayroomMessages.text("ui.packs.483f600985f1"));
    if(m.tileTheme!==undefined&&!['green','coral','blue','gold','violet'].includes(m.tileTheme))throw Error(globalThis.PlayroomMessages.text("ui.packs.964115e4eeda"));
    if(m.skinFamilies!==undefined&&(!Array.isArray(m.skinFamilies)||m.skinFamilies.length>32||m.skinFamilies.some(f=>typeof f!=='string'||!ID.test(f))||new Set(m.skinFamilies).size!==m.skinFamilies.length)||m.defaultSkins!==undefined&&(!record(m.defaultSkins)||Object.entries(m.defaultSkins).some(([family,variant])=>!m.skinFamilies?.includes(family)||typeof variant!=='string'||!ID.test(variant))))throw Error('PACK_SKINS_INVALID');
    if(m.viewApi!==3)throw Error(globalThis.PlayroomMessages.text("ui.packs.ad05493d1057"));
    if(m.engineApi!==4||!Number.isSafeInteger(m.stateVersion)||m.stateVersion<1)throw Error(globalThis.PlayroomMessages.text("ui.packs.4cec05765e2b"));
    if(m.sdkFeatures!==undefined&&(!Array.isArray(m.sdkFeatures)||m.sdkFeatures.length>16||new Set(m.sdkFeatures).size!==m.sdkFeatures.length||m.sdkFeatures.some(feature=>!SDK_FEATURES.includes(feature))))throw Object.assign(Error(globalThis.PlayroomMessages.text('errors.PACK_SDK_UNSUPPORTED')),{code:'PACK_SDK_UNSUPPORTED'});
    if(typeof m.name!=='string'||!m.name.trim()||m.name.length>120)throw Error(globalThis.PlayroomMessages.text("ui.packs.b082fee613b3"));
    if(m.shortName!==undefined&&(typeof m.shortName!=='string'||!m.shortName.trim()||m.shortName.length>60))throw Error(globalThis.PlayroomMessages.text("ui.packs.b082fee613b3"));
    const paths=Object.keys(bundle.files);if(paths.length>128)throw Error(globalThis.PlayroomMessages.text("ui.packs.a2c15b806ca4"));
    for(const path of paths){if(!pathOK(path)||typeof bundle.files[path]!=='string')throw Error(globalThis.PlayroomMessages.text("ui.packs.dc8bf4d2602b",{p0:String(path)}));if(!/\.(?:js|css|svg|json|txt|md)$/i.test(path))asset(bundle,path);}
    for(const [entry,fallback]of [['rules','rules.js'],['view','view.js'],['styles','styles.css']]){
      if(m[entry]!==undefined&&m[entry]!==fallback)throw Error(globalThis.PlayroomMessages.text("ui.packs.c739ef306869",{p0:String(entry)}));
      if(typeof bundle.files[fallback]!=='string'||!bundle.files[fallback].trim())throw Error(globalThis.PlayroomMessages.text("ui.packs.95e0be37496c",{p0:String(fallback)}));
    }
    if(m.sounds!==undefined&&m.sounds!=='sounds.js')throw Error(globalThis.PlayroomMessages.text("ui.packs.151c48342d6f"));
    if(m.sounds&&!bundle.files['sounds.js'])throw Error(globalThis.PlayroomMessages.text("ui.packs.63ac5e8de413"));
    return freeze(bundle);
  }
  function asset(bundle,path){
    if(!pathOK(path)||!Object.hasOwn(bundle.files,path))throw Error(globalThis.PlayroomMessages.text("ui.packs.77d455868cd8",{p0:String(path)}));
    const text=bundle.files[path];if(/^data:/i.test(text)){
      if(!/^data:(?:image|audio|font)\/[\w.+-]+(?:;[\w=.+-]+)*(?:;base64)?,/i.test(text)&&!/^data:application\/(?:octet-stream|json|font-[\w-]+)(?:;[\w=.+-]+)*(?:;base64)?,/i.test(text))throw Error(globalThis.PlayroomMessages.text("ui.packs.e8c275df41f3"));
      return text;
    }
    const ext=path.split('.').pop().toLowerCase(),mime={svg:'image/svg+xml',css:'text/css',js:'text/javascript',json:'application/json',txt:'text/plain',md:'text/plain'}[ext];
    if(!mime)throw Error(globalThis.PlayroomMessages.text("ui.packs.19139fa30c76",{p0:String(path)}));
    return 'data:'+mime+';charset=utf-8,'+encodeURIComponent(text);
  }
  function styles(bundle){
    const css=bundle.files['styles.css'];
    if(/(?:#app\b|\.(?:table-shell|table-header|player-strip|game-layout-slot|app-game-layout|own-hand|hand-track|opponent-hands|scene-actions|piece-count|player-hand|player-panel|player-info|player-details|player-badges|mini-hand|hand-heading|hand-tools|opponent-hand|opponent-label|is-open-hand)(?![-\w]))/.test(css.replace(/\/\*[\s\S]*?\*\//g,'')))throw Error(globalThis.PlayroomMessages.text("ui.packs.3a1bfc71aad0"));
    if(/@import\b|expression\s*\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g,'')))throw Error(globalThis.PlayroomMessages.text("ui.packs.b40ee7b866db"));
    return css.replace(/url\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gis,(_,quote,quoted,plain)=>{
      const url=(quoted??plain).trim();if(url.startsWith('#'))return `url("${url}")`;
      if(/^data:/i.test(url)){if(!/^data:(?:image|font|application)\//i.test(url))throw Error(globalThis.PlayroomMessages.text("ui.packs.502b89b0f58e"));return `url("${url.replace(/"/g,'%22')}")`;}
      const resolved=asset(bundle,url.startsWith('./')?url.slice(2):url);return `url("${resolved.replace(/"/g,'%22')}")`;
    });
  }
  class Packs {
    constructor({engine=root.TabletopCore,views=root.PlayroomViews,catalog=root.PlayroomCatalog,storage,document=root.document,modelAdapter=root.PlayroomModelRegistration?.adapt||(typeof require==='function'?require('./model-registration.js').adapt:null)}={}){
      if(!engine?.registerVersion||!engine?.activatePack||!views?.register||!views?.get||!views?.remove||!record(catalog))throw Error(globalThis.PlayroomMessages.text("ui.packs.acf00eb6a722"));
      this.engine=engine;this.views=views;this.catalog=catalog;this.document=document;this.modelAdapter=modelAdapter;this.storage=storage||{get:()=>root.localStorage?.getItem(STORAGE),set:value=>root.localStorage?.setItem(STORAGE,value)};
      this._items=new Map();this._active=new Map();this._bundled=new Set();this._removed=new Set();this._styles=new Map();this.warnings=[];
      if(this.storage.commit){let queue=Promise.resolve();for(const name of ['bootstrap','install','remove','discardQuarantine']){const operation=this[name].bind(this);this[name]=(...args)=>{const result=queue.then(()=>operation(...args));queue=result.catch(()=>{});return result;};}}

    }
    parse(value){return parse(value);}
    prepare(value){
      const bundle=parse(value),m=bundle.manifest,css=styles(bundle);let rules=null,view=null;
      const compiledCatalog=Object.assign(Object.create(null),clone(m));
      const standardRules=root.PlayroomRooms||(typeof require==='function'?require('../application/rooms.js'):null);
      compiledCatalog.settings=(compiledCatalog.settings||[]).map(field=>standardRules.standardRule(field));
      const scope={PlayroomMessages:root.PlayroomMessages,PlayroomCatalog:{[m.id]:compiledCatalog},PlayroomPack:Object.freeze({asset:path=>asset(bundle,path),id:m.id,version:m.version,stateVersion:m.stateVersion,engineApi:m.engineApi,sdkFeatures:SDK_FEATURES,adaptModel:spec=>{
        if(m.engineApi!==4||typeof this.modelAdapter!=='function')throw Error(globalThis.PlayroomMessages.text("ui.packs.33a5bbc8c9da"));
        return this.modelAdapter(this.engine,spec);
      }})};
      const deny=()=>{throw Error(globalThis.PlayroomMessages.text("ui.packs.b485bab9ce53"));};
      scope.TabletopCore=scope.PlayroomEngine=Object.freeze({...this.engine,register:pack=>{if(rules||pack?.id!==m.id)throw Error(globalThis.PlayroomMessages.text("ui.packs.1f2cb86505d4"));rules=pack;return pack;},registerVersion:deny,activatePack:deny,unregisterVersion:deny});
      scope.PlayroomViews=Object.freeze({helpers:this.views.helpers,registerTutorial:(id,tutorial)=>{if(!view||id!==m.id||typeof tutorial!=='function')throw Error('Invalid tutorial');view.tutorial=tutorial;},register:(id,render,cover,options={})=>{if(view||id!==m.id||typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error(globalThis.PlayroomMessages.text("ui.packs.ced792a28241"));const surfaces=options?.surfaces||{};if(!record(surfaces)||Object.entries(surfaces).some(([key,fn])=>!['table','player'].includes(key)||typeof fn!=='function'))throw Error(globalThis.PlayroomMessages.text("ui.packs.73658a6cc21c"));if(options.illustrations!==undefined&&typeof options.illustrations!=='function')throw Error('Invalid rule illustrations');if(options.reveal!==undefined&&typeof options.reveal!=='function')throw Error('Invalid reveal renderer');if(options.seating!==undefined&&options.seating!=='row')throw Error('Invalid seating policy');view={render,cover,illustrations:options.illustrations,reveal:options.reveal,seating:options.seating,surfaces:{...surfaces}};}});
      scope.TabletopUI=Object.freeze({...this.views.helpers,helpers:this.views.helpers});
      for(const entry of ['rules.js','view.js','sounds.js']){
        if(bundle.files[entry]===undefined)continue;
        // Trusted executable plugins, not a security sandbox. Staging keeps
        // ordinary registration/compilation failures out of the live registries.
        Loader.execute(bundle.files[entry],scope);
      }
      if(!rules||!view||typeof rules.name!=='string'||!Number.isInteger(rules.min)||!Number.isInteger(rules.max)||rules.min<1||rules.max<rules.min||rules.max>32||!Array.isArray(rules.presets)||!rules.presets.length||!rules.presets.every(p=>p&&typeof p.id==='string')||!['create','legal','apply'].every(method=>typeof rules[method]==='function'))throw Error(globalThis.PlayroomMessages.text("ui.packs.7fc357d22602"));
      if((rules.version&&rules.version!==m.version)||(rules.stateVersion&&rules.stateVersion!==m.stateVersion))throw Error(globalThis.PlayroomMessages.text("ui.packs.5da21a35679c"));
      if(m.engineApi===4&&rules.modelContractVersion!==1)throw Error(globalThis.PlayroomMessages.text("ui.packs.4e3f1bcc4946"));
      const compiled={byteSize:bytes(JSON.stringify(bundle)),bundle,rules:{...rules,id:m.id,version:m.version,stateVersion:m.stateVersion},view,catalog:{...scope.PlayroomCatalog[m.id],settings:(scope.PlayroomCatalog[m.id].settings||[]).map(field=>standardRules.standardRule(field))},styles:css};
      if(!record(compiled.catalog))throw Error(globalThis.PlayroomMessages.text("ui.packs.f2a5b673a1e5"));
      const token=Object.freeze({id:m.id,version:m.version,manifest:clone(m)});prepared.set(token,{owner:this,compiled});return token;
    }
    _descriptor(item){const m=item.bundle.manifest;return{id:m.id,version:m.version,byteSize:item.byteSize,manifest:clone(m),active:this._active.get(m.id)===m.version,bundled:this._bundled.has(key(m.id,m.version))};}
    list(){return [...this._items.values()].map(item=>this._descriptor(item)).sort((a,b)=>a.id.localeCompare(b.id)||compare(b.version,a.version));}
    _resolve(id,version){
      const candidates=[...this._items.values()].filter(item=>item.bundle.manifest.id===id).sort((a,b)=>compare(b.bundle.manifest.version,a.bundle.manifest.version));
      const item=version?this._items.get(key(id,version)):candidates[0];
      if(!item){const error=Error(globalThis.PlayroomMessages.text("ui.packs.743b49f00699",{p0:String(id),p1:String(version?globalThis.PlayroomMessages.text("ui.packs.12aee5af7b3e",{p0:String(version)}):'')}));Object.assign(error,{code:'PACK_VERSION_MISSING',game:id,packVersion:version});throw error;}return item;
    }
    _serialized(items=this._items,active=this._active,removed=this._removed){const text=JSON.stringify({format:'playroom-packs',formatVersion:1,packs:[...items.values()].map(item=>item.bundle),active:Object.fromEntries(active),removed:[...removed],quarantined:this.quarantined||[],rawBackups:this.rawBackups||[]});return text;}
    _persist(text,apply,guard=()=>{}){
      guard();
      if(this.storage.commit){const before=this.storage.get();return this.storage.commit(text,{guard}).then(async()=>{try{return apply();}catch(error){await this.storage.commit(before);throw error;}});}
      this.storage.set(text);return apply();
    }
    _style(id,css){
      if(!this.document?.createElement)return;
      let node=this._styles.get(id)||this.document.querySelector?.(`style[data-playroom-pack="${id}"]`);
      if(css===null){node?.remove();this._styles.delete(id);return;}
      if(!node){node=this.document.createElement('style');node.setAttribute('data-playroom-pack',id);node.textContent=css;(this.document.head||this.document.documentElement).appendChild(node);}
      else if(node.textContent!==css)node.textContent=css;
      this._styles.set(id,node);
    }
    _apply(item){
      const m=item.bundle.manifest;let previousRules,previousVersion;
      try{previousRules=this.engine.get(m.id);}catch(_){}
      try{previousVersion=this.engine.get(m.id,m.version);}catch(_){}
      const previousView=this.views.get(m.id),hadCatalog=Object.hasOwn(this.catalog,m.id),previousCatalog=this.catalog[m.id];
      const oldStyle=this._styles.get(m.id)||this.document?.querySelector?.(`style[data-playroom-pack="${m.id}"]`),previousCSS=oldStyle?.textContent??null;
      // A render may ensure its exact pack repeatedly. Keep live registrations
      // stable, but repair registry/version replacements rather than trusting a flag.
      const sameRules=previousRules&&previousVersion===previousRules&&Object.entries(item.rules).every(([name,value])=>previousRules[name]===value);
      const sameView=previousView&&['render','cover','illustrations','reveal','seating','tutorial'].every(name=>previousView[name]===item.view[name])&&Object.keys(previousView.surfaces||{}).length===Object.keys(item.view.surfaces).length&&Object.entries(item.view.surfaces).every(([name,render])=>previousView.surfaces?.[name]===render);
      const alreadyActive=this._active.get(m.id)===m.version&&sameRules&&sameView&&previousCatalog===item.catalog;
      try{if(!alreadyActive){this.engine.activatePack(item.rules);this.views.register(m.id,item.view.render,item.view.cover,{illustrations:item.view.illustrations,surfaces:item.view.surfaces,reveal:item.view.reveal,seating:item.view.seating});if(item.view.tutorial)this.views.registerTutorial?.(m.id,item.view.tutorial);}this.catalog[m.id]=item.catalog;this._style(m.id,item.styles);}
      catch(error){
        this.engine.unregisterVersion(m.id,m.version);
        if(previousVersion)this.engine.registerVersion(previousVersion,{replace:true});
        if(previousRules)this.engine.activatePack(previousRules);
        if(previousView){this.views.register(m.id,previousView.render,previousView.cover,{illustrations:previousView.illustrations,surfaces:previousView.surfaces,reveal:previousView.reveal,seating:previousView.seating});if(previousView.tutorial)this.views.registerTutorial?.(m.id,previousView.tutorial);}else this.views.remove(m.id);
        if(hadCatalog)this.catalog[m.id]=previousCatalog;else delete this.catalog[m.id];
        this._style(m.id,previousCSS);throw error;
      }
      this._active.set(m.id,m.version);
      return {...this._descriptor(item),styles:item.styles,sounds:item.catalog.sounds||{},catalog:item.catalog};
    }
    activate(id,version){return this._apply(this._resolve(id,version));}
    install(token,{activate=true}={}){
      const entry=prepared.get(token);if(!entry||entry.owner!==this)throw Error(globalThis.PlayroomMessages.text("ui.packs.5701002a2027"));
      const item=entry.compiled,m=item.bundle.manifest,k=key(m.id,m.version),existing=this._items.get(k);
      if(existing&&canonical(existing.bundle)!==canonical(item.bundle))throw Error(globalThis.PlayroomMessages.text("ui.packs.828642b64148"));
      if(existing)return activate?this.activate(m.id,m.version):this._descriptor(existing);
      const before=this._serialized(),priorItems=this._items,priorRemoved=this._removed,items=new Map(this._items),active=new Map(this._active),removed=new Set(this._removed);items.set(k,item);removed.delete(k);if(activate)active.set(m.id,m.version);
      let previousVersion,previousActive;try{previousVersion=this.engine.get(m.id,m.version);}catch(_){}try{previousActive=this.engine.get(m.id);}catch(_){}
      return this._persist(this._serialized(items,active,removed),()=>{
      try{this.engine.registerVersion(item.rules,{replace:true});this._items=items;this._removed=removed;return activate?this._apply(item):this._descriptor(item);}
      catch(error){this._items=priorItems;this._removed=priorRemoved;this.engine.unregisterVersion(m.id,m.version);if(previousVersion)this.engine.registerVersion(previousVersion,{replace:true});if(previousActive)this.engine.activatePack(previousActive);try{this.storage.set(before);}catch(_){}throw error;}
      });
    }
    // Synchronous staging validation registers only the exact rules version;
    // it never changes active UI/catalog or persists an unvalidated save.
    validatePrepared(token,validate){
      const entry=prepared.get(token);if(!entry||entry.owner!==this||typeof validate!=='function')throw Error('Invalid prepared validation');
      const item=entry.compiled,m=item.bundle.manifest,existing=this._items.get(key(m.id,m.version));
      if(existing){if(canonical(existing.bundle)!==canonical(item.bundle))throw Error('SAVE_PACK_CONFLICT');return validate();}
      let previous,active;try{previous=this.engine.get(m.id,m.version);}catch{}try{active=this.engine.get(m.id);}catch{}
      this.engine.registerVersion(item.rules,{replace:true});
      try{const result=validate();if(result?.then)throw Error('Prepared validation must be synchronous');return result;}
      finally{this.engine.unregisterVersion(m.id,m.version);if(previous)this.engine.registerVersion(previous,{replace:true});if(active?.version===m.version)this.engine.activatePack(active);}
    }
    // Presentation-only payload: no rule execution, Session, or saved state.
    exportView(id,version){const item=this._resolve(id,version),bundle=item.bundle;return {manifest:clone(bundle.manifest),rules:clone(item.rules.rules||[]),...(item.rules.rulebook?{rulebook:clone(item.rules.rulebook)}:{}),sounds:clone(item.catalog.sounds||{}),view:bundle.files['view.js'],styles:item.styles,assets:Object.fromEntries(Object.keys(bundle.files).filter(path=>!['rules.js','view.js','styles.css','sounds.js'].includes(path)).map(path=>[path,asset(bundle,path)]))};}
    exportPack(id,version){return JSON.stringify(this._resolve(id,version).bundle,null,2);}
    remove(id,version,{guard=()=>{}}={}){
      const item=this._resolve(id,version),m=item.bundle.manifest,k=key(id,m.version),items=new Map(this._items),active=new Map(this._active),removed=new Set(this._removed);items.delete(k);removed.add(k);
      const remaining=[...items.values()].filter(item=>item.bundle.manifest.id===id).sort((a,b)=>compare(b.bundle.manifest.version,a.bundle.manifest.version));
      if(active.get(id)===m.version){if(remaining.length)active.set(id,remaining[0].bundle.manifest.version);else active.delete(id);}
      const before=this._serialized();return this._persist(this._serialized(items,active,removed),()=>{
      let result=null;
      try{
        if(active.has(id))result=this._apply(items.get(key(id,active.get(id))));
        else{this.views.remove(id);delete this.catalog[id];this._style(id,null);}
      }catch(error){try{this.storage.set(before);}catch(_){}throw error;}
      this._items=items;this._active=active;this._removed=removed;this._bundled.delete(k);this.engine.unregisterVersion(id,m.version);
      return result;
      },guard);
    }
    discardQuarantine(index=null,{guard=()=>{}}={}){
      const previous=this.quarantined;
      this.quarantined=index===null?[]:this.quarantined.filter((_,i)=>i!==index);
      const text=this._serialized(),next=this.quarantined;this.quarantined=previous;
      return this._persist(text,()=>{this.quarantined=next;},guard);
    }
    bootstrap(bundles=[],options={}){
      if(!Array.isArray(bundles))throw Error(globalThis.PlayroomMessages.text("ui.packs.d0c2c91da454"));
      const sources=new Map(),bundled=new Set(),removed=new Set();this.warnings=[];this.quarantined=[];this.rawBackups=[];
      for(const input of bundles){const bundle=parse(input),k=key(bundle.manifest.id,bundle.manifest.version);sources.set(k,bundle);bundled.add(k);}
      let saved=null,raw=null,readable=true;
      try{raw=this.storage.get();}catch(error){readable=false;this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.bf86059fb52f",{p0:String(error.message)}));}
      if(raw){try{
        saved=JSON.parse(raw);
        if(saved.format!=='playroom-packs'||saved.formatVersion!==1||!Array.isArray(saved.packs)||!record(saved.active))throw Error(globalThis.PlayroomMessages.text("ui.packs.63fdd980cf43"));
        this.quarantined=Array.isArray(saved.quarantined)?saved.quarantined:[];this.rawBackups=Array.isArray(saved.rawBackups)?saved.rawBackups:[];
        for(const k of saved.removed||[])if(typeof k==='string'&&ID.test(k.split('@')[0])&&SEMVER.test(k.split('@')[1]))removed.add(k);
        for(const input of saved.packs){try{const bundle=parse(input),m=bundle.manifest,k=key(m.id,m.version),included=sources.get(k);
          if(included&&canonical(included)!==canonical(bundle)){this.quarantined.push({bundle:input,reason:globalThis.PlayroomMessages.text("ui.packs.e17e52dfa914")});continue;}
          sources.set(k,bundle);
        }catch(error){this.quarantined.push({bundle:input,reason:error.message});}}
      }catch(_){saved=null;this.rawBackups.push(raw);this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.88d33f2b1234"));}}
      if(options.restoreBuiltins)for(const k of bundled)removed.delete(k);
      for(const k of removed){sources.delete(k);bundled.delete(k);}
      const items=new Map(),active=new Map();
      for(const [k,bundle]of sources){try{const token=this.prepare(bundle);items.set(k,prepared.get(token).compiled);}catch(error){if(bundled.has(k))throw error;this.quarantined.push({bundle,reason:error.message});}}
      for(const item of items.values()){const m=item.bundle.manifest;if(!active.has(m.id)||compare(m.version,active.get(m.id))>0)active.set(m.id,m.version);}
      if(this.quarantined.length)this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.acf425f8c8f5",{p0:String(this.quarantined.length)}));
      const publish=()=>{
      for(const item of items.values())this.engine.registerVersion(item.rules,{replace:true});
      this._items=items;this._bundled=bundled;this._removed=removed;this._active=active;
      for(const [id,version]of active)this.activate(id,version);
      return this.list();};
      if(this.storage.commit)return this._persist(this._serialized(items,active,removed),publish);
      try{if(readable)this.storage.set(this._serialized(items,active,removed));}catch(error){this.warnings.push(error.message);}
      return publish();
    }
  }
  Packs.parse=parse;Packs.compareVersions=compare;Packs.STORAGE_KEY=STORAGE;Packs.SDK_FEATURES=SDK_FEATURES;
  return Packs;
});

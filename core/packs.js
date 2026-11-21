if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root, factory) {
  'use strict';
  const Packs = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Packs;
  root.TabletopPacks = Packs;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const Loader=root.PlayroomPackLoader||(typeof require==='function'?require('../platform/web/pack-loader.js'):null);
  const LayoutPolicy=root.PlayroomLayoutPolicy||(typeof require==='function'?require('../presentation/layout-policy.js'):null);
  const Images=root.PlayroomSceneImages||(typeof require==='function'?require('../platform/web/scene-images.js'):null);
  const Tags=root.PlayroomTags||(typeof require==='function'?require('./tags.js'):null);
  const FORMAT='playroom-pack', STORAGE='playroom.packs.v1', MAX_BYTES=4_000_000;
  const ID=/^[a-z][a-z0-9_-]{0,63}$/;
  const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  const prepared = new WeakMap();
  const releasePrepared=typeof FinalizationRegistry==='function'?new FinalizationRegistry(guest=>{try{guest.close();}catch{}}):null;
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  // Both installed packs and SDK hosts resolve semantic samples through their
  // declared resource closure before the shared audio definition validation.
  function resolveSoundAssets(sounds,resolveAsset){return Object.fromEntries(Object.entries(sounds||{}).map(([id,cue])=>[id,{...cue,src:record(cue.src)&&cue.src.kind==='asset'?resolveAsset(cue.src.id):cue.src}]));}
  const clone=value=>JSON.parse(JSON.stringify(value));
  const bytes=value=>new TextEncoder().encode(value).byteLength;
  const key=(id,version)=>id+'@'+version;
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  function canonical(value){return JSON.stringify(value,(_,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);}
  // Compare parsed JSON without encoding the same archived sources and media
  // again. Property order has no bearing on a pack's version identity.
  function sameJSON(left,right){
    if(left===right)return true;
    if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
    if(Array.isArray(left)||Array.isArray(right)){
      return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>sameJSON(item,right[index]));
    }
    const keys=Object.keys(left);
    return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameJSON(left[key],right[key]));
  }
  function compare(a,b){
    const ma=SEMVER.exec(a),mb=SEMVER.exec(b);
    // SemVer precedence: a stable release outranks its own prereleases.
    // Saved sessions continue to resolve their exact version.
    for(let i=1;i<4;i++){const x=BigInt(ma[i]),y=BigInt(mb[i]);if(x!==y)return x>y?1:-1;}
    if(!ma[4]||!mb[4])return ma[4]?-1:mb[4]?1:0;
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
  const SDK_FEATURES=Object.freeze(['isolated-execution-v1','die-faces-v1','local-input-v1','turn-order-v1','parameter-previews-v2','parameter-illustrations-v1','standard-parameter-ui-v1','arrival-departures-v1','concurrent-reactions-v1','player-status-v1','anchored-board-v1','mixed-inventory-v1','inventory-views-v1','inventory-slots-v1','anchored-orientation-v1']);
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
    if(!record(bundle)||bundle.format!==FORMAT||![1,2].includes(bundle.formatVersion)||!record(bundle.manifest)||!record(bundle.files))throw Error(globalThis.PlayroomMessages.text("ui.packs.aa1f11edec45"));
    const m=localizedManifest(bundle);if(bundle.formatVersion===2)sdkSource(bundle);
    if(m.capabilities!==undefined&&(!record(m.capabilities)||m.capabilities.bots!==undefined&&typeof m.capabilities.bots!=='boolean'))throw Error('PACK_CAPABILITIES_INVALID');
    if(m.execution!==undefined&&m.execution!=='isolated-v1')throw Error('PACK_EXECUTION_UNSUPPORTED');
    if(m.execution==='isolated-v1'&&!m.sdkFeatures?.includes('isolated-execution-v1'))throw Object.assign(Error('Обновите пак до текущего изолированного SDK.'),{code:'PACK_SDK_UNSUPPORTED'});
    validateParameterPreviews(runtimeManifest(m));
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
  function runtimeManifest(manifest,locale=root.PlayroomMessages?.locale||'ru'){
    const Common=root.PlayroomCommonFormat||(typeof require==='function'?require('../presentation/common-format.js'):null);
    const block=manifest.settings,structured=record(block),fields=structured?block.fields:block||[];
    if(!Array.isArray(fields)||structured&&(!Array.isArray(block.groups)||Object.keys(block).some(key=>!['fields','groups'].includes(key))))throw Error('PACK_SETTINGS_INVALID');
    const rows=field=>{
      if(field.range!==undefined){
        const r=field.range;
        if(!record(r)||Object.keys(r).sort().join(',')!=='max,min,step'||Object.hasOwn(field,'options')||![r.min,r.max,r.step,r.max-r.min].every(Number.isSafeInteger)||r.step<=0||r.max<r.min||(r.max-r.min)%r.step||(r.max-r.min)/r.step>=256)throw Error('PACK_SETTINGS_RANGE_INVALID');
        return Array.from({length:(r.max-r.min)/r.step+1},(_,i)=>({value:r.min+i*r.step}));
      }
      return field.options;
    };
    if(structured){
      const keys=fields.map(field=>field?.key),types={string:value=>typeof value==='string',boolean:value=>typeof value==='boolean',integer:Number.isSafeInteger,number:value=>typeof value==='number'&&Number.isFinite(value)};
      if(fields.length>64||new Set(keys).size!==keys.length)throw Error('PACK_SETTINGS_INVALID');
      for(const field of fields){
        const matches=types[field?.valueType],options=record(field)?rows(field):null;
        if(!record(field)||!['preset','option','standard'].includes(field.kind)||!['slider','select'].includes(field.control)||!matches||!matches(field.default)||!Array.isArray(options)||!options.length||options.length>256||options.some(option=>!record(option)||!matches(option.value))||!options.some(option=>option.value===field.default)||['min','max','step'].some(key=>Object.hasOwn(field,key)))throw Error('PACK_SETTINGS_INVALID');
      }
      const used=new Set();
      for(const group of block.groups){if(!record(group)||!['main','end'].includes(group.placement)||!Array.isArray(group.fields)||new Set(group.fields).size!==group.fields.length||group.fields.some(key=>!keys.includes(key)||used.has(key)))throw Error('PACK_SETTINGS_GROUP_INVALID');group.fields.forEach(key=>used.add(key));}
    }
    const presets=fields.filter(field=>field?.kind==='preset');
    if(presets.length>1||presets.length&&(presets[0].key!=='preset'||Object.hasOwn(manifest,'presetSetting')))throw Error('PACK_SETTINGS_INVALID');
    const clean=field=>{
      const value=Object.fromEntries(Object.entries(field).filter(([key])=>!['kind','valueType','range','optionDefaults'].includes(key))),defaults=field.optionDefaults===undefined?{}:field.optionDefaults;
      if(!record(defaults)||Object.keys(defaults).some(key=>key!=='description'))throw Error('PACK_SETTINGS_DEFAULTS_INVALID');
      if(field.unit!==undefined&&!['s','min','h'].includes(field.unit))throw Error('PACK_SETTINGS_UNIT_INVALID');
      const options=rows(field);
      if(options)value.options=options.map(option=>{const result=Object.fromEntries(Object.entries({...defaults,...option}).filter(([key,item])=>key!=='description'||item!==null));if(result.label===undefined)result.label=Common.value(result.value,{unit:field.unit,locale,fallback:manifest.defaultLanguage||'ru'});return result;});
      return value;
    };
    return {...manifest,...(presets.length?{presetSetting:clean(presets[0])}:{}),settings:fields.filter(field=>field!==presets[0]).map(clean),...(structured?{ruleGroups:block.groups.map(group=>({...Object.fromEntries(Object.entries(group).filter(([key])=>key!=='placement')),...(group.placement==='end'?{end:true}:{})}))}:{})};
  }

  function localizedManifest(bundle,locale=root.PlayroomMessages?.locale||'ru'){
    const catalogs=bundle.lang||(bundle.formatVersion===2?bundle.sdk?.catalogs:null)||{ru:{}};
    const Localization=root.PlayroomLocalization||(typeof require==='function'?require('../presentation/localization.js'):null);
    if(!record(catalogs)||!Object.keys(catalogs).length)throw Error('PACK_LANG_INVALID');
    const fallback=bundle.manifest.defaultLanguage||'ru';
    const result=new Localization.Translator({catalogs,locale,fallback}).resolve(bundle.manifest);
    if(result.estimatedDurationMin!==undefined){const v=result.estimatedDurationMin,items=Array.isArray(v)?v:[v];if(items.length<1||items.length>2||items.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)||items.length===2&&items[0]>items[1])throw Error('PACK_DURATION_INVALID');result.estimatedDuration=(root.PlayroomCommonFormat||require('../presentation/common-format.js')).quantity(v,'min',locale,fallback);}
    return result;
  }
  function modelOptions(sourceManifest, configuration, selections) {
    const fields=sourceManifest.settings?.fields;
    if(!Array.isArray(fields))return selections;
    const typed=new Set(fields.filter(field=>['boolean','integer','number'].includes(field.valueType)).map(field=>field.key));
    if(!typed.size)return selections;
    const options={...selections};
    for(const field of configuration.settings){
      if(!typed.has(field.key))continue;
      // Room forms persist option IDs as strings. Use the declared value at the model port.
      const selected=Object.hasOwn(options,field.key)?options[field.key]:field.default;
      const choice=field.options.find(option=>option.value===selected||typeof selected==='string'&&String(option.value)===selected);
      if(!choice)throw Object.assign(Error('PACK_SETTING_VALUE_INVALID'),{code:'PACK_SETTING_VALUE_INVALID',field:field.key});
      options[field.key]=choice.value;
    }
    return options;
  }
  function sdkSource(bundle){if(bundle.formatVersion===2){if(bundle.manifest?.execution!=='isolated-v1'||!record(bundle.sdk)||Object.hasOwn(bundle.sdk,'manifest')||Object.hasOwn(bundle.files,'sdk/source.json')||bundle.sdk.format!=='playroom-sdk-source'||bundle.sdk.contractVersion!==1)throw Error('PACK_SDK_SOURCE_INVALID');if(bundle.lang&&Object.hasOwn(bundle.sdk,'catalogs'))throw Error('PACK_LANG_DUPLICATE');return {...bundle.sdk,manifest:bundle.manifest,...(bundle.lang?{catalogs:bundle.lang}:{})};}if(Object.hasOwn(bundle,'sdk'))throw Error('PACK_SDK_SOURCE_INVALID');try{return JSON.parse(bundle.files['sdk/source.json']);}catch{throw Error('PACK_SDK_SOURCE_INVALID');}}
  // One authorized scene recipe for installed packs and standalone SDK hosts.
  // Callers supply public participants/actions; no rule state is read here.
  function sdkFieldPort(scene){
    return scene.canvas?'<div data-sdk-player-scene data-sdk-canvas-scene></div>':'<div data-sdk-player-scene></div>';
  }

  function sceneRecipe({state:_state,viewer:_viewer,actions:_actions=[],ui={},manifest:m={},helpers:H=root.TabletopUI?.helpers,text:localText=value=>String(value??'')}){
    const scene=_state.scene,represented=[],remember=command=>{if(record(command))represented.push(command);},specific=target=>target&&(target.entity||target.cell!==undefined||target.index!==undefined||target.point!==undefined||target.zone&&target.zone!=='field');
    for(const cell of scene.cells||[])remember(cell.command);for(const row of Array.isArray(scene.rows)?scene.rows:[])for(const cell of row.cells||[])remember(cell.command);for(const control of [...(scene.controls||[]),...(scene.menuActions||[])])remember(control.command);
    for(const port of [scene.canvas,scene.chat,scene.vote])remember(port?.command);remember(scene.vote?.againstCommand);for(const notice of scene.notices||[])for(const action of notice.actions||[])remember(action.command);
    for(const message of scene.chat?.messages||[])remember(message.confirmCommand);
    for(const interaction of scene.interactions||[])if(specific(interaction.source)||specific(interaction.target))remember(interaction.command);
    remember(scene.scoreLayout?.controls?.command);
    for(const items of Object.values(scene.actionDock||{}))for(const item of items)remember(item.command);
    const protocol=root.PlayroomProtocol||(typeof require==='function'?require('./protocol.js'):null);
    const commands=ui.commandChoices || _state.modelProjection?.actions || _state.sdkProjection?.actions || _actions;
    const resolve=protocol.choiceIndex(commands),buttons=new Map();
    for(const action of _actions){const choice=resolve(action,true);if(choice)buttons.set(canonical(choice),action);}
    const visible=new Set(represented.map(canonical));
    const fallback=[...buttons].filter(([key,action])=>action.targetKind!=='player'&&!visible.has(key)).map(([,action])=>action);
    // A control can relabel only the exact choice exposed to this viewer.
    const authorized=command=>command&&buttons.get(canonical(command));
    const controls=(scene.controls||[]).flatMap(control=>{
      const action=authorized(control.command);
      return action?[{...action,label:localText(control.label)}]:[];
    });
    const primaryActions=[...controls,...fallback];
    const dockButtons=position=>(scene.actionDock?.[position]||[]).map(item=>{
      const action=authorized(item.command);
      return H.button({label:localText(item.label),variant:'game',className:'sdk-dock-'+position,attrs:action?H.actionAttr(action):'disabled'});
    }).join('');
    const cardHelp=scene.cardHelp&&_viewer>=0&&!ui.replay?H.button({icon:'help',ariaLabel:localText(scene.cardHelp),variant:'game',className:'sdk-card-help',attrs:'data-command="card-help"'}):'';
    const actionHTML=scene.solitaireLayout?'<div data-sdk-solitaire-controls></div>':scene.fleetLayout?'<div data-sdk-fleet-controls></div>':scene.actionDock||cardHelp?H.actionGroups({start:dockButtons('start'),primary:dockButtons('primary')+primaryActions.map(action=>H.actionButton(action)).join(''),end:dockButtons('end')+cardHelp,reserveRow:scene.family==='tile-chain'&&scene.actionReserve===true}):H.actionBar(primaryActions);
    // Keep the SDK field port identical in full and feedback/history renders.
    // Its DOM lease replaces markup caching; an extra region wrapper would
    // recreate fitted pieces when the feedback pipeline swaps field scenes.
    const dicePort='<div class="shared-action-row" data-size-role="board-dice" data-sdk-dice-port'+(scene.scoreLayout?' data-sdk-score-dice':'')+'></div>',diceInActions=scene.dicePlacement==='actions',diceInStatus=scene.dicePlacement==='status';
    const inlineChoices=scene.playerChoices?.kind==='cards'||scene.checkerLayout?.kind==='draughts'||scene.memoryLayout?.kind==='paired-grid'||scene.cellStyle==='mark-token'&&!diceInActions;
    const externalChoicesOnly=scene.arenaLayout||inlineChoices&&scene.actionReserve!==true&&!primaryActions.length&&!scene.actionDock;
    const handPort=player=>{const person=scene.players?.find(p=>p.player===player),count=person?.hand?.length||0;return H.hand('',count,'','',{layout:scene.handLayout||'row',mountOwner:player})+(person?.bookCards?.length?'<div class="sdk-book-cards" data-sdk-hand-owner="'+player+'" data-sdk-hand-zone="books"></div>':'');},playerContent=H.playerContent(_state,_viewer,null).map((content,index)=>{const player=scene.players?.find(player=>player.player===index);
      // Participant controls belong to the host, including hotseat handoff.
      // The native renderer owns only the visual ports inside this recipe.
      if(scene.cellStyle==='mark-token'&&typeof player?.mark==='string'&&player.mark.length>0&&player.mark.length<=8)content.badges=[...content.badges,{label:player.mark}];
      const decision=scene.arenaLayout?scene.arena.window:scene.decisionWindow;
      // The engine's public decision window owns readiness. A local avatar
      // only requests the existing handoff gate; it never grants a command.
      if(scene.arenaLayout||decision?.participants.length>1)Object.assign(content,{
        ready:!!decision?.ready.includes(index),
        decisionPlayer:ui.hotseat&&!ui.replay&&!_state.players[index].bot&&decision?.participants.includes(index)?index:null
      });
      if(scene.arenaLayout){
        const arena=scene.arena,teamCount=arena.teamLives?.filter((_,team)=>arena.players.some(p=>p.team===team)).length||0;
        Object.assign(content,{inactive:arena.players[index].lives===0,orderPosition:false,showFirstPlayer:false,showSelfLabel:false,statusHTML:index===_viewer?'<span data-sdk-arena-player-status style="display:contents"></span>':'',statusMinWidth:arena.config.teams&&index===_viewer?30+teamCount*26+(teamCount-1)*9:24,badges:content.counters.filter(c=>c.id==='ultimate'&&c.value>0).map(c=>({label:localText(c.label)+': '+c.value,icon:'host',position:'avatar-bottom',color:'#e4c459',value:c.value})),counters:content.counters.filter(c=>!['kills','ultimate'].includes(c.id))});
      }
      return {...content,...Object.fromEntries(['scoreLabel','countLabel','colorLabel'].filter(key=>content[key]!==undefined).map(key=>[key,localText(content[key])])),...(content.team?{team:{...content.team,label:localText(content.team.label)}}:{}),counters:(content.counters||[]).map(counter=>({...counter,label:localText(counter.label)})),badges:(content.badges||[]).map(badge=>typeof badge==='string'?badge:{...badge,label:localText(badge.label)}),indicators:(content.indicators||[]).map(indicator=>({...indicator,label:localText(indicator.label)})),...(Array.isArray(player?.hand)||player?.bookCards?.length?{handHTML:'',handMountOwner:index}:{})};});
    const self=scene.players?.find(player=>player.player===_viewer);
    // The arena hand holds live planning controls. A historical arena has no
    // hand row; an empty mount would still reserve the grid's inter-row gap.
    const hand=scene.arenaLayout
      ? (_viewer>=0&&!ui.replay?'<div data-sdk-arena-hand></div>':'')
      : (Array.isArray(self?.hand)||self?.bookCards?.length?handPort(_viewer):'');
    return {api:3,fieldPort:sdkFieldPort,...(scene.solitaireLayout?{className:'solitaire-scene'}:scene.arenaLayout?{className:'mage-scene'}:{}),family:scene.screenFamily||(['card-table','tile-chain'].includes(scene.family)?'cards':'board'),skinFamilies:scene.skinFamilies?.filter(family=>(m.skinFamilies||[]).includes(family))||m.skinFamilies||[],playerContent,...(scene.motionSequence?{motionSequence:scene.motionSequence}:{}),...LayoutPolicy.options(scene,_state.players.length),fieldSizing:scene.fieldSizing||(scene.canvas?'scroll':scene.fieldAspect!==undefined?'fit':'content'),elements:{...(scene.statusItems?.length||diceInStatus?{status:(diceInStatus?dicePort:'')+(scene.statusItems?.length?'<div data-scene-status-home><div class="scene-meta" data-scene-status="always">'+scene.statusItems.map(item=>'<span class="table-chip">'+H.esc(localText(item.label))+' · '+H.esc(item.value)+'</span>').join('')+'</div></div>':'')}:{}),field:sdkFieldPort(scene),actions:externalChoicesOnly?'':(diceInActions?dicePort:'')+((diceInActions||diceInStatus)&&!primaryActions.length&&!scene.actionDock?'':actionHTML)+'<div data-sdk-choice-port></div>',...(hand?{hand}:{})}};

  }

  class Packs {
    constructor({engine=root.TabletopCore,views=root.PlayroomViews,catalog=root.PlayroomCatalog,storage,document=root.document,allowTrustedLegacy=false,loadSandbox=null,locale=root.PlayroomMessages?.locale||'ru',modelAdapter=root.PlayroomModelRegistration?.adapt||(typeof require==='function'?require('./model-registration.js').adapt:null)}={}){
      if(!engine?.registerVersion||!engine?.activatePack||!views?.register||!views?.get||!views?.remove||!record(catalog))throw Error(globalThis.PlayroomMessages.text("ui.packs.acf00eb6a722"));
      this.locale=locale;this.loadSandbox=loadSandbox;this.allowTrustedLegacy=allowTrustedLegacy===true;this._trustedLegacy=new Set();this.engine=engine;this.views=views;this.catalog=catalog;this.document=document;this.modelAdapter=modelAdapter;this.storage=storage||{get:()=>root.localStorage?.getItem(STORAGE),set:value=>root.localStorage?.setItem(STORAGE,value)};
      this._items=new Map();this._active=new Map();this._bundled=new Set();this._removed=new Set();this._styles=new Map();this.warnings=[];
      if(this.storage.commit){let queue=Promise.resolve();for(const name of ['bootstrap','install','remove','discardQuarantine']){const operation=this[name].bind(this);this[name]=(...args)=>{const result=queue.then(()=>operation(...args));queue=result.catch(()=>{});return result;};}}

    }
    parse(value){return parse(value);}
    _isolated(bundle){
      const m=runtimeManifest(localizedManifest(bundle,this.locale),this.locale),sandbox=root.PlayroomSandbox;
      if(!sandbox?.createRules||!sandbox?.present||!sandbox?.validateMedia)throw Object.assign(Error('SDK_NOT_READY'),{code:'SDK_NOT_READY'});
      const source=sdkSource(bundle);
      if(!record(source)||!record(source.sources)||source.manifest?.id!==m.id||source.manifest?.version!==m.version)throw Error('PACK_SDK_SOURCE_INVALID');
      const assets=source.assets===undefined?[]:source.assets;
      const animations=sandbox.validateMedia(assets)?.animations;
      // The registry owns these validated records for this exact pack revision.
      // The table and enlarged views can share them until a pack is replaced.
      for(const item of assets)Object.freeze(item);
      Object.freeze(assets);
      const project={locale:this.locale,resourceClosure:{rulebooks:source.resourceClosure?.rulebooks},manifest:source.manifest,catalogs:source.catalogs||{ru:{}},...Object.fromEntries(['dependencies','rules','helpers','presentation','support'].map(name=>[name,source.sources[name]||[]]))};
      const resolveAsset=path=>{const item=assets.find(a=>a.file===path);if(item)return 'data:'+item.mime+(item.encoding==='utf8'?';charset=utf-8,'+encodeURIComponent(item.data):';base64,'+item.data);return asset(bundle,path);};
      const Values=root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null);
      const guest=sandbox.createRules(project,{readProjection:Values?.parseSnapshot,cacheRegistration:true});
      try{
        const metadata={name:m.name,description:'',scoreLabel:'Очки',presets:[{id:'classic',label:'Классика'}],rules:[],...sandbox.metadata(project)};
        const rendered=new WeakMap(), descriptions=new WeakMap();
        const frame=projection=>{
          // The shell requests a lesson separately with live UI and progress.
          // Leave that duplicate work out of the authoritative frame.
          if(!rendered.has(projection))rendered.set(projection,sandbox.render(project,projection,{installed:true,tutorial:false}));
          return rendered.get(projection);
        };
        // Labels and confirmations belong to one projected choice, even when
        // two buttons share a type. Index the guest frame once per projection.
        const described=(command,projection)=>{
          if(!descriptions.has(projection)){
            const choices=frame(projection).actions;
            const rows=new Map(choices.map(row=>[row.command,row]));
            const protocol=root.PlayroomProtocol||require('./protocol.js');
            const resolve=protocol.choiceIndex(rows.keys());
            descriptions.set(projection,action=>rows.get(resolve(action,true)));
          }
          return descriptions.get(projection)(command);
        };
        const presentEvent=sandbox.createEventPresenter(project,metadata.eventInputs==='facts');
        const metricLabels=new Map();
        function metricLabel(id){
          if(!metricLabels.has(id)){
            if(metricLabels.size>=64)metricLabels.clear();
            metricLabels.set(id,sandbox.present(project,'metric',id)||metadata.scoreLabel);
          }
          return clone(metricLabels.get(id));
        }
        const presentation={metadata,...(metadata.methods?.includes('eventScenes')?{eventScenes:projection=>frame(projection).eventScenes}:{}),scene:projection=>({...frame(projection).scene,support:{...frame(projection).support,catalog:metadata.catalog}}),action:(command,projection)=>described(command,projection)?.label||command.type,choice:(command,projection)=>described(command,projection)?.choice||{},event:presentEvent,metric:metricLabel};
        const rules=this.modelAdapter(this.engine,{definition:guest.definition,model:guest.model,presentation,locales:{ru:{},...project.catalogs},locale:this.locale,fallback:m.defaultLanguage||'ru',version:m.version,stateVersion:m.stateVersion,rulebooks:source.resourceClosure?.rulebooks,normalizeOptions:options=>modelOptions(source.manifest,m,options)});
        const render=(_state,_viewer,_actions,ui={})=>sceneRecipe({state:_state,viewer:_viewer,actions:_actions,ui,manifest:m,helpers:this.views.helpers,text:localText}),view={render,cover:()=>this.views.helpers.components.cover('<g transform="translate(80 15)">'+this.views.helpers.icon('gamepad').replace('<svg','<svg width="140" height="140"')+'</g>'),surfaces:{table:render,player:render}};
        const preloadImages=Images.preloadImages(metadata.preloadImages,assets);
        const resourceView=Object.freeze({assets,resourceClosure:source.resourceClosure||{},coverId:metadata.cover?.id,
          ...(animations?{animations}:{}),
          ...(preloadImages?{preloadImages}:{})});
        const translator=new (root.PlayroomLocalization||(typeof require==='function'?require('../presentation/localization.js'):null)).Translator({catalogs:{ru:{},...project.catalogs},locale:this.locale,fallback:m.defaultLanguage||'ru'});
        const localText=value=>typeof value==='string'?value:translator.format(value);
        if(metadata.cover!==undefined){if(metadata.cover?.kind!=='asset'||!(source.assets||[]).some(item=>item.file===metadata.cover.id&&item.mime?.startsWith('image/')))throw Object.assign(Error('PACK_COVER_INVALID'),{code:'PACK_COVER_INVALID'});view.cover=()=>'<img class="pack-cover-art" alt="" src="'+this.views.helpers.esc(resolveAsset(metadata.cover.id))+'">';}
        view.reveal=value=>value.kind==='dice'?
          root.PlayroomSDKRenderDice?.(value.dice,{packId:m.id,resources:resourceView,text:localText}):
          root.PlayroomSDKRenderCard?.(value.card,{packId:m.id,deck:metadata.deck||'standard',resources:resourceView})||'';
        view.illustrations=id=>{const figure=metadata.catalog?.figures?.find(value=>value.id===id);return figure?root.PlayroomSDKRenderGraphic(figure.graphic,{text:localText,resources:resourceView}).outerHTML:'';};
        if(metadata.catalog?.tutorialGoals?.length){const guideFrames=new WeakMap();view.tutorial=context=>{const projection=context.modelProjection===undefined?(context.state.modelProjection||context.state.sdkProjection):context.modelProjection;if(!projection)return null;const progress={seen:context.guideProgress?.seen||[],...(context.guideProgress?.checkpoint!==undefined?{checkpoint:context.guideProgress.checkpoint}:{})};const ui={selected:context.ui?.selected??null,viewState:context.ui?.viewState||{}},signature=JSON.stringify([ui,progress]);
          // Compact frames already restored their scene with participant
          // context. The raw model alone may lack that renderer input.
          const scene=context.state.scene??frame(projection).scene;
          const cached=guideFrames.get(projection);
          if(cached?.scene===scene&&cached.signature===signature)return cached.guide;
          const authored=sandbox.present(project,'tutorial',projection,scene,{ui,guideProgress:progress});
          // Host step bindings belong to this immutable projection and UI
          // signature. Both the renderer and the guide reuse the bindings.
          const guide=authored?{...authored,steps:(authored.steps||[]).map(step=>({...step,selector:`[data-sdk-guide-step~="${encodeURIComponent(step.id)}"]`,match:command=>(step.commands||[]).some(candidate=>Object.keys(candidate).every(key=>canonical(candidate[key])===canonical(command[key])))}))}:null;
          guideFrames.set(projection,{scene,signature,guide});return guide;};view.tutorial.goals=metadata.catalog.tutorialGoals;
          // Progress is keyed by the authored goal revision in every shell.
          view.tutorial.revisions=Object.fromEntries(view.tutorial.goals.map(({id,revision})=>[id,revision??1]));
        }
        const standardRules=root.PlayroomRooms||(typeof require==='function'?require('../application/rooms.js'):null);
        const sounds=resolveSoundAssets(metadata.sounds,resolveAsset);
        const compiled={byteSize:bytes(JSON.stringify(bundle)),bundle,rules:{...rules,capabilities:clone(m.capabilities||{}),isolated:true,id:m.id,version:m.version,stateVersion:m.stateVersion},view,catalog:{...clone(m),metadata,locales:project.catalogs,resources:resourceView,support:metadata.catalog,sounds,isolated:true,settings:(m.settings||[]).map(field=>standardRules.standardRule(field))},styles:'',guest};
        const token=Object.freeze({id:m.id,version:m.version,manifest:clone(m)});prepared.set(token,{owner:this,compiled});releasePrepared?.register(token,guest,token);return token;
      }catch(error){guest.close();throw error;}
    }
    prepare(value){return this._prepareBundle(parse(value));}
    async prepareInstall(value){
      const bundle=parse(value);
      if(bundle.manifest.execution==='isolated-v1'&&this.loadSandbox)await this.loadSandbox();
      return this._prepareBundle(bundle);
    }
    _prepareBundle(bundle){
      const m=bundle.manifest;if(m.execution==='isolated-v1')return this._isolated(bundle);if(!this.allowTrustedLegacy&&!this._trustedLegacy.has(canonical(bundle)))throw Object.assign(Error('Установите текущую версию пака с изолированным SDK.'),{code:'PACK_ISOLATED_REQUIRED'});const css=styles(bundle);let rules=null,view=null;
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
      const item=version?this._items.get(key(id,version)):[...this._items.values()]
        .filter(item=>item.bundle.manifest.id===id)
        .sort((a,b)=>compare(b.bundle.manifest.version,a.bundle.manifest.version))[0];
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
      try{this.engine.registerVersion(item.rules,{replace:true});releasePrepared?.unregister(token);this._items=items;this._removed=removed;return activate?this._apply(item):this._descriptor(item);}
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
    // Configuration consumers use this normalized/localized view, never the
    // author's structured fields/ranges or an asset-heavy presentation export.
    configuration(id,version){return runtimeManifest(localizedManifest(this._resolve(id,version).bundle,this.locale),this.locale);}
    // A lobby reads the installed version's media without activating its rules
    // or materializing the presentation export.
    presentationMedia(id,version){
      const catalog=this._items.get(key(id,version))?.catalog;
      if(catalog)return {resources:catalog.resources,sounds:catalog.sounds};
    }
    _publicView(item){
      const {id,version}=item.bundle.manifest;
      return {manifest:this.configuration(id,version),rules:item.rules.rules||[],
        ...(item.rules.rulebook?{rulebook:item.rules.rulebook}:{}),sounds:item.catalog.sounds||{}};
    }
    viewForMount(id,version){
      const item=this._resolve(id,version);
      // The isolated scene renderer already owns the exact installed
      // resources. A local mount needs only the public presentation metadata.
      return item.bundle.manifest.execution==='isolated-v1'?this._publicView(item):this.exportView(id,version);
    }
    // Presentation-only payload: no rule execution, Session, or saved state.
    exportView(id,version){
      const item=this._resolve(id,version),bundle=item.bundle,{manifest,rules,rulebook,sounds}=this._publicView(item);
      return {manifest,rules:clone(rules),...(rulebook?{rulebook:clone(rulebook)}:{}),sounds:clone(sounds),
        view:bundle.files['view.js'],styles:item.styles,
        assets:Object.fromEntries([...Object.keys(bundle.files).filter(path=>!['rules.js','view.js','styles.css','sounds.js'].includes(path)).map(path=>[path,asset(bundle,path)]),
          ...(item.catalog.resources?.assets||[]).map(resource=>[resource.file,'data:'+resource.mime+(resource.encoding==='utf8'?';charset=utf-8,'+encodeURIComponent(resource.data):';base64,'+resource.data)])])};
    }
    isTrustedView(definition){try{const item=this._resolve(definition.manifest.id,definition.manifest.version);return item.bundle.manifest.execution===undefined&&(this.allowTrustedLegacy||this._trustedLegacy.has(canonical(item.bundle)))&&canonical(this.exportView(definition.manifest.id,definition.manifest.version))===canonical(definition);}catch{return false;}}
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
      this._items=items;this._active=active;this._removed=removed;this._bundled.delete(k);this.engine.unregisterVersion(id,m.version);item.guest?.close();
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
      this._trustedLegacy.clear();
      const sources=new Map(),bundled=new Set(),removed=new Set();this.warnings=[];this.quarantined=[];this.rawBackups=[];
      for(const input of bundles){const bundle=parse(input),k=key(bundle.manifest.id,bundle.manifest.version);sources.set(k,bundle);bundled.add(k);if(bundle.manifest.execution===undefined)this._trustedLegacy.add(canonical(bundle));}
      let saved=null,raw=null,readable=true;
      try{raw=this.storage.get();}catch(error){readable=false;this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.bf86059fb52f",{p0:String(error.message)}));}
      if(raw){try{
        saved=JSON.parse(raw);
        if(saved.format!=='playroom-packs'||saved.formatVersion!==1||!Array.isArray(saved.packs)||!record(saved.active))throw Error(globalThis.PlayroomMessages.text("ui.packs.63fdd980cf43"));
        this.quarantined=Array.isArray(saved.quarantined)?saved.quarantined:[];this.rawBackups=Array.isArray(saved.rawBackups)?saved.rawBackups:[];
        for(const k of saved.removed||[])if(typeof k==='string'&&ID.test(k.split('@')[0])&&SEMVER.test(k.split('@')[1]))removed.add(k);
        for(const input of saved.packs){try{
          const hint=input?.manifest;
          const retained=typeof hint?.id==='string'&&typeof hint?.version==='string'?sources.get(key(hint.id,hint.version)):null;
          if(retained&&sameJSON(retained,input))continue;
          const bundle=parse(input),m=bundle.manifest,k=key(m.id,m.version),included=sources.get(k);
          if(included&&canonical(included)!==canonical(bundle)){this.quarantined.push({bundle:input,reason:globalThis.PlayroomMessages.text("ui.packs.e17e52dfa914")});continue;}
          sources.set(k,bundle);
        }catch(error){this.quarantined.push({bundle:input,reason:error.message});}}
      }catch(_){saved=null;this.rawBackups.push(raw);this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.88d33f2b1234"));}}
      if(options.restoreBuiltins)for(const k of bundled)removed.delete(k);
      for(const k of removed){sources.delete(k);bundled.delete(k);}
      const restore=()=>{
        const items=new Map(),active=new Map(),ownedTokens=[];
        for(const [k,bundle]of sources){try{const existing=this._items.get(k);if(existing&&canonical(existing.bundle)===canonical(bundle)){items.set(k,existing);continue;}const token=this._prepareBundle(bundle);ownedTokens.push(token);items.set(k,prepared.get(token).compiled);}catch(error){if(bundled.has(k))throw error;this.quarantined.push({bundle,reason:error.message});}}
        for(const item of items.values()){const m=item.bundle.manifest;if(!active.has(m.id)||compare(m.version,active.get(m.id))>0)active.set(m.id,m.version);}
        if(this.quarantined.length)this.warnings.push(globalThis.PlayroomMessages.text("ui.packs.acf425f8c8f5",{p0:String(this.quarantined.length)}));
        const publish=()=>{
        for(const item of items.values())this.engine.registerVersion(item.rules,{replace:true});
        for(const token of ownedTokens)releasePrepared?.unregister(token);
        for(const [k,item]of this._items)if(!items.has(k))item.guest?.close();
        this._items=items;this._bundled=bundled;this._removed=removed;this._active=active;
        for(const [id,version]of active)this.activate(id,version);
        return this.list();};
        if(this.storage.commit)return this._persist(this._serialized(items,active,removed),publish);
        try{if(readable)this.storage.set(this._serialized(items,active,removed));}catch(error){this.warnings.push(error.message);}
        return publish();
      };
      // Apply the storage and removal policy first. Only retained isolated
      // packs can require the guest runtime during application boot.
      if(this.loadSandbox)for(const bundle of sources.values()){
        if(bundle.manifest.execution==='isolated-v1')return Promise.resolve(this.loadSandbox()).then(restore);
      }
      return restore();
    }
  }
  Packs.resolveSoundAssets=resolveSoundAssets;Packs.sceneRecipe=sceneRecipe;Packs.parse=parse;Packs.localizedManifest=localizedManifest;Packs.sdkSource=sdkSource;Packs.runtimeManifest=runtimeManifest;Packs.modelOptions=modelOptions;Packs.compareVersions=compare;Packs.STORAGE_KEY=STORAGE;Packs.SDK_FEATURES=SDK_FEATURES;Packs.MAX_BYTES=MAX_BYTES;
  return Packs;
});

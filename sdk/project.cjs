'use strict';
// Read sources as data. Never require/evaluate a pack in the host process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {BUDGET}=require('./budget.cjs');
const {preparedAnimations}=require('./media.cjs');
const LIMITS=Object.freeze({fileBytes:4*1024*1024,sourceBytes:12*1024*1024,assetBytes:BUDGET.assetBytes,files:BUDGET.files,packBytes:BUDGET.packBytes,targetBytes:BUDGET.targetBytes,messageBytes:4*1024*1024,memoryBytes:64*1024*1024,callMs:2000,wallMs:5000});
class SDKError extends Error{
 constructor(code,detail={}){super(code);this.name='SDKError';this.code=code;this.diagnostic={code,...detail};}
}
function fail(code,detail){throw new SDKError(code,detail);}
function local(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.includes('\0')||name.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(name))fail('SDK_PATH_DENIED',{file:String(name).slice(0,160)});
 const target=path.join(root,name);let cursor=root;
 for(const part of name.split('/')){cursor=path.join(cursor,part);const stat=fs.lstatSync(cursor,{throwIfNoEntry:false});if(!stat)fail('SDK_FILE_REQUIRED',{file:name});if(stat.isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file:name});}
 if(!fs.statSync(target).isFile())fail('SDK_FILE_REQUIRED',{file:name});
 return target;
}
function read(root,name){const file=local(root,name);if(fs.statSync(file).size>LIMITS.fileBytes)fail('SDK_FILE_LIMIT',{file:name});return fs.readFileSync(file,'utf8');}
function json(root,name){try{return JSON.parse(read(root,name));}catch(error){if(error instanceof SDKError)throw error;fail('SDK_JSON_INVALID',{file:name});}}
function scripts(root,names,prefix='',sharedPresentation){
 if(!Array.isArray(names)||names.length>BUDGET.files||new Set(names).size!==names.length)fail('SDK_MODULES_INVALID');
 return names.map(name=>{
  if(typeof name!=='string'||!name.endsWith('.js'))fail('SDK_MODULES_INVALID');
  if(sharedPresentation!==undefined&&name.startsWith('shared/presentation/')){
   if(!sharedPresentation)fail('SDK_SHARED_REQUIRED',{file:name});
   return {file:name,source:read(sharedPresentation,name.slice('shared/'.length))};
  }
  return {file:prefix+name,source:read(root,name)};
 });
}
function compileRulebooks(root,books,catalogs){
 if(books===undefined)return null;
 if(!books||typeof books!=='object'||Array.isArray(books)||Object.keys(books).length>32)fail('SDK_RULEBOOKS_INVALID',{file:'manifest.json'});
 const files=Object.entries(books).map(([locale,file])=>{
  if(!Object.hasOwn(catalogs,locale)||typeof file!=='string'||!file.endsWith('.md'))fail('SDK_RULEBOOKS_INVALID',{file:'manifest.json',locale});
  const source=read(root,file);
  if(Buffer.byteLength(source)>128*1024)fail('SDK_FILE_LIMIT',{file});
  return {locale,file,source};
 });
 if(!files.length)return null;
 // Parse current sources with the packaging compiler. Studio reloads need no generated cache.
 const script=`import json,runpy,sys
compile_book=runpy.run_path(sys.argv[1])['compile_rulebook_markdown']
books={}
output={'books':books}
for row in json.load(sys.stdin.buffer):
    try:
        books[row['locale']]=compile_book(row['source'])
    except ValueError as error:
        output={'file':row['file'],'hint':str(error)}
        break
sys.stdout.buffer.write(json.dumps(output,ensure_ascii=False).encode('utf-8'))
`;
 const result=require('node:child_process').spawnSync('python3',['-c',script,path.resolve(__dirname,'../tooling/pack_compiler.py')],{
  input:JSON.stringify(files),encoding:'utf8',timeout:20000,maxBuffer:LIMITS.messageBytes
 });
 if(result.error||result.status!==0)fail('SDK_RULEBOOK_COMPILER_FAILED',{hint:'Check the local Python 3 and pack compiler setup.'});
 let compiled;try{compiled=JSON.parse(result.stdout);}catch{fail('SDK_RULEBOOK_COMPILER_FAILED');}
 if(!compiled.books)fail('SDK_RULEBOOK_INVALID',{file:compiled.file,hint:compiled.hint});
 return compiled.books;
}
// Resource discovery reads the complete declared closure as data. Provider JS
// and CSS are retained for source fidelity and never imported into the host.
function sourceResources(root,manifest,shared,coreSourceBytes,settingsFile,itemSelections){
 const {validateAsset}=require('./assets.cjs'),assets=[],providers=[],data=[],assetPacks=[],paths=Object.create(null),seen=new Set();
 const documentation=[];
 const selections=new Map();
 if(itemSelections!==undefined){
  if(!itemSelections||typeof itemSelections!=='object'||Array.isArray(itemSelections))fail('SDK_ASSET_ITEMS_INVALID',{file:'sdk/project.json'});
  const entries=Object.entries(itemSelections);
  if(entries.length>BUDGET.files)fail('SDK_ASSET_ITEMS_INVALID',{file:'sdk/project.json'});
  for(const [id,items] of entries){
   if(!/^[a-z][a-z0-9-]*$/.test(id)||!Array.isArray(items)||items.length>BUDGET.files||
      items.some(item=>typeof item!=='string'||!item))
    fail('SDK_ASSET_ITEMS_INVALID',{file:'sdk/project.json',assetPack:id});
   const requested=new Set(items);
   if(requested.size!==items.length)fail('SDK_ASSET_ITEMS_INVALID',{file:'sdk/project.json',assetPack:id});
   selections.set(id,requested);
  }
 }
 const provenance=fs.existsSync(path.join(root,'sdk/assets.json'))?json(root,'sdk/assets.json'):{};
 let bytes=0,decodedImageBytes=0;const reports=[];
 function add(base,relative,file){
  if(base===root&&relative===settingsFile)return;
  if(seen.has(file))return;seen.add(file);const filename=local(base,relative),buffer=fs.readFileSync(filename),ext=path.extname(relative).toLowerCase();paths[file]=filename;
  if(['.md','.txt'].includes(ext)){documentation.push(file);return;}
  if(['.js','.css'].includes(ext)){providers.push({file,source:buffer.toString('utf8'),role:ext==='.js'?'asset-provider':'asset-style'});return;}
  if(ext==='.json'&&!(base===root&&relative.startsWith('assets/'))){data.push({file,value:json(base,relative)});return;}
  const report=validateAsset(buffer,file);bytes+=report.bytes;decodedImageBytes+=report.decodedImageBytes||0;
  if(assets.length>=BUDGET.files||bytes>BUDGET.assetBytes||decodedImageBytes>BUDGET.decodedImageBytes)fail('SDK_ASSET_TOTAL_LIMIT');
  const source=provenance[relative]||{source:'Existing source resource: '+relative};
  if(source.sha256&&source.sha256!==report.sha256)fail('SDK_ASSET_CHANGED',{file});
  assets.push({file,sha256:report.sha256,mime:report.mime,data:buffer.toString('base64'),bytes:buffer.length,provenance:source});reports.push({file,...report});
 }
 function walk(folder){const dir=path.join(root,folder);if(!fs.existsSync(dir))return;if(fs.lstatSync(dir).isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file:folder});for(const name of fs.readdirSync(dir).sort()){const file=folder+'/'+name,full=path.join(root,file);if(fs.lstatSync(full).isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file});if(fs.statSync(full).isDirectory())walk(file);else add(root,file,file);}}
 walk('assets');walk('config');
 if((manifest.sharedAssets?.length||manifest.sharedAssetPacks?.length)&&!shared)fail('SDK_SHARED_REQUIRED');
 for(const name of manifest.sharedAssets||[])add(shared,'assets/'+name,'assets/shared/'+name);
 const included=new Map(),visiting=new Set();
 function include(id,version){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]*$/.test(id))fail('SDK_ASSET_PACK_INVALID');
  if(visiting.has(id))fail('SDK_ASSET_PACK_CYCLE');
  if(included.has(id)){if(version!==undefined&&included.get(id)!==version)fail('SDK_ASSET_PACK_VERSION');return;}
  const base=path.join(shared,'asset-packs',id);
  let spec=json(base,'manifest.json');
  if(spec.format!=='playroom-asset-pack'||spec.id!==id||spec.formatVersion!==1||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec.version)||version!==undefined&&spec.version!==version)fail('SDK_ASSET_PACK_INVALID');
  visiting.add(id);for(const dep of spec.dependencies||[])include(dep.id,dep.version);visiting.delete(id);included.set(id,spec.version);
  const prefix='assets/shared-packs/'+id+'/',requested=selections.get(id);
  let availableItems;
  if(requested){
   // Project-wide selection narrows item artwork. Explicit files and
   // versioned dependencies still belong to their original declarations.
   const items=spec.items===undefined?[]:spec.items;
   if(!Array.isArray(items))fail('SDK_ASSET_PACK_INVALID',{assetPack:id});
   const selected=items.filter(item=>requested.has(item?.id));
   if(selected.length!==requested.size||new Set(selected.map(item=>item.id)).size!==requested.size)
    fail('SDK_ASSET_ITEM_UNKNOWN',{file:'sdk/project.json',assetPack:id});
   availableItems=items.length;spec={...spec,items:selected};
  }
  assetPacks.push({manifest:spec,prefix,...(availableItems===undefined?{}:{availableItems})});
  for(const file of new Set([...(spec.files||[]),...(spec.scripts||[]),...(spec.styles||[]),...(spec.items||[]).filter(item=>item.file!==undefined).map(item=>item.file)]))add(base,file,prefix+file);
 }
 for(const id of manifest.sharedAssetPacks||[])include(id);
 for(const id of selections.keys())if(!included.has(id))fail('SDK_ASSET_ITEMS_PACK_UNUSED',{file:'sdk/project.json',assetPack:id});
 if(providers.length>BUDGET.files)fail('SDK_MODULES_INVALID');
 const sourceBytes=coreSourceBytes+providers.reduce((sum,row)=>sum+Buffer.byteLength(row.source),0);if(sourceBytes>LIMITS.sourceBytes)fail('SDK_SOURCE_LIMIT');
 const resourceClosure={sourceBytes,assetPacks,data,documentation,budget:{assetBytes:bytes,assetCount:assets.length,maxAssetBytes:BUDGET.assetBytes,maxAssets:BUDGET.files}};
 const resourceAudit={scope:'resource-closure',files:reports,bytes,decodedImageBytes,documentation,limits:{maxBytes:BUDGET.assetBytes,maxFiles:BUDGET.files,maxDecodedImageBytes:BUDGET.decodedImageBytes,audioSeconds:BUDGET.audioSeconds},duplicates:[],note:'Actual declared local/shared media closure; provider source and authoring masters are separate.'};
 return {resourceAssets:assets,providers,resourceClosure,resourcePaths:paths,resourceAudit,animations:preparedAnimations(reports)};
}
function publicResources(project){return {assets:project.resourceAssets||[],assetPacks:project.resourceClosure?.assetPacks||[],data:project.resourceClosure?.data||[],rulebooks:project.resourceClosure?.rulebooks||{},...(project.animations?{animations:project.animations}:{})};}

// JSON's number spelling and key ordering differ across Python/JavaScript.
// Tag every value; binary64 numbers keep the complete resource identity portable.
function resourceIdentity(value){
 if(value===null)return ['null'];
 if(typeof value==='number'){if(!Number.isFinite(value))fail('SDK_JSON_INVALID');const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value===0?0:value);return ['number',bytes.toString('hex')];}
 if(typeof value==='string'||typeof value==='boolean')return [typeof value,value];
 if(Array.isArray(value))return ['array',value.map(resourceIdentity)];
 if(value&&typeof value==='object')return ['object',Object.keys(value).sort().map(key=>[key,resourceIdentity(value[key])])];
 fail('SDK_JSON_INVALID');
}
function loadProject(directory,{shared,locale,sourceManifest}={}){
 const root=fs.realpathSync(directory);
 // Authoring tools may audit a draft without writing it to the project.
 const manifest=sourceManifest===undefined?json(root,'manifest.json'):structuredClone(sourceManifest);
 const sourceModules=manifest.sourceModules;
 const hasModuleReference=!!sourceModules&&Object.hasOwn(sourceModules,'settings');
 if(hasModuleReference&&Object.hasOwn(manifest,'settings'))fail('SDK_SETTINGS_SOURCE_INVALID',{file:'manifest.json'});
 const settingsFile=hasModuleReference?sourceModules.settings:typeof manifest.settings==='string'?manifest.settings:null;
 if(hasModuleReference||settingsFile!==null){
  if(typeof settingsFile!=='string'||!settingsFile.endsWith('.json')||settingsFile==='manifest.json')fail('SDK_SETTINGS_SOURCE_INVALID',{file:'manifest.json'});
  const settings=json(root,settingsFile);
  if(!settings||!Array.isArray(settings.fields)||!Array.isArray(settings.groups))fail('PACK_SETTINGS_INVALID',{file:settingsFile});
  // Replacing the value in place keeps an inline manifest's exact packed bytes and hash.
  if(hasModuleReference)delete sourceModules.settings;
  manifest.settings=settings;
 }
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(manifest.id)||typeof manifest.version!=='string'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version))fail('SDK_MANIFEST_INVALID',{file:'manifest.json'});
 if(manifest.capabilities!==undefined&&(!manifest.capabilities||typeof manifest.capabilities!=='object'||Array.isArray(manifest.capabilities)||manifest.capabilities.bots!==undefined&&typeof manifest.capabilities.bots!=='boolean'))fail('SDK_MANIFEST_INVALID',{file:'manifest.json'});
 const descriptor=fs.existsSync(path.join(root,'sdk/project.json'))?json(root,'sdk/project.json'):null;
 if(!descriptor||descriptor.contractVersion!==1)fail('SDK_DESCRIPTOR_REQUIRED',{file:'sdk/project.json',hint:'Create an SDK project or add the studio descriptor; executable view.js is never loaded.'});
 // Validate the descriptor before resolving paths so both authoring entries identify the field.
 for(const field of ['rules','helpers','support','presentation']){
  if(!Object.hasOwn(descriptor,field)&&['helpers','support'].includes(field))continue;
  const names=descriptor[field];
  if(!Array.isArray(names)||names.length>BUDGET.files||new Set(names).size!==names.length||
     names.some(name=>typeof name!=='string'||!name.endsWith('.js'))){
   fail('SDK_MODULES_INVALID',{file:'sdk/project.json',field,hint:'Use an array of unique JavaScript module paths.'});
  }
 }
 const dependencies=[];
 if(manifest.sharedDomain?.length){
  if(!shared)fail('SDK_SHARED_REQUIRED');
  if(manifest.sharedDomain.length>BUDGET.files)fail('SDK_MODULES_INVALID');
  for(const id of manifest.sharedDomain){if(!/^[a-z][a-z0-9-]*$/.test(id))fail('SDK_MODULES_INVALID');dependencies.push(...scripts(fs.realpathSync(shared),['domain/'+id+'.js'],'shared/'));}
 }
 const rules=scripts(root,descriptor.rules),presentation=scripts(root,descriptor.presentation,'',shared||null);
 // Presentation gets explicitly selected pure helpers, never authoritative rules.
 const helpers=scripts(root,descriptor.helpers||[]);
 const {types:typeFiles=[]}=descriptor;
 if(!Array.isArray(typeFiles)||typeFiles.length>BUDGET.files||new Set(typeFiles).size!==typeFiles.length||
    typeFiles.some(file=>typeof file!=='string'||!file.endsWith('.d.ts'))){
  fail('SDK_TYPES_INVALID',{file:'sdk/project.json',field:'types',hint:'Use an array of unique .d.ts paths within the file budget.'});
 }
 const types=typeFiles.map(file=>({file,source:read(root,file)}));
 // Match the collection compiler for older descriptors without explicit support.
 const loaded=new Set([...dependencies,...rules,...helpers,...presentation,...types].map(row=>row.file));
 const inferredSupport=()=>[...(manifest.sourceModules?.view||[]).filter(file=>!loaded.has(file)),...(manifest.sounds?['sounds.js']:[])];
 const support=scripts(root,descriptor.support??inferredSupport()).map(row=>({...row,role:row.file.endsWith('/tutorial.js')?'tutorial':row.file.endsWith('/rule-illustrations.js')?'illustrations':row.file==='sounds.js'?'sounds':'presentation-support'}));
 if(descriptor.presentation.some(name=>!name.startsWith('presentation/')&&!name.startsWith('shared/presentation/'))||descriptor.helpers?.some(name=>!name.startsWith('domain/')))fail('SDK_MODULES_INVALID');
 const sourceBytes=[...dependencies,...rules,...presentation,...helpers,...types,...support].reduce((sum,f)=>sum+Buffer.byteLength(f.source),0);
 if(sourceBytes>LIMITS.sourceBytes)fail('SDK_SOURCE_LIMIT');
 const catalogs={};
 for(const [locale,files]of Object.entries(manifest.sourceModules?.locales||{})){
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)||!Array.isArray(files)||files.length>32)fail('SDK_LOCALES_INVALID');
  const catalog=Object.create(null);for(const name of files){const value=json(root,name);if(!value||typeof value!=='object'||Array.isArray(value))fail('SDK_LOCALES_INVALID');for(const [key,text]of Object.entries(value)){if(Object.hasOwn(catalog,key)||typeof text!=='string')fail('SDK_LOCALES_INVALID');catalog[key]=text;}}catalogs[locale]=catalog;
 }
 const language=locale||manifest.defaultLanguage||'ru';
 let localized;
 try{localized=new (require('../presentation/localization.js').Translator)({catalogs:{ru:{},...catalogs},locale:language,fallback:manifest.defaultLanguage||'ru'}).resolve(manifest);}catch(error){fail('SDK_LOCALIZATION_MISSING',{file:'manifest.json',key:error.key,hint:error.code==='COMMON_TEXT_MISSING'?'Use a registered common label ID from the application catalog.':'Declare every referenced message in lang/<defaultLanguage>.json; translations may fall back to it.'});}
 let configuration;
 try{configuration=require('../core/packs.js').runtimeManifest(localized,language);}catch(error){fail(error.message,{file:settingsFile||'manifest.json'});}
 const hash=crypto.createHash('sha256');hash.update(JSON.stringify({manifest,descriptor,catalogs}));for(const f of [...dependencies,...rules,...helpers,...presentation,...types,...support])hash.update(f.file+'\0'+f.source);
 const resources=sourceResources(root,manifest,shared?fs.realpathSync(shared):undefined,sourceBytes,settingsFile,descriptor.assetItems);
 const rulebooks=compileRulebooks(root,manifest.sourceModules?.rulebooks,catalogs);
 if(rulebooks)resources.resourceClosure.rulebooks=rulebooks;
 const identity={resourceClosure:resources.resourceClosure,assets:resources.resourceAssets.map(({data,...metadata})=>metadata),providers:resources.providers};
 // Existing Studio checkpoints use the v1 source hash. Raising the host
 // budget alone must not change the identity of a previously valid closure.
 if(resources.resourceAssets.length<=256){
  const closure=identity.resourceClosure;
  identity.resourceClosure={...closure,budget:{...closure.budget,maxAssets:256}};
 }
 hash.update('\0resources-v1\0'+JSON.stringify(resourceIdentity(identity)));
 return {root,locale:language,manifest,descriptor,catalogs,configuration,dependencies,rules,presentation,helpers,types,support,sourceBytes,hash:hash.digest('hex'),...resources};
}
function inspectProject(directory,options){
 const p=loadProject(directory,options);
 const {describeResourceClosure}=require('./resource-report.cjs');
 const providers=p.providers.map(({file,source,role})=>({file,role,bytes:Buffer.byteLength(source),delivery:'source-only'}));
 const {dependencies,rules,helpers,presentation,types,support}=p;
 const resourceUsage=describeResourceClosure(p.manifest,{assets:p.resourceAssets,providers,
  sources:{dependencies,rules,helpers,presentation,types,support},resourceClosure:p.resourceClosure});
 return {id:p.manifest.id,version:p.manifest.version,contractVersion:1,hash:p.hash,sourceBytes:p.sourceBytes,modules:{rules:p.rules.map(f=>f.file),presentation:p.presentation.map(f=>f.file),helpers:p.helpers.map(f=>f.file)},limits:LIMITS,resourceUsage};
}
module.exports={LIMITS,SDKError,fail,local,read,json,loadProject,inspectProject,publicResources};

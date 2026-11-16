'use strict';
// Read sources as data. Never require/evaluate a pack in the host process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {BUDGET}=require('./budget.cjs');
const LIMITS=Object.freeze({fileBytes:4*1024*1024,sourceBytes:12*1024*1024,assetBytes:BUDGET.assetBytes,files:BUDGET.files,packBytes:BUDGET.packBytes,targetBytes:BUDGET.targetBytes,messageBytes:4*1024*1024,memoryBytes:64*1024*1024,callMs:2000,wallMs:5000});
class SDKError extends Error{
 constructor(code,detail={}){super(code);this.name='SDKError';this.code=code;this.diagnostic={code,...detail};}
}
function fail(code,detail){throw new SDKError(code,detail);}
function local(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.includes('\0')||name.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(name))fail('SDK_PATH_DENIED',{file:String(name).slice(0,160)});
 const target=path.join(root,name);let cursor=root;
 for(const part of name.split('/')){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file:name});}
 if(!fs.statSync(target).isFile())fail('SDK_FILE_REQUIRED',{file:name});
 return target;
}
function read(root,name){const file=local(root,name);if(fs.statSync(file).size>LIMITS.fileBytes)fail('SDK_FILE_LIMIT',{file:name});return fs.readFileSync(file,'utf8');}
function json(root,name){try{return JSON.parse(read(root,name));}catch(error){if(error instanceof SDKError)throw error;fail('SDK_JSON_INVALID',{file:name});}}
function scripts(root,names,prefix=''){
 if(!Array.isArray(names)||names.length>64||new Set(names).size!==names.length)fail('SDK_MODULES_INVALID');
 return names.map(name=>{if(typeof name!=='string'||!name.endsWith('.js'))fail('SDK_MODULES_INVALID');return {file:prefix+name,source:read(root,name)};});
}
// Resource discovery reads the complete declared closure as data. Provider JS
// and CSS are retained for source fidelity and never imported into the host.
function sourceResources(root,manifest,shared,coreSourceBytes){
 const {validateAsset}=require('./assets.cjs'),assets=[],providers=[],data=[],assetPacks=[],paths=Object.create(null),seen=new Set();
 const documentation=[];
 const provenance=fs.existsSync(path.join(root,'sdk/assets.json'))?json(root,'sdk/assets.json'):{};
 let bytes=0,decodedImageBytes=0;const reports=[];
 function add(base,relative,file){
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
  const base=path.join(shared,'asset-packs',id),spec=json(base,'manifest.json');
  if(spec.format!=='playroom-asset-pack'||spec.id!==id||spec.formatVersion!==1||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec.version)||version!==undefined&&spec.version!==version)fail('SDK_ASSET_PACK_INVALID');
  visiting.add(id);for(const dep of spec.dependencies||[])include(dep.id,dep.version);visiting.delete(id);included.set(id,spec.version);
  const prefix='assets/shared-packs/'+id+'/';assetPacks.push({manifest:spec,prefix});
  for(const file of new Set([...(spec.files||[]),...(spec.scripts||[]),...(spec.styles||[]),...(spec.items||[]).filter(item=>item.file!==undefined).map(item=>item.file)]))add(base,file,prefix+file);
 }
 for(const id of manifest.sharedAssetPacks||[])include(id);
 const sourceBytes=coreSourceBytes+providers.reduce((sum,row)=>sum+Buffer.byteLength(row.source),0);if(sourceBytes>LIMITS.sourceBytes)fail('SDK_SOURCE_LIMIT');
 const resourceClosure={sourceBytes,assetPacks,data,documentation,budget:{assetBytes:bytes,assetCount:assets.length,maxAssetBytes:BUDGET.assetBytes,maxAssets:BUDGET.files}};
 const books=manifest.sourceModules?.rulebooks||{};
 if(Object.keys(books).length){
  // Markdown compilation belongs to the canonical Python compiler. Adoption
  // materializes this inert JSON; stale source hashes are rejected below.
  if(!fs.existsSync(path.join(root,'sdk/rulebooks.json')))fail('SDK_RULEBOOKS_REBUILD',{hint:'Run SDK adopt to compile Markdown into the shared structured rulebook format.'});
  const compiled=json(root,'sdk/rulebooks.json');for(const [locale,file]of Object.entries(books)){if(compiled.hashes?.[locale]!==crypto.createHash('sha256').update(read(root,file)).digest('hex'))fail('SDK_RULEBOOKS_REBUILD');}resourceClosure.rulebooks=compiled.rulebooks;
 }
 const resourceAudit={files:reports,bytes,decodedImageBytes,documentation,limits:{maxBytes:BUDGET.assetBytes,maxFiles:BUDGET.files,maxDecodedImageBytes:BUDGET.decodedImageBytes,audioSeconds:BUDGET.audioSeconds},duplicates:[],note:'Actual declared local/shared media closure; provider source and authoring masters are separate.'};
 return {resourceAssets:assets,providers,resourceClosure,resourcePaths:paths,resourceAudit};
}
function publicResources(project){return {assets:project.resourceAssets||[],assetPacks:project.resourceClosure?.assetPacks||[],data:project.resourceClosure?.data||[],rulebooks:project.resourceClosure?.rulebooks||{}};}

function loadProject(directory,{shared}={}){
 const root=fs.realpathSync(directory),manifest=json(root,'manifest.json');
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(manifest.id)||typeof manifest.version!=='string'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version))fail('SDK_MANIFEST_INVALID',{file:'manifest.json'});
 const descriptor=fs.existsSync(path.join(root,'sdk/project.json'))?json(root,'sdk/project.json'):null;
 if(!descriptor||descriptor.contractVersion!==1||!Array.isArray(descriptor.presentation))fail('SDK_DESCRIPTOR_REQUIRED',{file:'sdk/project.json',hint:'Create an SDK project or add the studio descriptor; executable view.js is never loaded.'});
 const dependencies=[];
 if(manifest.sharedDomain?.length){
  if(!shared)fail('SDK_SHARED_REQUIRED');
  for(const id of manifest.sharedDomain){if(!/^[a-z][a-z0-9-]*$/.test(id))fail('SDK_MODULES_INVALID');dependencies.push(...scripts(fs.realpathSync(shared),['domain/'+id+'.js'],'shared/'));}
 }
 const rules=scripts(root,descriptor.rules),presentation=scripts(root,descriptor.presentation);
 // Presentation gets explicitly selected pure helpers, never authoritative rules.
 const helpers=scripts(root,descriptor.helpers||[]);
 const support=scripts(root,descriptor.support||[]).map(row=>({...row,role:row.file.endsWith('/tutorial.js')?'tutorial':row.file.endsWith('/rule-illustrations.js')?'illustrations':row.file==='sounds.js'?'sounds':'presentation-support'}));
 if(!Array.isArray(descriptor.types||[])||(descriptor.types||[]).length>32||new Set(descriptor.types||[]).size!==(descriptor.types||[]).length)fail('SDK_TYPES_INVALID');
 const types=(descriptor.types||[]).map(file=>{if(typeof file!=='string'||!file.endsWith('.d.ts'))fail('SDK_TYPES_INVALID');return {file,source:read(root,file)};});
 if(descriptor.presentation.some(name=>!name.startsWith('presentation/'))||descriptor.helpers?.some(name=>!name.startsWith('domain/')))fail('SDK_MODULES_INVALID');
 const sourceBytes=[...dependencies,...rules,...presentation,...helpers,...types,...support].reduce((sum,f)=>sum+Buffer.byteLength(f.source),0);
 if(sourceBytes>LIMITS.sourceBytes)fail('SDK_SOURCE_LIMIT');
 const catalogs={};
 for(const [locale,files]of Object.entries(manifest.sourceModules?.locales||{})){
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)||!Array.isArray(files)||files.length>32)fail('SDK_LOCALES_INVALID');
  const catalog=Object.create(null);for(const name of files){const value=json(root,name);if(!value||typeof value!=='object'||Array.isArray(value))fail('SDK_LOCALES_INVALID');for(const [key,text]of Object.entries(value)){if(Object.hasOwn(catalog,key)||typeof text!=='string')fail('SDK_LOCALES_INVALID');catalog[key]=text;}}catalogs[locale]=catalog;
 }
 const hash=crypto.createHash('sha256');hash.update(JSON.stringify({manifest,descriptor,catalogs}));for(const f of [...dependencies,...rules,...helpers,...presentation,...types,...support])hash.update(f.file+'\0'+f.source);
 return {root,manifest,descriptor,catalogs,dependencies,rules,presentation,helpers,types,support,sourceBytes,hash:hash.digest('hex'),...sourceResources(root,manifest,shared?fs.realpathSync(shared):undefined,sourceBytes)};
}
function inspectProject(directory,options){
 const p=loadProject(directory,options);
 return {id:p.manifest.id,version:p.manifest.version,contractVersion:1,hash:p.hash,sourceBytes:p.sourceBytes,modules:{rules:p.rules.map(f=>f.file),presentation:p.presentation.map(f=>f.file),helpers:p.helpers.map(f=>f.file)},limits:LIMITS};
}
module.exports={LIMITS,SDKError,fail,local,read,json,loadProject,inspectProject,publicResources};

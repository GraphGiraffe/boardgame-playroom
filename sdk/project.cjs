'use strict';
// Read sources as data. Never require/evaluate a pack in the host process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LIMITS=Object.freeze({fileBytes:4*1024*1024,sourceBytes:12*1024*1024,assetBytes:64*1024*1024,files:2048,messageBytes:4*1024*1024,memoryBytes:64*1024*1024,callMs:2000,wallMs:5000});
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
 if(descriptor.presentation.some(name=>!name.startsWith('presentation/'))||descriptor.helpers?.some(name=>!name.startsWith('domain/')))fail('SDK_MODULES_INVALID');
 const sourceBytes=[...dependencies,...rules,...presentation,...helpers].reduce((sum,f)=>sum+Buffer.byteLength(f.source),0);
 if(sourceBytes>LIMITS.sourceBytes)fail('SDK_SOURCE_LIMIT');
 const catalogs={};
 for(const [locale,files]of Object.entries(manifest.sourceModules?.locales||{})){
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)||!Array.isArray(files)||files.length>32)fail('SDK_LOCALES_INVALID');
  const catalog=Object.create(null);for(const name of files){const value=json(root,name);if(!value||typeof value!=='object'||Array.isArray(value))fail('SDK_LOCALES_INVALID');for(const [key,text]of Object.entries(value)){if(Object.hasOwn(catalog,key)||typeof text!=='string')fail('SDK_LOCALES_INVALID');catalog[key]=text;}}catalogs[locale]=catalog;
 }
 const hash=crypto.createHash('sha256');hash.update(JSON.stringify({manifest,descriptor,catalogs}));for(const f of [...dependencies,...rules,...helpers,...presentation])hash.update(f.file+'\0'+f.source);
 return {root,manifest,descriptor,catalogs,dependencies,rules,presentation,helpers,sourceBytes,hash:hash.digest('hex')};
}
function inspectProject(directory,options){
 const p=loadProject(directory,options);
 return {id:p.manifest.id,version:p.manifest.version,contractVersion:1,hash:p.hash,sourceBytes:p.sourceBytes,modules:{rules:p.rules.map(f=>f.file),presentation:p.presentation.map(f=>f.file),helpers:p.helpers.map(f=>f.file)},limits:LIMITS};
}
module.exports={LIMITS,SDKError,fail,local,read,json,loadProject,inspectProject};

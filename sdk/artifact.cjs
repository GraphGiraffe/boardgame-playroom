'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {local,fail}=require('./project.cjs');
const {measure}=require('./budget.cjs');
function encodeSource(project,assets){
 // A provided audit is a snapshot, even when a newer project was loaded later.
 // Local-only audits cover assets/; SDK audits declare the full shared closure.
 if(project.resourceAssets&&Array.isArray(assets?.files)){
  const current=new Map(project.resourceAssets.map(row=>[row.file,row]));
  const expected=assets.scope==='resource-closure'?project.resourceAssets:project.resourceAssets.filter(row=>row.file.startsWith('assets/')&&!row.file.startsWith('assets/shared/')&&!row.file.startsWith('assets/shared-packs/'));
  const audited=new Set(assets.files.map(row=>row.file));
  for(const row of assets.files){const value=current.get(row.file);if(!value||value.sha256!==row.sha256||value.bytes!==row.bytes)fail('SDK_ASSET_CHANGED',{file:row.file});}
  for(const row of expected)if(!audited.has(row.file))fail('SDK_ASSET_CHANGED',{file:row.file});
 }

 for(const resource of project.resourceAssets||[]){const file=project.resourcePaths?.[resource.file];if(file&&(!fs.existsSync(file)||fs.statSync(file).size!==resource.bytes||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==resource.sha256))fail('SDK_ASSET_CHANGED',{file:resource.file});}
 const artifact={format:'playroom-sdk-source',contractVersion:1,manifest:project.manifest,descriptor:project.descriptor,catalogs:project.catalogs,sources:{dependencies:project.dependencies,rules:project.rules,helpers:project.helpers,presentation:project.presentation,types:project.types||[],support:project.support||[],providers:project.providers||[]},assets:project.resourceAssets||assets.files.map(file=>{
  const path=local(project.root,file.file);if(fs.statSync(path).size!==file.bytes)fail('SDK_ASSET_CHANGED',{file:file.file});
  const data=fs.readFileSync(path);if(crypto.createHash('sha256').update(data).digest('hex')!==file.sha256)fail('SDK_ASSET_CHANGED',{file:file.file});
  return {file:file.file,sha256:file.sha256,mime:file.mime,data:data.toString('base64')};
 }),...(project.resourceClosure?{resourceClosure:project.resourceClosure,sourceBytes:project.sourceBytes}:{}),sourceHash:project.hash};
 const text=JSON.stringify(artifact)+'\n',budget={format:artifact.format,...measure(text)};
 if(budget.bytes>budget.maxBytes)fail('SDK_PACK_SIZE_LIMIT',{bytes:budget.bytes,maxBytes:budget.maxBytes,hint:'The complete source export includes JSON escaping, metadata, modules and base64 assets. Reduce the runtime payload; keep source masters outside the project assets directory.'});
 return {text,budget};
}
module.exports={encodeSource};

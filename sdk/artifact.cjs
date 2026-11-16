'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {local,fail}=require('./project.cjs');
const {measure}=require('./budget.cjs');
function encodeSource(project,assets){
 const artifact={format:'playroom-sdk-source',contractVersion:1,manifest:project.manifest,descriptor:project.descriptor,catalogs:project.catalogs,sources:{dependencies:project.dependencies,rules:project.rules,helpers:project.helpers,presentation:project.presentation},assets:assets.files.map(file=>{
  const path=local(project.root,file.file);if(fs.statSync(path).size!==file.bytes)fail('SDK_ASSET_CHANGED',{file:file.file});
  const data=fs.readFileSync(path);if(crypto.createHash('sha256').update(data).digest('hex')!==file.sha256)fail('SDK_ASSET_CHANGED',{file:file.file});
  return {file:file.file,sha256:file.sha256,mime:file.mime,data:data.toString('base64')};
 }),sourceHash:project.hash};
 const text=JSON.stringify(artifact)+'\n',budget={format:artifact.format,...measure(text)};
 if(budget.bytes>budget.maxBytes)fail('SDK_PACK_SIZE_LIMIT',{bytes:budget.bytes,maxBytes:budget.maxBytes,hint:'The complete source export includes JSON escaping, metadata, modules and base64 assets. Reduce the runtime payload; keep source masters outside the project assets directory.'});
 return {text,budget};
}
module.exports={encodeSource};

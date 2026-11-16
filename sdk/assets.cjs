'use strict';
const fs=require('node:fs'),path=require('node:path');
const {LIMITS,fail,local}=require('./project.cjs');
const {BUDGET}=require('./budget.cjs');
const {MIME,fileLimit,validateAsset,validateMedia}=require('./media.cjs').createMediaValidator(BUDGET);
function auditAssets(root,{candidate}={}){
 const files=[],documentation=[];let bytes=0,entries=0,decodedImageBytes=0;
 function add(name,data){
  if(files.length>=BUDGET.files)fail('SDK_ASSET_COUNT',{maxFiles:BUDGET.files});
  bytes+=data.length;if(bytes>BUDGET.assetBytes)fail('SDK_ASSET_TOTAL_LIMIT',{bytes,maxBytes:BUDGET.assetBytes});
  const value=validateAsset(data,name);decodedImageBytes+=value.decodedImageBytes||0;if(decodedImageBytes>BUDGET.decodedImageBytes)fail('SDK_DECODED_IMAGE_LIMIT',{decodedImageBytes,maxBytes:BUDGET.decodedImageBytes});files.push({file:name,...value});
 }
 function walk(folder,depth=0){if(depth>16)fail('SDK_ASSET_DEPTH');if(!fs.existsSync(path.join(root,folder)))return;if(fs.lstatSync(path.join(root,folder)).isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file:folder});for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){if(++entries>LIMITS.files*2)fail('SDK_ASSET_COUNT');const name=folder+'/'+entry.name;if(entry.isSymbolicLink())fail('SDK_SYMLINK_DENIED',{file:name});if(entry.isDirectory())walk(name,depth+1);else {if(['.md','.txt'].includes(path.extname(name).toLowerCase())){documentation.push(name);continue;}const file=local(root,name),size=fs.statSync(file).size,maxBytes=fileLimit(name);if(size>maxBytes)fail('SDK_ASSET_SIZE_LIMIT',{file:name,bytes:size,maxBytes});add(name,fs.readFileSync(file));}}}
 if(candidate&&(!/^assets\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(candidate.file)||!Buffer.isBuffer(candidate.buffer)))fail('SDK_ASSET_PATH');
 walk('assets');
 if(candidate){if(files.some(file=>file.file===candidate.file))fail('SDK_ASSET_EXISTS');add(candidate.file,candidate.buffer);}
 const duplicates=new Map();for(const file of files){if(!duplicates.has(file.sha256))duplicates.set(file.sha256,[]);duplicates.get(file.sha256).push(file.file);}
 return {files,bytes,decodedImageBytes,documentation,limits:{maxBytes:BUDGET.assetBytes,maxFiles:BUDGET.files,maxDecodedImageBytes:BUDGET.decodedImageBytes,audioSeconds:BUDGET.audioSeconds},duplicates:[...duplicates.values()].filter(list=>list.length>1),note:'Decoded totals cover reported raster dimensions only; SVG/audio memory and unreported duration remain unknown. Markdown/text documentation is not a runtime asset. Source masters are never modified.'};
}
function auditProjectAssetImport(root,candidate,{shared}={}){
 if(!candidate||!/^assets\/[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp|wav|ogg|mp3|json)$/.test(candidate.file)||!Buffer.isBuffer(candidate.buffer))fail('SDK_ASSET_PATH');
 const project=require('./project.cjs').loadProject(root,{shared}),inventory=project.resourceAudit;
 if(project.resourceAssets.some(asset=>asset.file===candidate.file))fail('SDK_ASSET_EXISTS');
 const report=validateAsset(candidate.buffer,candidate.file),count=inventory.files.length+1,bytes=inventory.bytes+report.bytes,decodedImageBytes=inventory.decodedImageBytes+(report.decodedImageBytes||0);
 if(count>BUDGET.files)fail('SDK_ASSET_COUNT',{maxFiles:BUDGET.files});
 if(bytes>BUDGET.assetBytes)fail('SDK_ASSET_TOTAL_LIMIT',{bytes,maxBytes:BUDGET.assetBytes});
 if(decodedImageBytes>BUDGET.decodedImageBytes)fail('SDK_DECODED_IMAGE_LIMIT',{decodedImageBytes,maxBytes:BUDGET.decodedImageBytes});
 const assets={...inventory,files:[...inventory.files,{file:candidate.file,...report}],bytes,decodedImageBytes};
 const resource={file:candidate.file,sha256:report.sha256,mime:report.mime,bytes:report.bytes,data:candidate.buffer.toString('base64'),provenance:{...candidate.provenance,sha256:report.sha256}};
 const prepared={...project,resourceAssets:[...project.resourceAssets,resource],resourceAudit:assets,resourceClosure:{...project.resourceClosure,budget:{...project.resourceClosure.budget,assetBytes:bytes,assetCount:count}}};
 const sourceBudget=require('./artifact.cjs').encodeSource(prepared,assets).budget;
 return {...report,assetBudget:{bytes,count,...inventory.limits},sourceBudget};
}
module.exports={MIME,validateAsset,validateMedia,auditAssets,auditProjectAssetImport};

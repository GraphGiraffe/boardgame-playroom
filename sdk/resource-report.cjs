'use strict';

// Explain the resolved closure for authors. The caller supplies validated
// source or distribution data, so the report never opens files or loads code.
function describeResourceClosure(manifest, {assets=[], providers=[], sources={}, resourceClosure={}}) {
 const {assetPacks=[],data=[],documentation=[],budget={}}=resourceClosure;
 const selected=new Set(manifest.sharedAssetPacks||[]);
 const sharedFiles=new Set((manifest.sharedAssets||[]).map(file=>'assets/shared/'+file));
 const packs=new Map(),declarations=new Map();
 for(const {manifest:spec,availableItems} of assetPacks){
  const items=availableItems===undefined?{}:{items:{available:availableItems,selected:spec.items.map(item=>item.id)}};
  packs.set(spec.id,{id:spec.id,version:spec.version,direct:selected.has(spec.id),requiredBy:[],...items});
 }
 for(const {manifest:spec,prefix} of assetPacks){
  for(const dependency of spec.dependencies||[]){
   const requiredBy=packs.get(dependency.id)?.requiredBy;
   if(requiredBy&&!requiredBy.includes(spec.id))requiredBy.push(spec.id);
  }
  for(const [field,files] of [
   ['files',spec.files],['scripts',spec.scripts],['styles',spec.styles],
   ['items',spec.items?.map(item=>item.file).filter(file=>file!==undefined)],
  ]){
   for(const file of files||[]){
    const key=prefix+file;
    if(!declarations.has(key))declarations.set(key,{assetPack:spec.id,declaredBy:new Set()});
    declarations.get(key).declaredBy.add(field);
   }
  }
 }
 function explain(file,kind,details={}){
  const declaration=declarations.get(file);
  if(declaration)return {file,kind,...details,assetPack:declaration.assetPack,declaredBy:[...declaration.declaredBy]};
  const origin=sharedFiles.has(file)?'sharedAssets':file.startsWith('assets/')?'assets/':file.startsWith('config/')?'config/':'resourceClosure';
  return {file,kind,...details,declaredBy:[origin]};
 }
 return {
  scope:'declared-resource-closure',
  budget,
  assetPacks:[...packs.values()],
  // Guest entry points describe capabilities shipped by this variant. Keep
  // them separate from inert media providers and from observed usage traces.
  sdkModules:['dependencies','rules','helpers','presentation','types','support'].flatMap(group=>
   (sources[group]||[]).map(({file,role,source,bytes})=>({file,group,bytes:bytes??Buffer.byteLength(source),
    origin:file.startsWith('shared/')?'shared':'pack',...(role?{role}:{})}))),
  files:[
   ...assets.map(({file,bytes,sha256,mime})=>explain(file,'media',{bytes,sha256,mime})),
   ...providers.map(({file,...details})=>explain(file,'provider',details)),
   ...data.map(({file})=>explain(file,'data')),
   ...documentation.map(file=>explain(file,'documentation')),
  ],
 };
}

module.exports={describeResourceClosure};

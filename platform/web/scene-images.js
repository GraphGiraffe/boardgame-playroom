/* Shared image admission, idle warmup and URL ownership for installed scenes. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PlayroomSceneImages=api;
})(globalThis,function(root){
 'use strict';
 const resourceIndexes=new WeakMap();
 const installedURLs=new WeakMap();
 const IMAGE_WARMUP_LIMIT=32, IMAGE_WARMUP_BYTES=8*1024*1024;
 function indexResources(assets){
  const cached=resourceIndexes.get(assets);if(cached)return cached;
  const images=new Map(),cardBackFiles=[],keys=[];
  for(const asset of assets){
   keys.push(asset?.file+':'+asset?.sha256);
   if(typeof asset?.file==='string'&&typeof asset.data==='string'&&/^image\/(png|webp|jpeg|gif|svg\+xml)$/.test(asset.mime)&&asset.data.length<=6000000){
    if(asset.file.endsWith('/back.svg')&&!images.has(asset.file))cardBackFiles.push(asset.file);
    images.set(asset.file,asset);
   }
  }
  const immutable=Object.isFrozen(assets)&&assets.every(Object.isFrozen);
  const index={images,cardBackFiles,scope:keys.join('|'),immutable};
  if(immutable)resourceIndexes.set(assets,index);
  return index;
 }
 function releaseURL(entry){
  if(entry.installed){
   if(--entry.installed.owners>0)return;
   installedURLs.delete(entry.asset);
  }
  URL.revokeObjectURL(entry.url);
 }
 // This cache can start in the lobby and move to a scene without copying
 // asset bytes, object URLs, or a decode already in progress.
 class SceneImages {
  constructor(){this.urls=new Map();}
  prepare(index){
   const previous=this.index;
   this.index=index;
   if(previous?.scope===index.scope)return;
   this.cancelWarmup();
   for(const [file,entry] of this.urls){
    if(entry.key!==file+':'+index.images.get(file)?.sha256){releaseURL(entry);this.urls.delete(file);}
   }
  }
  release(){
   this.cancelWarmup();
   for(const entry of this.urls.values())releaseURL(entry);
   this.urls.clear();
  }
  cancelWarmup(){
   const job=this.warmup;
   this.warmup=null;
   if(job)for(const entry of this.urls.values())delete entry.warmed;
   if(job?.idle!=null){
    if(job.native)root.cancelIdleCallback(job.idle);
    else root.clearTimeout(job.idle);
   }
  }
  warm(preferred,coverId){
   if(this.warmup||!this.index?.images.size||!root.Image?.prototype.decode||root.document.hidden)return;
   // Large sets stay lazy unless the author names the images needed early.
   const images=this.index.images;
   const files=Array.isArray(preferred)?preferred.slice(0,IMAGE_WARMUP_LIMIT).map(ref=>ref?.id).values()
    :images.size<=IMAGE_WARMUP_LIMIT?images.keys():null;
   if(!files)return;
   const native=typeof root.requestIdleCallback==='function'&&typeof root.cancelIdleCallback==='function';
   const job={native,idle:null,count:0,bytes:0};
   this.warmup=job;
   // Warm only the selected pack's audited public files. An authorized
   // scene renders them through the same object URLs.
   const schedule=()=>{
    if(this.warmup!==job||job.count>=IMAGE_WARMUP_LIMIT||job.bytes>=IMAGE_WARMUP_BYTES)return;
    job.idle=native?root.requestIdleCallback(run):root.setTimeout(run,50);
   };
   const run=deadline=>{
    job.idle=null;
    if(this.warmup!==job)return;
    if(root.document.hidden){this.cancelWarmup();return;}
    if(root.navigator?.scheduling?.isInputPending?.()||native&&deadline.timeRemaining()<4){schedule();return;}
    for(const file of files){
     if(file===coverId||this.urls.has(file))continue;
     const entry=this.get(file);
     if(!entry)continue;
     job.count++;
     const image=new root.Image();image.src=entry.url;
     image.decode().then(()=>{
      if(this.warmup!==job)return;
      const bytes=image.naturalWidth*image.naturalHeight*4;
      if(job.bytes+bytes<=IMAGE_WARMUP_BYTES){entry.warmed=image;job.bytes+=bytes;}
     },()=>{}).finally(schedule);
     return;
    }
   };
   schedule();
  }
  cardBackURL(set){
   if(!this.index)return '';
   const suffix=set?'/'+set+'/back.svg':'/back.svg';
   const canonical=set?this.get('assets/shared-packs'+suffix):null;
   if(canonical)return canonical.url;
   // Older packs can place their backs outside the shared directory. Keep
   // their source order without walking unrelated artwork for each card.
   for(const file of this.index.cardBackFiles){
    if(!file.endsWith(suffix))continue;
    const entry=this.get(file);
    if(entry)return entry.url;
   }
   return '';
  }
  get(file){
   const cached=this.urls.get(file);if(cached)return cached;
   const asset=this.index?.images.get(file);if(!asset)return null;
   // Scene and enlarged art lease the same URL for an installed row. Each
   // cache owns its warmup state and releases only its own lease.
   try{
    let installed=this.index.immutable?installedURLs.get(asset):null;
    let url=installed?.url;
    if(!url){
     const bytes=asset.encoding==='utf8'?new TextEncoder().encode(asset.data):Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
     url=URL.createObjectURL(new Blob([bytes],{type:asset.mime}));
     if(this.index.immutable){installed={url,owners:0};installedURLs.set(asset,installed);}
    }
    const entry={key:file+':'+asset.sha256,url};
    if(installed){installed.owners++;entry.installed=installed;entry.asset=asset;}
    this.urls.set(file,entry);
    return entry;
   }catch{return null;}
  }
 }
 function preloadImages(refs,assets){
  if(refs===undefined)return undefined;
  const images=indexResources(assets).images;
  if(!Array.isArray(refs)||refs.length>IMAGE_WARMUP_LIMIT||
    refs.some(ref=>ref?.kind!=='asset'||!images.has(ref.id)))
   throw Object.assign(Error('PACK_PRELOAD_IMAGES_INVALID'),{code:'PACK_PRELOAD_IMAGES_INVALID'});
  return Object.freeze(refs.map(ref=>Object.freeze({kind:'asset',id:ref.id})));
 }
 return Object.freeze({SceneImages,indexResources,preloadImages});
});

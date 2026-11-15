/* Volatile report attachments. No storage, game saves, URLs or credentials. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomBugAttachments=api;})(globalThis,function(root){
 'use strict';
 const IMAGE_LIMIT=144*1024,LOG_LIMIT=128*1024,RAW_LOG_LIMIT=1024*1024;
 const fail=code=>Object.assign(Error(code),{code});
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
 function base64(value){let text='';for(let i=0;i<value.length;i+=8192)text+=String.fromCharCode(...value.subarray(i,i+8192));return root.btoa(text);}
 async function gzip(value){if(!root.CompressionStream)throw fail('compression-unavailable');return new Uint8Array(await new Response(new Blob([value]).stream().pipeThrough(new root.CompressionStream('gzip'))).arrayBuffer());}
 async function log(recorder){
  const trace=recorder?.trace?.();if(!trace?.events?.length)return null;
  const value={...trace,omitted:0};let raw=bytes(value),compressed;
  // Keep the beginning (baseline) and the most recent events; disclose any cut.
  for(;;){
   if(raw.length<=RAW_LOG_LIMIT){compressed=await gzip(raw);if(compressed.length<=LOG_LIMIT)break;}
   if(value.events.length<=1)throw fail('log-too-large');
   const remove=Math.max(1,Math.ceil(value.events.length/5));value.events=value.events.slice(remove);value.omitted+=remove;raw=bytes(value);
  }
  return {data:base64(compressed),bytes:compressed.length,rawBytes:raw.length,events:value.events.length,omitted:value.omitted,preview:value};
 }
 async function image(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>20*1024*1024)throw fail('image-format');
  // Decode at the target size where supported, then redraw to strip metadata.
  let bitmap;try{bitmap=await root.createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){throw fail('image-format');}
  try{
   const ratio=Math.min(1,1280/bitmap.width,1280/bitmap.height);let width=Math.max(1,Math.round(bitmap.width*ratio)),height=Math.max(1,Math.round(bitmap.height*ratio));
   const canvas=root.document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw fail('image-format');
   for(let attempt=0;attempt<7;attempt++){
    canvas.width=width;canvas.height=height;context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
    const quality=attempt<3?.84-attempt*.12:.65;
    let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob?.type!=='image/webp')blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw fail('image-format');
    if(blob.size<=IMAGE_LIMIT){const data=base64(new Uint8Array(await blob.arrayBuffer()));return {mime:blob.type,width,height,data,bytes:blob.size};}
    if(attempt>=2){width=Math.max(1,Math.round(width*.8));height=Math.max(1,Math.round(height*.8));}
   }
   throw fail('image-too-large');
  }finally{bitmap.close();}
 }
 function formatLog(value){const count=value?.events||0,label={one:'запись',few:'записи',many:'записей',other:'записи'}[new Intl.PluralRules('ru').select(count)],number=value?.omitted?count+'/'+(count+value.omitted):count;return `${number} ${label} · ${((value?.bytes||0)/1024).toFixed(1)} КБ.`;}
 return Object.freeze({image,log,formatLog,IMAGE_LIMIT,LOG_LIMIT,RAW_LOG_LIMIT});
});

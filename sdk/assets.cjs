'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SaxesParser}=require('saxes');
const {LIMITS,fail,local}=require('./project.cjs');
const {BUDGET}=require('./budget.cjs');
const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg','.json':'application/json'};
function fileLimit(file){const ext=path.extname(file).toLowerCase();if(!MIME[ext])fail('SDK_ASSET_FORMAT',{file});return ext==='.svg'?BUDGET.svgBytes:ext==='.json'?BUDGET.animationBytes:MIME[ext].startsWith('audio/')?BUDGET.audioBytes:BUDGET.imageBytes;}
function wavDuration(buffer,file){
 if(buffer.length<44||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE'||buffer.readUInt32LE(4)+8!==buffer.length)fail('SDK_ASSET_SIGNATURE',{file});
 let byteRate=null,blockAlign=null,dataBytes=0;
 for(let offset=12;offset+8<=buffer.length;){
  const kind=buffer.toString('ascii',offset,offset+4),length=buffer.readUInt32LE(offset+4),start=offset+8;
  if(start+length>buffer.length)fail('SDK_ASSET_SIGNATURE',{file});
  if(kind==='fmt '){
   if(length<16||byteRate!==null)fail('SDK_ASSET_SIGNATURE',{file});
   const format=buffer.readUInt16LE(start),channels=buffer.readUInt16LE(start+2),rate=buffer.readUInt32LE(start+4),bits=buffer.readUInt16LE(start+14);byteRate=buffer.readUInt32LE(start+8);blockAlign=buffer.readUInt16LE(start+12);
   if(![1,3].includes(format)||!channels||channels>8||!rate||!bits||bits%8||!blockAlign||blockAlign!==channels*bits/8||byteRate!==rate*blockAlign)fail('SDK_ASSET_SIGNATURE',{file});
  }else if(kind==='data'){if(byteRate===null)fail('SDK_ASSET_SIGNATURE',{file});dataBytes+=length;}
  offset=start+length+(length%2);
 }
 if(!byteRate||!dataBytes||dataBytes%blockAlign)fail('SDK_ASSET_SIGNATURE',{file});
 const seconds=dataBytes/byteRate;if(seconds>BUDGET.audioSeconds)fail('SDK_AUDIO_DURATION_LIMIT',{file,seconds,maxSeconds:BUDGET.audioSeconds});return seconds;
}
function svg(buffer,file){
 const allowed=new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern filter feGaussianBlur feOffset feMerge feMergeNode feColorMatrix feComposite feBlend'.split(' '));
 const parser=new SaxesParser({xmlns:true});let root=false,nodes=0;
 parser.on('doctype',()=>fail('SDK_SVG_ACTIVE',{file}));
 parser.on('processinginstruction',()=>fail('SDK_SVG_ACTIVE',{file}));
 parser.on('opentag',tag=>{
  if(++nodes>BUDGET.svgNodes)fail('SDK_SVG_LIMIT',{file});
  if(!root){if(tag.local!=='svg'||tag.uri!=='http://www.w3.org/2000/svg')fail('SDK_SVG_INVALID',{file});root=true;}
  if(!allowed.has(tag.local)||tag.uri!=='http://www.w3.org/2000/svg')fail('SDK_SVG_ACTIVE',{file});
  for(const attr of Object.values(tag.attributes)){
   if(attr.prefix==='xmlns'||attr.name==='xmlns')continue;
   if(/^on/i.test(attr.local)||attr.local==='style'||(!['','http://www.w3.org/1999/xlink','http://www.w3.org/XML/1998/namespace'].includes(attr.uri)))fail('SDK_SVG_ACTIVE',{file});
   if(attr.local==='href'&&!/^#[A-Za-z_][\w.-]*$/.test(attr.value))fail('SDK_ASSET_EXTERNAL',{file});
   if(/(?:url\s*\(|https?:|data:|javascript:|@import)/i.test(attr.value)&&!/^url\(#[A-Za-z_][\w.-]*\)$/.test(attr.value))fail('SDK_ASSET_EXTERNAL',{file});
  }
 });
 parser.on('error',()=>fail('SDK_SVG_INVALID',{file}));parser.write(buffer.toString('utf8')).close();if(!root)fail('SDK_SVG_INVALID',{file});
}
function validateAsset(buffer,file){
 const ext=path.extname(file).toLowerCase(),maxBytes=fileLimit(file);if(buffer.length>maxBytes)fail('SDK_ASSET_SIZE_LIMIT',{file,bytes:buffer.length,maxBytes});
 let pixels=null,durationSeconds=null;const warnings=[];
 if(ext==='.svg')svg(buffer,file);
 else if(ext==='.png'){
  if(buffer.length<24||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||buffer.toString('ascii',12,16)!=='IHDR')fail('SDK_ASSET_SIGNATURE',{file});
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide||width*height>BUDGET.imagePixels)fail('SDK_IMAGE_LIMIT',{file});pixels=width*height;
 }else if(ext==='.jpg'||ext==='.jpeg'){
  if(buffer.length<4||buffer[0]!==255||buffer[1]!==216||buffer[2]!==255)fail('SDK_ASSET_SIGNATURE',{file});
  let offset=2;while(offset+4<=buffer.length){if(buffer[offset++]!==255)fail('SDK_ASSET_SIGNATURE',{file});while(buffer[offset]===255)offset++;const marker=buffer[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)fail('SDK_ASSET_SIGNATURE',{file});if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)fail('SDK_ASSET_SIGNATURE',{file});const height=buffer.readUInt16BE(offset+3),width=buffer.readUInt16BE(offset+5);pixels=width*height;if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide)fail('SDK_IMAGE_LIMIT',{file});break;}offset+=length;}
  if(pixels===null)fail('SDK_ASSET_SIGNATURE',{file});
 }
 else if(ext==='.webp'){
  if(buffer.length<30||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP')fail('SDK_ASSET_SIGNATURE',{file});
  const chunk=buffer.toString('ascii',12,16);let width,height;
  if(chunk==='VP8X'){width=1+buffer.readUIntLE(24,3);height=1+buffer.readUIntLE(27,3);}
  else if(chunk==='VP8L'&&buffer[20]===47){const bits=buffer.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  else if(chunk==='VP8 '&&buffer.toString('hex',23,26)==='9d012a'){width=buffer.readUInt16LE(26)&16383;height=buffer.readUInt16LE(28)&16383;}
  else fail('SDK_ASSET_SIGNATURE',{file});
  if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide)fail('SDK_IMAGE_LIMIT',{file});pixels=width*height;
 }
 else if(ext==='.wav')durationSeconds=wavDuration(buffer,file);
 else if(ext==='.ogg'){if(buffer.toString('ascii',0,4)!=='OggS')fail('SDK_ASSET_SIGNATURE',{file});}
 else if(ext==='.mp3'){if(buffer.toString('ascii',0,3)!=='ID3'&&!(buffer[0]===255&&(buffer[1]&224)===224))fail('SDK_ASSET_SIGNATURE',{file});}
 else {let value;try{value=JSON.parse(buffer.toString('utf8'));}catch{fail('SDK_ASSET_JSON',{file});}if(value?.contractVersion!==1||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>1000||value.frames.some((frame,index)=>!Number.isFinite(frame.time)||frame.time<0||frame.time>BUDGET.animationMs||index>0&&frame.time<value.frames[index-1].time||!frame.values||Object.entries(frame.values).some(([key,n])=>!['x','y','rotation','scale','opacity'].includes(key)||!Number.isFinite(n)||Math.abs(n)>10000||key==='opacity'&&(n<0||n>1)||key==='scale'&&(n<0||n>20))))fail('SDK_ANIMATION_INVALID',{file});}
 if(pixels!==null&&pixels>BUDGET.imagePixels)fail('SDK_IMAGE_LIMIT',{file});
 if(pixels!==null&&buffer.length>BUDGET.imageTargetBytes)warnings.push({code:'SDK_ASSET_TARGET_EXCEEDED',file,bytes:buffer.length,targetBytes:BUDGET.imageTargetBytes});
 if(MIME[ext].startsWith('audio/')&&durationSeconds===null)warnings.push({code:'SDK_AUDIO_DURATION_UNVERIFIED',file,hint:'Encoded size/signature checked; OGG/MP3 duration must be checked by browser metadata in the studio.'});
 return {mime:MIME[ext],bytes:buffer.length,maxBytes,decodedImageBytes:pixels===null?null:pixels*4,durationSeconds,warnings,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
}
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
module.exports={MIME,validateAsset,auditAssets};

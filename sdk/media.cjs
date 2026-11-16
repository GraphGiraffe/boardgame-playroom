'use strict';
// Shared byte-level media policy. The browser and Node author tools use this
// same implementation; only trusted checkout limits are supplied at bootstrap.
const {SaxesParser}=require('saxes');
function fail(code,detail={}){throw Object.assign(new Error(code),{code,diagnostic:{code,...detail}});}
const extension=file=>typeof file==='string'?file.slice(file.lastIndexOf('.')).toLowerCase():'';
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
const ascii=(bytes,start,end)=>String.fromCharCode(...bytes.subarray(start,end));
function utf8(bytes,file){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('SDK_ASSET_ENCODING',{file});}}
function readUint(bytes,offset,length,little,file){if(!Number.isInteger(offset)||offset<0||offset+length>bytes.length)fail('SDK_ASSET_SIGNATURE',{file});let value=0;for(let i=0;i<length;i++)value=value*256+bytes[offset+(little?length-i-1:i)];return value;}
// FIPS 180-4 SHA-256, synchronous for Packs.prepare (WebCrypto is async).
function sha256(bytes){
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
 const data=new DataView(padded.buffer);data.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));data.setUint32(padded.length-4,(bytes.length*8)>>>0);
 const w=new Uint32Array(64),r=(n,b)=>(n>>>b)|(n<<(32-b));
 for(let block=0;block<padded.length;block+=64){for(let i=0;i<16;i++)w[i]=data.getUint32(block+i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=((r(a,7)^r(a,18)^(a>>>3))+w[i-16]+(r(b,17)^r(b,19)^(b>>>10))+w[i-7])>>>0;}
  let [a,b,c,d,e,f,g,h]=state;for(let i=0;i<64;i++){const one=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,two=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+one)>>>0;d=c;c=b;b=a;a=(one+two)>>>0;}for(const [i,value]of [a,b,c,d,e,f,g,h].entries())state[i]=(state[i]+value)>>>0;
 }
 return state.map(n=>n.toString(16).padStart(8,'0')).join('');
}
function createMediaValidator(limits){
 const BUDGET=Object.freeze({...limits});
const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg','.json':'application/json'};
function fileLimit(file){const ext=extension(file).toLowerCase();if(!MIME[ext])fail('SDK_ASSET_FORMAT',{file});return ext==='.svg'?BUDGET.svgBytes:ext==='.json'?BUDGET.animationBytes:MIME[ext].startsWith('audio/')?BUDGET.audioBytes:BUDGET.imageBytes;}
function wavDuration(buffer,file){
 if(buffer.length<44||ascii(buffer,0,4)!=='RIFF'||ascii(buffer,8,12)!=='WAVE'||readUint(buffer,4,4,true,file)+8!==buffer.length)fail('SDK_ASSET_SIGNATURE',{file});
 let byteRate=null,blockAlign=null,dataBytes=0;
 for(let offset=12;offset+8<=buffer.length;){
  const kind=ascii(buffer,offset,offset+4),length=readUint(buffer,offset+4,4,true,file),start=offset+8;
  if(start+length>buffer.length)fail('SDK_ASSET_SIGNATURE',{file});
  if(kind==='fmt '){
   if(length<16||byteRate!==null)fail('SDK_ASSET_SIGNATURE',{file});
   const format=readUint(buffer,start,2,true,file),channels=readUint(buffer,start+2,2,true,file),rate=readUint(buffer,start+4,4,true,file),bits=readUint(buffer,start+14,2,true,file);byteRate=readUint(buffer,start+8,4,true,file);blockAlign=readUint(buffer,start+12,2,true,file);
   if(![1,3].includes(format)||!channels||channels>8||!rate||!bits||bits%8||!blockAlign||blockAlign!==channels*bits/8||byteRate!==rate*blockAlign)fail('SDK_ASSET_SIGNATURE',{file});
  }else if(kind==='data'){if(byteRate===null)fail('SDK_ASSET_SIGNATURE',{file});dataBytes+=length;}
  offset=start+length+(length%2);
 }
 if(!byteRate||!dataBytes||dataBytes%blockAlign)fail('SDK_ASSET_SIGNATURE',{file});
 const seconds=dataBytes/byteRate;if(seconds>BUDGET.audioSeconds)fail('SDK_AUDIO_DURATION_LIMIT',{file,seconds,maxSeconds:BUDGET.audioSeconds});return seconds;
}
function svg(buffer,file){
 const allowed=new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern filter feGaussianBlur feOffset feMerge feMergeNode feColorMatrix feComposite feBlend feMorphology feFlood'.split(' '));
 const parser=new SaxesParser({xmlns:true});let root=false,nodes=0;
 parser.on('doctype',()=>fail('SDK_SVG_ACTIVE',{file}));
 parser.on('processinginstruction',()=>fail('SDK_SVG_ACTIVE',{file}));
 parser.on('opentag',tag=>{
  if(++nodes>BUDGET.svgNodes)fail('SDK_SVG_LIMIT',{file});
  if(!root){if(tag.local!=='svg'||tag.uri!=='http://www.w3.org/2000/svg')fail('SDK_SVG_INVALID',{file});root=true;}
  if(!allowed.has(tag.local)||tag.uri!=='http://www.w3.org/2000/svg')fail('SDK_SVG_ACTIVE',{file});
  for(const attr of Object.values(tag.attributes)){
   if(attr.prefix==='xmlns'||attr.name==='xmlns')continue;
   if(/^on/i.test(attr.local)||attr.local==='style'||attr.local==='base'&&attr.uri==='http://www.w3.org/XML/1998/namespace'||(!['','http://www.w3.org/1999/xlink','http://www.w3.org/XML/1998/namespace'].includes(attr.uri)))fail('SDK_SVG_ACTIVE',{file});
   if(attr.value.includes('\\'))fail('SDK_ASSET_EXTERNAL',{file});
   if(attr.local==='href'&&!/^#[A-Za-z_][\w.-]*$/.test(attr.value))fail('SDK_ASSET_EXTERNAL',{file});
   if(/(?:url\s*\(|https?:|data:|javascript:|@import)/i.test(attr.value)&&!/^url\(#[A-Za-z_][\w.-]*\)$/.test(attr.value))fail('SDK_ASSET_EXTERNAL',{file});
  }
 });
 parser.on('error',()=>fail('SDK_SVG_INVALID',{file}));parser.write(utf8(buffer,file)).close();if(!root)fail('SDK_SVG_INVALID',{file});
}
function validateAsset(buffer,file){
 const ext=extension(file).toLowerCase(),maxBytes=fileLimit(file);if(buffer.length>maxBytes)fail('SDK_ASSET_SIZE_LIMIT',{file,bytes:buffer.length,maxBytes});
 let pixels=null,durationSeconds=null;const warnings=[];
 if(ext==='.svg')svg(buffer,file);
 else if(ext==='.png'){
  if(buffer.length<24||hex(buffer.subarray(0,8))!=='89504e470d0a1a0a'||ascii(buffer,12,16)!=='IHDR')fail('SDK_ASSET_SIGNATURE',{file});
  const width=readUint(buffer,16,4,false,file),height=readUint(buffer,20,4,false,file);if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide||width*height>BUDGET.imagePixels)fail('SDK_IMAGE_LIMIT',{file});pixels=width*height;
 }else if(ext==='.jpg'||ext==='.jpeg'){
  if(buffer.length<4||buffer[0]!==255||buffer[1]!==216||buffer[2]!==255)fail('SDK_ASSET_SIGNATURE',{file});
  let offset=2;while(offset+4<=buffer.length){if(buffer[offset++]!==255)fail('SDK_ASSET_SIGNATURE',{file});while(buffer[offset]===255)offset++;const marker=buffer[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=readUint(buffer,offset,2,false,file);if(length<2||offset+length>buffer.length)fail('SDK_ASSET_SIGNATURE',{file});if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)fail('SDK_ASSET_SIGNATURE',{file});const height=readUint(buffer,offset+3,2,false,file),width=readUint(buffer,offset+5,2,false,file);pixels=width*height;if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide)fail('SDK_IMAGE_LIMIT',{file});break;}offset+=length;}
  if(pixels===null)fail('SDK_ASSET_SIGNATURE',{file});
 }
 else if(ext==='.webp'){
  if(buffer.length<30||ascii(buffer,0,4)!=='RIFF'||ascii(buffer,8,12)!=='WEBP')fail('SDK_ASSET_SIGNATURE',{file});
  const chunk=ascii(buffer,12,16);let width,height;
  if(chunk==='VP8X'){width=1+readUint(buffer,24,3,true,file);height=1+readUint(buffer,27,3,true,file);}
  else if(chunk==='VP8L'&&buffer[20]===47){const bits=readUint(buffer,21,4,true,file);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  else if(chunk==='VP8 '&&hex(buffer.subarray(23,26))==='9d012a'){width=readUint(buffer,26,2,true,file)&16383;height=readUint(buffer,28,2,true,file)&16383;}
  else fail('SDK_ASSET_SIGNATURE',{file});
  if(!width||!height||width>BUDGET.imageSide||height>BUDGET.imageSide)fail('SDK_IMAGE_LIMIT',{file});pixels=width*height;
 }
 else if(ext==='.wav')durationSeconds=wavDuration(buffer,file);
 else if(ext==='.ogg'){if(ascii(buffer,0,4)!=='OggS')fail('SDK_ASSET_SIGNATURE',{file});}
 else if(ext==='.mp3'){if(ascii(buffer,0,3)!=='ID3'&&!(buffer[0]===255&&(buffer[1]&224)===224))fail('SDK_ASSET_SIGNATURE',{file});}
 else {let value;try{value=JSON.parse(utf8(buffer,file));}catch{fail('SDK_ASSET_JSON',{file});}if(value?.contractVersion!==1||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>1000||value.frames.some((frame,index)=>!frame||typeof frame!=='object'||Array.isArray(frame)||!Number.isFinite(frame.time)||frame.time<0||frame.time>BUDGET.animationMs||index>0&&frame.time<value.frames[index-1].time||!frame.values||typeof frame.values!=='object'||Array.isArray(frame.values)||Object.entries(frame.values).some(([key,n])=>!['x','y','rotation','scale','opacity'].includes(key)||!Number.isFinite(n)||Math.abs(n)>10000||key==='opacity'&&(n<0||n>1)||key==='scale'&&(n<0||n>20))))fail('SDK_ANIMATION_INVALID',{file});}
 if(pixels!==null&&pixels>BUDGET.imagePixels)fail('SDK_IMAGE_LIMIT',{file});
 if(pixels!==null&&buffer.length>BUDGET.imageTargetBytes)warnings.push({code:'SDK_ASSET_TARGET_EXCEEDED',file,bytes:buffer.length,targetBytes:BUDGET.imageTargetBytes});
 if(MIME[ext].startsWith('audio/')&&durationSeconds===null)warnings.push({code:'SDK_AUDIO_DURATION_UNVERIFIED',file,hint:'Encoded size/signature checked; OGG/MP3 duration must be checked by browser metadata in the studio.'});
 return {mime:MIME[ext],bytes:buffer.length,maxBytes,decodedImageBytes:pixels===null?null:pixels*4,durationSeconds,warnings,sha256:sha256(buffer)};
}

function validateMedia(rows){
 if(!Array.isArray(rows))fail('SDK_ASSET_ROWS_INVALID');
 if(rows.length>BUDGET.files)fail('SDK_ASSET_COUNT',{maxFiles:BUDGET.files});
 let bytes=0,decodedImageBytes=0;const names=new Set(),files=[];
 for(const row of rows){
  const file=row?.file;
  if(!row||typeof row!=='object'||typeof file!=='string'||!/^assets\/[A-Za-z0-9_./-]+$/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..')||names.has(file))fail('SDK_ASSET_PATH');names.add(file);
  const maxBytes=fileLimit(file);
  if(typeof row.data!=='string'||row.encoding!==undefined&&row.encoding!=='base64'||row.data.length%4||/[^A-Za-z0-9+/=]/.test(row.data))fail('SDK_ASSET_ENCODING',{file});
  const length=row.data.length/4*3-(row.data.endsWith('==')?2:row.data.endsWith('=')?1:0);
  if(length>maxBytes)fail('SDK_ASSET_SIZE_LIMIT',{file,bytes:length,maxBytes});bytes+=length;if(bytes>BUDGET.assetBytes)fail('SDK_ASSET_TOTAL_LIMIT',{bytes,maxBytes:BUDGET.assetBytes});
  let binary;try{binary=atob(row.data);if(btoa(binary)!==row.data)fail('SDK_ASSET_ENCODING',{file});}catch{fail('SDK_ASSET_ENCODING',{file});}
  const report=validateAsset(Uint8Array.from(binary,c=>c.charCodeAt(0)),file);
  if(row.mime!==report.mime)fail('SDK_ASSET_MIME',{file});if(typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||row.sha256!==report.sha256||row.bytes!==undefined&&row.bytes!==report.bytes)fail('SDK_ASSET_CHANGED',{file});
  decodedImageBytes+=report.decodedImageBytes||0;if(decodedImageBytes>BUDGET.decodedImageBytes)fail('SDK_DECODED_IMAGE_LIMIT',{decodedImageBytes,maxBytes:BUDGET.decodedImageBytes});files.push({file,...report});
 }
 return {files,bytes,decodedImageBytes};
}
return Object.freeze({MIME,fileLimit,validateAsset,validateMedia});
}
module.exports={createMediaValidator,sha256};

'use strict';
const crypto=require('node:crypto');
const {BUDGET}=require('../sdk/budget.cjs');
function row(file,buffer,mime){return {file,mime,data:buffer.toString('base64'),bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};}
const svg=text=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'+(text||'<circle cx="5" cy="5" r="4"/>')+'</svg>');
function png(width=1,height=1,size=24){const b=Buffer.alloc(size);b.write('89504e470d0a1a0a',0,'hex');b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;}
function webp(width=1,height=1){const b=Buffer.alloc(30);b.write('RIFF',0);b.writeUInt32LE(22,4);b.write('WEBPVP8X',8);b.writeUIntLE(width-1,24,3);b.writeUIntLE(height-1,27,3);return b;}
function jpeg(width=1,height=1){const b=Buffer.from([255,216,255,192,0,8,8,0,0,0,0,1,255,217]);b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return b;}
function wav(seconds){const b=Buffer.alloc(44+8000*seconds);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
const base=()=>row('assets/valid.svg',svg(),'image/svg+xml');
function cases(){return [
 ['count',Array.from({length:BUDGET.files+1},(_,i)=>({...base(),file:'assets/tiny-'+i+'.svg'})),'SDK_ASSET_COUNT'],
 ['aggregate',[...Array.from({length:4},(_,i)=>row('assets/p'+i+'.png',png(1,1,500000),'image/png')),row('assets/over.png',png(),'image/png')],'SDK_ASSET_TOTAL_LIMIT'],
 ['decoded',Array.from({length:3},(_,i)=>row('assets/large'+i+'.png',png(2000,2000),'image/png')),'SDK_DECODED_IMAGE_LIMIT'],
 ['png-side',[row('assets/large.png',png(2049,1),'image/png')],'SDK_IMAGE_LIMIT'],
 ['png-pixels',[row('assets/large.png',png(2001,2000),'image/png')],'SDK_IMAGE_LIMIT'],
 ['jpeg-side',[row('assets/large.jpg',jpeg(2049,1),'image/jpeg')],'SDK_IMAGE_LIMIT'],
 ['webp-side',[row('assets/large.webp',webp(2049,1),'image/webp')],'SDK_IMAGE_LIMIT'],
 ['signature',[row('assets/fake.png',Buffer.alloc(24),'image/png')],'SDK_ASSET_SIGNATURE'],
 ['sha',[{...base(),sha256:'0'.repeat(64)}],'SDK_ASSET_CHANGED'],
 ['bytes',[{...base(),bytes:1}],'SDK_ASSET_CHANGED'],
 ['mime',[{...base(),mime:'image/png'}],'SDK_ASSET_MIME'],
 ['base64-whitespace',[{...base(),data:base().data+'\n'}],'SDK_ASSET_ENCODING'],
 ['base64-pad-bits',[{...row('assets/cue.ogg',Buffer.from('OggS'),'audio/ogg'),data:'T2dnUx=='}],'SDK_ASSET_ENCODING'],
 ['encoding',[{...base(),encoding:'utf8'}],'SDK_ASSET_ENCODING'],
 ['duplicate',[base(),base()],'SDK_ASSET_PATH'],
 ['path',[{...base(),file:'assets/../escape.svg'}],'SDK_ASSET_PATH'],
 ['format',[row('assets/unsupported.gif',Buffer.from('GIF89a'),'image/gif')],'SDK_ASSET_FORMAT'],
 ['active-svg',[row('assets/active.svg',svg('<script>alert(1)</script>'),'image/svg+xml')],'SDK_SVG_ACTIVE'],
 ['external-svg',[row('assets/external.svg',svg('<use href="https://should-never-fetch.invalid/x"/>'),'image/svg+xml')],'SDK_ASSET_EXTERNAL'],
 ['escaped-paint',[row('assets/paint.svg',svg('<path fill="u\\72l(//should-never-fetch.invalid/x)"/>'),'image/svg+xml')],'SDK_ASSET_EXTERNAL'],
 ['xml-base',[row('assets/base.svg',svg('<g xml:base="//should-never-fetch.invalid"><use href="#x"/></g>'),'image/svg+xml')],'SDK_SVG_ACTIVE'],
 ['svg-nodes',[row('assets/nodes.svg',svg('<path/>'.repeat(2000)),'image/svg+xml')],'SDK_SVG_LIMIT'],
 ['svg-bytes',[row('assets/oversize.svg',Buffer.alloc(64001),'image/svg+xml')],'SDK_ASSET_SIZE_LIMIT'],
 ['duration',[row('assets/long.wav',wav(11),'audio/wav')],'SDK_AUDIO_DURATION_LIMIT'],
 ['animation',[row('assets/motion.json',Buffer.from('{"contractVersion":1,"frames":[{"time":0,"values":null}]}'),'application/json')],'SDK_ANIMATION_INVALID']
 ];}
function valid(){return [base(),row('assets/a.png',png(),'image/png'),row('assets/a.jpg',jpeg(),'image/jpeg'),row('assets/a.webp',webp(),'image/webp'),row('assets/cue.wav',wav(1),'audio/wav'),row('assets/cue.ogg',Buffer.from('OggS'),'audio/ogg'),row('assets/cue.mp3',Buffer.from('ID3'),'audio/mpeg'),row('assets/motion.json',Buffer.from('{"contractVersion":1,"frames":[{"time":0,"values":{"opacity":1}}]}'),'application/json')];}
function bundle(assets){const manifest={id:'media-boundary',version:'1.0.0',name:'Media boundary',engineApi:4,viewApi:3,stateVersion:1,execution:'isolated-v1',sdkFeatures:['isolated-execution-v1']};return {format:'playroom-pack',formatVersion:1,manifest,files:{'rules.js':'void 0;','view.js':'void 0;','styles.css':'/* inert */','sdk/source.json':JSON.stringify({format:'playroom-sdk-source',contractVersion:1,manifest,sources:{dependencies:[],rules:[],helpers:[],presentation:[]},assets,resourceClosure:{budget:{assetBytes:0,assetCount:0}}})}};}
module.exports={row,base,cases,valid,bundle,png};

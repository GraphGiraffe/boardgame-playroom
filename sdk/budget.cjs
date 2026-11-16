'use strict';
// Artifact bytes use decimal kB/MB; VM and decoded-memory limits remain separate.
const BUDGET=Object.freeze({targetBytes:500_000,packBytes:require('../core/packs.js').MAX_BYTES,assetBytes:2_000_000,files:256,imageBytes:512_000,imageTargetBytes:128_000,svgBytes:64_000,audioBytes:128_000,animationBytes:64_000,imageSide:2048,imagePixels:4_000_000,decodedImageBytes:32*1024*1024,svgNodes:2000,audioSeconds:10,animationMs:10_000});
function measure(text){
 const bytes=Buffer.byteLength(text,'utf8');
 return {bytes,targetBytes:BUDGET.targetBytes,maxBytes:BUDGET.packBytes,unit:'UTF-8 bytes before transport compression',warnings:bytes>BUDGET.targetBytes?[{code:'SDK_PACK_TARGET_EXCEEDED',bytes,targetBytes:BUDGET.targetBytes,hint:'Review large modules and assets; the 500 kB target is a warning, not a minimum size.'}]:[]};
}
module.exports={BUDGET,measure};

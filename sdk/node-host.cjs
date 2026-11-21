'use strict';
const {newQuickJSWASMModule,newVariant,RELEASE_SYNC}=require('quickjs-emscripten');
const {createVMHost,DEFAULT_LIMITS}=require('./vm-host.js');
const {trustedSources}=require('./trusted-sources.cjs');
const {parseSnapshot,ownsSnapshot}=require('../core/model-values.js');
async function createNodeHost(){
 const variant=newVariant(RELEASE_SYNC,{wasmMemory:new WebAssembly.Memory({initial:256,maximum:DEFAULT_LIMITS.memoryBytes/65536})});
 const QuickJS=await newQuickJSWASMModule(variant);
 return {...createVMHost({QuickJS,coreSources:trustedSources(),readPresentation:parseSnapshot,ownsSnapshot}),validateMedia:require('./assets.cjs').validateMedia};
}
module.exports={createNodeHost};

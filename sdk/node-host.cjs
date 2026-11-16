'use strict';
const fs=require('node:fs'),path=require('node:path');
const {newQuickJSWASMModule,newVariant,RELEASE_SYNC}=require('quickjs-emscripten');
const {createVMHost,DEFAULT_LIMITS}=require('./vm-host.js');
async function createNodeHost(){
 const variant=newVariant(RELEASE_SYNC,{wasmMemory:new WebAssembly.Memory({initial:256,maximum:DEFAULT_LIMITS.memoryBytes/65536})});
 const QuickJS=await newQuickJSWASMModule(variant),coreSources=['model-values','events','random','bot-difficulty','model-inputs','model-runtime'].map(name=>({file:'sdk/core/'+name+'.js',source:fs.readFileSync(path.join(__dirname,'../core',name+'.js'),'utf8')}));
 coreSources.push({file:'sdk/support.js',source:fs.readFileSync(path.join(__dirname,'sdk-support.js'),'utf8')});
 return createVMHost({QuickJS,coreSources});
}
module.exports={createNodeHost};

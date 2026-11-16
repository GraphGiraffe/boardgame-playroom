'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const {newQuickJSWASMModule,newVariant,RELEASE_SYNC}=require('quickjs-emscripten');
const {LIMITS}=require('./project.cjs');
const {createVMHost}=require('./vm-host.js');
const core=['model-values','events','random','bot-difficulty','model-inputs','model-runtime'];
(async()=>{
 const variant=newVariant(RELEASE_SYNC,{wasmMemory:new WebAssembly.Memory({initial:256,maximum:LIMITS.memoryBytes/65536})});
 const QuickJS=await newQuickJSWASMModule(variant);
 const coreSources=core.map(name=>({file:'sdk/core/'+name+'.js',source:fs.readFileSync(path.join(__dirname,'../core',name+'.js'),'utf8')}));
 const host=createVMHost({QuickJS,coreSources,limits:LIMITS});
 const realm=host.createRealm(workerData.project,workerData.role);
 parentPort.postMessage({ready:true});
 parentPort.on('message',({id,method,args})=>{
  try{parentPort.postMessage({id,value:realm.call(method,args)});}
  catch(error){parentPort.postMessage({id,error:error.diagnostic||{code:'SDK_EXECUTION_FAILED',phase:method,role:workerData.role,frames:[]}});}
 });
})().catch(error=>{parentPort.postMessage({error:error.diagnostic||{code:'SDK_EXECUTION_FAILED',phase:'load',role:workerData.role,frames:[]}});process.exitCode=1;});

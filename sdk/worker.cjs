'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {newQuickJSWASMModule,newVariant,RELEASE_SYNC}=require('quickjs-emscripten');
const {LIMITS}=require('./project.cjs');
const {createVMHost}=require('./vm-host.js');
const {trustedSources}=require('./trusted-sources.cjs');
const {parseSnapshot,ownsSnapshot}=require('../core/model-values.js');
(async()=>{
 const variant=newVariant(RELEASE_SYNC,{wasmMemory:new WebAssembly.Memory({initial:256,maximum:LIMITS.memoryBytes/65536})});
 const QuickJS=await newQuickJSWASMModule(variant);
 const trace=workerData.observeAssetMethods?require('./asset-method-trace.cjs').traceAssetMethods():null;
 const host=createVMHost({QuickJS,coreSources:trustedSources(),limits:LIMITS,observePresentationModule:trace?.loaded,readPresentation:parseSnapshot,ownsSnapshot});
 const project=workerData.project;
 host.cacheProjectRegistration(project);
 const realm=host.createRealm(project,workerData.role);
 let metadata,presentEvent;
 parentPort.postMessage({ready:true});
 parentPort.on('message',({id,method,args})=>{
  try{
   let value;
   if(method==='formatEvents'&&workerData.role==='presentation'){
    metadata??=realm.call('metadata','[]');
    presentEvent??=host.createEventPresenter(project,JSON.parse(metadata).eventInputs==='facts',trace);
    value=JSON.stringify(host.formatEvents(presentEvent,JSON.parse(args)[0]));
   }else if(method==='metadata'&&workerData.role==='presentation')value=metadata??=realm.call(method,args);
   else value=realm.call(method,args);
   parentPort.postMessage({id,value,...(trace?{assetTrace:trace.take()}:{})});
  }
  catch(error){trace?.take();parentPort.postMessage({id,error:error.diagnostic||{code:'SDK_EXECUTION_FAILED',phase:method,role:workerData.role,frames:[]}});}
 });
})().catch(error=>{parentPort.postMessage({error:error.diagnostic||{code:'SDK_EXECUTION_FAILED',phase:'load',role:workerData.role,frames:[]}});process.exitCode=1;});

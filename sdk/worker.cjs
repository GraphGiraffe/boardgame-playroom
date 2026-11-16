'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const {newQuickJSWASMModule,newVariant,RELEASE_SYNC}=require('quickjs-emscripten');
const {parse}=require('acorn');
const {LIMITS}=require('./project.cjs');
const core=['model-values','events','random','bot-difficulty','model-runtime'];
function browserSource(source){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'script'}),pending=[tree],ranges=[];let count=0;
 while(pending.length){const node=pending.pop();if(++count>250000)throw {code:'SDK_SOURCE_COMPLEXITY'};
  if(node.type==='UnaryExpression'&&node.operator==='typeof'&&node.argument.type==='Identifier'&&['module','require'].includes(node.argument.name))ranges.push([node.start,node.end]);
  if((node.type==='VariableDeclarator'&&['module','require'].includes(node.id?.name))||(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)&&node.params.some(p=>['module','require'].includes(p.name))))throw {code:'SDK_RESERVED_BINDING'};
  for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)if(child?.type)pending.push(child);}else if(value?.type)pending.push(value);
 }
 for(const [start,end]of ranges.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+'"undefined"'.padEnd(end-start,' ')+source.slice(end);
 return source;
}
let vm,runtime,dispatch,deadline=0,violations=[];
function evaluate(source,file){
 const result=vm.evalCode(source,file);
 if(result.error){const error=vm.dump(result.error);result.error.dispose();throw error;}
 return result.value;
}
function diagnostic(error,phase){
 const code=/^[A-Z][A-Z0-9_]{1,79}$/.test(error?.code||error?.message||'')?(error.code||error.message):'SDK_EXECUTION_FAILED';
 // Guest messages and values may contain private game state. Keep locations only.
 const frames=String(error?.stack||'').split('\n').map(line=>line.match(/(?:at\s+.*?\s+)?\(?((?:domain|presentation|shared|rules|sdk)[A-Za-z0-9_./-]*\.js):(\d+)(?::(\d+))?\)?/)).filter(Boolean).slice(0,12).map(m=>({file:m[1],line:Number(m[2]),column:Number(m[3]||0)}));
 return {code,phase,role:workerData.role,frames,...(typeof error.resource==='string'?{resource:error.resource.slice(0,96)}:{}),hint:code==='SDK_ACCESS_DENIED'?'Use the documented SDK capability; rendering receives only the viewer projection.':code==='SDK_TIME_LIMIT'?'Reduce work per call; loops and recursive operations are bounded.':'Inspect the contract and replay this scenario locally.'};
}
(async()=>{
 // Bound linear WASM memory as well as QuickJS allocations. Node worker heap
 // limits alone do not cover WebAssembly's external memory.
 const variant=newVariant(RELEASE_SYNC,{wasmMemory:new WebAssembly.Memory({initial:256,maximum:LIMITS.memoryBytes/65536})});
 const QuickJS=await newQuickJSWASMModule(variant);runtime=QuickJS.newRuntime();runtime.setMemoryLimit(LIMITS.memoryBytes-16*1024*1024);runtime.setMaxStackSize(512*1024);runtime.setInterruptHandler(()=>Date.now()>deadline);vm=runtime.newContext();deadline=Date.now()+LIMITS.callMs;
 const report=vm.newFunction('reportDenied',(resource,stack)=>{if(violations.length<100)violations.push({resource:vm.getString(resource).slice(0,96),stack:vm.getString(stack).slice(0,4000)});});
 vm.setProp(vm.global,'__reportDenied',report);report.dispose();
 evaluate(`(()=>{
  const report=globalThis.__reportDenied,NativeError=Error,own=Object.hasOwn,string=String;delete globalThis.__reportDenied;
  const deny=resource=>{const error=new NativeError('SDK_ACCESS_DENIED');error.code='SDK_ACCESS_DENIED';report(resource,error.stack);throw error;};
  for(const key of ['process','require','module','exports','fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','window','document','navigator','location','localStorage','sessionStorage','indexedDB','caches','Worker','SharedWorker','importScripts','setTimeout','setInterval','Date','performance'])Object.defineProperty(globalThis,key,{get:()=>deny(key),configurable:false});
  Object.defineProperty(Math,'random',{value:()=>deny('Math.random'),writable:false,configurable:false});
  const sdk=Object.freeze({read(value,key){if(value===null||typeof value!=='object'||!own(value,key))return deny('field:'+string(key).slice(0,80));return value[key];},resource(id){if(typeof id!=='string'||!/^assets\\/[a-zA-Z0-9_./-]+$/.test(id)||id.split('/').includes('..'))return deny('asset:path');return {kind:'asset',id};}});
  Object.defineProperty(globalThis,'SDK',{value:sdk,writable:false});
 })();`,'sdk/access.js').dispose();
 // UMD core modules test typeof module/require. Their absence is safe; hard
 // denying those getters would also reject this trusted bootstrap. Use trusted
 // browser branches by removing just the UMD checks, not by exposing Node.
 // The core is read from this checkout only, never selected by the pack.
 for(const name of core){const source=fs.readFileSync(path.join(__dirname,'../core',name+'.js'),'utf8');evaluate(browserSource(source),'sdk/core/'+name+'.js').dispose();}
 evaluate(`(()=>{function freeze(o,seen=new Set()){if(!o||!['object','function'].includes(typeof o)||seen.has(o))return;seen.add(o);for(const key of Object.keys(o))freeze(o[key],seen);Object.freeze(o);}for(const key of ['PlayroomModelValues','PlayroomEvents','PlayroomRandom','PlayroomBotDifficulty','PlayroomModelRuntime']){freeze(globalThis[key]);Object.defineProperty(globalThis,key,{writable:false,configurable:false});}})();`,'sdk/freeze.js').dispose();
 const p=workerData.project;
 // Pack UMD modules get the browser branch. Access to Node remains forbidden.
 const guestSource=browserSource;
 if(workerData.role==='rules'){
  evaluate(`globalThis.PlayroomPackResources={locales:{}};globalThis.PlayroomPackPresentation=Object.freeze({});globalThis.PlayroomMessages=Object.freeze({text:key=>key});globalThis.PlayroomPack=Object.freeze({...${JSON.stringify(p.manifest)},sdkFeatures:['local-input-v1','turn-order-v1','player-status-v1'],adaptModel:spec=>{globalThis.__definition=spec.definition;return spec;}});globalThis.TabletopCore=Object.freeze({...PlayroomRandom,register:()=>{},registerModel:spec=>{globalThis.__definition=spec.definition;}});`,'sdk/registration.js').dispose();
  for(const f of [...p.dependencies,...p.rules])evaluate(guestSource(f.source),f.file).dispose();
  dispatch=evaluate(`(()=>{const model=new PlayroomModelRuntime.GameModel(globalThis.__definition||globalThis.PlayroomPackDefinition);const allowed=new Set(['start','validate','apply','project','projectTable','botAction','result','legalActions','availableActions']);return (method,args)=>{if(!allowed.has(method))throw Error('SDK_METHOD_DENIED');const result=model[method](...JSON.parse(args));return JSON.stringify(result===undefined?null:result);};})()`,'sdk/rules.js');
 }else{
  // A separate VM has no rules modules, model instance, position or journal.
  for(const f of [...p.dependencies,...p.helpers,...p.presentation])evaluate(guestSource(f.source),f.file).dispose();
  dispatch=evaluate(`(()=>{const p=PlayroomPackPresentation;return (method,args)=>{const values=JSON.parse(args);if(method==='metadata')return JSON.stringify(p.metadata||{});if(method!=='render')throw Error('SDK_METHOD_DENIED');const projection=values[0];const value={scene:p.scene(projection),actions:projection.actions.map(command=>({command,label:p.action?p.action({...p.choice?.(command,projection),...command},projection):command.type})),events:projection.events.map(event=>{const presented=p.event?p.event(event):{message:event.type};return presented.message?.key?{...presented,message:{...presented.message,params:{player:{kind:'player-reference',index:event.actor},...presented.message.params}}}:presented;})};const omitted=[];const encoded=JSON.stringify(value,(key,item)=>{if(item===undefined)omitted.push(key);if(typeof item==='function'||typeof item==='symbol'||typeof item==='bigint'||typeof item==='number'&&!Number.isFinite(item)){const error=Error('SDK_OUTPUT_INVALID');error.resource='field:'+key;throw error;}return item;});const result=JSON.parse(encoded);PlayroomModelValues.json(result);if(omitted.length)result.diagnostics=[{code:'SDK_OPTIONAL_FIELD_OMITTED',fields:[...new Set(omitted)].slice(0,32),hint:'Optional undefined properties were omitted at the JSON boundary; use explicit null where a value is required.'}];return JSON.stringify(result);};})()`,'sdk/presentation.js');
 }
 if(violations.length)throw {code:'SDK_ACCESS_DENIED',...violations[0]};
 parentPort.postMessage({ready:true});
 parentPort.on('message',({id,method,args})=>{
  violations=[];deadline=Date.now()+LIMITS.callMs;
  let methodHandle,argsHandle,result;
  try{
   methodHandle=vm.newString(method);argsHandle=vm.newString(args);result=vm.callFunction(dispatch,vm.undefined,methodHandle,argsHandle);
   if(result.error){const error=vm.dump(result.error);if(Date.now()>deadline)error.code='SDK_TIME_LIMIT';throw error;}
   const value=vm.getString(result.value);if(violations.length)throw {code:'SDK_ACCESS_DENIED',...violations[0]};
   if(Buffer.byteLength(value)>LIMITS.messageBytes)throw {code:'SDK_OUTPUT_LIMIT'};
   parentPort.postMessage({id,value});
  }catch(error){parentPort.postMessage({id,error:diagnostic(error,method)});}
  finally{result?.error?.dispose();result?.value?.dispose();methodHandle?.dispose();argsHandle?.dispose();}
 });
})().catch(error=>{parentPort.postMessage({error:diagnostic(error,'load')});process.exitCode=1;});

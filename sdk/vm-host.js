'use strict';
// Trusted portable QuickJS host. Pack text is evaluated only by QuickJS.
const {parse}=require('acorn');
const DEFAULT_LIMITS=Object.freeze({memoryBytes:64*1024*1024,callMs:2000,messageBytes:4*1024*1024,sourceBytes:12*1024*1024,fileBytes:4*1024*1024});
function browserSource(source){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'script'}),pending=[tree],ranges=[];let count=0;
 while(pending.length){const node=pending.pop();if(++count>250000)throw {code:'SDK_SOURCE_COMPLEXITY'};
  if(node.type==='UnaryExpression'&&node.operator==='typeof'&&node.argument.type==='Identifier'&&['module','require'].includes(node.argument.name))ranges.push([node.start,node.end]);
  if((node.type==='VariableDeclarator'&&['module','require'].includes(node.id?.name))||(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)&&node.params.some(p=>['module','require'].includes(p.name))))throw {code:'SDK_RESERVED_BINDING'};
  for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)if(child?.type)pending.push(child);}else if(value?.type)pending.push(value);
 }
 for(const [start,end]of ranges.sort((a,b)=>b[0]-a[0])){const lines=(source.slice(start,end).match(/\n/g)||[]).length;source=source.slice(0,start)+('"undefined"'+'\n'.repeat(lines)).padEnd(end-start,' ')+source.slice(end);}
 return source;
}

function createVMHost({QuickJS,coreSources,limits=DEFAULT_LIMITS}){
 const LIMITS={...DEFAULT_LIMITS,...limits},encoder=new TextEncoder();
 function encode(value){
  const seen=new Set();
  function visit(item,depth=0){
   const fail=code=>{throw Object.assign(Error(code),{code});};
   if(depth>80)fail('SDK_DATA_DEPTH');
   if(item===null||typeof item==='string'||typeof item==='boolean')return;
   if(typeof item==='number'&&Number.isFinite(item))return;
   if(!item||typeof item!=='object'||seen.has(item)||(!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item))))fail('SDK_JSON_INVALID');
   seen.add(item);for(const [key,child] of Object.entries(item)){if(['__proto__','constructor','prototype'].includes(key))fail('SDK_DATA_KEY_DENIED');visit(child,depth+1);}seen.delete(item);
  }
  visit(value);const encoded=JSON.stringify(value);if(encoder.encode(encoded).byteLength>LIMITS.messageBytes)throw Object.assign(Error('SDK_MESSAGE_LIMIT'),{code:'SDK_MESSAGE_LIMIT'});return encoded;
 }

 function createRealm(project,role){
  if(!['rules','presentation','bot'].includes(role))throw Object.assign(Error('SDK_METHOD_DENIED'),{code:'SDK_METHOD_DENIED'});
  let vm,runtime,dispatch,deadline=Date.now()+LIMITS.callMs,violations=[],closed=false;
  const frameFiles=new Map();
const deniedGlobals=['process','require','module','exports','fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','window','document','navigator','location','localStorage','sessionStorage','indexedDB','caches','Worker','SharedWorker','importScripts','setTimeout','setInterval','Date','performance'];
const safeResources=new Set([...deniedGlobals,'Math.random','field:required','asset:path']);
const safeCodes=new Set(['SDK_ACCESS_DENIED','SDK_TIME_LIMIT','SDK_OUTPUT_LIMIT','SDK_METHOD_DENIED','SDK_SOURCE_COMPLEXITY','SDK_RESERVED_BINDING','SDK_OUTPUT_INVALID','SDK_MODEL_ID_MISMATCH','SDK_VOTE_COUNT_INVALID']);
function evaluate(source,file,original=source){
 const lines=source.split('\n'),originalLines=original.split('\n');
 frameFiles.set(file,{lines:originalLines.length,columns:lines.every((line,index)=>line.length===originalLines[index]?.length),lengths:originalLines.map(line=>line.length+1)});
 const result=vm.evalCode(source,file,{type:'global',strict:true});
 if(result.error){const error=vm.dump(result.error);result.error.dispose();throw error;}
 return result.value;
}
function diagnostic(error,phase,violation=null){
 const requested=error?.code||error?.message,code=violation?'SDK_ACCESS_DENIED':safeCodes.has(requested)?requested:'SDK_EXECUTION_FAILED';
 // Guest messages and values may contain private game state. Keep locations only.
 const stack=typeof error?.stack==='string'?error.stack.slice(0,4000):'';
 const frames=stack.split('\n').map(line=>line.match(/(?:at\s+.*?\s+)?\(?((?:domain|presentation|shared|rules|sdk)[A-Za-z0-9_./-]*\.js):(\d+)(?::(\d+))?\)?/)).filter(m=>m&&frameFiles.has(m[1])&&Number(m[2])>0&&Number(m[2])<=frameFiles.get(m[1]).lines).slice(0,12).map(m=>({file:m[1],line:Number(m[2]),column:frameFiles.get(m[1]).columns&&Number(m[3])<=frameFiles.get(m[1]).lengths[Number(m[2])-1]?Number(m[3]||0):0}));
 return {code,phase,role,frames,...(violation?{resource:safeResources.has(violation.resource)?violation.resource:'capability'}:{}),hint:requested==='ROUND_NOT_DECLARED'?'Declare rounds:true when returning roundEnded.':requested==='TRANSITION_INVALID'?'Return a valid position; roundEnded requires turnEnded:true and both flags must be booleans.':requested==='EVENT_INVALID'?'Events require actor:null or a player index, JSON params and an explicit visibility policy.':code==='SDK_ACCESS_DENIED'?'Use the documented SDK capability; rendering receives only the viewer projection.':code==='SDK_TIME_LIMIT'?'Reduce work per call; loops and recursive operations are bounded.':'Inspect the contract and replay this scenario locally.'};
}

  function close(){if(closed)return;closed=true;dispatch?.dispose();vm?.dispose();runtime?.dispose();}
  function failure(error,phase){const detail=diagnostic(error,phase,violations[0]);return Object.assign(new Error(detail.code),{code:detail.code,diagnostic:detail});}
  function call(method,args){
   if(closed)throw failure({code:'SDK_WORKER_CLOSED'},method);
   if(typeof args!=='string'||encoder.encode(args).byteLength>LIMITS.messageBytes)throw failure({code:'SDK_OUTPUT_LIMIT'},method);
   violations=[];deadline=Date.now()+LIMITS.callMs;
   let methodHandle,argsHandle,result;
   try{methodHandle=vm.newString(method);argsHandle=vm.newString(args);result=vm.callFunction(dispatch,vm.undefined,methodHandle,argsHandle);
    if(result.error){const error=vm.dump(result.error);if(Date.now()>=deadline)error.code='SDK_TIME_LIMIT';throw error;}
    const value=vm.getString(result.value);if(violations.length)throw {code:'SDK_ACCESS_DENIED',...violations[0]};
    if(encoder.encode(value).byteLength>LIMITS.messageBytes)throw {code:'SDK_OUTPUT_LIMIT'};return value;
   }catch(error){throw failure(error,method);}
   finally{result?.error?.dispose();result?.value?.dispose();methodHandle?.dispose();argsHandle?.dispose();}
  }
  try{
   if(!project?.manifest||!/^[-a-z0-9_]{1,64}$/.test(project.manifest.id))throw {code:'SDK_MODEL_ID_MISMATCH'};
   let bytes=0;for(const list of [project.dependencies,project.rules,project.helpers,project.presentation,project.support||[]]){if(!Array.isArray(list)||list.length>256)throw {code:'SDK_SOURCE_COMPLEXITY'};for(const f of list){if(!f||typeof f.file!=='string'||!/^(?:domain|presentation|shared)\/[a-zA-Z0-9_./-]+\.js$|^(?:rules|sounds)\.js$/.test(f.file)||f.file.split('/').includes('..')||typeof f.source!=='string')throw {code:'SDK_SOURCE_COMPLEXITY'};const size=encoder.encode(f.source).byteLength;bytes+=size;if(size>LIMITS.fileBytes||bytes>LIMITS.sourceBytes)throw {code:'SDK_SOURCE_COMPLEXITY'};}}
   runtime=QuickJS.newRuntime();runtime.setMemoryLimit(LIMITS.memoryBytes-16*1024*1024);runtime.setMaxStackSize(512*1024);runtime.setInterruptHandler(()=>Date.now()>deadline);vm=runtime.newContext();
 const report=vm.newFunction('reportDenied',(resource,stack)=>{if(violations.length<100)violations.push({resource:vm.getString(resource).slice(0,96),stack:vm.getString(stack).slice(0,4000)});});
 vm.setProp(vm.global,'__reportDenied',report);report.dispose();
 evaluate(`(()=>{
  const report=globalThis.__reportDenied,NativeError=Error,own=Object.hasOwn;delete globalThis.__reportDenied;
  const deny=resource=>{const error=new NativeError('SDK_ACCESS_DENIED');error.code='SDK_ACCESS_DENIED';report(resource,error.stack);throw error;};
  for(const key of ${JSON.stringify(deniedGlobals)})Object.defineProperty(globalThis,key,{get:()=>deny(key),configurable:false});
  Object.defineProperty(Math,'random',{value:()=>deny('Math.random'),writable:false,configurable:false});
  const sdk=Object.freeze({voteThreshold(n){if(!Number.isInteger(n)||n<0||n>32)throw Error('SDK_VOTE_COUNT_INVALID');return Math.max(1,n-Math.floor((n-1)/3));},read(value,key){if(value===null||typeof value!=='object'||!own(value,key))return deny('field:required');return value[key];},resource(id){if(typeof id!=='string'||!/^assets\\/[a-zA-Z0-9_./-]+$/.test(id)||id.split('/').includes('..'))return deny('asset:path');return {kind:'asset',id};}});
  Object.defineProperty(globalThis,'SDK',{value:sdk,writable:false});
 })();`,'sdk/access.js').dispose();
 // UMD core modules test typeof module/require. Their absence is safe; hard
 // denying those getters would also reject this trusted bootstrap. Use trusted
 // browser branches by removing just the UMD checks, not by exposing Node.
 // The core is read from this checkout only, never selected by the pack.
 for(const f of coreSources){for(const match of f.source.matchAll(/['"]([A-Z][A-Z0-9_]{1,79})['"]/g))safeCodes.add(match[1]);evaluate(browserSource(f.source),f.file,f.source).dispose();}
 // Include non-enumerable class prototypes. Packs must not change validation
 // methods or the intrinsic operations used by the trusted model runtime.
 evaluate(`(()=>{const seen=new Set();function freeze(o){if(!o||!['object','function'].includes(typeof o)||seen.has(o))return;seen.add(o);for(const key of Reflect.ownKeys(o)){const d=Object.getOwnPropertyDescriptor(o,key);freeze(d.value);freeze(d.get);freeze(d.set);}Object.freeze(o);}for(const key of ['PlayroomSDKSupport','PlayroomModelValues','PlayroomModelInputs','PlayroomEvents','PlayroomRandom','PlayroomBotDifficulty','PlayroomModelRuntime','Object','Array','Function','JSON','Math','Reflect','Number','String','Boolean','Symbol','BigInt','RegExp','Map','Set','WeakMap','WeakSet','Promise','ArrayBuffer','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array']){freeze(globalThis[key]);Object.defineProperty(globalThis,key,{writable:false,configurable:false});}for(const key of ['Error','TypeError','RangeError','SyntaxError','ReferenceError','EvalError','URIError']){Object.freeze(globalThis[key]);Object.defineProperty(globalThis,key,{writable:false,configurable:false});}})();`,'sdk/freeze.js').dispose();
 const p=project;
 // Pack UMD modules get the browser branch. Access to Node remains forbidden.
 const guestSource=browserSource;
 if(role==='rules'||role==='bot'){
  evaluate(`globalThis.PlayroomPackResources={locales:{}};globalThis.PlayroomPackPresentation=Object.freeze({});globalThis.PlayroomMessages=Object.freeze({text:key=>key});globalThis.PlayroomPack=Object.freeze({...${JSON.stringify(p.manifest)},sdkFeatures:['local-input-v1','turn-order-v1','player-status-v1'],adaptModel:spec=>{globalThis.__definition=spec.definition;return spec;}});globalThis.TabletopCore=Object.freeze({...PlayroomRandom,register:()=>{},registerModel:spec=>{globalThis.__definition=spec.definition;}});`,'sdk/registration.js').dispose();
  for(const f of [...p.dependencies,...p.rules])evaluate(guestSource(f.source),f.file,f.source).dispose();
  dispatch=evaluate(`(()=>{const definition=globalThis.__definition||globalThis.PlayroomPackDefinition;const model=new PlayroomModelRuntime.GameModel(definition);if(model.id!==${JSON.stringify(p.manifest.id)})throw Error('SDK_MODEL_ID_MISMATCH');const allowed=new Set(Object.getOwnPropertyNames(PlayroomModelRuntime.GameModel.prototype).filter(key=>!['constructor','botInputs','botDecision'].includes(key)&&typeof Object.getOwnPropertyDescriptor(PlayroomModelRuntime.GameModel.prototype,key).value==='function'));return (method,args)=>{const values=JSON.parse(args);const botHooks=new Set(['bot','botMistakes','botReaction','botReactionDelay']);if(${JSON.stringify(role)}==='bot'){if(method==='botDecision')return JSON.stringify(model.botDecision(...values));throw Error('SDK_METHOD_DENIED');}if(method==='botInputs')return JSON.stringify(model.botInputs(...values));if(method==='modelInfo')return JSON.stringify({properties:{id:model.id,minPlayers:model.minPlayers,maxPlayers:model.maxPlayers},methods:[...allowed]});if(method==='definitionInfo'){const properties=Object.create(null),methods=[];for(const key of Object.keys(definition)){if(typeof definition[key]==='function')methods.push(key);else properties[key]=definition[key];}return JSON.stringify({properties,methods});}if(method==='definitionCall'){const [name,...parameters]=values;if(botHooks.has(name))throw Error('SDK_METHOD_DENIED');if(!Object.hasOwn(definition,name)||typeof definition[name]!=='function')throw Error('SDK_METHOD_DENIED');const value=definition[name](...parameters);if(value!==undefined)PlayroomModelValues.json(value);return JSON.stringify(value===undefined?{defined:false}:{defined:true,value});}if(!allowed.has(method))throw Error('SDK_METHOD_DENIED');const result=model[method](...values);return JSON.stringify(result===undefined?null:result);};})()`,'sdk/rules.js');
 }else{
  // A separate VM has no rules modules, model instance, position or journal.
  evaluate(`globalThis.PlayroomPackResources={locales:${JSON.stringify(p.catalogs||{})},rulebooks:${JSON.stringify(p.resourceClosure?.rulebooks||{})}};globalThis.PlayroomPack=Object.freeze({...${JSON.stringify(p.manifest)},asset:SDK.resource});globalThis.PlayroomCatalog=Object.create(null);`,'sdk/presentation-registration.js').dispose();
  for(const f of [...p.dependencies,...p.helpers,...(p.support||[]),...p.presentation])evaluate(guestSource(f.source),f.file,f.source).dispose();
  dispatch=evaluate(`(()=>{const p=PlayroomPackPresentation;return (method,args)=>{const values=JSON.parse(args);if(method==='metadata')return JSON.stringify({...p.metadata,methods:Object.keys(p).filter(key=>typeof p[key]==='function'),...(globalThis.PlayroomSDKSupport?{catalog:PlayroomSDKSupport.catalog(p)}:{}),sounds:globalThis.PlayroomCatalog?.[${JSON.stringify(p.manifest.id)}]?.sounds||{}});if(method==='present'){const [name,...parameters]=values;if(!['scene','action','choice','event','eventScenes','metric'].includes(name))throw Error('SDK_METHOD_DENIED');const result=p[name]?p[name](...parameters):null;if(result!==null&&result!==undefined)PlayroomModelValues.json(result);return JSON.stringify(result===undefined?null:result);}if(method!=='render')throw Error('SDK_METHOD_DENIED');const projection=values[0];const value={scene:p.scene(projection),actions:projection.actions.map(command=>{const choice=p.choice?.(command,projection)||{};return {command,choice,label:p.action?p.action({...choice,...command},projection):command.type};}),events:projection.events.map(event=>{const presented=p.event?p.event(event):{message:event.type};return presented.message?.key?{...presented,message:{...presented.message,params:{player:{kind:'player-reference',index:event.actor},...presented.message.params}}}:presented;})};if(globalThis.PlayroomSDKSupport)value.support=PlayroomSDKSupport.project(p,projection,{scene:value.scene,ui:values[1]?.ui||{},guideProgress:values[1]?.guideProgress||{seen:[]}});let omitted=0;const encoded=JSON.stringify(value,(_,item)=>{if(item===undefined)omitted++;if(typeof item==='function'||typeof item==='symbol'||typeof item==='bigint'||typeof item==='number'&&!Number.isFinite(item)){const error=Error('SDK_OUTPUT_INVALID');throw error;}return item;});const result=JSON.parse(encoded);PlayroomModelValues.json(result);if(omitted)result.diagnostics=[{code:'SDK_OPTIONAL_FIELD_OMITTED',count:omitted,hint:'Optional undefined properties were omitted at the JSON boundary; use explicit null where a value is required.'}];return JSON.stringify(result);};})()`,'sdk/presentation.js');
 }

   if(violations.length)throw {code:'SDK_ACCESS_DENIED',...violations[0]};
   // The authority realm extracts approved bot inputs. The fresh realm never
   // receives a position or observes state retained by create/reduce/query hooks.
   function isolatedCall(method,args){
    const botKinds={botAction:'action',botReaction:'reaction',botReactionDelay:'delay'};
    let freshMethod=null,freshArgs;
    if(Object.hasOwn(botKinds,method)){
     const [position,actor,settings]=JSON.parse(args);
     freshArgs=call('botInputs',encode([position,actor,settings??null,botKinds[method]]));
     if(freshArgs==='null')return 'null';freshMethod='botDecision';freshArgs='['+freshArgs+']';
    }
    if(freshMethod){const fresh=createRealm(project,'bot');try{return fresh.call(freshMethod,freshArgs);}finally{fresh.close();}}
    return call(method,args);
   }
   return {call:role==='rules'?isolatedCall:call,close};
  }catch(error){const wrapped=failure(error,'load');close();throw wrapped;}
 }
 function createRules(project){
  const realm=createRealm(project,'rules');
  try{const info=JSON.parse(realm.call('definitionInfo','[]')),definition=Object.create(null);
   for(const [key,value] of Object.entries(info.properties)){if(['__proto__','constructor','prototype'].includes(key))throw {code:'SDK_OUTPUT_INVALID'};definition[key]=value;}
   for(const name of info.methods){if(typeof name!=='string'||['__proto__','constructor','prototype'].includes(name))throw {code:'SDK_OUTPUT_INVALID'};definition[name]=(...args)=>{const result=JSON.parse(realm.call('definitionCall',encode([name,...args])));return result.defined?result.value:undefined;};}
   if(definition.id!==project.manifest.id)throw {code:'SDK_MODEL_ID_MISMATCH'};
   const modelInfo=JSON.parse(realm.call('modelInfo','[]')),model=Object.assign(Object.create(null),modelInfo.properties);for(const name of modelInfo.methods)model[name]=(...args)=>JSON.parse(realm.call(name,encode(args)));return {definition,model,call:(method,...args)=>JSON.parse(realm.call(method,encode(args))),close:realm.close};
  }catch(error){realm.close();throw error;}
 }
 function render(project,projection,context={}){const realm=createRealm(project,'presentation');try{return JSON.parse(realm.call('render',encode([projection,context])));}finally{realm.close();}}
 function present(project,method,...args){const realm=createRealm(project,'presentation');try{return JSON.parse(realm.call('present',encode([method,...args])));}finally{realm.close();}}
 function metadata(project){const realm=createRealm(project,'presentation');try{return JSON.parse(realm.call('metadata','[]'));}finally{realm.close();}}
 return {createRealm,createRules,render,present,metadata};
}
module.exports={createVMHost,browserSource,DEFAULT_LIMITS};

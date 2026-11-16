'use strict';
import {newQuickJSWASMModuleFromVariant,newVariant} from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import hostModule from './vm-host.js';
const {createVMHost,DEFAULT_LIMITS}=hostModule;
// This constant is supplied from the trusted checkout by build-sandbox.cjs.
const coreSources=__PLAYROOM_TRUSTED_CORE__;
const bundleURL=globalThis.document?.currentScript?.src||globalThis.location?.href;
let host,initializing;
export function initialize(options=globalThis.PlayroomSandboxOptions||{}){
 if(initializing)return initializing;
 initializing=(async()=>{
  const wasmURL=options.wasmURL||new URL('quickjs.wasm',bundleURL).href;
  const wasmBinary=options.wasmBinary||await (async()=>{const response=await fetch(wasmURL);if(!response.ok)throw Error('SDK_WASM_LOAD');return response.arrayBuffer();})();
  const variant=newVariant(RELEASE_SYNC,{wasmLocation:wasmURL,locateFile:()=>wasmURL,wasmBinary,wasmMemory:new WebAssembly.Memory({initial:256,maximum:DEFAULT_LIMITS.memoryBytes/65536})});
  const QuickJS=await newQuickJSWASMModuleFromVariant(variant);host=createVMHost({QuickJS,coreSources});return true;
 })();return initializing;
}
function initialized(){if(!host)throw Object.assign(Error('SDK_NOT_READY'),{code:'SDK_NOT_READY'});return host;}
export const ready=initialize();
export const createRules=project=>initialized().createRules(project);
export const render=(project,projection,context={})=>initialized().render(project,projection,context);
export const metadata=project=>initialized().metadata(project);

export const present=(project,method,...args)=>initialized().present(project,method,...args);

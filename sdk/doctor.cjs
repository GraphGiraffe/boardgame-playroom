'use strict';
const {SDKError}=require('./project.cjs');

// Resolve the SDK's own dependencies, never those of the authored project.
async function doctor(directory,options){
 const node=process.versions.node,diagnostics=[];
 if(Number(node.split('.')[0])<22)diagnostics.push({code:'SDK_NODE_VERSION',hint:'Use Node.js 22 or later.'});
 for(const name of ['acorn','saxes','typescript','quickjs-emscripten']){
  try{require.resolve(name);}catch{diagnostics.push({code:'SDK_DEPENDENCY_MISSING',dependency:name,hint:'Install the dependencies of the selected application checkout.'});}
 }
 if(!diagnostics.length){
  try{await require('./node-host.cjs').createNodeHost();}
  catch{diagnostics.push({code:'SDK_WASM_UNAVAILABLE',hint:'Check the QuickJS/WASM installation in the selected application checkout.'});}
 }
 let project={status:'skipped'};
 if(!diagnostics.length){
  // Initializing the trusted runtime above does not load any guest source.
  // The project audit only analyzes source, types and the resource closure.
  try{
   const {status,id,hash,diagnostics,warnings,budget}=require('./check.cjs').check(directory,options);
   project={status,id,hash,diagnostics,warnings,budget};
  }catch(error){
   project={status:'failed',diagnostics:[error instanceof SDKError?error.diagnostic:{code:'SDK_PROJECT_UNREADABLE',hint:'Check the project directory and readable source files.'}]};
  }
 }
 return {status:project.status==='passed'?'ready':'failed',node,environment:{status:diagnostics.length?'failed':'passed',diagnostics},project,scope:'local dependencies, QuickJS initialization and static project audit'};
}

module.exports={doctor};

#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const {SDKError,inspectProject,fail}=require('./project.cjs');
const {check,prepareProject}=require('./check.cjs');
const {verify,privacy}=require('./verify.cjs');
async function main(argv=process.argv.slice(2)){
 const [command,directory,...rest]=argv,options={};
 for(let i=0;i<rest.length;i+=2){if(!['--shared','--port','--steps','--fixture','--output'].includes(rest[i])||rest[i+1]===undefined)fail('SDK_ARGUMENT_INVALID');options[rest[i].slice(2)]=rest[i+1];}
 if(!directory||!['inspect','check','verify','privacy','serve','build'].includes(command))fail('SDK_USAGE',{hint:'node sdk/cli.cjs inspect|check|verify|privacy|serve|build PROJECT [--shared PATH] [--steps N] [--fixture JSON] [--output FILE]'});
 if(command==='serve'){
  const {serve}=require('./server.cjs'),running=await serve(directory,{shared:options.shared,port:options.port===undefined?0:Number(options.port)});console.log(JSON.stringify({status:'listening',url:running.url,scope:'local-studio-only'}));
  const stop=()=>running.close().then(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);return;
 }
 let result;
 if(command==='inspect')result=inspectProject(directory,options);
 if(command==='check')result=check(directory,options);
 if(command==='verify')result=await verify(directory,{shared:options.shared,steps:options.steps===undefined?20:Number(options.steps)});
 if(command==='privacy'){
  if(!options.fixture)fail('SDK_FIXTURE_REQUIRED');const stat=fs.statSync(options.fixture);if(stat.size>4*1024*1024)fail('SDK_FILE_LIMIT');
  result=await privacy(directory,{...JSON.parse(fs.readFileSync(options.fixture,'utf8')),shared:options.shared});
 }
 if(command==='build'){
  if(!options.output)fail('SDK_OUTPUT_REQUIRED');const prepared=prepareProject(directory,options);result=prepared.report;if(result.status!=='passed')return print(result,1);
  // Validate the exact bytes before creating the destination. Never leave an
  // oversized/partial candidate or overwrite an existing author artifact.
  let descriptor;
  try{descriptor=fs.openSync(options.output,'wx',0o600);fs.writeFileSync(descriptor,prepared.text);fs.closeSync(descriptor);descriptor=undefined;}
  catch(error){if(descriptor!==undefined){try{fs.closeSync(descriptor);}catch{}fs.unlinkSync(options.output);}throw error;}
  result={status:'built',output:options.output,sourceHash:result.hash,bytes:result.budget.bytes,budget:result.budget,warnings:result.warnings,format:result.budget.format,scope:'SDK source package; not an installable player-application pack'};
 }
 print(result,result?.status==='failed'?1:0);
}
function print(value,code=0){console.log(JSON.stringify(value,null,2));process.exitCode=code;}
if(require.main===module)main().catch(error=>{print(error instanceof SDKError?error.diagnostic:{code:'SDK_OPERATION_FAILED'},1);});
module.exports={main};

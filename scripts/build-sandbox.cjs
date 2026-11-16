'use strict';
// Reproducible application assets; no game code is executed by this build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const core=['model-values','events','random','bot-difficulty','model-inputs','model-runtime'];
async function buildSandbox(output=path.join(root,'tmp_files/sdk-browser')){
 const coreSources=core.map(name=>({file:'sdk/core/'+name+'.js',source:fs.readFileSync(path.join(root,'core',name+'.js'),'utf8')}));
 fs.mkdirSync(output,{recursive:true});
 await esbuild.build({absWorkingDir:root,entryPoints:['sdk/browser-entry.js'],bundle:true,platform:'browser',format:'iife',globalName:'PlayroomSandbox',target:['es2022'],outfile:path.join(output,'sandbox.js'),minify:true,legalComments:'eof',define:{__PLAYROOM_TRUSTED_CORE__:JSON.stringify(coreSources)}});
 fs.copyFileSync(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'),path.join(output,'quickjs.wasm'));
 return {directory:output,files:['sandbox.js','quickjs.wasm'].map(name=>{const bytes=fs.readFileSync(path.join(output,name));return {file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};})};
}
module.exports={buildSandbox};
if(require.main===module)buildSandbox(process.argv[2]?path.resolve(process.argv[2]):undefined).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});

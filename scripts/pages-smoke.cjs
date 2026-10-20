'use strict';
// Compatibility shim; no implicit network or implementation copy.
const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),candidates=process.env.PLAYROOM_UTILS_ROOT?[process.env.PLAYROOM_UTILS_ROOT]:[path.join(root,'.playroom-utils'),path.join(root,'../.playroom-utils'),path.join(root,'../boardgame-playroom-utils')];
const source=candidates.map(p=>path.join(p,'tools/app',"pages-smoke.cjs")).find(p=>fs.existsSync(p));
if(!source)throw Error('Set PLAYROOM_UTILS_ROOT to the utils checkout; no implicit download');
process.env.PLAYROOM_APP_ROOT=root;
if(require.main===module){const result=spawnSync(process.execPath,[source,...process.argv.slice(2)],{stdio:'inherit',env:process.env});if(result.error)throw result.error;process.exitCode=result.status===null?1:result.status;}else module.exports=require(source);

'use strict';
// Current compiler output is trusted checkout data. Authored module strings stay
// inert until the portable VM evaluates them; this helper never loads pack JS.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function readInstalled(){
 const installed=process.env.PLAYROOM_TEST_INSTALLED_PACKS||path.join(__dirname,'../installed-packs.js');
 const prepared={};vm.runInNewContext(fs.readFileSync(installed,'utf8'),prepared,{filename:'trusted/installed-packs.js'});
 return prepared.PlayroomInstalledPacks;
}
async function bootstrap({ids,engine=require('../core/engine.js'),views,catalog={}}={}){
 const bundles=readInstalled().filter(bundle=>!ids||ids.includes(bundle.manifest.id));
 if(ids&&bundles.length!==new Set(ids).size)throw Error('SDK_TEST_COMPANION_MISSING');
 if(bundles.some(bundle=>bundle.manifest.execution!=='isolated-v1'))throw Error('SDK_TEST_ISOLATION_REQUIRED');
 const host=await require('../sdk/node-host.cjs').createNodeHost();globalThis.PlayroomSandbox=host;
 const UI=require('../core/ui.js'),Packs=require('../core/packs.js');views||=UI.createRegistry();
 const manager=new Packs({engine,views,catalog,modelAdapter:require('../core/model-registration.js').adapt,storage:{get:()=>null,set(){}}});
 await manager.bootstrap(bundles);
 return {engine,views,catalog,manager,bundles,host,close(){for(const item of manager._items.values())item.guest?.close();}};
}
module.exports={bootstrap,readInstalled};

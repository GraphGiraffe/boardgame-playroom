'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {fixture}=require('./sdk-fixture.cjs'),{loadProject}=require('../sdk/project.cjs');
const packs=path.dirname(fs.realpathSync(path.join(__dirname,'../packs')));
function project(t){const root=fixture(t);const file=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));Object.assign(manifest,{name:'Animation fixture',engineApi:4,viewApi:3,stateVersion:1});fs.writeFileSync(file,JSON.stringify(manifest));fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'config'));return root;}
function python(root){const code="import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('compiler',sys.argv[1]);c=importlib.util.module_from_spec(s);s.loader.exec_module(c);p=c.isolated_source_payload(sys.argv[2]);print(json.dumps({'assets':p['assets'],'closure':p['resourceClosure']}))";return JSON.parse(execFileSync('python3',['-c',code,path.join(packs,'shared/pack_compiler.py'),root],{encoding:'utf8'}));}
test('local JSON animations belong to the audited media closure and retain Node/Python parity',t=>{
 const root=project(t),animation=JSON.stringify({contractVersion:1,frames:[{time:0,values:{opacity:0}},{time:150,values:{opacity:1}}]});
 fs.writeFileSync(path.join(root,'assets/motion.json'),animation);fs.writeFileSync(path.join(root,'assets/README.md'),'Original notes');fs.writeFileSync(path.join(root,'config/options.json'),'{"mode":"classic"}');
 const node=loadProject(root),other=python(root);assert.deepEqual(node.resourceAssets,other.assets);assert.deepEqual(node.resourceClosure,other.closure);
 assert.equal(node.resourceAssets[0].file,'assets/motion.json');assert.equal(node.resourceAudit.files[0].mime,'application/json');assert.equal(node.resourceAudit.bytes,Buffer.byteLength(animation));assert.deepEqual(node.resourceAudit.documentation,['assets/README.md']);assert.equal(node.resourceClosure.data[0].file,'config/options.json');
});
test('local JSON cannot bypass animation validation through the data catalog port',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'assets/motion.json'),JSON.stringify({contractVersion:1,frames:[{time:0,values:{onload:1}}]}));
 assert.throws(()=>loadProject(root),e=>e.code==='SDK_ANIMATION_INVALID');assert.throws(()=>python(root),/SDK_ANIMATION_INVALID/);
});

test('support vectors reject active markup, external paint and runtime action attributes',()=>{
 const {graphic}=require('../sdk/sdk-support.js');
 assert.equal(graphic('<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>').kind,'vector');
 for(const source of ['<script>alert(1)</script>','<svg onload="x"/>','<svg><use href="https://example.test/x"/></svg>',`<svg><path style="background:image-set('//example.test/x')"/></svg>`,'<svg><path data-action="noop"/></svg>'])assert.throws(()=>graphic(source));
});


test('tutorial availability follows authorized commands while retaining local help',()=>{
 const vm=require('node:vm'),guest=vm.createContext({});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sdk/sdk-support.js'),'utf8'),guest);
 vm.runInContext(fs.readFileSync(path.join(packs,'packs/uno/presentation/tutorial.js'),'utf8'),guest);
 const presentation={metadata:{},scene:()=>({declarationOpen:[],declared:[]})};
 const tutorial=actions=>guest.PlayroomSDKSupport.project(presentation,{viewer:0,turn:0,data:{},actions}).tutorial;
 const steps=tutorial([{type:'play',card:0},{type:'draw'}]).steps;
 assert.equal(steps.find(s=>s.id==='color').available,false);
 assert.equal(steps.find(s=>s.id==='pass').available,false);
 assert.equal(steps.find(s=>s.id==='card').available,true);
 assert.equal(steps.find(s=>s.id==='help').available,true);
 assert.equal(tutorial([{type:'play',card:0,color:'red'}]).steps.find(s=>s.id==='color').available,true);
 guest.PlayroomPackTutorial=()=>()=>({steps:[{id:'restricted',selector:`[data-action*='"type":"play"']`,match:()=>false}]});
 const restricted=tutorial([{type:'play',card:0}]).steps[0];
 assert.equal(restricted.available,false);assert.equal(restricted.commands.length,0);
});

test('parameter figures retain inherited preview kind and reject missing declared figures',()=>{
 const vm=require('node:vm'),guest=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../sdk/sdk-support.js'),'utf8'),guest);
 guest.PlayroomPack={settings:[{preview:{kind:'illustrations'},options:[{preview:{ids:['card-a','card-b']}},{preview:{kind:'illustrations',ids:['card-c']}}]}],presetSetting:{preview:{kind:'illustrations'},options:[{preview:{ids:['preset-a']}}]}};
 guest.PlayroomPackRuleIllustrations={create:()=>id=>['card-a','card-b','card-c','preset-a'].includes(id)?'<svg viewBox="0 0 10 10"><title>'+id+'</title></svg>':undefined};
 const catalog=guest.PlayroomSDKSupport.catalog({metadata:{}});assert.deepEqual(Array.from(catalog.figures,f=>f.id).sort(),['card-a','card-b','card-c','preset-a']);
 guest.PlayroomPack.settings[0].options.push({preview:{ids:['missing']}});assert.throws(()=>guest.PlayroomSDKSupport.catalog({metadata:{}}),/SDK_SUPPORT_FIGURE_MISSING/);
});

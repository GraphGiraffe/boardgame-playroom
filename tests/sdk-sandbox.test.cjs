'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {StudioSession}=require('../sdk/runtime.cjs');
const {loadProject}=require('../sdk/project.cjs');
const {checkSource}=require('../sdk/check.cjs');
const {privacy}=require('../sdk/verify.cjs');
function fixture(t,{start='',render='',project='({count:position.data.count})'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-sdk-security-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const dir of ['sdk','domain','presentation'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({id:'probe',version:'1.0.0',sourceModules:{locales:{}}}));
 fs.writeFileSync(path.join(root,'sdk/project.json'),JSON.stringify({contractVersion:1,rules:['domain/game.js'],presentation:['presentation/scene.js']}));
 fs.writeFileSync(path.join(root,'domain/game.js'),`globalThis.PlayroomPackDefinition={contractVersion:1,id:'probe',minPlayers:2,maxPlayers:2,create:()=>{${start};return {playerCount:2,turn:0,status:'playing',winners:[],data:{count:0,secret:'hidden-alpha'}};},validate:()=>true,actions:()=>[{command:{type:'step'},visibility:'public'}],reduce:p=>({position:p,events:[]}),project:position=>${project},result:()=>({winners:[],places:[1,1],metrics:[]})};`);
 fs.writeFileSync(path.join(root,'presentation/scene.js'),`globalThis.PlayroomPackPresentation={scene:projection=>{${render};return {contractVersion:1,id:'probe',family:'board',players:[0,1].map(player=>({player,metrics:[]}))};}};`);
 return root;
}
test('SDK denies network, Node, DOM, storage and ambient randomness even if the guest catches the error',async t=>{
 for(const expression of ['fetch("https://example.invalid")','process.env','document.cookie','localStorage.getItem("x")','Math.random()','Date.now()','require("node:fs")']){
  const root=fixture(t,{start:`try{${expression}}catch{}`}),s=await StudioSession.open(root);t.after(()=>s.close());
  await assert.rejects(s.start(),error=>error.code==='SDK_ACCESS_DENIED'&&error.diagnostic.role==='rules'&&error.diagnostic.frames.some(f=>f.file==='domain/game.js'));
 }
});
test('SDK gives presentation no authority globals and reports required missing fields without private values',async t=>{
 const root=fixture(t,{render:`SDK.read(projection,'authoritySecret')`}),s=await StudioSession.open(root);t.after(()=>s.close());await s.start();
 await assert.rejects(s.view(0),error=>error.code==='SDK_ACCESS_DENIED'&&!JSON.stringify(error.diagnostic).includes('hidden-alpha'));
 const isolated=fixture(t,{render:`if(typeof __definition!=='undefined'||typeof PlayroomPackDefinition!=='undefined')throw Error('LEAK');if(Object.hasOwn(projection.data,'secret'))throw Error('LEAK');`}),other=await StudioSession.open(isolated);t.after(()=>other.close());await other.start();assert.equal((await other.view(0)).scene.id,'probe');
});
test('SDK diagnostics redact guest exception metadata and dynamic missing-field values',async t=>{
 for(const start of ["const error=Error('PRIVATE_PAYLOAD_XYZ');error.resource='hidden-beta';error.stack=' at domain/hidden-beta.js:1:1';throw error;","try{SDK.read({},'hidden-beta')}catch{}"]) {
  const session=await StudioSession.open(fixture(t,{start}));t.after(()=>session.close());
  await assert.rejects(session.start(),error=>['SDK_EXECUTION_FAILED','SDK_ACCESS_DENIED'].includes(error.code)&&!/PRIVATE_PAYLOAD_XYZ|hidden-beta/.test(JSON.stringify(error.diagnostic)));
 }
 const root=fixture(t,{start:'document.cookie'}),file=path.join(root,'domain/game.js');fs.writeFileSync(file,"if(typeof\n require === 'function'){}\n"+fs.readFileSync(file,'utf8'));
 const session=await StudioSession.open(root);t.after(()=>session.close());await assert.rejects(session.start(),error=>error.code==='SDK_ACCESS_DENIED'&&error.diagnostic.frames.some(frame=>frame.file==='domain/game.js'&&frame.line===3));
 const warningRoot=fixture(t),sceneFile=path.join(warningRoot,'presentation/scene.js');fs.writeFileSync(sceneFile,fs.readFileSync(sceneFile,'utf8').replace('players:[0,1]',"['hidden-beta']:undefined,players:[0,1]"));
 const warning=await StudioSession.open(warningRoot);t.after(()=>warning.close());await warning.start();const view=await warning.view(0);assert.equal(view.diagnostics[0].count,1);assert(!JSON.stringify(view).includes('hidden-beta'));
});
test('SDK bounds loops and allocations independently of the guest exception handler',async t=>{
 for(const start of ['for(;;){}','const a=[];for(;;)a.push(new Uint8Array(1024*1024));']){
  const s=await StudioSession.open(fixture(t,{start}));t.after(()=>s.close());const time=Date.now();
  await assert.rejects(s.start(),error=>['SDK_TIME_LIMIT','SDK_WALL_LIMIT','SDK_EXECUTION_FAILED','SDK_WORKER_FAILED','SDK_WORKER_EXITED'].includes(error.code));assert(Date.now()-time<7000);
 }
});
test('SDK validates path boundaries, syntax diagnostics and immutable checkpoint identity',async t=>{
 const root=fixture(t),descriptor=path.join(root,'sdk/project.json'),d=JSON.parse(fs.readFileSync(descriptor));d.rules=['../outside.js'];fs.writeFileSync(descriptor,JSON.stringify(d));assert.throws(()=>loadProject(root),error=>error.code==='SDK_PATH_DENIED');
 d.rules=['domain/game.js'];fs.writeFileSync(descriptor,JSON.stringify(d));fs.symlinkSync(path.join(root,'domain/game.js'),path.join(root,'domain/link.js'));d.rules=['domain/link.js'];fs.writeFileSync(descriptor,JSON.stringify(d));assert.throws(()=>loadProject(root),error=>error.code==='SDK_SYMLINK_DENIED');
 assert.equal(checkSource({file:'domain/game.js',source:'fetch("x")'})[0].line,1);
 const s=await StudioSession.open(fixture(t));t.after(()=>s.close());await s.start();const checkpoint=await s.checkpoint();await assert.rejects(s.restore({...checkpoint,packHash:'different'}),error=>error.code==='SDK_CHECKPOINT_INCOMPATIBLE');
});
test('SDK privacy pairs detect accidental projection leaks and redact the mismatch report',async t=>{
 const root=fixture(t),s=await StudioSession.open(root);await s.start();const left=s.position,right=JSON.parse(JSON.stringify(left));right.data.secret='hidden-beta';s.close();
 await assert.rejects(privacy(root,{left,right}),error=>error.code==='SDK_PRIVACY_VIEWER_REQUIRED');
 await assert.rejects(privacy(root,{left,right:left,viewer:0}),error=>error.code==='SDK_PRIVACY_IDENTICAL_FIXTURE');
 assert.equal((await privacy(root,{left,right,viewer:0})).status,'passed');
 const leaky=fixture(t,{project:'position.data'});
 await assert.rejects(privacy(leaky,{left,right,viewer:0}),error=>error.code==='SDK_PRIVACY_DIFFERENCE'&&!JSON.stringify(error.diagnostic).includes('hidden-alpha')&&!JSON.stringify(error.diagnostic).includes('hidden-beta'));
});
module.exports={fixture};

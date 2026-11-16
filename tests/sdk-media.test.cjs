'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sha256,createMediaValidator}=require('../sdk/media.cjs'),{BUDGET}=require('../sdk/budget.cjs');
const {validateMedia}=require('../sdk/assets.cjs'),fixtures=require('./sdk-media-fixtures.cjs');
test('synchronous portable SHA-256 matches standard vectors and Node crypto',()=>{
 for(const value of ['', 'abc','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(1000000),'Привет 😀']){const bytes=Buffer.from(value);assert.equal(sha256(bytes),crypto.createHash('sha256').update(bytes).digest('hex'));}
});
test('portable media validator accepts SDK formats and retains unknown OGG MP3 duration policy',()=>{
 const report=validateMedia(fixtures.valid());assert.equal(report.files.length,8);assert.equal(report.files.find(f=>f.file.endsWith('.ogg')).durationSeconds,null);assert.equal(report.files.find(f=>f.file.endsWith('.mp3')).warnings[0].code,'SDK_AUDIO_DURATION_UNVERIFIED');assert.equal(report.files.find(f=>f.file.endsWith('.wav')).durationSeconds,1);
});
test('normal pack preparation rejects malformed media before guest creation or registry activation',()=>{
 const Packs=require('../core/packs.js'),old=globalThis.PlayroomSandbox;let guests=0,registrations=0;
 globalThis.PlayroomSandbox={validateMedia:createMediaValidator(BUDGET).validateMedia,createRules(){guests++;throw Error('GUEST_MUST_NOT_START');},present(){}};
 try{const manager=new Packs({engine:{registerVersion(){registrations++;},activatePack(){}},views:{register(){registrations++;},get(){},remove(){}},catalog:{},storage:{get:()=>null,set(){}}});for(const [name,rows,code]of fixtures.cases()){const bundle=fixtures.bundle(rows);assert(Buffer.byteLength(JSON.stringify(bundle))<4_000_000,name+' is below outer pack ceiling');assert.throws(()=>manager.prepare(bundle),e=>e.code===code,name);}assert.equal(guests,0);assert.equal(registrations,0);assert.equal(manager.list().length,0);}finally{globalThis.PlayroomSandbox=old;}
});

test('current source media closures and installed pack activation pass the same portable policy',async()=>{
 const fs=require('node:fs'),path=require('node:path'),packs=path.resolve(__dirname,'../../playroom-paks'),{loadProject}=require('../sdk/project.cjs');
 const folders=['packs','sdk/examples'].filter(folder=>fs.existsSync(path.join(packs,folder))).flatMap(folder=>fs.readdirSync(path.join(packs,folder)).map(id=>path.join(packs,folder,id)).filter(dir=>fs.existsSync(path.join(dir,'sdk/project.json'))));let assets=0;
 for(const folder of folders){const p=loadProject(folder,{shared:path.join(packs,'shared')}),report=validateMedia(p.resourceAssets);assert.equal(report.bytes,p.resourceAudit.bytes,p.manifest.id);assert.equal(report.decodedImageBytes,p.resourceAudit.decodedImageBytes,p.manifest.id);assets+=report.files.length;}
 assert(folders.length&&assets>0);
 const env=await require('./sdk-installed.cjs').bootstrap();try{assert.equal(env.manager.list().length,env.bundles.length);assert(env.manager.list().every(p=>p.manifest.execution==='isolated-v1'));}finally{env.close();}
});

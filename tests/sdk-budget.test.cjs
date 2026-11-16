'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture}=require('./sdk-fixture.cjs');
const {check,prepareProject}=require('../sdk/check.cjs');
const {validateAsset,auditAssets,auditProjectAssetImport}=require('../sdk/assets.cjs');
const {BUDGET}=require('../sdk/budget.cjs');
const Packs=require('../core/packs.js');
const root=path.resolve(__dirname,'..');
function svg(size=64){const head='<svg xmlns="http://www.w3.org/2000/svg"><!--',tail='--></svg>';return Buffer.from(head+' '.repeat(size-head.length-tail.length)+tail);}
// Header fixtures measure dimensions only; these checks do not claim decoding.
function png(width=1,height=1,size=24){const b=Buffer.alloc(size);b.write('89504e470d0a1a0a',0,'hex');b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;}
function wav(seconds){const size=Math.round(seconds*8000),b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}
function isolatedFixture(t){const project=fixture(t),file=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));Object.assign(manifest,{name:'Budget fixture',engineApi:4,viewApi:3,stateVersion:1,execution:'isolated-v1',sdkFeatures:['isolated-execution-v1']});fs.writeFileSync(file,JSON.stringify(manifest));return project;}
function compiledBytes(project,shared){const script="import runpy,sys;c=runpy.run_path(sys.argv[1]);p=c['build_pack'](sys.argv[2],sys.argv[3] if len(sys.argv)>3 else None);print(len(c['json_text'](p).encode('utf-8')))";const r=spawnSync('python3',['-c',script,path.join(root,'tooling/pack_compiler.py'),project,...(shared?[shared]:[])],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return Number(r.stdout);}
function assets(project){fs.mkdirSync(path.join(project,'assets'));return path.join(project,'assets');}
function cli(...args){return spawnSync(process.execPath,['sdk/cli.cjs',...args],{cwd:root,encoding:'utf8',timeout:20000});}
test('SDK, player and canonical compiler enforce exactly 4 MB of UTF-8',()=>{
 const bundle={format:'playroom-pack',formatVersion:1,manifest:{id:'budget',version:'1.0.0',name:'Budget',engineApi:4,viewApi:3,stateVersion:1},files:{'rules.js':'void 0;','view.js':'void 0;','styles.css':'/* budget */'}};
 const text=JSON.stringify(bundle),exact=text+' '.repeat(4_000_000-Buffer.byteLength(text));
 assert.equal(BUDGET.packBytes,4_000_000);assert.equal(Packs.MAX_BYTES,BUDGET.packBytes);assert.equal(Packs.parse(exact).manifest.id,'budget');assert.throws(()=>Packs.parse(exact+'я'));
 const script="import runpy,sys,json;c=runpy.run_path(sys.argv[1]);d=json.load(sys.stdin);assert c['MAX_PACK_BYTES']==4_000_000;assert c['TARGET_PACK_BYTES']==500_000;c['validate_bundle'](d['bundle'],'fixture',d['text']);\ntry:c['validate_bundle'](d['bundle'],'fixture',d['text']+'я')\nexcept ValueError:pass\nelse:raise AssertionError('oversize accepted')";
 const result=spawnSync('python3',['-c',script,path.resolve(root,'../playroom-paks/shared/pack_compiler.py')],{input:JSON.stringify({bundle,text:exact}),encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);
});
test('SDK build measures exact output, accepts tiny projects and never overwrites output',t=>{
 const project=fixture(t),output=path.join(project,'review.json'),report=check(project);assert.equal(report.status,'passed');assert(report.budget.bytes<500_000);assert.deepEqual(report.warnings,[]);
 const built=cli('build',project,'--output',output);assert.equal(built.status,0,built.stdout);const value=JSON.parse(built.stdout);assert.equal(value.bytes,fs.statSync(output).size);assert.equal(value.bytes,report.budget.bytes);const before=fs.readFileSync(output);
 assert.notEqual(cli('build',project,'--output',output).status,0);assert.deepEqual(fs.readFileSync(output),before);
 const failed=path.join(project,'failed.json'),script="const fs=require('node:fs'),write=fs.writeFileSync;fs.writeFileSync=(target,...args)=>{if(typeof target==='number'){write(target,'partial');throw Error('fixture write failure');}return write(target,...args);};require('./sdk/cli.cjs').main(['build',process.argv[1],'--output',process.argv[2]]).catch(()=>process.exitCode=1);";
 const failure=spawnSync(process.execPath,['-e',script,project,failed],{cwd:root,encoding:'utf8'});assert.equal(failure.status,1);assert(!fs.existsSync(failed));assert.deepEqual(fs.readFileSync(output),before);
});
test('SDK target is a warning and JSON escaping and metadata count towards the hard ceiling',t=>{
 const project=fixture(t),file=path.join(project,'domain/game.js');fs.appendFileSync(file,'/*'+'x'.repeat(500_000)+'*/');let result=check(project);assert.equal(result.status,'passed');assert(result.warnings.some(w=>w.code==='SDK_PACK_TARGET_EXCEEDED'));
 const manifest=path.join(project,'manifest.json'),value=JSON.parse(fs.readFileSync(manifest));value.extra='\\'.repeat(1_800_000);fs.writeFileSync(manifest,JSON.stringify(value));assert.throws(()=>check(project),error=>error.code==='SDK_PACK_SIZE_LIMIT');
});
test('SDK checks base64 overhead before creating an oversized export',t=>{
 const project=fixture(t),folder=assets(project);fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'x'.repeat(1_500_000)+'*/');
 for(let i=0;i<32;i++)fs.writeFileSync(path.join(folder,'art-'+i+'.svg'),svg(60_000));
 const output=path.join(project,'oversized.json');assert.throws(()=>check(project),error=>error.code==='SDK_PACK_SIZE_LIMIT');const result=cli('build',project,'--output',output);assert.notEqual(result.status,0);assert.equal(JSON.parse(result.stdout).code,'SDK_PACK_SIZE_LIMIT');assert(!fs.existsSync(output));
});
test('SDK asset limits cover exact byte edges, dimensions, duration and animation time',()=>{
 assert.equal(validateAsset(svg(64_000),'art.svg').bytes,64_000);assert.equal(validateAsset(png(1,1,512_000),'art.png').bytes,512_000);
 for(const [name,size]of [['art.svg',64_001],['art.png',512_001],['sound.wav',128_001],['motion.json',64_001]])assert.throws(()=>validateAsset(Buffer.alloc(size),name),e=>e.code==='SDK_ASSET_SIZE_LIMIT');
 for(const [width,height]of [[2049,1],[2001,2000]])assert.throws(()=>validateAsset(png(width,height),'large.png'),e=>e.code==='SDK_IMAGE_LIMIT');
 assert.equal(validateAsset(wav(10),'cue.wav').durationSeconds,10);assert.throws(()=>validateAsset(wav(10.1),'cue.wav'),e=>e.code==='SDK_AUDIO_DURATION_LIMIT');assert.throws(()=>validateAsset(Buffer.from('RIFFjunkWAVE'),'fake.wav'),e=>e.code==='SDK_ASSET_SIGNATURE');
 const first=wav(10.1),duplicate=Buffer.concat([first.subarray(0,36),first.subarray(12,36),first.subarray(36)]);duplicate.writeUInt32LE(duplicate.length-8,4);duplicate.writeUInt32LE(48000,48);duplicate.writeUInt32LE(48000,52);assert.throws(()=>validateAsset(duplicate,'ambiguous.wav'),e=>e.code==='SDK_ASSET_SIGNATURE');
 assert.throws(()=>validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[{time:10_001,values:{opacity:1}}]})),'motion.json'),e=>e.code==='SDK_ANIMATION_INVALID');
 const mp3=validateAsset(Buffer.from('ID3'),'cue.mp3');assert.equal(mp3.durationSeconds,null);assert(mp3.warnings.some(w=>w.code==='SDK_AUDIO_DURATION_UNVERIFIED'));
});
test('SDK asset aggregate, decoded memory and candidate counts are checked without writing files',t=>{
 const project=fixture(t),folder=assets(project);
 for(let i=0;i<4;i++)fs.writeFileSync(path.join(folder,i+'.png'),png(1,1,500_000));assert.equal(auditAssets(project).bytes,2_000_000);
 assert.throws(()=>auditAssets(project,{candidate:{file:'assets/new.svg',buffer:svg()}}),e=>e.code==='SDK_ASSET_TOTAL_LIMIT');assert(!fs.existsSync(path.join(folder,'new.svg')));
 for(const file of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,file));
 for(let i=0;i<3;i++)fs.writeFileSync(path.join(folder,i+'.png'),png(2000,2000));assert.throws(()=>auditAssets(project),e=>e.code==='SDK_DECODED_IMAGE_LIMIT');
 for(const file of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,file));
 for(let i=0;i<256;i++)fs.writeFileSync(path.join(folder,i+'.svg'),svg());assert.equal(auditAssets(project).files.length,256);assert.throws(()=>auditAssets(project,{candidate:{file:'assets/new.svg',buffer:svg()}}),e=>e.code==='SDK_ASSET_COUNT');assert(!fs.existsSync(path.join(folder,'new.svg')));
});
test('SDK excludes author documentation from runtime assets and catches files changed after audit',t=>{
 const project=fixture(t),folder=assets(project);fs.writeFileSync(path.join(folder,'README.md'),'Origin of the artwork');fs.writeFileSync(path.join(folder,'art.svg'),svg());
 const report=auditAssets(project);assert.equal(report.files.length,1);assert.deepEqual(report.documentation,['assets/README.md']);assert.equal(JSON.parse(prepareProject(project).text).assets.length,1);
 const {encodeSource}=require('../sdk/artifact.cjs'),{loadProject}=require('../sdk/project.cjs');fs.writeFileSync(path.join(folder,'art.svg'),svg().toString().replace(' ','\t'));assert.throws(()=>encodeSource(loadProject(project),report),e=>e.code==='SDK_ASSET_CHANGED');
});
test('asset import preflight counts shared and local closure without creating candidate files',t=>{
 const project=isolatedFixture(t),folder=assets(project),shared=path.join(project,'shared');fs.mkdirSync(path.join(shared,'assets'),{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(project,'manifest.json')));manifest.sharedAssets=['one.png','two.png','three.png'];fs.writeFileSync(path.join(project,'manifest.json'),JSON.stringify(manifest));
 for(const file of manifest.sharedAssets)fs.writeFileSync(path.join(shared,'assets',file),png(1,1,500_000));fs.writeFileSync(path.join(folder,'local.png'),png(1,1,450_000));
 const candidate={file:'assets/new.png',buffer:png(1,1,100_000),provenance:{license:'CC0-1.0',source:'Fixture'}};
 assert.equal(auditAssets(project,{candidate}).bytes,550_000,'a local-only inventory misses the actual shared resource total');
 assert.throws(()=>auditProjectAssetImport(project,candidate,{shared}),e=>e.code==='SDK_ASSET_TOTAL_LIMIT');assert.throws(()=>auditProjectAssetImport(project,candidate),e=>e.code==='SDK_SHARED_REQUIRED');assert(!fs.existsSync(path.join(folder,'new.png')));
 const source=path.join(project,'original.png'),metadata=path.join(project,'sdk/assets.json');fs.writeFileSync(source,candidate.buffer);fs.writeFileSync(metadata,'{"kept":{"source":"Existing provenance"}}');const before=fs.readFileSync(metadata);
 const importAsset=()=>spawnSync('python3',[path.resolve(root,'../boardgame-playroom-utils/sdk.py'),'--app',root,'import-asset',project,source,'--name','new.png','--license','CC0-1.0','--provenance','Fixture','--shared',shared],{encoding:'utf8',timeout:20000});
 const refused=importAsset();assert.equal(refused.status,1,refused.stderr);assert.match(JSON.parse(refused.stdout).message,/SDK_ASSET_TOTAL_LIMIT/);assert(!fs.existsSync(path.join(folder,'new.png')));assert.deepEqual(fs.readFileSync(metadata),before);assert.deepEqual(fs.readFileSync(source),candidate.buffer);
 candidate.buffer=png(1,1,50_000);const accepted=auditProjectAssetImport(project,candidate,{shared});assert.equal(accepted.assetBudget.bytes,2_000_000);assert.equal(accepted.assetBudget.count,5);assert(accepted.sourceBudget.bytes<4_000_000);assert(!fs.existsSync(path.join(folder,'new.png')));
 fs.writeFileSync(source,candidate.buffer);const imported=importAsset();assert.equal(imported.status,0,imported.stdout);const report=JSON.parse(imported.stdout);assert.equal(report.assetBudget.bytes,2_000_000);assert.equal(check(project,{shared}).budget.bytes,report.sourceBudget.bytes);assert.equal(compiledBytes(project,shared),report.installableBudget.bytes);assert.deepEqual(fs.readFileSync(source),candidate.buffer);assert.equal(fs.statSync(path.join(folder,'new.png')).size,50_000);assert.equal(JSON.parse(fs.readFileSync(metadata))['assets/new.png'].license,'CC0-1.0');
});
test('asset import preflight includes base64 and provenance in the complete source budget',t=>{
 const project=isolatedFixture(t);fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'x'.repeat(3_500_000)+'*/');
 assert.throws(()=>auditProjectAssetImport(project,{file:'assets/new.png',buffer:png(1,1,400_000),provenance:{license:'CC0',source:'Fixture'}}),e=>e.code==='SDK_PACK_SIZE_LIMIT');assert(!fs.existsSync(path.join(project,'assets/new.png')));
});

test('asset import refuses quote-heavy installable overflow before copying files or provenance',t=>{
 const project=isolatedFixture(t),folder=assets(project),metadata=path.join(project,'sdk/assets.json'),source=path.join(project,'candidate.png');fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'"'.repeat(950000)+'*/');fs.writeFileSync(metadata,'{"kept":{"source":"Immutable prior provenance"}}');const previous=fs.readFileSync(metadata),data=png(1,1,200000);fs.writeFileSync(source,data);
 assert(compiledBytes(project)<4_000_000,'the existing installable pack fits before import');
 assert.throws(()=>auditProjectAssetImport(project,{file:'assets/new.png',buffer:data,provenance:{license:'CC0',source:'Fixture'}}),e=>e.code==='SDK_PACK_SIZE_LIMIT'&&e.diagnostic.format==='playroom-pack'&&e.diagnostic.sourceBytes<4_000_000&&e.diagnostic.bytes>4_000_000,'source export fits while exact installed wire exceeds the ceiling');
 const result=spawnSync('python3',[path.resolve(root,'../boardgame-playroom-utils/sdk.py'),'--app',root,'import-asset',project,source,'--name','new.png','--license','CC0','--provenance','Fixture'],{encoding:'utf8',timeout:20000});assert.equal(result.status,1,result.stdout);assert.match(JSON.parse(result.stdout).message,/SDK_PACK_SIZE_LIMIT/);assert.deepEqual(fs.readFileSync(metadata),previous);assert.deepEqual(fs.readFileSync(source),data);assert(!fs.existsSync(path.join(folder,'new.png')));
});

test('accepted installable preflight equals actual compiler bytes including sounds UTF-8 and canonical asset order',t=>{
 const project=isolatedFixture(t),folder=assets(project),manifestFile=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.name='Звуки и иллюстрации 😀';manifest.sounds='sounds.js';fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.writeFileSync(path.join(project,'sounds.js'),'globalThis.PlayroomCatalog={probe:{sounds:{}}}; // Звук 😀\n');const descriptorFile=path.join(project,'sdk/project.json'),descriptor=JSON.parse(fs.readFileSync(descriptorFile));descriptor.support=['sounds.js'];fs.writeFileSync(descriptorFile,JSON.stringify(descriptor));
 fs.mkdirSync(path.join(folder,'a'));fs.writeFileSync(path.join(folder,'a/first.svg'),svg());fs.writeFileSync(path.join(folder,'z.svg'),svg());fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'"'.repeat(1000)+'*/');
 const source=path.join(project,'original.png');fs.writeFileSync(source,png(1,1,75000));const candidate={file:'assets/middle.png',buffer:fs.readFileSync(source),provenance:{license:'CC0-1.0',source:'Иллюстрация автора 😀'}};
 const before=auditProjectAssetImport(project,candidate);assert.equal(before.installableBudget.format,'playroom-pack');assert(before.installableBudget.bytes>before.sourceBudget.bytes);assert(!fs.existsSync(path.join(folder,'middle.png')));
 const imported=spawnSync('python3',[path.resolve(root,'../boardgame-playroom-utils/sdk.py'),'--app',root,'import-asset',project,source,'--name','middle.png','--license',candidate.provenance.license,'--provenance',candidate.provenance.source],{encoding:'utf8',timeout:20000});assert.equal(imported.status,0,imported.stdout);const report=JSON.parse(imported.stdout);assert.equal(report.installableBudget.bytes,before.installableBudget.bytes);assert.equal(compiledBytes(project),report.installableBudget.bytes);assert.equal(check(project).budget.bytes,report.sourceBudget.bytes);
});

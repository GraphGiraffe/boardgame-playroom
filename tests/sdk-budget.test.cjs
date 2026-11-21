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
 for(let i=0;i<512;i++)fs.writeFileSync(path.join(folder,i+'.svg'),svg());assert.equal(auditAssets(project).files.length,512);assert.throws(()=>auditAssets(project,{candidate:{file:'assets/new.svg',buffer:svg()}}),e=>e.code==='SDK_ASSET_COUNT');assert(!fs.existsSync(path.join(folder,'new.svg')));
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

test('asset import preflight rejects a converted sound above the verified duration limit',t=>{
 const project=isolatedFixture(t),file='assets/move.ogg';
 const provenance={license:'CC0-1.0',source:'Fixture',conversion:{durationSeconds:BUDGET.audioSeconds+.001}};
 assert.throws(()=>auditProjectAssetImport(project,{file,buffer:Buffer.from('OggS'),provenance}),
  error=>error.code==='SDK_AUDIO_DURATION_LIMIT'&&error.diagnostic.maxSeconds===BUDGET.audioSeconds);
 assert.equal(fs.existsSync(path.join(project,file)),false);
});

test('structured SDK keeps quote-heavy sources singly encoded and preserves import provenance',t=>{
 const project=isolatedFixture(t),folder=assets(project),metadata=path.join(project,'sdk/assets.json'),source=path.join(project,'candidate.png');fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'"'.repeat(950000)+'*/');fs.writeFileSync(metadata,'{"kept":{"source":"Immutable prior provenance"}}');const data=png(1,1,200000);fs.writeFileSync(source,data);
 const report=auditProjectAssetImport(project,{file:'assets/new.png',buffer:data,provenance:{license:'CC0',source:'Fixture'}});assert(report.installableBudget.bytes<4_000_000);assert(!fs.existsSync(path.join(folder,'new.png')));
 const result=spawnSync('python3',[path.resolve(root,'../boardgame-playroom-utils/sdk.py'),'--app',root,'import-asset',project,source,'--name','new.png','--license','CC0','--provenance','Fixture'],{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stdout);assert.equal(compiledBytes(project),report.installableBudget.bytes);assert.equal(JSON.parse(fs.readFileSync(metadata)).kept.source,'Immutable prior provenance');assert.deepEqual(fs.readFileSync(source),data);assert.deepEqual(fs.readFileSync(path.join(folder,'new.png')),data);
});

test('accepted installable preflight equals actual compiler bytes including sounds UTF-8 and canonical asset order',t=>{
 const project=isolatedFixture(t),folder=assets(project),manifestFile=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.name='Звуки и иллюстрации 😀';manifest.sounds='sounds.js';fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.writeFileSync(path.join(project,'sounds.js'),'globalThis.PlayroomCatalog={probe:{sounds:{}}}; // Звук 😀\n');const descriptorFile=path.join(project,'sdk/project.json'),descriptor=JSON.parse(fs.readFileSync(descriptorFile));descriptor.support=['sounds.js'];fs.writeFileSync(descriptorFile,JSON.stringify(descriptor));
 fs.mkdirSync(path.join(folder,'a'));fs.writeFileSync(path.join(folder,'a/first.svg'),svg());fs.writeFileSync(path.join(folder,'z.svg'),svg());fs.appendFileSync(path.join(project,'domain/game.js'),'/*'+'"'.repeat(1000)+'*/');
 const source=path.join(project,'original.png');fs.writeFileSync(source,png(1,1,75000));const candidate={file:'assets/middle.png',buffer:fs.readFileSync(source),provenance:{license:'CC0-1.0',source:'Иллюстрация автора 😀'}};
 const before=auditProjectAssetImport(project,candidate);assert.equal(before.installableBudget.format,'playroom-pack');assert(before.installableBudget.bytes>before.sourceBudget.bytes);assert(!fs.existsSync(path.join(folder,'middle.png')));
 const imported=spawnSync('python3',[path.resolve(root,'../boardgame-playroom-utils/sdk.py'),'--app',root,'import-asset',project,source,'--name','middle.png','--license',candidate.provenance.license,'--provenance',candidate.provenance.source],{encoding:'utf8',timeout:20000});assert.equal(imported.status,0,imported.stdout);const report=JSON.parse(imported.stdout);assert.equal(report.installableBudget.bytes,before.installableBudget.bytes);assert.equal(compiledBytes(project),report.installableBudget.bytes);assert.equal(check(project).budget.bytes,report.sourceBudget.bytes);
});

test('installable packs use structured SDK metadata, compact current notes and one settings schema',t=>{
 const project=isolatedFixture(t),file=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));
 manifest.releases=[{version:manifest.version,changes:['Первое изменение. '.repeat(30),'Второе изменение.','Третье изменение.','Четвёртое изменение.']},{version:'0.9.0-preview.1',changes:['Не включать в продовый пак.']},{version:'0.8.0',changes:['Старая история.']}];manifest.presetSetting={label:'Режим',options:[{value:'classic',label:'Классика'}]};manifest.settings=[{key:'duration',label:'Время',default:60,control:'slider',min:30,max:90,step:30}];manifest.ruleGroups=[{label:'Время',fields:['duration'],end:true}];fs.writeFileSync(file,JSON.stringify(manifest));
 const script="import runpy,sys,json;c=runpy.run_path(sys.argv[1]);b=c['build_pack'](sys.argv[2]);p={**b['sdk'],'manifest':b['manifest'],'catalogs':b['lang']};assert p['sourceHash']==c['isolated_source_hash'](p);print(c['json_text'](b))",result=spawnSync('python3',['-c',script,path.join(root,'tooling/pack_compiler.py'),project],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const bundle=JSON.parse(result.stdout),notes=Packs.localizedManifest(bundle).releases;
 assert.equal(bundle.formatVersion,2);assert.equal(typeof bundle.sdk,'object');assert(!Object.hasOwn(bundle.files,'sdk/source.json'));assert(!Object.hasOwn(bundle.sdk,'manifest'));assert(!Object.hasOwn(bundle.manifest,'presetSetting'));assert(!Object.hasOwn(bundle.manifest,'ruleGroups'));assert.equal(notes.length,1);assert.equal(notes[0].version,manifest.version);assert(notes[0].changes.length<=3);assert(notes[0].changes.join('').length<=320);assert(!JSON.stringify(notes).includes('preview'));
 const settings=bundle.manifest.settings;assert.equal(settings.fields[0].kind,'preset');assert.equal(settings.fields[0].control,'select');assert.deepEqual(settings.fields[1].options.map(option=>option.value),[30,60,90]);assert.equal(settings.fields[1].valueType,'integer');assert.equal(settings.groups[0].placement,'end');assert.equal(Packs.runtimeManifest(Packs.localizedManifest(bundle)).presetSetting.label,'Режим');assert.equal(Packs.sdkSource(bundle).manifest,bundle.manifest);assert.deepEqual(Packs.parse(JSON.stringify(bundle,null,2)),bundle,'ordinary JSON formatting round trips');assert.deepEqual(JSON.parse(fs.readFileSync(file)),manifest,'source author history stays untouched');
 const invalid=structuredClone(bundle);invalid.manifest.settings.groups[0].fields=['missing'];assert.throws(()=>Packs.parse(invalid),/PACK_SETTINGS_GROUP_INVALID/);invalid.manifest.settings.groups[0].fields=['duration'];invalid.manifest.settings.fields[1].default='60';assert.throws(()=>Packs.parse(invalid),/PACK_SETTINGS_INVALID/);
});

test('pack lang is the sole catalog and SDK presentation selects locale with fallback',async t=>{
 const project=isolatedFixture(t),file=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));fs.mkdirSync(path.join(project,'lang'));
 const ru={name:'Игра',label:'Секунды',help:'Резервная подсказка'},en={name:'Game',label:'Seconds'};
 for(const [locale,catalog] of Object.entries({ru,en}))fs.writeFileSync(path.join(project,'lang',locale+'.json'),JSON.stringify(catalog));
 manifest.name={key:'name'};manifest.defaultLanguage='ru';manifest.sourceModules.locales={ru:['lang/ru.json'],en:['lang/en.json']};manifest.settings=[{key:'duration',label:{key:'label'},help:{key:'help'},default:60,control:'select',options:[{value:60,label:{key:'label'}}]}];manifest.ruleGroups=[{label:{key:'label'},fields:['duration']}];fs.writeFileSync(file,JSON.stringify(manifest));
 fs.writeFileSync(path.join(project,'presentation/scene.js'),"globalThis.PlayroomPackPresentation={metadata:{name:SDK.text('name'),description:SDK.text('help')},scene:()=>({contractVersion:1,id:'probe',family:'board',players:[0,1].map(player=>({player,metrics:[]}))})};");
 const run=()=>spawnSync('python3',['-c',"import runpy,sys;c=runpy.run_path(sys.argv[1]);print(c['json_text'](c['build_pack'](sys.argv[2])))",path.join(root,'tooling/pack_compiler.py'),project],{encoding:'utf8'}),result=run();assert.equal(result.status,0,result.stderr);const bundle=Packs.parse(result.stdout);assert.deepEqual(bundle.lang,{ru,en});assert(!Object.hasOwn(bundle.sdk,'catalogs'));assert.deepEqual(Packs.sdkSource(bundle).catalogs,bundle.lang);assert.deepEqual(bundle.manifest.name,{key:'name'});assert.equal(Packs.localizedManifest(bundle,'en').name,'Game');assert.equal(Packs.localizedManifest(bundle,'en').settings.fields[0].help,ru.help);
 const host=await require('../sdk/node-host.cjs').createNodeHost(),loaded=require('../sdk/project.cjs').loadProject(project,{locale:'en'}),metadata=host.metadata(loaded);assert.equal(metadata.name,'Game');assert.equal(metadata.description,ru.help);
 const duplicate=structuredClone(bundle);duplicate.sdk.catalogs=duplicate.lang;assert.throws(()=>Packs.parse(duplicate),/PACK_LANG_DUPLICATE/);
 delete ru.name;fs.writeFileSync(path.join(project,'lang/ru.json'),JSON.stringify(ru));assert.notEqual(run().status,0,'missing default-language key prevents installation');
});

test('compact parameters keep ranges, shared descriptions, numeric labels and app words off the wire',t=>{
 const project=isolatedFixture(t),file=path.join(project,'manifest.json'),m=JSON.parse(fs.readFileSync(file));fs.mkdirSync(path.join(project,'lang'));
 fs.writeFileSync(path.join(project,'lang/ru.json'),JSON.stringify({help:'Время на рисование'}));fs.writeFileSync(path.join(project,'lang/en.json'),JSON.stringify({help:'Drawing time'}));m.sourceModules.locales={ru:['lang/ru.json'],en:['lang/en.json']};m.estimatedDurationMin=[20,40];
 m.settings={fields:[{key:'duration',kind:'option',valueType:'integer',control:'slider',default:60,unit:'s',range:{min:30,max:180,step:1},optionDefaults:{description:{key:'help'}}},{key:'flag',kind:'option',valueType:'string',control:'select',default:'on',options:[{value:'off',label:{common:'no'}},{value:'on',label:{common:'yes'}}]},{key:'passes',kind:'option',valueType:'string',control:'select',default:'3',optionDefaults:{description:{key:'help'}},options:[{value:'3'},{value:'0',label:{common:'infinity'},description:null}]}],groups:[]};fs.writeFileSync(file,JSON.stringify(m));
 const compile=()=>spawnSync('python3',['-c',"import runpy,sys;c=runpy.run_path(sys.argv[1]);print(c['json_text'](c['build_pack'](sys.argv[2])))",path.join(root,'tooling/pack_compiler.py'),project],{encoding:'utf8'}),r=compile();assert.equal(r.status,0,r.stderr);const b=Packs.parse(r.stdout),f=b.manifest.settings.fields[0];assert.deepEqual(f.range,{min:30,max:180,step:1});assert(!f.options);assert.deepEqual(f.optionDefaults,{description:{key:'help'}});assert(!b.lang.ru['manifest.estimatedDuration']);
 const runtime=Packs.runtimeManifest(Packs.localizedManifest(b,'en'),'en');assert.equal(runtime.estimatedDuration,'20–40 min');assert.equal(runtime.settings[0].options.length,151);assert.equal(runtime.settings[0].options[0].label,'30 s');assert.equal(runtime.settings[0].options[0].description,'Drawing time');assert.equal(runtime.settings[1].options[1].label,'Yes');assert.equal(runtime.settings[1].options[1].value,'on');assert.equal(runtime.settings[2].options[0].value,'3');assert.equal(runtime.settings[2].options[1].label,'∞');assert(!Object.hasOwn(runtime.settings[2].options[1],'description'));
 const invalid=structuredClone(b);invalid.manifest.settings.fields[0].range.step=0;assert.throws(()=>Packs.parse(invalid),/PACK_SETTINGS_RANGE_INVALID/);m.settings.fields[0].range.step=0;fs.writeFileSync(file,JSON.stringify(m));assert.notEqual(compile().status,0);const wrong=structuredClone(b);wrong.manifest.estimatedDurationMin=[40,20];assert.throws(()=>Packs.parse(wrong),/PACK_DURATION_INVALID/);
});

test('512 declarations compile and load in Studio, while both entries reject 513',t=>{
 const project=isolatedFixture(t),descriptor=path.join(project,'sdk/project.json');
 const spec=JSON.parse(fs.readFileSync(descriptor)),{loadProject}=require('../sdk/project.cjs');
 spec.types=Array.from({length:512},(_,i)=>'sdk/type-'+i+'.d.ts');
 for(const name of spec.types)fs.writeFileSync(path.join(project,name),'export {};');
 fs.writeFileSync(descriptor,JSON.stringify(spec));
 assert.equal(loadProject(project).types.length,512);
 const folder=assets(project);
 for(let i=0;i<512;i++)fs.writeFileSync(path.join(folder,i+'.svg'),svg());
 assert.equal(loadProject(project).resourceAssets.length,512);
 assert(compiledBytes(project)>0);
 const extra=path.join(folder,'extra.svg');fs.writeFileSync(extra,svg());
 assert.throws(()=>loadProject(project),e=>e.code==='SDK_ASSET_TOTAL_LIMIT');
 assert.throws(()=>compiledBytes(project),/SDK_ASSET_TOTAL_LIMIT/);
 fs.unlinkSync(extra);
 spec.types.push('sdk/extra.d.ts');fs.writeFileSync(path.join(project,'sdk/extra.d.ts'),'export {};');
 fs.writeFileSync(descriptor,JSON.stringify(spec));
 assert.throws(()=>loadProject(project),e=>e.code==='SDK_TYPES_INVALID');
 assert.throws(()=>compiledBytes(project),/SDK_TYPES_INVALID.*sdk\/project\.json.*types/);
});

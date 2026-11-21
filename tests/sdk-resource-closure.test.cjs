'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {fixture}=require('./sdk-fixture.cjs'),{loadProject,inspectProject}=require('../sdk/project.cjs');
const packs=process.env.PLAYROOM_PACKS_ROOT||path.dirname(fs.realpathSync(path.join(__dirname,'../packs')));
function project(t){const root=fixture(t);const file=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));Object.assign(manifest,{name:'Animation fixture',engineApi:4,viewApi:3,stateVersion:1});fs.writeFileSync(file,JSON.stringify(manifest));fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'config'));return root;}
function python(root,{distribution=false,shared}={}){
 const script=`import json,runpy,sys
c=runpy.run_path(sys.argv[1])
p=c['isolated_source_payload'](sys.argv[2],sys.argv[4] if len(sys.argv)>4 else None)
result=c['isolated_distribution'](p) if sys.argv[3]=='distribution' else {'assets':p['assets'],'closure':p['resourceClosure'],'hash':p['sourceHash']}
print(json.dumps(result))`;
 return JSON.parse(execFileSync('python3',['-c',script,path.join(packs,'shared/pack_compiler.py'),root,distribution?'distribution':'source',...(shared?[shared]:[])],{encoding:'utf8'}));
}
test('a character uses its available print when the requested print is omitted',()=>{
 const {characterAssetFiles,characterFace}=require('../core/game-components.js');
 const id='circle-red';
 for(const [available,missing] of [['simple','minimal'],['minimal','simple']]){
  const canonical=`assets/shared-packs/characters-${available}/runtime/${id}.svg`;
  const legacy=`assets/archive/characters-${available}/${id}.svg`;
  const known=characterAssetFiles(new Set([legacy,canonical]),id);
  assert.equal(known[available],canonical);
  assert.equal(known[missing],undefined);
  const art=characterFace({character:id,characterSources:known},{variant:missing});
  assert(art.includes(`data-character-style="${available}"`));
  assert(art.includes(`href="${canonical}"`));
 }
});
test('card back lookup keeps canonical and legacy order across resource changes',()=>{
 const {SceneImages,indexResources}=require('../platform/web/scene-images.js');
 const svg=file=>({file,sha256:file,data:'<svg/>',mime:'image/svg+xml',encoding:'utf8'});
 const legacy='assets/archive/mini-split-deck/back.svg';
 const fallback='assets/archive/standard-deck/back.svg';
 const canonical='assets/shared-packs/mini-split-deck/back.svg';
 const images=new SceneImages();
 try{
  images.prepare(indexResources([svg('assets/cover.svg'),svg(fallback),svg(legacy),svg(canonical)]));
  assert.equal(images.cardBackURL('mini-split-deck'),images.get(canonical).url);
  assert.equal(images.cardBackURL(),images.get(fallback).url);
  assert.equal(images.cardBackURL('missing-deck'),'');
  images.prepare(indexResources([svg(legacy),svg(fallback)]));
  assert.equal(images.cardBackURL('mini-split-deck'),images.get(legacy).url);
  assert.equal(images.cardBackURL(),images.get(legacy).url);
 }finally{images.release();}
});
test('installed image URLs survive until the last view releases the resource',async()=>{
 const {SceneImages,indexResources}=require('../platform/web/scene-images.js');
 const file='assets/face.svg';
 const index=(sha256,data)=>indexResources(Object.freeze([Object.freeze({file,sha256,data,mime:'image/svg+xml',encoding:'utf8'})]));
 const base=index('base','<svg><title>Base</title></svg>'),replacement=index('next','<svg><title>Next</title></svg>');
 const field=new SceneImages(),reveal=new SceneImages();
 try{
  field.prepare(base);reveal.prepare(base);
  const original=field.get(file).url;
  assert.equal(reveal.get(file).url,original);
  reveal.prepare(replacement);
  const updated=reveal.get(file).url;
  assert.notEqual(updated,original);
  assert.match(await (await fetch(original)).text(),/Base/);
  field.release();
  await assert.rejects(fetch(original));
  assert.match(await (await fetch(updated)).text(),/Next/);
  reveal.release();
  await assert.rejects(fetch(updated));
 }finally{field.release();reveal.release();}
});
test('local JSON animations belong to the audited media closure and retain Node/Python parity',t=>{
 const root=project(t),animation=JSON.stringify({contractVersion:1,frames:[{time:0,values:{opacity:0}},{time:150,values:{opacity:1}}]});
 fs.writeFileSync(path.join(root,'assets/motion.json'),animation);fs.writeFileSync(path.join(root,'assets/README.md'),'Original notes');fs.writeFileSync(path.join(root,'config/options.json'),'{"mode":"classic"}');
 const node=loadProject(root),other=python(root);assert.deepEqual(node.resourceAssets,other.assets);assert.deepEqual(node.resourceClosure,other.closure);assert.equal(node.hash,other.hash);
 const asset=require('../sdk/project.cjs').publicResources(node).animations['assets/motion.json'];
 assert.equal(asset,node.animations['assets/motion.json']);
 assert.deepEqual(asset,{duration:150,keyframes:[{offset:0,opacity:0},{offset:1,opacity:1}]});
 assert(Object.isFrozen(asset.keyframes));
 assert.equal(node.resourceAssets[0].file,'assets/motion.json');assert.equal(node.resourceAudit.files[0].mime,'application/json');assert.equal(node.resourceAudit.bytes,Buffer.byteLength(animation));assert.deepEqual(node.resourceAudit.documentation,['assets/README.md']);assert.equal(node.resourceClosure.data[0].file,'config/options.json');
});
test('local JSON cannot bypass animation validation through the data catalog port',t=>{
 const root=project(t);fs.writeFileSync(path.join(root,'assets/motion.json'),JSON.stringify({contractVersion:1,frames:[{time:0,values:{onload:1}}]}));
 assert.throws(()=>loadProject(root),e=>e.code==='SDK_ANIMATION_INVALID');assert.throws(()=>python(root),/SDK_ANIMATION_INVALID/);
});

test('SDK narrows transitive catalog items and verifies their actual references',async t=>{
 const root=project(t),shared=path.join(root,'shared');
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="4"/></svg>';
 const manifestFile=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
 manifest.sharedAssets=['token.svg'];
 manifest.sharedAssetPacks=['deck'];
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 fs.mkdirSync(path.join(shared,'assets'),{recursive:true});
 fs.writeFileSync(path.join(shared,'assets/token.svg'),svg);
 for(const [id,extra,files] of [
  ['faces',{items:[{id:'heart',file:'heart.svg'},{id:'spade',file:'spade.svg'}]},{'heart.svg':svg,'spade.svg':svg}],
  ['deck',{dependencies:[{id:'faces',version:'1.0.0'}],files:['renderer.js'],scripts:['renderer.js']},{'renderer.js':'void 0;'}],
 ]){
  const base=path.join(shared,'asset-packs',id);
  fs.mkdirSync(base,{recursive:true});
  fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify({format:'playroom-asset-pack',formatVersion:1,id,version:'1.0.0',...extra}));
  for(const [name,source] of Object.entries(files))fs.writeFileSync(path.join(base,name),source);
 }
 const descriptorFile=path.join(root,'sdk/project.json');
 const descriptor=JSON.parse(fs.readFileSync(descriptorFile));
 const select=assetItems=>fs.writeFileSync(descriptorFile,JSON.stringify({...descriptor,assetItems}));
 select({faces:['heart']});
 const {resourceUsage}=inspectProject(root,{shared}),studio=loadProject(root,{shared}),built=python(root,{shared});
 assert.deepEqual(studio.resourceAssets,built.assets);
 assert.deepEqual(studio.resourceClosure,built.closure);
 assert.equal(studio.hash,built.hash);
 assert.equal(resourceUsage.scope,'declared-resource-closure');
 assert.deepEqual(resourceUsage.assetPacks,[
  {id:'faces',version:'1.0.0',direct:false,requiredBy:['deck'],items:{available:2,selected:['heart']}},
  {id:'deck',version:'1.0.0',direct:true,requiredBy:[]},
 ]);
 const byFile=new Map(resourceUsage.files.map(file=>[file.file,file]));
 assert.equal(byFile.size,3);
 assert.equal(resourceUsage.budget.assetCount,2);
 assert.deepEqual(byFile.get('assets/shared/token.svg').declaredBy,['sharedAssets']);
 assert.deepEqual(byFile.get('assets/shared-packs/faces/heart.svg').declaredBy,['items']);
 assert.deepEqual(byFile.get('assets/shared-packs/deck/renderer.js'),{
  file:'assets/shared-packs/deck/renderer.js',kind:'provider',bytes:7,role:'asset-provider',delivery:'source-only',assetPack:'deck',declaredBy:['files','scripts'],
 });
 const face='assets/shared-packs/faces/heart.svg';
 assert(!byFile.has('assets/shared-packs/faces/spade.svg'));
 assert.deepEqual(python(root,{shared,distribution:true}).sdk.assets,built.assets);
 const {verify}=require('../sdk/verify.cjs');
 const graphic='<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4"/></svg>';
 fs.appendFileSync(path.join(root,'domain/game.js'),`
 const baseReduce=PlayroomPackDefinition.reduce;
 PlayroomPackDefinition.reduce=(position,actor,command,context)=>({
  ...baseReduce(position,actor,command,context),
  events:['sound','common','missing'].map(name=>({type:'probe.'+name,actor,params:{},visibility:{kind:'public'}}))
 });`);
 fs.appendFileSync(path.join(root,'presentation/scene.js'),`
 let viewGraphic;
 globalThis.PlayroomPackRuleIllustrations={graphics:()=>({
  display:${JSON.stringify(graphic)},unused:${JSON.stringify(graphic)},
  ...(viewGraphic?{[viewGraphic]:${JSON.stringify(graphic)}}:{})
 })};
 PlayroomPackPresentation.metadata={cover:SDK.resource('assets/shared/token.svg')};
 globalThis.PlayroomCatalog={probe:{sounds:{
  draw:{label:'Pack draw',notes:[{frequency:200,duration:.08}]},
  'fixture-active':{label:'Active'},'fixture-phase':{label:'Phase'},'fixture-spare':{label:'Spare'}
 }}};
 PlayroomPackPresentation.event=event=>({kind:'move',sound:{id:({'probe.sound':'fixture-active','probe.common':'move','probe.missing':'missing-event-sound'})[event.type]}});
 const baseScene=PlayroomPackPresentation.scene;
 PlayroomPackPresentation.scene=projection=>{
  viewGraphic='generated-view-'+(projection.viewer+1);
  return {...baseScene(projection),
   commandParameters:{variant:{label:'Variant',values:[
    {value:'display',art:{kind:'graphic',id:'display'}},
    {value:'generated',art:{kind:'graphic',id:viewGraphic}}
   ]}},dice:[{value:1,face:SDK.resource(${JSON.stringify(face)})}],
   ...(projection.revision?{plan:{id:'phase',initial:0,final:1,scenes:[{},{}],
    groups:[{scene:0,duration:100,cues:[{id:'phase-sound',kind:'sound',sounds:['fixture-phase','draw','notify','missing-phase-sound']}]}]
   }}:{})};
 };`);
 fs.writeFileSync(path.join(root,'sdk/scenarios.json'),JSON.stringify({
  contractVersion:1,scenarios:[{id:'setup-only',steps:[]}]
 }));
 const references=(await verify(root,{shared,steps:1,seeds:[1]})).resourceReferences;
 assert.deepEqual(references.observed,[face,'assets/shared/token.svg']);
 assert.deepEqual(references.scenarioAssets,[face]);
 assert.deepEqual(references.notObservedInScenarios,['assets/shared/token.svg']);
 assert.deepEqual(references.sources[face],['scene']);
 assert.deepEqual(references.sources['assets/shared/token.svg'],['metadata']);
 assert.deepEqual(references.graphics,{declared:['display','unused'],referenced:['display'],unresolvedReferences:0,dynamicReferences:9});
 assert.deepEqual(references.sounds,{declared:['draw','fixture-active','fixture-phase','fixture-spare'],
  selected:['fixture-active'],phases:['draw','fixture-phase'],host:{selected:['move'],phases:['notify']},unresolved:{selected:1,phases:1}});
 assert.doesNotMatch(JSON.stringify(references.sounds),/missing-(event|phase)-sound/);
 assert.deepEqual(references.runs,[
  {seed:1,frames:6,viewers:[-1,0,1],assets:[face],assetSets:[],skinAssets:[],graphics:['display'],assetMethods:[],
   sounds:{selected:['fixture-active'],phases:['draw','fixture-phase'],host:{selected:['move'],phases:['notify']}}},
  {scenario:'setup-only',frames:3,viewers:[-1,0,1],assets:[face],assetSets:[],skinAssets:[],graphics:['display'],assetMethods:[],
   sounds:{selected:[],phases:[],host:{selected:[],phases:[]}}}
 ]);
 select({faces:[]});
 await assert.rejects(verify(root,{shared,steps:1,seeds:[1]}),error=>
  error.code==='SDK_RESOURCE_REFERENCE_MISSING'&&error.diagnostic.source==='scene'&&!JSON.stringify(error.diagnostic).includes(face));
 for(const [selection,code] of [
  [{faces:['heart','heart']},'SDK_ASSET_ITEMS_INVALID'],
  [{faces:['unknown']},'SDK_ASSET_ITEM_UNKNOWN'],
  [{unused:['heart']},'SDK_ASSET_ITEMS_PACK_UNUSED'],
 ]){
  select(selection);
  assert.throws(()=>loadProject(root,{shared}),error=>error.code===code);
  assert.throws(()=>python(root,{shared}),new RegExp(code));
 }
});

test('an authored die print inherits placement, roll and reveal with a single family in the closure',async t=>{
 const root=project(t),shared=path.join(packs,'shared'),descriptorFile=path.join(root,'sdk/project.json');
 const descriptor=JSON.parse(fs.readFileSync(descriptorFile));
 const modules=['shared/presentation/asset.js','shared/presentation/die-asset.js'];
 descriptor.presentation.unshift(...modules);
 fs.writeFileSync(descriptorFile,JSON.stringify(descriptor));
 fs.appendFileSync(path.join(root,'presentation/scene.js'),`
 class Octahedron extends PlayroomDieAsset {
  print(value,options){return {...super.print(value,options),label:'Face '+value};}
 }
 const octahedron=new Octahedron(),baseScene=PlayroomPackPresentation.scene;
 PlayroomPackPresentation.scene=projection=>({...baseScene(projection),
  dice:[octahedron.describe(8)],zones:[{id:'field',kind:'board'}],
  objects:[octahedron.place(0,'field',0)]});
 PlayroomPackPresentation.metadata={dieReveal:octahedron.reveal([8],undefined,[true])};`);
 const {StudioSession}=require('../sdk/runtime.cjs');
 const {modules:loaded,resourceUsage}=inspectProject(root,{shared});
 assert.deepEqual(loaded.presentation,[...modules,'presentation/scene.js']);
 assert.equal(resourceUsage.budget.assetCount,0);
 const studio=await StudioSession.open(root,{shared});
 try{
  await studio.start();
  const {scene}=await studio.view(0);
  assert.deepEqual(scene.dice,[{value:8,held:false,motion:'roll',label:'Face 8'}]);
  assert.deepEqual(scene.objects,[{ref:{namespace:'die',id:'0'},zone:'field',index:0}]);
  assert.deepEqual((await studio.metadata()).dieReveal,{kind:'dice',dice:[{value:8,active:true,label:'Face 8'}]});
 }finally{studio.close();}
 const result=await require('../sdk/verify.cjs').verify(root,{shared,seeds:[17],steps:1});
 const observed=result.resourceReferences.assetMethods;
 assert.deepEqual(observed.profiles.find(profile=>profile.name==='DieAsset'),{
  file:modules[1],name:'DieAsset',observed:['print','reveal'],notObserved:[]
 });
 assert.deepEqual(observed.metadata,['Asset.describe','DieAsset.print','DieAsset.reveal']);
 assert.deepEqual(observed.printOverrides,{observed:['DieAsset.print'],metadata:['DieAsset.print']});
 assert.deepEqual(result.resourceReferences.runs[0].assetMethods,
  ['Asset.describe','Asset.place','Asset.ref','DieAsset.print','DieAsset.reveal']);
 assert(observed.profiles.find(profile=>profile.name==='Asset').notObserved.includes('activate'));
 const sceneFile=path.join(root,'presentation/scene.js');
 const sceneSource=fs.readFileSync(sceneFile,'utf8');
 const inherited="return {...super.print(value,options),label:'Face '+value};";
 assert(sceneSource.includes(inherited));
 fs.writeFileSync(sceneFile,sceneSource.replace(inherited,"return {value, label:'Custom '+value};"));
 const custom=await require('../sdk/verify.cjs').verify(root,{shared,seeds:[17],steps:1});
 const references=custom.resourceReferences;
 assert.deepEqual(references.assetMethods.profiles.find(profile=>profile.name==='DieAsset').observed,['reveal']);
 assert.deepEqual(references.assetMethods.printOverrides,{observed:['DieAsset.print'],metadata:['DieAsset.print']});
 assert.deepEqual(references.runs[0].assetPrintOverrides,['DieAsset.print']);
});

test('the SDK and installable board packs report only their selected token profiles',()=>{
 const shared=path.join(packs,'shared');
 for(const [id,hasRoute] of [['checkers',false],['ludo',true],['snakes',true]]){
  const root=path.join(packs,'packs',id);
  const {resourceUsage}=inspectProject(root,{shared});
  const {sdk:{sources}}=python(root,{shared,distribution:true});
  const sharedPresentation=resourceUsage.sdkModules.filter(row=>row.group==='presentation'&&row.origin==='shared');
  const modules=['asset.js','token-asset.js',...(hasRoute?['route-token-asset.js']:[])].map(file=>'shared/presentation/'+file);
  assert.deepEqual(sharedPresentation.map(row=>row.file),modules,id);
  assert.deepEqual(sources.presentation.filter(row=>row.file.startsWith('shared/')).map(row=>row.file),modules,id);
  for(const row of sharedPresentation)assert.equal(row.bytes,Buffer.byteLength(sources.presentation.find(source=>source.file===row.file).source));
 }
});

test('each scenario reports asset methods used by a cached event presentation',async t=>{
 const root=project(t),shared=path.join(packs,'shared'),descriptorFile=path.join(root,'sdk/project.json');
 const descriptor=JSON.parse(fs.readFileSync(descriptorFile));
 descriptor.presentation.unshift('shared/presentation/asset.js','shared/presentation/die-asset.js');
 fs.writeFileSync(descriptorFile,JSON.stringify(descriptor));
 fs.appendFileSync(path.join(root,'domain/game.js'),`
 PlayroomPackDefinition.reduce=position=>({position,events:[
  {type:'probe.roll',actor:0,params:{},visibility:{kind:'public'}}
 ]});`);
 fs.appendFileSync(path.join(root,'presentation/scene.js'),`
 class CustomDie extends PlayroomDieAsset {
  print(value){return {value,label:'Custom die'};}
 }
 const die=new CustomDie();
 PlayroomPackPresentation.metadata={eventInputs:'facts'};
 PlayroomPackPresentation.event=()=>({kind:'move',reveal:die.reveal([8])});`);
 fs.writeFileSync(path.join(root,'sdk/scenarios.json'),JSON.stringify({
  contractVersion:1,scenarios:[
   {id:'reuse-roll',steps:[{actor:0,command:{type:'step'}}]},
   {id:'setup-without-roll',steps:[]}
  ]
 }));
 const {resourceReferences}=await require('../sdk/verify.cjs').verify(root,{shared,steps:1,seeds:[17,29]});
 assert.deepEqual(resourceReferences.assetMethods.metadata,[]);
 assert.deepEqual(resourceReferences.assetMethods.printOverrides.metadata,[]);
 for(const run of resourceReferences.runs.slice(0,3)){
  assert.deepEqual(run.assetMethods,['Asset.describe','DieAsset.reveal'],JSON.stringify(run));
  assert.deepEqual(run.assetPrintOverrides,['DieAsset.print']);
 }
 const setup=resourceReferences.runs.at(-1);
 assert.equal(setup.scenario,'setup-without-roll');
 assert.deepEqual(setup.assetMethods,[]);
 assert.equal(setup.assetPrintOverrides,undefined);
});

test('tile profiles keep hidden identity away from overrides and include connections only for the chain',()=>{
 const shared=path.join(packs,'shared');
 const Tile=require(path.join(shared,'presentation/tile-asset.js'));
 const ChainTile=require(path.join(shared,'presentation/chain-tile-asset.js'));
 class CustomTile extends Tile {
  print(){throw Error('Only a visible face reaches the override');}
 }
 assert.deepEqual(new CustomTile('slot').describe({hidden:true,id:'back-only',a:1,b:2}),{hidden:true});
 assert.throws(()=>new ChainTile().reveal({hidden:true}),/SDK_TILE_REVEAL_HIDDEN/);
 for(const [id,chain] of [['pexeso',false],['domino',true]]){
  const root=path.join(packs,'packs',id);
  const {resourceUsage}=inspectProject(root,{shared});
  const {sdk:{sources}}=python(root,{shared,distribution:true});
  const connection='shared/domain/tile-connection.js',placement='shared/presentation/chain-tile-asset.js';
  const required=[connection,placement];
  assert.deepEqual(resourceUsage.sdkModules.filter(row=>required.includes(row.file)).map(row=>row.file),chain?required:[],id);
  assert.equal(sources.dependencies.some(row=>row.file===connection),chain,id);
  assert.equal(sources.presentation.some(row=>row.file===placement),chain,id);
 }
});

test('boards use the same cell port while only the category ledger ships the table profile',()=>{
 const shared=path.join(packs,'shared');
 for(const [id,ledger] of [['tictactoe',false],['fleet-grid',false],['dice-poker',true]]){
  const root=path.join(packs,'packs',id),module='shared/presentation/score-table-asset.js';
  const {resourceUsage}=inspectProject(root,{shared});
  const {sdk:{sources}}=python(root,{shared,distribution:true});
  assert(resourceUsage.sdkModules.some(row=>row.file==='shared/presentation/board-asset.js'),id);
  assert.equal(resourceUsage.sdkModules.some(row=>row.file===module),ledger,id);
  assert.equal(sources.presentation.some(row=>row.file===module),ledger,id);
 }
});

test('Markdown rules use the current source in the SDK and the packaging compiler',async t=>{
 const root=project(t),manifestFile=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
 const rulebook='rules/ru.md';
 for(const dir of ['lang','rules'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'lang/ru.json'),'{}');
 fs.writeFileSync(path.join(root,'lang/en.json'),'{}');
 fs.writeFileSync(path.join(root,'rules/en.md'),'# Goal\n\nChoose a card.\n');
 manifest.sourceModules={locales:{ru:['lang/ru.json'],en:['lang/en.json']},rulebooks:{ru:rulebook,en:'rules/en.md'}};
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,rulebook),'# Цель\n\n**Выберите** карту.\n\n| Карта | Действие |\n| --- | --- |\n| X | Поставить |\n');
 const first=loadProject(root),packed=python(root);
 assert.deepEqual(first.resourceClosure.rulebooks,packed.closure.rulebooks);
 assert.equal(first.hash,packed.hash);
 assert.equal(first.resourceClosure.rulebooks.ru.sections[0].blocks[1].type,'table');
 assert.equal(fs.existsSync(path.join(root,'sdk/rulebooks.json')),false);
 const distribution=python(root,{distribution:true}),books=distribution.sdk.resourceClosure.rulebooks;
 const enTitle=books.en.sections[0].title.key,ruBlocks=books.ru.sections[0].blocks;
 assert.equal(distribution.lang.en[enTitle],'Goal');
 assert.equal(Object.hasOwn(distribution.lang.ru,enTitle),false);
 assert.equal(distribution.lang.ru[ruBlocks[0].text[0].children[0].key],'Выберите');
 assert.equal(distribution.lang.ru[ruBlocks[1].rows[0][1][0].key],'Поставить');
 const {Translator}=require('../presentation/localization.js');
 for(const locale of ['ru','en'])assert.deepEqual(new Translator({catalogs:distribution.lang,locale}).resolve(books[locale]),first.resourceClosure.rulebooks[locale]);
 fs.appendFileSync(path.join(root,'presentation/scene.js'),
  '\nconst resources=PlayroomPackResources; PlayroomPackPresentation.metadata={ruleTitle:resources.rulebooks[resources.locale].sections[0].title};');
 const studio=await require('../sdk/runtime.cjs').StudioSession.open(root,{locale:'en'});
 try{assert.equal((await studio.metadata()).ruleTitle,'Goal');}finally{studio.close();}

 fs.appendFileSync(path.join(root,rulebook),'\n# Победа\n\nНаберите очки.\n');
 const edited=loadProject(root);
 assert.notEqual(edited.hash,first.hash);
 assert.equal(edited.hash,python(root).hash);
 assert.equal(edited.resourceClosure.rulebooks.ru.sections[1].title,'Победа');
 fs.writeFileSync(path.join(root,rulebook),'Текст перед заголовком');
 assert.throws(()=>loadProject(root),error=>error.code==='SDK_RULEBOOK_INVALID'&&error.diagnostic.file===rulebook);
});

test('separate settings assemble once with identical Node and compiler semantics',t=>{
 const root=project(t),file=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));
 const settings={fields:[
  {key:'target',kind:'option',valueType:'integer',control:'slider',default:6,range:{min:3,max:9,step:3}},
  {key:'repeat',kind:'option',valueType:'boolean',control:'select',default:false,options:[{value:false},{value:true}]},
  {key:'weight',kind:'option',valueType:'number',control:'select',default:0.25,options:[{value:0.25},{value:0.5}]},
  {key:'legacy',kind:'option',valueType:'string',control:'select',default:'2',options:[{value:'1'},{value:'2'}]}
 ],groups:[]};
 const inlineManifest={...manifest,settings,tagline:'Metadata after settings'};
 fs.writeFileSync(file,JSON.stringify(inlineManifest));
 const inline=loadProject(root);
 fs.writeFileSync(path.join(root,'config/settings.json'),JSON.stringify(settings));
 fs.writeFileSync(file,JSON.stringify({...inlineManifest,settings:'config/settings.json'}));
 const separate=loadProject(root),compiler=python(root);
 assert.equal(separate.hash,inline.hash);
 assert.equal(separate.hash,compiler.hash);
 assert.deepEqual(separate.configuration.settings[0].options.map(option=>option.value),[3,6,9]);
 const {modelOptions}=require('../core/packs.js');
 const selections=Object.freeze({target:'3',repeat:'false',weight:'0.5',legacy:'1',resolvedFirstPlayer:1});
 const decode=values=>modelOptions(separate.manifest,separate.configuration,values);
 assert.deepEqual(decode(selections),{...selections,target:3,repeat:false,weight:0.5});
 assert.deepEqual(decode({repeat:'true'}),{target:6,repeat:true,weight:0.25});
 assert.throws(()=>decode({target:'4'}),{code:'PACK_SETTING_VALUE_INVALID',field:'target'});
 assert.equal(modelOptions({...separate.manifest,settings:[]},separate.configuration,selections),selections);
 assert.deepEqual(compiler.closure.data,[]);
 assert(!Object.hasOwn(separate.manifest.sourceModules,'settings'));
 manifest.sourceModules.settings='config/settings.json';
 fs.writeFileSync(file,JSON.stringify(inlineManifest));
 assert.throws(()=>loadProject(root),{code:'SDK_SETTINGS_SOURCE_INVALID'});
});

test('support vectors reject active markup, external paint and runtime action attributes',()=>{
 const {graphic}=require('../sdk/sdk-support.js');
 assert.equal(graphic('<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>').kind,'vector');
 for(const source of ['<script>alert(1)</script>','<svg onload="x"/>','<svg><use href="https://example.test/x"/></svg>',`<svg><path style="background:image-set('//example.test/x')"/></svg>`,'<svg><path data-action="noop"/></svg>'])assert.throws(()=>graphic(source));
});


test('tutorial availability follows authorized commands while retaining local help',()=>{
 const vm=require('node:vm'),uno=path.join(packs,'packs/uno');
 // Use the exact archived UNO support module when the current collection has a different pack.
 const source=fs.existsSync(uno)?loadProject(uno,{shared:path.join(packs,'shared')}):(()=>{
  const bundle=require('./sdk-installed.cjs').readInstalled().find(item=>item.manifest.id==='uno');
  assert(bundle,'This scenario requires the UNO pack in PLAYROOM_TEST_INSTALLED_PACKS');
  const sdk=require('../core/packs.js').sdkSource(bundle);
  return {...sdk,support:sdk.sources.support};
 })();
 const guest=vm.createContext({PlayroomPackResources:{locales:source.catalogs,locale:source.locale||'ru',defaultLanguage:source.manifest.defaultLanguage}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sdk/sdk-support.js'),'utf8'),guest);
 vm.runInContext(source.support.find(row=>row.file==='presentation/tutorial.js').source,guest);
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
 guest.PlayroomPackTutorial=()=>()=>({steps:[
  {id:'hint',selector:'[data-view-key="hint"]',interaction:true},
  {id:'attack',selector:'[data-view-key="mageAction"][data-view-value="attack"][aria-pressed="false"]',match:command=>command.type==='plan'},
  {id:'card',selector:'.mage-card:not([disabled])',interaction:true,match:command=>command.type==='plan'},
  {id:'place',selector:".battle-grid [data-action*='\"type\":\"place\"']",actions:['place']},
 ]});
 const [hint,attack,card,place]=tutorial([{type:'plan'},{type:'place'}]).steps;
 assert.deepEqual(JSON.parse(JSON.stringify(hint.target)),{kind:'local-control',control:'view-key',key:'hint'});
 assert.deepEqual(JSON.parse(JSON.stringify(attack.target)),{kind:'local-control',control:'view-key',key:'mageAction',value:'attack',unpressed:true});
 assert.equal(attack.commands.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(card.target)),{kind:'local-control',control:'view-key',key:'mageCardId'});
 assert.equal(card.binding,undefined);
 assert.equal(card.interaction,true);
 assert.equal(place.binding,'destination');
 assert.equal(tutorial([]).steps[1].available,false);
 assert.equal(tutorial([]).steps[2].available,false);
});

test('parameter figures retain inherited preview kind and reject missing declared figures',()=>{
 const vm=require('node:vm'),guest=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../sdk/sdk-support.js'),'utf8'),guest);
 guest.PlayroomPack={settings:[{preview:{kind:'illustrations'},options:[{preview:{ids:['card-a','card-b']}},{preview:{kind:'illustrations',ids:['card-c']}}]}],presetSetting:{preview:{kind:'illustrations'},options:[{preview:{ids:['preset-a']}}]}};
 guest.PlayroomPackResources={rulebooks:{ru:{sections:[{figures:[{id:'markdown-figure'}]}]}}};
 assert.throws(()=>guest.PlayroomSDKSupport.catalog({metadata:{}}),/SDK_SUPPORT_FIGURE_MISSING/);
 guest.PlayroomPackRuleIllustrations={create:()=>id=>['card-a','card-b','card-c','markdown-figure','preset-a'].includes(id)?'<svg viewBox="0 0 10 10"><title>'+id+'</title></svg>':undefined};
 const catalog=guest.PlayroomSDKSupport.catalog({metadata:{}});assert.deepEqual(Array.from(catalog.figures,f=>f.id).sort(),['card-a','card-b','card-c','markdown-figure','preset-a']);
 guest.PlayroomPack.settings[0].options.push({preview:{ids:['missing']}});assert.throws(()=>guest.PlayroomSDKSupport.catalog({metadata:{}}),/SDK_SUPPORT_FIGURE_MISSING/);
});

test('checkpoint identity binds runtime JSON, media content, provenance and inert provider source',async t=>{
 const {StudioSession}=require('../sdk/runtime.cjs'),root=project(t),config=path.join(root,'config/options.json'),asset=path.join(root,'assets/piece.svg'),provider=path.join(root,'config/provider.js');
 fs.writeFileSync(config,'{"threshold":1.0,"keys":{"10":1,"2":2},"unicode":{"😀":3,"\ue000":4,"\\ud800":"surrogate"},"zero":-0}');
 fs.writeFileSync(asset,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>');
 fs.writeFileSync(provider,'globalThis.providerValue="first";');
 for(const change of [()=>fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace('1.0','2.5')),()=>fs.writeFileSync(asset,fs.readFileSync(asset,'utf8').replace('red','tan')),()=>fs.writeFileSync(path.join(root,'sdk/assets.json'),JSON.stringify({'assets/piece.svg':{source:'Fixture author',license:'CC0'}})),()=>fs.writeFileSync(provider,'globalThis.providerValue="other";')]){
  const before=loadProject(root);assert.equal(before.hash,python(root).hash);const old=await StudioSession.open(root);let checkpoint;try{await old.start();checkpoint=await old.checkpoint();}finally{old.close();}
  change();const next=loadProject(root);assert.notEqual(next.hash,before.hash);assert.equal(next.hash,python(root).hash);assert.equal(globalThis.providerValue,undefined,'providers remain inert');
  const current=await StudioSession.open(root);try{await assert.rejects(current.restore(checkpoint),e=>e.code==='SDK_CHECKPOINT_INCOMPATIBLE');}finally{current.close();}
 }
});

test('resource identity normalizes JSON negative zero and rejects nonfinite config values in both loaders',t=>{
 const root=project(t),file=path.join(root,'config/options.json');fs.writeFileSync(file,'{"zero":-0}');const negative=loadProject(root);assert.equal(negative.hash,python(root).hash);fs.writeFileSync(file,'{"zero":0}');assert.equal(loadProject(root).hash,negative.hash);assert.equal(loadProject(root).hash,python(root).hash);
 fs.writeFileSync(file,'{"overflow":1e400}');assert.throws(()=>loadProject(root),e=>e.code==='SDK_JSON_INVALID');assert.throws(()=>python(root),/SDK_JSON_INVALID/);
});

test('bot capability is an actual boolean in both source loaders',t=>{
 const root=project(t),file=path.join(root,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));
 for(const bots of ['false',0,null,[]]){fs.writeFileSync(file,JSON.stringify({...manifest,capabilities:{bots}}));assert.throws(()=>loadProject(root),e=>e.code==='SDK_MANIFEST_INVALID');assert.throws(()=>python(root),/Invalid bot capability/);}
 for(const bots of [false,true]){fs.writeFileSync(file,JSON.stringify({...manifest,capabilities:{bots}}));assert.equal(loadProject(root).hash,python(root).hash);}
});

function buildInstallable(root){
 const script="import json,runpy,sys; from pathlib import Path; c=runpy.run_path(sys.argv[1]); print(json.dumps(c['build_isolated_pack'](Path(sys.argv[2]))['sdk']['sources']['support']))";
 return JSON.parse(execFileSync('python3',['-c',script,path.join(packs,'shared/pack_compiler.py'),root],{encoding:'utf8'}));
}
test('Studio and installable packs infer the same legacy support modules and report missing files',t=>{
 const root=project(t),manifestFile=path.join(root,'manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestFile)),tutorial='presentation/tutorial.js';
 manifest.execution='isolated-v1';manifest.sdkFeatures=['isolated-execution-v1'];
 manifest.sourceModules.view=['presentation/scene.js',tutorial];
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 assert.throws(()=>loadProject(root),error=>error.code==='SDK_FILE_REQUIRED' && error.diagnostic.file===tutorial);
 assert.throws(()=>python(root),/presentation\/tutorial\.js/);
 fs.writeFileSync(path.join(root,tutorial),'// Tutorial fixture');
 const loaded=loadProject(root);
 assert.deepEqual(loaded.support.map(({file,role})=>({file,role})),[{file:tutorial,role:'tutorial'}]);
 assert.equal(loaded.hash,python(root).hash);
 assert.deepEqual(buildInstallable(root),loaded.support);
 const descriptor=path.join(root,'sdk/project.json');
 fs.writeFileSync(descriptor,JSON.stringify({...loaded.descriptor,support:[]}));
 assert.deepEqual(loadProject(root).support,[]);
 assert.equal(loadProject(root).hash,python(root).hash);
 assert.deepEqual(buildInstallable(root),[]);
 for(const types of [false,null,0,'']){
  fs.writeFileSync(descriptor,JSON.stringify({...loaded.descriptor,types}));
  assert.throws(()=>loadProject(root),error=>error.code==='SDK_TYPES_INVALID' &&
   error.diagnostic.file==='sdk/project.json' && error.diagnostic.field==='types');
  assert.throws(()=>buildInstallable(root),/SDK_TYPES_INVALID.*sdk\/project\.json.*types/);
 }
});

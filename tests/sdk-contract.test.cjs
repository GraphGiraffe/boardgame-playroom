'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verify}=require('../sdk/verify.cjs');
const {validateAsset}=require('../sdk/assets.cjs');
const {StudioSession}=require('../sdk/runtime.cjs');
const {fixture}=require('./sdk-fixture.cjs');
const packs=path.resolve(__dirname,'../../playroom-paks');
test('SDK doctor audits without evaluating authored code and editor diagnostics preserve positions',t=>{
 const project=fixture(t),file=path.join(project,'domain/game.js');
 const source=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,'throw Error("Guest code must not run during doctor");\n'+source);
 const cli=(...args)=>spawnSync(process.execPath,[path.resolve(__dirname,'../sdk/cli.cjs'),...args],{encoding:'utf8',timeout:15000});
 const healthy=cli('doctor',project);assert.equal(healthy.status,0,healthy.stdout);
 const decoded=JSON.parse(healthy.stdout);assert.equal(decoded.status,'ready');assert.equal(decoded.project.status,'passed');
 fs.writeFileSync(file,'fetch("example");\n'+source);
 const failed=cli('doctor',project);assert.equal(failed.status,1,failed.stdout);
 const report=JSON.parse(failed.stdout);assert.equal(report.environment.status,'passed');assert.equal(report.project.diagnostics[0].code,'SDK_ACCESS_DENIED');
 const editor=cli('check',project,'--format','vscode');assert.equal(editor.status,1,editor.stdout);
 assert.match(editor.stdout,/^domain\/game\.js:1:1: error SDK_ACCESS_DENIED: fetch /m);
});
test('SDK pilot contracts run deterministic games with viewer-specific scenes and checkpoint restore',async()=>{
 for(const id of ['tictactoe','gofish','dice-poker']){const result=await verify(path.join(packs,'packs',id),{shared:path.join(packs,'shared'),steps:12,seeds:[1,17]});assert.equal(result.status,'passed');assert(result.transitions>0);}
});
test('SDK event checkpoints share current-event ordering and inert scene validation',async()=>{
 const {validateScene}=require('../sdk/runtime.cjs'),session=await StudioSession.open(path.join(packs,'packs/snakes'),{shared:path.join(packs,'shared')});
 try{
  await session.start({preset:'plus',rng:17});const checkpoint=await session.checkpoint();Object.assign(checkpoint.position.data,{phase:'move',positions:[22,25],dice:[3,4]});await session.restore(checkpoint);await session.apply(0,{type:'move',dieIndex:0,delta:0});const value=await session.view(0),frames=value.events.filter(event=>event.scene).map(event=>({eventId:event.id,scene:event.scene}));
  assert.deepEqual(frames.map(frame=>frame.scene.positions.map(p=>p.cell)),[[25,22],[29,22]]);assert(frames.every(frame=>frame.scene.interactions.length===0));
  for(const change of [frames=>{frames[0].eventId=999;},frames=>frames.push(frames[0]),frames=>frames.reverse(),frames=>{frames[0].scene.interactions=[{command:{type:'roll'},target:{zone:'field'}}];}]){const changed=JSON.parse(JSON.stringify(frames));change(changed);assert.throws(()=>validateScene({...value,eventScenes:changed},value.projection),error=>error.code==='SDK_EVENT_SCENES_INVALID');}
  const unbound=JSON.parse(JSON.stringify(value));unbound.events[0].scene={private:'not a validated checkpoint'};const safe=validateScene(unbound,value.projection);assert(safe.events.every(event=>!event.scene),'event descriptions cannot bypass checkpoint validation');
 }finally{session.close();}
});

test('SDK checks SVG and image content, external references and animation vocabulary',()=>{
 const svg=source=>Buffer.from(source);
 assert.equal(validateAsset(svg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),'a.svg').mime,'image/svg+xml');
 for(const source of ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.invalid/a.svg"/></svg>','<!DOCTYPE svg [<!ENTITY x "bad">]><svg xmlns="http://www.w3.org/2000/svg"/>'])assert.throws(()=>validateAsset(svg(source),'a.svg'));
 assert.throws(()=>validateAsset(svg('<svg/>'),'a.png'),error=>error.code==='SDK_ASSET_SIGNATURE');
 assert.throws(()=>validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[{time:0,values:{script:1}}]})),'motion.json'),error=>error.code==='SDK_ANIMATION_INVALID');
 assert.equal(validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[{time:0,values:{opacity:0}},{time:150,values:{opacity:1}}]})),'motion.json').mime,'application/json');
 for(const frame of [null,[],{time:0,values:[]},{time:0,values:'x'},{time:0,values:true}])assert.throws(()=>validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[frame]})),'motion.json'),error=>error.code==='SDK_ANIMATION_INVALID');
});
test('SDK verifier detects stateful projections that depend on viewer order',async t=>{
 const project=fixture(t,{project:'(globalThis.cachedProjection ||= {viewer})'});
 await assert.rejects(verify(project,{steps:1,seeds:[1]}),error=>error.code==='SDK_NONDETERMINISTIC'&&error.diagnostic.hint.includes('viewer call order'));
});
test('SDK packs cannot disable canonical model validation',async t=>{
 for(const [mutation,turn]of [['PlayroomModelRuntime.GameModel.prototype.validate=()=>true',99],['Number.isSafeInteger=()=>true',0.5]]){
  const project=fixture(t),file=path.join(project,'domain/game.js');
  fs.writeFileSync(file,`try{${mutation};}catch{};`+fs.readFileSync(file,'utf8').replace('turn:0,',`turn:${turn},`));
  const session=await StudioSession.open(project);try{await assert.rejects(session.start());}finally{session.close();}
 }
});
test('SDK rejects model identities that differ from the manifest',async t=>{
 const project=fixture(t),file=path.join(project,'domain/game.js');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace("id:'probe'","id:'other'"));
 await assert.rejects(async()=>{const session=await StudioSession.open(project);session.close();},error=>error.code==='SDK_MODEL_ID_MISMATCH');
});
test('SDK collection descriptors initialize every current game without loading its DOM renderer',async()=>{
 for(const directory of fs.readdirSync(path.join(packs,'packs'))){const project=path.join(packs,'packs',directory);if(!fs.existsSync(path.join(project,'sdk/project.json')))continue;const session=await StudioSession.open(project,{shared:path.join(packs,'shared')});try{await session.start();const value=await session.view(0);assert.equal(value.scene.contractVersion,1,directory);const actor=session.position.turn,actions=await session.rules.call('availableActions',session.position,actor);if(actions.length){await session.apply(actor,actions[0]);const live=await session.view(0);session.seek(0);assert.deepEqual(await session.view(0),value,directory+': history uses the same renderer and projected state');await assert.rejects(session.apply(actor,actions[0]),error=>error.code==='SDK_HISTORY_READ_ONLY');session.seek(null);assert.deepEqual(await session.view(0),live,directory+': returning from history preserves the live game');}}finally{session.close();}}
});

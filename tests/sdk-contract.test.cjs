'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {verify}=require('../sdk/verify.cjs');
const {validateAsset}=require('../sdk/assets.cjs');
const {StudioSession}=require('../sdk/runtime.cjs');
const {fixture}=require('./sdk-fixture.cjs');
const packs=path.resolve(__dirname,'../../playroom-paks');
test('SDK pilot contracts run deterministic games with viewer-specific scenes and checkpoint restore',async()=>{
 for(const id of ['tictactoe','gofish','yatzy']){const result=await verify(path.join(packs,'packs',id),{shared:path.join(packs,'shared'),steps:12,seeds:[1,17]});assert.equal(result.status,'passed');assert(result.transitions>0);}
});
test('SDK checks SVG and image content, external references and animation vocabulary',()=>{
 const svg=source=>Buffer.from(source);
 assert.equal(validateAsset(svg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),'a.svg').mime,'image/svg+xml');
 for(const source of ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.invalid/a.svg"/></svg>','<!DOCTYPE svg [<!ENTITY x "bad">]><svg xmlns="http://www.w3.org/2000/svg"/>'])assert.throws(()=>validateAsset(svg(source),'a.svg'));
 assert.throws(()=>validateAsset(svg('<svg/>'),'a.png'),error=>error.code==='SDK_ASSET_SIGNATURE');
 assert.throws(()=>validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[{time:0,values:{script:1}}]})),'motion.json'),error=>error.code==='SDK_ANIMATION_INVALID');
 assert.equal(validateAsset(Buffer.from(JSON.stringify({contractVersion:1,frames:[{time:0,values:{opacity:0}},{time:150,values:{opacity:1}}]})),'motion.json').mime,'application/json');
});
test('SDK verifier detects stateful projections that depend on viewer order',async t=>{
 const project=fixture(t,{project:'(globalThis.cachedProjection ||= {viewer})'});
 await assert.rejects(verify(project,{steps:1,seeds:[1]}),error=>error.code==='SDK_NONDETERMINISTIC'&&error.diagnostic.hint.includes('viewer call order'));
});
test('SDK collection descriptors initialize every current game without loading its DOM renderer',async()=>{
 for(const directory of fs.readdirSync(path.join(packs,'packs'))){const project=path.join(packs,'packs',directory);if(!fs.existsSync(path.join(project,'sdk/project.json')))continue;const session=await StudioSession.open(project,{shared:path.join(packs,'shared')});try{await session.start();const value=await session.view(0);assert.equal(value.scene.contractVersion,1,directory);const actor=session.position.turn,actions=await session.rules.call('availableActions',session.position,actor);if(actions.length){await session.apply(actor,actions[0]);const live=await session.view(0);session.seek(0);assert.deepEqual(await session.view(0),value,directory+': history uses the same renderer and projected state');await assert.rejects(session.apply(actor,actions[0]),error=>error.code==='SDK_HISTORY_READ_ONLY');session.seek(null);assert.deepEqual(await session.view(0),live,directory+': returning from history preserves the live game');}}finally{session.close();}}
});

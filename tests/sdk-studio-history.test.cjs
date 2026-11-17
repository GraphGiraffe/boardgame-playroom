'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {StudioSession,validateScene}=require('../sdk/runtime.cjs');
const {FrameHistory}=require('../sdk/frame-history.cjs');
const {fixture}=require('./sdk-fixture.cjs');
test('long studio history keeps every frame with bounded cache and removes its private temporary journal',()=>{
 const history=new FrameHistory();let directory;
 try{for(let revision=0;revision<1200;revision++)history.push(JSON.stringify({position:{revision},events:[]}));directory=history.directory;assert.equal(history.length,1200);assert.equal(fs.statSync(directory).mode&0o777,0o700);assert.equal(fs.statSync(directory+'/frames').mode&0o777,0o600);for(let i=0;i<1200;i++)assert.equal(history.get(i).position.revision,i);assert(history.cache.size<=8);assert.equal(history.get(0).position.revision,0);const frame=history.get(0);frame.position.revision=999;assert.equal(history.get(0).position.revision,0);const large={position:{revision:1200,operations:Array.from({length:512},(_,i)=>({id:i,points:[[1,2],[3,4]]}))},events:[]},encoded=JSON.stringify(large),before=history.bytes;history.push(encoded);assert(history.bytes-before<Buffer.byteLength(encoded)/2);assert.deepEqual(history.get(1200),large);}finally{history.close();}assert(!fs.existsSync(directory));
});
test('studio exports the selected historical checkpoint without changing the live session',async t=>{
 const session=await StudioSession.open(fixture(t));t.after(()=>session.close());await session.start();await session.apply(0,{type:'step'});const live=JSON.stringify(session.position),clock=session.now,journal=session.frames;await assert.rejects(session.start({playerCount:99,now:clock+500}));assert.equal(session.now,clock);assert.equal(session.frames,journal);const saved=await session.checkpoint(0);assert.equal(saved.position.revision,0);assert.equal(session.position.revision,1);assert.equal(JSON.stringify(session.position),live);assert.equal(session.historyIndex,null);await session.restore(saved);assert.equal(session.position.revision,0);assert.equal(session.frames.length,1);
});
test('all dispatch-capable scene controls are constrained to the projected command vocabulary',()=>{
 const projection={game:'probe',playerCount:2,actions:[{type:'ok'}],inputs:[]};const scene={contractVersion:1,id:'x',family:'board',players:[{player:0,metrics:[]},{player:1,metrics:[]}]};
 for(const extra of [{canvas:{command:{type:'forged'}}},{chat:{command:{type:'forged'}}},{chat:{messages:[{confirmCommand:{type:'forged'}}]}},{vote:{id:'vote',title:'Завершить',eligible:[0,1],voted:[],required:2,accepted:false,deadline:30000,command:{type:'forged'}}},{controls:[{command:{type:'forged'}}]},{notices:[{id:'denied',title:'Недоступно',actions:[{label:'Действие',command:{type:'forged'}}]}]}])assert.throws(()=>validateScene({scene:{...scene,...extra},actions:[],events:[]},projection),e=>e.code==='SDK_SCENE_COMMAND_DENIED');
 assert.doesNotThrow(()=>validateScene({scene:{...scene,vote:{id:'vote',title:'Завершить',eligible:[0,1],voted:[],required:2,accepted:false,deadline:30000,command:{type:'ok'}}},actions:[],events:[]},projection));
 assert.throws(()=>validateScene({scene:{...scene,players:[{player:0,metrics:[{id:'points',kind:'number',value:0,label:'Points'}]},{player:1,metrics:[]}]},actions:[],events:[]},projection),e=>e.code==='SDK_SCENE_INVALID'&&e.diagnostic.contract==='SCENE_METRIC_INVALID');
});

test('human-only studio projects reject automatic turns before changing the game',async t=>{
 const project=fixture(t),path=require('node:path'),manifest=path.join(project,'manifest.json'),value=JSON.parse(fs.readFileSync(manifest));value.capabilities={bots:false};fs.writeFileSync(manifest,JSON.stringify(value));const session=await StudioSession.open(project);t.after(()=>session.close());await session.start();const before=JSON.stringify(session.position);await assert.rejects(session.bot(),e=>e.code==='SDK_BOTS_UNSUPPORTED');assert.equal(JSON.stringify(session.position),before);
});

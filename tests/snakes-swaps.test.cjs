'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {GameModel}=require('../core/model-runtime.js'),root=path.resolve(__dirname,'../../playroom-paks');
const Ending=require(root+'/shared/domain/end-policy.js');
const model=new GameModel(require(root+'/packs/snakes/domain/game.js')({rollDie:()=>2,ending:Ending}));
const P=require(root+'/packs/snakes/presentation/scene.js');
function start(positions,{preset='plus',dice=[2,5]}={}){
 const p=JSON.parse(JSON.stringify(model.create({playerCount:positions.length,firstPlayer:0,preset,rng:17,options:{boardSize:100,endMode:'last'}})));
 p.data.positions=positions;p.data.phase=preset==='plus'?'move':'roll';if(preset==='plus')p.data.dice=dice;return p;
}
const move=p=>model.apply(p,0,p.preset==='plus'?{type:'move',dieIndex:0,delta:0}:{type:'roll'});
const swaps=r=>r.events.filter(e=>e.type==='snakes.swapped');
test('ZiL+ swaps at the final destination, including ladders and snakes, without mutating input',()=>{
 for(const [positions,dice,expected,landing] of [
  [[4,6,40],[2,5],[6,4,40],6],
  [[1,22,40],[2,5],[22,1,40],3],
  [[14,4,40],[3,5],[4,14,40],17],
  [[0,2,40],[2,5],[2,0,40],2]
 ]){
  const p=start(positions,{dice}),before=JSON.stringify(p),r=move(p);
  assert.deepEqual(r.position.data.positions,expected);assert.equal(JSON.stringify(p),before);
  assert.equal(r.position.data.lastMove.landing,landing);assert.deepEqual(r.position.data.lastMove.swaps,[{player:1,from:expected[0],to:positions[0]}]);
  assert.equal(swaps(r).length,1);assert.deepEqual(swaps(r)[0].params,{player:0,target:1,from:positions[0],to:expected[0]});
  assert.equal(swaps(r)[0].visibility.kind,'public');model.validate(r.position);
 }
});
test('ZiL+ ignores passed cells, link entrances, finished players and stationary moves; classic never swaps',()=>{
 for(const [positions,dice] of [[[1,2,3],[2,5]],[[4,5,40],[2,5]]]){const r=move(start(positions,{dice}));assert.equal(swaps(r).length,0);assert.equal(r.position.data.positions[1],positions[1]);}
 let p=start([98,100,40]);Ending.record(p.data.ending,[1]);let r=move(p);assert.deepEqual(r.position.data.positions,[100,100,40]);assert.equal(swaps(r).length,0);
 p=start([6,6,40],{dice:[1,5]});p.data.adjusting=true;r=model.apply(p,0,{type:'move',dieIndex:0,delta:-1});assert.deepEqual(r.position.data.positions,[6,6,40]);assert.equal(swaps(r).length,0);
 r=move(start([4,6,40],{preset:'classic'}));assert.deepEqual(r.position.data.positions,[6,6,40]);assert.equal(swaps(r).length,0);
});
test('shield changes the destination before a swap; displaced players do not activate their destination effects',()=>{
 const p=start([14,17,40],{dice:[3,5]});p.data.effects[0].shield=true;const r=move(p);
 assert.deepEqual(r.position.data.positions,[17,14,40]);assert.equal(r.position.data.effects[0].shield,false);assert.equal(r.position.data.effects[1].adjust,false);
 assert.equal(swaps(r).length,1);model.validate(r.position);
});
test('automatic second movement swaps independently and public checkpoints preserve both legs and victims',()=>{
 const p=start([24,25,27],{dice:[1,2]}),r=move(p);assert.deepEqual(r.position.data.positions,[27,24,25]);assert.equal(swaps(r).length,2);
 const events=r.events.map((event,id)=>({...event,id,revision:r.position.revision})),projection=model.project(r.position,-1,events),frames=P.eventScenes(projection);
 assert.deepEqual(frames.map(f=>f.scene.positions.map(v=>v.cell)),[[25,24,27],[27,24,25]]);
 assert.deepEqual(frames.map(f=>f.scene.sequence.departures),[[{namespace:'token',id:'1'}],[{namespace:'token',id:'2'}]]);
 assert(frames.every(f=>f.scene.sequence.arrival==='after-departures'));
 assert.deepEqual(move(p),r,'deterministic replay');model.validate(r.position);
});
test('swap metadata is bounded by the declared move and actor identities',()=>{
 const p=move(start([4,6,40])).position;
 for(const change of [s=>s.player=0,s=>s.player=3,s=>s.from=7,s=>s.to=5,s=>s.player=1.5]){const bad=JSON.parse(JSON.stringify(p));change(bad.data.lastMove.swaps[0]);assert.throws(()=>model.validate(bad));}
 const bad=JSON.parse(JSON.stringify(p));bad.data.lastMove.swaps.push({...bad.data.lastMove.swaps[0]});assert.throws(()=>model.validate(bad));
});

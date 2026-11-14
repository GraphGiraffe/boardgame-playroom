'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const categories=require('../packs/yatzy/domain/categories.js');
const definition=require('../packs/yatzy/domain/game.js')({rollDie:()=>1},categories);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function fixture(dice,{scores={},roundLimit=15,rolls=3}={}){
 const position=definition.create({playerCount:2,firstPlayer:0,preset:'classic',rng:42,options:{maxRounds:roundLimit}});
 Object.assign(position.data,{dice:[...dice],rolls,scores:[{...scores},{}],round:Object.keys(scores).length});
 assert(definition.validate(position),'fixture must be a valid public position');
 const projection={playerCount:2,turn:0,status:'playing',actor:0,data:definition.localData(position)};
 Object.defineProperty(projection,'rng',{get(){throw Error('bot must not inspect future randomness');}});
 const commands=definition.actions(position,0).map(choice=>choice.command);freeze(projection.data);freeze(commands);Object.freeze(projection);
 return {projection,commands};
}
function choose(dice,options={},depth=2){const {projection,commands}=fixture(dice,options),before=JSON.stringify({data:projection.data,commands}),action=definition.bot(projection,0,commands,undefined,{depth});assert(commands.includes(action),'bot returns an actual legal command');assert.equal(JSON.stringify({data:projection.data,commands}),before,'public inputs remain unchanged');return action;}
for(const depth of [1,2,3])test('four sixes on first scorecard turn preserve a combination instead of Chance, depth '+depth,()=>{
 const action=choose([6,6,6,6,5],{},depth);assert.equal(action.type,'score');assert(['four','sixes'].includes(action.key),'expected four/sixes, got '+action.key);
 assert.equal(choose([6,6,6,6,5],{scores:{sixes:18}},depth).key,'four','filled sixes still leaves the four-of-a-kind opportunity');
});
test('Chance remains a useful fallback for a weak unmatched roll instead of a bad upper entry',()=>{
 for(const depth of [1,2,3])assert.equal(choose([1,2,3,4,6],{},depth).key,'chance');
 const scores=Object.fromEntries(categories.keys.filter(k=>!['ones','chance'].includes(k)).map(k=>[k,0]));
 assert.equal(choose([2,3,4,5,6],{scores}).key,'chance','do not scratch an unused upper category while Chance earns twenty');
});
test('a genuinely good mixed total can use Chance before the last category',()=>{
 for(const depth of [1,2,3])assert.equal(choose([6,6,5,4,3],{},depth).key,'chance');
});
test('high completed combinations use their own slots',()=>{
 for(const depth of [1,2,3]){
  assert.equal(choose([6,6,6,6,6],{},depth).key,'yatzy');
  assert.equal(choose([6,6,6,5,5],{},depth).key,'fullHouse');
  assert.equal(choose([2,3,4,5,6],{},depth).key,'largeStraight');
  assert.equal(choose([1,2,3,4,5],{},depth).key,'smallStraight');
 }
});
test('upper bonus is considered without spending a rare slot for a low four-of-a-kind',()=>{
 const scores={ones:3,twos:6,threes:9,fours:12,fives:15};
 assert.equal(choose([6,6,6,2,1],{scores}).key,'sixes','eighteen sixes completes the real fifty-point bonus');
 assert.equal(choose([1,1,1,1,6]).key,'ones','four ones are useful upper progress, not a good four slot');
});
test('the last personal turn in a short game maximizes actual points, no category reservation tax',()=>{
 for(const depth of [1,2,3])assert.equal(choose([6,6,6,6,5],{roundLimit:3,scores:{ones:0,twos:0}},depth).key,'chance');
});
test('four matching sixes are still held for rerolls while Yatzy can improve',()=>{
 const {projection,commands}=fixture([6,6,6,6,2],{rolls:1});
 for(const depth of [2,3]){const a=definition.bot(projection,0,commands,undefined,{depth});assert.equal(a.type,'hold');assert.equal(projection.data.dice[a.index],6);}
});
test('a made Yatzy is not discarded by an early blind reroll',()=>{
 for(const depth of [1,2,3])assert.equal(choose([6,6,6,6,6],{rolls:1},depth).key,'yatzy');
});
test('choice is deterministic under reordered legal commands and does not need authority RNG',()=>{
 const {projection,commands}=fixture([6,6,6,6,5],{scores:{sixes:18}});
 for(const depth of [1,2,3]){const a=definition.bot(projection,0,commands,undefined,{depth}),b=definition.bot(projection,0,[...commands].reverse(),undefined,{depth});assert.deepEqual(a,b);assert.equal(a.key,'four');}
});

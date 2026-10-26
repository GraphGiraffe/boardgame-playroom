'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js');
require('../core/model-registration.js');
const ids=['uno','domino','durak','checkers','snakes','ludo','tictactoe','battleship','pexeso','yatzy','gofish','oldmaid','mage-brawl','klondike','spider'];
for(const id of ids)require(`../packs/${id}/rules.js`);
function create(id){const pack=E.get(id);return new Session(E,id,{seed:17,players:Array.from({length:pack.min},(_,i)=>({name:'P'+i,bot:true})),mode:'solo'},{now:()=>100});}
for(const id of ids)test(`action history exactly replays ${id} with pinned rules`,t=>{
 const session=create(id);
 for(let i=0;i<100&&session.current.status==='playing';i++){
  const state=session.current,actor=state.turn,action=E.botAction(state,actor)||E.legalActions(state,actor)[0];
  if(!action)break;session.act(actor,action);
 }
 assert.ok(session.current.move>0,id);
 const raw=session.serialize(),saved=JSON.parse(raw),snapshots=session.serialize({history:'snapshots'});
 assert.equal(saved.version,3);assert.equal(saved.states,undefined);assert.equal(saved.nodes,undefined);assert.equal(saved.journal,undefined);
 assert.equal(saved.actions.length,session.current.move);
 const restored=Session.restore(E,saved,{now:()=>100});assert.deepEqual(restored.export(),session.export());
 assert.equal(restored.serialize(),raw,'unchanged log has stable bytes');
 if(session.current.status==='playing'){
  const action=E.botAction(session.current);if(action){restored.act(restored.current.turn,action);session.act(session.current.turn,action);assert.deepEqual(restored.export(),session.export());}
 }
 assert.ok(raw.length<snapshots.length,`${id}: ${raw.length} vs ${snapshots.length}`);
 t.diagnostic(`${id}: ${saved.actions.length} actions, ${Buffer.byteLength(raw)} bytes vs ${Buffer.byteLength(snapshots)} bytes (v2)`);
});
test('action logs reject corruption and never record failed or stale candidates',()=>{
 const s=create('tictactoe'),a=E.legalActions(s.current)[0];const candidate=s.prepare(s.current.turn,a);
 assert.equal(JSON.parse(s.serialize()).actions.length,0);
 s.setPlayerMetadata(0,{name:'Renamed'});assert.throws(()=>s.commitPrepared(candidate));
 s.act(s.current.turn,a);const raw=s.serialize();assert.throws(()=>s.act(99,a));assert.equal(s.serialize(),raw);
 for(const mutate of [x=>x.actions.pop(),x=>x.actions[0].actor=99,x=>x.actions[0].command={type:'invalid'},x=>x.options.seed=18,x=>x.end.fingerprint='0000000000000000',x=>x.actions[0].players=[{index:99,name:'Bad'}],x=>x.options.mode='unknown']){
  const saved=JSON.parse(raw);mutate(saved);assert.throws(()=>Session.restore(E,saved));
 }
 const old=Session.restore(E,JSON.parse(s.serialize({history:'snapshots'})));assert.equal(JSON.parse(old.serialize()).version,2);assert.deepEqual(old.export(),s.export());
});
test('generated seed is persisted and restored without ambient randomness',()=>{
 const s=new Session(E,'uno');const raw=s.serialize(),random=Math.random;
 try{Math.random=()=>{throw Error('Unexpected random');};assert.deepEqual(Session.restore(E,JSON.parse(raw)).export(),s.export());}finally{Math.random=random;}
});

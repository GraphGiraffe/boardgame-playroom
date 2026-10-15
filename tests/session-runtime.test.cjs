'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const History=require('../core/history.js'),Session=require('../core/session.js'),E=require('../core/engine.js');
const coded=code=>error=>error.code===code;
const frame=revision=>({revision,data:{value:revision}});

test('history stages immutable candidates and rejects stale, foreign and invalidated commits',()=>{
  const h=new History([frame(5)]),other=new History([frame(5)]),before=h.states;
  const a=h.prepare(()=>frame(6)),b=h.prepare(()=>frame(6)),foreign=other.prepare(()=>frame(6));
  assert.equal(h.states,before);assert.equal(h.current.revision,5);
  assert.throws(()=>{a.data.value=99;},TypeError);
  assert.throws(()=>{h.states.push(a);},TypeError);
  assert.throws(()=>h.commit(foreign),coded('HISTORY_PREPARED_INVALID'));
  assert.equal(h.commit(a),a);assert.equal(h.states.length,2);
  for(const candidate of [a,b])assert.throws(()=>h.commit(candidate),coded('HISTORY_PREPARED_INVALID'));
  const pending=h.prepare(()=>frame(7));h.invalidate();
  assert.throws(()=>h.commit(pending),coded('HISTORY_PREPARED_INVALID'));
  assert.equal(h.current,a);
});

test('history no-op and producer failures leave the timeline unchanged',()=>{
  const h=new History([frame(0)]),before=h.states;
  assert.equal(h.commit(h.prepare(current=>current)),h.current);
  assert.equal(h.states,before);
  assert.throws(()=>h.prepare(()=>{throw Error('reducer failed');}),/reducer failed/);
  assert.throws(()=>h.prepare(()=>frame(0)),coded('HISTORY_REVISION_INVALID'));
  assert.throws(()=>h.prepare(()=>frame(2)),coded('HISTORY_REVISION_INVALID'));
  assert.throws(()=>h.prepare(()=>null),coded('HISTORY_FRAME_INVALID'));
  assert.equal(h.states,before);
  assert.throws(()=>new History([frame(0),frame(2)]),coded('HISTORY_REVISION_INVALID'));
  const shallow=Object.freeze(frame(0)),owned=new History([shallow]);
  assert.throws(()=>{owned.current.data.value=9;},TypeError);
});

test('history compaction preserves retained snapshots and commits atomically',()=>{
  let fail=true;
  const original={revision:0,data:{value:0},events:['one','two']};
  const h=new History([original],{compact:state=>{
    if(fail)throw Error('compaction failed');
    return {...state,events:state.events.slice(-1)};
  }}),before=h.states,next=h.prepare(()=>({...frame(1),events:['one','two','three']}));
  assert.throws(()=>h.commit(next),/compaction failed/);assert.equal(h.states,before);
  fail=false;h.commit(next);
  assert.deepEqual(original.events,['one','two']);assert.deepEqual(h.states[0].events,['two']);
  assert.deepEqual(h.current.events,['one','two','three']);
  assert.throws(()=>{h.states[0].events.push('changed');},TypeError);
});

test('history, event projection and save codec execute without engine or ambient platform services',()=>{
  const context=vm.createContext({});
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  for(const file of ['model-values','events','history','session-codec']){
    vm.runInContext(fs.readFileSync(require.resolve('../core/'+file+'.js'),'utf8'),context);
  }
  const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const h=new PlayroomHistory([{revision:0,events:[]}]);
    const event={type:'fixture.private',actor:0,params:{secret:'private'},visibility:{kind:'players',players:[0]},
      publicEvent:{type:'fixture.public',actor:0,params:{count:1},visibility:{kind:'public'}}};
    h.commit(h.prepare(()=>({revision:1,events:[event]})));
    const codec=PlayroomSessionCodec.create();
    const states=h.states.map(state=>PlayroomSessionCodec.encodeSnapshot(codec,state));
    const saved={encoding:'interned-json-v1',states,journal:h.current.events.map(codec.encode),
      nodes:codec.nodes,options:codec.encode({}),game:'fixture'};
    const decoded=PlayroomSessionCodec.decode(saved);
    return {revision:decoded.states[1].revision,events:PlayroomEvents.project(decoded.states[1].events,-1,2)};
  })())`,context));
  assert.deepEqual(result,{revision:1,events:[{type:'fixture.public',actor:0,params:{count:1}}]});
  for(const name of ['TabletopCore','document','window','localStorage','fetch','setTimeout'])assert.equal(context[name],undefined);
});

let creations=0;
E.register({id:'clock-port-fixture',name:'Clock port',min:2,max:2,rules:[],presets:[{id:'standard',label:'Standard'}],
  create:state=>{creations++;state.data={count:0};},legal:()=>[{type:'next'}],
  apply:state=>{state.data.count++;state.turn=1-state.turn;}});
const create=runtime=>new Session(E,'clock-port-fixture',{seed:'clock-port',firstPlayerMode:'assigned',firstPlayer:0},runtime);
const step=session=>session.act(session.current.turn,{type:'next'});

test('Session clock is injected, prepare is timeless and committed timestamps never move backward',()=>{
  let time=100,reads=0;const session=create({now:()=>{reads++;return time;}});
  assert.equal(reads,1);assert.equal(session.createdAt,100);assert.equal(session.updatedAt,100);
  time=200;const pending=session.prepare(0,{type:'next'});
  assert.equal(reads,1);assert.equal(session.current.move,0);assert.equal(session.updatedAt,100);
  session.commitPrepared(pending);assert.equal(reads,2);assert.equal(session.updatedAt,200);
  time=150;step(session);assert.equal(session.updatedAt,200);assert.equal(session.createdAt,100);
  assert.throws(()=>session.act(session.current.turn,{type:'invalid'}));assert.equal(reads,3);
  const restored=Session.restore(E,JSON.parse(session.serialize()),{now:()=>500});
  assert.deepEqual(restored.export(),session.export());
});

test('restore does not read the clock or recreate the game, then advances using the supplied clock',()=>{
  const session=create({now:()=>10});step(session);
  for(const compact of [true,false]){
    const saved=JSON.parse(session.serialize({compact})),before=creations;let reads=0;
    const restored=Session.restore(E,saved,{now:()=>{reads++;return 900;}});
    assert.equal(creations,before);assert.equal(reads,0);assert.deepEqual(restored.export(),session.export());
    step(restored);assert.equal(reads,1);assert.equal(restored.updatedAt,900);assert.equal(session.current.move,1);
  }
});

test('a clock failure cannot undo a committed move or corrupt its compact save cache',()=>{
  let time=10;const session=create({now:()=>{if(time==='fail')throw Error('clock unavailable');return time;}});
  session.serialize();
  for(const invalid of ['fail',NaN,-1,1.5,Infinity]){
    time=invalid;const before=session.current.move;step(session);
    assert.equal(session.current.move,before+1);assert.equal(session.updatedAt,10);
    assert.deepEqual(Session.restore(E,JSON.parse(session.serialize())).export(),session.export());
  }
  time=30;step(session);assert.equal(session.updatedAt,30);
  for(const invalid of [null,{now:1},{now:()=>NaN},{now:()=>-1}])assert.throws(()=>create(invalid),/clock/);
});

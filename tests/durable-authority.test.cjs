'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
E.register({id:'durable-fixture',name:'Durable fixture',min:2,max:2,presets:[{id:'basic'}],
  create(s){s.data={counter:0,secret:'PRIVATE-DRAW'};},
  legal(){return [{type:'tick',label:'Tick'}];},
  project(out){delete out.data.secret;},
  apply(s,actor){s.data.counter++;E.event(s,'tick '+actor,actor,'action');s.turn=1-actor;}});
function setup(storage={}){
  const session=new Session(E,'durable-fixture',{players:[{name:'A'},{name:'B'}],seed:'secret-seed'});
  const commits=[],receipts=[];
  const persistence={async commit(value){if(storage.commit)await storage.commit(value);commits.push(value);},
    async recordReceipt(value){if(storage.receipt)await storage.receipt(value);receipts.push(value);}};
  const authority=new Authority(session,{sessionId:'durable-session',persistence}),a=authority.connect(0),b=authority.connect(1),pub=authority.connect(-1);
  return {session,authority,a,b,pub,commits,receipts};
}
const cmd=(connection,id='move-1')=>P.command(connection.snapshot(),{type:'tick'},id);
test('a prepared Session transition is inert until committed and cannot be committed twice',()=>{
  const session=new Session(E,'durable-fixture',{players:[{name:'A'},{name:'B'}]});
  const original=session.serialize();const next=session.prepare(0,{type:'tick'});
  assert.equal(session.current.move,0);assert.equal(session.serialize(),original);
  assert.equal(session.commitPrepared(next).move,1);
  assert.throws(()=>session.commitPrepared(next),/no longer current/);
  assert.deepEqual(Session.restore(E,session.export()).export(),session.export());
});
test('durable authority publishes and ACKs only after the storage transaction finishes',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const d=setup({commit:()=>gate});let published=0;
  d.a.subscribe(()=>published++);
  try{
    const command=cmd(d.a),pending=d.a.dispatch(command);
    assert.equal(d.session.current.move,0);
    assert.equal(published,0);
    assert.equal((await d.a.dispatch({...command,commandId:'another'})).code,'BUSY');
    release();const result=await pending;
    assert.equal(result.ok,true);assert.equal(d.session.current.move,1);assert.equal(published,1);
    assert.equal(d.commits.length,1);assert.equal(d.commits[0].nextState.move,1);
    assert.equal(d.commits[0].receipt.revision,1);
    assert.equal((await d.a.dispatch(command)).duplicate,true);
    assert.equal(d.commits.length,1);
    assert.equal((await d.a.dispatch({...command,action:{type:'other'}})).code,'ID_CONFLICT');
    assert.equal(d.pub.snapshot().viewer,-1);
    assert.ok(!JSON.stringify(d.pub.snapshot()).includes('PRIVATE-DRAW'));
  }finally{d.authority.dispose();}
});
test('failed disk commit rejects the command with no state, receipt, or broadcast',async()=>{
  const d=setup({commit:()=>{throw Error('QuotaExceededError');}});let published=0;
  d.a.subscribe(()=>published++);
  try{
    const result=await d.a.dispatch(cmd(d.a));
    assert.equal(result.code,'STORAGE_ERROR');assert.equal(result.ok,false);
    assert.equal(d.session.current.move,0);assert.equal(published,0);
    assert.equal(d.commits.length,0);assert.equal(d.receipts.length,0);
    assert.equal(d.a.snapshot().revision,0);
  }finally{d.authority.dispose();}
});
test('durable rejected actions retain stable receipts, without a transition',async()=>{
  const d=setup();try{
    const command=cmd(d.b,'illegal');
    assert.equal((await d.b.dispatch(command)).code,'ILLEGAL');
    assert.equal(d.session.current.move,0);
    assert.equal(d.receipts.length,1);
    assert.equal((await d.a.dispatch(cmd(d.a))).ok,true);
    const again=await d.b.dispatch(command);
    assert.equal(again.code,'ILLEGAL');assert.equal(again.duplicate,true);
    assert.equal(d.receipts.length,1);
  }finally{d.authority.dispose();}
});

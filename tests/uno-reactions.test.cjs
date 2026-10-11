'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js');
require(require('node:path').resolve(process.env.PLAYROOM_PACKS_DIR || require('node:path').join(__dirname,'../packs'),'uno/rules.js'));
const create=(count=2,mode='manual',seed=17,preset='classic')=>E.createGame('uno',{seed,preset,unoMode:mode,players:Array.from({length:count},(_,i)=>({name:`P${i}`,bot:true}))});
function fixture(hands=[['u1','u3'],['u5','u7']],{pending=null,turn=0,mode='manual'}={}){
  const s=create(hands.length,mode),d=s.data,all=new Map([...d.hands.flat(),...d.drawPile,...d.discard].map(c=>[c.id,c]));
  const take=id=>{const c=all.get(id);assert(c,id);all.delete(id);return c;};
  d.hands=hands.map(h=>h.map(take));d.discard=[take('u9')];d.drawPile=[...all.values()];d.color='red';d.direction=1;d.drawn=null;d.noDraw=false;d.stalled=0;
  d.uno={mode,declared:hands.map(()=>false),pending};s.turn=turn;E.validateState(s);return s;
}
const act=(s,actor,action)=>E.applyAction(s,actor,action);
const play=(s,actor,id)=>act(s,actor,{type:'play',card:id});
const declare=(s,actor)=>act(s,actor,{type:'declare-uno'});
const accuse=(s,actor,target)=>act(s,actor,{type:'accuse-uno',target});
const normal=s=>E.legalActions(s,s.turn).filter(a=>!['declare-uno','accuse-uno'].includes(a.type));
const inventory=s=>[...s.data.hands.flat(),...s.data.drawPile,...s.data.discard].map(c=>c.id).sort();

test('generic reactions are available out of turn while ordinary bots stay on turn actions',()=>{
  E.register({id:'reaction-fixture',name:'Reaction fixture',min:2,max:2,presets:[{id:'standard',label:'Standard'}],rules:[],create:s=>{s.data={calls:0};},legal:()=>[{type:'next',label:'Next'}],reactions:()=>[{type:'ping',label:'Ping'}],apply:(s,actor,a)=>{if(a.type==='ping')s.data.calls++;else s.turn=1-s.turn;},botReaction:(s,actor,actions)=>s.data.calls?null:actions[0]});
  let s=E.createGame('reaction-fixture');assert.deepEqual(E.legalActions(s,1).map(a=>a.type),['ping']);assert.deepEqual(E.legalActions(s,0).map(a=>a.type),['next','ping']);assert.equal(E.botAction(s,1),null);assert.equal(E.botAction(s,0).type,'next');
  s=act(s,1,E.botReaction(s,1));assert.equal(s.data.calls,1);assert.equal(s.turn,0);assert.equal(s.move,1);assert.equal(E.botReaction(s,1),null);assert.throws(()=>act(s,1,{type:'next'}));
  for(const actor of [-1,2,.5,null,'0']){assert.deepEqual(E.reactions(s,actor),[]);assert.deepEqual(E.legalActions(s,actor),[]);assert.equal(E.botReaction(s,actor),null);}
});

test('manual UNO offers declaration and every other accusation even with the wrong card count',()=>{
  const s=create(4);for(let actor=0;actor<4;actor++){
    const reactions=E.reactions(s,actor);assert.equal(reactions.length,4);assert.equal(reactions[0].type,'declare-uno');assert.deepEqual(reactions.slice(1).map(a=>a.target),[0,1,2,3].filter(p=>p!==actor));
    if(actor!==s.turn)assert.deepEqual(E.legalActions(s,actor),reactions);
  }
  assert.throws(()=>accuse(s,0,0));assert.throws(()=>accuse(s,0,4));assert.throws(()=>create(2,'unsupported'));
  s.status='finished';assert.deepEqual(E.reactions(s,0),[]);assert.equal(E.botReaction(s,0),null);
});

test('playing to one opens an internal manual window without disclosing its pending hint',()=>{
  const before=fixture(),json=JSON.stringify(before);const s=play(before,0,'u1');
  assert.equal(JSON.stringify(before),json);assert.equal(s.turn,1);assert.equal(s.data.uno.pending,0);assert.equal(s.data.uno.declared[0],false);assert(!s.events.some(e=>e.kind==='uno'));
  const projected=E.project(s,1);assert.equal(projected.data.uno.pending,undefined);assert.equal(projected.data.uno.episode,1);assert.deepEqual(projected.data.uno.declared,[false,false]);assert.deepEqual(projected.data.hands[0],[{hidden:true}]);
  E.validateState(s);
});

test('proper out-of-turn declaration closes own window; repeating does not draw cards',()=>{
  let s=play(fixture(),0,'u1');const before=inventory(s),turn=s.turn;s=declare(s,0);
  assert.equal(s.turn,turn);assert.equal(s.data.uno.pending,null);assert.equal(s.data.uno.declared[0],true);assert.equal(s.events.at(-1).kind,'uno');
  const declared=s;s=declare(s,0);assert.equal(s,declared);assert.equal(s.data.hands[0].length,1);assert.equal(s.events.at(-1).kind,'uno');assert.deepEqual(inventory(s),before);assert.equal(E.botReaction(s,0),null);
});

test('early declaration is logged without a penalty and does not reserve a later UNO',()=>{
  let s=fixture();const hand=s.data.hands[0].map(c=>c.id);s=declare(s,0);assert.equal(s.events.at(-1).kind,'false-uno');assert.equal(s.data.uno.declared[0],false);assert.deepEqual(s.data.hands[0].map(c=>c.id),hand);
  s=play(s,0,'u1');assert.equal(s.data.uno.pending,0);assert.equal(s.data.uno.declared[0],false);
});

test('a correct accusation draws exactly two for the target and preserves the ordinary turn',()=>{
  let s=play(fixture(),0,'u1');const turn=s.turn,deck=s.data.drawPile.length,all=inventory(s);s=accuse(s,1,0);
  assert.equal(s.turn,turn);assert.equal(s.data.hands[0].length,3);assert.equal(s.data.hands[1].length,2);assert.equal(s.data.drawPile.length,deck-2);assert.equal(s.data.uno.pending,null);assert.equal(s.data.uno.declared[0],false);
  assert.equal(s.events.at(-2).kind,'uno-caught');assert.equal(s.events.at(-2).player,1);assert.equal(s.events.at(-2).target,0);assert.equal(s.events.at(-1).kind,'draw');assert.equal(s.events.at(-1).player,0);assert.deepEqual(inventory(s),all);E.validateState(s);
});

test('accusations arriving after a declaration are neutral even with fresh commands',()=>{
  const s=declare(play(fixture(),0,'u1'),0);assert.equal(accuse(s,1,0),s);assert.equal(s.data.hands[1].length,2);assert.equal(s.data.uno.declared[0],true);
});

test('wrong count or wrong player penalizes only the first accuser in one episode',()=>{
  let s=accuse(fixture(),1,0);assert.equal(s.data.hands[1].length,4);assert.equal(s.data.hands[0].length,2);assert.match(s.events.at(-2).text,/2 карт/);
  s=fixture([['u1'],['u5','u7'],['u3']],{pending:0,turn:1});s=accuse(s,1,2);assert.equal(s.data.hands[1].length,4);assert.equal(s.data.hands[2].length,1);assert.equal(s.data.uno.pending,0);assert.match(s.events.at(-2).text,/P0/);
  const penalized=s;s=accuse(s,2,0);assert.equal(s,penalized);assert.equal(s.data.hands[0].length,1);assert.equal(s.data.hands[2].length,1);
});

test('the next normal draw closes the window; a late accusation retains the drawn-card restriction',()=>{
  let s=play(fixture(),0,'u1');s=act(s,1,{type:'draw'});const drawn=s.data.drawn;assert(drawn);assert.equal(s.data.uno.pending,null);
  s=accuse(s,1,0);assert.equal(s.data.hands[1].length,5);assert.equal(s.data.hands[0].length,1);assert.equal(s.data.drawn,drawn);assert.equal(s.turn,1);assert.match(s.events.at(-2).text,/окно обвинения уже закрыто/);
  assert(normal(s).every(a=>a.type==='pass'||a.card===drawn));assert(!normal(s).some(a=>a.type==='draw'));E.validateState(s);
});

test('next normal play replaces the old window; pass closes a pending window',()=>{
  let s=play(fixture([['u1','u3'],['u5','u7'],['u26','u28']]),0,'u1');s=play(s,1,'u5');assert.equal(s.data.uno.pending,1);
  s=accuse(s,2,0);assert.equal(s.data.hands[2].length,4);assert.equal(s.data.uno.pending,1);
  s=fixture([['u1'],['u5','u7']],{pending:0,turn:1});s.data.drawn='u7';s=act(s,1,{type:'pass'});assert.equal(s.data.uno.pending,null);assert.equal(s.turn,0);
});

test('unrelated declarations leave the pending player catchable; repeated catches stay neutral',()=>{
  let s=fixture([['u1'],['u5','u7'],['u3']],{pending:0,turn:1});s=declare(s,2);assert.equal(s.data.uno.pending,0);assert.equal(s.data.uno.declared[2],true);s=declare(s,1);assert.equal(s.data.uno.pending,0);
  s=accuse(s,1,0);const caught=s;s=accuse(s,1,0);assert.equal(s,caught);assert.equal(s.data.hands[0].length,3);assert.equal(s.data.hands[1].length,2);assert.equal(s.events.at(-2).kind,'uno-caught');
});

test('a penalty resets declaration and its own pending flag without touching another player drawn id',()=>{
  let s=fixture([['u1'],['u5','u7']],{turn:1});s=declare(s,0);s=act(s,1,{type:'draw'});const drawn=s.data.drawn;s=accuse(s,0,1);assert.equal(s.data.hands[0].length,3);assert.equal(s.data.uno.declared[0],false);assert.equal(s.data.drawn,drawn);assert.equal(s.turn,1);E.validateState(s);
  s=fixture([['u1'],['u5','u7']],{pending:0,turn:1});s=accuse(s,0,1);assert.equal(s.data.uno.pending,null);assert.equal(s.data.hands[0].length,3);
});

test('penalty draws recycle discard while retaining its top card and component inventory',()=>{
  let s=fixture([['u1'],['u5','u7']],{pending:0,turn:1});const top=s.data.discard[0],all=inventory(s);s.data.discard=[...s.data.drawPile,top];s.data.drawPile=[];s=accuse(s,1,0);
  assert.equal(s.data.hands[0].length,3);assert.deepEqual(s.data.discard,[top]);assert.equal(s.data.drawPile.length,102);assert.deepEqual(inventory(s),all);E.validateState(s);
});

test('manual bot reactions call or catch correctly while normal bot actions never react',()=>{
  let s=play(fixture(),0,'u1');assert.equal(E.botReaction(s,0).type,'declare-uno');assert.deepEqual(E.botReaction(s,1),E.reactions(s,1).find(a=>a.type==='accuse-uno'&&a.target===0));assert(['play','draw','pass'].includes(E.botAction(s,1).type));assert.equal(E.botAction(s,0),null);
  s=declare(s,0);assert.equal(E.botReaction(s,0),null);assert.equal(E.botReaction(s,1),null);s=fixture();assert.equal(E.botReaction(s,0),null);
});

test('legacy missing UNO state restores as auto, while malformed manual state is rejected',()=>{
  const session=new Session(E,'uno',{seed:1,players:[{name:'P0'},{name:'P1'}]});const legacy=session.export();delete legacy.states[0].data.uno;E.validateState(legacy.states[0]);const restored=Session.restore(E,legacy);assert.deepEqual(E.reactions(restored.current,0),[]);
  let s=fixture([['u1','u3'],['u5','u7']],{mode:'auto'});delete s.data.uno;s=play(s,0,'u1');assert(s.events.some(e=>e.kind==='uno'));assert.equal(s.data.uno.mode,'auto');assert.deepEqual(E.reactions(s,1),[]);
  for(const change of [u=>u.mode='bad',u=>u.declared=[false],u=>u.declared[0]='yes',u=>u.pending=-1,u=>u.pending=.5,u=>u.pending=2,u=>u.pending=0,u=>u.declared[0]=true]){const bad=create();change(bad.data.uno);assert.throws(()=>E.validateState(bad));}
  const pending=fixture([['u1'],['u5','u7']],{pending:0,turn:1});pending.data.uno.mode='auto';assert.throws(()=>E.validateState(pending));
});

test('36 complete manual games cover all player counts/presets and immutable Session restore',t=>{
  let games=0,moves=0,reactions=0;
  for(const count of [2,3,4])for(const preset of ['classic','quick'])for(let seed=0;seed<6;seed++){
    const session=new Session(E,'uno',{seed,preset,unoMode:'manual',players:Array.from({length:count},(_,i)=>({name:`P${i}`,bot:true}))});const original=inventory(session.current);
    while(session.current.status==='playing'&&session.current.move<2000){
      for(let step=0;step<count+1;step++){
        const pending=session.current.data.uno.pending,order=Array.from({length:count},(_,i)=>i);
        if(seed%2===0&&pending!==null)order.sort((a,b)=>(b===pending)-(a===pending));
        const actor=order.find(p=>E.botReaction(session.current,p));if(actor===undefined)break;
        session.act(actor,E.botReaction(session.current,actor));reactions++;E.validateState(session.current);assert(!session.current.events.some(e=>['false-uno','false-accusation'].includes(e.kind)));
      }
      const action=E.botAction(session.current);assert(action);assert(['play','draw','pass'].includes(action.type));session.act(session.current.turn,action);E.validateState(session.current);assert.deepEqual(inventory(session.current),original);
    }
    assert.equal(session.current.status,'finished',`${count}/${preset}/${seed}`);assert.equal(session.current.data.uno.pending,null);assert.deepEqual(E.reactions(session.current,0),[]);
    assert.deepEqual(Session.restore(E,JSON.parse(session.serialize())).current,session.current);games++;moves+=session.current.move;
  }
  t.diagnostic(JSON.stringify({games,moves,reactions}));
});


test('a captured reaction never attaches to a later ordinary episode; a new independent mistake may be penalized',()=>{
  let s=fixture([['u1','u3'],['u5','u7'],['u26','u28']]);const old=E.reactions(s,1).find(a=>a.type==='accuse-uno'&&a.target===0);
  s=accuse(s,1,0);const penalized=s;assert.equal(accuse(s,2,0),penalized);
  s=play(s,0,'u1');assert.equal(act(s,1,old),s,'old episode stays a no-op after fresh game state');
  s=accuse(s,2,1);assert.equal(s.events.at(-2).kind,'false-accusation');assert.equal(s.data.hands[2].length,4);
});

test('session no-op reactions do not add snapshots and resolved episodes survive restore',()=>{
  const saved=new Session(E,'uno',{seed:17,unoMode:'manual',players:[{name:'P0'},{name:'P1'}]}).export();saved.states[0]=fixture();
  const session=Session.restore(E,saved);session.act(0,{type:'play',card:'u1'});session.act(0,E.reactions(session.current,0)[0]);
  const before=session.serialize(),count=session.states.length;session.act(0,E.reactions(session.current,0)[0]);session.act(1,E.reactions(session.current,1).find(a=>a.type==='accuse-uno'));
  assert.equal(session.states.length,count);assert.equal(session.serialize(),before);
  const restored=Session.restore(E,JSON.parse(before));assert.equal(restored.act(1,E.reactions(restored.current,1).find(a=>a.type==='accuse-uno')),restored.current);assert.equal(restored.states.length,count);
});

const Authority=require('../core/authority.js'),Protocol=require('../core/protocol.js');
function manualClock(){let now=0,sequence=0;const tasks=new Map();return {now:()=>now,setTimeout(fn,ms){const id=++sequence;tasks.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>tasks.delete(id),advance(ms){const end=now+ms;for(let count=0;count<1000;count++){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=end;return;}now=next[1].at;tasks.delete(next[0]);next[1].fn();}throw Error('timer loop');}};}
function onlineFixture({bots=[false,false],persistence=null}={}){
  const state=fixture(bots.map((_,i)=>i===0?['u1','u3']:i===1?['u5','u7']:['u26','u28']));state.players.forEach((p,i)=>p.bot=bots[i]);
  const saved=new Session(E,'uno',{seed:17,unoMode:'manual',players:state.players}).export();saved.states[0]=state;
  const session=Session.restore(E,saved),clock=manualClock(),authority=new Authority(session,{sessionId:'reaction-session',authorityEpoch:'reaction-epoch',clock,persistence});const clients=bots.map((_,i)=>authority.connect(i));
  let sequence=0;const send=(actor,type,target)=>{const c=clients[actor],action=c.snapshot().actions.find(a=>a.type===type&&(target===undefined||a.target===target))||(['draw','pass'].includes(type)?{type}:null);assert(action,type);return c.dispatch(Protocol.command(c.snapshot(),action,`reaction-${++sequence}`));};
  return {session,clock,authority,clients,send};
}
test('online grace starts after only the owning viewer finishes; early accusation is neutral and advance waits one second',()=>{
  const {clock,authority,clients,send}=onlineFixture();try{
    assert(send(0,'play').ok);assert.equal(authority.revision,1);const ready=Protocol.presentationReady(clients[0].snapshot());
    assert.equal(clients[1].presentationReady(ready).ignored,true);assert.equal(send(1,'accuse-uno',0).ignored,true);assert.equal(authority.revision,1);
    clock.advance(2000);assert.equal(send(1,'draw').code,'REACTION_WAIT');assert(clients[0].presentationReady(ready).ok);
    clock.advance(999);assert.equal(clients[1].snapshot().actions.some(a=>a.type==='draw'),false);assert.equal(send(1,'accuse-uno',0).ignored,true);assert.equal(send(1,'draw').code,'REACTION_WAIT');
    clock.advance(1);assert.equal(send(1,'accuse-uno',0).ok,true);assert.equal(authority.revision,2);assert.equal(send(1,'accuse-uno',0).ignored,true);assert.equal(authority.revision,2);
  }finally{authority.dispose();}
});
test('a timely declaration beats late/fresh accusations and protocol rejects forged presentation acknowledgements',()=>{
  const {clock,authority,clients,send}=onlineFixture();try{
    send(0,'play');const ready=Protocol.presentationReady(clients[0].snapshot());
    for(const extra of [{authorityEpoch:'old'},{sessionId:'other'},{revision:0},{controlRevision:1},{windowId:'uno:other'},{actor:0}])assert.equal(clients[0].presentationReady({...ready,...extra}).ok,false);
    assert(clients[0].presentationReady(ready).ok);clock.advance(600);assert(send(0,'declare-uno').ok);const revision=authority.revision;
    assert.equal(send(0,'declare-uno').ignored,true);assert.equal(send(1,'accuse-uno',0).ignored,true);assert.equal(authority.revision,revision);
  }finally{authority.dispose();}
});
test('bots wait three seconds after readiness and missing readiness has a bounded ten-second fallback',()=>{
  for(const acknowledge of [true,false]){const {clock,authority,clients,send,session}=onlineFixture({bots:[false,true]});try{
    send(0,'play');authority.scheduleBot({delay:10});if(acknowledge)clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));
    clock.advance((acknowledge?3000:13000)-1);assert.equal(authority.revision,1);clock.advance(1);assert.equal(authority.revision,2);assert.equal(session.current.events.at(-2).kind,'uno-caught');assert.equal(session.current.data.hands[0].length,3);
  }finally{authority.dispose();}}
});
test('a resolved reaction remains neutral with a new command id, stale revision and durable receipt without an extra commit',async()=>{
  const commits=[],receipts=[],persistence={async commit(e){commits.push(e);},async recordReceipt(e){receipts.push(e);}};
  const {authority,clients,send}=onlineFixture({bots:[false,false,false],persistence});try{
    const old=clients[2].snapshot(),captured=old.actions.find(a=>a.type==='accuse-uno'&&a.target===0);
    assert((await send(1,'accuse-uno',0)).ok);assert.equal((await clients[2].dispatch(Protocol.command(old,captured,'second-accuser'))).ignored,true);
    assert.equal((await send(2,'accuse-uno',0)).ignored,true);assert.equal(commits.length,1);assert.equal(receipts.length,2);assert.equal(authority.revision,1);
  }finally{authority.dispose();}
});


test('cancelling local bot presentation prevents readiness or fallback from restarting hidden actions',()=>{
  for(const acknowledge of [true,false]){const {clock,authority,clients,send}=onlineFixture({bots:[false,true]});try{
    send(0,'play');authority.scheduleBot({delay:10});authority.cancelBot();
    if(acknowledge)clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));
    clock.advance(20000);assert.equal(authority.revision,1);
    authority.scheduleBot({delay:10});clock.advance(10);assert.equal(authority.revision,2);
  }finally{authority.dispose();}}
});

test('pause freezes reaction protection and resuming requires a new presentation-ready acknowledgement',async()=>{
  const {clock,authority,clients,send}=onlineFixture();try{
    send(0,'play');const ready=Protocol.presentationReady(clients[0].snapshot());clients[0].presentationReady(ready);clock.advance(500);
    const pause=paused=>clients[0].dispatch(Protocol.command(clients[0].snapshot(),{type:'session-pause',paused,expectedControlRevision:clients[0].snapshot().controlRevision},`pause-${paused}`));
    assert((await pause(true)).ok);clock.advance(10000);assert((await pause(false)).ok);assert.equal(send(1,'accuse-uno',0).ignored,true);
    assert.equal(clients[0].presentationReady(ready).ignored,true,'pre-pause ACK is stale');
    clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));clock.advance(999);assert.equal(send(1,'accuse-uno',0).ignored,true);clock.advance(1);assert(send(1,'accuse-uno',0).ok);
  }finally{authority.dispose();}
});


test('human deadline publishes permission changes without adding game or control revisions',async()=>{
  const {clock,authority,clients,send}=onlineFixture(),Client=require('../app/session-client.js'),client=new Client(clients[1]);
  try{await client.refresh();send(0,'play');const revision=authority.revision,control=client.snapshot.controlRevision;
    assert.equal(client.snapshot.actions.some(a=>a.type==='draw'),false);
    clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));const readyRevision=client.snapshot.reactionRevision;
    clock.advance(1000);assert(client.snapshot.reactionRevision>readyRevision);assert(client.snapshot.actions.some(a=>a.type==='draw'));assert.equal(client.snapshot.reactionWindow.protected,false);
    assert.equal(client.snapshot.revision,revision);assert.equal(client.snapshot.controlRevision,control);
  }finally{client.close();authority.dispose();}
});


test('disconnect suspends protected reactions and reconnect grants a fresh acknowledged window',()=>{
  const {clock,authority,clients,send}=onlineFixture({bots:[false,true]});try{
    send(0,'play');authority.scheduleBot({delay:10});clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));clock.advance(1500);
    authority.setViewerConnected(0,false);assert.equal(clients[1].snapshot().reactionWindow.suspended,true);clock.advance(30000);assert.equal(authority.revision,1);
    assert.equal(clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot())).ignored,true);
    authority.setViewerConnected(0,true);assert.equal(clients[0].snapshot().reactionWindow.suspended,false);clock.advance(9999);assert.equal(authority.revision,1);
    clients[0].presentationReady(Protocol.presentationReady(clients[0].snapshot()));clock.advance(2999);assert.equal(authority.revision,1);clock.advance(1);assert.equal(authority.revision,2);
  }finally{authority.dispose();}
});

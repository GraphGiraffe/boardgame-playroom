'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js');
require('../packs/uno/rules.js');
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
  const projected=E.project(s,1);assert.deepEqual(projected.data.uno,{mode:'manual',declared:[false,false]});assert.deepEqual(projected.data.hands[0],[{hidden:true}]);
  E.validateState(s);
});

test('proper out-of-turn declaration closes own window; repeating does not draw cards',()=>{
  let s=play(fixture(),0,'u1');const before=inventory(s),turn=s.turn;s=declare(s,0);
  assert.equal(s.turn,turn);assert.equal(s.data.uno.pending,null);assert.equal(s.data.uno.declared[0],true);assert.equal(s.events.at(-1).kind,'uno');
  s=declare(s,0);assert.equal(s.data.hands[0].length,1);assert.equal(s.events.at(-1).kind,'uno');assert.match(s.events.at(-1).text,/повтор/);assert.deepEqual(inventory(s),before);assert.equal(E.botReaction(s,0),null);
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

test('accusing an already declared player penalizes the accuser by two',()=>{
  let s=declare(play(fixture(),0,'u1'),0);s=accuse(s,1,0);assert.equal(s.data.hands[0].length,1);assert.equal(s.data.hands[1].length,4);assert.equal(s.data.uno.declared[0],true);assert.equal(s.events.at(-2).kind,'false-accusation');assert.match(s.events.at(-2).text,/уже объявил/);assert.equal(s.events.at(-1).player,1);
});

test('wrong count or wrong player penalizes only the accuser, preserving another open window',()=>{
  let s=accuse(fixture(),1,0);assert.equal(s.data.hands[1].length,4);assert.equal(s.data.hands[0].length,2);assert.match(s.events.at(-2).text,/2 карт/);
  s=fixture([['u1'],['u5','u7'],['u3']],{pending:0,turn:1});s=accuse(s,1,2);assert.equal(s.data.hands[1].length,4);assert.equal(s.data.hands[2].length,1);assert.equal(s.data.uno.pending,0);assert.match(s.events.at(-2).text,/P0/);
  s=accuse(s,2,0);assert.equal(s.data.hands[0].length,3);assert.equal(s.data.hands[2].length,1);assert.equal(s.data.uno.pending,null);
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

test('unrelated declarations leave the pending player catchable; repeated catches become false accusations',()=>{
  let s=fixture([['u1'],['u5','u7'],['u3']],{pending:0,turn:1});s=declare(s,2);assert.equal(s.data.uno.pending,0);assert.equal(s.data.uno.declared[2],true);s=declare(s,1);assert.equal(s.data.uno.pending,0);
  s=accuse(s,1,0);const targetCount=s.data.hands[0].length;s=accuse(s,1,0);assert.equal(s.data.hands[0].length,targetCount);assert.equal(s.data.hands[1].length,4);assert.equal(s.events.at(-2).kind,'false-accusation');
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

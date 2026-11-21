'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Client=require('../app/session-client.js'),Port=require('../app/transports/message-port.js');
E.register({project(out,viewer,state){const data=E.clone(state.data);out.data={...data,hands:data.hands.map((hand,index)=>viewer===index?hand:hand.map(()=>({hidden:true}))),drawPile:data.drawPile.map(()=>({hidden:true}))};},id:'authority-fixture',name:'Authority fixture',min:2,max:4,presets:[{id:'classic'}],rules:['Increment'],create(s){s.data={count:0,hands:[[{id:'SECRET0',value:'private0'}],[{id:'SECRET1',value:'private1'}]],drawPile:[{id:'SECRETDECK',value:'deck'}]};},legal(){return [{type:'increment',label:'Add'}];},apply(s,actor){s.data.count++;E.event(s,'SECRET EVENT '+actor,actor,'action',{privateTo:actor,publicText:'Public event'});s.turn=1-actor;},bot(s,actor){return {type:'increment'};}});
const make=options=>{const session=new Session(E,'authority-fixture',{players:[{name:'A'},{name:'B'}],seed:'seed-never-send',...options}),authority=new Authority(session);return {session,authority,a:authority.connect(0),b:authority.connect(1),pub:authority.connect(-1)};};
const cmd=(c,id='cmd-1',action={type:'increment'})=>P.command(c.snapshot(),action,id);
test('authority sends only whitelisted projections, including history/events',()=>{const {session,authority,a,b,pub}=make();try{a.dispatch(cmd(a));for(const client of [b,pub])for(const data of [client.snapshot(),client.history(1)]){const text=JSON.stringify(data);for(const secret of ['SECRET0','SECRETDECK','seed-never-send','SECRET EVENT','rng','options'])assert.ok(!text.includes(secret),secret);assert.match(text,/Public event/);}assert.match(JSON.stringify(a.snapshot()),/SECRET EVENT 0/);assert.equal(a.snapshot().revision,1);assert.equal(session.current.move,1);assert.deepEqual(pub.snapshot().actions,[]);}finally{authority.dispose();}});
test('deduplication happens before revision validation; payload collision rejected',()=>{const {authority,a,b}=make();try{const c=cmd(a),first=a.dispatch(c);assert.equal(first.ok,true);b.dispatch(cmd(b,'cmd-2'));const again=a.dispatch(c);assert.equal(again.ok,true);assert.equal(again.duplicate,true);assert.equal(again.revision,1);assert.equal(again.snapshot.revision,2);assert.equal(authority.revision,2);assert.equal(a.dispatch({...c,action:{type:'different'}}).code,'ID_CONFLICT');}finally{authority.dispose();}});
test('public, bot, extra actor, wrong session, epoch and stale commands cannot mutate',()=>{const {authority,a,b,pub}=make();try{const c=cmd(a);assert.equal(pub.dispatch(c).code,'READ_ONLY');assert.equal(a.dispatch({...c,actor:1}).code,'BAD_COMMAND');assert.equal(a.dispatch({...c,sessionId:'another'}).code,'WRONG_SESSION');assert.equal(a.dispatch({...c,authorityEpoch:'another'}).code,'WRONG_EPOCH');assert.equal(b.dispatch({...c,commandId:'wrong-seat'}).code,'ILLEGAL');a.dispatch(c);assert.equal(a.dispatch({...c,commandId:'stale'}).code,'STALE');assert.equal(authority.revision,1);b.close();assert.equal(b.dispatch(c).code,'CLOSED');}finally{authority.dispose();}});
test('failing subscriber cannot roll back a committed move or wedge authority',()=>{const {authority,a,b}=make();try{a.subscribe(()=>{throw Error('broken view');});assert.equal(a.dispatch(cmd(a)).ok,true);assert.equal(b.dispatch(cmd(b)).ok,true);assert.equal(authority.revision,2);}finally{authority.dispose();}});
test('rejected commands also retain a stable receipt',()=>{const {authority,a,b}=make();try{const c=cmd(b);assert.equal(b.dispatch(c).code,'ILLEGAL');a.dispatch(cmd(a));assert.equal(b.dispatch(c).code,'ILLEGAL');assert.equal(b.dispatch(c).duplicate,true);assert.equal(authority.revision,1);}finally{authority.dispose();}});
test('client retries identical envelope after lost acknowledgement; ignores old snapshot and duplicate effects',async()=>{const {authority,a,b}=make();let lost=true,calls=[],effects=[];const transport={snapshot:a.snapshot,subscribe:a.subscribe,history:a.history,async dispatch(c){calls.push(c);const r=a.dispatch(c);if(lost){lost=false;throw Error('lost acknowledgement');}return r;}};const client=new Client(transport,{onEffect:e=>effects.push(e)});try{await client.refresh();const old=client.snapshot;const receipt=await client.send({type:'increment'});assert.equal(client.snapshot.revision,1);assert.equal(client.deliveryError,null);assert.equal(receipt.duplicate,true);assert.deepEqual(calls[0],calls[1]);assert.equal(authority.revision,1);assert.equal(client.accept(old),false);const n=effects.length;client.accept(receipt.snapshot);assert.equal(effects.length,n);assert.equal(client.pending,null);b.dispatch(cmd(b));assert.equal(client.snapshot.revision,2);}finally{client.close();authority.dispose();}});
test('MessagePort carries projected requests, updates and projected history',async()=>{const {authority,a,pub}=make();const {port1,port2}=new MessageChannel(),close=Port.serve(port1,a),transport=Port.client(port2),client=new Client(transport);try{await client.refresh();assert.equal(client.snapshot.viewer,0);assert.equal((await client.send({type:'increment'})).ok,true);const history=await client.history(1);assert.equal(history.kind,'history');assert.equal(history.viewer,0);assert.ok(!JSON.stringify(history).includes('SECRET1'));assert.ok(!JSON.stringify(pub.snapshot()).includes('SECRET EVENT'));}finally{client.close();close();authority.dispose();}});
test('bot scheduling is authority-owned, injectable, and replaces old timers',()=>{const session=new Session(E,'authority-fixture',{players:[{name:'A'},{name:'Bot',bot:true}]}),scheduled=new Map();let id=0;const authority=new Authority(session,{clock:{setTimeout:(f,delay)=>{assert.equal(delay,500);scheduled.set(++id,f);return id;},clearTimeout:i=>scheduled.delete(i)}}),a=authority.connect(0);try{a.dispatch(cmd(a));authority.scheduleBot();authority.scheduleBot();assert.equal(scheduled.size,1);const task=[...scheduled.values()][0];scheduled.clear();task();assert.equal(authority.revision,2);assert.equal(scheduled.size,0);}finally{authority.dispose();}});

test('repainting an unchanged bot turn preserves the original deadline and decision',()=>{
 const session=new Session(E,'authority-fixture',{players:[{name:'A'},{name:'Bot',bot:true}]});
 const tasks=[],authority=new Authority(session,{clock:{setTimeout:f=>tasks.push(f),clearTimeout:()=>{}}});
 const run=(actor,action)=>authority.actBot(actor,action),options={run,onError:assert.fail};
 try{
  const player=authority.connect(0);player.dispatch(cmd(player));
  authority.scheduleBot(options);authority.scheduleBot(options);
  assert.equal(tasks.length,1);tasks[0]();assert.equal(authority.revision,2);
 }finally{authority.dispose();}
});

test('any seated human controls pause, spectators cannot, and retries do not add history',async()=>{const {session,authority,a,b,pub}=make();const client=new Client({snapshot:a.snapshot,subscribe:a.subscribe,dispatch:a.dispatch});try{
 await client.refresh();const pause=P.command(a.snapshot(),{type:'session-pause',paused:true,expectedControlRevision:0},'pause-1');
 assert.equal((await a.dispatch(pause)).ok,true);assert.equal(client.snapshot.paused,true);assert.equal(client.snapshot.controlRevision,1);assert.equal(session.states.length,1);
 assert.equal(a.dispatch(cmd(a,'blocked')).code,'PAUSED');assert.equal(pub.dispatch(cmd(pub,'public-pause',{type:'session-pause',paused:false,expectedControlRevision:1})).code,'READ_ONLY');
 assert.equal((await a.dispatch(pause)).duplicate,true);assert.equal((await b.dispatch(cmd(b,'resume',{type:'session-pause',paused:false,expectedControlRevision:1}))).ok,true);
 assert.equal(client.snapshot.paused,false);assert.equal(authority.revision,0);assert.equal(session.states.length,1);
}finally{client.close();authority.dispose();}});

 test('durable host bot commits before publication; persisted pause cancels scheduling',async()=>{const session=new Session(E,'authority-fixture',{players:[{name:'A'},{name:'Bot',bot:true}]}),writes=[],timers=new Map();let id=0;const authority=new Authority(session,{clock:{setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i)},persistence:{async commit(entry){assert.equal(session.current.move,entry.previousRevision);writes.push(entry);},async recordReceipt(){},async setControl(entry){writes.push(entry);}}}),human=authority.connect(0),bot=authority.connect(1);try{await human.dispatch(cmd(human));assert.equal(timers.size,1);await human.dispatch(cmd(human,'pause',{type:'session-pause',paused:true,expectedControlRevision:0}));assert.equal(timers.size,0);assert.equal(session.current.move,1);assert.equal((await bot.dispatch(cmd(bot,'bot-pause',{type:'session-pause',paused:false,expectedControlRevision:1}))).code,'READ_ONLY');await human.dispatch(cmd(human,'resume',{type:'session-pause',paused:false,expectedControlRevision:1}));assert.equal(timers.size,1);assert.equal((await authority.actBotAsync(1,{type:'increment'})).move,2);assert.equal(session.current.move,2);assert.equal(writes.filter(x=>x.nextState).length,2);assert.equal(writes.filter(x=>x.paused!==undefined).length,2);}finally{authority.dispose();}});

test('host stop persists pause before fencing actions and keeps resumable playing state',async()=>{
 const session=new Session(E,'authority-fixture',{players:[{name:'A'},{name:'B'}]});let release;const saved=new Promise(r=>release=r),writes=[];
 const authority=new Authority(session,{persistence:{setControl:async entry=>{writes.push(entry);await saved;},recordReceipt:async()=>{},commit:async()=>{}}}),player=authority.connect(0);
 try{const stopped=authority.stopForLobby();assert.equal(session.current.status,'playing');release();await stopped;assert.equal(writes.length,1);assert.equal(player.snapshot().paused,true);assert.equal((await player.dispatch(cmd(player,'after-stop'))).code,'PAUSED');assert.equal(session.current.move,0);assert.equal(session.current.status,'playing');}finally{authority.dispose();}
});
test('receipt clearing pending notifies subscribers even for an already received revision',async()=>{
 const {authority,a}=make();const client=new Client(a);try{await client.refresh();const seen=[];client.subscribe(()=>seen.push(!!client.pending));await client.send({type:'increment'});assert(seen.includes(true));assert.equal(seen.at(-1),false);}finally{client.close();authority.dispose();}
});

test('two failed deliveries expose retry state and manual retry keeps the original command',async()=>{
 const {authority,a}=make();let fail=true;const calls=[];
 const client=new Client({snapshot:a.snapshot,subscribe:a.subscribe,async dispatch(c){calls.push(c);if(fail)throw Error('connection timeout');return a.dispatch(c);}});
 try{await client.refresh();await assert.rejects(client.send({type:'increment'}),/timeout/);assert.equal(calls.length,2);assert(client.pending);assert.match(client.deliveryError,/timeout/);fail=false;assert((await client.retry()).ok);assert.equal(client.pending,null);assert.equal(client.deliveryError,null);assert.deepEqual(calls[0],calls[2]);assert.equal(authority.revision,1);}finally{client.close();authority.dispose();}
});

test('recovery reconciles a lost ACK with the original command and never plays it twice',async()=>{
 const {authority,a}=make();let disconnected=true;const calls=[];
 const client=new Client({snapshot:a.snapshot,async dispatch(c){calls.push(c.commandId);const result=await a.dispatch(c);if(disconnected)throw Error('ACK lost');return result;}});
 try{await client.refresh();await assert.rejects(client.send({type:'increment'}));assert.equal(authority.revision,1);
  disconnected=false;await client.reconcile(a.snapshot());assert.equal(authority.revision,1);assert.equal(new Set(calls).size,1);assert.equal(client.pending,null);
  await assert.rejects(client.reconcile({...a.snapshot(),viewer:9}),/изменилось/);
 }finally{client.close();authority.dispose();}
});


test('protocol 3 rejects protocol 2 commands without mutating authority',()=>{
 const {session,authority,a}=make();try{
  const before=JSON.stringify(session.current),command={...cmd(a),protocolVersion:2};
  assert.equal(P.version,3);assert.equal(P.validate(command),false);assert.equal(a.dispatch(command).ok,false);
  assert.equal(JSON.stringify(session.current),before);
 }finally{authority.dispose();}
});

test('replacement roster applies bot control immediately without changing historical players',()=>{
 const {session,authority,a,b,pub}=make();try{
  const original=session.current;session.setPlayerMetadata(0,{name:'Replacement bot',bot:true,botSettings:{strategy:'auto',difficulty:'hard'}});
  assert.equal(session.current,original);assert.equal(a.snapshot().state.players[0].bot,true);assert.equal(a.snapshot().state.players[0].botSettings.difficulty,'hard');assert.equal(a.snapshot().actions.length,0);assert.equal(pub.history(0).state.players[0].bot,false);
  authority.actBot(0,{type:'increment'});assert.equal(session.current.move,1);assert.equal(session.current.players[0].bot,true);assert.equal(session.states[0].players[0].bot,false);
  session.setPlayerMetadata(0,{name:'Replacement human',bot:false});assert.equal(a.snapshot().state.players[0].bot,false);
  assert(!JSON.stringify(pub.snapshot()).includes('SECRET0'));
 }finally{authority.dispose();}
});

test('local clients reuse owned immutable projections while external inputs stay detached',()=>{
 const {authority,a}=make();try{const authorized=a.snapshot(),client=new Client({});client.accept(authorized);assert.equal(client.snapshot,authorized);assert(Object.isFrozen(authorized.state.players[0]));assert.throws(()=>{authorized.state.players[0].name='changed';},TypeError);
 const external=JSON.parse(JSON.stringify(authorized));external.revision++;external.state.move++;client.accept(external);assert.notEqual(client.snapshot,external);external.state.players[0].name='mutated';assert.notEqual(client.snapshot.state.players[0].name,'mutated');
 assert.equal(P.immutable(undefined),undefined);const shallow=Object.freeze({nested:{value:1}}),copy=P.immutable(shallow);shallow.nested.value=2;assert.equal(copy.nested.value,1);assert.notEqual(copy,shallow);assert.equal(P.immutable(copy),copy);const packet=P.immutable({snapshot:external});assert.equal(P.immutable(packet.snapshot),packet.snapshot,'nested wire snapshots are owned by the same immutable packet');
 }finally{authority.dispose();}
});

test('protocol composition shares validated model snapshots and detaches foreign objects',()=>{
 const Values=require('../core/model-values.js');
 const input={data:{hand:[{id:'visible-card'}]}},model=Values.composeRecord(input);
 const frame=P.withProjection(P.composeRecord({state:P.composeRecord({data:model.data})}),model);
 assert.equal(P.projectedModel(frame),model);
 assert.equal(frame.state.data,model.data);
 input.data.hand[0].id='changed';
 assert.equal(frame.state.data.hand[0].id,'visible-card');
 const foreign=Values.freeze({hand:[{id:'foreign'}]});
 assert.notEqual(P.immutable(foreign),foreign,'deep freeze alone is not proof of model ownership');
 const parsed=Values.parseSnapshot('{"number":-0}');
 assert.equal(parsed.number,0);
 assert.equal(P.immutable(parsed),parsed);
 assert.throws(()=>Values.parseSnapshot('{"number":1e999}'),/JSON_INVALID/);
 const received=P.parse(JSON.stringify(frame));
 assert.deepEqual(received,frame);
 assert.notEqual(received.state.data,frame.state.data);
});

test('buttons retain exact destinations and typed input survives a shared command type',()=>{
 const short={type:'place'},left={type:'place',to:{x:1,y:2}},right={type:'place',to:{x:2,y:1}};
 const actions=[short,left,right],button={type:'place',to:{y:2,x:1},label:'Left'};
 const snapshot={actions:[button],state:{scene:{interactions:actions.map(command=>({command}))}}};
 assert.equal(P.resolveChoice(actions,button,true),left);
 const owned=P.immutable(actions),ownedIndex=P.choiceIndex(owned);
 assert.equal(P.choiceIndex(owned),ownedIndex,'reuse the index for an owned immutable list');
 assert.equal(ownedIndex(button,true),owned[1]);
 const external=Object.freeze([{type:'place',to:{x:1,y:2}}]);
 const before=P.choiceIndex(external);
 external[0].to.x=3;
 assert.notEqual(P.choiceIndex(external),before,'a shallow freeze does not prove command ownership');
 assert.equal(P.resolveChoice(external,{type:'place',to:{x:3,y:2}}),external[0]);
 assert.equal(P.resolveChoice([left,right],short,true),undefined);
 assert.deepEqual(P.command(snapshot,button,'button').action,left);
 const partialScene=P.withProjection({actions:[button],state:{scene:{interactions:[{command:short}]}}},{actions,inputs:[]});
 assert.deepEqual(P.command(partialScene,button,'partial-scene').action,left);
 const typed={type:'place',text:'Keep this field'};
 assert.deepEqual(P.command(snapshot,typed,'input').action,typed);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),Client=require('../app/session-client.js'),Local=require('../app/transports/local.js'),P=require('../core/protocol.js'),History=require('../application/history-controller.js');
for(const id of ['mage-brawl','yatzy'])require('../../playroom-paks/packs/'+id+'/rules.js');
function fixture(id,viewer=0,options={}){const session=new Session(E,id,{seed:17,players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0,actionsPerTurn:'2'}),authority=new Authority(session),binding=authority.connect(viewer),base=Local(binding),sent=[],client=new Client({...base,dispatch:command=>{sent.push(command);return base.dispatch(command);}},{draftStorage:{load(){},save(){},remove(){}},...options});return {session,authority,client,sent,close(){client.close();authority.dispose();}};}
const plan=client=>client.snapshot.actions.find(a=>a.type==='plan');
test('closing a draft client can detach without closing its shared room transport',()=>{
 let closes=0,unsubscribes=0;const transport={subscribe:()=>()=>unsubscribes++,close:()=>closes++},storage={load(){},save(){},remove(){}};
 const game=new Client(transport,{draftStorage:storage});game.close({keepTransport:true});
 assert.equal(game.closed,true);assert.equal(game.drafts.closed,true);assert.equal(unsubscribes,1);assert.equal(closes,0,'returning to the lobby keeps the shared RTC channel open');
 const room=new Client(transport,{draftStorage:storage});room.close();
 assert.equal(room.closed,true);assert.equal(room.drafts.closed,true);assert.equal(unsubscribes,2);assert.equal(closes,1,'ordinary close still owns transport teardown');
});
test('two-step planning is private locally; cancel sends nothing and confirmation is one durable command',async()=>{
 const f=fixture('mage-brawl');try{await f.client.refresh();const first=plan(f.client);assert((await f.client.send(first)).local);assert.equal(f.session.current.move,0);assert.equal(f.sent.length,0);assert(f.client.snapshot.localDraft);assert(P.projectedModel(f.client.snapshot).data.players[0].draft);
  const history=new History({read:i=>f.client.history(i)});history.receive(f.client.snapshot);assert(!history.live.localDraft);assert(!P.projectedModel(history.live).data.players[0].draft);assert(!(await f.client.history(0)).localDraft);
  await f.client.send({type:'unready'});assert.equal(f.sent.length,0);assert(!f.client.snapshot.localDraft);
  await f.client.send(plan(f.client));const second=plan(f.client);assert.notEqual(second.cardId,first.cardId);const receipt=await f.client.send(second);assert(receipt.ok,receipt.code+': '+receipt.message);assert.equal(f.sent.length,1);assert.equal(f.sent[0].action.type,'batch');assert.equal(f.sent[0].action.actions.length,2);assert(f.sent[0].action.actions.every(a=>!Object.hasOwn(a,'element')));assert.equal(f.session.current.move,1);assert(!f.client.snapshot.localDraft);assert(f.session.current.data.window.plans[0]);
 }finally{f.close();}
});
test('own draft survives another participant becoming ready and follows the same authority window',async()=>{
 const f=fixture('mage-brawl',1);try{await f.client.refresh();await f.client.send(plan(f.client));const chosen=f.client.localDraft[0];for(let i=0;i<2;i++)f.session.act(0,E.botAction(f.session.current,0));await f.client.refresh();assert.deepEqual(f.client.localDraft[0],chosen);assert.equal(f.client.snapshot.state.turn,1);assert((await f.client.send(plan(f.client))).ok);assert.equal(f.session.current.data.round,2);assert.equal(f.sent.length,1);assert(!f.client.snapshot.localDraft);
 }finally{f.close();}
});
test('reconnecting a client restores only its matching private draft from the local port',async()=>{
 const values=new Map(),storage={load:id=>values.get(id),save:(id,v)=>values.set(id,structuredClone(v)),remove:id=>values.delete(id)},f=fixture('mage-brawl',0,{draftStorage:storage});let next;
 try{await f.client.refresh();await f.client.send(plan(f.client));const original=f.client.localDraft[0];f.client.close();next=new Client(Local(f.authority.connect(0)),{draftStorage:storage});await next.refresh();assert.deepEqual(next.localDraft,[original]);assert.equal(f.session.current.move,0);assert(!/resumeToken|random|rng|"hand"/.test(JSON.stringify([...values.values()])));await next.send(plan(next));assert.equal(f.session.current.move,1);assert.equal(values.size,0);
 }finally{next?.close();f.close();}
});
test('dice holds coalesce and can join the next throw without changing dice or RNG outcomes',async()=>{
 const f=fixture('yatzy');try{await f.client.refresh();await f.client.send({type:'roll'});const before=[...f.session.current.data.dice];await f.client.send({type:'hold',index:0});await f.client.send({type:'hold',index:1});assert.deepEqual(f.session.current.data.held,[false,false,false,false,false]);assert(f.client.snapshot.localDraft);await f.client.send({type:'roll'});assert.equal(f.sent.length,2);assert.equal(f.session.current.move,2);assert.equal(f.session.current.data.dice[0],before[0]);assert.equal(f.session.current.data.dice[1],before[1]);assert.deepEqual(f.session.current.data.held,[true,true,false,false,false]);
  const ref=new Session(E,'yatzy',{seed:17,players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});for(const a of [{type:'roll'},{type:'hold',index:0},{type:'hold',index:1},{type:'roll'}])ref.act(0,a);assert.deepEqual(f.session.current.data,ref.current.data);assert.equal(f.session.current.rng,ref.current.rng);
 }finally{f.close();}
});
test('coalesced public choices flush after 50 ms and paired toggles cause no exchange',async()=>{
 const jobs=new Map();let sequence=0;const clock={setTimeout:(fn,ms)=>{jobs.set(++sequence,{fn,ms});return sequence;},clearTimeout:id=>jobs.delete(id)},f=fixture('yatzy',0,{draftClock:clock});try{await f.client.refresh();await f.client.send({type:'roll'});await f.client.send({type:'hold',index:0});await f.client.send({type:'hold',index:0});assert.equal(f.sent.length,1);assert.equal(jobs.size,0);assert(!f.client.snapshot.localDraft);await f.client.send({type:'hold',index:1});assert.equal([...jobs.values()][0].ms,50);const [key,job]=[...jobs][0];jobs.delete(key);job.fn();await f.client.drafts.flight;assert.equal(f.sent.length,2);assert(f.session.current.data.held[1]);assert(!f.client.snapshot.localDraft);
 }finally{f.close();}
});
test('authority rejects invalid compound selections and derived wire fields without applying any step',async()=>{
 const f=fixture('mage-brawl');try{await f.client.refresh();const first=P.command(f.client.snapshot,plan(f.client),'invalid-batch').action,full=P.command(f.client.snapshot,{type:'batch',actions:[first,first]},'bad');const receipt=await f.authority.connect(0).dispatch(full,{wire:true,receiptOnly:true});assert(!receipt.ok);assert.equal(f.session.current.move,0);
  const forged={...P.command(f.client.snapshot,first,'derived'),action:{...first,element:'fire'}};assert.equal((await f.authority.connect(0).dispatch(forged,{wire:true,receiptOnly:true})).code,'BAD_COMMAND');assert.equal(f.session.current.move,0);
 }finally{f.close();}
});

test('simultaneous local batches rebase only an unchanged own decision and survive replay',async()=>{
 const f=fixture('mage-brawl'),other=new Client(Local(f.authority.connect(1)),{draftStorage:{load(){},save(){},remove(){}}});try{await f.client.refresh();await other.refresh();await f.client.send(plan(f.client));await other.send(plan(other));const receipts=await Promise.all([f.client.send(plan(f.client)),other.send(plan(other))]);assert(receipts.every(r=>r.ok),JSON.stringify(receipts));assert.equal(f.session.current.move,2);assert.equal(f.session.current.data.round,2);const restored=Session.restore(E,JSON.parse(f.session.serialize({historyFormat:'actions'})));assert.deepEqual(restored.current,f.session.current);assert.equal(restored.historyLength,f.session.historyLength);
 }finally{other.close();f.close();}
});
test('failed coalesced delivery keeps the receipt and draft without a timer retry loop',async()=>{
 const jobs=new Map();let sequence=0,attempts=0;const clock={setTimeout:(fn,ms)=>{jobs.set(++sequence,{fn,ms});return sequence;},clearTimeout:id=>jobs.delete(id)},f=fixture('yatzy',0,{draftClock:clock});try{await f.client.refresh();await f.client.send({type:'roll'});const dispatch=f.client.transport.dispatch;f.client.transport.dispatch=async()=>{attempts++;throw Error('offline');};await f.client.send({type:'hold',index:0});await assert.rejects(f.client.flushLocalDraft(),/offline/);assert.equal(attempts,2);assert.equal(jobs.size,0);assert(f.client.pending);assert.equal(f.client.localDraft.length,1);f.client.transport.dispatch=dispatch;assert((await f.client.retry()).ok);assert.equal(f.session.current.move,2);assert.equal(f.client.localDraft.length,0);
 }finally{f.close();}
});

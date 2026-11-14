'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Client=require('../app/session-client.js'),W=require('../app/transports/webrtc.js'),HistorySync=require('../application/history-sync-service.js'),Store=require('../app/network-client-history.js');
require('../packs/uno/rules.js');
const session=()=>new Session(E,'uno',{seed:17,players:[{name:'A'},{name:'B'}]});
class Channel extends EventTarget{constructor(){super();this.readyState='open';this.sent=[];this.dropPush=false;}send(data){const value=require('../application/wire-codec.js').decode(data);this.sent.push(value);if(this.dropPush&&value.kind==='snapshot')return;queueMicrotask(()=>this.peer.dispatchEvent(new MessageEvent('message',{data})));}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
test('status equals the accepted projection header without constructing a projection',()=>{
 const s=session(),a=new Authority(s),c=a.connect(0);try{const expected=P.status(c.snapshot()),project=E.project;E.project=()=>{throw Error('projection not permitted');};try{assert.deepEqual(c.status(),expected);}finally{E.project=project;}}finally{a.dispose();}
});
test('unchanged connection status does not request snapshots; a gap and recovery do',async()=>{
 const Recovery=require('../application/recovery-coordinator.js'),link=new EventTarget();link.connectionState='connected';let revision=0,current=null,snapshots=0,statuses=0;
 const monitor=new Recovery({link,visibility:{hidden:false,subscribe:()=>()=>{}},clock:{now:()=>0,setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){}},currentStatus:()=>current,transport:{status:async()=>{statuses++;return {kind:'status',revision};},snapshot:async()=>{snapshots++;return {revision};}},reconcile:async frame=>{current={kind:'status',revision:frame.revision};}});
 try{await monitor.check();assert.equal(snapshots,1);await monitor.check();await monitor.check();assert.equal(snapshots,1);revision=1;current={kind:'status',revision:1};await monitor.check();assert.equal(snapshots,1);revision=2;await monitor.check();assert.equal(snapshots,2);await monitor.check({recover:true});assert.equal(snapshots,3);assert.equal(statuses,6);}finally{monitor.close();}
});
test('RTC sends one state and compact receipt, recovering missing push and lost ACK',async()=>{
 for(const fault of ['none','push','ack']){
  const s=session(),a=new Authority(s),binding=a.connect(s.current.turn),host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;
  const originalSend=host.send.bind(host);let lost=false;host.send=data=>{const m=require('../application/wire-codec.js').decode(data);if(fault==='ack'&&!lost&&m.kind==='response'&&m.result?.commandId){lost=true;host.sent.push(m);return;}originalSend(data);};
  const stop=W.serve(host,binding),transport=W.client(guest,{timeout:30}),client=new Client(transport);
  try{await transport.ready();await client.refresh();host.sent=[];guest.sent=[];host.dropPush=fault==='push';const previous=s.current.move,actions=binding.snapshot().actions,action=actions.find(a=>a.type==='draw')||actions[0];assert(action);
   const reply=await client.send(action);assert(reply.ok);assert(!Object.hasOwn(reply,'snapshot'));assert.equal(s.current.move,previous+1);assert.equal(client.snapshot.revision,s.current.move);
   assert.equal(host.sent.filter(m=>m.kind==='snapshot').length,1);
   assert(host.sent.filter(m=>m.kind==='response'&&m.result?.commandId).every(m=>!Object.hasOwn(m.result,'snapshot')));
   assert.equal(guest.sent.filter(m=>m.method==='snapshot').length,fault==='push'?1:0);
   const commands=guest.sent.filter(m=>m.method==='dispatch');assert.equal(commands.length,fault==='ack'?2:1);if(commands.length===2){assert.equal(commands[0].value[0],0);assert.equal(commands[1].value[0],0);assert.equal(typeof commands[0].value[2],'string');assert.equal(commands[0].value[2],commands[1].value[2]);}
  }finally{client.close();stop();a.dispose();}
 }
});
test('duplicate snapshot is rejected before presentation work, including control revisions',()=>{
 let restored=0;const c=new Client({}, {restoreFrame:f=>{restored++;return f;}});const f={kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',viewer:0,role:'player',game:'uno',packVersion:'1',revision:0,historyLength:1,state:{move:0},events:[],controlRevision:0};c.accept(f);assert.equal(c.accept({...f}),false);assert.equal(restored,1);assert.equal(c.accept({...f,controlRevision:1}),true);assert.equal(restored,2);c.close();
});
test('history sync owns one durable write per frame across client reads and backfill',async()=>{
 let writes=0,fail=false;const store=Object.create(Store.prototype);store.progress=async()=>({missing:[0]});store.list=async()=>[];store.save=async()=>{writes++;if(fail)throw Error('disk');};const sync=new HistorySync({store,key:Store.id,current:()=>true});
 const f={kind:'history',protocolVersion:3,sessionId:'s',authorityEpoch:'e',viewer:0,game:'uno',packVersion:'1',revision:0,state:{move:0,game:'uno',packVersion:'1'},events:[]},ctx={roomId:'r',participantId:'p'};
 await sync.backfill(f,{},ctx,async()=>{await sync.save(f,ctx);return f;});assert.equal(writes,1);await sync.save(f,ctx);assert.equal(writes,1);
 fail=true;const other={...f,revision:1,state:{...f.state,move:1}};await assert.rejects(sync.save(other,ctx));fail=false;await sync.save(other,ctx);assert.equal(writes,3);sync.dispose();
});

test('history ranges are capped, preserve public projection and flag oversized single frames',async()=>{
 const s=session(),a=new Authority(s),publicView=a.connect(-1);try{
  const range=await publicView.historyRange(0,64);assert.equal(range.frames.length,1);assert.equal(range.next,1);assert.equal(range.frames[0].viewer,-1);assert(!JSON.stringify(range).includes('drawPile'));assert(!JSON.stringify(range).includes('rng'));
  await assert.rejects(publicView.historyRange(0,65),/RANGE_INVALID/);await assert.rejects(publicView.historyRange(-1,1),/RANGE_INVALID/);
  const huge=await P.historyRange(i=>({revision:i,payload:'x'.repeat(300000)}),0,1,1);assert.deepEqual(huge,{frames:[],next:0,oversized:0});
 }finally{a.dispose();}
});

test('player link indication hides brief flaps, marks prolonged loss and shows return without touching transport rights',()=>{
 const Indicators=require('../application/connection-indicators.js'),timers=new Map(),changes=[];let now=0,id=0;
 const view=new Indicators({now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),onChange:key=>changes.push(key)}),advance=ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
 assert.equal(view.project('guest',true).connected,true);assert.equal(view.project('guest',false).connected,true);advance(3000);assert.equal(view.project('guest',true).connectionRestored,false);advance(3000);assert.deepEqual(changes,[]);
 view.project('guest',false);advance(4999);assert.equal(view.project('guest',false).connectionOffline,false);advance(1);assert.equal(view.project('guest',false).connectionOffline,true);assert.equal(view.project('guest',false).connected,false);assert.deepEqual(changes,['guest']);
 assert.equal(view.project('guest',true).connectionRestored,true);advance(1800);assert.equal(view.project('guest',true).connectionRestored,false);view.project('other',false);view.retain(['guest']);advance(6000);assert(!changes.includes('other'));view.close();assert.equal(timers.size,0);
});

test('a closed RTC requests repair immediately but waits for grace before exposing a disconnection notice',async()=>{
 const Recovery=require('../application/recovery-coordinator.js'),link=new EventTarget(),timers=new Map();let id=0;link.connectionState='connected';
 const recovery=new Recovery({link,visibility:{hidden:false,subscribe:()=>()=>{}},transport:{status:async()=>({revision:0}),snapshot:async()=>({revision:0})},reconcile:async()=>{},clock:{now:()=>0,setInterval:()=>0,clearInterval(){},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)}});
 try{await recovery.check();link.connectionState='closed';link.dispatchEvent(new Event('connectionstatechange'));assert.equal(recovery.state,'invite');assert.equal(recovery.report().notice,false);const timer=[...timers.values()].find(t=>t.ms===5000);assert(timer);timer.fn();assert.equal(recovery.report().notice,true);link.connectionState='connected';await recovery.check();assert.equal(recovery.report().notice,false);assert.equal(recovery.state,'connected');}finally{recovery.close();}
});

test('offline player avatar uses a link symbol and accessible status instead of changing card geometry',()=>{
 require('../core/messages.js');const UI=require('../core/ui.js'),person={name:'Alice',network:true,connected:false,hasConnected:true,connectionOffline:true};const offline=UI.avatar(person,0),online=UI.avatar({...person,connected:true,connectionOffline:false,connectionRestored:true},0);
 assert(offline.includes('data-ui-icon="link-off"'));assert(offline.includes('aria-label="Alice · '));assert(!online.includes('data-ui-icon="link-off"'));assert(online.includes('class="avatar p0'));
});

test('recovery immediately follows an invalidated in-flight probe after visibility or link returns',async()=>{
 const Recovery=require('../application/recovery-coordinator.js');
 for(const transition of ['visibility','link','closed']){
  const link=new EventTarget(),visibility={hidden:false,subscribe(fn){this.changed=fn;return ()=>{};}},intervals=[],timers=[];link.connectionState='connected';let release,statuses=0,snapshots=0,reconciled=0;
  const gate=new Promise(resolve=>release=resolve),clock={now:()=>0,setInterval:fn=>{intervals.push(fn);return 1;},clearInterval(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}};
  const monitor=new Recovery({link,visibility,clock,currentStatus:()=>({kind:'status',revision:0}),transport:{status:async()=>{statuses++;if(statuses===1)await gate;return {kind:'status',revision:0};},snapshot:async()=>{snapshots++;return {revision:0};}},reconcile:async()=>{reconciled++;}});
  try{
   await new Promise(r=>setImmediate(r));
   if(transition==='visibility'){visibility.hidden=true;visibility.changed();visibility.hidden=false;visibility.changed();}
   else{link.connectionState=transition==='closed'?'closed':'disconnected';link.dispatchEvent(new Event('connectionstatechange'));link.connectionState='connected';link.dispatchEvent(new Event('connectionstatechange'));}
   const complete=monitor.check({recover:true});release();await complete;await new Promise(r=>setImmediate(r));
   assert.equal(statuses,2,transition+': stale flight must be followed without the periodic interval');assert.equal(snapshots,1);assert.equal(reconciled,1);assert.equal(monitor.state,'connected');assert.equal(monitor.report().notice,false);assert.equal(intervals.length,1);
  }finally{release();monitor.close();}
 }
});

test('forced recovery upgrades one current probe; repeated callers and periodic polls do not fan out',async()=>{
 const Recovery=require('../application/recovery-coordinator.js'),link=new EventTarget(),visibility={hidden:false,subscribe:()=>()=>{}};link.connectionState='connected';let statuses=0,snapshots=0,block=false,release;
 const gate=new Promise(r=>release=r),monitor=new Recovery({link,visibility,currentStatus:()=>({kind:'status',revision:0}),clock:{now:()=>0,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}},transport:{status:async()=>{statuses++;if(block)await gate;return {kind:'status',revision:0};},snapshot:async()=>{snapshots++;return {revision:0};}},reconcile:async()=>{}});
 try{await monitor.check();assert.equal(statuses,1);assert.equal(snapshots,1);block=true;const first=monitor.check();await new Promise(r=>setImmediate(r));const callers=Array.from({length:20},(_,i)=>monitor.check({recover:i%2===0}));release();await Promise.all([first,...callers]);assert.equal(statuses,2);assert.equal(snapshots,2);assert.equal(monitor.state,'connected');}finally{release();monitor.close();}
});

test('invalidated recovery never starts a follow-up after close or while still hidden',async()=>{
 const Recovery=require('../application/recovery-coordinator.js');
 for(const stop of ['close','hidden']){
  const link=new EventTarget(),visibility={hidden:false,subscribe(fn){this.changed=fn;return ()=>{};}};link.connectionState='connected';let statuses=0,snapshots=0,release;const gate=new Promise(r=>release=r);
  const monitor=new Recovery({link,visibility,currentStatus:()=>null,clock:{now:()=>0,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}},transport:{status:async()=>{statuses++;await gate;return {revision:0};},snapshot:async()=>{snapshots++;return {revision:0};}},reconcile:async()=>{throw Error('stale reconciliation');}});
  try{await new Promise(r=>setImmediate(r));visibility.hidden=true;visibility.changed();visibility.hidden=false;visibility.changed();if(stop==='close')monitor.close();else{visibility.hidden=true;visibility.changed();}release();await monitor.check();await new Promise(r=>setImmediate(r));assert.equal(statuses,1,stop);assert.equal(snapshots,0,stop);}finally{release();monitor.close();}
 }
});

test('recovery preserves a resume arriving as the previous flight settles',async()=>{
 const Recovery=require('../application/recovery-coordinator.js'),link=new EventTarget(),visibility={hidden:false,subscribe(fn){this.changed=fn;return ()=>{};}};link.connectionState='connected';let statuses=0,snapshots=0,resume=true;
 const monitor=new Recovery({link,visibility,currentStatus:()=>({revision:0}),clock:{now:()=>0,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}},transport:{status:async()=>{statuses++;return {revision:0};},snapshot:async()=>{snapshots++;return {revision:0};}},reconcile:async()=>{},onState:report=>{if(report.state==='connected'&&resume){resume=false;queueMicrotask(()=>queueMicrotask(()=>{visibility.hidden=true;visibility.changed();visibility.hidden=false;visibility.changed();}));}}});
 try{await monitor.check();await new Promise(r=>setImmediate(r));assert.equal(statuses,2);assert.equal(snapshots,2);assert.equal(monitor.state,'connected');}finally{monitor.close();}
});

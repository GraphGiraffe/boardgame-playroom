'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Transport=require('../app/transports/webrtc.js');
function fakeChannel(){
  const listeners=new Map();let closed=false;
  return {
    readyState:'open',
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    async emit(type,value){for(const fn of listeners.get(type)||[])fn(type==='message'?{data:require('../application/wire-codec.js').encode(value)}:{});await new Promise(resolve=>setImmediate(resolve));},
    send(raw){const message=require('../application/wire-codec.js').decode(raw);if(message.kind==='hello')queueMicrotask(()=>this.emit('message',{kind:'transport-ready',version:Transport.TRANSPORT_VERSION}));},
    close(){if(closed)return;closed=true;this.readyState='closed';this.emit('close');}
  };
}
test('RTC presence is isolated from game snapshots and ignores out-of-order statuses',async()=>{
  const channel=fakeChannel(),client=Transport.client(channel,{handshakeTimeout:1000});
  try{
    await client.ready();
    const seen=[];client.subscribePresence(s=>seen.push(s));
    const p=(revision,connected)=>({kind:'room-presence',roomId:'room-test',revision,
      participants:[{id:'guest-a',nickname:'Игрок & ко',connected}]});
    await channel.emit('message',p(5,false));assert.equal(seen.length,1);assert.equal(seen[0].participants[0].connected,false);
    await channel.emit('message',p(4,true));assert.equal(seen.length,1,'older status must not erase a disconnect');
    await channel.emit('message',p(5,true));assert.equal(seen.length,1,'same-revision status is a duplicate');
    await channel.emit('message',{kind:'room-presence',roomId:'room-test',revision:6,
      participants:[{id:'x',nickname:'X',connected:'yes'}]});assert.equal(seen.length,1,'invalid connection flag rejected');
    for(const extra of [{playerIndex:1.5},{playerIndex:32},{bot:'yes'},{local:'yes'},{hasConnected:'yes'}]){await channel.emit('message',{...p(6,true),participants:[{...p(6,true).participants[0],...extra}]});assert.equal(seen.length,1,'invalid role metadata rejected');}
    await channel.emit('message',{...p(6,true),participants:[{...p(6,true).participants[0],playerIndex:1,hasConnected:true,local:false,bot:false}]});assert.equal(seen.length,2);assert.equal(seen[1].participants[0].connected,true);
    seen[1].participants[0].nickname='TAMPER';
    client.subscribePresence(s=>{assert.equal(s.participants[0].nickname,'Игрок & ко');})();
  }finally{client.close();}
});

test('quick reactions are ephemeral, bounded and bound to the authenticated player/session',async()=>{
 const {Relay,items,valid}=require('../application/quick-reactions.js'),relay=new Relay();assert.equal(items.length,9);for(const item of items){assert(valid(item.shortcode));assert.equal(item.emoji,item.shortcode);}assert(valid('👏'));assert(!valid(':missing:'));
 const ctx={sessionId:'game-1',player:2,allowed:true},cmd={sessionId:'game-1',id:'reaction-1',emoji:'👏',player:0};
 assert.equal(relay.accept(ctx,cmd,1000).player,2,'wire player cannot impersonate someone else');
 assert.equal(relay.accept(ctx,cmd,1100),null,'retry does not replay the bubble');
 assert.throws(()=>relay.accept(ctx,{...cmd,id:'reaction-2'},1200),/RATE_LIMIT/);
 assert.throws(()=>relay.accept({...ctx,allowed:false},{...cmd,id:'reaction-2'},4000),/UNAVAILABLE/);
 assert.throws(()=>relay.accept({...ctx,player:-1},{...cmd,id:'reaction-2'},4000),/UNAVAILABLE/);
 assert.throws(()=>relay.accept(ctx,{...cmd,sessionId:'old-game'},4000),/UNAVAILABLE/);
 assert.throws(()=>relay.accept(ctx,{...cmd,emoji:'<svg>'},4000),/UNAVAILABLE/);
 assert.equal(relay.accept(ctx,{...cmd,id:'reaction-2'},3000).emoji,'👏');
 const channel=fakeChannel(),client=Transport.client(channel,{handshakeTimeout:1000});
 try{await client.ready();const events=[],snapshots=[];client.subscribe(s=>snapshots.push(s));client.subscribeReactions(e=>events.push(e));
  const event={kind:'quick-reaction',sessionId:'game-1',id:'r-1',player:2,emoji:'😮'};
  await channel.emit('message',event);await channel.emit('message',{...event,player:-1});assert.equal(events.length,1);assert.equal(snapshots.length,0);
  const replay=[];client.subscribeReactions(e=>replay.push(e));assert.equal(replay.length,0,'new subscription never replays old reactions');
 }finally{client.close();}
});

test('room conversation persists messages/reactions and filters team history and receipts',async()=>{
 const Chat=require('../application/room-chat.js'),memory=new Map(),store={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),transact:async fn=>fn()};
 const people={a:{id:'a',nickname:'Анна',connected:true},b:{id:'b',nickname:'Борис',connected:true},c:{id:'c',nickname:'Вера',connected:true},s:{id:'s',nickname:'Стол',connected:true}};
 const teams={a:'blue',b:'blue',c:'red',s:null};const ports={store:()=>store,clock:()=>1000,reactionValid:emoji=>emoji==='👏',resolve:(room,id)=>({person:people[id],player:['a','b','c'].indexOf(id),team:teams[id],teamColorRole:teams[id]?'side.'+teams[id]:null,allies:Object.keys(teams).filter(other=>teams[other]===teams[id]),sessionId:'game'})};
 const service=new Chat(ports),message={id:'msg-1',body:'Секрет команды',scope:'team'};
 await service.append('room','a',message);await service.append('room','a',message);
 assert.equal(service.read('room','b',{scope:'team'}).messages.length,1);assert.equal(service.read('room','c',{scope:'team'}).messages.length,0);assert.throws(()=>service.read('room','s',{scope:'team'}));
 assert.equal(service.read('room','a').messages.length,0);assert(!JSON.stringify(service.read('room','b',{scope:'team'})).includes('audience'));
 await service.markRead('room','c',{scope:'team',through:100});assert.equal(service.read('room','a',{scope:'team'}).messages[0].read,false);
 await service.markRead('room','b',{scope:'team',through:1});assert.equal(service.read('room','a',{scope:'team'}).messages[0].read,true);
 teams.b='red';assert.equal(service.read('room','b',{scope:'team'}).messages.length,0);
 await service.append('room','a',{id:'emoji-1',body:'👏',kind:'reaction'});await service.append('room','b',{id:'msg-2',body:'Всем привет'});
 const restored=new Chat(ports);assert.equal(restored.read('room','s').messages.length,2);assert.equal(restored.read('room','s').messages[0].kind,'reaction');
 await restored.markRead('room','c',{scope:'room',through:3});assert.equal(restored.read('room','a').messages[0].read,true);
 assert.equal(service.read('room','b',{after:2}).messages.length,1);
 const delta=service.read('room','a',{after:3,known:[{seq:'2',version:-1}]});assert.equal(delta.messages[0].body,undefined);assert.equal(delta.messages[0].read,true);
 await service.append('room','a',{id:'missed-old',body:'Пока были настройки'});await service.append('room','a',{id:'seen-new',body:'На экране игры'});
 await service.markRead('room','b',{through:5,only:true});assert.equal(service.summary('room','b').room,2,'live bubbles do not consume earlier missed messages');
 await service.append('room','a',{id:'reply-common',body:'Ответ',replyToId:'msg-2'});assert.equal(service.read('room','s').messages.find(m=>m.id==='reply-common').reply.body,'Всем привет');
 await assert.rejects(()=>service.append('room','a',{id:'reply-common',body:'Ответ',replyToId:'emoji-1'}));
 await assert.rejects(()=>service.append('room','c',{id:'reply-hidden',body:'Утечка',scope:'team',replyToId:'msg-1'}));
 await assert.rejects(()=>service.react('room','c',{scope:'team',targetId:'msg-1',emoji:'👏',enabled:true}));
 await service.react('room','a',{targetId:'msg-2',emoji:'👏',enabled:true});await service.react('room','a',{targetId:'msg-2',emoji:'👏',enabled:true});await service.react('room','s',{targetId:'msg-2',emoji:'👏',enabled:true});
 assert.deepEqual(service.read('room','a').messages.find(m=>m.id==='msg-2').reactions,[{emoji:'👏',count:2,mine:true}]);assert.equal(service.read('room','c').messages.find(m=>m.id==='msg-2').reactions[0].mine,false);
 await service.react('room','a',{targetId:'msg-2',emoji:'👏',enabled:false});assert.equal(service.read('room','a').messages.find(m=>m.id==='msg-2').reactions[0].count,1);
 assert(!JSON.stringify(service.read('room','s')).includes('authorId":"s"'),'reaction projection contains counts, not its private actor set');
 // A bounded read must not parse the whole persisted room once per reply.
 let sourceReads=0,resolutions=0,now=1000;const measuredStore={...store,getItem:key=>{sourceReads++;return store.getItem(key);}},bulk=new Chat({...ports,store:()=>measuredStore,clock:()=>now,resolve:(...args)=>{resolutions++;return ports.resolve(...args);}});
 const append=async value=>{now+=61000;return bulk.append('bulk','a',value);};
 await append({id:'private-root',body:'PRIVATE-TEAM-ONLY',scope:'team'});await append({id:'private-reply',body:'PRIVATE-TEAM-REPLY',scope:'team',replyToId:'private-root'});now+=61000;await bulk.append('bulk','b',{id:'private-root',body:'OTHER-PRIVATE-TEAM',scope:'team'});await append({id:'public-root',body:'Общий исходный текст'});
 for(let i=0;i<100;i++)await append({id:'bulk-'+i,body:'Ответ '+i,replyToId:'public-root'});
 sourceReads=resolutions=0;const page=bulk.read('bulk','s');assert.equal(page.messages.length,80);assert.equal(sourceReads,1,'one persisted source read per synchronous history page');assert.equal(resolutions,1,'one fresh access context per history page');assert(page.messages.every(row=>row.reply.body==='Общий исходный текст'));assert(!JSON.stringify(page).includes('PRIVATE-TEAM'),'shared lookup must not reveal another channel');assert(!JSON.stringify(page).includes('audience'));
 sourceReads=resolutions=0;const metadata=bulk.read('bulk','s',{after:104,known:[{seq:'104',version:-1}]});assert.equal(sourceReads,1);assert.equal(resolutions,1);assert.equal(metadata.messages[0].body,undefined);assert.equal(metadata.messages[0].reply.body,'Общий исходный текст','known receipt/reaction updates retain safe quote metadata');
 const unchanged=bulk.read('bulk','s',{after:104,known:[{seq:'104',version:metadata.messages[0].version}]});assert.deepEqual(unchanged.messages,[],'unchanged known metadata sends no rows');await bulk.react('bulk','a',{targetId:'bulk-99',emoji:'👏',enabled:true});const changed=bulk.read('bulk','s',{after:104,known:[{seq:'104',version:metadata.messages[0].version}]});assert.equal(changed.messages.length,1);assert.equal(changed.messages[0].reactions[0].count,1);assert.equal(changed.messages[0].body,undefined);assert(Object.isFrozen(bulk.records('bulk')[0]));
 const bluePage=bulk.read('bulk','a',{scope:'team'});assert.equal(bluePage.messages.length,2);assert.equal(bluePage.messages.find(row=>row.id==='private-reply').reply.body,'PRIVATE-TEAM-ONLY','request lookup preserves first-match reply semantics across author ID collisions');const privateReply=bulk.records('bulk').find(row=>row.id==='private-reply');teams.a='red';assert.equal(bulk.read('bulk','a',{scope:'team'}).messages.length,0,'the next read resolves membership afresh');assert.deepEqual(bulk.project(privateReply,'a','bulk').reply,{unavailable:true},'standalone live projection retains its fresh authorization fallback');teams.a='blue';
 people.b.connected=false;await assert.rejects(()=>service.append('room','b',{id:'bad',body:'Нет доступа'}));
 await assert.rejects(()=>service.append('room','a',{id:'msg-1',body:'Подмена',scope:'team'}));
});

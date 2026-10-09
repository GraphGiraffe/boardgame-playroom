'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js');
const Store=require('../app/network-session-store.js');

E.register({id:'lan01-integrity',name:'LAN-01 integrity',min:2,max:2,presets:[{id:'default'}],
  create(state){state.data={count:0,secret:'PRIVATE-INTEGRITY'};},
  legal(){return [{type:'advance'}];},
  apply(state,actor){state.data.count++;E.event(state,'next',actor,'action');state.turn=1-actor;},
  project(out){delete out.data.secret;}});

function fixture(){
  const session=new Session(E,'lan01-integrity',{players:[{name:'A'},{name:'B'}]});
  const initial=session.export(),next=session.prepare(0,{type:'advance'});
  return {record:{format:'playroom-network-host',version:1,sessionId:'same-session',
    roomId:'same-room',game:session.game,packVersion:session.packVersion,
    room:{id:'same-room',game:{id:session.game,version:session.packVersion}},
    initial,revision:1,updatedAt:Date.now()},
    steps:[{sessionId:'same-session',revision:1,state:next}],
    receipts:[{sessionId:'same-session',viewer:0,commandId:'cmd-1',signature:'original-envelope',
      receipt:{ok:true,code:'OK',commandId:'cmd-1',revision:1}}]};
}
async function restore(archive){
  const store=new Store({indexedDB:null});
  store.transaction=async()=>structuredClone(archive);
  return store.load('same-session',E,Session);
}

test('LAN-01 restored session matches its exact acknowledged journal',async()=>{
  const loaded=await restore(fixture());
  assert.equal(loaded.revision,1);
  assert.equal(loaded.session.current.move,1);
  assert.equal(loaded.session.current.data.secret,'PRIVATE-INTEGRITY');
  assert.equal(loaded.receipts[0].receipt.commandId,'cmd-1');
});

test('LAN-01 does not resume if a disk journal has a step without its ACK',async()=>{
  const archive=fixture();archive.receipts=[];
  await assert.rejects(restore(archive),/Неполный журнал/);
});

test('LAN-01 rejects extra or mismatched accepted receipts rather than replaying a move',async()=>{
  const cases=[
    a=>a.receipts.push({...a.receipts[0],commandId:'cmd-2',receipt:{...a.receipts[0].receipt,commandId:'cmd-2'}}),
    a=>a.receipts[0].receipt.revision=0,
    a=>a.receipts[0].receipt.revision=2,
    a=>a.receipts[0].receipt.commandId='altered',
    a=>a.receipts[0].signature='',
    a=>a.receipts[0].sessionId='other-session'
  ];
  for(const mutate of cases){
    const archive=fixture();mutate(archive);
    await assert.rejects(restore(archive),/Журнал|Несогласованные/);
  }
});

test('LAN-01 legacy read-only archive with no moves can still be inspected',async()=>{
  const archive=fixture();archive.record.revision=0;
  archive.steps=[];archive.receipts=[];
  const recovered=await restore(archive);
  assert.equal(recovered.session.states.length,1);
  assert.equal(recovered.revision,0);
});

test('LAN-01 will not restore an archive pointing to a different game or room',async()=>{
  for(const mutate of [
    a=>{a.record.room.game.id='another-game';},
    a=>{a.record.room.game.version='999.999.999';},
    a=>{a.record.room.id='different-room';},
    a=>{a.record.recovery={version:1,room:{id:'different-room',ownerId:'host'}};}
  ]){
    const archive=fixture();mutate(archive);
    await assert.rejects(restore(archive),/Сетевое сохранение повреждено/);
  }
});

test('LAN-01 never opens a transaction for receipts with mismatched command IDs',async()=>{
  const store=new Store({indexedDB:null});
  let writes=0;store.transaction=async()=>{writes++;};
  const {steps}=fixture();
  await assert.rejects(store.commit({sessionId:'same-session',previousRevision:0,nextState:steps[0].state,
    viewer:0,commandId:'cmd-1',signature:'signed',receipt:{ok:true,commandId:'wrong',revision:1}}),/Некорректная запись/);
  await assert.rejects(store.recordReceipt({sessionId:'same-session',viewer:0,commandId:'cmd-1',
    signature:'signed',receipt:{ok:false,commandId:'wrong',revision:0}}),/Некорректная квитанция/);
  assert.equal(writes,0);
});

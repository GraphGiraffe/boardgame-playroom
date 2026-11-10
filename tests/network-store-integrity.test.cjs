'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Codec=require('../core/session-codec.js'),Store=require('../platform/web/session-store.js');
E.register({id:'lan01-integrity',name:'Integrity',min:2,max:2,presets:[{id:'default'}],create(s){s.data={count:0,secret:'PRIVATE-INTEGRITY'};},legal(){return [{type:'advance'}];},apply(s,actor){s.data.count++;E.event(s,'next',actor,'action');s.turn=1-actor;},project(s){delete s.data.secret;}});
function fixture(){
 const session=new Session(E,'lan01-integrity',{players:[{name:'A'},{name:'B'}]}),initial=session.initialSave();session.act(0,{type:'advance'});const state=Session.storageState(E,session.current);
 return {record:{format:'playroom-network-host',version:2,eventStorage:'actions-checkpoint-v1',sessionId:'same-session',roomId:'same-room',game:session.game,packVersion:session.packVersion,room:{id:'same-room',game:{id:session.game,version:session.packVersion}},initial,checkpoint:{state,fingerprint:Codec.fingerprint(state)},revision:1,updatedAt:session.updatedAt},steps:[{sessionId:'same-session',revision:1,a:[0,{type:'advance'}]}],receipts:[{sessionId:'same-session',viewer:0,commandId:'cmd-1',signature:'sha256:'+'a'.repeat(64),receipt:{ok:true,code:'OK',commandId:'cmd-1',revision:1}}]};
}
async function restore(archive){const store=new Store({indexedDB:null});store.readPrivate=async()=>structuredClone(archive);return store.load('same-session',E,Session);}
test('checkpoint state and requested history retain private authority data without replay on load',async()=>{const saved=await restore(fixture());assert.equal(saved.revision,1);assert.equal(saved.session.current.data.secret,'PRIVATE-INTEGRITY');assert.equal(saved.session.states.length,2);assert.equal(saved.receipts[0].receipt.commandId,'cmd-1');});
test('checkpoint recovery rejects missing accepted command identities',async()=>{const raw=fixture();raw.receipts=[];await assert.rejects(restore(raw),/CHECKPOINT_RECEIPT_MISSING/);});
test('checkpoint recovery rejects duplicate, mismatched and malformed command receipts',async()=>{
 for(const mutate of [a=>a.receipts.push({...a.receipts[0],commandId:'cmd-2',receipt:{...a.receipts[0].receipt,commandId:'cmd-2'}}),a=>a.receipts[0].receipt.revision=0,a=>a.receipts[0].receipt.revision=2,a=>a.receipts[0].receipt.commandId='altered',a=>a.receipts[0].signature='',a=>a.receipts[0].sessionId='other-session']){const raw=fixture();mutate(raw);await assert.rejects(restore(raw),/CHECKPOINT_RECEIPT/);}
});
test('network recovery rejects the removed legacy formats',async()=>{for(const version of [0,1,3]){const raw=fixture();raw.record.version=version;await assert.rejects(restore(raw),/SAVE_FORMAT/);}const raw=fixture();raw.record.eventStorage='delta-v3';await assert.rejects(restore(raw),/SAVE_FORMAT/);});
test('checkpoint validation rejects corruption, missing actions and foreign game identity',async()=>{
 for(const mutate of [a=>a.record.checkpoint.state.data.count++,a=>a.steps=[],a=>a.record.room.game.id='other',a=>a.record.room.id='other',a=>a.record.packDigest='invalid',a=>a.steps[0].a[0]=1]){const raw=fixture();mutate(raw);await assert.rejects(restore(raw),/CHECKPOINT/);}
});
test('invalid receipts and incomplete action records never open a storage transaction',async()=>{
 const store=new Store({indexedDB:null});let writes=0;store.transaction=async()=>{writes++;};const raw=fixture();
 await assert.rejects(store.commit({sessionId:'same-session',previousRevision:0,nextState:raw.record.checkpoint.state,viewer:0,commandId:'cmd-1',signature:'signed',receipt:{ok:true,commandId:'wrong',revision:1}}),/COMMIT_BATCH_INVALID/);
 await assert.rejects(store.recordReceipt({sessionId:'same-session',viewer:0,commandId:'cmd-1',signature:'signed',receipt:{ok:false,commandId:'wrong',revision:0}}),/CHECKPOINT_RECEIPT_INVALID/);assert.equal(writes,0);
});
test('recoverable rooms require an immutable pack digest',async()=>{
 const store=new Store({indexedDB:null});let writes=0;store.transaction=async()=>{writes++;};const room={id:'same-room',ownerId:'host',game:{id:'lan01-integrity',version:'0.1.0'}};
 await assert.rejects(store.create({sessionId:'another',room,session:new Session(E,'lan01-integrity',{players:[{name:'A'},{name:'B'}]}),recovery:{version:1,room,tokens:[]}}),/CHECKPOINT_INVALID/);assert.equal(writes,0);
});
test('pack fingerprint covers installed rules as well as manifest',async()=>{
 const value=JSON.stringify({manifest:{id:'uno',version:'0.2.1'},files:{'rules.js':'old-rules'}}),packs={exportPack:()=>value};const before=await Store.fingerprintPack(packs,'uno','0.2.1');assert.match(before,/^sha256:[0-9a-f]{64}$/);packs.exportPack=()=>value.replace('old-rules','new-rules');assert.notEqual(await Store.fingerprintPack(packs,'uno','0.2.1'),before);
});

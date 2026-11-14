'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Cloud=require('../application/cloud-save-service.js');
const error=code=>Object.assign(Error(code),{code});
function fixture(remote){
 const listeners=new Set(),account={state:{kind:'account',id:'alice'},snapshot(){return this.state;},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},set(id){this.state={kind:id?'account':'local',id};for(const fn of listeners)fn();}},values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},copies=new Map([['local:one',{text:'original',checksum:'a',summary:{game:'uno'}}]]);
 let sequence=0;
 if(!remote){const rows=new Map();remote={rows,enabled:false,offline:false,puts:0,async call(action,data){if(this.offline)throw error('network');const r=rows.get(data.id);if(action==='get'){if(!r||r.deleted)throw error('not-found');return structuredClone(r);}if(action==='settings')this.enabled=data.enabled;if(['put','delete','enable'].includes(action)){if((r?.revision||0)!==data.revision)throw error('conflict');if(action==='put'){if(data.file==='quota')throw error('quota');this.puts++;rows.set(data.id,{id:data.id,revision:(r?.revision||0)+1,file:data.file,checksum:data.checksum,summary:data.summary,enabled:data.enabled,deleted:false});}else if(action==='delete')Object.assign(r,{revision:r.revision+1,file:null,checksum:null,deleted:true,enabled:false});else Object.assign(r,{revision:r.revision+1,enabled:data.enabled});}return {enabled:this.enabled,used:[...rows.values()].reduce((n,r)=>n+(r.file?.length||0),0),limit:10485760,entries:[...rows.values()].map(({file,...rest})=>structuredClone(rest))};}};}
 const local={capture:async key=>{if(!copies.has(key))throw error('not-found');return structuredClone(copies.get(key));},receive:async(row,guard,target)=>{guard();const key=target||'local:copy-'+(++sequence);copies.set(key,{text:row.file,checksum:row.checksum,summary:row.summary});return key;}},service=new Cloud({account,remote,storage,local,id:()=> 'cloud-'+(++sequence)});
 return {service,remote,account,copies,storage,local};
}
test('account default gates automatic upload; unchanged saves are not rewritten and offline work retries',async()=>{
 const {service:s,remote:r,copies}=fixture();await s.auto(['local:one']);assert.equal(r.puts,0);await s.settings(true);await s.auto(['local:one']);assert.equal(r.puts,1);assert.equal(s.state('local:one'),'synced');await s.auto(['local:one']);assert.equal(r.puts,1);
 copies.set('local:one',{text:'next',checksum:'b',summary:{}});s.dirty('local:one');r.offline=true;await s.auto(['local:one']);assert.equal(s.state('local:one'),'pending');r.offline=false;await s.auto(['local:one']);assert.equal(r.puts,2);assert.equal(s.state('local:one'),'synced');
 await s.settings(false);assert.equal(s.automatic('local:one'),false);await s.settings(true);assert.equal(s.automatic('local:one'),true);
 await s.toggle('local:one',false);copies.get('local:one').checksum='c';await s.auto(['local:one']);assert.equal(r.puts,2);
});
test('two devices detect concurrent changes; explicit download updates the same local record',async()=>{
 const a=fixture();await a.service.upload('local:one');const b=fixture(a.remote),cloudId=a.service.binding('local:one').id,key=await b.service.receiveRemote(cloudId);
 a.copies.set('local:one',{text:'from A',checksum:'a2',summary:{}});b.copies.set(key,{text:'from B',checksum:'b2',summary:{}});await a.service.upload('local:one');await assert.rejects(b.service.sync(key),/conflict/);assert.equal(b.service.state(key),'conflict');assert.equal(a.remote.rows.get(cloudId).file,'from A');
 const received=await b.service.download(key,{force:true});assert.equal(b.copies.get(received).text,'from A');assert.equal(received,key);assert.equal(b.copies.get(key).text,'from A');assert.equal(b.copies.size,2);assert.equal(b.service.automatic(key),false);assert.equal(b.service.state(received),'synced');
});
test('quota failure and cloud deletion preserve local archives and do not silently resurrect deleted files',async()=>{
 const {service:s,remote:r,copies}=fixture();await s.settings(true);await s.upload('local:one');const id=s.binding('local:one').id;copies.set('local:one',{text:'quota',checksum:'big',summary:{}});await assert.rejects(s.upload('local:one'),/quota/);assert.equal(r.rows.get(id).file,'original');assert.equal(copies.get('local:one').text,'quota');await s.remove('local:one');assert(copies.has('local:one'));assert.equal(s.used,0);assert.equal(s.automatic('local:one'),false);
 await s.upload('local:one');assert(r.rows.get(id).deleted);copies.set('local:one',{text:'restored',checksum:'c',summary:{}});await s.upload('local:one',{force:true});assert.equal(r.rows.get(id).file,'restored');
});
test('an account switch fences in-flight cloud responses and keeps bindings separate',async()=>{
 const f=fixture();await f.service.upload('local:one');f.remote.rows.get(f.service.binding('local:one').id).checksum='remote-change';let finish;const original=f.remote.call.bind(f.remote);f.remote.call=(action,data)=>action==='get'?new Promise(resolve=>finish=resolve):original(action,data);
 const job=f.service.download('local:one',{force:true});while(!finish)await new Promise(resolve=>setImmediate(resolve));f.account.set('bob');finish({file:'private A',checksum:'a',revision:1});await assert.rejects(job,/account-changed/);assert.equal(f.copies.size,1);assert.deepEqual(f.service.bindings,{});f.account.set('alice');assert(f.service.bindings['local:one']);
 // Switch after a successful refresh has emitted, before remove resumes. The
 // response itself was valid; the subsequent action must retain its old owner.
 const deletion=fixture(),s=deletion.service;await s.upload('local:one');
 deletion.account.set('bob');await s.settings(true);await s.upload('local:one');const bobBindings=structuredClone(s.bindings);
 deletion.account.set('alice');const calls=[],call=deletion.remote.call.bind(deletion.remote);let refreshed=false,switched=false;
 deletion.remote.call=async(action,data)=>{calls.push(action);const value=await call(action,data);if(action==='list')refreshed=true;return value;};
 const stop=s.subscribe(()=>{if(refreshed&&!switched&&s.user==='alice'){switched=true;deletion.account.set('bob');}});
 await assert.rejects(s.remove('local:one'),/account-changed/);stop();
 assert(switched,'switch occurs in the completed refresh notification');assert(!calls.includes('delete'),'no deletion is dispatched under the replacement account');assert.deepEqual(s.bindings,bobBindings,'new account automatic-save policy and binding are untouched');assert.equal(s.jobs.size,0);assert.equal(deletion.copies.size,1);
});
test('multiple upload calls for one archive share a job; a failed import does not remap the original',async()=>{
 const {service:s,remote:r,local}=fixture();await Promise.all([s.upload('local:one'),s.upload('local:one')]);assert.equal(r.puts,1);const before=structuredClone(s.bindings);r.rows.get(s.binding('local:one').id).checksum='remote-change';r.rows.get(s.binding('local:one').id).revision++;local.receive=async()=>{throw error('SAVE_PACK_MISSING');};await assert.rejects(s.download('local:one',{force:true}),/SAVE_PACK_MISSING/);assert.equal(s.bindings['local:one'].id,before['local:one'].id);
});
test('committed cloud preferences survive older shared reads, failed settings and explicit uploads',async()=>{
 const f=fixture(),s=f.service,r=f.remote;await s.settings(true);
 const original=r.call.bind(r);let release,entered,lists=0;
 const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 r.call=async(action,data)=>{const result=await original(action,data);if(action==='list'){lists++;entered();await gate;}return result;};
 const old=s.refresh();await started;await s.settings(false);
 // Another consumer can request the same list after the successful mutation.
 const shared=s.refresh();release();await Promise.all([old,shared]);
 assert.equal(s.enabled,false,'a list begun before the committed opt-out must not restore enabled=true');
 assert.equal(lists,1,'overlapping cloud refreshes retain the same read owner');
 await s.auto(['local:one']);assert.equal(r.puts,0,'scan after opt-out must not upload an unbound archive');
 await s.upload('local:one');assert.equal(r.puts,1,'explicit upload remains allowed with automatic uploads off');
 let releaseOff,enteredOff;const seenOff=new Promise(resolve=>enteredOff=resolve),offGate=new Promise(resolve=>releaseOff=resolve);
 r.call=async(action,data)=>{const result=await original(action,data);if(action==='list'){enteredOff();await offGate;}return result;};
 const oldOff=s.refresh();await seenOff;await s.settings(true);releaseOff();await oldOff;
 assert.equal(s.enabled,true,'an older disabled list cannot undo a committed opt-in');
 r.call=async(action,data)=>{if(action==='settings')throw error('network');return original(action,data);};
 await assert.rejects(s.settings(false),/network/);await s.refresh();assert.equal(s.enabled,true,'failed settings preserve the last committed policy');
});
test('automatic cloud uploads recheck committed policy after capture and metadata waits',async()=>{
 for(const stage of ['capture','metadata']){
  const f=fixture(),s=f.service,r=f.remote;await s.settings(true);
  let release,entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  if(stage==='capture'){const capture=f.local.capture;f.local.capture=async key=>{const copy=await capture(key);entered();await gate;return copy;};}
  else{const call=r.call.bind(r);r.call=async(action,data)=>{const result=await call(action,data);if(action==='list'){entered();await gate;}return result;};}
  const upload=s.auto(['local:one']);await started;await s.settings(false);release();await upload;
  assert.equal(r.puts,0,stage+': an automatic job must not dispatch PUT after opt-out');
  assert.equal(s.enabled,false);await s.upload('local:one');assert.equal(r.puts,1,stage+': manual upload remains explicit');
  await s.toggle('local:one',true);f.copies.get('local:one').checksum='explicit-per-save';await s.auto(['local:one']);
  assert.equal(r.puts,2,stage+': an explicit per-save override still enables automatic upload');
 }
});
test('delayed cloud PUT replies cannot undo a subsequently committed default preference',async()=>{
 const Social=require('../platform/web/supabase-social.js'),Sync=require('../application/account-sync-service.js');
 for(const mode of ['automatic','manual']){
  const f=fixture(),s=f.service,rows=new Map(),calls=[];let enabled=true,release,entered;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),snapshot=()=>({enabled,used:[...rows.values()].reduce((sum,row)=>sum+row.file.length,0),limit:10485760,entries:[...rows.values()].map(({file,...row})=>({...row,bytes:file.length}))});
  const auth={config:{url:'https://fixture.invalid',publishableKey:'fixture'},session:async()=>({user:{id:f.account.snapshot().id},access_token:'fixture'})};
  const fetch=async(url,options)=>{
   const {p_action:action,p_data:data}=JSON.parse(options.body);calls.push(action);
   if(action==='settings')enabled=data.enabled;
   if(action==='put')rows.set(data.id,{...data,revision:data.revision+1,deleted:false});
   if(action==='enable')Object.assign(rows.get(data.id),{enabled:data.enabled,revision:data.revision+1});
   const value=action==='sync'?{results:data.requests.map(request=>({id:request.id,data:snapshot()}))}:snapshot();
   if(action==='put'){entered();await gate;}
   return {ok:true,json:async()=>value};
  };
  const batch=new Sync({account:f.account,remote:new Social({auth,fetch,rpc:'playroom_account_sync'})});
  s.remote=new Social({auth,fetch,batch,rpc:'playroom_cloud_saves_rpc'});await s.refresh();
  const upload=mode==='automatic'?s.auto(['local:one']):s.upload('local:one');await started;await s.settings(false);release();await upload;
  assert.equal(s.enabled,false,mode+': a PUT committed before opt-out must not restore its old global preference');
  assert.equal(s.used,'original'.length);assert.equal(s.entries.length,1);assert.equal(s.binding('local:one').base,'a');assert.equal(s.binding('local:one').revision,1);
  assert.equal(s.state('local:one'),'synced');assert.equal(s.automatic('local:one'),false);assert.equal(calls.filter(action=>action==='put').length,1);assert.equal(calls.filter(action=>action==='sync').length,2,'no recovery or policy-check RPC is added');
  await s.toggle('local:one',true);assert.equal(s.automatic('local:one'),true,'independent per-save opt-in still overrides global off');
 }
});
test('cloud refresh rechecks its account after the inner call guard microtask',async()=>{
 const f=fixture(),s=f.service,privateMetadata={enabled:true,used:7,limit:10485760,entries:[{id:'alice-only',revision:1,checksum:'alice-private',deleted:false}]};let switched=false;
 f.remote.call=()=>{
  const response=Promise.resolve(privateMetadata);
  // Registered before call() awaits response: this observer queues the account
  // switch after call's own guard but before refresh's await continuation.
  response.then(()=>queueMicrotask(()=>{switched=true;f.account.set('bob');}));return response;
 };
 const result=await Promise.allSettled([s.refresh()]);
 assert(switched);assert.equal(s.user,'bob');assert.deepEqual(s.entries,[],'Alice metadata must not be accepted into Bob after the inner guard');
 assert.equal(s.enabled,false);assert.equal(s.used,0);assert.equal(f.storage.getItem('playroom.cloud-saves.v1:bob'),undefined);
 assert.equal(result[0].status,'rejected');assert.equal(result[0].reason.code,'account-changed');
});
test('delete requested during an upload runs after it instead of sharing and losing the action',async()=>{
 const {service:s,remote:r}=fixture(),original=r.call.bind(r);let release,entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 r.call=async(action,data)=>{const result=await original(action,data);if(action==='put'){entered();await gate;}return result;};
 const upload=s.upload('local:one');await started;const deletion=s.remove('local:one');release();await Promise.all([upload,deletion]);assert.equal(r.rows.get(s.binding('local:one').id).deleted,true);assert.equal(s.used,0);
});

test('bulk cloud removal waits for uploads, includes cloud-only files and preserves local archives',async()=>{
 const f=fixture(),s=f.service,r=f.remote;await s.settings(true);await s.upload('local:one');
 r.rows.set('remote-only',{id:'remote-only',revision:1,file:'remote',checksum:'remote',enabled:true,deleted:false});
 f.copies.set('local:unbound',{text:'unbound',checksum:'new',summary:{}});
 const original=r.call.bind(r);let release,entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 r.call=async(action,data)=>{const result=await original(action,data);if(action==='put'){entered();await gate;}return result;};
 f.copies.get('local:one').checksum='changed';const upload=s.upload('local:one');await started;
 const deletion=s.removeAll([...f.copies.keys()]);await assert.rejects(s.upload('local:unbound'),/busy/);release();await Promise.all([upload,deletion]);
 assert.equal(s.used,0);assert([...r.rows.values()].every(row=>row.deleted));assert.equal(f.copies.size,2);assert.equal(s.enabled,true);
 const puts=r.puts;await s.auto([...f.copies.keys()]);assert.equal(r.puts,puts);assert.equal(s.clearing,false);
});
test('bulk cloud removal reports partial errors, retries and fences account switches',async()=>{
 const f=fixture(),s=f.service,r=f.remote;await s.upload('local:one');r.rows.set('second',{id:'second',revision:1,file:'remote',checksum:'remote',enabled:true,deleted:false});
 const original=r.call.bind(r);r.call=async(action,data)=>{if(action==='delete'&&data.id==='second')throw error('network');return original(action,data);};
 await assert.rejects(s.removeAll(['local:one']),/network/);assert.equal(s.clearing,false);assert.equal(s.error,'network');assert.equal(s.entries.filter(e=>!e.deleted).length,1);assert.equal(f.copies.size,1);
 r.call=original;await s.removeAll(['local:one']);assert.equal(s.used,0);
 let release;const gate=new Promise(resolve=>release=resolve);r.call=async(action,data)=>{if(action==='list')await gate;return original(action,data);};
 const job=s.removeAll(['local:one']);await new Promise(resolve=>setImmediate(resolve));f.account.set('bob');release();await assert.rejects(job,/account-changed/);assert.deepEqual(s.bindings,{});assert.equal(s.clearing,false);
});

test('cloud save UI fences refresh and deferred auto work across account changes',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),listeners=new Set(),events={},reads=[],uploads=[];
 let identity='alice',releaseAlice,releaseBob,releaseIdle;
 const alice=new Promise(resolve=>releaseAlice=resolve),bob=new Promise(resolve=>releaseBob=resolve),idle=new Promise(resolve=>releaseIdle=resolve);
 const account={snapshot:()=>({kind:'account',id:identity}),subscribe:fn=>listeners.add(fn)},storage=new Map();
 const context={PlayroomCloudSaveService:Cloud,crypto:require('node:crypto').webcrypto,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){},Event,PlayroomNetworkLibrary:{cloudIdle:()=>idle}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../app/cloud-saves-ui.js'),'utf8'),context);
 context.PlayroomCloudSavesUI.init({account,storage:context.localStorage,remote:{call:async(action,data,{userId})=>{reads.push(userId);await(userId==='alice'?alice:bob);return {enabled:false,used:userId==='bob'?11:22,limit:10485760,entries:[]};}}});
 const ui=context.PlayroomCloudSavesUI,tick=()=>new Promise(resolve=>setImmediate(resolve));identity='bob';for(const fn of listeners)fn();await tick();assert.deepEqual(reads,['alice','bob']);
 releaseAlice();await tick();const bobRead=ui.refresh();assert.deepEqual(reads,['alice','bob'],'an old finally cannot discard the current account job');releaseBob();await bobRead;assert.equal(ui.service.used,11);
 ui.service.auto=async keys=>uploads.push({user:ui.service.user,keys:[...keys]});
 identity='alice';for(const fn of listeners)fn();ui.saved('local:alice',{menu:true});identity='bob';for(const fn of listeners)fn();ui.saved('local:bob',{menu:true});releaseIdle();await tick();
 assert.deepEqual(uploads,[{user:'bob',keys:['local:bob']}],'a deferred old account batch cannot run in the new account');
});

test('automatic cloud batches reuse metadata once while manual refresh, conflicts and retries stay independent',async()=>{
 const f=fixture(),s=f.service,r=f.remote;for(const key of ['local:two','local:three'])f.copies.set(key,{text:key,checksum:key,summary:{}});await s.settings(true);const calls=[],original=r.call.bind(r);r.call=async(action,...args)=>{calls.push(action);return original(action,...args);};
 await s.auto([...f.copies.keys()]);assert.equal(calls.filter(a=>a==='list').length,1,'one fresh metadata request for the automatic batch');assert.equal(r.puts,3);assert([...f.copies.keys()].every(key=>s.state(key)==='synced'));
 calls.length=0;await s.auto([...f.copies.keys()]);assert.equal(calls.filter(a=>a==='list').length,1,'a later batch still refreshes its own metadata');assert.equal(r.puts,3,'unchanged exact bytes are not uploaded again');
 calls.length=0;await s.upload('local:one');await s.upload('local:two');assert.equal(calls.filter(a=>a==='list').length,2,'explicit uploads keep independent immediate metadata reads');
 const first=s.binding('local:one').id,second=s.binding('local:two').id;for(const [key,copy]of f.copies){copy.text=key+'-changed';copy.checksum=key+'-changed';s.dirty(key);}let drift=false;r.call=async(action,data)=>{const result=await original(action,data);if(action==='put'&&data.id===first&&!drift){drift=true;const row=r.rows.get(second);Object.assign(row,{revision:row.revision+1,file:'OTHER-DEVICE',checksum:'OTHER-DEVICE'});}return result;};await s.auto([...f.copies.keys()]);assert.equal(r.rows.get(second).file,'OTHER-DEVICE','expected revision protects a change after the shared metadata read');assert.equal(s.state('local:two'),'conflict');assert.equal(f.copies.get('local:two').text,'local:two-changed');
 const failing=fixture();await failing.service.settings(true);let lists=0;failing.remote.offline=true;const call=failing.remote.call.bind(failing.remote);failing.remote.call=async(action,...args)=>{if(action==='list')lists++;return call(action,...args);};await failing.service.auto(['local:one']);assert.equal(failing.service.state('local:one'),'pending');failing.remote.offline=false;await failing.service.auto(['local:one']);assert.equal(lists,2,'failed metadata is not retained across retry batches');assert.equal(failing.remote.puts,1);
 const partial=fixture();partial.copies.get('local:one').text='quota';partial.copies.set('local:two',{text:'second',checksum:'second',summary:{}});await partial.service.settings(true);let partialLists=0;const partialCall=partial.remote.call.bind(partial.remote);partial.remote.call=async(action,...args)=>{if(action==='list')partialLists++;return partialCall(action,...args);};await partial.service.auto([...partial.copies.keys()]);assert.equal(partialLists,1);assert.equal(partial.remote.puts,1);assert.equal(partial.service.state('local:one'),'error');assert.equal(partial.service.state('local:two'),'synced','one quota error does not discard the rest of a batch');partial.copies.get('local:one').text='retry';await partial.service.auto([...partial.copies.keys()]);assert.equal(partialLists,2);assert.equal(partial.remote.puts,2);
 const switched=fixture();switched.copies.set('local:two',{text:'second',checksum:'second',summary:{}});await switched.service.settings(true);const switchCall=switched.remote.call.bind(switched.remote);switched.remote.call=async(action,...args)=>{const value=await switchCall(action,...args);if(action==='put')switched.account.set('bob');return value;};await switched.service.auto([...switched.copies.keys()]);assert.equal(switched.remote.puts,1,'no later batch item is sent after account replacement');assert.equal(switched.service.user,'bob');assert.deepEqual(switched.service.bindings,{});assert.equal(switched.service.jobs.size,0);
});

test('unchanged cloud content can replace an oversized archive with its compact encoding',async()=>{
 const f=fixture(),key='local:one';f.copies.set(key,{text:'x'.repeat(8192),checksum:'same-content',summary:{game:'ludo'}});await f.service.upload(key);const id=f.service.binding(key).id,row=f.remote.rows.get(id),revision=row.revision;row.bytes=8192;
 f.copies.set(key,{text:'compact-archive',checksum:'same-content',summary:{game:'ludo'}});await f.service.sync(key);assert.equal(f.remote.rows.get(id).file,'compact-archive');assert.equal(f.remote.rows.get(id).revision,revision+1);assert.equal(f.service.used,'compact-archive'.length);const puts=f.remote.puts;await f.service.sync(key);assert.equal(f.remote.puts,puts,'same compact representation is not rewritten again');
});

test('repeated remote receive reuses its binding and concurrent first receives install once',async()=>{
 const a=fixture();await a.service.upload('local:one');const id=a.service.binding('local:one').id;assert.equal(await a.service.receiveRemote(id),'local:one');assert.equal(a.copies.size,1);
 const b=fixture(a.remote);b.copies.clear();const [first,second]=await Promise.all([b.service.receiveRemote(id),b.service.receiveRemote(id)]);assert.equal(first,second);assert.equal(b.copies.size,1);assert.equal(await b.service.receiveRemote(id),first);assert.equal(b.copies.size,1);
 a.copies.set('local:one',{text:'updated',checksum:'b',summary:{}});await a.service.upload('local:one');assert.equal(await b.service.receiveRemote(id),first);assert.equal(b.copies.size,1);assert.equal(b.copies.get(first).text,'updated');
});

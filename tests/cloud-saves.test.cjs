'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Cloud=require('../application/cloud-save-service.js');
const error=code=>Object.assign(Error(code),{code});
function fixture(remote){
 const listeners=new Set(),account={state:{kind:'account',id:'alice'},snapshot(){return this.state;},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},set(id){this.state={kind:id?'account':'local',id};for(const fn of listeners)fn();}},values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},copies=new Map([['local:one',{text:'original',checksum:'a',summary:{game:'uno'}}]]);
 let sequence=0;
 if(!remote){const rows=new Map();remote={rows,enabled:false,offline:false,puts:0,async call(action,data){if(this.offline)throw error('network');const r=rows.get(data.id);if(action==='get'){if(!r||r.deleted)throw error('not-found');return structuredClone(r);}if(action==='settings')this.enabled=data.enabled;if(['put','delete','enable'].includes(action)){if((r?.revision||0)!==data.revision)throw error('conflict');if(action==='put'){if(data.file==='quota')throw error('quota');this.puts++;rows.set(data.id,{id:data.id,revision:(r?.revision||0)+1,file:data.file,checksum:data.checksum,summary:data.summary,enabled:data.enabled,deleted:false});}else if(action==='delete')Object.assign(r,{revision:r.revision+1,file:null,checksum:null,deleted:true,enabled:false});else Object.assign(r,{revision:r.revision+1,enabled:data.enabled});}return {enabled:this.enabled,used:[...rows.values()].reduce((n,r)=>n+(r.file?.length||0),0),limit:10485760,entries:[...rows.values()].map(({file,...rest})=>structuredClone(rest))};}};}
 const local={capture:async key=>{if(!copies.has(key))throw error('not-found');return structuredClone(copies.get(key));},receive:async(row,guard)=>{guard();const key='local:copy-'+(++sequence);copies.set(key,{text:row.file,checksum:row.checksum,summary:row.summary});return key;}},service=new Cloud({account,remote,storage,local,id:()=> 'cloud-'+(++sequence)});
 return {service,remote,account,copies,storage,local};
}
test('account default gates automatic upload; unchanged saves are not rewritten and offline work retries',async()=>{
 const {service:s,remote:r,copies}=fixture();await s.auto(['local:one']);assert.equal(r.puts,0);await s.settings(true);await s.auto(['local:one']);assert.equal(r.puts,1);assert.equal(s.state('local:one'),'synced');await s.auto(['local:one']);assert.equal(r.puts,1);
 copies.set('local:one',{text:'next',checksum:'b',summary:{}});s.dirty('local:one');r.offline=true;await s.auto(['local:one']);assert.equal(s.state('local:one'),'pending');r.offline=false;await s.auto(['local:one']);assert.equal(r.puts,2);assert.equal(s.state('local:one'),'synced');
 await s.settings(false);assert.equal(s.automatic('local:one'),false);await s.settings(true);assert.equal(s.automatic('local:one'),true);
 await s.toggle('local:one',false);copies.get('local:one').checksum='c';await s.auto(['local:one']);assert.equal(r.puts,2);
});
test('two devices detect concurrent changes; explicit download retains the old local copy with auto-upload disabled',async()=>{
 const a=fixture();await a.service.upload('local:one');const b=fixture(a.remote),cloudId=a.service.binding('local:one').id,key=await b.service.receiveRemote(cloudId);
 a.copies.set('local:one',{text:'from A',checksum:'a2',summary:{}});b.copies.set(key,{text:'from B',checksum:'b2',summary:{}});await a.service.upload('local:one');await assert.rejects(b.service.sync(key),/conflict/);assert.equal(b.service.state(key),'conflict');assert.equal(a.remote.rows.get(cloudId).file,'from A');
 const received=await b.service.download(key,{force:true});assert.equal(b.copies.get(received).text,'from A');assert.equal(b.copies.get(key).text,'from B');assert.equal(b.service.automatic(key),false);assert.equal(b.service.state(received),'synced');
});
test('quota failure and cloud deletion preserve local archives and do not silently resurrect deleted files',async()=>{
 const {service:s,remote:r,copies}=fixture();await s.settings(true);await s.upload('local:one');const id=s.binding('local:one').id;copies.set('local:one',{text:'quota',checksum:'big',summary:{}});await assert.rejects(s.upload('local:one'),/quota/);assert.equal(r.rows.get(id).file,'original');assert.equal(copies.get('local:one').text,'quota');await s.remove('local:one');assert(copies.has('local:one'));assert.equal(s.used,0);assert.equal(s.automatic('local:one'),false);
 await s.upload('local:one');assert(r.rows.get(id).deleted);copies.set('local:one',{text:'restored',checksum:'c',summary:{}});await s.upload('local:one',{force:true});assert.equal(r.rows.get(id).file,'restored');
});
test('an account switch fences in-flight cloud responses and keeps bindings separate',async()=>{
 const f=fixture();await f.service.upload('local:one');let finish;const original=f.remote.call.bind(f.remote);f.remote.call=(action,data)=>action==='get'?new Promise(resolve=>finish=resolve):original(action,data);
 const job=f.service.download('local:one',{force:true});while(!finish)await new Promise(resolve=>setImmediate(resolve));f.account.set('bob');finish({file:'private A',checksum:'a',revision:1});await assert.rejects(job,/account-changed/);assert.equal(f.copies.size,1);assert.deepEqual(f.service.bindings,{});f.account.set('alice');assert(f.service.bindings['local:one']);
});
test('multiple upload calls for one archive share a job; a failed import does not remap the original',async()=>{
 const {service:s,remote:r,local}=fixture();await Promise.all([s.upload('local:one'),s.upload('local:one')]);assert.equal(r.puts,1);const before=structuredClone(s.bindings);local.receive=async()=>{throw error('SAVE_PACK_MISSING');};await assert.rejects(s.download('local:one',{force:true}),/SAVE_PACK_MISSING/);assert.equal(s.bindings['local:one'].id,before['local:one'].id);
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

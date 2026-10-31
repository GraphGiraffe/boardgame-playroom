'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Sync=require('../application/account-sync-service.js');
function fixture(){const listeners=new Set(),account={state:{kind:'account',id:'alice'},snapshot(){return this.state;},subscribe(fn){listeners.add(fn);},set(id){this.state={kind:id?'account':'local',id};for(const fn of listeners)fn();}},calls=[],callbacks=[],remote={async call(action,data,options){calls.push({action,data,options});return {results:data.requests.map(r=>r.action==='group-list'?{id:r.id,error:{code:'setup',serverCode:'42P01'}}:{id:r.id,data:{rpc:r.rpc,action:r.action,data:r.data}})};}},sync=new Sync({account,remote,schedule:fn=>callbacks.push(fn)});return {account,calls,callbacks,remote,sync};}
test('one account request coalesces independent sections, deduplicates reads and retains incremental cursors',async()=>{
 const {sync:s,calls,callbacks}=fixture(),a=s.request('playroom_online','unread'),b=s.request('playroom_online','inbox',{after:'923'}),c=s.request('playroom_cloud_saves_rpc','list'),d=s.request('playroom_online','unread');callbacks.shift()();const result=await Promise.all([a,b,c,d]);assert.equal(calls.length,1);assert.equal(calls[0].data.requests.length,3);assert.deepEqual(result[1].data,{after:'923'});assert.deepEqual(result[0],result[3]);assert.equal(calls[0].options.userId,'alice');
});
test('failed sections do not hide successful ones, and cloud file writes are never eligible',async()=>{
 const {sync:s,callbacks}=fixture(),a=s.request('playroom_online','group-list'),b=s.request('playroom_cloud_saves_rpc','list');const result=Promise.allSettled([a,b]);callbacks.shift()();const rows=await result;assert.equal(rows[0].reason.code,'setup');assert.equal(rows[1].status,'fulfilled');for(const [rpc,action] of [['playroom_online','send-message'],['playroom_cloud_saves_rpc','put'],['playroom_cloud_saves_rpc','get'],['playroom_signal','poll'],['playroom_host_transfer','activate']])assert.equal(s.supports(rpc,action),false);
});
test('account changes reject queued and in-flight reads instead of hydrating another user',async()=>{
 const f=fixture(),job=f.sync.request('playroom_online','unread'),rejected=assert.rejects(job,/account-changed/);f.account.set('bob');await rejected;f.callbacks.shift()();assert.equal(f.calls.length,0);
 let finish;f.remote.call=()=>new Promise(resolve=>finish=resolve);const next=f.sync.request('playroom_online','unread'),old=assert.rejects(next,/account-changed/);f.callbacks.shift()();f.account.set('alice');finish({results:[{id:'r2',data:{private:'bob'}}]});await old;
});
test('startup push config can be consumed after worker readiness without a second HTTP request',async()=>{
 const f=fixture(),job=f.sync.request('playroom_push','config');f.callbacks.shift()();await job;await f.sync.request('playroom_push','config');assert.equal(f.calls.length,1);f.sync.invalidate();const again=f.sync.request('playroom_push','config');f.callbacks.shift()();await again;assert.equal(f.calls.length,2);
});

test('room discovery and membership refresh share one account request',async()=>{const f=fixture(),a=f.sync.request('playroom_social','list'),b=f.sync.request('playroom_online','discover');f.callbacks.shift()();await Promise.all([a,b]);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].data.requests.map(r=>r.action),['list','discover']);});

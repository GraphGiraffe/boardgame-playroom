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

test('room discovery and membership refresh share one account request',async()=>{
 const f=fixture(),a=f.sync.request('playroom_social','list'),b=f.sync.request('playroom_online','discover'),c=f.sync.request('playroom_online','room-preview',{roomCode:'0123'});
 f.callbacks.shift()();const values=await Promise.all([a,b,c]);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].data.requests.map(r=>r.action),['list','discover','room-preview']);assert.deepEqual(values[2].data,{roomCode:'0123'});assert.equal(f.sync.supports('playroom_online','join-password'),false,'preview eligibility never admits a join mutation');
});

test('conversation search batches bounded requests without caching private results or changing mutation revision',async()=>{
 const f=fixture(),Community=require('../application/community-service.js'),service=new Community({account:f.account,remote:{call:(action,data,options)=>f.sync.request('playroom_online',action,data,options)}});
 const first=service.call('chat-search',{userId:'bob',query:'%_literal',before:'9007199254740994'}),group=service.call('group-search',{groupId:'group',query:'hello'});f.callbacks.shift()();const values=await Promise.all([first,group]);assert.equal(f.calls.length,1);assert.deepEqual(values[0].data,{userId:'bob',query:'%_literal',before:'9007199254740994'});assert.equal(service.revision,0);
 const again=service.call('chat-search',{userId:'bob',query:'%_literal',before:'9007199254740994'});f.callbacks.shift()();await again;assert.equal(f.calls.length,2,'search is not retained in the account read cache');
 let finish;f.remote.call=()=>new Promise(resolve=>finish=resolve);const pending=service.call('group-search',{groupId:'group',query:'private'}),rejected=assert.rejects(pending,/account-changed/);f.callbacks.shift()();f.account.set('bob');finish({results:[{id:'r4',data:{messages:[{body:'private'}]}}]});await rejected;
});

test('notification lifecycle wakes reuse a just completed read without caching private responses or delaying explicit polls',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),events=new Map(),timers=new Map(),calls=[];let now=1000,hidden=false,roomId=null,serial=0,failUnread=false;
 const f=fixture();f.sync.schedule=fn=>queueMicrotask(fn);f.remote.call=async(action,data)=>{const response={results:data.requests.map(r=>failUnread&&r.action==='unread'?{id:r.id,error:{code:'request'}}:({id:r.id,data:r.action==='unread'?{chats:[],friends:[]}:{cursor:'1',items:[]}}))};calls.push({action,requests:data.requests.length,requestBytes:Buffer.byteLength(JSON.stringify(data)),responseBytes:Buffer.byteLength(JSON.stringify(response))});return response;};
 const ctx={Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),document:{get hidden(){return hidden;},addEventListener:(name,fn)=>events.set(name,fn),querySelector:()=>null},addEventListener:(name,fn)=>events.set(name,fn),PlayroomDOM:{clearVisualExits(){}},PlayroomFriendNotifications:class{update(){return[];}},PlayroomCloudNetwork:{roomId:()=>roomId},PlayroomChatState:{summary(){},invitationChats:()=>[]},PlayroomCommunityUI:{acceptInbox(){}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/chat-notifications.js'),'utf8'),ctx);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));const wake=async(name,ms=50)=>{now+=ms;events.get(name)({type:name});await settle();};
 ctx.PlayroomChatNotifications.init({account:f.account,service:{call:(action,data)=>f.sync.request('playroom_online',action,data)},store:{read:()=> '1',write(){}}});await settle();assert.equal(calls.length,1);
 for(const name of ['pageshow','focus','visibilitychange'])await wake(name);
 const burst={http:calls.length,rpc:calls.reduce((n,x)=>n+x.requests,0),requestBytes:calls.reduce((n,x)=>n+x.requestBytes,0),responseBytes:calls.reduce((n,x)=>n+x.responseBytes,0)};
 if(process.env.PLAYROOM_READ_AUDIT_REPORT)fs.writeFileSync(process.env.PLAYROOM_READ_AUDIT_REPORT,JSON.stringify({fixture:'empty unchanged notification inboxes; actual AccountSync batching; 3 sequential lifecycle wakes after completed startup read',burst},null,2)+'\n');
 assert.equal(calls.length,1,'pageshow/focus/visibility burst after a completed read must not repeat identical HTTP/RPC bodies');
 await ctx.PlayroomChatNotifications.poll();assert.equal(calls.length,2,'explicit notification refresh bypasses wake dedup');
 await wake('online');assert.equal(calls.length,3,'connectivity recovery bypasses wake dedup');
 roomId='new-room';await wake('focus');assert.equal(calls.length,4,'new room membership is checked without delay');
 await wake('focus',1001);assert.equal(calls.length,5,'normal wake after one second fetches fresh data');
 hidden=true;await wake('visibilitychange');assert.equal(calls.length,5);hidden=false;await wake('visibilitychange',1001);assert.equal(calls.length,6);
 const scheduled=[...timers.values()].find(t=>t.ms===5000);assert(scheduled,'five-second notification schedule is retained');now+=5000;await scheduled.fn();await settle();assert.equal(calls.length,7,'normal periodic poll still runs');
 events.get('pagehide')({type:'pagehide'});await wake('pageshow',1);assert.equal(calls.length,8,'persisted-page return checks fresh after lifecycle retirement');
 failUnread=true;await ctx.PlayroomChatNotifications.poll();assert.equal(calls.length,9);await wake('focus');assert.equal(calls.length,10,'partial failure is retried even within the wake window');failUnread=false;
 f.account.set('bob');await settle();assert.equal(calls.length,11,'account replacement always fetches its own unread state');
});

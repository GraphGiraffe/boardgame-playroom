'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){const gates=[],ctx={PlayroomMessages:{text:k=>k},PlayroomAppBridge:{},PlayroomNetworkLibrary:{},crypto:{randomUUID:()=> 'id'},addEventListener(){},document:{querySelector:()=>null},setTimeout,clearTimeout};ctx.PlayroomCloudSignaling=class{constructor(){this.mode=null;}stop(){this.mode=null;for(const g of gates.splice(0))g.reject(Object.assign(Error('cancelled'),{code:'cancelled'}));}connect(id){this.mode='client';return new Promise((resolve,reject)=>gates.push({id,resolve,reject}));}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../application/online-connection.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/cloud-network.js'),'utf8'),ctx);ctx.PlayroomCloudNetwork.init({account:{snapshot:()=>({configured:true,kind:'account',id:'user'}),subscribe(){}},remote:{}});return {api:ctx.PlayroomCloudNetwork,gates,ctx};}
test('duplicate connect callers await the same in-flight join instead of reporting success early',async()=>{const {api,gates}=fixture();const first=api.connect('room');let done=false;const second=api.connect('room').then(()=>done=true);await Promise.resolve();assert.equal(done,false);assert.equal(gates.length,1);gates[0].resolve();await Promise.all([first,second]);assert(done);});
test('cancelled join can be replaced immediately and an old finally cannot clear the new attempt',async()=>{const {api,gates}=fixture();const old=api.connect('first').catch(e=>e.code);api.stopClient();const next=api.connect('second');assert.equal(await old,'cancelled');assert.equal(gates.length,1);assert.equal(gates[0].id,'second');let done=false;const duplicate=api.connect('second').then(()=>done=true);await Promise.resolve();assert(!done);gates[0].resolve();await Promise.all([next,duplicate]);});
test('connecting elsewhere preserves an already active room',()=>{const {api,ctx,gates}=fixture();ctx.PlayroomNetworkLibrary.hasActiveRoom=()=>true;assert.throws(()=>api.connect('other'),/room-active/);assert.equal(gates.length,0);});

test('connection deadline closes the unfinished peer and allows retry',async()=>{const {api,ctx,gates}=fixture();let deadline;ctx.setTimeout=fn=>{deadline=fn;return 1;};ctx.clearTimeout=()=>{};const pending=api.connect('slow');deadline();await assert.rejects(pending,error=>error.code==='connection-timeout');assert.equal(gates.length,0);const retry=api.connect('slow');gates[0].resolve();await retry;});

test('invitation to the current room opens its lobby without connecting to the host again',async()=>{
 let opened=0,sessions=0,toasts=0,joined=0,cloud='room',room={id:'local'};
 const ctx={document:{addEventListener(){}},PlayroomChatUI:{captureReturn:()=>null},PlayroomRoomChatUI:{captureReturn:()=>null},PlayroomConnectionProgress:{markup:()=>''},PlayroomSocialUI:{service:{perform:async()=>({id:'room'})}},PlayroomNetworkLibrary:{inviteContext:()=>({room}),openRoom:()=>opened++,cancelJoin(){}},PlayroomCloudNetwork:{roomId:()=>cloud,connect:async()=>joined++,stopClient(){}},PlayroomAccountUI:{service:{snapshot:()=>({kind:'account',id:'owner'})}},PlayroomAppBridge:{toast:()=>toasts++,showSessions:()=>sessions++,profile:()=>({name:'Owner'}),captureModalReturn:()=>null,openModal:()=>({state:'active'})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/lobby-network.js'),'utf8'),ctx);
 assert.equal(await ctx.PlayroomLobbyNetwork.joinInvitation('invite',{roomId:'room',ownerId:'owner'}),true);assert.equal(opened,1);assert.equal(sessions,0);
 cloud=null;room=null;assert.equal(await ctx.PlayroomLobbyNetwork.joinInvitation('invite',{roomId:'room',ownerId:'owner'}),true);assert.equal(joined,1);assert.equal(opened,1);assert.equal(sessions,0);assert.equal(toasts,0);
});


test('closed cloud room clears reconnect target and leaves only the matching room',()=>{
 const {api,ctx}=fixture();let left=0,hub=0,modal=0;
 ctx.PlayroomNetworkLibrary.closeCloudRoom=()=>left++;
 ctx.PlayroomAppBridge.showHub=()=>hub++;ctx.PlayroomAppBridge.closeModal=()=>modal++;ctx.PlayroomAppBridge.toast=()=>{};
 api.adoptClient('room');api.roomClosed('other');assert.equal(api.roomId(),'room');assert.equal(left,0);
 api.roomClosed('room');assert.equal(api.roomId(),null);assert.equal(api.active(),false);assert.equal(left,1);assert.equal(hub,1);assert.equal(modal,1);
 api.roomClosed('room');assert.equal(left,1,'duplicate closure is inert');
});


test('new host closes transferred cloud room without opening invite settings first',async()=>{
 const calls=[],ctx={document:{addEventListener(){}},PlayroomNetworkLibrary:{inviteContext:()=>({room:{id:'local',ownerId:'me'},participantId:'me',cloudRoomId:'cloud'})},PlayroomAccountUI:{service:{snapshot:()=>({id:'account'})}},PlayroomCommunityUI:{service:{generation:0}},PlayroomSocialUI:{service:{perform:async(action,data)=>calls.push({action,data})}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/lobby-network.js'),'utf8'),ctx);await ctx.PlayroomLobbyNetwork.closeRoom('other');assert.equal(calls.length,0);await ctx.PlayroomLobbyNetwork.closeRoom('local');assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{action:'close',data:{roomId:'cloud'}}]);
});

test('superseded successful provider response cannot complete an old online join',async()=>{
 const {api,ctx}=fixture();let done;
 ctx.PlayroomCloudSignaling.prototype.stop=function(){this.mode=null;};
 ctx.PlayroomCloudSignaling.prototype.connect=function(){this.mode='client';return new Promise(r=>done=r);};
 const old=api.connect('old');api.stop();done();await assert.rejects(old,e=>e.code==='cancelled');assert.equal(api.roomId(),null);
});

test('account replacement fences a pending peer preparation',async()=>{
 const {create}=require('../application/online-connection.js');let callbacks,changed,id='a',created=0;
 const api=create({Signaling:class{constructor(p){callbacks=p;}stop(){}},id:()=> 'id',network:{},report(){},ice:{init(){}},rtc:{createClientPeer(){created++;}},showProgress(){},setTimeout,clearTimeout});
 api.init({account:{snapshot:()=>({id,configured:true,kind:'account'}),subscribe:fn=>changed=fn},remote:{}});
 // Peer port is tested without a DOM or a browser transport.
 api.adoptClient('room');
 const pending=callbacks.peers.client('offer');id='b';changed();
 // No active attempt means no credentials await; the microtask still must be fenced.
 await assert.rejects(pending,e=>e.code==='cancelled');assert.equal(created,0);
});

test('Online RPC binds each device, preserves resume identity and leaves only that device',async()=>{
 const {create}=require('../application/online-connection.js');const calls=[];let callbacks,stopped=0,options;
 const device='a1000000-0000-4000-8000-000000000001';
 const api=create({Signaling:class{constructor(p){callbacks=p;this.remote=p.remote;}stop(){stopped++;}connect(room,o){options=o;return this.remote('request',{roomId:room,...(o.resumeParticipantId?{resumeParticipantId:o.resumeParticipantId}:{})});}},deviceId:()=>device,id:()=> 'id',network:{cloudResumeParticipantId:async()=> 'saved-participant'},report(){},rtc:{},setTimeout,clearTimeout});
 api.init({account:{snapshot:()=>({id:'account',configured:true,kind:'account'}),subscribe(){}},remote:{call:async(...args)=>{calls.push(args);return {};}}});
 await api.connect('room');assert.equal(options.resumeParticipantId,'saved-participant');
 assert.deepEqual(calls[0],['request',{roomId:'room',resumeParticipantId:'saved-participant',deviceId:device},{userId:'account'}]);
 await api.kickParticipant('room','other-participant');assert.equal(calls[1][0],'kick');assert.equal(calls[1][1].participantId,'other-participant');
 await api.leave('room');assert.equal(calls[2][0],'leave');assert.equal(calls[2][1].deviceId,device);assert(stopped>0);assert.equal(api.roomId(),null);
});


test('compact room refresh keeps account profile and friendship state',async()=>{
 const Social=require('../application/social-service.js');const calls=[];
 const service=new Social({account:{snapshot:()=>({kind:'account',id:'account'}),subscribe(){}},remote:{call:async action=>{calls.push(action);return action==='rooms'?[{id:'room',available:true}]:{profile:{id:'account'},friends:[{userId:'friend'}],rooms:[],invitations:[]};}}});
 await service.refresh();await service.refreshRooms();assert.deepEqual(calls,['list','rooms']);const state=service.snapshot();assert.equal(state.profile.id,'account');assert.equal(state.friends[0].userId,'friend');assert.equal(state.rooms[0].id,'room');
});


test('Back after failed connection clears the remote target even after driver stopped',async()=>{
 const {api,gates}=fixture();const pending=api.connect('room');gates[0].reject(Object.assign(Error('network'),{code:'network'}));await assert.rejects(pending,e=>e.code==='network');api.stopClient();assert.equal(api.roomId(),null);assert.equal(api.active(),false);
});


test('invalid compact room response preserves the last valid room list',async()=>{
 const Social=require('../application/social-service.js');let response=[{id:'room'}];
 const service=new Social({account:{snapshot:()=>({kind:'account',id:'account'}),subscribe(){}},remote:{call:async()=>response}});
 await service.refreshRooms();response={};await assert.rejects(service.refreshRooms(),e=>e.code==='request');assert.deepEqual(service.snapshot().rooms,[{id:'room'}]);
});

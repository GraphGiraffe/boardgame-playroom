'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){const gates=[],ctx={PlayroomMessages:{text:k=>k},PlayroomAppBridge:{},PlayroomNetworkLibrary:{},crypto:{randomUUID:()=> 'id'},addEventListener(){},document:{querySelector:()=>null},setTimeout,clearTimeout};ctx.PlayroomCloudSignaling=class{constructor(){this.mode=null;}stop(){this.mode=null;for(const g of gates.splice(0))g.reject(Object.assign(Error('cancelled'),{code:'cancelled'}));}connect(id){this.mode='client';return new Promise((resolve,reject)=>gates.push({id,resolve,reject}));}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/cloud-network.js'),'utf8'),ctx);ctx.PlayroomCloudNetwork.init({account:{snapshot:()=>({configured:true,kind:'account',id:'user'}),subscribe(){}},remote:{}});return {api:ctx.PlayroomCloudNetwork,gates,ctx};}
test('duplicate connect callers await the same in-flight join instead of reporting success early',async()=>{const {api,gates}=fixture();const first=api.connect('room');let done=false;const second=api.connect('room').then(()=>done=true);await Promise.resolve();assert.equal(done,false);assert.equal(gates.length,1);gates[0].resolve();await Promise.all([first,second]);assert(done);});
test('cancelled join can be replaced immediately and an old finally cannot clear the new attempt',async()=>{const {api,gates}=fixture();const old=api.connect('first').catch(e=>e.code);api.stopClient();const next=api.connect('second');assert.equal(await old,'cancelled');assert.equal(gates.length,1);assert.equal(gates[0].id,'second');let done=false;const duplicate=api.connect('second').then(()=>done=true);await Promise.resolve();assert(!done);gates[0].resolve();await Promise.all([next,duplicate]);});
test('connecting elsewhere preserves an already active room',()=>{const {api,ctx,gates}=fixture();ctx.PlayroomNetworkLibrary.hasActiveRoom=()=>true;assert.throws(()=>api.connect('other'),/room-active/);assert.equal(gates.length,0);});

test('connection deadline closes the unfinished peer and allows retry',async()=>{const {api,ctx,gates}=fixture();let deadline;ctx.setTimeout=fn=>{deadline=fn;return 1;};ctx.clearTimeout=()=>{};const pending=api.connect('slow');deadline();await assert.rejects(pending,error=>error.code==='connection-timeout');assert.equal(gates.length,0);const retry=api.connect('slow');gates[0].resolve();await retry;});

test('invitation to the current room opens its lobby without connecting to the host again',async()=>{
 let opened=0,sessions=0,toasts=0,cloud='room',room={id:'local'};
 const ctx={document:{addEventListener(){}},PlayroomNetworkLibrary:{inviteContext:()=>({room}),openRoom:()=>opened++},PlayroomCloudNetwork:{roomId:()=>cloud},PlayroomAccountUI:{service:{snapshot:()=>({id:'owner'})}},PlayroomAppBridge:{toast:()=>toasts++,showSessions:()=>sessions++}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/lobby-network.js'),'utf8'),ctx);
 assert.equal(await ctx.PlayroomLobbyNetwork.joinInvitation('invite',{roomId:'room',ownerId:'owner'}),true);assert.equal(opened,1);assert.equal(sessions,0);
 cloud=null;room=null;assert.equal(await ctx.PlayroomLobbyNetwork.joinInvitation('invite',{roomId:'room',ownerId:'owner'}),false);assert.equal(opened,1);assert.equal(sessions,1);assert.equal(toasts,1);
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
 const calls=[],ctx={document:{addEventListener(){}},PlayroomNetworkLibrary:{inviteContext:()=>({room:{id:'local',ownerId:'me'},participantId:'me',cloudRoomId:'cloud'})},PlayroomAccountUI:{service:{snapshot:()=>({id:'account'})}},PlayroomSocialUI:{service:{perform:async(action,data)=>calls.push({action,data})}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/lobby-network.js'),'utf8'),ctx);await ctx.PlayroomLobbyNetwork.closeRoom('other');assert.equal(calls.length,0);await ctx.PlayroomLobbyNetwork.closeRoom('local');assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{action:'close',data:{roomId:'cloud'}}]);
});

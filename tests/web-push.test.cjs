'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('web push sender authenticates internal callers, bounds endpoints and classifies provider failures',async()=>{
 const {createPushHandler,validEndpoint}=await import('../supabase/functions/playroom-push/dispatch.mjs');
 for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user:password@fcm.googleapis.com/x','https://web.push.apple.com:444/x'])assert.equal(validEndpoint(url),false,url);
 for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns2-db5p.notify.windows.com'])assert.equal(validEndpoint('https://'+host+'/x'),true);
 const rows=[0,404,410,429,503,400,413].map((status,i)=>({id:String(i),lease:'lease'+i,payload:{title:'ХОД'},subscription:{endpoint:'https://fcm.googleapis.com/'+status,keys:{}}}));
 rows.push({id:'ssrf',lease:'lease',payload:{},subscription:{endpoint:'https://127.0.0.1/private'}});
 const calls=[],sends=[],handler=createPushHandler({secret:'private-hook-secret',rpc:async(name,data)=>{calls.push([name,data]);return name==='playroom_push_claim'?rows:null;},send:async sub=>{sends.push(sub.endpoint);const status=Number(new URL(sub.endpoint).pathname.slice(1));if(status)throw Object.assign(Error('provider'),{statusCode:status});}});
 assert.equal((await handler(new Request('https://edge.test',{method:'POST'}))).status,401);assert.equal(calls.length,0);
 assert.equal((await handler(new Request('https://edge.test',{headers:{'x-playroom-push-secret':'private-hook-secret'}}))).status,405);
 const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'x-playroom-push-secret':'private-hook-secret'}}));assert.equal(response.status,200);
 assert.equal(sends.length,7);const complete=calls.filter(([name])=>name==='playroom_push_complete').map(([,data])=>data).sort((a,b)=>a.p_id.localeCompare(b.p_id)).map(data=>data.p_result);assert.deepEqual(complete,['sent','gone','gone','retry','retry','drop','drop','drop']);
 const broken=createPushHandler({secret:'secret',rpc:async()=>{throw Error('private database details');},send:async()=>{}});
 const result=await broken(new Request('https://edge.test',{method:'POST',headers:{'x-playroom-push-secret':'secret'}}));assert.equal(result.status,503);assert(!JSON.stringify(await result.json()).includes('private'));
});

test('push device messages preserve call order while worker registration is delayed',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),posted=[];let release,registrations=0;
 const gate=new Promise(resolve=>release=resolve),registration={active:{postMessage(data,ports){posted.push(data.userId);ports[0].postMessage({ok:true});}}};
 const context={location:{protocol:'https:'},isSecureContext:true,Notification:{},PushManager:{},navigator:{serviceWorker:{getRegistration:async()=>{if(++registrations===1)await gate;return registration;}}},MessageChannel,setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../platform/web/push-device.js'),'utf8'),context);
 const first=context.PlayroomPushDevice.message({kind:'playroom-push-bind',userId:'old'}),second=context.PlayroomPushDevice.message({kind:'playroom-push-bind',userId:null});await Promise.resolve();release();await Promise.all([first,second]);assert.deepEqual(posted,['old',null]);
});

test('game push monitor uses legal human actions, serializes retries and closes its authority binding',async()=>{
 const Monitor=require('../application/game-push-events.js');let listener,closed=0,revision=1,paused=false,active='b',attempts=0;
 const snapshot=id=>({sessionId:'session',revision,controlRevision:paused?1:2,paused,state:{status:'playing'},actions:!paused&&id===active?[{type:'play'}]:[],independentActions:[]});
 const observer={snapshot:()=>snapshot('spectator'),subscribe:fn=>{listener=fn;return()=>{listener=null;}},close:()=>closed++};
 const room={phase:'playing',transportMode:'online',ownerId:'a',participants:[{id:'a',role:'player'},{id:'b',role:'player'},{id:'bot',bot:true,role:'player'},{id:'spectator',role:'spectator'}]},sent=[];
 const monitor=new Monitor({authority:{connect:()=>observer},room:()=>room,access:{connect:(_a,_r,id)=>({snapshot:()=>snapshot(id),close(){}})},delay:async()=>{},send:async value=>{if(++attempts===1)throw Error('temporary');sent.push(value);}});
 await monitor.queue;assert.equal(attempts,2);assert.deepEqual(sent[0].players,['a','b']);assert.deepEqual(sent[0].targets,['b']);assert(!JSON.stringify(sent).includes('actions'));listener();await monitor.queue;assert.equal(sent.length,1);
 revision++;active='a';listener();paused=true;listener();await monitor.queue;assert.deepEqual(sent[1].targets,['a']);assert.equal(sent[2].state,'paused');assert.deepEqual(sent[2].targets,[]);monitor.close();assert.equal(closed,1);assert.equal(listener,null);
});


test('important updates require private authentication and explicit confirmation',async()=>{
 const {createPushHandler}=await import('../supabase/functions/playroom-push/dispatch.mjs');const calls=[],handler=createPushHandler({secret:'private',send:async()=>{},rpc:async(name,data)=>{calls.push([name,data]);return name==='playroom_push_claim'?[]:{queued:1};}});
 const request=(confirm,secret='private')=>new Request('https://edge.test',{method:'POST',headers:{'Content-Type':'application/json','x-playroom-push-secret':secret},body:JSON.stringify({operation:'important-update',confirm,id:'test',version:'1.0.0',title:'Важно',body:'Обновление'})});
 assert.equal((await handler(request(true,'wrong'))).status,401);assert.equal((await handler(request(false))).status,400);assert.equal(calls.length,0);assert.equal((await handler(request(true))).status,200);assert.equal(calls[0][0],'playroom_push_announce_update');
});


test('game lifecycle push stays silent on its visible game including result overlays',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let receive,hidden=false,focused=true,table=true,chatVisible=false;
 const context={document:{get hidden(){return hidden;},hasFocus:()=>focused,querySelector:selector=>selector.includes('.table-shell.network-game')&&table?{}:null,querySelectorAll:()=>[],addEventListener(){}},navigator:{serviceWorker:{addEventListener:(type,fn)=>{if(type==='message')receive=fn;}}},addEventListener(){},PlayroomPushDevice:{supported:()=>false},PlayroomCloudNetwork:{roomId:()=> 'room'},PlayroomChatActivity:{visible:()=>chatVisible},PlayroomChatNotifications:{poll:async()=>{}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../app/push-ui.js'),'utf8'),context);
 context.PlayroomPushUI.init({account:{snapshot:()=>({kind:'account',id:'me'}),subscribe(){}},remote:{}});
 const handled=payload=>{let value;receive({data:{kind:'playroom-push-visible',payload:{recipient:'me',type:'room',id:'room',...payload}},ports:[{postMessage:reply=>value=reply.handled}]});return value;};
 for(const activity of ['game-started','game-resumed','game-finished','turn'])assert.equal(handled({activity}),true,activity+' with result overlay');
 assert.equal(handled({activity:'game-finished',id:'other-room'}),false);
 assert.equal(handled({activity:'game-finished',recipient:'other-user'}),false);
 hidden=true;assert.equal(handled({activity:'game-finished'}),false,'background still notifies');hidden=false;
 focused=false;assert.equal(handled({activity:'game-started'}),false,'unfocused still notifies');focused=true;
 table=false;assert.equal(handled({activity:'game-finished'}),false,'hub or replay still notifies');
 assert.equal(handled({activity:'turn'}),false,'turn still notifies away from game');
 table=true;assert.equal(handled({activity:'turn'}),true,'turn stays silent on game with overlay');
 chatVisible=true;assert.equal(handled({activity:'turn'}),true,'existing room visibility still applies');
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Service=require('../application/account-service.js');
const {SupabaseAuth,configuration}=require('../platform/web/supabase-auth.js');
const config={url:'https://playroom-test.supabase.co',publishableKey:'sb_publishable_test'};
const user={id:'account-1',email:'player@example.test',is_anonymous:false};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tokens=(extra={})=>({access_token:'access-private',refresh_token:'refresh-private',expires_in:3600,user,...extra});
function fixture(handler){
 const values=new Map(),calls=[];let href='https://example.test/playroom-hod-test/';
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const auth=new SupabaseAuth(config,{storage:()=>storage,location:{get href(){return href;}},history:{state:null,replaceState:(_a,_b,url)=>{href=url;}},crypto:require('node:crypto').webcrypto,fetch:async(url,options)=>{calls.push({url,...options});return handler(url,options);}});
 return {auth,values,calls,storage,setUrl:value=>{href=value;},getUrl:()=>href};
}
test('account lifecycle never exposes credentials in application snapshots or changes local identity',async()=>{
 const f=fixture(url=>response(url.endsWith('/user')?user:tokens()));
 f.values.set('playroom.player-profile.v1','local-profile');
 const service=new Service({auth:f.auth,guestId:'local-id'});let last;service.subscribe(s=>{last=s;});
 await service.login(' player@example.test ','password123');
 assert.equal(last.kind,'account');assert.equal(last.email,user.email);assert(!JSON.stringify(last).includes('private'));
 assert.equal(JSON.parse(f.calls[0].body).email,user.email);
 await service.logout();assert.equal(service.snapshot().id,'local-id');assert.equal(service.snapshot().kind,'local');
 assert.equal(f.values.get('playroom.player-profile.v1'),'local-profile');
 assert.equal(f.values.has(f.auth.key),false);
});
test('restored sessions refresh once under a shared browser lock',async()=>{
 let refreshes=0,queue=Promise.resolve();
 const f=fixture(async url=>{if(url.includes('refresh_token')){refreshes++;return response(tokens());}return response(user);});
 const locks={request(_name,fn){const current=queue.then(fn);queue=current.catch(()=>{});return current;}};
 f.auth.locks=locks;f.auth.save(tokens({expires_in:0}));
 const other=new SupabaseAuth(config,{storage:()=>f.storage,fetch:f.auth.fetch,locks});
 const [a,b]=await Promise.all([f.auth.restore(),other.restore()]);assert.deepEqual(a,user);assert.deepEqual(b,user);assert.equal(refreshes,1);
});
test('password recovery uses PKCE; callback code is removed and new password uses the recovered session',async()=>{
 const f=fixture(url=>response(url.endsWith('/user')?user:url.includes('/recover')?{}:tokens()));
 const service=new Service({auth:f.auth,guestId:'local'});
 await service.recover(user.email);
 const pending=JSON.parse(f.values.get(f.auth.pendingKey));assert.equal(pending.verifier.length,43);
 const recovery=JSON.parse(f.calls[0].body);assert.equal(recovery.code_challenge_method,'s256');assert.notEqual(recovery.code_challenge,pending.verifier);
 assert(f.calls[0].url.includes(encodeURIComponent('https://example.test/playroom-hod-test/')));
 f.setUrl('https://example.test/playroom-hod-test/?code=one-use-code&keep=1');
 await service.callback();assert.equal(service.snapshot().recovery,true);assert(!f.getUrl().includes('one-use-code'));assert(f.getUrl().includes('keep=1'));
 const exchange=JSON.parse(f.calls[1].body);assert.equal(exchange.code_verifier,pending.verifier);assert.equal(exchange.auth_code,'one-use-code');
 const restored=new Service({auth:f.auth,guestId:'local'});await restored.restore();assert.equal(restored.snapshot().recovery,true);
 await service.changePassword('new-password123');assert.equal(service.snapshot().recovery,false);
 assert.equal(f.calls.at(-1).method,'PUT');assert.equal(f.calls.at(-1).headers.Authorization,'Bearer access-private');
 assert.equal(f.values.has(f.auth.pendingKey),false);
});
test('registration requiring confirmation does not fabricate a signed-in user',async()=>{
 const f=fixture(()=>response({id:user.id,email:user.email})),s=new Service({auth:f.auth,guestId:'local'});
 assert.deepEqual(await s.signup(user.email,'password123'),{confirmationRequired:true});assert.equal(s.snapshot().kind,'local');assert.equal(f.values.has(f.auth.key),false);
});
test('cloud guests are explicit and restored, never created at local startup',async()=>{
 const f=fixture(()=>response(tokens({user:{id:'guest-1',is_anonymous:true}}))),s=new Service({auth:f.auth,guestId:'local'});
 assert.equal(s.snapshot().kind,'local');assert.equal(f.calls.length,0);
 await s.ensureGuest();assert.equal(s.snapshot().kind,'guest');assert.deepEqual(JSON.parse(f.calls[0].body),{});
});
test('transient failure preserves saved login, invalid refresh revokes it, concurrent UI actions are rejected',async()=>{
 const f=fixture(()=>{throw Error('private response');});f.auth.save(tokens({expires_in:0}));
 await assert.rejects(f.auth.restore(),e=>e.code==='network'&&!e.message.includes('private'));assert(f.values.has(f.auth.key));
 f.auth.fetch=async()=>response({message:'private response'},400);
 await assert.rejects(f.auth.restore());assert(!f.values.has(f.auth.key));
 let finish;const s=new Service({auth:{login:()=>new Promise(resolve=>{finish=resolve;})},guestId:'local'});
 const first=s.login(user.email,'pw');await assert.rejects(s.login(user.email,'pw'),e=>e.code==='busy');finish(user);await first;assert.equal(s.snapshot().busy,false);
});
test('configuration rejects privileged keys and endpoints; auth state is isolated by app and service',()=>{
 assert.throws(()=>configuration({...config,publishableKey:'sb_secret_private'}));
 assert.throws(()=>configuration({...config,url:'https://evil.test/path'}));assert.throws(()=>configuration({...config,url:'http://evil.test'}));
 const f=fixture(()=>response(tokens()));const other=new SupabaseAuth({...config,url:'https://other.supabase.co'},{storage:()=>f.storage});
 f.auth.save(tokens());assert.equal(other.read(),null);assert(f.auth.key.startsWith('playroom.'));
});
test('invalid callback cannot replace an existing session and clears code from address',async()=>{
 const f=fixture(()=>{throw Error('must not call');});f.auth.save(tokens());
 f.setUrl('https://example.test/playroom-hod-test/?code=unrequested');
 await assert.rejects(f.auth.callback(),e=>e.code==='recovery-link');assert.equal(f.calls.length,0);assert.equal(f.auth.read().user.id,user.id);assert(!f.getUrl().includes('unrequested'));
});
test('logout queued behind another tab refresh cannot resurrect the local session',async()=>{
 let release,queue=Promise.resolve();
 const f=fixture(async url=>{if(url.includes('refresh_token'))await new Promise(resolve=>{release=resolve;});return response(url.endsWith('/user')?user:tokens());});
 const locks={request(_name,fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}};
 f.auth.locks=locks;f.auth.save(tokens({expires_in:0}));
 const refreshing=f.auth.session();await new Promise(resolve=>setImmediate(resolve));
 const leaving=f.auth.logout();release();await Promise.all([refreshing,leaving]);assert.equal(f.auth.read(),null);
});
test('local identity follows profile creation after startup without cloud calls',()=>{
 let id=null;const s=new Service({auth:null,guestId:()=>id});assert.equal(s.snapshot().id,null);id='new-local-profile';assert.equal(s.snapshot().id,id);assert.equal(s.snapshot().kind,'local');
});
test('cached identity is status only: no startup request, validation still uses Auth and failures preserve login',async()=>{
 const f=fixture(()=>response(user));f.auth.save(tokens());
 const s=new Service({auth:f.auth,guestId:'local'});assert.equal(s.snapshot().kind,'account');assert.equal(f.calls.length,0);
 await s.restore();assert.equal(f.calls.length,1);
 f.auth.fetch=async()=>{throw Error('network unavailable');};await assert.rejects(s.restore(),e=>e.code==='network');
 assert.equal(s.snapshot().error,'network');assert.equal(s.snapshot().id,user.id);assert(f.values.has(f.auth.key));assert(!JSON.stringify(s.snapshot()).includes('private'));
});
test('password recovery reports same/weak passwords explicitly and keeps recovery available for retry',async()=>{
 for(const [providerCode,expected]of [['same_password','same-password'],['weak_password','weak-password'],['reauthentication_needed','reauthentication']]){
  const f=fixture(()=>response({code:422,error_code:providerCode,msg:'private provider text'},422));f.auth.save(tokens(),{recovery:true});
  const s=new Service({auth:f.auth,guestId:'local'});assert(s.snapshot().recovery);
  await assert.rejects(s.changePassword('some-password'),e=>e.code===expected&&!e.message.includes('private provider text'));
  assert(s.snapshot().recovery);assert.equal(JSON.parse(f.calls[0].body).current_password,undefined);
 }
});
test('normal password change requires a permanent account and sends current password only to Auth',async()=>{
 const f=fixture(url=>response(url.includes('grant_type=password')?tokens():user));f.auth.save(tokens());const s=new Service({auth:f.auth,guestId:'local'});
 await assert.rejects(s.updatePassword('same-password','same-password'),e=>e.code==='same-password');assert.equal(f.calls.length,0);
 await s.updatePassword('old-password','new-password');
 const update=f.calls.find(c=>c.method==='PUT');assert.deepEqual(JSON.parse(update.body),{password:'new-password',current_password:'old-password'});assert.equal(f.calls.filter(c=>c.url.includes('grant_type=password')).length,1);
 assert.equal(s.snapshot().kind,'account');assert(!JSON.stringify([...f.values.values()]).includes('old-password'));assert(!JSON.stringify([...f.values.values()]).includes('new-password'));
 const local=new Service({auth:f.auth,guestId:'local'});local.user=null;await assert.rejects(local.updatePassword('a','b'),e=>e.code==='credentials');
 f.auth.fetch=async url=>url.endsWith('/user')?response(user):response({code:400,error_code:'invalid_credentials'},400);await assert.rejects(s.updatePassword('wrong','new-password'),e=>e.code==='current-password');
});
test('normal password change uses the verified email and rejects a different account on reauthentication',async()=>{
 const f=fixture(url=>response(url.includes('grant_type=password')?tokens({user:{id:'other',email:'other@example.test'}}):user));
 f.auth.save(tokens({user:{...user,email:'stale@example.test'}}));const s=new Service({auth:f.auth,guestId:'local'});
 await assert.rejects(s.updatePassword('old-password','new-password'),e=>e.code==='credentials');
 const login=f.calls.find(c=>c.url.includes('grant_type=password'));assert.equal(JSON.parse(login.body).email,user.email);assert(!f.calls.some(c=>c.method==='PUT'));assert.equal(f.auth.read().user.id,user.id);
});

const Social=require('../application/social-service.js'),SupabaseSocial=require('../platform/web/supabase-social.js');
test('social is optional; account changes discard cached data and late responses',async()=>{
 const account=new Service({auth:{},guestId:'local'});let resolve,calls=0;
 const social=new Social({account,remote:{call:()=>{calls++;return new Promise(done=>{resolve=done;});}}});
 assert.equal(calls,0);await assert.rejects(social.refresh(),e=>e.code==='account-required');
 account.user={id:'alice'};account.emit();const pending=social.refresh();
 account.user={id:'bob'};account.emit();resolve({profile:{id:'alice'},friends:[],rooms:[]});
 await assert.rejects(pending,e=>e.code==='account-changed');assert.equal(social.snapshot().profile,null);assert.equal(social.snapshot().busy,false);
});
test('social guests cannot manage friends or create rooms; invitation secret stays out of snapshots',async()=>{
 const account=new Service({auth:{},guestId:'local'});account.user={id:'guest',is_anonymous:true};
 const calls=[],social=new Social({account,remote:{call:async(action,data)=>{calls.push({action,data});return action==='list'?{profile:null,friends:[],rooms:[]}:action==='invite'?{token:'secret-invite'}:{id:'room'};}}});
 await assert.rejects(social.perform('create'),e=>e.code==='account-required');assert.equal(calls.length,0);
 await social.perform('join',{token:'invite',nickname:'Гость'});assert.equal(calls.length,2);
 account.user={id:'alice',is_anonymous:false};account.emit();
 const result=await social.perform('invite',{roomId:'room'});assert.equal(result.token,'secret-invite');assert(!JSON.stringify(social.snapshot()).includes('secret-invite'));
});
test('social RPC refreshes through Auth, keeps credentials in adapter and reports missing migration safely',async()=>{
 let request;const remote=new SupabaseSocial({auth:{config,session:async()=>({access_token:'private'})},fetch:async(url,options)=>{request={url,...options};return response({message:'social:invite-invalid'},400);}});
 await assert.rejects(remote.call('join',{token:'code'}),e=>e.code==='invite-invalid'&&!e.message.includes('private'));
 assert.equal(request.headers.Authorization,'Bearer private');assert.equal(request.redirect,'error');assert.equal(request.cache,'no-store');assert.equal(JSON.parse(request.body).p_action,'join');
 remote.fetch=async()=>response({code:'PGRST202',message:'raw server information'},404);
 await assert.rejects(remote.call('list'),e=>e.code==='setup'&&!e.message.includes('raw'));
 remote.auth.session=async()=>null;await assert.rejects(remote.call('list'),e=>e.code==='account-required');
});

test('social adapter rejects a session replaced in another tab before sending a mutation',async()=>{
 let calls=0;const remote=new SupabaseSocial({auth:{config,session:async()=>({access_token:'private',user:{id:'bob'}})},fetch:async()=>{calls++;throw Error('must not send');}});
 await assert.rejects(remote.call('create',{name:'room'},{userId:'alice'}),e=>e.code==='account-changed');assert.equal(calls,0);
});

const CloudSignaling=require('../application/cloud-signaling.js');
test('cloud signaling: stopping during discovery cancels polling and ignores a late offer',async()=>{
 let resolve,creates=0;
 const driver=new CloudSignaling({remote:async action=>action==='request'?{id:'slot',epoch:'epoch'}:new Promise(done=>{resolve=done;}),peers:{client:async()=>{creates++;}},idFactory:()=> 'epoch'});
 const pending=driver.connect('room');await new Promise(done=>setImmediate(done));driver.stop();resolve({offer:'private-sdp',epoch:'epoch'});
 await assert.rejects(pending,e=>e.code==='cancelled');assert.equal(creates,0);assert.equal(driver.mode,null);
});
test('cloud signaling: stop closes a peer created by an earlier host generation',async()=>{
 let finish,closed=0;
 const driver=new CloudSignaling({remote:async action=>action==='host'?{}:action==='poll-host'?[{id:'slot'}]:{userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'},peers:{host:()=>new Promise(done=>{finish=done;})},idFactory:()=> 'epoch'});
 await driver.host('room','local');await new Promise(done=>setImmediate(done));driver.stop();finish({offer:'private-sdp',close(){closed++;}});await driver.running;assert.equal(closed,1);assert.equal(driver.handles.size,0);
});

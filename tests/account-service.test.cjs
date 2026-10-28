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

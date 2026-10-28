'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
test('cloud account: optional launch, two isolated clients, remembered login and local logout',{timeout:40000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const a=await browser.newContext({viewport:{width:390,height:740}}),b=await browser.newContext({viewport:{width:390,height:740}}),requests=[],errors=[];
 try{
  for(const [context,name] of [[a,'Алиса'],[b,'Борис']]){
   await context.addInitScript(name=>{if(!localStorage.getItem('playroom.player-profile.v1'))localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:name,name,createdAt:1,updatedAt:1}));},name);
   await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',async route=>{
    const r=route.request();requests.push({url:r.url(),body:r.postData()});
    const user={id:'account-alice',email:'alice@example.test',is_anonymous:false};
    const data=r.url().includes('/user')?user:r.url().includes('/logout')?{}:{user,access_token:'private-access',refresh_token:'private-refresh',expires_in:3600};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
  }
  const pa=await a.newPage(),pb=await b.newPage();for(const p of [pa,pb]){p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));}
  await Promise.all([pa.goto(server.url),pb.goto(server.url)]);
  const localBefore=await pa.evaluate(()=>localStorage.getItem('playroom.player-profile.v1'));
  assert.equal(requests.length,0,'startup does not depend on cloud');
  await pa.locator('#app [data-command=settings]').first().click();await pa.locator('[data-account-open]').click();
  await pa.locator('.account-form [name=email]').fill('alice@example.test');await pa.locator('.account-form [name=password]').fill('password123');
  await pa.locator('.account-form button[type=submit]').click();await pa.getByText('alice@example.test',{exact:true}).waitFor();
  assert.equal(await pb.evaluate(()=>PlayroomAccountUI.service.snapshot().kind),'local');
  assert.equal(await pb.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('playroom.cloud-auth.')).length),0);
  const snapshot=await pa.evaluate(()=>PlayroomAccountUI.service.snapshot());assert(!JSON.stringify(snapshot).includes('private'));
  await pa.reload();await pa.locator('#app [data-command=settings]').first().click();await pa.locator('[data-account-open]').click();await pa.getByText('alice@example.test',{exact:true}).waitFor();
  await pa.locator('[data-account-mode=logout]').click();await pa.locator('.account-form').waitFor();
  assert.equal(await pa.evaluate(()=>PlayroomAccountUI.service.snapshot().kind),'local');
  assert.equal(await pa.evaluate(()=>localStorage.getItem('playroom.player-profile.v1')),localBefore);
  assert(await pa.locator('.account-form').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
test('cloud account: recovery callback survives reload and opens password form',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{
   const r=route.request(),user={id:'account-1',email:'alice@example.test'};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.url().includes('/recover')?{}:r.url().endsWith('/user')?user:{user,access_token:'private-access',refresh_token:'private-refresh',expires_in:3600})});
  });
  await page.goto(server.url);await page.evaluate(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'local',name:'Игрок',createdAt:1,updatedAt:1}));});await page.reload();
  await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();await page.locator('[data-account-mode=recover]').click();
  await page.locator('[name=email]').fill('alice@example.test');await page.locator('.account-form button[type=submit]').click();await page.locator('[role=status]').filter({hasText:'письмо для восстановления отправлено'}).waitFor();
  await page.goto(server.url+'?code=recovery-code');await page.locator('[data-account-form=password]').waitFor();assert(!page.url().includes('code='));
  await page.reload();await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();await page.locator('[data-account-form=password]').waitFor();
  await page.locator('[data-account-form=password] [name=password]').fill('new-password123');await page.locator('.account-form button[type=submit]').click();await page.getByText('Пароль обновлён.',{exact:true}).waitFor();
 }finally{await browser.close();await server.close();}
});
test('cloud account: compact profile button follows saved login, request errors and offline status',{timeout:25000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);let release,first=true;
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',async route=>{if(first){first=false;await new Promise(resolve=>{release=resolve;});return route.fulfill({status:503,contentType:'application/json',body:'{}'});}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'a',email:'alice@example.test'},access_token:'test',refresh_token:'test',expires_in:3600})});});
  await page.goto(server.url);await page.locator('#app [data-command=settings]').first().click();
  const button=page.locator('[data-account-open]');assert.equal(await button.getAttribute('data-account-status'),'local');
  for(const width of [320,390,679]){await page.setViewportSize({width,height:740});assert(await page.locator('.settings-identity').evaluate(e=>{const name=e.querySelector('input').getBoundingClientRect(),cloud=e.querySelector('[data-account-open]').getBoundingClientRect();return cloud.left>=name.right&&cloud.left-name.right<=12&&Math.abs((name.top+name.bottom-cloud.top-cloud.bottom)/2)<3&&e.scrollWidth<=e.clientWidth+1;}));}
  await page.evaluate(()=>{window.accountRequest=PlayroomAccountUI.service.login('alice@example.test','password123').catch(()=>{});});
  await page.locator('[data-account-status=busy] [data-ui-icon=cloud-sync]').waitFor();
  await new Promise(resolve=>setImmediate(resolve));assert(release);release();await page.locator('[data-account-status=error] [data-ui-icon=cloud-alert]').waitFor();
  await page.evaluate(()=>PlayroomAccountUI.service.login('alice@example.test','password123'));await page.locator('[data-account-status=account] [data-ui-icon=cloud-check]').waitFor();
  await page.reload();await page.locator('#app [data-command=settings]').first().click();assert.equal(await button.getAttribute('data-account-status'),'account');
  await context.setOffline(true);await page.locator('[data-account-status=offline] [data-ui-icon=cloud-off]').waitFor();await context.setOffline(false);await page.locator('[data-account-status=account]').waitFor();
 }finally{if(release)release();await browser.close();await server.close();}
});
test('cloud account: failed first attempt retains the form and retries with one click',{timeout:20000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);let attempts=0;
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{attempts++;return route.fulfill({status:attempts===1?503:200,contentType:'application/json',body:JSON.stringify(attempts===1?{message:'unavailable'}:{user:{id:'a',email:'alice@example.test'},access_token:'test-access',refresh_token:'test-refresh',expires_in:3600})});});
  await page.goto(server.url);await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();
  const form=page.locator('.account-form');await form.locator('[name=email]').fill('alice@example.test');await form.locator('[name=password]').fill('password123');
  await page.evaluate(()=>{window.accountFormBefore=document.querySelector('.account-form');});
  await form.locator('[type=submit]').click();await page.locator('.account-message[role=alert]').waitFor();
  assert.equal(await form.locator('[name=email]').inputValue(),'alice@example.test');assert.equal(await form.locator('[name=password]').inputValue(),'password123');
  assert(await page.evaluate(()=>window.accountFormBefore===document.querySelector('.account-form')));
  await form.locator('[type=submit]').click();await page.getByText('alice@example.test',{exact:true}).waitFor();assert.equal(attempts,2);
 }finally{await browser.close();await server.close();}
});
test('cloud account: failed recovery keeps email and sends again only after explicit retry',{timeout:20000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);let attempts=0;
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{attempts++;return route.fulfill({status:attempts===1?503:200,contentType:'application/json',body:'{}'});});
  await page.goto(server.url);await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();await page.locator('[data-account-mode=recover]').click();
  const form=page.locator('.account-form');await form.locator('[name=email]').fill('alice@example.test');await form.locator('[type=submit]').click();await page.locator('.account-message[role=alert]').waitFor();
  assert.equal(await form.locator('[name=email]').inputValue(),'alice@example.test');assert.equal(attempts,1);
  await form.locator('[type=submit]').click();await page.locator('.account-message[role=status]').filter({hasText:'письмо для восстановления отправлено'}).waitFor();assert.equal(attempts,2);
 }finally{await browser.close();await server.close();}
});
test('cloud account: normal password change checks current password and clears fields on success',{timeout:20000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);let updates=0;
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{const r=route.request(),user={id:'a',email:'alice@example.test'};if(r.url().includes('grant_type=password')&&r.postDataJSON().password==='wrong-password')return route.fulfill({status:400,contentType:'application/json',body:'{"code":400,"error_code":"invalid_credentials"}'});if(r.method()==='PUT'){updates++;const body=r.postDataJSON();assert.equal(body.password,'new-password123');assert.equal(body.current_password,'old-password123');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.url().endsWith('/user')?user:{user,access_token:'test',refresh_token:'test',expires_in:3600})});});
  await page.goto(server.url);await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();await page.locator('[name=email]').fill('alice@example.test');await page.locator('[name=password]').fill('old-password123');await page.locator('.account-form [type=submit]').click();await page.locator('[data-account-mode=password-change]').click();
  const form=page.locator('[data-account-form=password-change]');await form.locator('[name="current-password"]').fill('wrong-password');await form.locator('[name=password]').fill('new-password123');await form.locator('[type=submit]').click();await page.getByText('Неверный текущий пароль. Проверьте его и повторите попытку.',{exact:true}).waitFor();
  await form.locator('[name="current-password"]').fill('old-password123');await form.locator('[type=submit]').click();await page.getByText('Пароль обновлён.',{exact:true}).waitFor();assert.equal(updates,1);assert.equal(await page.locator('.account-content input[type=password]').count(),0);
 }finally{await browser.close();await server.close();}
});
test('cloud account: recovery explains an unchanged password and permits another value',{timeout:20000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async error=>{await server.close();throw error;});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);let updates=0;
 try{
  await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{const r=route.request(),user={id:'a',email:'alice@example.test'};if(r.method()==='PUT'){updates++;assert.equal(r.postDataJSON().current_password,undefined);return route.fulfill({status:updates===1?422:200,contentType:'application/json',body:JSON.stringify(updates===1?{code:422,error_code:'same_password',msg:'New password should be different'}:user)});}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.url().includes('/recover')?{}:r.url().endsWith('/user')?user:{user,access_token:'test',refresh_token:'test',expires_in:3600})});});
  await page.goto(server.url);await page.locator('#app [data-command=settings]').first().click();await page.locator('[data-account-open]').click();await page.locator('[data-account-mode=recover]').click();await page.locator('[name=email]').fill('alice@example.test');await page.locator('.account-form [type=submit]').click();await page.locator('.account-message').filter({hasText:'письмо для восстановления отправлено'}).waitFor();
  await page.goto(server.url+'?code=recovery-code');const form=page.locator('[data-account-form=password]');await form.locator('[name=password]').fill('same-password123');await form.locator('[type=submit]').click();await page.getByText('Новый пароль должен отличаться от текущего.',{exact:true}).waitFor();assert.equal(await form.locator('[name=password]').inputValue(),'same-password123');
  await form.locator('[name=password]').fill('new-password123');await form.locator('[type=submit]').click();await page.getByText('Пароль обновлён.',{exact:true}).waitFor();assert.equal(updates,2);
 }finally{await browser.close();await server.close();}
});

test('cloud social: two clients confirm friendship, invite, join and revoke without changing local games',{timeout:40000},async()=>{
 const server=await serveBrowserFixture(process.env.PLAYROOM_SOCIAL_FIXTURE||path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}).catch(async e=>{await server.close();throw e;});
 const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002'},names={a:'Алиса',b:'Борис'},profiles={},friends=[],rooms=[],invites=[],requests=[],errors=[];
 const edge='00000000-0000-4000-8000-000000000010',rid='00000000-0000-4000-8000-000000000020',iid='00000000-0000-4000-8000-000000000030',secret='a'.repeat(64);
 const list=k=>({profile:profiles[k]||null,friends:friends.filter(f=>f.sender===k||f.recipient===k).map(f=>({id:f.id,userId:ids[f.sender===k?f.recipient:f.sender],nickname:names[f.sender===k?f.recipient:f.sender],accepted:f.accepted,incoming:f.recipient===k})),rooms:rooms.filter(r=>r.members.includes(k)).map(r=>({id:r.id,name:r.name,ownerId:ids.a})),invitations:invites.filter(i=>i.target==='b'&&k==='b'&&!i.used&&!i.revoked).map(i=>({id:i.id,roomName:'Тестовая',fromName:names.a}))});
 const pages={};
 try{
  for(const k of ['a','b']){
   const context=await browser.newContext({viewport:{width:390,height:740}});
   await context.addInitScript(name=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'local-'+name,name,createdAt:1,updatedAt:1})),names[k]);
   await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',async route=>{
    const req=route.request(),user={id:ids[k],email:k+'@example.test',is_anonymous:false};requests.push(req.url());let data,status=200;
    if(req.url().includes('/auth/'))data=req.url().endsWith('/user')?user:{user,access_token:'access-'+k,refresh_token:'refresh-'+k,expires_in:3600};
    else{
     const {p_action:action,p_data:d}=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer access-'+k);
     if(action==='list')data=list(k);
     else if(action==='profile'){profiles[k]={id:ids[k],nickname:d.nickname};data=profiles[k];}
     else if(action==='request'){assert.equal(d.userId,ids.b);friends.push({id:edge,sender:k,recipient:'b',accepted:false});data={};}
     else if(action==='accept'){assert.equal(k,'b');friends[0].accepted=true;data={};}
     else if(action==='create'){rooms.push({id:rid,name:d.name,members:['a']});data={id:rid};}
     else if(action==='room'){data={id:rid,name:'Тестовая',ownerId:ids.a,members:rooms[0].members.map(m=>({id:ids[m],nickname:names[m]})),invites:k==='a'?invites.map(i=>({id:i.id,targetId:ids.b,expiresAt:new Date(Date.now()+86400000).toISOString(),used:i.used,revoked:i.revoked})):[]};}
     else if(action==='invite'){assert.equal(k,'a');assert.equal(d.userId,ids.b);invites.push({id:iid,target:'b',used:false,revoked:false});data={id:iid,token:secret};}
     else if(action==='join'){assert.equal(d.inviteId,iid);invites[0].used=true;rooms[0].members.push(k);data={id:rid};}
     else if(action==='revoke'){invites.at(-1).revoked=true;data={};}
     else throw Error('Unexpected RPC '+action);
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);pages[k]=page;
  }
  assert.equal(requests.length,0);
  for(const k of ['a','b']){
   const p=pages[k];await p.locator('#app [data-command=settings]').first().click();await p.locator('[data-account-open]').click();await p.locator('[name=email]').fill(k+'@example.test');await p.locator('[name=password]').fill('password123');await p.locator('.account-form [type=submit]').click();await p.locator('[data-account-mode=social]').click();await p.locator('[data-social-form=profile] [type=submit]').click();await p.locator('[data-social-form=request]').waitFor();
  }
  const a=pages.a,b=pages.b;
  await a.locator('[data-social-form=request] input').fill(ids.b);await a.locator('[data-social-form=request] [type=submit]').click();await a.getByText('Борис · Запрос отправлен',{exact:true}).waitFor();
  await b.locator('[data-social-action=refresh]').click();await b.locator('[data-social-action=accept]').click();await b.getByText('Алиса · Друг',{exact:true}).waitFor();
  await a.locator('[data-social-action=refresh]').click();await a.getByText('Борис · Друг',{exact:true}).waitFor();
  await a.locator('[data-social-form=create] input').fill('Тестовая');await a.locator('[data-social-form=create] [type=submit]').click();await a.locator('[data-social-target]').selectOption(ids.b);await a.locator('[data-social-action=invite]').click();
  await a.locator('input[value="'+secret+'"]').waitFor();assert.equal(await a.evaluate(()=>JSON.stringify(PlayroomSocialUI.service.snapshot()).includes('a'.repeat(64))),false);
  await a.screenshot({path:path.resolve(__dirname,'../../tmp_files/network-stage2/social-owner-phone.png')});
  await b.locator('[data-social-action=refresh]').click();await b.locator('[data-social-action=join-targeted]').click();await b.getByText('Доступ в комнату подтверждён.',{exact:false}).waitFor();assert.equal(await b.locator('[data-social-action=invite]').count(),0);assert.equal(await b.locator('.social-content li').count(),2);
  await a.locator('[data-social-target]').selectOption(ids.b);await a.locator('[data-social-action=invite]').click();await a.locator('[data-social-action=revoke]').click();await a.locator('[data-social-action=revoke]').waitFor({state:'detached'});
  for(const p of [a,b]){assert(await p.locator('.social-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert(await p.evaluate(()=>!localStorage.getItem('playroom.cloud-social')));}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

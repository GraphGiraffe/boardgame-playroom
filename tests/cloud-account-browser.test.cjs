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

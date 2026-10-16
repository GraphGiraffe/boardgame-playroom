'use strict';
// No screenshots/traces/cookie dumps: this probe handles a private password.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,executablePath}=require('./codex/browser.cjs');
const {originProxy}=require('./pages-origin-proxy.cjs');
const {accessProxy}=require('./pages-access-proxy.cjs');
let stage='configuration';const verification={};
async function main(){
 const url=process.env.PLAYROOM_DEPLOY_URL,password=process.env.PAGES_SMOKE_PASSWORD,dir=process.env.PLAYROOM_DEPLOY_DIR;
 if(!url||!password||!url.startsWith('https://'))throw Error('Missing HTTPS deployment or protected password');
 const origin=new URL(url).origin,clientId=process.env.CF_ACCESS_CLIENT_ID,clientSecret=process.env.CF_ACCESS_CLIENT_SECRET;
 if(!!clientId!==!!clientSecret)throw Error('Incomplete Access credentials');
 const accessHeaders=clientId?{'CF-Access-Client-Id':clientId,'CF-Access-Client-Secret':clientSecret}:{};
 async function createContext(){
  // Playwright's APIRequestContext also uses the local bridge certificate,
  // while the bridge verifies the real Cloudflare certificate upstream.
  return browser.newContext({playroomProfile:false,extraHTTPHeaders:accessHeaders,ignoreHTTPSErrors:!!clientId});
 }
 async function get(context,target,headers={}){
  if(new URL(target).origin!==origin)throw Error('Unexpected asset origin');
  for(let attempt=0;;attempt++){
   let response;
   try{response=await context.request.get(target,{headers:{...headers,...accessHeaders},maxRedirects:0});}
   catch(error){if(attempt===4)throw error;console.log('Retrying scoped asset request after transport failure: '+new URL(target).pathname.replace(/[^a-zA-Z0-9_./-]/g,''));await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));continue;}
   if(![404,502,503,504].includes(response.status())||attempt===4)return response;
   await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
  }
 }
 const tunnel=clientId?await accessProxy(origin,{clientId,clientSecret}):await originProxy(origin);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),proxy:{server:tunnel.server},args:['--no-sandbox','--proxy-bypass-list=<-loopback>',...(tunnel.spki?['--ignore-certificate-errors-spki-list='+tunnel.spki]:[])]});
  const context=await createContext(),page=await context.newPage(),errors=[],authStatuses=[],assetStatuses=[],badAssets=[],cookieBlocks=[],navigations=[],failedRequests=[];
  const workerFailures=[],workerResponses=[];
  context.on('response',response=>{if(response.request().serviceWorker()&&new URL(response.url()).origin===origin&&!response.ok())workerResponses.push({status:response.status(),path:new URL(response.url()).pathname.replace(/[^a-zA-Z0-9_./-]/g,'')});});
  const network=await context.newCDPSession(page);await network.send('Network.enable');
  network.on('ServiceWorker.workerErrorReported',event=>{
   const value=event.errorMessage.errorMessage||'',asset=value.match(/Incomplete application update: ([a-zA-Z0-9_./-]+)/);
   workerFailures.push({asset:asset?.[1]||null,fetch:/fetch/i.test(value),mime:/mime/i.test(value),redirect:/redirect/i.test(value),line:event.errorMessage.lineNumber});
  });
  await network.send('ServiceWorker.enable');
  network.on('Network.responseReceivedExtraInfo',event=>{
   for(const cookie of event.blockedCookies||[])cookieBlocks.push(...cookie.blockedReasons);
  });
  page.on('pageerror',error=>errors.push({name:error.name,site:error.stack?.match(/(?:app|core|application|platform|presentation)\/[A-Za-z0-9_.\/-]+\.js:\d+:\d+/)?.[0]||null}));
  page.on('requestfailed',request=>{
   const target=new URL(request.url());
   if(target.origin===origin)failedRequests.push({path:target.pathname.replace(/[^a-zA-Z0-9_./-]/g,''),type:request.resourceType(),reason:request.failure()?.errorText||null});
  });
  page.on('response',response=>{
   const target=new URL(response.url());
   if(target.origin!==origin)return;
   if(target.pathname==='/_auth')authStatuses.push(response.status());
   if(['script','stylesheet'].includes(response.request().resourceType())){
    assetStatuses.push(response.status());
    if(response.status()>=400)badAssets.push({status:response.status(),path:target.pathname.replace(/[^a-zA-Z0-9_./-]/g,'')});
   }
   if(response.request().isNavigationRequest())navigations.push({status:response.status(),auth:target.pathname==='/_auth',cache:response.headers()['cf-cache-status']||null,redirect:response.headers().location?new URL(response.headers().location,response.url()).origin===origin:null});
  });
  stage='login-page';let landing;
  for(let attempt=0;;attempt++){
   landing=await page.goto(url);
   if(![404,502,503,504].includes(landing.status())||attempt===4)break;
   console.log('Waiting for Pages propagation: HTTP '+landing.status());
   await page.waitForTimeout(5000*(attempt+1));
  }
  const field=page.locator('input[name="password"]');
  console.log('Landing HTTP '+landing.status()+'; password form: '+await field.count());
  if(await page.evaluate(()=>!!globalThis.PlayroomAppBridge)){stage='unprotected-site';throw Error('Application available without authentication');}
  await field.waitFor();
  stage='wrong-password';await field.fill('invalid-'+crypto.randomUUID());
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('button[type="submit"]').click()]);await field.waitFor();
  if(await page.evaluate(()=>!!globalThis.PlayroomAppBridge))throw Error('Wrong password granted access');
  stage='login';await field.fill(password);
  let login;
  try{
   [login]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).origin===origin&&new URL(response.url()).pathname==='/_auth'&&response.request().method()==='POST'),page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('button[type="submit"]').click()]);
  }catch(error){
   const cookies=await context.cookies(url).catch(()=>[]);
   console.log('Login transition diagnostics: '+JSON.stringify({authStatuses,navigations:navigations.slice(-8),failedRequests:failedRequests.slice(-8),cookieBlocks:cookieBlocks.slice(-8),cookies:cookies.length,hostCookies:cookies.filter(cookie=>cookie.name.startsWith('__Host-')).length,passwordForm:await field.count().catch(()=>null),pageErrors:errors.length}));
   throw error;
  }
  if(login.status()!==303)throw Error('Password login rejected');
  const destination=new URL(login.headers().location||'',login.url());
  if(!login.headers().location||destination.origin!==origin)throw Error('Unexpected login redirect');
  try{
   for(let attempt=0;;attempt++){
    try{await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge,null,{timeout:10000});break;}
    catch(error){
     if(attempt===2||!assetStatuses.includes(404))throw error;
     console.log('Waiting for Pages asset propagation: retry '+(attempt+1));
     await page.waitForTimeout(5000*(attempt+1));
     assetStatuses.length=0;badAssets.length=0;errors.length=0;
     await page.reload({waitUntil:'domcontentloaded'});
    }
   }
  }catch(error){
   const cookies=await context.cookies(url),response=await get(context,url,{Cookie:cookies.map(c=>c.name+'='+c.value).join('; '),'Cache-Control':'no-cache'}),html=await response.text();
   console.log('Login diagnostics: '+JSON.stringify({authStatuses,passwordForm:await field.count(),scripts:await page.locator('script[src]').count(),assetStatuses,badAssets:badAssets.slice(-20),pageErrors:errors.length,cookies:cookies.length,hostCookies:cookies.filter(c=>c.name.startsWith('__Host-')).length,cookieBlocks,navigations,direct:{status:response.status(),scripts:(html.match(/<script\b[^>]*\bsrc=/g)||[]).length,cache:response.headers()['cf-cache-status']||null}}));
   throw error;
  }
  stage='runtime-assets';const refs=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e=>e.getAttribute('src')||e.getAttribute('href')));
  if(!refs.length||refs.some(n=>!(/\.[a-f0-9]{16}\.(js|css)$/.test(n)))){stage='runtime-asset-names';throw Error('Unexpected shell assets');}
  const anonymous=await createContext();
  try{
   for(const ref of refs){
    stage='runtime-asset-'+path.basename(ref);
    const target=new URL(ref,url).href,response=await get(context,target);
    if(!response.ok()){stage='runtime-asset-status-'+response.status();throw Error('Authenticated asset unavailable');}
    const bytes=await response.body(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(/lobby-view\.[a-f0-9]+\.js$/.test(ref)){
      const source=bytes.toString('utf8'),translated=source.includes('>Локальная<')&&source.includes('>Сетевая<')||await page.evaluate(()=>globalThis.PlayroomMessages?.text('ui.lobby-view.02d339ef14d5')==='Локальная'&&globalThis.PlayroomMessages?.text('ui.lobby-view.6fa8cb59219b')==='Сетевая');
      console.log('Live lobby labels: '+(translated?'Russian':'outdated')+'; asset '+ref);
      if(!translated)throw Error('Outdated lobby asset');
    }
    if(dir&&hash!==crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,ref))).digest('hex')){stage='runtime-asset-bytes';console.log('Asset integrity mismatch: '+path.basename(ref));throw Error('Deployed bytes differ from verified archive');}
    const denied=await get(anonymous,target);
    if(denied.ok()&&crypto.createHash('sha256').update(await denied.body()).digest('hex')===hash){stage='runtime-anonymous-access';throw Error('Unauthenticated asset access');}
   }
   const cookies=await context.cookies();
   const forged=await get(anonymous,new URL(refs[0],url).href,{Cookie:cookies.map(c=>c.name+'=invalid').join('; ')});
   if(forged.ok()&&!((forged.headers()['content-type']||'').includes('text/html')))throw Error('Forged cookie accepted');
   const worker=await get(anonymous,new URL('_worker.js',url).href);
   if(worker.ok()&&!((worker.headers()['content-type']||'').includes('text/html')))throw Error('Private Worker exposed');
   if(await page.evaluate(()=>Array.isArray(globalThis.PlayroomInstalledPacks)&&globalThis.PlayroomInstalledPacks.length===0)){
    stage='remote-pack-catalog';
    const target=new URL('/api/packs/catalog',url).href;
    const denied=await get(anonymous,target);
    if(denied.ok())throw Error('Remote catalog exposed without authentication');
    const catalogResponse=await get(context,target);
    if(!catalogResponse.ok())throw Error('Protected remote catalog unavailable: '+catalogResponse.status());
    const catalogBytes=await catalogResponse.body(),catalog=JSON.parse(catalogBytes.toString('utf8'));verification.catalog={collection:catalog.collection,sha256:crypto.createHash('sha256').update(catalogBytes).digest('hex'),packs:catalog.packs?.map(item=>({id:item.id,version:item.version,sha256:item.sha256}))};
    if(catalog.format!=='playroom-catalog'||catalog.packs?.length!==12)throw Error('Remote catalog is incomplete');
    for(const item of catalog.packs){
     const file=await get(context,new URL(item.url,url).href);
     if(!file.ok()||crypto.createHash('sha256').update(await file.body()).digest('hex')!==item.sha256)throw Error('Remote pack mismatch: '+item.id);
    }
   }
  }finally{await anonymous.close();}
  verification.appVersion=await page.evaluate(()=>globalThis.PlayroomAppVersion||null);
  if(process.env.PLAYROOM_SMOKE_REPORT)fs.writeFileSync(process.env.PLAYROOM_SMOKE_REPORT,JSON.stringify(verification,null,2));
  if(process.env.PLAYROOM_SMOKE_ONLINE_ONLY==='1'){
   console.log('Protected online rollback baseline passed; offline verification omitted for this recovery target.');
   return;
  }
  stage='service-worker';
  for(let attempt=0;;attempt++){
   try{await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});break;}
   catch(error){
    if(attempt<3&&workerResponses.some(response=>response.status===404)){
     console.log('Waiting for Pages worker assets: retry '+(attempt+1));
     await page.waitForTimeout(10000*(attempt+1));
     workerResponses.length=0;workerFailures.length=0;errors.length=0;
     await page.reload({waitUntil:'domcontentloaded'});
     continue;
    }
    const registration=await page.evaluate(async()=>{
     const r=await navigator.serviceWorker.getRegistration();
     return {found:!!r,installing:r?.installing?.state,waiting:r?.waiting?.state,active:r?.active?.state,controlled:!!navigator.serviceWorker.controller};
    });
    const assets=[];
    for(const name of ['sw.js','index.html','']){
     const response=await get(context,new URL(name,url).href),body=await response.body();
     assets.push({name:name||'root',status:response.status(),type:response.headers()['content-type'],redirect:!!response.headers().location,sha256:crypto.createHash('sha256').update(body).digest('hex')});
    }
    console.log('Worker diagnostics: '+JSON.stringify({registration,assets,workerFailures,workerResponses:workerResponses.slice(-20)}));
    throw error;
   }
  }
  await page.evaluate(()=>localStorage.setItem('playroom-deploy-probe','preserved'));
  stage='offline';await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
  const preserved=await page.evaluate(()=>localStorage.getItem('playroom-deploy-probe'))==='preserved';
  if(!preserved||errors.length){console.log('Offline diagnostics: '+JSON.stringify({preserved,errors,workerFailures,workerResponses:workerResponses.slice(-12),failedRequests:failedRequests.slice(-12)}));throw Error('Offline smoke failed');}
  console.log('Protected runtime and offline smoke passed.');
 }finally{if(browser)await browser.close();await tunnel.close();}
}
if(require.main===module)main().catch(error=>{
 const known=['Unexpected shell assets','Authenticated asset unavailable','Deployed bytes differ from verified archive','Unauthenticated asset access','Forged cookie accepted','Private Worker exposed','Password login rejected','Unexpected login redirect','Outdated lobby asset','Offline smoke failed'];
 const reason=known.includes(error.message)?error.message:error.name==='TimeoutError'?'browser timeout':'check exception';
 console.error('Protected Pages smoke failed at '+stage+' ('+reason+'); credentials and browser state redacted.');process.exitCode=1;});
module.exports={main};

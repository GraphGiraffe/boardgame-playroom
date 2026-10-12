'use strict';
// No screenshots/traces/cookie dumps: this probe handles a private password.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,executablePath}=require('./codex/browser.cjs');
let stage='configuration';
async function main(){
 const url=process.env.PLAYROOM_DEPLOY_URL,password=process.env.PAGES_SMOKE_PASSWORD,dir=process.env.PLAYROOM_DEPLOY_DIR;
 if(!url||!password||!url.startsWith('https://'))throw Error('Missing HTTPS deployment or protected password');
 const origin=new URL(url).origin,clientId=process.env.CF_ACCESS_CLIENT_ID,clientSecret=process.env.CF_ACCESS_CLIENT_SECRET;
 if(!!clientId!==!!clientSecret)throw Error('Incomplete Access credentials');
 const accessHeaders=clientId?{'CF-Access-Client-Id':clientId,'CF-Access-Client-Secret':clientSecret}:{};
 async function createContext(){
  const context=await browser.newContext({playroomProfile:false});
  if(clientId)await context.route('**/*',async route=>{
   if(new URL(route.request().url()).origin!==origin)return route.abort();
   try{
    // Do not forward credentials through redirects to a different origin.
    // headers() omits security headers such as Cookie; preserve browser auth.
    const response=await route.fetch({headers:{...await route.request().allHeaders(),...accessHeaders},maxRedirects:0});
    await route.fulfill({response});
   }catch(_){await route.abort().catch(()=>{});}
  });
  return context;
 }
 async function get(context,target,headers={}){
  if(new URL(target).origin!==origin)throw Error('Unexpected asset origin');
  return context.request.get(target,{headers:{...headers,...accessHeaders},maxRedirects:0});
 }
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const context=await createContext(),page=await context.newPage(),errors=[],authStatuses=[],assetStatuses=[];
  page.on('pageerror',()=>errors.push('page-error'));
  page.on('response',response=>{
   const target=new URL(response.url());
   if(target.origin!==origin)return;
   if(target.pathname==='/_auth')authStatuses.push(response.status());
   if(['script','stylesheet'].includes(response.request().resourceType()))assetStatuses.push(response.status());
  });
  stage='login-page';const landing=await page.goto(url);const field=page.locator('input[name="password"]');
  console.log('Landing HTTP '+landing.status()+'; password form: '+await field.count());
  if(await page.evaluate(()=>!!globalThis.PlayroomAppBridge)){stage='unprotected-site';throw Error('Application available without authentication');}
  await field.waitFor();
  stage='wrong-password';await field.fill('invalid-'+crypto.randomUUID());await page.locator('button[type="submit"]').click();await field.waitFor();
  if(await page.evaluate(()=>!!globalThis.PlayroomAppBridge))throw Error('Wrong password granted access');
  stage='login';await field.fill(password);await page.locator('button[type="submit"]').click();
  try{await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);}catch(error){
   console.log('Login diagnostics: '+JSON.stringify({authStatuses,passwordForm:await field.count(),scripts:await page.locator('script[src]').count(),assetStatuses,pageErrors:errors.length}));
   throw error;
  }
  stage='runtime-assets';const refs=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e=>e.getAttribute('src')||e.getAttribute('href')));
  if(!refs.length||refs.some(n=>!(/\.[a-f0-9]{16}\.(js|css)$/.test(n))))throw Error('Unexpected shell assets');
  const anonymous=await createContext();
  try{
   for(const ref of refs){
    const target=new URL(ref,url).href,response=await get(context,target);
    if(!response.ok())throw Error('Authenticated asset unavailable');
    const bytes=await response.body(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(/lobby-view\.[a-f0-9]+\.js$/.test(ref)){
      const source=bytes.toString('utf8'),translated=source.includes('>Локальная<')&&source.includes('>Сетевая<');
      console.log('Live lobby labels: '+(translated?'Russian':'outdated')+'; asset '+ref);
      if(!translated)throw Error('Outdated lobby asset');
    }
    if(dir&&hash!==crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,ref))).digest('hex'))throw Error('Deployed bytes differ from verified archive');
    const denied=await get(anonymous,target);
    if(denied.ok()&&crypto.createHash('sha256').update(await denied.body()).digest('hex')===hash)throw Error('Unauthenticated asset access');
   }
   const cookies=await context.cookies();
   const forged=await get(anonymous,new URL(refs[0],url).href,{Cookie:cookies.map(c=>c.name+'=invalid').join('; ')});
   if(forged.ok()&&!((forged.headers()['content-type']||'').includes('text/html')))throw Error('Forged cookie accepted');
   const worker=await get(anonymous,new URL('_worker.js',url).href);
   if(worker.ok()&&!((worker.headers()['content-type']||'').includes('text/html')))throw Error('Private Worker exposed');
  }finally{await anonymous.close();}
  stage='service-worker';await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.evaluate(()=>localStorage.setItem('playroom-deploy-probe','preserved'));
  stage='offline';await context.unrouteAll({behavior:'wait'});await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
  if(await page.evaluate(()=>localStorage.getItem('playroom-deploy-probe'))!=='preserved'||errors.length)throw Error('Offline smoke failed');
  console.log('Protected runtime and offline smoke passed.');
 }finally{await browser.close();}
}
if(require.main===module)main().catch(()=>{console.error('Protected Pages smoke failed at '+stage+'; credentials and browser state redacted.');process.exitCode=1;});
module.exports={main};

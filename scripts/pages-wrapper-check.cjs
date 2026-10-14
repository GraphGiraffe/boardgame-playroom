'use strict';
// The private module and all authentication material stay out of logs/artifacts.
const fs=require('node:fs');
let stage='load';
async function main(){
 const source=fs.readFileSync(process.argv[2]),password=process.env.PAGES_SMOKE_PASSWORD;
 if(!password)throw Error('Missing password');
 const worker=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;
 const origin='https://wrapper-check.invalid',body='PRIVATE-ASSET-'+crypto.randomUUID();
 let reads=0,r2reads=0;
 const env={ASSETS:{fetch:async()=>{reads++;return new Response(body);}},PLAYROOM_PACKS:{get:async()=>{r2reads++;return null;}}};
 const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env,{});
 const login=(value,requestOrigin=origin)=>call('/_auth',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:requestOrigin},body:new URLSearchParams({password:value,next:"/"})});
 const deny=async response=>{if(reads||r2reads||response.headers.get('set-cookie')||await response.text()===body)throw Error('Access bypass');};
 stage='anonymous';await deny(await call('/app/runtime.js'));
 stage='anonymous-catalog';await deny(await call('/api/packs/catalog'));
 stage='wrong-password';await deny(await login('incorrect-'+crypto.randomUUID()));
 stage='foreign-origin';await deny(await login(password,'https://foreign.invalid'));
 stage='login';let response=await login(password),cookie=response.headers.get('set-cookie');
 if(!cookie||!cookie.includes('HttpOnly')||!cookie.includes('Secure'))throw Error('Missing protected cookie');
 cookie=cookie.split(';')[0];
 response=await call('/app/runtime.js',{headers:{Cookie:cookie}});
 if(await response.text()!==body||reads!==1)throw Error('Authorized access failed');
 stage='authorized-catalog';response=await call('/api/packs/catalog',{headers:{Cookie:cookie}});
 if(response.status!==503||r2reads!==1)throw Error('Authenticated R2 route failed');
 r2reads=0;
 stage='tampered-cookie';reads=0;await deny(await call('/app/runtime.js',{headers:{Cookie:cookie+'tampered'}}));
 stage='expired-cookie';const now=Date.now;Date.now=()=>now()+366*24*60*60*1000;
 try{await deny(await call('/app/runtime.js',{headers:{Cookie:cookie}}));}finally{Date.now=now;}
 // A sandboxed/file-origin login is supported by the existing invitation flow.
 stage='null-origin';if(!(await login(password,'null')).headers.get('set-cookie'))throw Error('Null origin login rejected');
 console.log('Private wrapper access policy passed.');
}
if(require.main===module)main().catch(()=>{console.error('Private wrapper access check failed at '+stage+'; private source and credentials redacted.');process.exitCode=1;});

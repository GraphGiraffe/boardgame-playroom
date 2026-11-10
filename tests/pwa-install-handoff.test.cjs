'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=['core/messages.js','application/pwa-update-coordinator.js','app/pwa.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
function runtime(handoff,settings={}){const listeners=new Map();const context={isSecureContext:true,location:{protocol:'https:',hostname:'example.test',href:'https://example.test/playroom/'},document:{addEventListener(){}},navigator:{},matchMedia:()=>({matches:false}),PlayroomPairing:{extract:()=>null,protocolUrl:()=>''},PlayroomInstallHandoff:handoff,addEventListener:(type,listener)=>listeners.set(type,listener),dispatchEvent(){},URL,Set,Promise,Event};Object.assign(context.navigator,settings.navigator||{});if(settings.location)Object.assign(context.location,settings.location);if(settings.globals)Object.assign(context,settings.globals);context.globalThis=context;vm.runInNewContext(source,context);return{context,pwa:context.PlayroomPWA,listeners}}
test('PWA consumes a password-gate installation invitation exactly once',async()=>{let prompts=0;const event={prompt:async()=>{prompts++},userChoice:Promise.resolve({outcome:'dismissed'})},handoff={prompt:event};const{context,pwa}=runtime(handoff);assert.equal(pwa.canInstall(),true);assert.equal(handoff.prompt,null);assert.equal('PlayroomInstallHandoff'in context,false);assert.equal((await pwa.install()).outcome,'dismissed');assert.equal(prompts,1);assert.equal(pwa.canInstall(),false);await assert.rejects(pwa.install());assert.equal(prompts,1)});
test('PWA does not advertise installation without a browser invitation',()=>{const{pwa}=runtime({prompt:null});assert.equal(pwa.canInstall(),false)});
test('appinstalled clears the handed-off invitation',()=>{const{pwa,listeners}=runtime({prompt:{prompt(){}}});assert.equal(pwa.canInstall(),true);listeners.get('appinstalled')();assert.equal(pwa.canInstall(),false)});

test('PWA installation distinguishes iOS menu guidance, native invitation and actual installed evidence',()=>{
 const ios=runtime(null,{navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',platform:'iPhone'}});assert.equal(ios.pwa.installState().mode,'ios');assert.equal(ios.pwa.canInstall(),false);assert.equal(ios.pwa.standalone,false);
 const ipad=runtime(null,{navigator:{userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5}});assert.equal(ipad.pwa.installState().mode,'ios');
 const desktop=runtime(null,{navigator:{platform:'MacIntel',userAgent:'Safari'}});assert.equal(desktop.pwa.installState().mode,'manual');assert.equal(desktop.pwa.installState().mac,true);
 const native=runtime({prompt:{prompt(){}}},{navigator:{userAgent:'iPhone'}});assert.equal(native.pwa.installState().mode,'native');native.listeners.get('appinstalled')();assert.equal(native.pwa.installState().mode,'installed');assert.equal(native.pwa.canInstall(),false);
 ios.context.navigator.standalone=true;assert.equal(ios.pwa.standalone,true);assert.equal(ios.pwa.installState().mode,'installed');
 const insecure=runtime(null,{location:{protocol:'http:',hostname:'example.test'}});assert.equal(insecure.pwa.installState().mode,'insecure');
});


test('installed related PWA is detected across fresh visits, rechecked without stale storage flags and scoped to its manifest',async()=>{
 let calls=0,apps=[{platform:'webapp',url:'https://example.test/playroom/manifest.webmanifest',id:'https://example.test/playroom'}];
 const e=runtime(null,{navigator:{getInstalledRelatedApps:async()=>{calls++;return apps;}}});
 e.context.document.querySelector=()=>({href:'https://fixture-reader:fixture-only@example.test/playroom/manifest.webmanifest'});
 await Promise.all([e.pwa.refreshInstallation(),e.pwa.refreshInstallation()]);assert.equal(calls,1);assert.equal(e.pwa.installState().launchable,true);
 apps=[{platform:'webapp',url:'https://example.test/another/manifest.webmanifest',id:'https://example.test/playroom'}];await e.pwa.refreshInstallation();assert.equal(e.pwa.installState().mode,'manual');
 apps=[{platform:'webapp',url:'https://example.test/playroom/manifest.webmanifest',id:'https://example.test/another'}];await e.pwa.refreshInstallation();assert.equal(e.pwa.installState().mode,'manual');
 apps=[{platform:'webapp',url:'https://example.test/playroom/manifest.webmanifest'}];await e.pwa.refreshInstallation();assert.equal(e.pwa.installState().launchable,true);
 e.context.navigator.getInstalledRelatedApps=async()=>{throw Error('unavailable');};await e.pwa.refreshInstallation();assert.equal(e.pwa.installState().launchable,true);
 e.context.navigator.getInstalledRelatedApps=async()=>[];await e.pwa.refreshInstallation();assert.equal(e.pwa.installState().mode,'manual');
});

test('late installed-app probe cannot consume a newer native installation invitation',async()=>{
 let resolve,calls=0;const e=runtime(null,{navigator:{getInstalledRelatedApps:()=>{calls++;return calls===1?new Promise(r=>{resolve=r;}):Promise.resolve([]);}}});
 const pending=e.pwa.refreshInstallation();await Promise.resolve();
 e.listeners.get('beforeinstallprompt')({preventDefault(){},prompt(){}});
 resolve([{platform:'webapp',url:'https://example.test/playroom/manifest.webmanifest'}]);await pending;await e.pwa.refreshInstallation();
 assert.equal(e.pwa.installState().mode,'native');assert.equal(e.pwa.canInstall(),true);assert.equal(calls,2);
});


test('manual update check bounds both HEAD and native service worker update without trusting offline hints',async()=>{
 const Deadline=require('../platform/web/request-deadline.js');let stage='head',signal,updates=0;const registration={active:{scriptURL:'https://example.test/sw.js'},addEventListener(){},update(){updates++;return new Promise(()=>{});}};
 const {pwa}=runtime(null,{navigator:{onLine:false,serviceWorker:{controller:{},register:async()=>registration,addEventListener(){}}},globals:{PlayroomRequestDeadline:{run:(work,options)=>Deadline.run(work,{...options,timeout:25})},setInterval(){},fetch:async(url,options)=>{signal=options.signal;return stage==='head'?new Promise(()=>{}):new Response(null,{status:200});}}});
 await assert.rejects(()=>pwa.checkForUpdate(),e=>e.code==='timeout');assert(signal.aborted);assert.equal(updates,0);
 stage='native';await assert.rejects(()=>pwa.checkForUpdate(),e=>e.code==='timeout');assert.equal(updates,1,'a false offline hint still allows a real origin check');
});

'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {buildSandbox}=require('../scripts/build-sandbox.cjs');
const {loadProject}=require('../sdk/project.cjs');
const {fixture}=require('./sdk-fixture.cjs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
let server,browser,base;
before(async()=>{
 const built=await buildSandbox();
 server=http.createServer((request,response)=>{const name=request.url?.split('?')[0];if(name==='/'){response.setHeader('content-type','text/html');response.end('<!doctype html><meta charset="utf-8"><script src="/sandbox.js"></script>');return;}if(!['/sandbox.js','/quickjs.wasm'].includes(name)){response.writeHead(404).end();return;}response.setHeader('content-type',name.endsWith('.wasm')?'application/wasm':'application/javascript');response.end(fs.readFileSync(path.join(built.directory,name.slice(1))));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:executablePath()});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(t){const context=await browser.newContext({playroomProfile:false});t.after(()=>context.close());const page=await context.newPage();await page.goto(base);await page.evaluate(()=>PlayroomSandbox.ready);return page;}
const payload=root=>{const p=loadProject(root,{shared:path.resolve(__dirname,'../../playroom-paks/shared')});return {manifest:p.manifest,dependencies:p.dependencies,rules:p.rules,helpers:p.helpers,presentation:p.presentation};};
test('browser sandbox keeps caught capability errors outside guest control and redacts diagnostics',{timeout:45000},async t=>{
 const page=await pageFor(t),requests=[];page.on('request',request=>requests.push(request.url()));
 for(const expression of ['fetch("https://example.invalid")','process.env','document.cookie','localStorage.getItem("x")','Math.random()','Date.now()','require("node:fs")']){
  const project=payload(fixture(t,{start:`try{${expression}}catch{}`}));
  const result=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{guest.model.start({playerCount:2,firstPlayer:0,rng:1});return null;}catch(error){return error.diagnostic;}finally{guest.close();}},project);
  assert.equal(result.code,'SDK_ACCESS_DENIED');assert.equal(result.role,'rules');assert(result.frames.some(f=>f.file==='domain/game.js'));
 }
 assert(!requests.some(url=>url.includes('example.invalid')));
 const hostile=payload(fixture(t,{start:"const e=Error('SECRET_BROWSER_PAYLOAD');e.resource='SECRET_BROWSER_PAYLOAD';e.stack=' at domain/not-loaded.js:1:1';throw e;"}));
 const result=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{guest.model.start({playerCount:2,firstPlayer:0,rng:1});}catch(error){return error.diagnostic;}finally{guest.close();}},hostile);assert.equal(result.code,'SDK_EXECUTION_FAILED');assert(!JSON.stringify(result).includes('SECRET_BROWSER_PAYLOAD'));
});
test('browser sandbox creates a fresh presentation realm for every viewer and denies authority access',async t=>{
 const page=await pageFor(t),root=fixture(t,{project:"({label:viewer===0?'private-zero':'private-one'})",render:'globalThis.cachedLabel ||= projection.data.label'}),file=path.join(root,'presentation/scene.js');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('players:[0,1]','label:globalThis.cachedLabel,players:[0,1]'));
 const labels=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{const start=guest.model.start({playerCount:2,firstPlayer:0,rng:1});return [0,1,0].map(viewer=>PlayroomSandbox.render(project,guest.model.project(start.position,viewer,[])).scene.label);}finally{guest.close();}},payload(root));assert.deepEqual(labels,['private-zero','private-one','private-zero']);
 const isolated=payload(fixture(t,{render:"if(typeof PlayroomPackDefinition!=='undefined'||typeof __definition!=='undefined')throw Error('AUTHORITY_LEAK');if(Object.hasOwn(projection.data,'secret'))throw Error('AUTHORITY_LEAK');"}));
 assert.equal(await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{const start=guest.model.start({playerCount:2,firstPlayer:0,rng:1});return PlayroomSandbox.render(project,guest.model.project(start.position,0,[])).scene.id;}finally{guest.close();}},isolated),'probe');
});
test('browser sandbox interrupts loops and allocation floods and remains usable',{timeout:20000},async t=>{
 const page=await pageFor(t);
 for(const start of ['for(;;){}','const all=[];for(;;)all.push(new Uint8Array(1024*1024));']){
  const result=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project),time=performance.now();try{guest.model.start({playerCount:2,firstPlayer:0,rng:1});return null;}catch(error){return {code:error.code,milliseconds:performance.now()-time};}finally{guest.close();}},payload(fixture(t,{start})));
  assert(['SDK_TIME_LIMIT','SDK_EXECUTION_FAILED'].includes(result.code));assert(result.milliseconds<5000);
 }
 const valid=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{return guest.model.start({playerCount:2,firstPlayer:0,rng:1}).position.playerCount;}finally{guest.close();}},payload(fixture(t)));assert.equal(valid,2);
});
test('browser sandbox runs normal pilots and bot contexts through the canonical guest model',{timeout:45000},async t=>{
 const page=await pageFor(t);
 for(const id of ['tictactoe','gofish','yatzy']){
  const project=payload(path.resolve(__dirname,'../../playroom-paks/packs',id));
  const result=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{const start=guest.model.start({playerCount:2,firstPlayer:0,preset:'classic',rng:1}),projection=guest.model.project(start.position,0,[]),view=PlayroomSandbox.render(project,projection),bot=guest.model.botAction(start.position,start.position.turn,{enabled:false});return {id:guest.model.id,scene:view.scene.id,players:view.scene.players.length,bot};}finally{guest.close();}},project);
  assert.equal(result.id,id);assert.equal(result.players,2);assert(result.scene);assert(result.bot&&typeof result.bot.type==='string');
 }
});
test('browser sandbox rejects non JSON bridge arguments instead of dropping host functions',async t=>{
 const page=await pageFor(t);
 const codes=await page.evaluate(project=>{const guest=PlayroomSandbox.createRules(project);try{const loop={};loop.self=loop;return [()=>guest.definition.create({callback:()=>1}),()=>guest.model.start({playerCount:2,firstPlayer:0,rng:1,callback:()=>1}),()=>guest.model.start(loop),()=>guest.model.start({value:1n})].map(run=>{try{run();return null;}catch(error){return error.code;}});}finally{guest.close();}},payload(fixture(t)));
 assert.deepEqual(codes,['SDK_JSON_INVALID','SDK_JSON_INVALID','SDK_JSON_INVALID','SDK_JSON_INVALID']);
});

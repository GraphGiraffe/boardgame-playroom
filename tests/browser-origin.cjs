'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

// Browser storage for file:// is implementation-dependent and may disappear
// between reloads. Persistent-save regressions must run at a stable origin.
async function serveBrowserFixture(root){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    let relative;
    try { const u=new URL(req.url,'http://localhost');relative=decodeURIComponent(u.pathname==='/'?'index.html':u.pathname.slice(1)); }
    catch(_){res.writeHead(400);res.end();return;}
    const file=path.resolve(root,relative);
    const allowed=relative==='index.html'||/^installed-packs(?:\.[a-f0-9]{16})?\.js$/.test(relative)||relative==='manifest.webmanifest'||relative==='sw.js'||['core/messages.js','app/','core/','application/','presentation/','platform/','packs/','icons/'].some(prefix=>relative.startsWith(prefix));
    if(!allowed||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
// Exercise either the legacy list or its discrete range replacement by semantic ID.
async function selectChoice(locator,value){
  if(await locator.evaluate(e=>e.tagName==='SELECT'))return locator.selectOption(value);
  const index=await locator.evaluate((e,value)=>JSON.parse(e.dataset.choiceOptions).findIndex(o=>o.value===value),value);
  if(index<0)throw Error('Choice is unavailable: '+value);
  await locator.focus();await locator.press('Home');for(let i=0;i<index;i++)await locator.press('ArrowRight');
  await locator.dispatchEvent('change');
}
async function readChoice(locator){return locator.evaluate(e=>e.dataset.choiceOptions?JSON.parse(e.dataset.choiceOptions)[Number(e.value)].value:e.value);}
module.exports={serveBrowserFixture,selectChoice,readChoice};

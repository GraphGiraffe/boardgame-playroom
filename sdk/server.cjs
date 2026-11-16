'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {StudioSession}=require('./runtime.cjs');
const {LIMITS,SDKError,fail,publicResources}=require('./project.cjs');
const {check}=require('./check.cjs');
const {validateAsset}=require('./assets.cjs');
const Inputs=require('../core/model-inputs.js');
const Transition=require('../presentation/transition.js'),Plans=require('../presentation/event-plan.js');
async function serve(directory,{shared,port=0}={}){
 let session=await StudioSession.open(directory,{shared});try{await session.start({now:Date.now()});}catch(error){session.close();throw error;}
 let changed=false,watcher,serverOrigin,planIndex=0,queue=Promise.resolve(),closed=false,ticking=false;
 const token=crypto.randomBytes(32).toString('hex'),root=session.project.root,clients=new Map(),streams=new Set(),preview=new Map(),cache=new Map();
 let metadata=await session.metadata(), modelInfo=await session.rules.call('modelInfo'), definitionInfo=await session.rules.call('definitionInfo');
 const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
 const diagnostic=error=>error instanceof SDKError?error.diagnostic:{code:'SDK_REQUEST_FAILED'};
 function watch(){watcher?.close();try{watcher=fs.watch(root,{recursive:true},()=>{changed=true;});}catch{watcher=null;}}watch();
 function client(id='default'){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))fail('SDK_CLIENT_INVALID');
  if(!clients.has(id)){if(clients.size>=64)fail('SDK_CLIENT_LIMIT');clients.set(id,{id,index:null,previous:new Map(),seen:Date.now()});}
  const value=clients.get(id);value.seen=Date.now();return value;
 }
 function viewerIndex(value=0){if(!Number.isInteger(value)||value< -1||value>=session.position.playerCount)fail('SDK_VIEWER_INVALID');return value;}
 async function base(viewer,index=null){
  const key=String(session.position.revision)+':'+viewer+':'+index;
  if(!cache.has(key)){if(cache.size>96)cache.clear();const pending=session.view(viewer,index);cache.set(key,pending);try{return await pending;}catch(error){cache.delete(key);throw error;}}
  return cache.get(key);
 }
 async function frame(viewer,c,extra={},animate=false){
  const value=await base(viewer,c.index),count=session.frames.length,index=c.index??count-1;
  const identity=session.project.hash+':'+viewer,current={sessionId:identity,authorityEpoch:0,revision:value.projection.revision||0,state:{scene:value.scene,turn:value.projection.turn},events:value.projection.events};
  const before=c.previous.get(viewer),transition=animate&&before?Transition.eventAction(before,current):null;
  const plan=transition?Plans.compile({id:'sdk:'+ ++planIndex,items:value.events.filter((_,i)=>transition.events.some(e=>e.id===value.projection.events[i]?.id)).map((e,i)=>({...e,id:'sdk-event-'+i,ids:typeof e.sound?.id==='string'?[e.sound.id]:[],duration:0})),initial:before.state.scene,final:value.scene}):null;
  c.previous.set(viewer,current);
  const options=JSON.parse(session.initial),now=c.index===null?session.now:session.frames.get(c.index)?.position.clock??0;
  return {...value,...extra,metadata,resources:publicResources(session.project),catalogs:session.project.catalogs,pack:{id:session.project.manifest.id,name:session.project.manifest.name,version:session.project.manifest.version,hash:session.project.hash,settings:session.project.manifest.settings||[],minPlayers:modelInfo.properties.minPlayers,maxPlayers:modelInfo.properties.maxPlayers},options,viewer,now,changed,capabilities:{author:true,canConfigure:true,canChooseViewer:true,canDebug:true},history:{index,count,reviewing:c.index!==null},preview:c.index===null?[...preview.values()].map(v=>({operation:v.operation,roundId:v.roundId})):[],plan};
 }
 function streamWrite(connection,value){if(connection.res.destroyed)return;try{if(!connection.res.write(JSON.stringify(value)+'\n')){streams.delete(connection);connection.res.end();}}catch{streams.delete(connection);connection.res.destroy();}}
 async function broadcast(skip=null){
  for(const connection of [...streams]){
   if(connection.client.id===skip||connection.res.destroyed)continue;
   try{streamWrite(connection,await frame(connection.viewer,connection.client));}catch(error){streamWrite(connection,{error:diagnostic(error)});}
  }
 }
 async function flushPreviews(force=false){
  const current=await base(session.position.turn,null),deadline=current.scene.clock?.deadline??Infinity;
  for(const [id,value]of [...preview]){
   if(!force&&Date.now()<deadline&&Date.now()-value.received<1000)continue;
   preview.delete(id);
   try{await session.apply(value.actor,{...value.command,operation:value.operation});cache.clear();}catch{/* Invalidated/expired previews never become authority facts. */}
  }
 }
 async function advance(){
  const before=session.position.revision;await flushPreviews();if(definitionInfo.methods.includes('advance'))await session.advance(Date.now());else session.now=Date.now();
  if(session.position.revision!==before){cache.clear();const publicFrame=await base(-1,null);for(const [id,p]of preview)if(p.roundId!==publicFrame.scene.canvas?.id)preview.delete(id);return true;}return false;
 }
 const staticFiles={'/':'index.html','/studio.js':'studio.js','/studio.css':'studio.css','/sdk-scene.css':'../../platform/web/sdk-scene.css','/vector-art.js':'../../core/vector-art.js','/component-assets.js':'../../core/component-assets.js','/game-components.js':'../../core/game-components.js','/mini-split-deck.js':'../../core/mini-split-deck.js','/game-components.css':'../../core/game-components.css','/icons.js':'../../core/icons.js','/sdk-canvas.js':'../../platform/web/sdk-canvas.js','/sdk-scene.js':'../../platform/web/sdk-scene.js','/themes/light.json':'../../themes/light.json','/themes/dark.json':'../../themes/dark.json','/standard-sounds.js':'../../core/standard-sounds.js','/audio.js':'../../core/audio.js','/plan-player.js':'../../presentation/plan-player.js','/scheduler.js':'../../presentation/scheduler.js'};
 const server=http.createServer((req,res)=>{
  const respond=(status,value,mime='application/json')=>{if(res.destroyed)return;res.writeHead(status,{...security,'Content-Type':mime});res.end(mime==='application/json'?JSON.stringify(value):value);};
  let url;try{url=new URL(req.url,serverOrigin);}catch{return respond(400,{code:'SDK_REQUEST_INVALID'});}
  if(req.headers.host!==new URL(serverOrigin).host||url.origin!==serverOrigin||(req.headers.origin&&req.headers.origin!==serverOrigin))return respond(403,{code:'SDK_ORIGIN_DENIED'});
  if(req.method==='GET'&&Object.hasOwn(staticFiles,url.pathname)){
   try{const name=staticFiles[url.pathname],text=fs.readFileSync(path.join(__dirname,'studio',name),'utf8').replace('{{TOKEN}}',token);return respond(200,text,name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');}catch{return respond(404,{code:'SDK_STATIC_MISSING'});}
  }
  if(req.headers['x-playroom-sdk']!==token)return respond(403,{code:'SDK_TOKEN_REQUIRED'});
  if(req.method==='GET'&&url.pathname==='/api/changed')return respond(200,{changed,watching:!!watcher});
  if(req.method==='GET'&&url.pathname==='/api/stream'){
   queue=queue.then(async()=>{try{if(streams.size>=32)fail('SDK_CONNECTION_LIMIT');const c=client(url.searchParams.get('client')||'default'),viewer=viewerIndex(Number(url.searchParams.get('viewer')??0));res.writeHead(200,{...security,'Content-Type':'application/x-ndjson; charset=utf-8'});const connection={res,client:c,viewer};streams.add(connection);res.on('close',()=>streams.delete(connection));streamWrite(connection,await frame(viewer,c));}catch(error){if(!res.headersSent)respond(400,diagnostic(error));else res.end();}});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/asset'){
   try{const name=url.searchParams.get('file'),asset=session.project.resourceAssets.find(asset=>asset.file===name),file=session.project.resourcePaths[name];if(!asset||!file)fail('SDK_ASSET_PATH');if(fs.statSync(file).size>LIMITS.fileBytes)fail('SDK_FILE_LIMIT');const data=fs.readFileSync(file),info=validateAsset(data,name);if(info.sha256!==asset.sha256)fail('SDK_ASSET_CHANGED');return respond(200,data,info.mime);}catch(error){return respond(400,error.diagnostic||{code:'SDK_ASSET_FAILED'});}
  }
  if(req.method!=='POST'||url.pathname!=='/api')return respond(404,{code:'SDK_ROUTE_UNKNOWN'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return respond(415,{code:'SDK_CONTENT_TYPE'});
  let bytes=0,body='',oversize=false;
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>LIMITS.messageBytes){oversize=true;respond(413,{code:'SDK_MESSAGE_LIMIT'});req.destroy();}else body+=chunk;});
  req.on('end',()=>{if(oversize)return;queue=queue.then(async()=>{
   try{
    let request;try{request=JSON.parse(body);}catch{fail('SDK_JSON_INVALID');}
    const c=client(request.client||'default'),viewer=viewerIndex(request.viewer??0),previousIndex=c.index??session.frames.length-1;
    const readOnly=['view','seek','check','assets','debug','checkpoint'];
    if(c.index!==null&&!readOnly.includes(request.op)&&!['start','restore','reload'].includes(request.op))fail('SDK_HISTORY_READ_ONLY');
    if(c.index===null)await advance();
    let extra={},mutated=false;
    switch(request.op){
     case 'view':break;
     case 'start':await session.start({...request.options,now:Date.now()});for(const item of clients.values()){item.index=null;item.previous.clear();}preview.clear();cache.clear();mutated=true;break;
     case 'apply':await session.apply(viewer,request.command);if(request.command?.operation?.id)preview.delete(request.command.operation.id);cache.clear();mutated=true;break;
     case 'preview':{
      const value=await base(viewer,null),canvas=value.scene.canvas;
      if(!canvas?.enabled||!canvas.command||canvas.id===undefined)fail('SDK_DRAW_DENIED');
      const input={...request.command,operation:request.operation},choices=await session.rules.call('inputChoices',session.position,viewer);
      if(JSON.stringify(request.command)!==JSON.stringify(canvas.command)||!Inputs.resolve(choices,input))fail('SDK_DRAW_DENIED');
      if(!preview.has(input.operation.id)&&preview.size>=32)fail('SDK_PREVIEW_LIMIT');
      const entry={operation:input.operation,command:request.command,roundId:canvas.id,actor:viewer,received:Date.now()};preview.set(input.operation.id,entry);
      for(const connection of streams)if(connection.client.index===null&&!connection.res.destroyed)streamWrite(connection,{preview:[{operation:entry.operation,roundId:entry.roundId}],now:session.now});
      return respond(200,{status:'previewed',now:session.now});
     }
     case 'bot':await session.bot();cache.clear();mutated=true;break;
     case 'seek':if(request.index!==null&&(!Number.isInteger(request.index)||request.index<0||request.index>=session.frames.length))fail('SDK_HISTORY_INDEX');c.index=request.index;break;
     case 'check':extra.check=check(root,{shared});break;
     case 'assets':extra.assets=session.project.resourceAudit;break;
     case 'debug':extra.debug={warning:'Authoritative state: private local debugging only. Never share this export.',position:c.index===null?session.position:session.frames.get(c.index).position};break;
     case 'checkpoint':await flushPreviews(true);cache.clear();extra.checkpoint=await session.checkpoint(c.index);break;
     case 'restore':await session.restore(request.checkpoint);for(const item of clients.values()){item.index=null;item.previous.clear();}cache.clear();preview.clear();mutated=true;break;
     case 'reload':{const replacement=await StudioSession.open(root,{shared});try{await replacement.start({now:Date.now()});}catch(error){replacement.close();throw error;}session.close();session=replacement;metadata=await session.metadata();modelInfo=await session.rules.call('modelInfo');definitionInfo=await session.rules.call('definitionInfo');for(const item of clients.values()){item.index=null;item.previous.clear();}cache.clear();preview.clear();changed=false;mutated=true;break;}
     default:fail('SDK_OPERATION_UNKNOWN');
    }
    const animated=request.op==='apply'||request.op==='bot'||request.op==='seek'&&request.index!==null&&request.index===previousIndex+1;
    respond(200,await frame(Math.min(viewer,session.position.playerCount-1),c,extra,animated));
    if(mutated)await broadcast(c.id);
   }catch(error){respond(400,diagnostic(error));}
  });});
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{serverOrigin='http://127.0.0.1:'+server.address().port;resolve();});});
 const timer=setInterval(()=>{if(ticking||closed||!definitionInfo.methods.includes('advance')&&!preview.size)return;ticking=true;queue=queue.then(async()=>{try{if(await advance())await broadcast();}catch(error){for(const s of streams)if(!s.res.destroyed)streamWrite(s,{error:diagnostic(error)});}finally{ticking=false;}});},200);timer.unref();
 return {url:serverOrigin,token,server,close:async()=>{closed=true;clearInterval(timer);watcher?.close();for(const s of streams)s.res.end();streams.clear();session.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={serve};

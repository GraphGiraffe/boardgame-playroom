'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {StudioSession}=require('./runtime.cjs');
const {LIMITS,SDKError,fail,publicResources}=require('./project.cjs');
const {check}=require('./check.cjs');
const {validateAsset}=require('./assets.cjs');
const Inputs=require('../core/model-inputs.js');
const Transition=require('../presentation/transition.js');
const STREAM_BUFFER_LIMIT=8*1024*1024;
async function serve(directory,{shared,port=0}={}){
 let session=await StudioSession.open(directory,{shared});
 let changed=false,serverOrigin,queue=Promise.resolve(),closed=false,ticking=false,sessionEpoch=0;
 const sessionScope=crypto.randomUUID(),viewCacheLimit=96;
 const token=crypto.randomBytes(32).toString('hex'),root=session.project.root,clients=new Map(),streams=new Set(),preview=new Map(),cache=new Map();
 const packData=async current=>({
  staticFrame:{metadata:await current.metadata(),resources:publicResources(current.project),catalogs:current.project.catalogs},
  modelInfo:await current.rules.call('modelInfo'),definitionInfo:await current.rules.call('definitionInfo')
 });
 let staticFrame,modelInfo,definitionInfo;
 try{await session.start({now:Date.now()});({staticFrame,modelInfo,definitionInfo}=await packData(session));}
 catch(error){session.close();throw error;}
 const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-src 'self'; frame-ancestors 'none'; form-action 'none'"};
 const diagnostic=error=>error instanceof SDKError?error.diagnostic:{code:'SDK_REQUEST_FAILED'};
 // Studio reloads from both authoring roots. Report full watch coverage only
 // when this host can observe every root supplied to the project loader.
 const roots=new Set([root,...(shared?[path.resolve(shared)]:[])]);
 const watchers=[];
 for(const source of roots){
  try{watchers.push(fs.watch(source,{recursive:true},()=>{changed=true;}));}
  catch{/* Manual reload remains available on filesystems without watches. */}
 }
 function client(id='default'){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))fail('SDK_CLIENT_INVALID');
  if(!clients.has(id)){if(clients.size>=64)fail('SDK_CLIENT_LIMIT');clients.set(id,{id,index:null,previous:new Map(),seen:Date.now()});}
  const value=clients.get(id);value.seen=Date.now();return value;
 }
 function viewerIndex(value=0){if(!Number.isInteger(value)||value< -1||value>=session.position.playerCount)fail('SDK_VIEWER_INVALID');return value;}
 async function base(viewer,index=null,sharedCatalog=true){
  // Live play and history can select the same committed journal frame.
  // The projection belongs to that frame and viewer, not to the current head.
  const selected=index??session.frames.length-1,key=selected+':'+viewer+':'+sharedCatalog;
  const cached=cache.get(key);
  if(cached){
   cache.delete(key);
   cache.set(key,cached);
   return cached;
  }
  if(cache.size>=viewCacheLimit)cache.delete(cache.keys().next().value);
  const pending=session.view(viewer,index,{sharedCatalog});
  cache.set(key,pending);
  try{return await pending;}catch(error){if(cache.get(key)===pending)cache.delete(key);throw error;}
 }
 async function frame(viewer,c,extra={},animate=false,knownPackHash){
  const value=await base(viewer,c.index,knownPackHash!=null),count=session.frames.length,index=c.index??count-1;
  const sessionId=sessionScope+':'+sessionEpoch;
  const identity=sessionId+':'+viewer,current={sessionId:identity,authorityEpoch:0,revision:value.projection.revision||0,state:{scene:value.scene,turn:value.projection.turn},events:value.events};
  const before=c.previous.get(viewer),transition=animate&&before?Transition.eventAction(before,current):null;
  c.previous.set(viewer,current);
  const options=JSON.parse(session.initial),now=c.index===null?session.now:session.frames.get(c.index)?.position.clock??0;
  // The native viewer compiles the common plan against its mounted geometry.
  // Send only the projected facts and the already selected motion trigger.
  const motion=transition?{actor:transition.actor,action:transition.action}:null;
  // An exact hash is an explicit acknowledgement of pack-wide static data.
  // Send a complete envelope on first load, reload or for standalone callers.
  const shared=knownPackHash===session.project.hash?{}:staticFrame;
  return {...value,...extra,...shared,locale:session.project.locale,pack:{id:session.project.manifest.id,defaultLanguage:session.project.manifest.defaultLanguage||'ru',name:session.project.manifest.name,version:session.project.manifest.version,hash:session.project.hash,settings:session.project.configuration.settings,presetSetting:session.project.configuration.presetSetting,capabilities:session.project.manifest.capabilities||{},skinFamilies:session.project.manifest.skinFamilies||[],minPlayers:modelInfo.properties.minPlayers,maxPlayers:modelInfo.properties.maxPlayers},options,viewer,now,changed,sessionId,sessionEpoch,capabilities:{author:true,canConfigure:true,canChooseViewer:true,canDebug:true},history:{index,count,reviewing:c.index!==null},preview:c.index===null?[...preview.values()].map(v=>({operation:v.operation,roundId:v.roundId})):[],motion};
 }
 function streamWrite(connection,value){
  if(connection.res.destroyed)return;
  try{
   const line=JSON.stringify(value)+'\n';
   // A write crossing Node's high-water mark is still queued. Keep normal
   // large frames connected and bound a stalled client's accumulated bytes.
   if(connection.res.writableLength+Buffer.byteLength(line)>STREAM_BUFFER_LIMIT){streams.delete(connection);connection.res.end();return;}
   connection.res.write(line);
  }catch{streams.delete(connection);connection.res.destroy();}
 }
 async function broadcast({skip=null,only=null}={}){
  for(const connection of [...streams]){
   const id=connection.client.id;
   if(id===skip||only!==null&&id!==only||connection.res.destroyed)continue;
   connection.viewer=Math.min(connection.viewer,session.position.playerCount-1);
   try{streamWrite(connection,await frame(connection.viewer,connection.client,{},connection.client.index===null,connection.knownPackHash));}catch(error){streamWrite(connection,{error:diagnostic(error)});}
  }
 }
 async function flushPreviews(){
  const current=await base(session.position.turn,null),deadline=current.scene.clock?.deadline??Infinity;
  for(const [id,value]of [...preview]){
   if(Date.now()<deadline){if(Date.now()-value.received>30000)preview.delete(id);continue;}
   preview.delete(id);
   try{await session.apply(value.actor,{...value.command,operation:value.operation});}catch{/* Invalidated/expired previews never become authority facts. */}
  }
 }
 async function advance(){
  const before=session.position.revision;
  if(preview.size)await flushPreviews();
  if(definitionInfo.methods.includes('advance'))await session.advance(Date.now());else session.now=Date.now();
  if(session.position.revision===before)return false;
  if(preview.size){
   const publicFrame=await base(-1,null);
   for(const [id,p]of preview)if(p.roundId!==publicFrame.scene.canvas?.id)preview.delete(id);
  }
  return true;
 }
 const staticFiles={'/protocol.js':'../../core/protocol.js','/author.js':'author.js','/studio.js':'studio.js','/studio.css':'studio.css','/sdk-scene.css':'../../platform/web/sdk-scene.css','/vector-art.js':'../../core/vector-art.js','/token-layout.js':'../../core/token-layout.js','/component-assets.js':'../../core/component-assets.js','/game-components.js':'../../core/game-components.js','/mini-split-deck.js':'../../core/mini-split-deck.js','/color-value-deck.js':'../../core/color-value-deck.js','/view-kit.css':'../../core/view-kit.css','/game-components.css':'../../core/game-components.css','/elemental-arena.js':'../../core/elemental-arena.js','/elemental-arena.css':'../../core/elemental-arena.css','/solitaire-board.js':'../../core/solitaire-board.js','/solitaire-board.css':'../../core/solitaire-board.css','/input.css':'../../core/input.css','/input.js':'../../core/input.js','/messages.js':'../../core/messages.js','/localization.js':'../../presentation/localization.js','/player-target.js':'../../core/player-target.js','/player-target.css':'../../core/player-target.css','/icons.js':'../../core/icons.js','/player-palette.js':'../../core/player-palette.js','/notices.css':'../../platform/web/notices.css','/progress-surface.js':'../../platform/web/progress-surface.js','/expandable-notice.js':'../../platform/web/expandable-notice.js','/sdk-canvas.js':'../../platform/web/sdk-canvas.js','/scene-images.js':'../../platform/web/scene-images.js','/sdk-scene.js':'../../platform/web/sdk-scene.js','/themes/light.json':'../../themes/light.json','/themes/dark.json':'../../themes/dark.json','/standard-sounds.js':'../../core/standard-sounds.js','/audio.js':'../../core/audio.js','/plan-player.js':'../../presentation/plan-player.js','/scheduler.js':'../../presentation/scheduler.js'};
 // Serve only the checked-in viewer dependencies, never project source paths.
 const appRoot=path.resolve(__dirname,'..'),viewerScripts=[
  'core/messages.js','core/protocol.js','core/size-tokens.js','platform/web/element-sizes.js','platform/web/interface-scale.js',
  'core/icons.js','core/vector-art.js','core/component-assets.js','core/game-components.js','core/token-layout.js',
  'core/character-styles.js','core/avatars.js','core/player-palette.js','core/mini-split-deck.js','core/color-value-deck.js','core/rank-cards.js',
  'core/solitaire-board.js','core/elemental-arena.js','core/ui.js','app/views.js','presentation/layout-policy.js',
  'application/history-controller.js','application/game-screen-controller.js','application/player-settings.js','platform/web/dom.js','app/game-screen.js','core/packs.js',
  'core/player-target.js','core/input.js','core/tooltips.js','core/motion.js','presentation/plan-player.js','presentation/scheduler.js',
  'presentation/transition.js','presentation/network-projection.js','core/game-flow.js',
  'presentation/event-plan.js','platform/web/action-reveal.js','app/game-feedback.js',
  'platform/web/progress-surface.js','platform/web/expandable-notice.js','platform/web/sdk-canvas.js','platform/web/scene-images.js','platform/web/sdk-scene.js',
  'app/appearance-web.js','app/game-menu.js','app/rulebook-view.js','sdk/native-view.js'
 ];
 const viewerStyles=[...fs.readFileSync(path.join(appRoot,'index.html'),'utf8').matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match=>match[1]);
 for(const file of [...viewerScripts,...viewerStyles]){
  if(!/^(app|core|platform\/web|presentation|application|sdk)\/[a-z0-9/-]+\.(?:js|css)$/.test(file))fail('SDK_VIEWER_RESOURCE');
  staticFiles['/viewer/'+file]='../../'+file;
 }
 const viewerHTML='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayRoom game view</title>'+viewerStyles.map(file=>'<link rel="stylesheet" href="/viewer/'+file+'">').join('')+viewerScripts.map(file=>'<script defer src="/viewer/'+file+'"></script>').join('')+'</head><body><div id="app"></div><div id="modal-root"></div></body></html>';
 const server=http.createServer((req,res)=>{
  const respond=(status,value,mime='application/json')=>{if(res.destroyed)return;res.writeHead(status,{...security,'Content-Type':mime});res.end(mime==='application/json'?JSON.stringify(value):value);};
  let url;try{url=new URL(req.url,serverOrigin);}catch{return respond(400,{code:'SDK_REQUEST_INVALID'});}
  if(req.headers.host!==new URL(serverOrigin).host||url.origin!==serverOrigin||(req.headers.origin&&req.headers.origin!==serverOrigin))return respond(403,{code:'SDK_ORIGIN_DENIED'});
  if(req.method==='GET'&&url.pathname==='/viewer.html'){
   // Only this fixed, same-origin component document may be framed by the studio.
   res.writeHead(200,{...security,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':security['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'")});res.end(viewerHTML);return;
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/studio')){
   const author=url.pathname==='/studio',dir=path.join(__dirname,'studio');
   const panel=author?fs.readFileSync(path.join(dir,'author.html'),'utf8'):'';
   const toolbar=author?'<label>Экран <select id="viewport-size" aria-label="Размер экрана"></select></label><button id="studio-tools" aria-controls="author-panel" aria-expanded="false">Инструменты</button><button id="viewport-fullscreen">Только игра</button>':'';
   const shell=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace('{{TOKEN}}',token).replace('{{STUDIO_CLASS}}',author?' sdk-author':'').replace('{{STUDIO_TOOLBAR}}',toolbar).replace('{{STUDIO_PANEL}}',panel).replace('{{STUDIO_SCRIPT}}',author?'<script defer src="/author.js"></script>':'');
   return respond(200,shell,'text/html; charset=utf-8');
  }
  if(req.method==='GET'&&Object.hasOwn(staticFiles,url.pathname)){
   try{const name=staticFiles[url.pathname],text=fs.readFileSync(path.join(__dirname,'studio',name),'utf8').replace('{{TOKEN}}',token);return respond(200,text,name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');}catch{return respond(404,{code:'SDK_STATIC_MISSING'});}
  }
  if(req.headers['x-playroom-sdk']!==token)return respond(403,{code:'SDK_TOKEN_REQUIRED'});
  if(req.method==='GET'&&url.pathname==='/api/changed')return respond(200,{changed,watching:watchers.length===roots.size});
  if(req.method==='GET'&&url.pathname==='/api/stream'){
   queue=queue.then(async()=>{try{if(streams.size>=32)fail('SDK_CONNECTION_LIMIT');const c=client(url.searchParams.get('client')||'default'),viewer=viewerIndex(Number(url.searchParams.get('viewer')??0));res.writeHead(200,{...security,'Content-Type':'application/x-ndjson; charset=utf-8'});const connection={res,client:c,viewer,knownPackHash:url.searchParams.get('knownPackHash')};streams.add(connection);res.on('close',()=>streams.delete(connection));streamWrite(connection,await frame(viewer,c,{},false,connection.knownPackHash));}catch(error){if(!res.headersSent)respond(400,diagnostic(error));else res.end();}});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/asset'){
   try{const name=url.searchParams.get('file'),asset=session.project.resourceAssets.find(asset=>asset.file===name),file=session.project.resourcePaths[name];if(!asset||!file)fail('SDK_ASSET_PATH');if(fs.statSync(file).size>LIMITS.fileBytes)fail('SDK_FILE_LIMIT');const data=fs.readFileSync(file),info=validateAsset(data,name);if(info.sha256!==asset.sha256)fail('SDK_ASSET_CHANGED');return respond(200,data,info.mime);}catch(error){return respond(400,error.diagnostic||{code:'SDK_ASSET_FAILED'});}
  }
  if(req.method!=='POST'||url.pathname!=='/api')return respond(404,{code:'SDK_ROUTE_UNKNOWN'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return respond(415,{code:'SDK_CONTENT_TYPE'});
  let bytes=0,body='',oversize=false;
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>LIMITS.messageBytes){oversize=true;respond(413,{code:'SDK_MESSAGE_LIMIT'});req.destroy();}else body+=chunk;});
  req.on('end',()=>{if(oversize)return;queue=queue.then(async()=>{
   let deadlineClient=null,mutated=false;
   try{
    let request;try{request=JSON.parse(body);}catch{fail('SDK_JSON_INVALID');}
    const c=client(request.client||'default'),viewer=viewerIndex(request.viewer??0),previousIndex=c.index??session.frames.length-1;
    const readOnly=['view','seek','check','assets','debug','checkpoint'];
    if(c.index!==null&&!readOnly.includes(request.op)&&!['start','restore','reload'].includes(request.op))fail('SDK_HISTORY_READ_ONLY');
    if(c.index===null&&await advance()){
     deadlineClient=c.id;
     // The clock already committed. Publish its frame before handling the
     // command so observers receive the two transitions in journal order.
     await broadcast({skip:deadlineClient});
    }
    let extra={};
    switch(request.op){
     case 'view':break;
     case 'start':await session.start({...request.options,now:Date.now()});sessionEpoch++;for(const item of clients.values()){item.index=null;item.previous.clear();}preview.clear();cache.clear();mutated=true;break;
     case 'apply':await session.apply(viewer,request.command);if(request.command?.operation?.id)preview.delete(request.command.operation.id);mutated=true;break;
     case 'preview':{
      const value=await base(viewer,null),canvas=value.scene.canvas;
      if(!canvas?.enabled||!canvas.command||canvas.id===undefined)fail('SDK_DRAW_DENIED');
      const input={...request.command,operation:request.operation},choices=await session.rules.call('inputChoices',session.position,viewer);
      if(JSON.stringify(request.command)!==JSON.stringify(canvas.command)||!Inputs.resolve(choices,input))fail('SDK_DRAW_DENIED');
      if(!preview.has(input.operation.id)&&preview.size>=32)fail('SDK_PREVIEW_LIMIT');
      if(deadlineClient!==null)await broadcast({only:deadlineClient});
      const entry={operation:input.operation,command:request.command,roundId:canvas.id,actor:viewer,received:Date.now()};preview.set(input.operation.id,entry);
      for(const connection of streams)if(connection.client.index===null&&!connection.res.destroyed)streamWrite(connection,{preview:[{operation:entry.operation,roundId:entry.roundId}],now:session.now});
      return respond(200,{status:'previewed',now:session.now});
     }
     case 'bot':await session.bot();mutated=true;break;
     case 'seek':if(request.index!==null&&(!Number.isInteger(request.index)||request.index<0||request.index>=session.frames.length))fail('SDK_HISTORY_INDEX');c.index=request.index;break;
     case 'check':extra.check=check(root,{shared});break;
     case 'assets':extra.assets=session.project.resourceAudit;break;
     case 'debug':extra.debug={warning:'Authoritative state: private local debugging only. Never share this export.',position:c.index===null?session.position:session.frames.get(c.index).position};break;
     case 'checkpoint':extra.checkpoint=await session.checkpoint(c.index);break;
     case 'restore':await session.restore(request.checkpoint);sessionEpoch++;for(const item of clients.values()){item.index=null;item.previous.clear();}cache.clear();preview.clear();mutated=true;break;
     case 'reload':{
      const replacement=await StudioSession.open(root,{shared});
      let nextPack;
      try{await replacement.start({now:Date.now()});nextPack=await packData(replacement);}catch(error){replacement.close();throw error;}
      session.close();session=replacement;sessionEpoch++;
      ({staticFrame,modelInfo,definitionInfo}=nextPack);
      for(const item of clients.values()){item.index=null;item.previous.clear();}cache.clear();preview.clear();changed=false;mutated=true;break;}
     default:fail('SDK_OPERATION_UNKNOWN');
    }
    const animated=request.op==='apply'||request.op==='bot'||deadlineClient!==null&&c.index===null||request.op==='seek'&&request.index!==null&&request.index===previousIndex+1;
    respond(200,await frame(Math.min(viewer,session.position.playerCount-1),c,extra,animated,request.knownPackHash));
    if(mutated)await broadcast({skip:c.id});
   }catch(error){
    respond(400,diagnostic(error));
    // Error and preview responses carry no public frame for the requester.
    if(mutated)await broadcast();
    else if(deadlineClient!==null)await broadcast({only:deadlineClient});
   }
  });});
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{serverOrigin='http://127.0.0.1:'+server.address().port;resolve();});});
 const timer=setInterval(()=>{if(ticking||closed||!definitionInfo.methods.includes('advance')&&!preview.size)return;ticking=true;queue=queue.then(async()=>{try{if(await advance())await broadcast();}catch(error){for(const s of streams)if(!s.res.destroyed)streamWrite(s,{error:diagnostic(error)});}finally{ticking=false;}});},200);timer.unref();
 return {url:serverOrigin,token,server,close:async()=>{closed=true;clearInterval(timer);for(const watcher of watchers)watcher.close();for(const s of streams)s.res.end();streams.clear();session.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={serve};

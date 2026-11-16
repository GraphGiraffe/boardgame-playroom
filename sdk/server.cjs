'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {StudioSession}=require('./runtime.cjs');
const {LIMITS,SDKError,local,fail}=require('./project.cjs');
const {check}=require('./check.cjs');
const {auditAssets,validateAsset}=require('./assets.cjs');
const Transition=require('../presentation/transition.js');
const Plans=require('../presentation/event-plan.js');
async function serve(directory,{shared,port=0}={}){
 let session=await StudioSession.open(directory,{shared});try{await session.start();}catch(error){session.close();throw error;}
 let viewer=0,changed=false,watcher,serverOrigin,previousFrame=null,planIndex=0,queue=Promise.resolve();const token=crypto.randomBytes(32).toString('hex');
 const root=session.project.root;
 function watch(){watcher?.close();try{watcher=fs.watch(root,{recursive:true},()=>{changed=true;});}catch{watcher=null;}}
 watch();
 const staticFiles={'/':'index.html','/studio.js':'studio.js','/studio.css':'studio.css','/standard-sounds.js':'../../core/standard-sounds.js','/audio.js':'../../core/audio.js','/plan-player.js':'../../presentation/plan-player.js','/scheduler.js':'../../presentation/scheduler.js'};
 const server=http.createServer((req,res)=>{
  const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  const respond=(status,value,mime='application/json')=>{res.writeHead(status,{...security,'Content-Type':mime});res.end(mime==='application/json'?JSON.stringify(value):value);};
  let url;try{url=new URL(req.url,serverOrigin);}catch{return respond(400,{code:'SDK_REQUEST_INVALID'});}
  if(req.headers.host!==new URL(serverOrigin).host||url.origin!==serverOrigin||(req.headers.origin&&req.headers.origin!==serverOrigin))return respond(403,{code:'SDK_ORIGIN_DENIED'});
  if(req.method==='GET'&&Object.hasOwn(staticFiles,url.pathname)){
   const name=staticFiles[url.pathname],text=fs.readFileSync(path.join(__dirname,'studio',name),'utf8').replace('{{TOKEN}}',token);
   return respond(200,text,name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');
  }
  if(req.headers['x-playroom-sdk']!==token)return respond(403,{code:'SDK_TOKEN_REQUIRED'});
  if(req.method==='GET'&&url.pathname==='/api/changed')return respond(200,{changed,watching:!!watcher});
  if(req.method==='GET'&&url.pathname==='/api/asset'){
   try{const name=url.searchParams.get('file');if(!name?.startsWith('assets/'))fail('SDK_ASSET_PATH');const file=local(root,name);if(fs.statSync(file).size>LIMITS.fileBytes)fail('SDK_FILE_LIMIT');const data=fs.readFileSync(file),info=validateAsset(data,name);return respond(200,data,info.mime);}catch(error){return respond(400,error.diagnostic||{code:'SDK_ASSET_FAILED'});}
  }
  if(req.method!=='POST'||url.pathname!=='/api')return respond(404,{code:'SDK_ROUTE_UNKNOWN'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return respond(415,{code:'SDK_CONTENT_TYPE'});
  let bytes=0,body='',oversize=false;
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>LIMITS.messageBytes){oversize=true;respond(413,{code:'SDK_MESSAGE_LIMIT'});req.destroy();}else body+=chunk;});
  req.on('end',()=>{
   if(oversize)return;
   queue=queue.then(async()=>{
    try{
     let request;try{request=JSON.parse(body);}catch{fail('SDK_JSON_INVALID');}
     const previousHistory=session.historyInfo();let extra={};
     switch(request.op){
      case 'view':if(request.viewer!==undefined)viewer=request.viewer;break;
      case 'start':await session.start(request.options||{});viewer=Math.min(viewer,session.position.playerCount-1);break;
      case 'apply':await session.apply(viewer,request.command);break;
      case 'bot':await session.bot();break;
      case 'seek':session.seek(request.index);break;
      case 'check':extra.check=check(root,{shared});break;
      case 'assets':extra.assets=auditAssets(root);break;
      case 'debug':extra.debug={warning:'Authoritative state: private local debugging only. Never share this export.',position:session.currentFrame().position};break;
      case 'checkpoint':extra.checkpoint=await session.checkpoint();break;
      case 'restore':await session.restore(request.checkpoint);viewer=Math.min(viewer,session.position.playerCount-1);break;
      case 'reload':{const replacement=await StudioSession.open(root,{shared});try{await replacement.start();}catch(error){replacement.close();throw error;}session.close();session=replacement;viewer=0;changed=false;break;}
      default:fail('SDK_OPERATION_UNKNOWN');
     }
     const frame=await session.view(viewer),metadata=await session.metadata();
     const identity=session.project.hash+':'+viewer,current={sessionId:identity,authorityEpoch:0,revision:frame.projection.revision||0,state:{scene:frame.scene,turn:frame.projection.turn},events:frame.projection.events};
     const animated=request.op==='apply'||request.op==='bot'||request.op==='seek'&&request.index!==null&&request.index===previousHistory.index+1;
     const transition=animated?Transition.eventAction(previousFrame,current):null,plan=transition?Plans.compile({id:'sdk:'+ ++planIndex,items:frame.events.filter((_,index)=>transition.events.some(event=>event.id===frame.projection.events[index]?.id)).map((event,index)=>({...event,id:'sdk-event-'+index,ids:typeof event.sound?.id==='string'?[event.sound.id]:[],duration:0})),initial:previousFrame.state.scene,final:frame.scene}):null;
     previousFrame=current;
     respond(200,{...frame,...extra,metadata,catalogs:session.project.catalogs,pack:{id:session.project.manifest.id,version:session.project.manifest.version,hash:session.project.hash},viewer,changed,history:session.historyInfo(),plan});
    }catch(error){respond(400,error instanceof SDKError?error.diagnostic:{code:'SDK_REQUEST_FAILED'});}
   });
  });
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{serverOrigin='http://127.0.0.1:'+server.address().port;resolve();});});
 return {url:serverOrigin,token,server,close:async()=>{watcher?.close();session.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={serve};

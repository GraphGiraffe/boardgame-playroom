'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const Events=require('../core/events.js');
const {modelOptions}=require('../core/packs.js');
const Scenes=require('../presentation/scene-contract.js');
const {preloadImages}=require('../platform/web/scene-images.js');
const {FrameHistory}=require('./frame-history.cjs');
const {LIMITS,SDKError,fail,loadProject}=require('./project.cjs');
const MODEL_START_FIELDS=new Set(['playerCount','firstPlayer','rng','preset','openHands','options','now']);
function serialized(value){
 const seen=new Set();
 function visit(v,depth=0){
  if(depth>80)fail('SDK_DATA_DEPTH');
  if(v===null||typeof v==='boolean'||typeof v==='string')return;
  if(typeof v==='number'&&Number.isFinite(v))return;
  if(!v||typeof v!=='object'||seen.has(v)||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))))fail('SDK_JSON_INVALID');
  seen.add(v);for(const [key,item]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(key))fail('SDK_DATA_KEY_DENIED');visit(item,depth+1);}seen.delete(v);
 }
 visit(value);const result=JSON.stringify(value);if(Buffer.byteLength(result)>LIMITS.messageBytes)fail('SDK_MESSAGE_LIMIT');return result;
}
class Guest{
 constructor(project,role,onAssetMethods){
  this.role=role;this.pending=new Map();this.sequence=0;this.dead=false;
  // Each worker has its own interpreter. Asset bytes and the authoring
  // inventory stay with Studio; only presentation reads localized rulebooks.
  const presenting=role==='presentation';
  const payload={
   manifest:project.manifest,dependencies:project.dependencies,
   rules:role==='rules'?project.rules:[],
   presentation:presenting?project.presentation:[],helpers:presenting?project.helpers:[],
   support:presenting?project.support||[]:[],
   ...(presenting?{locale:project.locale,catalogs:project.catalogs,resourceClosure:{rulebooks:project.resourceClosure?.rulebooks}}:{}),
  };
  this.worker=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{role,project:payload,observeAssetMethods:presenting&&!!onAssetMethods},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  this.ready=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.abort(new SDKError('SDK_WALL_LIMIT',{role,phase:'load'})),LIMITS.wallMs);
   this.pending.set(0,{resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}});
  });
  this.worker.on('message',message=>{
   const id=message.ready||message.error&&!message.id?0:message.id,waiter=this.pending.get(id);if(!waiter)return;
   this.pending.delete(id);
   if(message.error)waiter.reject(new SDKError(message.error.code,message.error));
   else {
    const trace=message.assetTrace;
    if(trace&&(trace.methods.length||trace.printOverrides.length))onAssetMethods?.(trace.methods,trace.printOverrides);
    waiter.resolve(message.value);
   }
  });
  this.worker.on('error',()=>this.abort(new SDKError('SDK_WORKER_FAILED',{role})));
  this.worker.on('exit',()=>{if(!this.dead)this.abort(new SDKError('SDK_WORKER_EXITED',{role}));});
 }
 async call(method,...args){
  await this.ready;if(this.dead)fail('SDK_WORKER_CLOSED',{role:this.role});
  const value=serialized(args),id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.abort(new SDKError('SDK_WALL_LIMIT',{role:this.role,phase:method})),LIMITS.wallMs);
   this.pending.set(id,{resolve:value=>{clearTimeout(timer);try{resolve(JSON.parse(value));}catch{reject(new SDKError('SDK_RESPONSE_INVALID'));}},reject:error=>{clearTimeout(timer);reject(error);}});
   this.worker.postMessage({id,method,args:value});
  });
 }
 abort(error){if(this.dead)return;this.dead=true;for(const task of this.pending.values())task.reject(error);this.pending.clear();this.worker.terminate();}
 close(){this.abort(new SDKError('SDK_WORKER_CLOSED',{role:this.role}));}
}
function validateScene(value,projection){
 serialized(value);
 const s=value?.scene;
 if(!s||s.contractVersion!==1||typeof s.id!=='string'||typeof s.family!=='string'||!Array.isArray(s.players)||s.players.length!==projection.playerCount||!Array.isArray(value.actions)||!Array.isArray(value.events))fail('SDK_SCENE_INVALID');
 const ids=s.players.map(p=>p.player);if(new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<0||id>=projection.playerCount))fail('SDK_SCENE_PLAYER_INVALID');
 try{Scenes.validate(s,projection.playerCount);}catch(error){fail('SDK_SCENE_INVALID',{game:projection.game,contract:/^SCENE_[A-Z_]+$/.test(error.code||'')?error.code:'SCENE_INVALID'});}
 const identity=command=>JSON.stringify(command,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
 const allowed=new Set([...projection.actions,...(projection.inputs||[]).map(input=>input.command)].map(identity));
 for(const action of value.actions)if(!action||!allowed.has(identity(action.command)))fail('SDK_SCENE_COMMAND_DENIED',{game:projection.game});
 let count=0;
 function inspect(object){if(++count>20000)fail('SDK_SCENE_LIMIT');if(!object||typeof object!=='object')return;for(const item of Object.values(object))inspect(item);}
 inspect(s);
 const checkpoints=value.eventScenes===undefined?[]:value.eventScenes;
 try{Scenes.eventScenes(checkpoints,projection);}catch(error){fail('SDK_EVENT_SCENES_INVALID',{game:projection.game,contract:error.code||'EVENT_SCENES_INVALID'});}
 for(const frame of checkpoints)inspect(frame.scene);
 const eventFrames=new Map(checkpoints.map(frame=>[frame.eventId,frame.scene]));
 if(value.events.length!==projection.events.length)fail('SDK_SCENE_EVENTS_INVALID');
 value.events=value.events.map((event,index)=>{const source=projection.events[index];Scenes.event(event,projection.playerCount);const {scene:ignoredScene,...presented}=event;return {...presented,id:source.id,revision:source.revision,player:source.actor,kind:event.finish?'finish':event.kind||'action',...(eventFrames.has(source.id)?{scene:eventFrames.get(source.id)}:{})};});
 delete value.eventScenes;
 // Only controls in the closed renderer vocabulary can dispatch. Other scene
 // data may describe hypothetical moves for previews and rule illustrations.
 try{Scenes.commands(s,projection);}catch{fail('SDK_SCENE_COMMAND_DENIED',{game:projection.game});}
 // No host ever interprets HTML, CSS, URLs or code from a scene. They remain
 // data; only the closed renderer vocabulary can create DOM or play assets.
 return value;
}
class StudioSession{
 constructor(project,onAssetMethods){this.project=project;this.onAssetMethods=onAssetMethods;this.now=0;this.rules=new Guest(project,'rules');this.presentation=new Guest(project,'presentation',onAssetMethods);this.renderGuests=new Set();this.history=[];this.frames=new FrameHistory();this.historyIndex=null;this.position=null;this.events=[];}
 static async open(directory,options){const session=new StudioSession(loadProject(directory,options),options?.onAssetMethods);try{await Promise.all([session.rules.ready,session.presentation.ready]);return session;}catch(error){session.close();throw error;}}
 async start(options={}){
  const defaults=this.project.descriptor.options||{},now=options.now??defaults.now??0;
  const {settings,presetSetting}=this.project.configuration;
  const packOptions={...defaults.options,...options.options};
  const setup={playerCount:2,firstPlayer:0,rng:1,preset:presetSetting?.default??'classic',...defaults,...options,options:packOptions,now};
  // Installed rules expect authored game options in the nested model port.
  // Keep accepting flat selections from older studio CLI clients.
  for(const field of settings){
   const key=field.key,flat=!MODEL_START_FIELDS.has(key);
   const value=(flat?options[key]:undefined)??options.options?.[key]??defaults.options?.[key]??(flat?defaults[key]:undefined)??field.default??field.options?.[0]?.value;
   if(value!==undefined)packOptions[key]=value;
   if(flat)delete setup[key];
  }
  setup.options=modelOptions(this.project.manifest,this.project.configuration,packOptions);
  const initial=serialized(setup),result=await this.rules.call('start',setup);
  result.events=Events.append([],result.events,result.position.playerCount,result.position.revision);
  const frames=new FrameHistory();try{frames.push(serialized(result));}catch(error){frames.close();throw error;}
  this.frames.close();this.history=[];this.frames=frames;this.historyIndex=null;this.position=result.position;this.events=result.events;this.now=now;this.initial=initial;
  return this.position;
 }
 async view(viewer=-1,index=this.historyIndex,{sharedCatalog=false}={}){
  if(!this.position)fail('SDK_SESSION_REQUIRED');if(!Number.isInteger(viewer)||viewer< -1||viewer>=this.position.playerCount)fail('SDK_VIEWER_INVALID');
  const selected=index===null?{position:this.position,events:this.events}:this.frames.get(index);if(!selected)fail('SDK_HISTORY_INDEX');const projection=await this.rules.call('project',selected.position,viewer,selected.events);
  // Renderer module globals must never retain a prior viewer's private data.
  // The persistent worker owns static metadata and cached event replies. Each
  // scene and each event cache miss gets its own compartment.
  const guest=new Guest(this.project,'presentation',this.onAssetMethods);this.renderGuests.add(guest);
  try {
   const [authored,events,order,result]=await Promise.all([guest.call('render',projection,sharedCatalog?{sharedCatalog}:{}),
    this.formatEvents(projection.events),this.rules.call('turnOrder',projection),
    projection.status==='finished'?this.rules.call('result',selected.position):null]);
   authored.events=events;
   const rendered=validateScene(authored,projection);
   // Match the installed model adapter. The rules hook sees only this viewer's projection.
   const nextPlayer=order?.next??null;
   rendered.scene.nextPlayer=nextPlayer;
   for(const event of rendered.events)if(event.scene)event.scene.nextPlayer=nextPlayer;
   if(result){
    const metrics=await Promise.all(result.metrics.map(async metric=>({...metric,label:await guest.call('present','metric',metric.id)||metric.id})));
    return {projection,...rendered,result:{...result,metrics}};
   }
   return {projection,...rendered};
  }
  finally{this.renderGuests.delete(guest);guest.close();}
 }
 async formatEvents(events){
  const batchSize=32;
  if(!events.length)return [];
  if(events.length<=batchSize)return this.presentation.call('formatEvents',events);
  // Bound each worker message when a restored history starts with a cold cache.
  const formatted=[];
  for(let index=0;index<events.length;index+=batchSize){
   formatted.push(...await this.presentation.call('formatEvents',events.slice(index,index+batchSize)));
  }
  return formatted;
 }
 async apply(actor,command){if(this.historyIndex!==null)fail('SDK_HISTORY_READ_ONLY');if(!this.position)fail('SDK_SESSION_REQUIRED');const before=this.position;const result=await this.rules.call('apply',before,actor,command,{now:this.now});result.events=Events.append(this.events,result.events,result.position.playerCount,result.position.revision);this.appendFrame(result);this.position=result.position;this.events=result.events;this.history.push({actor,command:JSON.parse(serialized(command)),now:this.now});return this.position;}
 async advance(now){if(this.historyIndex!==null)fail('SDK_HISTORY_READ_ONLY');if(!Number.isSafeInteger(now)||now<this.now)fail('CLOCK_INVALID');this.now=now;for(let i=0;i<16;i++){const result=await this.rules.call('advance',this.position,now);if(result.position.revision===this.position.revision)return this.position;result.events=Events.append(this.events,result.events,result.position.playerCount,result.position.revision);this.appendFrame(result);this.position=result.position;this.events=result.events;}return this.position;}
 async bot(actor=this.position?.turn){if(this.project.manifest.capabilities?.bots===false)fail('SDK_BOTS_UNSUPPORTED');const command=await this.rules.call('botAction',this.position,actor,{enabled:false});if(command)await this.apply(actor,command);return command;}
 async checkpoint(index=this.historyIndex){if(!this.position)fail('SDK_SESSION_REQUIRED');const frame=index===null?{position:this.position,events:this.events}:this.frames.get(index);if(!frame)fail('SDK_HISTORY_INDEX');return {format:'playroom-sdk-checkpoint',contractVersion:1,packHash:this.project.hash,clock:index===null?this.now:frame.position.clock??0,position:JSON.parse(serialized(frame.position)),events:JSON.parse(serialized(frame.events))};}
 async restore(checkpoint){if(checkpoint?.format!=='playroom-sdk-checkpoint'||checkpoint.contractVersion!==1||checkpoint.packHash!==this.project.hash)fail('SDK_CHECKPOINT_INCOMPATIBLE');await this.rules.call('validate',checkpoint.position);if(!Array.isArray(checkpoint.events)||checkpoint.events.some((event,index)=>event.id!==index+1||!Number.isSafeInteger(event.revision)||event.revision<0||event.revision>checkpoint.position.revision))fail('SDK_CHECKPOINT_EVENTS_INVALID');await this.rules.call('project',checkpoint.position,-1,checkpoint.events);if(checkpoint.clock!==undefined&&(!Number.isSafeInteger(checkpoint.clock)||checkpoint.clock<(checkpoint.position.clock??0)))fail('CLOCK_INVALID');const position=JSON.parse(serialized(checkpoint.position)),events=JSON.parse(serialized(checkpoint.events)),frames=new FrameHistory();try{frames.push(serialized({position,events}));}catch(error){frames.close();throw error;}this.frames.close();this.frames=frames;this.now=checkpoint.clock??checkpoint.position.clock??0;this.position=position;this.events=events;this.history=[];this.historyIndex=null;return this.position;}
 appendFrame(frame){this.frames.push(serialized(frame));}
 currentFrame(){return this.historyIndex===null?{position:this.position,events:this.events}:this.frames.get(this.historyIndex);}
 seek(index=null){if(index!==null&&(!Number.isInteger(index)||index<0||index>=this.frames.length))fail('SDK_HISTORY_INDEX');this.historyIndex=index;}
 historyInfo(){return {index:this.historyIndex??this.frames.length-1,count:this.frames.length,reviewing:this.historyIndex!==null};}
 async metadata(){
  const metadata=await this.presentation.call('metadata');
  if(metadata.preloadImages===undefined)return metadata;
  try{return {...metadata,preloadImages:preloadImages(metadata.preloadImages,this.project.resourceAssets)};}
  catch{fail('PACK_PRELOAD_IMAGES_INVALID',{hint:'List declared image assets within the preload limit in metadata.preloadImages.'});}
 }
 close(){this.frames.close();this.rules.close();this.presentation.close();for(const guest of this.renderGuests)guest.close();this.renderGuests.clear();}
}
module.exports={Guest,StudioSession,serialized,validateScene};

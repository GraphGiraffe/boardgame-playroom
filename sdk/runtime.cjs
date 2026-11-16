'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const Events=require('../core/events.js');
const {LIMITS,SDKError,fail,loadProject}=require('./project.cjs');
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
 constructor(project,role){
  this.role=role;this.pending=new Map();this.sequence=0;this.dead=false;
  // Each worker has its own WASM module and interpreter memory.
  const payload={manifest:project.manifest,dependencies:project.dependencies,rules:role==='rules'?project.rules:[],presentation:role==='presentation'?project.presentation:[],helpers:role==='presentation'?project.helpers:[]};
  this.worker=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{role,project:payload},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  this.ready=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.abort(new SDKError('SDK_WALL_LIMIT',{role,phase:'load'})),LIMITS.wallMs);
   this.pending.set(0,{resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}});
  });
  this.worker.on('message',message=>{
   const id=message.ready||message.error&&!message.id?0:message.id,waiter=this.pending.get(id);if(!waiter)return;
   this.pending.delete(id);
   if(message.error)waiter.reject(new SDKError(message.error.code,message.error));else waiter.resolve(message.value);
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
 const identity=command=>JSON.stringify(command,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
 const allowed=new Set(projection.actions.map(identity));
 for(const action of value.actions)if(!allowed.has(identity(action.command)))fail('SDK_SCENE_COMMAND_DENIED',{game:projection.game});
 let count=0;
 function inspect(object){if(++count>20000)fail('SDK_SCENE_LIMIT');if(!object||typeof object!=='object')return;for(const item of Object.values(object))inspect(item);}
 inspect(s);
 // Only controls in the closed renderer vocabulary can dispatch. Other scene
 // data may describe hypothetical moves for previews and rule illustrations.
 const controls=[...(Array.isArray(s.cells)?s.cells:[]),...(Array.isArray(s.rows)?s.rows.flatMap(row=>row.cells||[]):[]),...(s.interactions||[])];
 for(const control of controls)if(control.command!==undefined&&control.command!==null&&!allowed.has(identity(control.command)))fail('SDK_SCENE_COMMAND_DENIED',{game:projection.game});
 // No host ever interprets HTML, CSS, URLs or code from a scene. They remain
 // data; only the closed renderer vocabulary can create DOM or play assets.
 return value;
}
class StudioSession{
 constructor(project){this.project=project;this.rules=new Guest(project,'rules');this.presentation=new Guest(project,'presentation');this.history=[];this.frames=[];this.frameBytes=0;this.historyIndex=null;this.position=null;this.events=[];}
 static async open(directory,options){const session=new StudioSession(loadProject(directory,options));try{await Promise.all([session.rules.ready,session.presentation.ready]);return session;}catch(error){session.close();throw error;}}
 async start(options={}){const defaults=this.project.descriptor.options||{};const result=await this.rules.call('start',{playerCount:2,firstPlayer:0,rng:1,preset:'classic',...defaults,...options});result.events=Events.append([],result.events,result.position.playerCount,result.position.revision);this.history=[];this.frames=[];this.frameBytes=0;this.historyIndex=null;this.appendFrame(result);this.position=result.position;this.events=result.events;this.initial=serialized({...defaults,...options});return this.position;}
 async view(viewer=-1){if(!this.position)fail('SDK_SESSION_REQUIRED');if(!Number.isInteger(viewer)||viewer< -1||viewer>=this.position.playerCount)fail('SDK_VIEWER_INVALID');const projection=await this.rules.call('project',this.currentFrame().position,viewer,this.currentFrame().events);const rendered=validateScene(await this.presentation.call('render',projection),projection);return {projection,...rendered};}
 async apply(actor,command){if(this.historyIndex!==null)fail('SDK_HISTORY_READ_ONLY');if(!this.position)fail('SDK_SESSION_REQUIRED');const before=this.position;const result=await this.rules.call('apply',before,actor,command);result.events=Events.append(this.events,result.events,result.position.playerCount,result.position.revision);this.appendFrame(result);this.position=result.position;this.events=result.events;this.history.push({actor,command:JSON.parse(serialized(command))});return this.position;}
 async bot(actor=this.position?.turn){const command=await this.rules.call('botAction',this.position,actor,{enabled:false});if(command)await this.apply(actor,command);return command;}
 async checkpoint(){if(!this.position)fail('SDK_SESSION_REQUIRED');return {format:'playroom-sdk-checkpoint',contractVersion:1,packHash:this.project.hash,position:JSON.parse(serialized(this.currentFrame().position)),events:JSON.parse(serialized(this.currentFrame().events))};}
 async restore(checkpoint){if(checkpoint?.format!=='playroom-sdk-checkpoint'||checkpoint.contractVersion!==1||checkpoint.packHash!==this.project.hash)fail('SDK_CHECKPOINT_INCOMPATIBLE');await this.rules.call('validate',checkpoint.position);if(!Array.isArray(checkpoint.events)||checkpoint.events.some((event,index)=>event.id!==index+1||!Number.isSafeInteger(event.revision)||event.revision<0||event.revision>checkpoint.position.revision))fail('SDK_CHECKPOINT_EVENTS_INVALID');await this.rules.call('project',checkpoint.position,-1,checkpoint.events);this.position=JSON.parse(serialized(checkpoint.position));this.events=JSON.parse(serialized(checkpoint.events));this.history=[];this.frames=[];this.frameBytes=0;this.historyIndex=null;this.appendFrame({position:this.position,events:this.events});return this.position;}
 appendFrame(frame){const encoded=serialized(frame);if(this.frames.length>=1000||this.frameBytes+Buffer.byteLength(encoded)>32*1024*1024)fail('SDK_HISTORY_LIMIT');this.frames.push(JSON.parse(encoded));this.frameBytes+=Buffer.byteLength(encoded);}
 currentFrame(){return this.historyIndex===null?{position:this.position,events:this.events}:this.frames[this.historyIndex];}
 seek(index=null){if(index!==null&&(!Number.isInteger(index)||index<0||index>=this.frames.length))fail('SDK_HISTORY_INDEX');this.historyIndex=index;}
 historyInfo(){return {index:this.historyIndex??this.frames.length-1,count:this.frames.length,reviewing:this.historyIndex!==null};}
 async metadata(){return this.presentation.call('metadata');}
 close(){this.rules.close();this.presentation.close();}
}
module.exports={Guest,StudioSession,serialized,validateScene};

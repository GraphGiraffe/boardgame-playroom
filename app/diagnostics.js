/* Opt-in, bounded, local performance recording. No transport or game authority. */
(function(root){
 'use strict';
 const LIMIT=5000,KEY='playroom.diagnostics.enabled.v1',now=()=>root.performance?.now?.()??Date.now();
 const clean=(value,depth=0)=>{
  if(depth>3)return null;if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?Math.round(value*1000)/1000:null;
  if(typeof value==='string')return value.slice(0,160);
  if(Array.isArray(value))return value.slice(0,8).map(v=>clean(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|secret|password|cookie|authorization|url|message|email|nickname)/i.test(key)).slice(0,40).map(([key,v])=>[key,clean(v,depth+1)]));return null;
 };
 class Recorder {
  constructor(){this.enabled=false;this.buffer=new Array(LIMIT);this.baseline=[];this.timerHandles=new Map();this.timerSequence=0;this.count=0;this.written=0;this.observers=[];this.listeners=[];this.context=()=>({});this.save=()=>null;this.startedAt=new Date().toISOString();this.frames=0;this.maxFrame=0;this.slowFrames=0;this.lastFrame=null;this.longTaskMs=0;this.lastSample=now();this.commonContext=null;this.commonSignature=null;this.raf=null;this.timer=null;}
  configure({context,save}={}){if(context)this.context=context;if(save)this.save=save;}
  record(kind,data={}){if(!this.enabled)return;const at=now();if(kind==='action'){data={...data,sincePreviousAction:this.lastActionAt==null?null:at-this.lastActionAt};this.lastActionAt=at;}const row={kind:String(kind).slice(0,80),at,...clean(data)};if(this.baseline.length<64)this.baseline.push(row);this.buffer[this.written%LIMIT]=row;this.written++;this.count=Math.min(LIMIT,this.count+1);}
  begin(){return this.enabled?now():null;}
  end(kind,start,data={}){if(start!==null&&this.enabled)this.record(kind,{...data,duration:now()-start});}
  measure(kind,operation,data={}){const start=this.begin();if(start===null)return operation();try{const value=operation();if(value?.then)return Promise.resolve(value).then(result=>{this.end(kind,start,{...data,status:'complete'});return result;},error=>{this.end(kind,start,{...data,status:'failed'});throw error;});this.end(kind,start,{...data,status:'complete'});return value;}catch(error){this.end(kind,start,{...data,status:'failed'});throw error;}}
  clock(scope){const recorder=this;return {now:()=>Date.now(),setTimeout(effect,delay){const start=recorder.begin(),ticket=++recorder.timerSequence;let id;id=root.setTimeout(()=>{recorder.timerHandles.delete(id);if(start!==null)recorder.record('timer.fire',{scope,id:ticket,delay,actualDelay:now()-start,late:Math.max(0,now()-start-delay)});effect();},delay);if(start!==null){recorder.timerHandles.set(id,{scope,ticket,start});recorder.record('timer.arm',{scope,id:ticket,delay});}return id;},clearTimeout(id){const entry=recorder.timerHandles.get(id);if(entry){recorder.record('timer.cancel',{scope:entry.scope,id:entry.ticket,elapsed:now()-entry.start});recorder.timerHandles.delete(id);}root.clearTimeout(id);}};}
  listen(type,listener){root.addEventListener?.(type,listener);this.listeners.push([type,listener]);}
  observe(type,callback,extra={}){
   if(!root.PerformanceObserver?.supportedEntryTypes?.includes(type))return;
   try{const observer=new root.PerformanceObserver(list=>{if(this.enabled)for(const entry of list.getEntries())callback(entry);});observer.observe({type,buffered:false,...extra});this.observers.push(observer);}catch(_){}
  }
  sample(){if(!this.enabled)return;const started=now(),elapsed=started-this.lastSample,doc=root.document,heap=root.performance?.memory;let context={};try{context=this.context()||{};}catch(_){}
   const common={},variable={...context};for(const key of ['appVersion','game','packVersion','gameCreatedAt','animationSpeed','soundEnabled','volume']){common[key]=variable[key]??null;delete variable[key];}
   const signature=JSON.stringify(common);if(signature!==this.commonSignature){this.commonSignature=signature;this.commonContext=clean(common);this.record('context.change',this.commonContext);}
   this.record('sample',{...variable,externalTimers:this.timerHandles.size,hidden:!!doc?.hidden,elapsed,timerLag:Math.max(0,elapsed-2000),frames:this.frames,maxFrame:this.maxFrame,slowFrames:this.slowFrames,longTaskMs:this.longTaskMs,
    domNodes:doc?.getElementsByTagName('*').length??null,animations:doc?.getAnimations?.().length??null,
    heapUsed:heap?.usedJSHeapSize??null,heapTotal:heap?.totalJSHeapSize??null,heapLimit:heap?.jsHeapSizeLimit??null});
   this.lastSample=started;this.frames=0;this.maxFrame=0;this.slowFrames=0;this.longTaskMs=0;this.end('collector.sample',started);
  }
  watchAnimations(){const proto=root.Element?.prototype,original=proto?.animate;if(!original)return;const recorder=this;let sequence=0;
   const wrapped=function(...args){const animation=original.apply(this,args);if(!recorder.enabled)return animation;const started=now(),id=++sequence,timing=animation.effect?.getTiming?.()||{};recorder.record('animation.start',{id,tag:this.tagName,duration:typeof timing.duration==='number'?timing.duration:null,delay:timing.delay,iterations:Number.isFinite(timing.iterations)?timing.iterations:null});
    if(Number.isFinite(timing.iterations))animation.finished.then(()=>recorder.end('animation.end',started,{id,status:'complete',playState:animation.playState}),()=>recorder.end('animation.end',started,{id,status:'cancelled',playState:animation.playState}));return animation;};
   try{proto.animate=wrapped;}catch(_){return;}this.restoreAnimations=()=>{if(proto.animate===wrapped)proto.animate=original;};
  }
  start(){if(this.enabled)return;this.enabled=true;this.lastSample=now();this.lastFrame=null;
   this.record('capture.start');this.watchAnimations();this.sample();
   this.observe('longtask',e=>{this.longTaskMs+=e.duration;this.record('longtask',{start:e.startTime,duration:e.duration});});
   this.observe('event',e=>this.record('interaction',{event:e.name,interactionId:e.interactionId,start:e.startTime,inputDelay:e.processingStart-e.startTime,processing:e.processingEnd-e.processingStart,duration:e.duration}),{durationThreshold:16});
   this.observe('long-animation-frame',e=>this.record('long-frame',{start:e.startTime,duration:e.duration,blocking:e.blockingDuration,renderStart:e.renderStart,styleAndLayoutStart:e.styleAndLayoutStart,scripts:[...(e.scripts||[])].sort((a,b)=>b.duration-a.duration).slice(0,5).map(s=>({duration:s.duration,layout:s.forcedStyleAndLayoutDuration,function:s.sourceFunctionName,line:s.sourceCharPosition,invokerType:s.invokerType,file:(()=>{try{return new URL(s.sourceURL).pathname.split('/').at(-1);}catch(_){return null;}})()}))}));
   this.observe('resource',e=>this.record('resource',{type:e.initiatorType,duration:e.duration,transferBytes:e.transferSize,bodyBytes:e.decodedBodySize}));
   this.listen('error',e=>this.record('error',{name:e.error?.name||'Error'}));this.listen('unhandledrejection',e=>this.record('rejection',{name:e.reason?.name||'Error'}));
   this.listen('visibilitychange',()=>{this.lastFrame=null;this.record('visibility',{hidden:!!root.document?.hidden});});
   for(const type of ['pagehide','pageshow','online','offline'])this.listen(type,e=>this.record('lifecycle',{event:type,persisted:!!e.persisted}));
   this.listen('pointerdown',e=>this.record('input',{type:e.pointerType||'unknown',tag:e.target?.tagName||''}));
   const frame=time=>{if(!this.enabled)return;if(!root.document?.hidden&&this.lastFrame!==null){const gap=time-this.lastFrame;this.frames++;this.maxFrame=Math.max(this.maxFrame,gap);if(gap>50)this.slowFrames++;}this.lastFrame=time;this.raf=root.requestAnimationFrame?.(frame);};this.raf=root.requestAnimationFrame?.(frame);this.timer=root.setInterval(()=>this.sample(),2000);
  }
  stop(){if(!this.enabled)return;this.sample();this.record('capture.stop');this.enabled=false;this.restoreAnimations?.();this.restoreAnimations=null;root.clearInterval(this.timer);if(this.raf!==null)root.cancelAnimationFrame?.(this.raf);this.timer=null;this.raf=null;for(const observer of this.observers)observer.disconnect();this.observers=[];for(const [type,listener]of this.listeners)root.removeEventListener?.(type,listener);this.listeners=[];}
  setEnabled(value){value?this.start():this.stop();try{root.localStorage?.setItem(KEY,value?'1':'0');}catch(_){} }
  async report(){if(this.enabled)this.sample();const events=Array.from({length:this.count},(_,i)=>this.buffer[(this.written-this.count+i)%LIMIT]);let game={status:'unavailable'};try{const value=await this.save();if(value)game={status:'included',value};}catch(error){game={status:'failed',error:error.name||'Error'};}
   return {format:'playroom-diagnostics',version:2,collectorRevision:'2026-11-04.2',startedAt:this.startedAt,exportedAt:new Date().toISOString(),timeOrigin:root.performance?.timeOrigin??null,enabled:this.enabled,capacity:LIMIT,dropped:Math.max(0,this.written-LIMIT),environment:{userAgent:root.navigator?.userAgent||'',deviceMemoryGiB:root.navigator?.deviceMemory??null,logicalProcessors:root.navigator?.hardwareConcurrency??null,viewport:{width:root.innerWidth??null,height:root.innerHeight??null,dpr:root.devicePixelRatio??null},supportedEntryTypes:[...(root.PerformanceObserver?.supportedEntryTypes||[])],jsHeapAvailable:!!root.performance?.memory},context:this.commonContext,baseline:this.written>LIMIT?this.baseline.slice():[],limitations:['No total device/process RAM, CPU percentage, memory addresses/accesses, GPU memory, GC events or native heap from ordinary browser APIs.','Frame gaps, timer lag and long tasks are main-thread/visibility indicators, not CPU usage percentage.','JS heap readings may be approximate. Collector adds overhead; collector.sample records its sampling duration.','Trace is bounded and remains in this page until reload; game save is captured at export.'],events,game};
  }
  async download(){const report=await this.report(),blob=new root.Blob([JSON.stringify(report)],{type:'application/json'}),url=root.URL.createObjectURL(blob),link=root.document.createElement('a');link.href=url;link.download='hod-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';root.document.body.append(link);link.click();link.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),60000);return report;}
 }
 const recorder=new Recorder();root.PlayroomDiagnostics=recorder;if(typeof module==='object'&&module.exports)module.exports={Recorder,LIMIT};
 try{if(root.document&&root.localStorage?.getItem(KEY)==='1')recorder.start();}catch(_){}
})(globalThis);

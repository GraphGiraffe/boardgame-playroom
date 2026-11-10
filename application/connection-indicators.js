/* Presentation grace is separate from transport admission and command availability. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomConnectionIndicators=api;})(globalThis,function(){
 'use strict';
 class ConnectionIndicators{
  constructor({now=()=>Date.now(),setTimeout=(...args)=>globalThis.setTimeout(...args),clearTimeout=id=>globalThis.clearTimeout(id),delay=5000,returnDuration=1800,onChange=()=>{}}={}){Object.assign(this,{now,setTimeout,clearTimeout,delay,returnDuration,onChange});this.entries=new Map();}
  project(key,connected){
   let entry=this.entries.get(key);if(!entry){entry={raw:true,shown:false,returnUntil:0,timer:null};this.entries.set(key,entry);}
   if(entry.raw!==connected){this.clearTimeout(entry.timer);entry.timer=null;entry.raw=connected;
    if(connected){const returned=entry.shown;entry.shown=false;entry.returnUntil=returned?this.now()+this.returnDuration:0;if(returned)entry.timer=this.setTimeout(()=>{entry.timer=null;entry.returnUntil=0;this.onChange(key);},this.returnDuration);}
    else{entry.returnUntil=0;entry.timer=this.setTimeout(()=>{entry.timer=null;if(!entry.raw){entry.shown=true;this.onChange(key);}},this.delay);}
   }
   return {connected:connected||!entry.shown,connectionOffline:!connected&&entry.shown,connectionRestored:connected&&entry.returnUntil>this.now()};
  }
  retain(keys){const keep=new Set(keys);for(const [key,entry]of this.entries)if(!keep.has(key)){this.clearTimeout(entry.timer);this.entries.delete(key);}}
  close(){this.retain([]);}
 }
 return ConnectionIndicators;
});

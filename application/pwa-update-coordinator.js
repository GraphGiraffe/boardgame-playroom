/* Multi-window update policy. Worker messaging, saving and reload are ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPwaUpdateCoordinator=api;})(globalThis,function(){
  'use strict';
  class PwaUpdateCoordinator {
    constructor({request}){this.request=request;this.waiting=null;this.guard=()=>false;this.locked=false;this.started=false;}
    announce(worker){if(!worker)return false;this.waiting=worker;return true;}
    setGuard(guard){if(typeof guard!=='function')throw Error('UPDATE_GUARD_INVALID');this.guard=guard;}
    release(){this.locked=false;}
    reserve(){let idle=false;try{idle=!this.locked&&!!this.guard();}catch(_){}if(idle)this.locked=true;return idle;}
    async activate(){
      if(!this.waiting||this.started)throw Error('UPDATE_NOT_READY');
      if(!this.guard())throw Error('UPDATE_BUSY');
      this.started=true;
      try{const result=await this.request(this.waiting);if(!result?.ok)throw Error(result?.reason||'UPDATE_FAILED');return result;}
      catch(error){this.started=false;this.release();throw error;}
    }
  }
  return PwaUpdateCoordinator;
});

/* Connection recovery with explicit link, visibility, diagnostics and clock ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRecoveryCoordinator=api;})(globalThis,function(){
'use strict';
class Recovery {
    constructor({link,transport,reconcile,onState=()=>{},visibility,diagnostics=async()=>null,clock,interval=5000,currentStatus=()=>null,grace=10000,noticeDelay=5000}){
      Object.assign(this,{link,transport,reconcile,onState,visibilitySource:visibility,diagnostics,clock,currentStatus,grace,noticeDelay});
      this.lastStatus=null;this.notice=false;this.state='connecting';this.lastResponse=null;this.error=null;this.route=null;this.events=[];this.closed=false;this.flight=null;this.generation=0;
      this.notify=()=>{const state=link.connectionState;if(state!=='connected')this.generation++;
        if(['failed','closed'].includes(state))this.setState('invite','channel-closed');
        else if(state==='disconnected'){this.setState('recovering','channel-disconnected');this.waitForInvite();}
        else if(state==='connected')void this.check();};
      this.visibility=()=>{if(visibility.hidden){this.generation++;this.setState('recovering');}else void this.check({recover:true});};
      link.addEventListener('connectionstatechange',this.notify);
      this.unsubscribeVisibility=visibility.subscribe(this.visibility);
      this.timer=this.clock.setInterval(()=>{if(!visibility.hidden)void this.check();},interval);
      this.notify();
    }
    setState(state,error=null){
      if(this.closed)return;const changed=this.state!==state||this.error!==error;this.state=state;this.error=error;
      if(state==='connected'){this.clock.clearTimeout(this.noticeTimer);this.noticeTimer=null;this.notice=false;}
      else if(!this.noticeTimer&&!this.notice)this.noticeTimer=this.clock.setTimeout(()=>{this.noticeTimer=null;if(!this.closed&&this.state!=='connected'){this.notice=true;this.onState(this.report());}},this.noticeDelay);
      if(state==='connected'){this.clock.clearTimeout(this.graceTimer);this.graceTimer=null;}
      if(changed){this.events.push({at:this.clock.now(),state,error});if(this.events.length>100)this.events.shift();}
      if(changed||state==='connected')this.onState(this.report());
    }
    waitForInvite(){if(!this.graceTimer)this.graceTimer=this.clock.setTimeout(()=>{this.graceTimer=null;if(this.state!=='connected')this.setState('invite','recovery-timeout');},this.grace);}
    report(){return {state:this.state,notice:this.notice,ice:this.link.iceConnectionState||'unknown',channel:this.link.connectionState||'unknown',lastResponse:this.lastResponse,error:this.error,route:this.route,events:this.events.map(e=>({...e}))};}
    async routeInfo(){try{this.route=await this.diagnostics();}catch(_){}}
    check({recover=false}={}){
      if(this.closed||this.visibilitySource.hidden)return Promise.resolve();
      if(this.flight){
        if(this.flightGeneration!==this.generation||recover&&!this.flightRecovering)this.followup=true;
        return this.flight;
      }
      if(this.link.connectionState!=='connected'){this.notify();return Promise.resolve();}
      this.followup=recover;this.flightGeneration=this.generation;this.flightRecovering=recover||this.state!=='connected';
      this.flight=Promise.resolve().then(async()=>{
        do{
          const force=this.followup;this.followup=false;
          await this.checkOnce(force);
        }while(this.followup&&!this.closed&&!this.visibilitySource.hidden&&this.link.connectionState==='connected');
      }).finally(()=>{
        this.flight=null;const followup=this.followup;this.followup=false;
        if(followup&&!this.closed&&!this.visibilitySource.hidden&&this.link.connectionState==='connected')return this.check({recover:true});
      });
      return this.flight;
    }
    async checkOnce(recover){
      let recovering=recover||this.state!=='connected';
      const generation=this.generation;this.flightGeneration=generation;this.flightRecovering=recovering;
      if(recovering)this.setState('recovering');
      let received=false;
      try{
        const status=await this.transport.status();received=true;if(this.closed||generation!==this.generation||this.visibilitySource.hidden)return;
        // A forced check on the same generation upgrades this probe rather
        // than issuing a second status RPC. A stale generation is retried above.
        if(this.followup){recovering=true;this.followup=false;this.flightRecovering=true;this.setState('recovering');}
        const signature=JSON.stringify(status),current=this.currentStatus();
        if(recovering||signature!==(current?JSON.stringify(current):this.lastStatus)){
          this.flightRecovering=true;
          const snapshot=await this.transport.snapshot();if(this.closed||generation!==this.generation||this.visibilitySource.hidden)return;
          await this.reconcile(snapshot,{recovering});
          // Retain the probe baseline: a concurrent newer push must not mask a gap.
          this.lastStatus=signature;
        }if(this.closed||generation!==this.generation||this.visibilitySource.hidden)return;
        this.lastResponse=this.clock.now();await this.routeInfo();
        if(this.closed||generation!==this.generation||this.visibilitySource.hidden||this.link.connectionState!=='connected')return;
        this.setState('connected');
      }catch(_){if(!this.closed&&generation===this.generation&&!this.visibilitySource.hidden){if(received)this.setState('invite','sync-failed');else{this.setState('recovering','request-timeout');this.waitForInvite();}}}
    }
    close(){this.closed=true;this.clock.clearInterval(this.timer);this.clock.clearTimeout(this.graceTimer);this.clock.clearTimeout(this.noticeTimer);this.link.removeEventListener('connectionstatechange',this.notify);this.unsubscribeVisibility?.();}
  }
return Recovery;
});

(function(root,factory){
  'use strict';
  const API=factory();
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.PlayroomGameFeedback=API;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Render only authorized projected events. A repeated snapshot, history
  // navigation, or a lost-ACK retry must not replay sounds or announcements.
  class GameFeedback {
    constructor({mount=()=>document.querySelector('.table-shell'),play=()=>{},clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},duration=3000}={}){
      this.mount=mount;this.play=play;this.clock=clock;this.duration=duration;
      this.cursor=0;this.notice=null;this.timer=null;
    }
    start(events=[]){this.cursor=events.at(-1)?.id||0;this.notice=null;this.refresh();}
    accept(events=[],cues=[],pack,{silent=false}={}){
      const additions=events.filter(e=>Number.isSafeInteger(e?.id)&&e.id>this.cursor);
      if(!additions.length)return;
      this.cursor=additions.at(-1).id;
      if(silent)return;
      const fresh=cues.filter(c=>additions.some(e=>e.id===c.eventId)&&typeof c.id==='string');
      if(fresh.length)this.play(fresh.map(c=>c.id),pack);
    }
    refresh(){
      const mount=this.mount();if(!mount)return;
      mount.querySelector('.game-notice')?.remove();
      // Action descriptions belong to the shared status bar. Rendering a new
      // frame must never cover a hand or create a timed duplicate notification.
    }
    clear(){if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;this.notice=null;this.refresh();}
    destroy(){this.clear();}
  }
  return GameFeedback;
});

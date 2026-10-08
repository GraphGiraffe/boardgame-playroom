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
      const notice=additions.filter(e=>e.notice&&typeof e.notice.title==='string').at(-1)?.notice;
      if(notice){
        this.notice={title:notice.title.slice(0,120),detail:typeof notice.detail==='string'?notice.detail.slice(0,180):'',tone:['success','warning','danger'].includes(notice.tone)?notice.tone:'warning'};
        if(this.timer!==null)this.clock.clearTimeout(this.timer);
        this.timer=this.clock.setTimeout(()=>{this.notice=null;this.timer=null;this.refresh();},this.duration);
        this.refresh();
      }
      const fresh=cues.filter(c=>additions.some(e=>e.id===c.eventId)&&typeof c.id==='string');
      if(fresh.length)this.play(fresh.map(c=>c.id),pack);
    }
    refresh(){
      const mount=this.mount();if(!mount)return;
      mount.querySelector('.game-notice')?.remove();
      if(!this.notice)return;
      const el=mount.ownerDocument.createElement('aside');el.className='game-notice tone-'+this.notice.tone;
      el.setAttribute('role','status');el.setAttribute('aria-live','polite');
      const title=mount.ownerDocument.createElement('strong');title.textContent=this.notice.title;el.appendChild(title);
      if(this.notice.detail){const p=mount.ownerDocument.createElement('span');p.textContent=this.notice.detail;el.appendChild(p);}
      mount.appendChild(el);
    }
    clear(){if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;this.notice=null;this.refresh();}
    destroy(){this.clear();}
  }
  return GameFeedback;
});

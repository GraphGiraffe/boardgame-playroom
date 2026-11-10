// Enlarged presentation consumes only already projected, explicitly public facts.
(function(root,factory){const API=factory(root);if(typeof module==='object'&&module.exports)module.exports=API;root.PlayroomActionReveal=API;})(globalThis,function(root){
  'use strict';
  class ActionReveal {
    constructor({mount=()=>root.document?.querySelector('.table-shell')}={}){this.mount=mount;this.host=null;this.value=null;this.hidden=null;this.animation=null;this.entered=false;this.timing=null;}
    position(){
      if(!this.host)return;
      const mount=this.mount(),field=mount?.querySelector('.layout-field'),rect=root.PlayroomGameScreen?.fieldBounds?.(mount)||(field||mount)?.getBoundingClientRect();
      if(!rect)return;
      const width=root.innerWidth||rect.right,height=root.innerHeight||rect.bottom;
      const left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(width,rect.right),bottom=Math.min(height,rect.bottom);
      const box=right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:{left:0,top:0,width,height};
      Object.assign(this.host.style,{inset:'auto',left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});
      this.host.style.setProperty('--reveal-x',box.width/2+'px');this.host.style.setProperty('--reveal-y',box.height/2+'px');
    }
    target(){return [...(this.mount()?.querySelectorAll('.scene [data-entity]')||[])].find(el=>this.value?.entity&&el.dataset.entity===root.PlayroomGameComponents.entityKey(this.value.entity)&&!el.closest('.hand-track,.hand-cards,.hand-scroll,.mini-hand'))||(this.value?.kind==='cards'?this.mount()?.querySelector('[data-motion-table]'):null);}
    restore(){if(!this.hidden)return;const {el,value,priority}=this.hidden;el.style.setProperty('visibility',value,priority);el.removeAttribute('data-reveal-active');this.hidden=null;}
    hideTarget(){const el=this.target();if(this.value?.kind==='cards'&&el?.hasAttribute('data-motion-table'))return;if(this.hidden?.el===el)return;this.restore();if(el){this.hidden={el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')};el.setAttribute('data-reveal-active','');el.style.setProperty('visibility','hidden','important');}}
    show(value,pack){
      const mount=this.mount();if(!mount||!value){this.clear();return;}
      if(this.value===value&&this.host?.isConnected){this.hideTarget();this.position();return;}
      this.clear();this.value=value;
      const doc=mount.ownerDocument,host=doc.createElement('div');host.className='action-reveal';host.setAttribute('role','status');
      if(value.title){const title=doc.createElement('strong');title.className='action-reveal-title';title.textContent=value.title;host.append(title);}
      const art=doc.createElement('div');art.className='action-reveal-art';
      if(value.kind==='dice'){
        art.classList.add('is-dice');
        const H=root.TabletopUI.helpers;
        for(const die of value.dice||[]){const item=doc.createElement('span');item.className='action-reveal-die'+(die.active===false?' is-unused':'');item.innerHTML=H.assetArt('die',{value:die.value},params=>H.components.dieArt(params.value));art.append(item);}
        host.setAttribute('aria-label',[value.title,root.PlayroomMessages.text('ui.action-reveal.dice',{values:(value.dice||[]).map(die=>die.value).join(', ')})].filter(Boolean).join('. '));
      }else if(value.kind==='card'||value.kind==='cards'){
        const markup=value.kind==='cards'?(value.cards||[]).map(card=>root.PlayroomViews?.reveal?.(pack,{kind:'card',card})).join(''):root.PlayroomViews?.reveal?.(pack,value);if(value.kind==='cards'){art.classList.add('is-card-set');art.style.setProperty('--reveal-card-count',value.cards.length);}if(!markup){this.value=null;return;}
        art.innerHTML=markup;art.classList.add('scene',pack+'-scene');
        for(const node of art.querySelectorAll('*')){for(const attr of [...node.attributes])if(attr.name==='id'||attr.name.startsWith('data-')||attr.name.startsWith('on'))node.removeAttribute(attr.name);node.setAttribute('tabindex','-1');if('disabled'in node)node.disabled=true;}
      }else{this.value=null;return;}
      const content=doc.createElement('div');content.className='action-reveal-content';for(const child of [...host.children])content.append(child);content.append(art);host.append(content);doc.body.append(host);this.host=host;this.hideTarget();this.position();this.reposition=()=>this.position();root.addEventListener?.('resize',this.reposition);root.addEventListener?.('scroll',this.reposition,true);this.observer=root.ResizeObserver?new root.ResizeObserver(this.reposition):null;this.observer?.observe(mount);const field=mount.querySelector('.layout-field');if(field)this.observer?.observe(field);
    }
    async enter(snapshot,timing,context){
      if(this.entered||!this.host)return;this.entered=true;this.timing=timing;
      const art=this.host.querySelector('.action-reveal-art');
      const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||root.document?.body.classList.contains('reduced-motion');
      if(!['card','cards'].includes(this.value?.kind)||!art||reduced||!timing.flip)return;
      const from=snapshot?.playedFrom||(this.value.entity?snapshot?.entities?.get(root.PlayroomGameComponents.entityKey(this.value.entity))?.rect:null)||snapshot?.origin,to=art.getBoundingClientRect();
      if(!from||!to.width||!to.height)return;
      const scale=Math.min(from.width/to.width,from.height/to.height);
      art.classList.add('is-flying');this.animation=art.animate([{transform:`translate(${from.x+from.width/2-to.x-to.width/2}px,${from.y+from.height/2-to.y-to.height/2}px) scale(${scale})`},{transform:'translate(0,0) scale(1)'}],{duration:timing.flip,easing:'ease-out',fill:'both'});
      context?.animation(this.animation);const entering=this.animation;await entering.finished.catch(()=>{});entering.cancel();if(this.animation===entering)this.animation=null;art.classList.remove('is-flying');
    }
    async finish(context){
      const value=this.value,art=this.host?.querySelector('.action-reveal-art'),target=this.target();
      const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||root.document?.body.classList.contains('reduced-motion');
      if(['card','cards'].includes(this.value?.kind)&&art&&target&&!reduced&&this.timing?.flip!==0&&art.animate){
        const from=art.getBoundingClientRect(),to=target.getBoundingClientRect();
        if(from.width&&to.width&&to.height){
          const title=this.host.querySelector('.action-reveal-title');if(title)title.style.opacity='0';
          art.classList.add('is-flying');this.animation=art.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${to.x+to.width/2-from.x-from.width/2}px,${to.y+to.height/2-from.y-from.height/2}px) scale(${Math.min(to.width/from.width,to.height/from.height)})`}],{duration:this.timing?.flip||240,easing:'ease-in',fill:'forwards'});
          context?.animation(this.animation);await this.animation.finished.catch(()=>{});
        }
      }
      if(this.value===value)this.clear();
    }
    clear(){root.removeEventListener?.('resize',this.reposition);root.removeEventListener?.('scroll',this.reposition,true);this.observer?.disconnect();this.observer=null;this.animation?.cancel();this.animation=null;this.restore();this.host?.remove();this.host=null;this.value=null;this.entered=false;this.timing=null;}
  }
  return ActionReveal;
});

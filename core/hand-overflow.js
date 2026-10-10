/* Reusable hand overflow affordances for combined, local and projected views. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomHandOverflow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const UI=root.TabletopUI||(typeof module==='object'&&module.exports?require('./ui.js'):null);
  const selector='.own-hand .hand-track';
  function update(track){
    const hand=track?.closest?.('.own-hand');if(!hand)return;
    const style=getComputedStyle(track),horizontal=track.scrollWidth-track.clientWidth>2 &&
      ['auto','scroll'].includes(style.overflowX) && style.overflowY!=='auto';
    const max=Math.max(0,track.scrollWidth-track.clientWidth);
    if(horizontal){
      const rect=track.getBoundingClientRect(),parent=hand.getBoundingClientRect();
      hand.style.setProperty('--hand-edge-top',Math.round(rect.top-parent.top+10)+'px');
      hand.style.setProperty('--hand-edge-height',Math.max(20,Math.round(rect.height-24))+'px');
      // Marker and desktop buttons are aligned with the ACTUAL scroll viewport,
      // which may be only 820px wide in a much larger game scene.
      hand.style.setProperty('--hand-edge-left',Math.max(0,Math.round(rect.left-parent.left+5))+'px');
      hand.style.setProperty('--hand-edge-right',Math.max(0,Math.round(parent.right-rect.right+5))+'px');
      const doc=hand.ownerDocument;
      if(doc&&!hand.querySelector('.hand-scroll-controls')){
        const controls=doc.createElement('div');controls.className='hand-scroll-controls';
        controls.setAttribute('role','group');controls.setAttribute('aria-label','Прокрутка руки');
        controls.innerHTML='<span class="hand-scroll-hint">Листайте колёсиком</span>'+
          '<button type="button" data-hand-scroll="left" aria-label="Прокрутить руку влево" title="Предыдущие карты">'+UI.icon('prev')+'</button>'+
          '<button type="button" data-hand-scroll="right" aria-label="Прокрутить руку вправо" title="Следующие карты">'+UI.icon('next')+'</button>';
        hand.appendChild(controls);
      }
      const prev=hand.querySelector?.('[data-hand-scroll="left"]'),next=hand.querySelector?.('[data-hand-scroll="right"]');
      if(prev)prev.disabled=track.scrollLeft<=2;
      if(next)next.disabled=track.scrollLeft>=max-2;
    }else hand.querySelector?.('.hand-scroll-controls')?.remove();
    hand.classList.toggle('hand-overflow',horizontal);
    hand.classList.toggle('hand-overflow-left',horizontal&&track.scrollLeft>2);
    hand.classList.toggle('hand-overflow-right',horizontal&&track.scrollLeft<max-2);
  }
  function sync(container){for(const track of container?.querySelectorAll?.(selector)||[])update(track);}
  function attach(document){
    const onScroll=event=>{if(event.target?.matches?.(selector))update(event.target);};
    const onClick=event=>{
      const button=event.target?.closest?.('[data-hand-scroll]');if(!button||button.disabled)return;
      const track=button.closest('.own-hand')?.querySelector('.hand-track');if(!track)return;
      event.preventDefault();event.stopImmediatePropagation?.();
      const delta=(button.dataset.handScroll==='left'?-1:1)*Math.max(70,Math.round(track.clientWidth*.72));
      if(typeof track.scrollBy==='function')track.scrollBy({left:delta,behavior:'auto'});
      else track.scrollLeft+=delta;
      update(track);
    };
    const onWheel=event=>{
      const track=event.target?.closest?.('.own-hand .hand-track.is-fan');
      if(!track||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
      const max=track.scrollWidth-track.clientWidth;
      if(max<=2||(event.deltaY<0&&track.scrollLeft<=1)||(event.deltaY>0&&track.scrollLeft>=max-1))return;
      track.scrollLeft=Math.max(0,Math.min(max,track.scrollLeft+event.deltaY));
      update(track);event.preventDefault();
    };
    document.addEventListener('scroll',onScroll,true);
    document.addEventListener('click',onClick,true);
    document.addEventListener('wheel',onWheel,{capture:true,passive:false});
    return ()=>{document.removeEventListener('scroll',onScroll,true);document.removeEventListener('click',onClick,true);document.removeEventListener('wheel',onWheel,true);};
  }
  return Object.freeze({update,sync,attach});
});

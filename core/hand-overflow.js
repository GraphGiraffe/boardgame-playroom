/* Reusable hand overflow indicators for combined, local and projected views. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomHandOverflow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function update(track){
    const hand=track?.closest?.('.own-hand');if(!hand)return;
    const horizontal=track.scrollWidth-track.clientWidth>2 && ['auto','scroll'].includes(getComputedStyle(track).overflowX);
    const max=track.scrollWidth-track.clientWidth;
    if(horizontal){
      const rect=track.getBoundingClientRect(),parent=hand.getBoundingClientRect();
      hand.style.setProperty('--hand-edge-top',Math.round(rect.top-parent.top+10)+'px');
      hand.style.setProperty('--hand-edge-height',Math.max(20,Math.round(rect.height-24))+'px');
    }
    hand.classList.toggle('hand-overflow',horizontal);
    hand.classList.toggle('hand-overflow-left',horizontal&&track.scrollLeft>2);
    hand.classList.toggle('hand-overflow-right',horizontal&&track.scrollLeft<max-2);
  }
  function sync(container){for(const track of container?.querySelectorAll?.('.own-hand .hand-track')||[])update(track);}
  // One delegated listener survives rerenders and tracks real touch/mouse scroll.
  function attach(document){
    const onScroll=event=>{if(event.target?.matches?.('.own-hand .hand-track'))update(event.target);};
    document.addEventListener('scroll',onScroll,true);
    return ()=>document.removeEventListener('scroll',onScroll,true);
  }
  return Object.freeze({update,sync,attach});
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Overflow=require('../core/hand-overflow.js');
function fixture(){
  let docHandler={},left=0;const styles=new Map(),classes=new Set(),nodes=new Map();
  const document={createElement:()=>({className:'',dataset:{},setAttribute(){},innerHTML:'',querySelector(){}}),
    addEventListener(type,fn){docHandler[type]=fn;},removeEventListener(type){delete docHandler[type];}};
  const controls={className:'hand-scroll-controls',removed:false,remove(){this.removed=true;nodes.delete('.hand-scroll-controls');}};
  const prev={dataset:{handScroll:'left'},disabled:false,closest:()=>hand},next={dataset:{handScroll:'right'},disabled:false,closest:()=>hand};
  const hand={ownerDocument:document,style:{setProperty(k,v){styles.set(k,v);}},
    classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}},
    querySelector(q){if(q==='.hand-scroll-controls')return nodes.get(q);if(q==='.hand-track')return track;return q.includes('left')?prev:next;},
    appendChild(x){nodes.set('.hand-scroll-controls',controls);},
    getBoundingClientRect(){return {top:100,left:10,right:1390};}};
  const track={clientWidth:820,scrollWidth:1940,get scrollLeft(){return left;},set scrollLeft(v){left=v;},
    getBoundingClientRect(){return {top:126,left:290,right:1110,height:126};},
    closest:()=>hand,matches:()=>true,scrollBy({left:step}){left=Math.max(0,Math.min(1120,left+step));}};
  const getStyle=()=>({overflowX:'auto',overflowY:'hidden'});
  return {document,docHandler,prev,next,hand,track,styles,classes,nodes,getStyle};
}
test('desktop overflow edges align with an 820px card viewport in a 1380px board',()=>{
  const f=fixture(),before=globalThis.getComputedStyle;globalThis.getComputedStyle=f.getStyle;
  try{
    Overflow.update(f.track);
    assert.equal(f.styles.get('--hand-edge-left'),'285px');
    assert.equal(f.styles.get('--hand-edge-right'),'285px');
    assert(f.classes.has('hand-overflow-right'));
    assert(f.prev.disabled);assert(!f.next.disabled);
    f.track.scrollLeft=1120;Overflow.update(f.track);
    assert(!f.classes.has('hand-overflow-right'));assert(f.classes.has('hand-overflow-left'));
    assert(!f.prev.disabled);assert(f.next.disabled);
  }finally{globalThis.getComputedStyle=before;}
});
test('scroll arrow and wheel move hand, without committing any game action',()=>{
  const f=fixture(),before=globalThis.getComputedStyle;globalThis.getComputedStyle=f.getStyle;
  try{
    Overflow.attach(f.document);Overflow.update(f.track);
    let stopped=false;
    f.docHandler.click({target:{closest:()=>f.next},preventDefault(){},stopImmediatePropagation(){stopped=true;}});
    assert(stopped);assert(f.track.scrollLeft>200);
    const afterClick=f.track.scrollLeft;
    const target={closest:()=>f.track};let cancelled=false;
    f.docHandler.wheel({target,deltaX:0,deltaY:-80,preventDefault(){cancelled=true;}});
    assert(cancelled);assert(f.track.scrollLeft<afterClick);
    f.docHandler.wheel({target,ctrlKey:true,deltaX:0,deltaY:99,preventDefault(){throw Error('ctrl+wheel must not be stolen');}});
  }finally{globalThis.getComputedStyle=before;}
});

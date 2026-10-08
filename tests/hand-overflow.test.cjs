'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const UI=require('../core/hand-overflow.js');

test('Scrollbar edges track real hidden cards and hide when fully visible',()=>{
  const names=new Set(),styles=new Map();
  const hand={classList:{toggle:(key,on)=>on?names.add(key):names.delete(key)},style:{setProperty:(key,val)=>styles.set(key,val)},getBoundingClientRect:()=>({top:100})};
  const track={closest:()=>hand,scrollLeft:0,scrollWidth:700,clientWidth:310,getBoundingClientRect:()=>({top:125,height:120})};
  const previous=globalThis.getComputedStyle;
  globalThis.getComputedStyle=()=>({overflowX:'auto'});
  try{
    UI.update(track);assert(names.has('hand-overflow'));assert(!names.has('hand-overflow-left'));assert(names.has('hand-overflow-right'));
    assert.equal(styles.get('--hand-edge-top'),'35px');assert.equal(styles.get('--hand-edge-height'),'96px');
    track.scrollLeft=170;UI.update(track);assert(names.has('hand-overflow-left'));assert(names.has('hand-overflow-right'));
    track.scrollLeft=390;UI.update(track);assert(names.has('hand-overflow-left'));assert(!names.has('hand-overflow-right'));
    track.scrollWidth=300;UI.update(track);assert(!names.has('hand-overflow'));assert(!names.has('hand-overflow-left'));assert(!names.has('hand-overflow-right'));
    track.scrollWidth=700;track.scrollLeft=0;globalThis.getComputedStyle=()=>({overflowX:'hidden'});
    UI.update(track);assert(!names.has('hand-overflow'));
  }finally{if(previous)globalThis.getComputedStyle=previous;else delete globalThis.getComputedStyle;}
});

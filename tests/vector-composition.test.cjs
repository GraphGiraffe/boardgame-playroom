'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../core/vector-art.js');
test('composition removes only exact viewport attributes and preserves glyph paint and identity',()=>{
 for(const svg of ['<svg viewBox="0 0 24 24" width="24" height="24" stroke-width="2" opacity="0.7" data-family="player"><circle cx="12" cy="7" r="3"/></svg>','<svg viewBox="0 0 100 140" x="0" y="0" stroke-width="1.5" fill-opacity="0.5" data-entity="card"><path d="M0 0H10"/></svg>']){
  const placed=V.place(svg,{x:0,y:0,width:48,height:48});
  for(const attribute of ['stroke-width="'+(/stroke-width="([^"]+)/.exec(svg)[1])+'"',...svg.match(/(?:opacity|fill-opacity|data-family|data-entity)="[^"]*"/g)])assert(placed.includes(attribute),attribute+' lost in '+placed);
  assert(!/\s(?:width|height|x|y)=/.test(placed));
 }
});

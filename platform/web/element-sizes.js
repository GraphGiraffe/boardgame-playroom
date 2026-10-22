// Discrete screen-space sizes. Rules, skin artwork and input coordinates are independent.
(function(root,factory){const catalogue=typeof module==='object'&&module.exports?require('../../core/size-tokens.json'):root.PlayroomSizeCatalogue;const api=factory(catalogue);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomElementSizes=api;})(globalThis,function(catalogue){
 'use strict';
 function nearest(family,value){const values=catalogue.families[family];return values.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,values[0]);}
 function floor(family,value){return [...catalogue.families[family]].reverse().find(n=>n<=value)||catalogue.families[family][0];}
 function baseCard(width,height){return width>=1000?catalogue.base.cardDesktop:width>height?catalogue.base.cardLandscape:catalogue.base.cardPortrait;}
 function layoutGrid(width,percent=100,height=Infinity){
  const grids=catalogue.layoutGrids,profile=width>height&&width<=grids.phoneLandscape.maxViewportWidth?grids.phoneLandscape:grids.profiles.find(p=>p.maxViewportWidth===null||width<=p.maxViewportWidth);
  return {...profile,baseline:grids.baseline,majorBaseline:grids.majorBaseline,maxContentWidth:grids.maxContentWidth,margin:Math.max(4,nearest('space',profile.margin*percent/100)),gutter:Math.max(4,nearest('space',profile.gutter*percent/100)),tileColumns:profile.columns/grids.columnSpanPerTile};
 }
 function composition(data={}){
  if(data.surface==='player')return 'player-surface';
  if(data.surface==='table')return 'public-table';
  if(data.soloField==='true')return 'solo-field';
  return data.layoutFamily==='board'?'board-table':data.hasHand==='true'?'hand-table':'card-table';
 }
 function resolve(percent,width,height){
  const scale=percent/100,card=nearest('card',baseCard(width,height)*scale);
  return {card,'hand-card':nearest('card',catalogue.base.handCard*scale),'hand-domino':nearest('domino',catalogue.base.handDomino*scale),'board-die':nearest('die',(width>height&&height<400?catalogue.base.boardDieCompact:catalogue.base.boardDiePortrait)*scale),mini:nearest('card',Math.max(20,card*.5)),die:nearest('die',catalogue.base.die*scale),domino:nearest('domino',catalogue.base.domino*scale),token:nearest('token',catalogue.base.token*scale),avatar:nearest('avatar',catalogue.base.avatar*scale),control:Math.max(32,nearest('length',catalogue.base.control*scale))};
 }
 function apply(doc,percent,width,height){
  const style=doc.documentElement.style,sizes=resolve(percent,width,height);
  for(const [name,value]of Object.entries(catalogue.presentation.css))style.setProperty(name,value);
  for(const binding of catalogue.bindings){const value=nearest(binding.family,binding.base*percent/100);style.setProperty(binding.name,(binding.family==='border'&&binding.base>0?Math.max(1,value):value)+'px');}
  for(const [name,value]of Object.entries(sizes))style.setProperty('--size-'+name,value+'px');
  const grid=layoutGrid(width,percent,height);for(const [name,value]of Object.entries({columns:grid.columns,margin:grid.margin+'px',gutter:grid.gutter+'px','tile-columns':grid.tileColumns,'featured-span':catalogue.layoutGrids.library.featuredSpan,'content-max':grid.maxContentWidth+'px','sidebar-width':nearest('length',176*percent/100)+'px'}))style.setProperty('--ui-grid-'+name,String(value));
  style.setProperty('--size-card-height',sizes.card*1.4+'px');style.setProperty('--size-domino-height',sizes.domino*1.75+'px');
  doc.documentElement.dataset.sizeSystem='discrete';return sizes;
 }
 return Object.freeze({catalogue,nearest,floor,baseCard,layoutGrid,composition,resolve,apply});
});

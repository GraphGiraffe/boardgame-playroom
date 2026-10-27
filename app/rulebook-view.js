/* Structured player rules. Text is escaped; illustrations come from trusted pack views. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRulebookView=api;})(globalThis,function(){
 'use strict';
 function renderBlock(block,esc){
  if(block.type==='paragraph')return `<p>${esc(block.text||'')}</p>`;
  if(block.type==='list'){
   const tag=block.ordered?'ol':'ul';
   return `<${tag}>${(block.items||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</${tag}>`;
  }
  if(block.type==='table')return `<table class="rulebook-table"><thead><tr>${(block.headers||[]).map(text=>`<th scope="col">${esc(text)}</th>`).join('')}</tr></thead><tbody>${(block.rows||[]).map(row=>`<tr>${row.map(text=>`<td>${esc(text)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return '';
 }
 function render(document,{esc,illustrate=()=>''}){
  if(!Array.isArray(document?.sections))throw Error('RULEBOOK_SECTIONS_REQUIRED');
  return document.sections.map(section=>{
   const layout=['row','grid','stack','list'].includes(section.layout)?section.layout:'grid';
   const figures=(section.figures||[]).map(figure=>{
    const art=illustrate(figure.id);if(!art)return '';
    const role=['card','tile','diagram','control'].includes(figure.role)?figure.role:'card';
    return `<figure class="rulebook-figure is-${role}"><div class="rulebook-illustration" role="img" aria-label="${esc(figure.caption||'')}">${art}</div>${figure.caption?`<figcaption>${esc(figure.caption)}</figcaption>`:''}</figure>`;
   }).join('');
   const content=Array.isArray(section.blocks)?section.blocks.map(block=>renderBlock(block,esc)).join(''):(section.paragraphs||[]).map(text=>`<p>${esc(text)}</p>`).join('');
   return `<section class="rulebook-section">${section.title?`<h3>${esc(section.title)}</h3>`:''}${content}${figures?`<div class="rulebook-figures is-${layout}">${figures}</div>`:''}${section.note?`<aside class="rulebook-note">${esc(section.note)}</aside>`:''}</section>`;
  }).join('');
 }
 return Object.freeze({render});
});

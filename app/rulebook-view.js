/* Structured player rules. Text is escaped; illustrations come from trusted pack views. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRulebookView=api;})(globalThis,function(root){
 'use strict';
 function inline(value,esc){
  if(!Array.isArray(value))return esc(value||'');
  return value.map(item=>{
   if(typeof item==='string')return esc(item);
   const body=inline(item?.children,esc),tag={strong:'strong',emphasis:'em',code:'code'}[item?.type];
   if(tag)return `<${tag}>${body}</${tag}>`;
   if(item?.type==='link'&&/^https?:\/\//i.test(item.url||''))return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
   return body;
  }).join('');
 }
 function renderBlock(block,esc){
  if(block.type==='paragraph')return `<p>${inline(block.text,esc)}</p>`;
  if(block.type==='list'){
   const tag=block.ordered?'ol':'ul';
   return `<${tag}>${(block.items||[]).map(item=>`<li>${inline(item,esc)}</li>`).join('')}</${tag}>`;
  }
  if(block.type==='table')return `<table class="rulebook-table"><thead><tr>${(block.headers||[]).map(text=>`<th scope="col">${inline(text,esc)}</th>`).join('')}</tr></thead><tbody>${(block.rows||[]).map(row=>`<tr>${row.map(text=>`<td>${inline(text,esc)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return '';
 }
 function render(document,{esc,illustrate=()=>''}){
  if(!Array.isArray(document?.sections))throw Error('RULEBOOK_SECTIONS_REQUIRED');
  return document.sections.map((section,index)=>{
   const layout=['row','grid','stack','list'].includes(section.layout)?section.layout:'grid';
   const figures=(section.figures||[]).map(figure=>{
    const art=illustrate(figure.id);if(!art)return '';
    const role=['card','tile','diagram','control'].includes(figure.role)?figure.role:'card';
    return `<figure class="rulebook-figure is-${role}"><div class="rulebook-illustration" role="img" aria-label="${esc(figure.caption||'')}">${art}</div>${figure.caption?`<figcaption>${esc(figure.caption)}</figcaption>`:''}</figure>`;
   }).join('');
   const content=Array.isArray(section.blocks)?section.blocks.map(block=>renderBlock(block,esc)).join(''):(section.paragraphs||[]).map(text=>`<p>${esc(text)}</p>`).join('');
   return `<section class="rulebook-section" id="rulebook-section-${index}" tabindex="-1">${section.title?`<h3>${esc(section.title)}</h3>`:''}${content}${figures?`<div class="rulebook-figures is-${layout}">${figures}</div>`:''}${section.note?`<aside class="rulebook-note">${esc(section.note)}</aside>`:''}</section>`;
  }).join('');
 }
 function header(){
  const t=key=>root.PlayroomMessages.text('rules-help.'+key),screen=root.PlayroomGameScreen;
  const actions='<div class="rulebook-toolbar">'+[['top','up'],['contents','rules-contents'],['options','rules']].map(([target,icon])=>screen.iconButton(`data-rulebook-jump="rulebook-${target}"`,t(target),icon)).join('')+'</div>';
  return screen.modalHead(t('title'),{actions}).replace('class="modal-head','class="rulebook-head modal-head');
 }
 function contents(titles,{esc,label,optionsLabel}){
  return `<nav id="rulebook-contents" class="rulebook-contents" tabindex="-1" aria-label="${esc(label)}"><h3>${esc(label)}</h3><ol>${titles.map((title,index)=>title?`<li><a href="#rulebook-section-${index}" data-rulebook-jump="rulebook-section-${index}">${esc(title)}</a></li>`:'').join('')}<li><a href="#rulebook-options" data-rulebook-jump="rulebook-options">${esc(optionsLabel)}</a></li></ol></nav>`;
 }
 root.document?.addEventListener('click',event=>{
  const button=event.target.closest('[data-rulebook-jump]');if(!button)return;
  const id=button.dataset.rulebookJump;if(!/^rulebook-(top|contents|options|section-\d+)$/.test(id))return;
  const modal=button.closest('.modal'),body=modal?.querySelector('.modal-body'),target=modal?.querySelector('#'+id);if(!body||!target)return;
  event.preventDefault();event.stopPropagation();
  body.scrollTo({top:id==='rulebook-top'?0:body.scrollTop+target.getBoundingClientRect().top-body.getBoundingClientRect().top,behavior:root.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  target.focus({preventScroll:true});
 });
 return Object.freeze({render,header,contents});
});

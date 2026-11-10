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
    const raw=art.match(/^\s*<svg\b[^>]*\bviewBox=["']([^"']+)["']/i),box=raw?.[1].trim().split(/[\s,]+/).map(Number),natural=box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0?` style="--rulebook-art-width:${box[2]}px;--rulebook-art-aspect:${box[2]/box[3]}"`:'';
    return `<figure class="rulebook-figure is-${role}" data-rulebook-figure="${esc(figure.id)}"${natural}><div class="rulebook-illustration" role="img" aria-label="${esc(figure.caption||'')}">${art}</div>${figure.caption?`<figcaption>${esc(figure.caption)}</figcaption>`:''}</figure>`;
   }).join('');
   const content=Array.isArray(section.blocks)?section.blocks.map(block=>renderBlock(block,esc)).join(''):(section.paragraphs||[]).map(text=>`<p>${esc(text)}</p>`).join('');
   return `<section class="rulebook-section" id="rulebook-section-${index}" tabindex="-1">${section.title?`<h3>${esc(section.title)}</h3>`:''}${content}${figures?`<div class="rulebook-figures is-${layout}">${figures}</div>`:''}${section.note?`<aside class="rulebook-note">${esc(section.note)}</aside>`:''}</section>`;
  }).join('');
 }
 let readerHelpId=0;
 function header(){
  const screen=root.PlayroomGameScreen,id='rulebook-help-'+(++readerHelpId);
  const actions=screen.iconButton(`popovertarget="${id}"`,'О чтении правил','help')+`<aside id="${id}" class="mini-help-popover" popover="auto">Краткие правила можно прочитать одним списком. В полных правилах оглавление всегда доступно сверху. Параметры партии изменяются в отдельном окне «Правила партии».</aside>`;
  return screen.modalHead(root.PlayroomMessages.text('rules-help.title'),{actions}).replace('class="modal-head','class="rulebook-head modal-head');
 }
 // Small escaped Markdown subset for legacy text; pack HTML is never evaluated.
 function markdownInline(value,esc){
  return String(value||'').split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map(part=>{
   if(part.startsWith('`')&&part.endsWith('`'))return '<code>'+esc(part.slice(1,-1))+'</code>';
   if(part.startsWith('**')&&part.endsWith('**'))return '<strong>'+esc(part.slice(2,-2))+'</strong>';
   if(part.startsWith('*')&&part.endsWith('*'))return '<em>'+esc(part.slice(1,-1))+'</em>';
   return esc(part);
  }).join('');
 }
 function renderBrief(paragraphs,{esc}){
  return paragraphs.map((rule,index)=>{
   const lines=String(rule).split('\n').map(line=>line.trim()).filter(Boolean),title=lines.length>1?lines.shift().replace(/^#{1,6}\s+/,''):'';
   let list='',body='';
   const flush=()=>{if(list){body+='</'+list+'>';list='';}};
   for(const line of lines){
    const match=line.match(/^(?:([-*])|\d+[.)])\s+(.+)$/),kind=match?(match[1]?'ul':'ol'):'';
    if(kind){if(kind!==list){flush();body+='<'+kind+'>';list=kind;}body+='<li>'+markdownInline(match[2],esc)+'</li>';}
    else{flush();body+='<p>'+markdownInline(line,esc)+'</p>';}
   }
   flush();return `<section class="rulebook-section" id="rulebook-section-${index}" tabindex="-1">${title?'<h3>'+markdownInline(title,esc)+'</h3>':''}${body}</section>`;
  }).join('');
 }
 function contents(titles,{esc,label,optionsLabel}){
  return `<details class="rulebook-toc"><summary>${esc(label)}</summary><nav id="rulebook-contents" class="rulebook-contents" tabindex="-1" aria-label="${esc(label)}"><h3>${esc(label)}</h3><ol>${titles.map((title,index)=>title?`<li><a href="#rulebook-section-${index}" data-rulebook-jump="rulebook-section-${index}">${esc(title)}</a></li>`:'').join('')}<li><a href="#rulebook-options" data-rulebook-jump="rulebook-options">${esc(optionsLabel)}</a></li></ol></nav></details>`;
 }
 function selectMode(rules,full){
  rules.querySelector('[data-rulebook-full]').hidden=!full;rules.querySelector('[data-rulebook-brief]').hidden=full;
  rules.querySelector('.rulebook-mode').style.setProperty('--page-index',full?'1':'0');
  rules.querySelectorAll('[data-rulebook-mode]').forEach(button=>{const selected=(button.dataset.rulebookMode==='full')===full;button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
 }
 root.document?.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-rulebook-mode]'),modal=button?.closest('.rulebook-modal');
  if(!modal||modal.closest('[data-surface-state]')?.dataset.surfaceState==='suspended'||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const full=event.key==='End'||event.key!=='Home'&&button.dataset.rulebookMode!=='full',next=modal.querySelector('[data-rulebook-mode='+(full?'full':'brief')+']');next.click();next.focus({preventScroll:true});
 });
 root.document?.addEventListener('click',event=>{
  const modal=event.target.closest('.rulebook-modal');if(!modal||modal.closest('[data-surface-state]')?.dataset.surfaceState==='suspended')return;
  const mode=event.target.closest('[data-rulebook-mode]');
  if(mode){selectMode(mode.closest('.game-rules-help'),mode.dataset.rulebookMode==='full');return;}
  const button=event.target.closest('[data-rulebook-jump]');if(!button)return;
  const id=button.dataset.rulebookJump;if(!/^rulebook-(top|contents|options|section-\d+)$/.test(id))return;
  const body=modal.querySelector('.modal-body'),target=modal.querySelector('#'+id);if(!body||!target)return;
  event.preventDefault();event.stopPropagation();
  if(id!=='rulebook-top'){const rules=modal.querySelector('.game-rules-help');if(rules)selectMode(rules,true);}
  const toc=modal.querySelector('.rulebook-toc');if(toc){toc.open=id==='rulebook-contents';}
  body.scrollTo({top:id==='rulebook-top'?0:body.scrollTop+target.getBoundingClientRect().top-body.getBoundingClientRect().top-(toc?.getBoundingClientRect().height||0)-8,behavior:root.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  target.focus({preventScroll:true});
 });
 return Object.freeze({render,renderBrief,header,contents});
});

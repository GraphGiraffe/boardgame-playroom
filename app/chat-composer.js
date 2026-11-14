/* Shared rich composer. Only plain text/shortcodes cross the application boundary. */
(function(root){
 'use strict';
 const states=new WeakMap(),limit=2000;let statusId=0;
 function text(node){
  if(node.nodeType===Node.TEXT_NODE)return node.data;
  if(node.nodeType!==Node.ELEMENT_NODE&&node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return '';
  if(node.dataset?.reactionToken)return node.dataset.reactionToken;
  if(node.nodeName==='BR')return '\n';
  return [...node.childNodes].map((child,i)=>(i&&['DIV','P'].includes(child.nodeName)?'\n':'')+text(child)).join('');
 }
 function selection(editor){
  const s=getSelection();if(!s?.rangeCount||!editor.contains(s.anchorNode)||!editor.contains(s.focusNode))return null;
  const r=s.getRangeAt(0),before=document.createRange();before.selectNodeContents(editor);before.setEnd(r.startContainer,r.startOffset);
  const start=text(before.cloneContents()).length;return {start,end:start+text(r.cloneContents()).length,range:r.cloneRange()};
 }
 function caret(editor,offset){
  const range=document.createRange();let remaining=offset,done=false;
  function walk(node){for(const child of node.childNodes){if(done)return;const size=text(child).length;
   if(child.nodeType===Node.TEXT_NODE&&remaining<=size){range.setStart(child,remaining);done=true;return;}
   if(child.dataset?.reactionToken||child.nodeName==='BR'){if(remaining<=size){remaining===0?range.setStartBefore(child):range.setStartAfter(child);done=true;return;}}
   else if(child.nodeType===Node.ELEMENT_NODE&&remaining<=size){walk(child);if(done)return;}
   remaining-=size;
  }}
  walk(editor);if(!done){range.selectNodeContents(editor);range.collapse(false);}else range.collapse(true);
  const s=getSelection();s.removeAllRanges();s.addRange(range);
 }
 function markup(value){return root.PlayroomReactionView.html(value,{legacy:false}).replace(/<span class="reaction-art" data-reaction="([a-z]+)"/g,(_,id)=>`<span contenteditable="false" data-reaction-token=":${id}:" class="reaction-art" data-reaction="${id}"`);}
 function render(state,value,offset=null){
  state.editor.innerHTML=markup(value);
  if(!value)state.editor.replaceChildren();state.rendered=value;
  if(offset!==null)caret(state.editor,Math.min(offset,value.length));
 }
 // Native editing commands retain the browser's undo transaction. Ordinary input
 // never rewrites the editable DOM; hydration/reset alone uses render().
 function edit(state,value,{all=false}={}){
  state.editing=true;
  try{if(all){const range=document.createRange();range.selectNodeContents(state.editor);const s=getSelection();s.removeAllRanges();s.addRange(range);}document.execCommand('insertHTML',false,markup(value));}
  finally{state.editing=false;}
 }
 function bind(form){
  if(states.has(form))return states.get(form);
  const editor=form.querySelector('[data-chat-editor]'),input=form.elements.message;
  const state={editor,input,status:form.nextElementSibling?.matches('[data-chat-send-state]')?form.nextElementSibling:null,busy:null,rendered:null,range:null,insertOnPick:false,composing:false};states.set(form,state);
  if(state.status){state.status.id||='chat-composer-state-'+(++statusId);editor.setAttribute('aria-describedby',[...new Set([...(editor.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean),state.status.id])].join(' '));}
  editor.addEventListener('compositionstart',()=>state.composing=true);
  editor.addEventListener('compositionend',()=>{state.composing=false;update();editor.dispatchEvent(new Event('input',{bubbles:true}));});
  function update(){if(state.composing||state.editing)return;const raw=text(editor),value=raw==='\n'&&!editor.textContent?'':raw;input.value=value;state.rendered=value;state.range=selection(editor);}
  // Replace a completed shortcode before native typing mutates the document.
  // Editing recursively from input corrupts WebKit's typing undo/redo transaction.
  editor.addEventListener('beforeinput',event=>{
   if(state.composing||state.editing||event.isComposing||!event.cancelable)return;
   const data=['insertLineBreak','insertParagraph'].includes(event.inputType)?'\n':['insertText','insertReplacementText'].includes(event.inputType)?event.data:null;if(typeof data!=='string')return;
   const at=selection(editor);if(!at)return;const raw=text(editor),current=raw==='\n'&&!editor.textContent?'':raw,addition=data.slice(0,Math.max(0,limit-current.length+at.end-at.start)),value=current.slice(0,at.start)+addition+current.slice(at.end),end=at.start+addition.length;
   const shortcode=root.PlayroomQuickReactions.items.some(item=>{let index=value.indexOf(item.shortcode);while(index>=0){if(index<end&&index+item.shortcode.length>at.start)return true;index=value.indexOf(item.shortcode,index+1);}return false;});
   if(!shortcode&&addition===data)return;event.preventDefault();if(value===current)return;edit(state,value,{all:true});caret(editor,end);editor.dispatchEvent(new Event('input',{bubbles:true}));
  });
  editor.addEventListener('input',update);
  form.addEventListener('submit',event=>{if(!state.composing&&text(editor).length<=limit)return;event.preventDefault();event.stopImmediatePropagation();update();sync(form,state.busy);});
  editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();editor.blur();}else if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(input.value.trim()&&!form.querySelector('[type=submit]').disabled)form.requestSubmit();}});
  editor.addEventListener('paste',event=>{event.preventDefault();insert(form,event.clipboardData.getData('text/plain'));});
  editor.addEventListener('drop',event=>event.preventDefault());
  editor.addEventListener('copy',event=>{const range=selection(editor);if(range){event.preventDefault();event.clipboardData.setData('text/plain',input.value.slice(range.start,range.end));}});
  editor.addEventListener('blur',()=>{state.range=selection(editor)||state.range;});
  form.querySelector('.chat-reactions').addEventListener('pointerdown',()=>{state.insertOnPick=document.activeElement===editor||!!input.value.trim();state.range=selection(editor)||state.range;});
  return state;
 }
 function sync(form,busy){
  const state=bind(form),pending=!!busy,send=form.querySelector('[type=submit]');
  if(state.rendered!==state.input.value&&!state.composing)render(state,state.input.value);
  const tooLong=state.input.value.length>limit;send.disabled=pending||tooLong||!state.input.value.trim();form.querySelector('.chat-reactions').disabled=pending;
  if(tooLong)state.editor.setAttribute('aria-invalid','true');else state.editor.removeAttribute('aria-invalid');
  // IME and other noncancelable edits retain the complete visible draft and undo.
  // Never silently send only a truncated prefix of what the user can see.
  if(state.status)state.status.textContent=pending?'Отправляем…':tooLong?'Не более 2000 символов. Сократите сообщение.':'';
  if(state.busy!==pending){state.busy=pending;form.setAttribute('aria-busy',String(pending));send.setAttribute('aria-busy',String(pending));send.setAttribute('aria-label',pending?'Отправляем…':'Отправить');send.title=pending?'Отправляем…':'Отправить';}
 }
 function insert(form,value){const state=bind(form),current=state.input.value,at=selection(state.editor)||state.range||{start:current.length,end:current.length};const addition=value.slice(0,Math.max(0,limit-current.length+at.end-at.start));state.editor.focus();if(at.range&&state.editor.contains(at.range.commonAncestorContainer)){const s=getSelection();s.removeAllRanges();s.addRange(at.range);}else caret(state.editor,at.start);if(addition||at.start!==at.end)edit(state,addition);state.editor.dispatchEvent(new Event('input',{bubbles:true}));}
 function open(form,button,send){const state=bind(form),inserting=state.insertOnPick||!!state.input.value.trim()||document.activeElement===state.editor;state.insertOnPick=false;root.PlayroomReactionUI.open(button,value=>{if(!form.isConnected)return;if(inserting)insert(form,value);else return send(value);});}
 root.PlayroomChatComposer=Object.freeze({sync,insert,open});
})(globalThis);

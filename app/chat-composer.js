/* Shared rich composer. Only plain text/shortcodes cross the application boundary. */
(function(root){
 'use strict';
 const states=new WeakMap(),limit=2000;
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
  const start=text(before.cloneContents()).length;return {start,end:start+text(r.cloneContents()).length};
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
 function render(state,value,offset=null){
  state.editor.innerHTML=root.PlayroomReactionView.html(value,{legacy:false}).replace(/<span class="reaction-art" data-reaction="([a-z]+)"/g,(_,id)=>`<span contenteditable="false" data-reaction-token=":${id}:" class="reaction-art" data-reaction="${id}"`);
  if(!value)state.editor.replaceChildren();state.rendered=value;
  if(offset!==null)caret(state.editor,Math.min(offset,value.length));
 }
 function bind(form){
  if(states.has(form))return states.get(form);
  const editor=form.querySelector('[data-chat-editor]'),input=form.elements.message;
  const state={editor,input,rendered:null,range:null,insertOnPick:false,composing:false};states.set(form,state);
  editor.addEventListener('compositionstart',()=>state.composing=true);
  editor.addEventListener('compositionend',()=>{state.composing=false;update();editor.dispatchEvent(new Event('input',{bubbles:true}));});
  function update(){if(state.composing)return;const at=selection(editor),raw=text(editor),value=(raw==='\n'&&!editor.textContent?'':raw).slice(0,limit);input.value=value;render(state,value,at?.end??value.length);state.range=selection(editor);}
  editor.addEventListener('input',update);
  editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();editor.blur();}else if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(input.value.trim()&&!form.querySelector('[type=submit]').disabled)form.requestSubmit();}});
  editor.addEventListener('paste',event=>{event.preventDefault();insert(form,event.clipboardData.getData('text/plain'));});
  editor.addEventListener('drop',event=>event.preventDefault());
  editor.addEventListener('copy',event=>{const range=selection(editor);if(range){event.preventDefault();event.clipboardData.setData('text/plain',input.value.slice(range.start,range.end));}});
  editor.addEventListener('blur',()=>{state.range=selection(editor)||state.range;});
  form.querySelector('.chat-reactions').addEventListener('pointerdown',()=>{state.insertOnPick=document.activeElement===editor||!!input.value.trim();state.range=selection(editor)||state.range;});
  return state;
 }
 function sync(form,busy){const state=bind(form);if(state.rendered!==state.input.value&&!state.composing)render(state,state.input.value);form.querySelector('[type=submit]').disabled=busy||!state.input.value.trim();form.querySelector('.chat-reactions').disabled=busy;}
 function insert(form,value){const state=bind(form),current=state.input.value,at=selection(state.editor)||state.range||{start:current.length,end:current.length};const addition=value.slice(0,limit-current.length+at.end-at.start);state.input.value=current.slice(0,at.start)+addition+current.slice(at.end);state.editor.focus();render(state,state.input.value,at.start+addition.length);state.range=selection(state.editor);state.editor.dispatchEvent(new Event('input',{bubbles:true}));}
 function open(form,button,send){const state=bind(form),inserting=state.insertOnPick||!!state.input.value.trim()||document.activeElement===state.editor;state.insertOnPick=false;root.PlayroomReactionUI.open(button,value=>{if(!form.isConnected)return;if(inserting)insert(form,value);else return send(value);});}
 root.PlayroomChatComposer=Object.freeze({sync,insert,open});
})(globalThis);

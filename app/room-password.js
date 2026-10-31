/* One native text field retains keyboard/selection semantics; six cells are visual only. */
(function(root){
 'use strict';
 const selector='[data-room-password-input]',clean=value=>String(value).toUpperCase().replace(/[^A-Z2-9]/g,'');
 function markup(label){const esc=root.PlayroomGameScreen.esc;return `<span class="room-password-entry"><input data-room-password-input name="password" type="text" minlength="6" maxlength="6" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" required pattern="[A-Z2-9]{6}" aria-label="${esc(label)}"><span class="room-password-cells" aria-hidden="true">${Array.from({length:6},()=>'<span class="room-password-cell"></span>').join('')}</span>`;}
 function sync(input){
  if(!input?.matches(selector))return;
  const raw=input.value,start=input.selectionStart??raw.length,end=input.selectionEnd??start,value=clean(raw).slice(0,6);
  if(value!==raw){input.value=value;input.setSelectionRange(Math.min(6,clean(raw.slice(0,start)).length),Math.min(6,clean(raw.slice(0,end)).length));}
  const a=input.selectionStart??value.length,b=input.selectionEnd??a;
  input.parentElement.querySelectorAll('.room-password-cell').forEach((cell,i)=>{cell.textContent=value[i]||'';cell.classList.toggle('is-current',a===b&&i===Math.min(a,5));cell.classList.toggle('is-selected',i>=a&&i<b);});
 }
 document.addEventListener('input',e=>sync(e.target));
 document.addEventListener('focusin',e=>sync(e.target));
 document.addEventListener('keyup',e=>sync(e.target));
 document.addEventListener('select',e=>sync(e.target),true);
 document.addEventListener('selectionchange',()=>sync(document.activeElement));
 document.addEventListener('click',e=>{
  const input=e.target;if(!input.matches(selector)||e.detail!==1)return;
  const cells=[...input.parentElement.querySelectorAll('.room-password-cell')];
  const index=cells.findIndex(cell=>{const box=cell.getBoundingClientRect();return e.clientX<box.right;});
  const start=Math.min(index<0?5:index,input.value.length);input.setSelectionRange(start,Math.min(start+1,input.value.length));sync(input);
 });
 document.addEventListener('dblclick',e=>{if(e.target.matches(selector)){e.target.select();sync(e.target);}});
 document.addEventListener('paste',e=>{
  const input=e.target;if(!input.matches(selector))return;e.preventDefault();
  const text=clean(e.clipboardData?.getData('text')||'');if(!text)return;
  const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
  input.value=(input.value.slice(0,start)+text+input.value.slice(end)).slice(0,6);
  const caret=Math.min(start+text.length,6);input.setSelectionRange(caret,caret);sync(input);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 root.PlayroomRoomPassword=Object.freeze({markup,sync});
})(globalThis);

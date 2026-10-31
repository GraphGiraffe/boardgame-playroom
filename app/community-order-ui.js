/* Presentation-only ordering; IDs and persistence are supplied by the caller. */
(function(root){
 'use strict';let state=null,drag=null;
 const rows=()=>state?[...state.list.querySelectorAll(':scope > [data-community-order-key]')]:[];
 function sync(){const items=rows();items.forEach((row,index)=>{row.querySelector('[data-community-step="-1"]')?.toggleAttribute('disabled',index===0);row.querySelector('[data-community-step="1"]')?.toggleAttribute('disabled',index===items.length-1);});}
 function apply(list,{editing,user,store}){
  if(!list){state=null;return;}state={list,editing,user,store};const order=store.read(user),elements=[...list.children];
  for(const row of elements){const card=row.querySelector('[data-community-chat],[data-group-open]');if(!card)continue;row.dataset.communityOrderKey=card.dataset.groupOpen?'group:'+card.dataset.groupOpen:'friend:'+card.dataset.communityChat;
   if(editing){row.classList.add('is-ordering');card.disabled=true;const H=root.PlayroomGameScreen;row.insertAdjacentHTML('beforeend',`<div class="community-order-tools"><span class="community-drag-handle" draggable="false" role="img" aria-label="Перетащить" title="Перетащить">⠿</span>${H.iconButton('data-community-step="-1"','Выше','up')}${H.iconButton('data-community-step="1"','Ниже','down')}</div>`);}
  }
  const sorted=rows().sort((a,b)=>{const ai=order.indexOf(a.dataset.communityOrderKey),bi=order.indexOf(b.dataset.communityOrderKey);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});
  const tail=list.querySelector('.group-create-row');for(const row of sorted)list.insertBefore(row,tail);sync();
 }
 function save(){if(!state.store.write(state.user,rows().map(row=>row.dataset.communityOrderKey)))root.PlayroomAppBridge.toast('Не удалось сохранить порядок.');sync();}
 function move(row,target,after){if(!state?.editing||!row||!target||row===target||!state.list.contains(row)||!state.list.contains(target))return;state.list.insertBefore(row,after?target.nextSibling:target);save();}
 document.addEventListener('click',event=>{const button=event.target.closest('[data-community-step]');if(!button||!state?.editing)return;const items=rows(),row=button.closest('[data-community-order-key]'),index=items.indexOf(row),step=Number(button.dataset.communityStep);move(row,items[index+step],step>0);});
 function drop(target,y){const row=target?.closest('[data-community-order-key]');if(row){const box=row.getBoundingClientRect();move(drag,row,y>box.top+box.height/2);}}
 function end(){drag?.classList.remove('is-dragging');drag=null;}
 document.addEventListener('pointerdown',event=>{const handle=event.target.closest('.community-drag-handle');if(!handle||!state?.editing||event.button!==0)return;event.preventDefault();drag=handle.closest('[data-community-order-key]');drag.classList.add('is-dragging');handle.setPointerCapture(event.pointerId);});
 document.addEventListener('pointermove',event=>{if(!drag)return;event.preventDefault();const box=state.list.parentElement.getBoundingClientRect();if(event.clientY<box.top+35)state.list.parentElement.scrollTop-=12;else if(event.clientY>box.bottom-35)state.list.parentElement.scrollTop+=12;},{passive:false});
 document.addEventListener('pointerup',event=>{if(!drag)return;drop(document.elementFromPoint(event.clientX,event.clientY),event.clientY);end();});document.addEventListener('pointercancel',end);
 root.PlayroomCommunityOrderUI=Object.freeze({apply});
})(globalThis);

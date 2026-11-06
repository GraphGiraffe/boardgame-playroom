/* Presentation-only ordering. Callers own keys, persistence and navigation. */
(function(root){
 'use strict';
 function create({list,rows=()=>[...list.children],key=row=>row.dataset.orderKey,handle,current=()=>true,move,resolveDrop=null,previewClass='',previewOmit='',previewHost=()=>document.body,pointerTypes=null,delay=0,activationDistance=0,suppressHandleClick=delay===0,canStart=()=>true,scroll=()=>list.parentElement}){
  const events=new AbortController();let disposed=false,pending=null,drag=null,suppressUntil=0;
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:events.signal});
  const valid=()=>!disposed&&!document.hidden&&list.isConnected&&current()&&!list.closest('[inert],[hidden],[aria-hidden="true"],[data-surface-state="suspended"]');
  const rowAt=target=>rows().find(row=>row===target||row.contains(target));
  function end(){
   if(pending){clearTimeout(pending.timer);pending=null;}
   const old=drag;drag=null;if(!old)return;cancelAnimationFrame(old.frame);old.row.classList.remove('is-dragging');old.ghost.remove();suppressUntil=performance.now()+500;
   try{if(old.handle.hasPointerCapture(old.id))old.handle.releasePointerCapture(old.id);}catch(_){/* Capture may already be lost. */}
  }
  function position(point){
   if(!drag)return;const {ghost,offsetX,offsetY}=drag,viewport=root.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
   ghost.style.left=Math.max(left,Math.min(left+width-ghost.offsetWidth,point.clientX-offsetX))+'px';ghost.style.top=Math.max(top,Math.min(top+height-ghost.offsetHeight,point.clientY-offsetY))+'px';
  }
  function watch(){if(!valid()||!drag?.ghost.isConnected||!list.contains(drag.row)){end();return;}drag.frame=requestAnimationFrame(watch);}
  function begin(value){
   if(pending!==value||!valid()||!list.contains(value.row)){end();return;}pending=null;
   root.PlayroomTooltips?.hide();
   const {row,handle:source,id,point}=value,box=row.getBoundingClientRect(),ghost=row.cloneNode(true),owner=row.closest('#modal-root>[data-surface-state="active"]');
   ghost.classList.add('order-drag-preview');for(const name of previewClass.split(/\s+/).filter(Boolean))ghost.classList.add(name);ghost.classList.remove('is-dragging');ghost.inert=true;ghost.setAttribute('aria-hidden','true');
   if(previewOmit)ghost.querySelectorAll(previewOmit).forEach(node=>node.remove());
   for(const node of [ghost,...ghost.querySelectorAll('*')])for(const attr of [...node.attributes])if(attr.name==='id'||attr.name==='name'||attr.name==='for'||attr.name==='form'||attr.name.startsWith('data-')&&!['data-theme','data-art-plane','data-art-slot'].includes(attr.name))node.removeAttribute(attr.name);
   ghost.style.position='fixed';ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';ghost.style.zIndex=String(owner?(parseInt(getComputedStyle(owner).zIndex,10)||100)+1:1000);(previewHost()||document.body).append(ghost);row.classList.add('is-dragging');
   drag={row,key:key(row),ghost,handle:source,id,offsetX:point.clientX-box.left,offsetY:point.clientY-box.top,frame:null};position(point);watch();try{source.setPointerCapture(id);}catch(_){/* Document handlers remain the fallback. */}
  }
  listen(list,'pointerdown',event=>{
   // A new gesture is independent; only the consumed drag's compatibility click stays blocked.
   if(!drag&&!pending)suppressUntil=0;
   const source=event.target.closest(handle),row=source&&rowAt(source);if(drag||pending||!source||source.disabled||!row||event.button!==0||pointerTypes&&!pointerTypes.includes(event.pointerType)||!valid()||!canStart(event,row))return;
   const wait=typeof delay==='function'?delay(event):delay;
   const value={row,handle:source,captureTarget:event.target,id:event.pointerId,point:{clientX:event.clientX,clientY:event.clientY},startX:event.clientX,startY:event.clientY,wait,timer:null};pending=value;
   if(wait>0)value.timer=setTimeout(()=>begin(value),wait);else if(activationDistance<=0){event.preventDefault();begin(value);}
  });
  listen(document,'pointermove',event=>{
   if(pending&&pending.id===event.pointerId){const distance=Math.hypot(event.clientX-pending.startX,event.clientY-pending.startY);if(pending.wait===0&&activationDistance>0&&distance>=activationDistance)begin(pending);else if(distance>9){end();return;}if(pending)pending.point={clientX:event.clientX,clientY:event.clientY};}
   if(!drag||drag.id!==event.pointerId)return;if(!valid()){end();return;}event.preventDefault();position(event);
   const pane=scroll();if(pane){const box=[document.scrollingElement,document.documentElement,document.body].includes(pane)?{top:0,bottom:innerHeight}:pane.getBoundingClientRect();if(event.clientY<box.top+35)pane.scrollTop-=12;else if(event.clientY>box.bottom-35)pane.scrollTop+=12;}
  },{passive:false});
  listen(document,'touchmove',event=>{if(drag)event.preventDefault();},{passive:false});
  listen(document,'pointerup',event=>{
   if(pending?.id===event.pointerId){end();return;}if(!drag||drag.id!==event.pointerId)return;
   const own=drag,element=document.elementFromPoint(event.clientX,event.clientY),point={x:event.clientX,y:event.clientY},target=rowAt(element),drop=resolveDrop?resolveDrop({element,point,rows:rows()}):target?{target,after:event.clientY>target.getBoundingClientRect().top+target.getBoundingClientRect().height/2}:null;
   root.PlayroomDOM?.consumePointerReleaseClick(point,{document:list.ownerDocument});
   try{if(valid()&&key(own.row)===own.key&&drop?.target&&drop.target!==own.row&&list.contains(drop.target))move({row:own.row,key:own.key,targetKey:key(drop.target),point,...drop});}finally{end();}
  });
  listen(document,'pointercancel',event=>{if(drag?.id===event.pointerId||pending?.id===event.pointerId)end();});
  // Transferring implicit capture from a touched child to the handle is not cancellation.
  listen(document,'lostpointercapture',event=>{const owner=drag||pending,captureOwner=drag?drag.handle:pending?.captureTarget;if(owner?.id===event.pointerId&&event.target===captureOwner)end();});
  listen(list,'click',event=>{if(suppressHandleClick&&event.target.closest(handle)||performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  listen(document,'keydown',event=>{if(!drag&&!pending&&list.contains(event.target)&&['Enter',' '].includes(event.key))suppressUntil=0;if((drag||pending)&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();end();}},{capture:true});
  for(const type of ['blur','pagehide'])listen(root,type,end);listen(document,'visibilitychange',()=>{if(document.hidden)end();});
  return Object.freeze({cancel:end,dispose(){end();disposed=true;events.abort();}});
 }
 let community=null;
 function apply(list,{editing,user,store}){
  community?.dispose();community=null;if(!list)return;
  const rows=()=>[...list.querySelectorAll(':scope > [data-community-order-key]')];
  const sync=()=>rows().forEach((row,index,items)=>{row.querySelector('[data-community-step="-1"]')?.toggleAttribute('disabled',index===0);row.querySelector('[data-community-step="1"]')?.toggleAttribute('disabled',index===items.length-1);});
  for(const row of [...list.children]){const card=row.querySelector('[data-community-chat],[data-group-open]');if(!card)continue;row.dataset.communityOrderKey=card.dataset.groupOpen?'group:'+card.dataset.groupOpen:'friend:'+card.dataset.communityChat;
   if(editing){row.classList.add('is-ordering');card.disabled=true;const H=root.PlayroomGameScreen;row.insertAdjacentHTML('beforeend',`<div class="community-order-tools"><span class="community-drag-handle" draggable="false" role="img" aria-label="Перетащить" title="Перетащить">⠿</span>${H.iconButton('data-community-step="-1"','Выше','up')}${H.iconButton('data-community-step="1"','Ниже','down')}</div>`);}
  }
  const order=store.read(user),tail=list.querySelector('.group-create-row');for(const row of rows().sort((a,b)=>{const ai=order.indexOf(a.dataset.communityOrderKey),bi=order.indexOf(b.dataset.communityOrderKey);return (ai<0?order.length:ai)-(bi<0?order.length:bi);}))list.insertBefore(row,tail);sync();
  const valid=()=>editing&&list.isConnected&&!list.closest('[inert],[hidden],[aria-hidden="true"],[data-surface-state="suspended"]');
  const move=({row,target,after})=>{if(!valid()||!row||!target||row===target)return;list.insertBefore(row,after?target.nextSibling:target);if(!store.write(user,rows().map(item=>item.dataset.communityOrderKey)))root.PlayroomAppBridge.toast('Не удалось сохранить порядок.');sync();};
  const events=new AbortController(),pointer=create({list,rows,key:row=>row.dataset.communityOrderKey,handle:'.community-drag-handle',current:valid,move,previewClass:'community-order-ghost',previewOmit:'.community-order-tools'});
  list.addEventListener('click',event=>{const button=event.target.closest('[data-community-step]');if(!button||button.disabled||!valid())return;const items=rows(),row=rows().find(item=>item.contains(button)),step=Number(button.dataset.communityStep);move({row,target:items[items.indexOf(row)+step],after:step>0});},{signal:events.signal});
  community={dispose(){pointer.dispose();events.abort();}};
 }
 root.PlayroomOrderUI=Object.freeze({create});root.PlayroomCommunityOrderUI=Object.freeze({apply});
})(globalThis);

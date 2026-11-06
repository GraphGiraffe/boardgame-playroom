/* Read-only search owns a child surface; only an explicit jump updates its conversation. */
(function(root){
 'use strict';
 const B=()=>root.PlayroomAppBridge,H=()=>root.PlayroomGameScreen;
 const moreButton=attrs=>`<button type="button" class="icon-btn conversation-more" ${attrs} aria-label="Действия чата" title="Действия чата"><span aria-hidden="true">⋯</span></button>`;
 function excerpt(body,query){const text=String(body||''),match=text.toLowerCase().indexOf(query.toLowerCase()),start=Math.max(0,match-100),end=Math.min(text.length,start+350);return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');}
 function jump(list,id,prefix){
  const node=[...list.querySelectorAll('[data-entity]')].find(n=>n.dataset.entity===prefix+id);if(!node)return false;
  const box=list.getBoundingClientRect(),rect=node.getBoundingClientRect();list.scrollTop+=rect.top-box.top-Math.max(12,(list.clientHeight-rect.height)/2);node.classList.add('conversation-jump-target');setTimeout(()=>node.classList.remove('conversation-jump-target'),1500);root.PlayroomChatComponents.navigation(list);return true;
 }
 function menu({title,valid,back,search,profile,refresh}){
  if(!valid())return;
  const options=[...(profile?[{id:'profile',label:profile.label,run:profile.run}]:[]),...(search?[{id:'search',label:'Поиск сообщений',detail:search.enabled?'По всей доступной истории':'Поиск пока недоступен на сервере',disabled:!search.enabled,run:()=>show({...search,valid,back,title})}]:[]),{id:'refresh',label:'Обновить переписку',run:refresh}];
  const frame=B().openModal(`${H().modalHead('Действия чата')}<nav class="conversation-menu menu-list" aria-label="Действия чата">${options.map(o=>`<button type="button" class="menu-row" data-conversation-action="${o.id}" ${o.disabled?'disabled':''}><span><strong>${H().esc(o.label)}</strong>${o.detail?`<small>${H().esc(o.detail)}</small>`:''}</span>${H().icon(({profile:'player',search:'search',refresh:'refresh'})[o.id])}</button>`).join('')}</nav>`,'conversation-menu-modal',{valid,onBack:back});if(!frame)return;
  frame.element.addEventListener('click',event=>{const button=event.target.closest('[data-conversation-action]');if(!button||button.disabled||frame.state!=='active'||!valid())return;const option=options.find(o=>o.id===button.dataset.conversationAction);if(!option)return;if(option.id==='search'){option.run();return;}if(back())option.run();});
 }
 function show({title,valid,back,search,loadTarget,prepareTarget,onUnavailable,commitJump}){
  if(!valid())return;
  let disposed=false,request=0,query='',hits=[],hasMore=false,nextBefore=null,busy=false,pendingUnavailable=null,resume=null;
  const frame=B().openModal(`${H().modalHead('Поиск сообщений')}<div class="conversation-search-content"><p class="conversation-search-context">${H().esc(title)}</p><form data-conversation-search-form data-inline-actions><label class="field"><span>По всей доступной истории</span><input type="search" name="query" minlength="2" maxlength="200" required autocomplete="off" placeholder="Не менее 2 символов" aria-describedby="conversation-search-hint"></label><button type="submit" class="icon-btn" aria-label="Найти сообщения">${H().icon('search')}</button></form><p id="conversation-search-hint" class="conversation-search-hint">От 2 до 200 символов. Поиск текста без учёта регистра.</p><p data-conversation-search-status role="status">Введите текст сообщения.</p><div class="conversation-search-results" data-conversation-search-results></div><button type="button" class="conversation-inline-action" data-conversation-search-more hidden>Ещё результаты</button></div>`,'community-modal conversation-search-modal',{size:'large',valid,onBack:back,onDispose:()=>{disposed=true;request++;if(resume)root.removeEventListener('playroom:modal-restored',resume);}});
  if(!frame)return;
  const node=frame.element,form=node.querySelector('form'),status=node.querySelector('[role=status]'),list=node.querySelector('[data-conversation-search-results]'),more=node.querySelector('[data-conversation-search-more]');
  const owned=()=>!disposed&&valid()&&frame.state!=='disposed',active=()=>owned()&&frame.state==='active';
  function paint(){root.PlayroomDOM.ListController.update(list,hits.map((hit,index)=>`<button type="button" class="conversation-search-hit" data-entity="search-hit-${H().esc(hit.id)}" data-conversation-search-hit="${index}"><span><strong>${H().esc(hit.mine?'Вы':hit.nickname||title)}</strong><time>${H().esc(new Date(hit.at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</time></span><span>${H().esc(excerpt(hit.body,query))}</span></button>`).join(''));more.hidden=!hasMore;more.disabled=busy;}
  function unavailable(error){hits=[];hasMore=false;status.textContent='Переписка больше недоступна.';if(active())onUnavailable?.(error);else pendingUnavailable=error;}
  resume=()=>{if(active()&&pendingUnavailable){const error=pendingUnavailable;pendingUnavailable=null;onUnavailable?.(error);}};root.addEventListener('playroom:modal-restored',resume);
  async function run(append=false){
   if(!active())return;
   const next=form.elements.query.value.trim();if(next.length<2||next.length>200){status.textContent='Введите от 2 до 200 символов.';return;}
   const ticket=++request;busy=true;pendingUnavailable=null;query=next;if(!append){hits=[];hasMore=false;nextBefore=null;paint();}status.textContent='Ищем сообщения…';more.disabled=true;
   try{const result=await search({query,...(append&&nextBefore?{before:nextBefore}:{})});if(ticket!==request||!owned())return;hits=append?[...hits,...result.messages.filter(hit=>!hits.some(old=>old.id===hit.id))]:result.messages;hasMore=result.hasMore===true;nextBefore=result.nextBefore;status.textContent=hits.length?`Найдено: ${hits.length}${hasMore?' · есть ещё':''}`:'Сообщений не найдено.';}
   catch(error){if(ticket===request&&owned()){if(['forbidden','not-found'].includes(error.code))unavailable(error);else status.textContent=root.PlayroomSocialUI.message(error)+' Повторите поиск.';}}
   finally{if(ticket===request&&owned()){busy=false;paint();}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void run();});
  form.elements.query.addEventListener('input',()=>{if(!active())return;request++;busy=false;hits=[];hasMore=false;paint();status.textContent='Нажмите поиск, чтобы обновить результаты.';});
  more.addEventListener('click',()=>{if(active()&&!busy&&form.elements.query.value.trim()===query)void run(true);});
  list.addEventListener('click',async event=>{const button=event.target.closest('[data-conversation-search-hit]');if(!button||busy||!active())return;const hit=hits[Number(button.dataset.conversationSearchHit)];if(!hit||!/^[1-9][0-9]*$/.test(String(hit.id)))return;const ticket=++request;busy=true;status.textContent='Открываем сообщение…';paint();
   try{const result=await loadTarget(hit);if(ticket!==request||!owned())return;prepareTarget?.(result);if(result.historyAfter!==undefined)hits=hits.filter(row=>BigInt(row.id)>BigInt(result.historyAfter));if(!result.messages?.some(row=>String(row.id)===String(hit.id))){hits=hits.filter(row=>row.id!==hit.id);status.textContent='Сообщение больше недоступно. Повторите поиск или выберите другой результат.';return;}if(!active()){status.textContent='Чтобы открыть сообщение, нажмите на результат ещё раз.';return;}if(back())commitJump(result,hit);}
   catch(error){if(ticket===request&&owned()){if(['forbidden','not-found'].includes(error.code))unavailable(error);else status.textContent=root.PlayroomSocialUI.message(error)+' Можно повторить переход.';}}
   finally{if(ticket===request&&owned()){busy=false;paint();}}
  });
  form.elements.query.focus({preventScroll:true});
 }
 root.PlayroomConversationSearchUI=Object.freeze({menu,show,moreButton,jump});
})(globalThis);

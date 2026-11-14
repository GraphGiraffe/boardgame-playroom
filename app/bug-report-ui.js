/* Explicit support submission; drafts and compressed attachments live in this surface only. */
(function(root){
 'use strict';
 const B=()=>root.PlayroomAppBridge,H=()=>root.PlayroomGameScreen,A=()=>root.PlayroomBugAttachments;
 const size=bytes=>(bytes/1024).toFixed(1)+' КБ';
 const errors={network:'Нет связи. Сообщение не подтверждено. Можно повторить отправку.',
  'account-required':'Войдите в аккаунт, чтобы отправить сообщение.', 'account-changed':'Аккаунт изменился. Откройте форму заново.',
  'rate-limit':'Сегодня уже отправлено пять сообщений. Повторите завтра.',quota:'Приём сообщений временно заполнен. Повторите позже.',
  setup:'Приём сообщений пока недоступен. Повторите после обновления сервера.',
  'image-format':'Выберите скриншот PNG, JPEG или WebP размером до 20 МБ.', 'image-too-large':'Не удалось сжать скриншот. Выберите другой файл.',
  'compression-unavailable':'Этот браузер не поддерживает сжатие лога. Его можно скачать отдельно.'};
 let account,remote,frame=null;
 function environment(){
  const nav=root.navigator,bridge=B(),current=bridge?.room?.(),ua=nav.userAgent||'';
  return {capturedAt:new Date().toISOString(),appVersion:root.PlayroomAppVersion,collectionVersion:root.PlayroomRemotePacks?.current?.collection||null,
   packs:(bridge?.packs?.list()||[]).map(p=>({id:p.id,version:p.version})),
   device:{type:nav.userAgentData?.mobile||/Android|iPhone|iPad/i.test(ua)?'Мобильное':'Компьютер',platform:nav.userAgentData?.platform||nav.platform||'',userAgent:ua,
    screen:{width:root.screen?.width,height:root.screen?.height},viewport:{width:root.innerWidth,height:root.innerHeight,dpr:root.devicePixelRatio},
    touchPoints:nav.maxTouchPoints||0,logicalProcessors:nav.hardwareConcurrency||null,memoryGiB:nav.deviceMemory||null},
   app:{language:nav.language,online:nav.onLine,displayMode:root.matchMedia('(display-mode: standalone)').matches?'standalone':'browser',
    theme:root.document.documentElement.dataset.theme||null,visibility:root.document.visibilityState},
   game:current?{id:current.game?.id||null,transport:current.transportMode,phase:current.phase}:null};
 }
 function init(options){({account,remote}=options);}
 function show(){
  if(frame?.state!=='disposed'&&frame)return;
  const user=account?.snapshot(),back=B().captureModalReturn();
  let owner=user?.kind==='account'&&!user.recovery?user.id:null,unsubscribe=()=>{};
  let screenshots=[],trace=null,context=environment(),id=root.crypto.randomUUID(),busy=false,preparing=false,revision=0,closed=false,invalidated=false,abort;
  const hasLog=!!root.PlayroomDiagnostics?.count,esc=H().esc;
  frame=B().openModal(`${H().modalHead('Обратная связь')}<form class="bug-report-form" data-bug-report>
   <label class="field"><span>Ваше сообщение</span><textarea name="description" required minlength="10" maxlength="3000" rows="4" placeholder="Расскажите об ошибке, предложите улучшение или оставьте замечание."></textarea></label>
   <p class="muted">До трёх скриншотов. Проверьте, нет ли на них личной информации.</p>
   <label class="btn secondary bug-report-add">Добавить скриншоты<input type="file" aria-label="Добавить скриншоты" accept="image/png,image/jpeg,image/webp" multiple data-bug-files></label>
   <div class="bug-report-images" data-bug-images></div>
   ${hasLog?'<label class="switch"><span>Приложить записанный лог</span><input type="checkbox" name="includeLog" checked disabled></label><p class="muted" data-bug-log-status>Сжимаем записанный лог…</p>':'<p class="muted">Лог не записывался. При сообщении об ошибке можно включить его запись в разделе «Диагностика».</p>'}
   <details class="bug-report-info"><summary>Что будет отправлено</summary><p class="muted">Описание, выбранные скриншоты и технические сведения ниже. Без переписки, паролей и сохранения партии. Отчёт доступен разработчику и хранится до 30 дней.</p><pre data-bug-context></pre><details data-bug-log-preview hidden><summary>Записанный лог</summary><pre></pre></details></details>
   <p role="status" aria-live="polite" data-bug-status>${owner?'':esc(errors['account-required'])}</p>
   ${owner?'':'<button type="button" class="btn secondary" data-bug-login>Войти в аккаунт</button>'}
   <button type="submit" class="btn" data-bug-send ${owner?'':'disabled'}>Отправить</button>
   </form>`,'bug-report-modal',{mode:'push',onBack:back,onDispose:()=>{closed=true;revision++;unsubscribe();abort?.abort();screenshots=[];trace=null;context=null;form.reset();form.querySelector('[data-bug-images]')?.replaceChildren();for(const node of form.querySelectorAll('[data-bug-context],[data-bug-log-preview] pre'))node.textContent='';frame=null;}});
  const form=frame.element.querySelector('form'),status=form.querySelector('[data-bug-status]'),send=frame.element.querySelector('[data-bug-send]'),files=form.querySelector('[data-bug-files]');
  function update(){
   if(closed)return;
   const attach=!!form.elements.includeLog?.checked&&!!trace;
   form.querySelector('[data-bug-context]').textContent=JSON.stringify({...context,attachments:{screenshots:screenshots.map(({width,height,bytes})=>({width,height,bytes})),log:attach?{events:trace.events,omitted:trace.omitted,rawBytes:trace.rawBytes,gzipBytes:trace.bytes}:null}},null,2);
   const preview=form.querySelector('[data-bug-log-preview]');preview.hidden=!attach;preview.querySelector('pre').textContent=attach?JSON.stringify(trace.preview,null,2):'';
   send.disabled=!owner||busy||preparing;files.disabled=invalidated||busy||preparing||screenshots.length>=3;
   for(const control of form.querySelectorAll('[data-bug-remove],textarea,[name=includeLog]'))control.disabled=invalidated||busy||preparing||control.name==='includeLog'&&!trace;
  }
  function renderImages(){
   form.querySelector('[data-bug-images]').innerHTML=screenshots.map((item,i)=>`<figure><img src="data:${esc(item.mime)};base64,${item.data}" alt="Скриншот ${i+1}"><figcaption>${i+1} · ${size(item.bytes)}<button type="button" class="text-btn" data-bug-remove="${i}" aria-label="Убрать скриншот ${i+1}">Убрать</button></figcaption></figure>`).join('');update();
  }
  form.querySelector('[data-bug-login]')?.addEventListener('click',()=>root.PlayroomAccountUI.show());
  form.addEventListener('input',()=>{id=root.crypto.randomUUID();update();});
  form.addEventListener('click',event=>{const remove=event.target.closest('[data-bug-remove]');if(!remove||busy||preparing)return;screenshots.splice(Number(remove.dataset.bugRemove),1);id=root.crypto.randomUUID();renderImages();});
  files.onchange=async()=>{
   const selected=[...files.files];files.value='';if(!selected.length)return;
   if(selected.length+screenshots.length>3){status.textContent='Можно приложить не больше трёх скриншотов.';return;}
   preparing=true;update();status.textContent='Сжимаем скриншоты…';const ticket=++revision;
   try{const prepared=[];for(const file of selected)prepared.push(await A().image(file));if(closed||ticket!==revision)return;screenshots.push(...prepared);id=root.crypto.randomUUID();status.textContent='Скриншоты готовы: '+size(screenshots.reduce((n,item)=>n+item.bytes,0))+'.';}
   catch(error){if(!closed)status.textContent=errors[error.code]||'Не удалось подготовить скриншот.';}
   finally{if(!closed){preparing=false;renderImages();}}
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(!owner||busy||preparing||!form.reportValidity())return;
   if(account.snapshot().id!==owner||account.snapshot().kind!=='account'){status.textContent=errors['account-changed'];return;}
   busy=true;update();status.textContent='Отправляем…';abort=new AbortController();
   const payload={id,description:form.elements.description.value.trim(),context,screenshots:screenshots.map(({mime,width,height,data})=>({mime,width,height,data})),log:form.elements.includeLog?.checked?trace?.data||'':''};
   try{
    const result=await remote.call('submit',payload,{userId:owner,signal:abort.signal});
    if(result?.accepted!==true||result.id!==id)throw Error('response');if(closed||invalidated)return;
    screenshots=[];trace=null;form.reset();form.querySelector('[data-bug-images]').replaceChildren();form.querySelector('[data-bug-log-preview] pre').textContent='';form.querySelector('[data-bug-context]').textContent='';
    const number=result.id.slice(0,8);
    send.remove();form.innerHTML=`<p role="status">Спасибо! Сообщение отправлено.</p><div class="bug-report-receipt"><label class="field"><span>Номер сообщения</span><input type="text" data-bug-number readonly value="${esc(number)}" aria-label="Номер сообщения" spellcheck="false"></label><button type="button" class="btn secondary" data-bug-copy aria-label="Скопировать номер" title="Скопировать номер"><span aria-hidden="true">⧉</span></button></div><p role="status" aria-live="polite" data-bug-copy-status></p><p class="muted">Скриншоты и лог не сохранены в файлах приложения.</p>`;
    const numberField=form.querySelector('[data-bug-number]'),copy=form.querySelector('[data-bug-copy]'),copyStatus=form.querySelector('[data-bug-copy-status]');
    const selectNumber=()=>numberField.select();numberField.addEventListener('focus',selectNumber);numberField.addEventListener('click',selectNumber);
    copy.onclick=async()=>{copy.disabled=true;try{await root.navigator.clipboard.writeText(number);if(!closed)copyStatus.textContent='Номер скопирован.';}catch(_){if(!closed){numberField.focus();numberField.select();copyStatus.textContent='Не удалось скопировать. Номер выделен — скопируйте его вручную.';}}finally{if(!closed)copy.disabled=false;}};
   }catch(error){if(!closed&&!invalidated){busy=false;status.textContent=errors[error.code]||'Не удалось отправить сообщение. Попробуйте ещё раз.';update();}}
  };
  unsubscribe=account?.subscribe(state=>{if(closed||invalidated||!form.querySelector('[data-bug-status]'))return;if(!owner&&state.kind==='account'&&!state.recovery){owner=state.id;status.textContent='';form.querySelector('[data-bug-login]')?.remove();update();}else if(owner&&(state.id!==owner||state.kind!=='account'||state.recovery)){invalidated=true;revision++;abort?.abort();owner=null;screenshots=[];trace=null;form.reset();renderImages();status.textContent=errors['account-changed'];}})||(()=>{});
  update();
  if(hasLog){
   preparing=true;update();void A().log(root.PlayroomDiagnostics).then(value=>{if(closed||invalidated)return;trace=value;form.querySelector('[data-bug-log-status]').textContent=trace?`${trace.events} записей · ${size(trace.rawBytes)} → ${size(trace.bytes)}${trace.omitted?' · не вошло старых записей: '+trace.omitted:''}.`:'Лог пуст.';}).catch(error=>{if(!closed&&!invalidated){form.elements.includeLog.checked=false;form.querySelector('[data-bug-log-status]').textContent=errors[error.code]||'Не удалось подготовить лог. Можно отправить сообщение без него.';}}).finally(()=>{if(!closed){preparing=false;update();}});
  }
 }
 root.PlayroomBugReportUI=Object.freeze({init,show});
})(globalThis);

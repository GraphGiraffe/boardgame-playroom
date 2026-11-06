/* Installation uses a real browser invitation or explicit browser-menu guidance. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge;
 const dismissedKey='playroom.install-hint-dismissed.v1',interestKey='playroom.install-interest.v1';
 let interested=false;try{interested=localStorage.getItem(interestKey)==='1';}catch{}
 let current=null;
 const state=()=>root.PlayroomPWA.installState();
 const canonicalUrl=()=>{const url=new URL('./',location.href);url.search='';url.hash='';url.username='';url.password='';return url.href;};
 function steps(value){
  if(value.mode==='installed')return '<p>ХОД уже открыт как приложение или браузер подтвердил установку. Запускайте его с домашнего экрана или из списка приложений.</p>';
  if(value.mode==='insecure')return '<p>Для установки откройте ХОД по защищённой ссылке HTTPS. В этой копии можно продолжать играть в браузере.</p>';
  if(value.mode==='ios')return `<ol class="install021-steps"><li>Откройте меню браузера и нажмите <strong>«Поделиться»</strong> ${H().icon('share')}.</li><li>Выберите <strong>«На экран Домой»</strong>. Если пункта нет, откройте эту страницу в Safari.</li><li>Если есть переключатель <strong>«Открывать как веб-приложение»</strong>, оставьте его включённым и нажмите <strong>«Добавить»</strong>.</li></ol><p class="muted">Затем откройте ХОД с нового значка. Может потребоваться войти заново. Локальные партии из вкладки браузера можно перенести через «Данные и облако».</p>`;
  return `<p>${value.mode==='native'?'Браузер предложит добавить ХОД в приложения.':'Если вы уже установили ХОД, откройте его с домашнего экрана или из списка приложений.'}</p><details class="install021-alternative"><summary>Установка через меню браузера</summary><p>${value.mac?'В Safari выберите «Файл → Добавить в Dock». В другом браузере ищите «Установить приложение» в его меню.':'Откройте меню браузера и найдите «Установить приложение» или «Добавить на главный экран». Если такого пункта нет, попробуйте открыть ссылку в Chrome, Edge или Safari.'}</p></details>`;
 }
 function open(){
  if(current?.frame?.state==='active')return;
  const view={frame:null,busy:false};current=view;
  view.frame=B().openModal(`${H().modalHead('Установить ХОД')}<div class="install021-content"><p>ХОД можно запускать с домашнего экрана в отдельном окне. Для игры без интернета сначала загрузите игры в установленном приложении.</p><div data-install-guidance>${steps(state())}</div><label class="field install021-link"><span>Ссылка на ХОД</span><input type="url" readonly value="${H().esc(canonicalUrl())}" aria-label="Ссылка на ХОД"></label><p data-install-status role="status"></p></div><footer data-fixed-footer class="install021-actions"><button type="button" class="btn" data-install-native ${state().mode==='native'?'':'hidden'}>Установить</button><button type="button" class="text-btn" data-install-copy>Скопировать ссылку</button></footer>`,'install021-modal',{valid:()=>current===view,onDispose:()=>{if(current===view)current=null;}});
  if(!view.frame){current=null;return;}
  const node=view.frame.element,own=()=>current===view&&view.frame.state==='active',status=node.querySelector('[data-install-status]');
  node.addEventListener('click',async event=>{
   if(!own()||view.busy)return;
   if(event.target.closest('[data-install-native]')){
    if(state().mode!=='native')return;view.busy=true;status.textContent='Завершите установку в окне браузера.';
    try{const result=await root.PlayroomPWA.install();if(own())status.textContent=result?.outcome==='accepted'?'Запрос принят браузером. После установки откройте ХОД с нового значка.':'Установка отменена. Можно продолжать играть здесь или воспользоваться меню браузера.';}
    catch{if(own())status.textContent='Браузер не открыл установку. Воспользуйтесь инструкцией для его меню.';}
    finally{view.busy=false;if(own())refreshGuide();}
   }else if(event.target.closest('[data-install-copy]')){
    view.busy=true;try{await navigator.clipboard.writeText(canonicalUrl());if(own())status.textContent='Ссылка скопирована. Откройте её в браузере, чтобы установить ХОД.';}catch{if(own()){const input=node.querySelector('input');input.focus({preventScroll:true});input.select();status.textContent='Выделите и скопируйте ссылку из поля.';}}finally{view.busy=false;}
   }
  });
 }
 function refreshGuide(){
  if(current?.frame?.state!=='active')return;const node=current.frame.element,value=state();
  root.PlayroomDOM.ListController.update(node.querySelector('[data-install-guidance]'),steps(value));node.querySelector('[data-install-native]').hidden=value.mode!=='native';if(value.mode==='installed')node.querySelector('[data-install-status]').textContent='Браузер подтвердил установку ХОД.';
 }
 function hintMarkup(){return `<aside class="install021-hint" data-install-hint data-entity="catalog-install-hint" hidden aria-label="Установка ХОД"><button type="button" class="install021-hint-open" data-install-open aria-haspopup="dialog">${H().icon('install')}<span>Установить ХОД<small>Значок на домашнем экране</small></span><span aria-hidden="true" class="install021-chevron">›</span></button><button type="button" class="icon-btn" data-install-hint-dismiss aria-label="Скрыть предложение установки">${H().icon('close')}</button></aside>`;}
 root.PlayroomHubAction={open,hintMarkup,mount({hasUpdates}){
  function sync(){
   const value=state(),installed=value.mode==='installed';let dismissed=false;try{dismissed=localStorage.getItem(dismissedKey)==='1';}catch{}
   for(const entry of document.querySelectorAll('[data-install-entry]')){entry.hidden=installed;entry.querySelector('strong').textContent='Установить ХОД';}
   for(const link of document.querySelectorAll('[data-installed-app]')){link.hidden=!value.launchable;link.href=canonicalUrl();}
   if(!document.querySelector('#modal-root>[data-surface-state=active]'))for(const hint of document.querySelectorAll('[data-install-hint]'))hint.hidden=installed||dismissed||!interested||!['native','ios'].includes(value.mode);
   for(const entry of document.querySelectorAll('[data-update-entry]')){const small=entry.querySelector('small');small.hidden=!hasUpdates();small.textContent='Доступно обновление';}
   refreshGuide();
  }
  const click=event=>{const button=event.target.closest('button');if(!button||button.disabled||button.closest('[inert],[hidden]'))return;if(button.matches('[data-start]')||button.matches('[data-hub-page]')&&button.dataset.hubPage!=='games'){interested=true;try{localStorage.setItem(interestKey,'1');}catch{}}if(button.matches('[data-install-open]')){event.preventDefault();open();}else if(button.matches('[data-install-hint-dismiss]')){try{localStorage.setItem(dismissedKey,'1');}catch{}button.closest('[data-install-hint]').hidden=true;}};
  document.addEventListener('click',click);
  const events=['playroom:hub-rendered','playroom:modal-restored','playroom-install-available','playroom-installed','playroom-install-state','playroom-update-ready','playroom-update-progress'];events.forEach(name=>root.addEventListener(name,sync));sync();
  return ()=>{document.removeEventListener('click',click);events.forEach(name=>root.removeEventListener(name,sync));};
 }};
})(globalThis);

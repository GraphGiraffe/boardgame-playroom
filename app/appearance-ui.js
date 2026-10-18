// An independent dialog changes local preferences without remounting a game scene.
(function (root) {
  'use strict';
  const document=root.document, UI=root.TabletopUI, H=UI.helpers;
  const runtime=root.PlayroomAppearanceWeb.create({document,resources:root.PlayroomAppearanceResources,
    storage:()=>root.localStorage,idFactory:()=>`custom-${root.crypto.randomUUID()}`});
  const service=runtime.service, t=(key,params)=>runtime.translator.text(key,params);
  let dialog=null,mode=null,sourceId=null,draft=null,returnFocus=null,scrollY=0,confirmRemove=false;
  const esc=H.esc, icon=H.icon;
  const label=preset=>preset.name??t(preset.nameKey);
  const selected=()=>service.list().find(preset=>preset.id===sourceId)||service.list().find(preset=>preset.id===service.snapshot().activeId);

  function status(message='',error=false) {
    const node=dialog?.querySelector('[data-appearance-status]');
    if(node){node.textContent=message;node.classList.toggle('is-error',error);}
  }
  function errorText(error) {
    const key='themes.error.'+(error.code||'storage');
    try{return t(key);}catch(_){return t('themes.error.storage');}
  }
  const actionButton=(action,key,name,extra='')=>`<button type="button" class="${name==='trash'?'icon-btn appearance-delete':'btn secondary'}" data-appearance-action="${action}" aria-label="${esc(t(key))}" title="${esc(t(key))}" ${extra}>${name?icon(name):''}${name==='trash'?'':esc(t(key))}</button>`;

  function options() {
    const values=[...service.list(),...(draft&&!service.list().some(item=>item.id===draft.id)?[draft]:[])];
    return values.map(preset=>`<option value="${esc(preset.id)}" ${preset.id===(draft?.id||sourceId)?'selected':''}>${esc(label(preset))}</option>`).join('');
  }
  function editorFields() {
    if(!draft)return '';
    const groups=new Map();
    for(const key of Object.keys(draft.palette)){
      const group=key.split('.')[0];if(!groups.has(group))groups.set(group,[]);groups.get(group).push(key);
    }
    const colors=[...groups].map(([group,keys])=>`<fieldset class="appearance-palette-group"><legend>${esc(t('themes.group.'+group))}</legend><div class="appearance-palette-grid">${keys.map(key=>`<label class="appearance-color"><span>${esc(t('themes.color.'+key))}</span><input type="color" data-appearance-color="${esc(key)}" value="${esc(draft.palette[key])}"></label>`).join('')}</div></fieldset>`).join('');
    const families=Object.entries(runtime.assets).filter(([,asset])=>asset.variants.length>1);
    const skins=families.length?families.map(([family,asset])=>`<label class="field"><span>${esc(t('themes.family.'+family))}</span><select data-appearance-skin="${esc(family)}">${asset.variants.map(id=>`<option value="${esc(id)}" ${draft.skins[family]===id?'selected':''}>${esc(id==='classic'?t('themes.standard'):id)}</option>`).join('')}</select></label>`).join(''):`<p class="appearance-hint">${esc(t('themes.standard-skins'))}</p>`;
    return `<form id="appearance-draft"><label class="field"><span>${esc(t('themes.name'))}</span><input type="text" name="themeName" maxlength="64" required value="${esc(draft.name)}" autocomplete="off"></label><details open><summary>${esc(t('themes.palette'))}</summary>${colors}</details><details><summary>${esc(t('themes.skins'))}</summary>${skins}</details><div class="appearance-actions"><button type="submit" class="btn">${icon('check')}${esc(t('themes.save-apply'))}</button>${actionButton('cancel-draft','themes.cancel')}</div></form>`;
  }
  function bodyMarkup() {
    if(mode==='picker')return `<label class="field"><span>${esc(t('themes.choose'))}</span><select data-appearance-choice>${options()}</select></label><p class="appearance-hint">${esc(t('themes.local'))}</p><p class="appearance-status" data-appearance-status role="status"></p>`;
    const preset=selected();
    const controls=draft?'':`<div class="appearance-actions">${actionButton('copy','themes.copy','copy')}${!preset.builtin?actionButton('edit','themes.edit','edit')+actionButton('remove','themes.delete','trash'):''}${actionButton('apply','themes.apply','check')}</div>`;
    const remove=confirmRemove?`<section class="appearance-confirm"><p>${esc(t('themes.delete-question',{name:label(preset)}))}</p><div class="appearance-actions">${actionButton('confirm-remove','themes.delete','trash')}${actionButton('cancel-remove','themes.cancel')}</div></section>`:'';
    return `<label class="field"><span>${esc(t('themes.choose'))}</span><select data-appearance-choice ${draft?'disabled':''}>${options()}</select></label>${!draft&&preset.builtin?`<p class="appearance-hint">${esc(t('themes.builtin'))}</p>`:''}${controls}${remove}${editorFields()}<p class="appearance-status" data-appearance-status role="status"></p><p class="appearance-hint">${esc(t('themes.local'))}</p>`;
  }
  function render() {
    const body=dialog.querySelector('.appearance-body'),top=body.scrollTop;
    body.innerHTML=bodyMarkup();body.scrollTop=top;
  }
  function close() {
    if(!dialog)return;
    service.cancelPreview();
    dialog.close();dialog.remove();dialog=null;draft=null;mode=null;confirmRemove=false;
    const target=returnFocus?.isConnected?returnFocus:document.querySelector('[data-appearance-picker]');
    target?.focus({preventScroll:true});
    if(root.scrollY!==scrollY)root.scrollTo({top:scrollY,behavior:'instant'});
  }
  function open(requested) {
    if(dialog)close();
    mode=requested;sourceId=service.snapshot().activeId;draft=null;confirmRemove=false;
    returnFocus=document.activeElement;scrollY=root.scrollY;
    dialog=document.createElement('dialog');dialog.className='appearance-dialog appearance-'+mode;
    dialog.setAttribute('aria-labelledby','appearance-title');
    dialog.innerHTML=`<header class="appearance-head"><button type="button" class="icon-btn" data-appearance-action="close" aria-label="${esc(t('common.close'))}">${icon('close')}</button><h2 id="appearance-title">${esc(t(mode==='editor'?'themes.title':'themes.quick'))}</h2></header><div class="appearance-body"></div>`;
    document.body.append(dialog);render();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.showModal();
  }
  function preview() {
    try{service.preview(draft);status();}catch(error){status(errorText(error),true);}
  }
  function act(action) {
    switch(action){
      case 'close':close();return;
      case 'copy':draft=service.createDraft(sourceId,t('themes.copy-name',{name:label(selected())}).slice(0,64));confirmRemove=false;preview();render();dialog.querySelector('[name=themeName]')?.focus();return;
      case 'edit':draft=JSON.parse(JSON.stringify(selected()));confirmRemove=false;preview();render();return;
      case 'cancel-draft':service.cancelPreview();draft=null;render();return;
      case 'apply':service.select(sourceId);status(t('themes.applied',{name:label(selected())}));return;
      case 'remove':confirmRemove=true;render();return;
      case 'cancel-remove':confirmRemove=false;render();return;
      case 'confirm-remove':service.remove(sourceId);sourceId=service.snapshot().activeId;confirmRemove=false;render();return;
    }
  }
  function click(event) {
    const opener=event.target.closest?.('[data-appearance-picker],[data-appearance-editor]');
    if(opener){event.preventDefault();event.stopImmediatePropagation();open(opener.hasAttribute('data-appearance-editor')?'editor':'picker');return;}
    if(!dialog||!dialog.contains(event.target))return;
    event.stopImmediatePropagation();
    const button=event.target.closest('[data-appearance-action]');
    if(button){event.preventDefault();try{act(button.dataset.appearanceAction);}catch(error){status(errorText(error),true);}}
    else if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  }
  function input(event) {
    if(!dialog?.contains(event.target))return;
    event.stopImmediatePropagation();
    const target=event.target;
    if(draft&&target.name==='themeName'){draft.name=target.value;return;}
    if(draft&&target.dataset.appearanceColor){draft.palette[target.dataset.appearanceColor]=target.value;preview();}
  }
  function change(event) {
    if(!dialog?.contains(event.target))return;
    event.stopImmediatePropagation();
    const target=event.target;
    if(target.hasAttribute('data-appearance-choice')){
      sourceId=target.value;
      if(mode==='picker'){try{service.select(sourceId);close();}catch(error){status(errorText(error),true);}}
      else{confirmRemove=false;render();}
    }else if(draft&&target.dataset.appearanceSkin){draft.skins[target.dataset.appearanceSkin]=target.value;preview();}
  }
  function submit(event) {
    if(!dialog?.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.target.id!=='appearance-draft'||!draft)return;
    try{draft.name=event.target.elements.themeName.value;const name=draft.name;service.saveDraft(draft,{activate:true});sourceId=draft.id;draft=null;render();status(t('themes.saved',{name}));}
    catch(error){status(errorText(error),true);}
  }
  function keydown(event) {
    if(!dialog)return;
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();close();}
  }
  for(const [name,listener] of Object.entries({click,input,change,submit,keydown}))document.addEventListener(name,listener,true);
  root.PlayroomAppearanceUI=Object.freeze({runtime,text:t,settingsButton:()=>`<button type="button" class="btn secondary appearance-settings-shortcut" data-appearance-picker>${icon('palette')}${esc(t('themes.quick'))}</button>`,openPicker:()=>open('picker'),openEditor:()=>open('editor'),close,
    destroy(){close();for(const [name,listener]of Object.entries({click,input,change,submit,keydown}))document.removeEventListener(name,listener,true);runtime.destroy();}});
})(globalThis);

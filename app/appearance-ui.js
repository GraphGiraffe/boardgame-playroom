// An independent dialog changes local preferences without remounting a game scene.
(function (root) {
  'use strict';
  const document=root.document, UI=root.TabletopUI, H=UI.helpers;
  const runtime=root.PlayroomAppearanceWeb.create({document,resources:root.PlayroomAppearanceResources,
    storage:()=>root.localStorage,idFactory:()=>`custom-${root.crypto.randomUUID()}`});
  const service=runtime.service, t=(key,params)=>runtime.translator.text(key,params);
  let skinDraft=null,dialog=null,mode=null,sourceId=null,draft=null,returnFocus=null,scrollY=0,confirmRemove=false;
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
    return `<form id="appearance-draft"><label class="field"><span>${esc(t('themes.name'))}</span><input type="text" name="themeName" maxlength="64" required value="${esc(draft.name)}" autocomplete="off"></label><details open><summary>${esc(t('themes.palette'))}</summary>${colors}</details><div class="appearance-actions"><button type="submit" class="btn">${icon('check')}${esc(t('themes.save-apply'))}</button>${actionButton('cancel-draft','themes.cancel')}</div></form>`;
  }
  function skinFields(){
    if(!skinDraft)return '';
    const games=Object.values(root.PlayroomCatalog||{}),theme=service.shown();
    const option=(id,asset,current)=>`<option value="${esc(id)}" ${current===id?'selected':''}>${esc(asset.labels?.[id]||(id==='classic'?t('themes.standard'):id))}</option>`;
    return `<form id="skin-preferences"><details open><summary>${esc(t('themes.skins'))}</summary><p class="appearance-hint">${esc(t('themes.skin-help'))}</p>${Object.entries(runtime.assets).filter(([family])=>['card-face','card-back','die','checker','domino','round-token','board','ship'].includes(family)).map(([family,asset])=>{
      const packs=games.filter(game=>game.skinFamilies?.includes(family));
      const main=skinDraft.main[family]||'';
      return `<fieldset class="appearance-palette-group"><legend>${esc(t('themes.family.'+family))}</legend><label class="field"><span>${esc(t('themes.skin-main'))}</span><select data-skin-family="${esc(family)}"><option value="" ${!main?'selected':''}>${esc(t('themes.skin-original'))}</option>${asset.variants.map(id=>option(id,asset,main)).join('')}</select></label><button type="button" class="btn secondary" data-skin-reset="${esc(family)}" title="${esc(t('themes.skin-reset-help'))}">${esc(t('themes.skin-reset'))}</button>${packs.length?`<details><summary>${esc(t('themes.skin-games'))}</summary>${packs.map(game=>{const current=skinDraft.packs[game.id]?.[family],inherited=runtime.skins.resolve(family,{packId:game.id,defaults:game.defaultSkins||{},theme:theme.skins,draft:{...skinDraft,packs:{...skinDraft.packs,[game.id]:{}}}});return `<label class="field"><span>${esc(game.name)}</span><select data-skin-family="${esc(family)}" data-skin-pack="${esc(game.id)}"><option value="" ${!current?'selected':''}>${esc(t('themes.skin-main'))} (${esc(asset.labels?.[inherited]||(inherited==='classic'?t('themes.standard'):inherited))})</option>${asset.variants.map(id=>option(id,asset,current)).join('')}</select></label>`;}).join('')}</details>`:''}</fieldset>`;
    }).join('')}<div class="appearance-actions"><button type="submit" class="btn">${esc(t('themes.save-apply'))}</button><button type="button" class="btn secondary" data-appearance-action="cancel-skins">${esc(t('themes.cancel'))}</button></div></details></form>`;
  }

  function bodyMarkup() {
    if(mode==='picker')return `<label class="field"><span>${esc(t('themes.choose'))}</span><select data-appearance-choice>${options()}</select></label><p class="appearance-hint">${esc(t('themes.local'))}</p><p class="appearance-status" data-appearance-status role="status"></p>`;
    const preset=selected();
    const controls=draft?'':`<div class="appearance-actions">${actionButton('copy','themes.copy','copy')}${!preset.builtin?actionButton('edit','themes.edit','edit')+actionButton('remove','themes.delete','trash'):''}${actionButton('apply','themes.apply','check')}</div>`;
    const remove=confirmRemove?`<section class="appearance-confirm"><p>${esc(t('themes.delete-question',{name:label(preset)}))}</p><div class="appearance-actions">${actionButton('confirm-remove','themes.delete','trash')}${actionButton('cancel-remove','themes.cancel')}</div></section>`:'';
    return `<label class="field"><span>${esc(t('themes.choose'))}</span><select data-appearance-choice ${draft?'disabled':''}>${options()}</select></label>${!draft&&preset.builtin?`<p class="appearance-hint">${esc(t('themes.builtin'))}</p>`:''}${controls}${remove}${editorFields()}${skinFields()}<p class="appearance-status" data-appearance-status role="status"></p><p class="appearance-hint">${esc(t('themes.local'))}</p>`;
  }
  function render() {
    const body=dialog.querySelector('.appearance-body'),top=body.scrollTop;
    body.innerHTML=bodyMarkup();body.scrollTop=top;
  }
  function close() {
    if(!dialog)return;
    service.cancelPreview();runtime.cancelSkins();skinDraft=null;
    dialog.close();dialog.remove();dialog=null;draft=null;mode=null;confirmRemove=false;
    const target=returnFocus?.isConnected?returnFocus:document.querySelector('[data-appearance-picker]');
    target?.focus({preventScroll:true});
    if(root.scrollY!==scrollY)root.scrollTo({top:scrollY,behavior:'instant'});
  }
  function open(requested) {
    if(dialog)close();
    skinDraft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));mode=requested;sourceId=service.snapshot().activeId;draft=null;confirmRemove=false;
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
      case 'cancel-skins':runtime.cancelSkins();skinDraft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));render();return;
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
    const reset=event.target.closest('[data-skin-reset]');if(reset){event.preventDefault();try{runtime.skins.resetAll(skinDraft,reset.dataset.skinReset,service.shown().skins[reset.dataset.skinReset]);runtime.previewSkins(skinDraft);render();}catch(error){status(errorText(error),true);}return;}
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
    if(target.dataset.skinFamily){try{const family=target.dataset.skinFamily,packId=target.dataset.skinPack||null;if(packId&&!target.value&&!skinDraft.main[family])runtime.skins.choose(skinDraft,family,service.shown().skins[family]||runtime.assets[family].default);runtime.skins.choose(skinDraft,family,target.value||null,packId);runtime.previewSkins(skinDraft);}catch(error){status(errorText(error),true);}return;}
    if(target.hasAttribute('data-appearance-choice')){
      sourceId=target.value;
      if(mode==='picker'){try{service.select(sourceId);close();}catch(error){status(errorText(error),true);}}
      else{confirmRemove=false;render();}
    }else if(draft&&target.dataset.appearanceSkin){draft.skins[target.dataset.appearanceSkin]=target.value;preview();}
  }
  function submit(event) {
    if(!dialog?.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.target.id==='skin-preferences'){try{runtime.saveSkins(skinDraft);skinDraft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));status(t('themes.skin-saved'));}catch(error){status(errorText(error),true);}return;}
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

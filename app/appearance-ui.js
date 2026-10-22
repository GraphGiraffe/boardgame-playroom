// An independent dialog changes local preferences without remounting a game scene.
(function (root) {
  'use strict';
  const document=root.document, UI=root.TabletopUI, H=UI.helpers;
  const runtime=root.PlayroomAppearanceWeb.create({document,resources:root.PlayroomAppearanceResources,
    storage:()=>root.localStorage,idFactory:()=>`custom-${root.crypto.randomUUID()}`});
  const service=runtime.service, t=(key,params)=>runtime.translator.text(key,params);
  let avatarDraft=null,packId=null,skinDraft=null,dialog=null,mode=null,sourceId=null,draft=null,returnFocus=null,scrollY=0,confirmRemove=false;
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
  function themeSlider() {
    const presets=service.list(),index=Math.max(0,presets.findIndex(preset=>preset.id===(draft?.id||sourceId)));
    return root.PlayroomGameScreen.rangeSetting({id:'appearance-theme-slider',label:t('themes.choose'),max:presets.length-1,value:index,display:label(presets[index]),choices:presets.map(preset=>({value:preset.id,label:label(preset)}))}).replace('id="appearance-theme-slider"','id="appearance-theme-slider" data-appearance-slider'+(draft?' disabled':''));
  }
  function editorFields() {
    if(!draft)return '';
    const groups=new Map();
    for(const key of Object.keys(draft.palette)){
      const group=key.split('.')[0];if(!groups.has(group))groups.set(group,[]);groups.get(group).push(key);
    }
    const colors=[...groups].map(([group,keys])=>`<fieldset class="appearance-palette-group"><legend>${esc(t('themes.group.'+group))}</legend><div class="appearance-palette-grid">${keys.map(key=>`<label class="appearance-color"><span>${esc(t('themes.color.'+key))}</span><input type="color" data-appearance-color="${esc(key)}" value="${esc(draft.palette[key])}"></label>`).join('')}</div></fieldset>`).join('');
    return `<form id="appearance-draft"><label class="field"><span>${esc(t('themes.name'))}</span><input type="text" name="themeName" maxlength="64" required value="${esc(draft.name)}" autocomplete="off"></label><details open><summary>${esc(t('themes.palette'))}</summary>${colors}</details><div class="appearance-actions appearance-confirm-actions">${actionButton('cancel-draft','themes.cancel')}<button type="submit" class="btn">${icon('check')}${esc(t('themes.save-apply'))}</button></div></form>`;
  }
  const skinFamilies=()=>{
    if(!packId)return [];
    const stage=document.querySelector('#app .game-scene[data-appearance-pack]');
    const active=stage?.hasAttribute('data-skin-families')?JSON.parse(stage.dataset.skinFamilies):null;
    return Object.entries(runtime.assets).filter(([family,asset])=>root.PlayroomCatalog[packId]?.skinFamilies?.includes(family)&&(!active||active.includes(family))&&asset.variants.length>1);
  };
  function skinSample(family,variant){
    const theme=service.shown(),resolver=new root.PlayroomGameComponents.AssetResolver({catalog:runtime.assets,palette:theme.palette,skinFor:()=>variant,renderers:root.PlayroomAssetResolver.renderers});
    let backUrl='';
    if(family==='card-back')try{backUrl=root.PlayroomPacks.exportView(packId).assets['assets/shared/card-back.svg']||'';}catch(_){}
    const characterSources=Object.fromEntries(['minimal','simple'].map(style=>[style,root.PlayroomAvatars.source('circle-red',style)]));
    const art=resolver.render(family,{character:'circle-red',characterSources,rank:'К',suit:'♣',value:1,a:6,b:3,size:3,king:false,movable:false,backUrl});
    const template=document.createElement('template');template.innerHTML=art;
    const box=template.content.querySelector('svg')?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
    const ratio=box?.length===4&&box[2]>0&&box[3]>0?box.slice(2).join('/'):runtime.assets[family].ratio.join('/');
    return {art,ratio};
  }
  function skinFields(){
    if(!skinDraft||!skinFamilies().length)return '';
    const game=root.PlayroomCatalog?.[packId],theme=service.shown();
    return `<section id="skin-preferences"><h3>${esc(t('themes.skins'))}${game?' · '+esc(game.name):''}</h3>${skinFamilies().map(([family,asset])=>{
      const current=runtime.skins.resolve(family,{packId,defaults:game?.defaultSkins||{},theme:theme.skins,draft:skinDraft});
      const groups=asset.variantGroups||[{id:'all',variants:asset.variants}];
      const rows=groups.map(group=>`<div class="appearance-skin-row" ${asset.variantGroups?`data-skin-group="${esc(group.id)}" role="group" aria-label="${esc(group.label||group.id)}"`:''}>${group.variants.filter(variant=>asset.variants.includes(variant)).map(variant=>{const name=asset.labels?.[variant]||(variant==='classic'?t('themes.standard'):variant),sample=skinSample(family,variant);return `<button type="button" class="appearance-skin-choice" data-skin-family="${esc(family)}" data-skin-variant="${esc(variant)}" data-skin-pack="${esc(packId)}" aria-label="${esc(name)}" title="${esc(name)}" aria-pressed="${current===variant}"><span class="appearance-skin-art" style="--sample-ratio:${sample.ratio}" data-preview-family="${esc(family)}">${sample.art}</span></button>`;}).join('')}</div>`).join('');
      return `<fieldset class="appearance-palette-group"><legend>${esc(t('themes.family.'+family))}</legend>${rows}</fieldset>`;
    }).join('')}</section>`;
  }

  function avatarFields(){
    if(packId)return '';
    return `<fieldset class="appearance-palette-group"><legend>${esc(t('themes.avatar-style'))}</legend><div class="appearance-avatar-options">${root.PlayroomAvatars.styles.map(style=>`<button type="button" class="avatar-option" data-avatar-style-choice="${style}" aria-label="${esc(t('themes.avatar-'+style))}" title="${esc(t('themes.avatar-'+style))}" aria-pressed="${avatarDraft===style}"><span class="avatar">${root.PlayroomAvatars.content('circle-red','',style)}</span></button>`).join('')}</div></fieldset>`;
  }
  function bodyMarkup() {
    if(mode==='picker')return `${themeSlider()}<p class="appearance-status" data-appearance-status role="status"></p>`;
    const preset=selected(),choice=themeSlider();
    const controls=!packId&&!draft&&!preset.builtin?`<div class="appearance-actions">${actionButton('edit','themes.edit','edit')}${actionButton('remove','themes.delete','trash')}</div>`:'';
    const remove=confirmRemove?`<section class="appearance-confirm"><p>${esc(t('themes.delete-question',{name:label(preset)}))}</p><div class="appearance-actions">${actionButton('confirm-remove','themes.delete','trash')}${actionButton('cancel-remove','themes.cancel')}</div></section>`:'';
    const content=draft?choice+editorFields():`<form id="appearance-selection"><div class="appearance-overview">${choice}${avatarFields()}</div>${controls}${remove}${skinFields()}<div class="appearance-actions appearance-confirm-actions">${actionButton('cancel-selection','themes.cancel')}<button type="submit" class="btn">${esc(t('themes.save-apply'))}</button></div></form>`;
    return `${content}<p class="appearance-status" data-appearance-status role="status"></p>`;
  }

  function render() {
    const body=dialog.querySelector('.appearance-body'),top=body.scrollTop;
    dialog.querySelector(':scope>.appearance-confirm-actions')?.remove();
    body.innerHTML=bodyMarkup();
    const footer=body.querySelector('.appearance-confirm-actions');
    if(footer){
      const form=footer.closest('form');
      for(const button of footer.querySelectorAll('button'))button.setAttribute('form',form.id);
      dialog.append(footer);
    }
    body.scrollTop=top;
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
    avatarDraft=service.avatarStyle();
    packId=document.querySelector('#app .game-scene[data-appearance-pack]')?.dataset.appearancePack||null;
    skinDraft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));mode=requested;sourceId=service.snapshot().activeId;draft=null;confirmRemove=false;
    returnFocus=document.activeElement;scrollY=root.scrollY;
    dialog=document.createElement('dialog');dialog.className='appearance-dialog appearance-'+mode;
    dialog.setAttribute('aria-labelledby','appearance-title');
    dialog.innerHTML=`<header class="appearance-head"><button type="button" class="icon-btn" data-appearance-action="close" aria-label="${esc(t('common.close'))}">${icon('close')}</button><h2 id="appearance-title">${esc(t(mode==='editor'?(packId?'themes.title':'themes.only-title'):'themes.quick'))}</h2><button type="button" class="icon-btn appearance-reset" data-appearance-action="reset-skins" aria-label="${esc(t('themes.reset-all-skins'))}" title="${esc(t('themes.reset-all-skins'))}">${icon('undo')}</button></header><div class="appearance-body"></div>`;
    document.body.append(dialog);render();
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.showModal();
  }
  function preview() {
    try{service.preview(draft);status();}catch(error){status(errorText(error),true);}
  }
  async function act(action) {
    switch(action){
      case 'close':close();return;
      case 'reset-skins':if(!await root.PlayroomGameScreen.confirmDialog(t('themes.confirm-reset-skins')))return;skinDraft={formatVersion:1,main:{},packs:{}};runtime.previewSkins(skinDraft);render();return;
      case 'cancel-selection':service.cancelPreview();avatarDraft=service.avatarStyle();runtime.cancelSkins();sourceId=service.snapshot().activeId;skinDraft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));render();return;
      case 'edit':draft=JSON.parse(JSON.stringify(selected()));confirmRemove=false;preview();render();return;
      case 'cancel-draft':service.cancelPreview();draft=null;render();return;
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
    const avatarChoice=event.target.closest('[data-avatar-style-choice]');if(avatarChoice){event.preventDefault();avatarDraft=avatarChoice.dataset.avatarStyleChoice;service.previewAvatarStyle(avatarDraft);render();dialog.querySelector(`[data-avatar-style-choice="${avatarDraft}"]`)?.focus({preventScroll:true});return;}
    const choice=event.target.closest('[data-skin-variant]');
    if(choice){event.preventDefault();try{runtime.skins.choose(skinDraft,choice.dataset.skinFamily,choice.dataset.skinVariant,packId);runtime.previewSkins(skinDraft);render();dialog.querySelector(`[data-skin-family="${choice.dataset.skinFamily}"][data-skin-variant="${choice.dataset.skinVariant}"]`)?.focus({preventScroll:true});}catch(error){status(errorText(error),true);}return;}
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
    if(target.hasAttribute('data-appearance-choice')||target.hasAttribute('data-appearance-slider')){
      sourceId=target.hasAttribute('data-appearance-slider')?service.list()[Number(target.value)]?.id:target.value;
      if(mode==='picker'){try{service.select(sourceId);close();}catch(error){status(errorText(error),true);}}
      else{try{service.previewSelection(sourceId);confirmRemove=false;render();}catch(error){status(errorText(error),true);}}
    }else if(draft&&target.dataset.appearanceSkin){draft.skins[target.dataset.appearanceSkin]=target.value;preview();}
  }
  function submit(event) {
    if(!dialog?.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.target.id==='appearance-selection'){try{if(service.snapshot().activeId!==sourceId)service.select(sourceId);else service.cancelPreview();if(skinDraft)runtime.saveSkins(skinDraft);if(!packId&&service.snapshot().avatarStyle!==avatarDraft)service.saveAvatarStyle(avatarDraft);close();}catch(error){status(errorText(error),true);}return;}
    if(event.target.id!=='appearance-draft'||!draft)return;
    try{draft.name=event.target.elements.themeName.value;service.saveDraft(draft,{activate:true});sourceId=draft.id;close();}
    catch(error){status(errorText(error),true);}
  }
  function keydown(event) {
    if(!dialog||document.querySelector(".app-confirm-dialog[open]"))return;
    event.stopImmediatePropagation();
    if(event.key==='Escape'){event.preventDefault();close();}
  }
  for(const [name,listener] of Object.entries({click,input,change,submit,keydown}))document.addEventListener(name,listener,true);
  root.PlayroomAppearanceUI=Object.freeze({runtime,text:t,settingsButton:()=>`<button type="button" class="btn secondary appearance-settings-shortcut" data-appearance-picker>${icon('palette')}${esc(t('themes.quick'))}</button>`,openPicker:()=>open('picker'),openEditor:()=>open('editor'),close,
    destroy(){close();for(const [name,listener]of Object.entries({click,input,change,submit,keydown}))document.removeEventListener(name,listener,true);runtime.destroy();}});
})(globalThis);

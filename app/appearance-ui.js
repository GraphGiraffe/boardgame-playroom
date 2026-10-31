/* Instant local theme toggle and game skins inside the existing settings window. */
(function(root){
 'use strict';
 const document=root.document,helpers=root.TabletopUI.helpers,esc=helpers.esc,icon=helpers.icon;
 const runtime=root.PlayroomAppearanceWeb.create({document,resources:root.PlayroomAppearanceResources,storage:()=>root.localStorage,idFactory:()=>`custom-${root.crypto.randomUUID()}`});
 const service=runtime.service,t=(key,params)=>runtime.translator.text(key,params),G=()=>root.PlayroomGameScreen;
 function settingsButton(){const dark=service.active().mode==='dark';return G().iconButton(`data-theme-toggle aria-pressed="${dark}"`,dark?'Включить светлую тему':'Включить тёмную тему',dark?'moon':'sun',{className:'settings-theme-toggle'});}
 function updateButtons(){const dark=service.active().mode==='dark';for(const button of document.querySelectorAll('[data-theme-toggle]')){button.innerHTML=icon(dark?'moon':'sun');button.setAttribute('aria-pressed',String(dark));button.title=button.ariaLabel=dark?'Включить светлую тему':'Включить тёмную тему';}}
 function families(packId){
  if(!packId)return [];
  const stage=document.querySelector('#app .game-scene[data-appearance-pack]'),active=stage?.hasAttribute('data-skin-families')?JSON.parse(stage.dataset.skinFamilies):null;
  return Object.entries(runtime.assets).filter(([family,asset])=>root.PlayroomCatalog[packId]?.skinFamilies?.includes(family)&&(!active||active.includes(family))&&asset.variants.length>1);
 }
 function sample(family,variant,packId){
  const resolver=new root.PlayroomGameComponents.AssetResolver({catalog:runtime.assets,palette:service.active().palette,skinFor:()=>variant,renderers:root.PlayroomAssetResolver.renderers});
  let backUrl='';if(family==='card-back')try{backUrl=root.PlayroomPacks.exportView(packId).assets['assets/shared/card-back.svg']||'';}catch{}
  const art=resolver.render(family,{character:'circle-red',characterSources:{minimal:root.PlayroomAvatars.source('circle-red')},rank:'К',suit:'♣',value:1,a:6,b:3,size:3,king:false,movable:false,backUrl}),template=document.createElement('template');template.innerHTML=art;
  const box=template.content.querySelector('svg')?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number),ratio=box?.length===4&&box[2]>0&&box[3]>0?box.slice(2).join('/'):runtime.assets[family].ratio.join('/');return {art,ratio};
 }
 function skinSettings(packId){
  const available=families(packId);if(!available.length)return '';
  const theme=service.active(),game=root.PlayroomCatalog[packId];
  return `<section id="skin-preferences" class="settings-skins" data-skin-game="${esc(packId)}"><header><h3>${esc(t('themes.skins'))}</h3>${G().iconButton('data-skin-reset', 'Сбросить скины этой игры','undo')}</header>${available.map(([family,asset])=>{
   const current=runtime.skins.resolve(family,{packId,defaults:game?.defaultSkins||{},theme:theme.skins}),groups=asset.variantGroups||[{id:'all',variants:asset.variants}];
   return `<fieldset class="appearance-palette-group"><legend>${esc(t('themes.family.'+family))}</legend>${groups.map(group=>`<div class="appearance-skin-row" ${asset.variantGroups?`data-skin-group="${esc(group.id)}" role="group" aria-label="${esc(group.label||group.id)}"`:''}>${group.variants.filter(variant=>asset.variants.includes(variant)).map(variant=>{const name=asset.labels?.[variant]||(variant==='classic'?t('themes.standard'):variant),s=sample(family,variant,packId);return `<button type="button" class="appearance-skin-choice" data-skin-family="${esc(family)}" data-skin-variant="${esc(variant)}" data-skin-pack="${esc(packId)}" aria-label="${esc(name)}" title="${esc(name)}" aria-pressed="${current===variant}"><span class="appearance-skin-art" style="--sample-ratio:${s.ratio}" data-preview-family="${esc(family)}">${s.art}</span></button>`;}).join('')}</div>`).join('')}</fieldset>`;
  }).join('')}</section>`;
 }
 function refreshSkinButtons(){const panel=document.getElementById('skin-preferences'),packId=panel?.dataset.skinGame;if(!packId)return;for(const button of panel.querySelectorAll('[data-skin-family]'))button.setAttribute('aria-pressed',String(runtime.skins.resolve(button.dataset.skinFamily,{packId,defaults:root.PlayroomCatalog[packId]?.defaultSkins||{},theme:service.active().skins})===button.dataset.skinVariant));}
 async function click(event){
  const theme=event.target.closest('[data-theme-toggle]');if(theme){event.preventDefault();event.stopImmediatePropagation();try{service.select(service.active().mode==='dark'?'light':'dark');}catch(error){root.PlayroomAppBridge?.toast(root.PlayroomMessages.error(error));}return;}
  const panel=event.target.closest('#skin-preferences');if(!panel)return;
  const choice=event.target.closest('[data-skin-variant]'),reset=event.target.closest('[data-skin-reset]');if(!choice&&!reset)return;
  event.preventDefault();event.stopImmediatePropagation();try{
   const packId=panel.dataset.skinGame,draft=JSON.parse(JSON.stringify(runtime.skins.snapshot()));
   if(reset){if(!await G().confirmDialog('Сбросить скины этой игры?'))return;delete draft.packs[packId];}else runtime.skins.choose(draft,choice.dataset.skinFamily,choice.dataset.skinVariant,packId);
   runtime.saveSkins(draft);refreshSkinButtons();
  }catch(error){root.PlayroomAppBridge?.toast(root.PlayroomMessages.error(error));}
 }
 document.addEventListener('click',click,true);document.addEventListener('playroom:appearance',updateButtons);
 root.PlayroomAppearanceUI=Object.freeze({runtime,text:t,settingsButton,skinSettings,destroy(){document.removeEventListener('click',click,true);document.removeEventListener('playroom:appearance',updateButtons);runtime.destroy();}});
})(globalThis);

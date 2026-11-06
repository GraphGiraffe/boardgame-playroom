/* Device appearance: a retained gallery frame and scoped component choices. */
(function(root){
 'use strict';
 const document=root.document,helpers=root.TabletopUI.helpers,esc=helpers.esc,icon=helpers.icon;
 const runtime=root.PlayroomAppearanceWeb.create({document,resources:root.PlayroomAppearanceResources,storage:()=>root.localStorage,idFactory:()=>`custom-${root.crypto.randomUUID()}`});
 const service=runtime.service,t=(key,params)=>runtime.translator.text(key,params),G=()=>root.PlayroomGameScreen;
 function settingsButton(){const dark=service.active().mode==='dark';return G().iconButton(`data-theme-toggle aria-pressed="${dark}"`,dark?'Включить светлую тему':'Включить тёмную тему',dark?'moon':'sun',{className:'settings-theme-toggle'});}
 function updateButtons(){const theme=service.active(),dark=theme.mode==='dark';for(const button of document.querySelectorAll('[data-theme-toggle]')){button.innerHTML=icon(dark?'moon':'sun');button.setAttribute('aria-pressed',String(dark));button.title=button.ariaLabel=dark?'Включить светлую тему':'Включить тёмную тему';}if(active(current)){current.theme=theme.id;for(const button of viewRoot().querySelectorAll('[data-theme-preset]'))button.setAttribute('aria-pressed',String(button.dataset.themePreset===theme.id));for(const button of viewRoot().querySelectorAll('[data-accent-color]'))button.setAttribute('aria-pressed',String((button.dataset.accentColor||null)===service.snapshot().accentColor));}}
 function accentPaletteMarkup(){return `<fieldset class="appearance-accent-palette"><legend>Акцент приложения</legend><div class="appearance-accent-colors">${(root.PlayroomMultiplayer?.COLORS||[]).map(([color,label],index)=>`<button type="button" data-accent-color="${index===0?'':esc(color)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${(index===0?null:color)===service.snapshot().accentColor}"><span class="appearance-accent-swatch" style="--accent-swatch:${esc(color)}">${icon('check')}</span><span>${esc(label)}</span></button>`).join('')}</div></fieldset>`;}

 function families(packId){
  if(!packId)return [];
  const stage=document.querySelector('#app .game-scene[data-appearance-pack]'),active=stage?.dataset.appearancePack===packId&&stage?.hasAttribute('data-skin-families')?JSON.parse(stage.dataset.skinFamilies):null;
  return Object.entries(runtime.assets).filter(([family,asset])=>root.PlayroomCatalog[packId]?.skinFamilies?.includes(family)&&(!active||active.includes(family))&&asset.variants.length>1);
 }
 function sample(family,variant,packId,palette=service.active().palette){
  const resolver=new root.PlayroomGameComponents.AssetResolver({catalog:runtime.assets,palette,skinFor:()=>variant,renderers:root.PlayroomAssetResolver.renderers});
  let backUrl='';if(family==='card-back')try{backUrl=root.PlayroomPacks.exportView(packId).assets['assets/shared/card-back.svg']||'';}catch{}
  const art=resolver.render(family,{character:'circle-red',characterSources:{minimal:root.PlayroomAvatars.source('circle-red')},rank:'К',suit:'♣',value:1,a:6,b:3,size:3,king:false,movable:false,backUrl}),template=document.createElement('template');template.innerHTML=art;
  const box=template.content.querySelector('svg')?.getAttribute('viewBox')?.trim().split(/\s+/).map(Number),ratio=box?.length===4&&box[2]>0&&box[3]>0?box.slice(2).join('/'):runtime.assets[family].ratio.join('/');return {art,ratio};
 }
 function skinSettings(packId,draft=null){
  const available=families(packId);if(!available.length)return '';
  const theme=service.active(),game=root.PlayroomCatalog[packId];
  return `<section id="skin-preferences" class="settings-skins" data-skin-game="${esc(packId)}"><header><h3>${esc(t('themes.skins'))}</h3>${G().iconButton('data-skin-reset', 'Сбросить скины этой игры','undo')}</header>${available.map(([family,asset])=>{
   const current=runtime.skins.resolve(family,{packId,defaults:game?.defaultSkins||{},theme:theme.skins,draft}),groups=asset.variantGroups||[{id:'all',variants:asset.variants}];
   return `<fieldset class="appearance-palette-group"><legend>${esc(t('themes.family.'+family))}</legend>${groups.map(group=>`<div class="appearance-skin-row" ${asset.variantGroups?`data-skin-group="${esc(group.id)}" role="group" aria-label="${esc(group.label||group.id)}"`:''}>${group.variants.filter(variant=>asset.variants.includes(variant)).map(variant=>{const name=asset.labels?.[variant]||(variant==='classic'?t('themes.standard'):variant),description=asset.variantGroups?group.label||'':'',label=[name,description].filter(Boolean).join(' · '),s=sample(family,variant,packId);return `<button type="button" class="appearance-skin-choice" data-skin-family="${esc(family)}" data-skin-variant="${esc(variant)}" data-skin-pack="${esc(packId)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${current===variant}"><span class="appearance-skin-art" style="--sample-ratio:${s.ratio}" data-preview-family="${esc(family)}">${s.art}<span class="appearance-choice-current" aria-hidden="true">${icon('check')}</span></span><span class="appearance-skin-label"><strong>${esc(name)}</strong>${description?`<small>${esc(description)}</small>`:''}</span></button>`;}).join('')}</div>`).join('')}</fieldset>`;
  }).join('')}</section>`;
 }
 let dialogs=null;const modalController=()=>dialogs||(dialogs=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')}));
 let current=null,lastPack='',destroyed=false;
 function active(view=current){return !!view&&!destroyed&&!view.disposed&&current===view&&dialogs.isActive(view.frame);}
 function viewRoot(view=current){return view?.frame?.element.querySelector('.appearance-gallery-modal');}
 function interactive(element){const host=modalController().activeRoot();return !!element?.isConnected&&!element.closest('[inert],[aria-hidden="true"]')&&(!host||host.contains(element));}
 function close(view=current){return active(view)&&dialogs.close(view.frame,{reason:'back'});}
 function gallerySkinContent(view){return skinSettings(view.pack,view.draft);}
 function paintSkins(view){const host=viewRoot(view)?.querySelector('[data-appearance-skins]');if(host)host.innerHTML=gallerySkinContent(view)||'<p class="appearance-empty">Для этой игры пока доступно только стандартное оформление в этом разделе.</p>';}
 function gallerySkins(view){
  const games=Object.entries(root.PlayroomCatalog||{}).filter(([id])=>families(id).length);
  if(!games.some(([id])=>id===view.pack))view.pack=games[0]?.[0]||'';
  return `${games.length?`<label class="field appearance-game-picker"><span>Игра</span><select data-appearance-game>${games.map(([id,game])=>`<option value="${esc(id)}" ${view.pack===id?'selected':''}>${esc(game.name||id)}</option>`).join('')}</select></label>`:''}<div data-appearance-skins>${gallerySkinContent(view)||'<p class="appearance-empty">Сейчас доступно только стандартное оформление компонентов.</p>'}</div>`;
 }
 function selectTab(view,tab,{focus=false}={}){
  if(!active(view)||!['theme','components'].includes(tab))return;
  view.tab=tab;const host=viewRoot(view);host.querySelector('.appearance-gallery-tabs').style.setProperty('--page-index',tab==='theme'?0:1);host.querySelector('.appearance-gallery-footer').hidden=tab==='theme';
  for(const item of host.querySelectorAll('[data-appearance-tab]')){const selected=item.dataset.appearanceTab===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;if(focus&&selected)item.focus({preventScroll:true});}
  for(const section of host.querySelectorAll('[data-appearance-section]'))section.hidden=section.dataset.appearanceSection!==(tab==='theme'?'theme':'skins');
  host.querySelector('[data-appearance-section="skins"]').setAttribute('aria-labelledby',`appearance-${view.frame.id}-${tab}`);paintSkins(view);
 }
 function show(){
  if(destroyed||current&&!current.disposed)return current?.frame||null;
  modalController();
  const pack=document.querySelector('#app .game-scene[data-appearance-pack]')?.dataset.appearancePack||lastPack;
  const view={theme:service.active().id,draft:JSON.parse(JSON.stringify(runtime.skins.snapshot())),tab:'theme',pack,explicitPack:!!pack,rememberPack:false,disposed:false,frame:null};current=view;
  const themes=['light','dark'].map(id=>runtime.catalog.builtin(id)).filter(Boolean);
  const cards=themes.map(theme=>{const p=theme.palette,preview=sample('domino',runtime.assets.domino.default,null,p);return `<button type="button" class="appearance-theme-choice" data-theme-preset="${esc(theme.id)}" aria-pressed="${view.theme===theme.id}"><span class="appearance-theme-preview" style="--preview-canvas:${p['surface.canvas']};--preview-panel:${p['surface.panel']};--preview-ink:${p['text.primary']};--preview-action:${p['action.primary']}"><span class="appearance-preview-component">${preview.art}</span></span><span>${esc(t('themes.'+theme.id))}</span><span class="appearance-choice-current" aria-hidden="true">${icon('check')}</span></button>`;}).join('');
  const content=`${G().modalHead('Оформление')}<div class="parameter-screen-content appearance-gallery">${G().pageTabs({label:'Раздел оформления',tabs:[['theme','Тема'],['components','Компоненты']],value:'theme',attribute:'data-appearance-tab',className:'appearance-gallery-tabs'})}<section data-appearance-section="theme" role="tabpanel"><div class="appearance-theme-grid">${cards}</div>${accentPaletteMarkup()}</section><section data-appearance-section="skins" role="tabpanel" hidden>${gallerySkins(view)}</section><p class="appearance-gallery-error" data-appearance-error role="status" hidden></p></div><footer class="modal-foot appearance-gallery-footer" data-fixed-footer hidden>${G().button({attrs:'data-appearance-cancel',label:'Отменить',variant:'secondary'})}${G().button({attrs:'data-appearance-apply',label:'Применить',icon:'check'})}</footer>`;
  view.frame=dialogs.open(`<div class="modal-backdrop"><section class="modal appearance-gallery-modal" data-ui-surface="screen" role="dialog" aria-modal="true" aria-label="Оформление">${G().modalContent(content)}</section></div>`,{mode:'push',valid:()=>!destroyed&&!view.disposed,meta:{owner:'appearance',kind:'appearance-gallery-modal',dismiss:()=>close(view)},onDispose:()=>{view.disposed=true;if(view.rememberPack)lastPack=view.pack;if(current===view)current=null;}});
  if(!view.frame){view.disposed=true;current=null;return null;}
  const host=viewRoot(view),back=host.querySelector('.modal-head [data-command="close-modal"]');if(back){back.innerHTML=icon('back');back.setAttribute('aria-label','Назад');back.title='Назад';}
  for(const section of host.querySelectorAll('[data-appearance-section]'))section.id=`appearance-${view.frame.id}-panel-${section.dataset.appearanceSection}`;
  for(const tab of host.querySelectorAll('[data-appearance-tab]')){tab.id=`appearance-${view.frame.id}-${tab.dataset.appearanceTab}`;tab.setAttribute('aria-controls',`appearance-${view.frame.id}-panel-${tab.dataset.appearanceTab==='theme'?'theme':'skins'}`);}
  host.querySelector('[data-appearance-section="theme"]').setAttribute('aria-labelledby',`appearance-${view.frame.id}-theme`);
  return view.frame;
 }
 function change(event){const control=event.target.closest('[data-appearance-game]'),view=current;if(!control||!active(view)||!viewRoot(view).contains(control))return;view.pack=control.value;view.explicitPack=true;view.rememberPack=true;paintSkins(view);}
 function keydown(event){const tab=event.target.closest('[data-appearance-tab]'),view=current;if(!tab||!active(view)||!viewRoot(view).contains(tab)||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=['theme','components'],index=tabs.indexOf(view.tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;event.preventDefault();selectTab(view,tabs[next],{focus:true});}
 function refreshSkinButtons(panel){const packId=panel?.dataset.skinGame;if(!packId)return;for(const button of panel.querySelectorAll('[data-skin-family]'))button.setAttribute('aria-pressed',String(runtime.skins.resolve(button.dataset.skinFamily,{packId,defaults:root.PlayroomCatalog[packId]?.defaultSkins||{},theme:service.active().skins})===button.dataset.skinVariant));}
 function report(error,view){if(view){if(!active(view))return;const target=viewRoot(view).querySelector('[data-appearance-error]');target.hidden=false;target.textContent=root.PlayroomMessages.error(error);}else root.PlayroomAppBridge?.toast(root.PlayroomMessages.error(error));}
 async function click(event){
  const open=event.target.closest('[data-appearance-open]');if(open){if(!interactive(open))return;event.preventDefault();event.stopImmediatePropagation();show();return;}
  const view=current,inGallery=!!viewRoot(view)?.contains(event.target);
  if(inGallery){
   if(!active(view))return;
   const button=event.target.closest('[data-appearance-apply],[data-appearance-cancel],[data-appearance-tab],[data-theme-preset],button[data-accent-color],.modal-head [data-command="close-modal"]');
   if(button){event.preventDefault();event.stopImmediatePropagation();
    if(button.hasAttribute('data-appearance-cancel')||button.matches('[data-command="close-modal"]')){close(view);return;}
    if(button.hasAttribute('data-appearance-tab')){selectTab(view,button.dataset.appearanceTab);return;}
    if(button.hasAttribute('data-theme-preset')||button.hasAttribute('data-accent-color')){try{if(button.hasAttribute('data-theme-preset'))service.select(button.dataset.themePreset);else service.setAccentColor(button.dataset.accentColor||null);}catch(error){report(error,view);}return;}
    try{runtime.saveSkins(view.draft);close(view);}catch(error){report(error,view);}return;
   }
  }
  const theme=event.target.closest('[data-theme-toggle]');if(theme){if(!interactive(theme))return;event.preventDefault();event.stopImmediatePropagation();try{service.select(service.active().mode==='dark'?'light':'dark');}catch(error){report(error);}return;}
  const panel=event.target.closest('#skin-preferences');if(!panel||!interactive(panel))return;
  const choice=event.target.closest('[data-skin-variant]'),reset=event.target.closest('[data-skin-reset]');if(!choice&&!reset)return;
  event.preventDefault();event.stopImmediatePropagation();
  const origin=modalController().activeRoot(),packId=panel.dataset.skinGame,isCurrent=()=>panel.isConnected&&panel.dataset.skinGame===packId&&dialogs.activeRoot()===origin&&interactive(panel);
  try{
   const draft=inGallery?view.draft:JSON.parse(JSON.stringify(runtime.skins.snapshot()));
   if(inGallery){view.explicitPack=true;view.rememberPack=true;if(reset)delete draft.packs[packId];else runtime.skins.choose(draft,choice.dataset.skinFamily,choice.dataset.skinVariant,packId);paintSkins(view);return;}
   if(reset){if(!await G().confirmDialog('Сбросить скины этой игры?')||!isCurrent())return;delete draft.packs[packId];}else runtime.skins.choose(draft,choice.dataset.skinFamily,choice.dataset.skinVariant,packId);
   if(!isCurrent())return;runtime.saveSkins(draft);refreshSkinButtons(panel);
  }catch(error){if(isCurrent())report(error,inGallery?view:null);}
 }
 document.addEventListener('click',click,true);document.addEventListener('change',change);document.addEventListener('keydown',keydown);document.addEventListener('playroom:appearance',updateButtons);
 root.PlayroomAppearanceUI=Object.freeze({runtime,text:t,settingsButton,skinSettings,show,destroy(){destroyed=true;dialogs?.dispose();document.removeEventListener('click',click,true);document.removeEventListener('change',change);document.removeEventListener('keydown',keydown);document.removeEventListener('playroom:appearance',updateButtons);runtime.destroy();}});
})(globalThis);

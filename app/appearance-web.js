// Web adapters for the platform-independent appearance and localization models.
(function (root) {
  'use strict';
  const KEY = 'playroom.appearance.v1';
  const aliases = {
    '--paper':'surface.canvas', '--white':'surface.panel', '--ink':'text.primary', '--muted':'text.secondary',
    '--green':'action.primary', '--line':'border.subtle', '--ui-focus':'interaction.available',
    '--ui-danger':'feedback.error', '--ui-action-outline':'interaction.available',
    '--round-token-fill':'token.face', '--round-token-side':'token.side',
    '--round-token-rim':'token.rim', '--round-token-mark':'token.mark',
    '--die-face':'material.die.face','--die-rim':'material.die.rim','--die-side':'material.die.side','--die-mark':'material.die.ink'
  };

  function create({document, resources, storage, idFactory}) {
    const catalog = new root.PlayroomAppearance.ThemeCatalog({presets:resources.presets, assets:resources.assets});
    const translator = new root.PlayroomLocalization.Translator({catalogs:resources.catalogs});
    const repository = {
      read() { const value=storage().getItem(KEY); return value===null?null:JSON.parse(value); },
      write(value) { storage().setItem(KEY,JSON.stringify(value)); }
    };
    const service = new root.PlayroomAppearance.AppearanceService({catalog, repository, idFactory});
    const skinKey='playroom.skins.v1';
    const skins=new root.PlayroomAppearance.SkinPreferences({assets:resources.assets,repository:{read(){const raw=storage().getItem(skinKey);return raw?JSON.parse(raw):null;},write(value){storage().setItem(skinKey,JSON.stringify(value));}}});
    let skinDraft=null;
    function apply(theme) {
      root.PlayroomAssetResolver=new root.PlayroomGameComponents.AssetResolver({catalog:resources.assets,skins:theme.skins,skinFor:(family,packId)=>skins.resolve(family,{packId,defaults:root.PlayroomCatalog?.[packId]?.defaultSkins||{},theme:theme.skins,draft:skinDraft}),palette:theme.palette,renderers:{'round-token':root.PlayroomComponents.roundTokenArt,counter:params=>params.style==='score'?root.PlayroomGameComponents.scoreBadge(params,{roundTokenArt:value=>root.PlayroomAssetResolver.render('round-token',value)}):root.PlayroomGameComponents.countBadge(params.value,params.label,params)}});
      const element = document.documentElement;
      for (const [name,value] of Object.entries(theme.palette)) element.style.setProperty('--color-'+name.replaceAll('.','-'),value);
      for (const [name,slot] of Object.entries(aliases)) element.style.setProperty(name,theme.palette[slot]);
      element.style.colorScheme=theme.mode;
      element.dataset.appearanceMode=theme.mode;
      element.dataset.appearancePreset=theme.id;
      element.dataset.avatarStyle=service.avatarStyle();
      for(const image of document.querySelectorAll('img[data-avatar-id]')){const src=root.PlayroomAvatars.source(image.dataset.avatarId,image.dataset.avatarStyle||service.avatarStyle());if(src)image.src=src;}
      for (const [family,variant] of Object.entries(theme.skins)) element.setAttribute('data-skin-'+family,variant);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette['surface.canvas']);
      let layoutChanged=false;
      for(const node of document.querySelectorAll('[data-asset-family][data-asset-params]')){const template=document.createElement('template');template.innerHTML=root.PlayroomAssetResolver.render(node.dataset.assetFamily,JSON.parse(node.dataset.assetParams));const fresh=template.content.firstElementChild;if(fresh&&fresh.tagName===node.tagName){if(fresh.dataset.cardStacking!==node.dataset.cardStacking)layoutChanged=true;for(const attribute of fresh.attributes)if(!attribute.name.startsWith('data-asset-'))node.setAttribute(attribute.name,attribute.value);if(node.tagName!=='TABLE')node.replaceChildren(...fresh.childNodes);}}
      // Stack geometry is part of the asset preview, independent of game actions.
      for(const node of document.querySelectorAll('[data-asset-stack-family]')){
        const packId=node.closest('[data-appearance-pack]')?.dataset.appearancePack;
        const stacking=root.PlayroomAssetResolver.resolve(node.dataset.assetStackFamily,{packId}).stacking;
        if(!stacking)continue;
        for(const [property,value] of [['--asset-stack-vertical',stacking.vertical],['--asset-stack-closed',stacking.faceDown]]){
          if(node.style.getPropertyValue(property)!==String(value))layoutChanged=true;
          node.style.setProperty(property,String(value));
        }
        if(node.dataset.assetStackAxis!==stacking.wasteAxis)layoutChanged=true;
        node.dataset.assetStackAxis=stacking.wasteAxis;
      }
      if(layoutChanged)for(const scene of document.querySelectorAll('.scene')){
        const host=scene.closest('.table-shell')?.parentElement||scene.parentElement;
        if(host)root.PlayroomGameScreen?.layoutScene(host);
      }
      // Dedicated preference notification: it does not invoke the game-options redraw path.
      document.dispatchEvent(new CustomEvent('playroom:appearance',{detail:{id:theme.id,mode:theme.mode}}));
    }
    const unsubscribe=service.subscribe(event=>apply(event.theme));
    apply(service.active());
    return Object.freeze({service,catalog,translator,skins,assets:resources.assets,
      previewSkins(draft){skinDraft=skins.validate(draft);apply(service.shown());},
      cancelSkins(){skinDraft=null;apply(service.shown());},
      saveSkins(draft){skins.save(draft);skinDraft=null;apply(service.shown());},destroy:unsubscribe});
  }
  root.PlayroomAppearanceWeb=Object.freeze({create,storageKey:KEY});
})(globalThis);

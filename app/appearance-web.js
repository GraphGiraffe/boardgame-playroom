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
    function apply(theme) {
      const previousResolver=root.PlayroomAssetResolver;
      root.PlayroomAssetResolver=new root.PlayroomGameComponents.AssetResolver({catalog:resources.assets,skins:theme.skins,palette:theme.palette,renderers:{'round-token':root.PlayroomComponents.roundTokenArt,counter:params=>params.style==='score'?root.PlayroomGameComponents.scoreBadge(params,{roundTokenArt:value=>root.PlayroomAssetResolver.render('round-token',value)}):root.PlayroomGameComponents.countBadge(params.value,params.label,params)}});
      const element = document.documentElement;
      for (const [name,value] of Object.entries(theme.palette)) element.style.setProperty('--color-'+name.replaceAll('.','-'),value);
      for (const [name,slot] of Object.entries(aliases)) element.style.setProperty(name,theme.palette[slot]);
      element.style.colorScheme=theme.mode;
      element.dataset.appearanceMode=theme.mode;
      element.dataset.appearancePreset=theme.id;
      for (const [family,variant] of Object.entries(theme.skins)) element.setAttribute('data-skin-'+family,variant);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette['surface.canvas']);
      for(const node of document.querySelectorAll('[data-asset-family][data-asset-params]')){if(node.dataset.assetFamily!=='card-back'&&previousResolver?.resolve(node.dataset.assetFamily).variant===root.PlayroomAssetResolver.resolve(node.dataset.assetFamily).variant)continue;const template=document.createElement('template');template.innerHTML=root.PlayroomAssetResolver.render(node.dataset.assetFamily,JSON.parse(node.dataset.assetParams));const fresh=template.content.firstElementChild;if(fresh&&fresh.tagName===node.tagName){for(const attribute of fresh.attributes)if(!attribute.name.startsWith('data-asset-'))node.setAttribute(attribute.name,attribute.value);if(node.tagName!=='TABLE')node.replaceChildren(...fresh.childNodes);}}
      // Dedicated preference notification: it does not invoke the game-options redraw path.
      document.dispatchEvent(new CustomEvent('playroom:appearance',{detail:{id:theme.id,mode:theme.mode}}));
    }
    const unsubscribe=service.subscribe(event=>apply(event.theme));
    apply(service.active());
    return Object.freeze({service,catalog,translator,assets:resources.assets,destroy:unsubscribe});
  }
  root.PlayroomAppearanceWeb=Object.freeze({create,storageKey:KEY});
})(globalThis);

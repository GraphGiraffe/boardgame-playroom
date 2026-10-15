// Web adapters for the platform-independent appearance and localization models.
(function (root) {
  'use strict';
  const KEY = 'playroom.appearance.v1';
  const aliases = {
    '--paper':'surface.canvas', '--white':'surface.panel', '--ink':'text.primary', '--muted':'text.secondary',
    '--green':'action.primary', '--line':'border.subtle', '--ui-focus':'interaction.available',
    '--ui-danger':'feedback.error', '--ui-action-outline':'interaction.available',
    '--round-token-fill':'token.face', '--round-token-side':'token.side',
    '--round-token-rim':'token.rim', '--round-token-mark':'token.mark'
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
      const element = document.documentElement;
      for (const [name,value] of Object.entries(theme.palette)) element.style.setProperty('--color-'+name.replaceAll('.','-'),value);
      for (const [name,slot] of Object.entries(aliases)) element.style.setProperty(name,theme.palette[slot]);
      element.style.colorScheme=theme.mode;
      element.dataset.appearanceMode=theme.mode;
      element.dataset.appearancePreset=theme.id;
      for (const [family,variant] of Object.entries(theme.skins)) element.setAttribute('data-skin-'+family,variant);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette['surface.canvas']);
      // Dedicated preference notification: it does not invoke the game-options redraw path.
      document.dispatchEvent(new CustomEvent('playroom:appearance',{detail:{id:theme.id,mode:theme.mode}}));
    }
    const unsubscribe=service.subscribe(event=>apply(event.theme));
    apply(service.active());
    return Object.freeze({service,catalog,translator,assets:resources.assets,destroy:unsubscribe});
  }
  root.PlayroomAppearanceWeb=Object.freeze({create,storageKey:KEY});
})(globalThis);

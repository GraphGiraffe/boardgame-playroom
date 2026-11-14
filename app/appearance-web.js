// Web adapters for the platform-independent appearance and localization models.
(function (root) {
  'use strict';
  const KEY = 'playroom.appearance.v1';
  const aliases = {
    '--paper':'surface.canvas', '--white':'surface.panel', '--ink':'text.primary', '--muted':'text.secondary',
    '--green':'action.primary', '--accent':'action.primary', '--lime':'surface.selected', '--line':'border.subtle', '--ui-focus':'interaction.available',
    '--ui-danger':'feedback.error', '--ui-action-outline':'interaction.available',
    '--round-token-fill':'token.face', '--round-token-side':'token.side',
    '--round-token-rim':'token.rim', '--round-token-mark':'token.mark',
    '--die-face':'material.die.face','--die-rim':'material.die.rim','--die-side':'material.die.side','--die-mark':'material.die.ink'
  };

  function create({document, resources, storage, idFactory}) {
    const catalog = new root.PlayroomAppearance.ThemeCatalog({presets:resources.presets, assets:resources.assets});
    const translator = new root.PlayroomLocalization.Translator({catalogs:resources.catalogs});
    const repository = {
      read() { const raw=storage().getItem(KEY);if(raw===null)return null;const value=JSON.parse(raw);if(value&& !['light','dark'].includes(value.activeId)){const previous=value.presets?.find(p=>p.id===value.activeId);value.activeId=previous?.mode==='dark'?'dark':'light';}return value; },
      write(value) { storage().setItem(KEY,JSON.stringify(value)); }
    };
    const service = new root.PlayroomAppearance.AppearanceService({catalog, repository, idFactory});
    const skinKey='playroom.skins.v1';
    const skins=new root.PlayroomAppearance.SkinPreferences({assets:resources.assets,repository:{read(){const raw=storage().getItem(skinKey);return raw?JSON.parse(raw):null;},write(value){storage().setItem(skinKey,JSON.stringify(value));}}});
    let skinDraft=null;
    function accentPalette(theme){
      const color=service.snapshot().accentColor;if(!color)return theme.palette;
      const rgb=value=>value.slice(1).match(/../g).map(v=>parseInt(v,16));
      const mix=(base,accent,amount)=>'#'+rgb(base).map((v,i)=>Math.round(v*(1-amount)+rgb(accent)[i]*amount).toString(16).padStart(2,'0')).join('');
      const luminance=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
      const palette={...theme.palette},dark=theme.mode==='dark',base=dark?'#000000':'#fffef8';
      for(const [slot,amount] of Object.entries({'surface.panel':dark?.16:0,'surface.raised':dark?.24:.1,'surface.hover':dark?.3:.13,'surface.selected':dark?.36:.2,'border.subtle':dark?.58:.2,'border.strong':dark?.75:.5,'surface.game':dark?.24:.16,'table.column':.12,'table.header':.22,'table.summary':.08,'table.action':.18,'fleet.face':.12,'material.board.light':dark?.18:.12,'material.board.dark':dark?.45:.5,'material.board.frame':.04,'material.board.rim':.2,'material.route.face':.04,'material.route.rim':.5,'material.route.grid':.28,'material.route.base':.04,'material.route.safe':.18}))if(slot in palette)palette[slot]=mix(base,color,amount);
      // Slot colours identify the hue; the action tone must also work as text,
      // a filled button and a focus outline in the current theme.
      let primary=color;
      for(let step=0;step<=25;step++){
        primary=mix(color,dark?'#ffffff':'#000000',step/25);
        if(contrast(primary,palette['action.on-primary'])>=4.5&&['surface.canvas','surface.panel','surface.raised','surface.hover','surface.selected'].every(slot=>contrast(primary,palette[slot])>=4.5))break;
      }
      palette['action.primary']=primary;
      palette['interaction.available']=primary;
      return palette;
    }
    function apply(theme) {
      theme={...theme,palette:accentPalette(theme)};
      root.PlayroomAssetResolver=new root.PlayroomGameComponents.AssetResolver({catalog:resources.assets,skins:theme.skins,skinFor:(family,packId)=>skins.resolve(family,{packId,defaults:root.PlayroomCatalog?.[packId]?.defaultSkins||{},theme:theme.skins,draft:skinDraft}),palette:theme.palette,renderers:{'round-token':root.PlayroomComponents.roundTokenArt,counter:params=>params.style==='score'?root.PlayroomGameComponents.scoreBadge(params,{roundTokenArt:value=>root.PlayroomAssetResolver.render('round-token',value)}):root.PlayroomGameComponents.countBadge(params.value,params.label,params)}});
      const element = document.documentElement;
      for (const [name,value] of Object.entries(theme.palette)) element.style.setProperty('--color-'+name.replaceAll('.','-'),value);
      for (const [name,slot] of Object.entries(aliases)) element.style.setProperty(name,theme.palette[slot]);
      element.style.colorScheme=theme.mode;
      element.style.backgroundColor=theme.palette['surface.canvas'];
      document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme.mode);
      element.dataset.appearanceMode=theme.mode;
      element.dataset.appearancePreset=theme.id;
      element.dataset.appearanceAccentColor=service.snapshot().accentColor||'default';
      element.dataset.avatarStyle=service.avatarStyle();
      for(const image of document.querySelectorAll('img[data-avatar-id]')){const src=root.PlayroomAvatars.source(image.dataset.avatarId,image.dataset.avatarStyle||service.avatarStyle());if(src)image.src=src;}
      for (const [family,variant] of Object.entries(theme.skins)) element.setAttribute('data-skin-'+family,variant);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.palette['surface.canvas']);
      let layoutChanged=false;
      const geometry=new Map();
      const recordGeometry=(family,params={})=>{const value=root.PlayroomAssetResolver.resolve(family,params);geometry.set(JSON.stringify([family,params.packId||null]),[value.variant,value.stacking,value.ratio]);};
      for(const node of document.querySelectorAll('[data-asset-family][data-asset-params]')){
        const template=document.createElement('template'),params=JSON.parse(node.dataset.assetParams),port=node.parentElement?.hasAttribute('data-asset-placement')?node.parentElement:null;
        const drawing=root.PlayroomAssetResolver.render(node.dataset.assetFamily,params);
        template.innerHTML=port?'<svg>'+root.PlayroomGameComponents.vector.place(drawing,JSON.parse(port.dataset.assetPlacement))+'</svg>':drawing;
        const placed=port?template.content.firstElementChild.firstElementChild:null,fresh=placed?placed.firstElementChild:template.content.firstElementChild;
        if(fresh&&fresh.tagName===node.tagName){
          recordGeometry(node.dataset.assetFamily,params);
          if(fresh.dataset.cardStacking!==node.dataset.cardStacking)layoutChanged=true;
          // The source plane may change between skins; refit inside the same box.
          if(placed)for(const attribute of placed.attributes)port.setAttribute(attribute.name,attribute.value);
          for(const attribute of fresh.attributes)if(!attribute.name.startsWith('data-asset-'))node.setAttribute(attribute.name,attribute.value);
          if(node.tagName!=='TABLE')node.replaceChildren(...fresh.childNodes);
        }
      }
      // Stack geometry is part of the asset preview, independent of game actions.
      for(const node of document.querySelectorAll('[data-asset-stack-family]')){
        const packId=node.closest('[data-appearance-pack]')?.dataset.appearancePack;
        const stacking=root.PlayroomAssetResolver.resolve(node.dataset.assetStackFamily,{packId}).stacking;
        if(!stacking)continue;
        recordGeometry(node.dataset.assetStackFamily,{packId});
        for(const [property,value] of [['--asset-stack-horizontal',stacking.horizontal],['--asset-stack-vertical',stacking.vertical],['--asset-stack-closed',stacking.faceDown]]){
          if(node.style.getPropertyValue(property)!==String(value))layoutChanged=true;
          node.style.setProperty(property,String(value));
        }
        if(node.dataset.assetStackAxis!==stacking.wasteAxis)layoutChanged=true;
        node.dataset.assetStackAxis=stacking.wasteAxis;
      }
      const geometryKey=JSON.stringify([...geometry].sort(([a],[b])=>a.localeCompare(b)));
      if(element.dataset.assetGeometry!==geometryKey){element.dataset.assetGeometry=geometryKey;layoutChanged=true;}
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

// Local preferences only. Persistence, IDs and asset availability are injected.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayroomAppearance = api;
})(globalThis, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
  function freeze(value) {
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value)) freeze(entry);
      Object.freeze(value);
    }
    return value;
  }
  class AppearanceError extends Error {
    constructor(code) {
      super(code);
      this.name = 'AppearanceError';
      this.code = code;
    }
  }
  const requireValue = (valid, code) => { if (!valid) throw new AppearanceError(code); };

  class ThemeCatalog {
    #builtins = new Map();
    #slots;
    #assets;
    constructor({presets, assets, defaultId = 'light'}) {
      requireValue(Array.isArray(presets) && presets.length > 0 && record(presets[0]?.palette), 'PRESETS_INVALID');
      this.#slots = Object.keys(presets[0].palette);
      requireValue(this.#slots.length > 0, 'PALETTE_INVALID');
      requireValue(record(assets) && Object.keys(assets).length > 0, 'ASSETS_INVALID');
      for (const [family, asset] of Object.entries(assets)) {
        requireValue(idPattern.test(family) && record(asset) && Array.isArray(asset.variants) &&
          asset.variants.length > 0 && asset.variants.every(id => typeof id === 'string' && idPattern.test(id)) &&
          new Set(asset.variants).size === asset.variants.length && asset.variants.includes(asset.default), 'ASSETS_INVALID');
      }
      this.#assets = freeze(clone(assets));
      for (const source of presets) {
        requireValue(record(source) && typeof source.id === 'string' && idPattern.test(source.id) &&
          !this.#builtins.has(source.id) && typeof source.nameKey === 'string' && source.nameKey.length > 0, 'PRESET_INVALID');
        const preset = this.validate(source);
        this.#builtins.set(source.id, freeze({...preset, nameKey:source.nameKey, builtin:true}));
      }
      requireValue(this.#builtins.has(defaultId), 'DEFAULT_PRESET_MISSING');
      this.defaultId = defaultId;
      Object.freeze(this);
    }

    validate(source) {
      requireValue(record(source) && source.formatVersion === 1 &&
        typeof source.id === 'string' && idPattern.test(source.id) && ['light','dark'].includes(source.mode), 'PRESET_INVALID');
      requireValue(record(source.palette) && Object.keys(source.palette).length === this.#slots.length &&
        this.#slots.every(key => Object.hasOwn(source.palette, key) &&
          typeof source.palette[key] === 'string' && /^#[a-f0-9]{6}$/i.test(source.palette[key])), 'PALETTE_INVALID');
      requireValue(record(source.skins) && Object.keys(source.skins).every(family=>Object.hasOwn(this.#assets,family)) &&
        Object.keys(this.#assets).every(family => !Object.hasOwn(source.skins,family)?this.#assets[family].optional===true:
          typeof source.skins[family] === 'string' && idPattern.test(source.skins[family])), 'SKINS_INVALID');
      const preset = {formatVersion:1, id:source.id, mode:source.mode, palette:clone(source.palette), skins:Object.fromEntries(Object.entries(this.#assets).map(([family,asset])=>[family,source.skins[family]||asset.default]))};
      if (source.name !== undefined) {
        requireValue(typeof source.name === 'string' && source.name.trim().length > 0 && source.name.trim().length <= 64, 'PRESET_NAME_INVALID');
        preset.name = source.name.trim();
      }
      if (source.sourceId !== undefined) {
        requireValue(typeof source.sourceId === 'string' && idPattern.test(source.sourceId), 'PRESET_INVALID');
        preset.sourceId = source.sourceId;
      }
      return preset;
    }

    builtin(id) { return this.#builtins.get(id) || null; }
    builtins() { return Object.freeze([...this.#builtins.values()]); }
    isBuiltin(id) { return this.#builtins.has(id); }

    resolve(source) {
      const result = clone(source), missing = [];
      for (const [family, asset] of Object.entries(this.#assets)) {
        if (!asset.variants.includes(result.skins[family])) {
          missing.push({family, variant:result.skins[family]});
          result.skins[family] = asset.default;
        }
      }
      return freeze({...result, unavailableSkins:missing});
    }
  }

  class AppearanceService {
    #catalog;
    #repository;
    #idFactory;
    #state;
    #preview = null;
    #avatarPreview = null;
    #listeners = new Set();
    #warnings = [];
    constructor({catalog, repository, idFactory}) {
      requireValue(catalog instanceof ThemeCatalog && repository &&
        typeof repository.read === 'function' && typeof repository.write === 'function', 'APPEARANCE_PORT_INVALID');
      this.#catalog = catalog;
      this.#repository = repository;
      this.#idFactory = idFactory;
      this.#state = freeze({formatVersion:1, activeId:catalog.defaultId, presets:[],avatarStyle:'minimal'});
      try {
        const saved = repository.read();
        if (saved != null) {
          requireValue(record(saved) && saved.formatVersion === 1 && Array.isArray(saved.presets) &&
            saved.presets.length <= 32 && typeof saved.activeId === 'string', 'PREFERENCES_INVALID');
          const presets = [], seen = new Set();
          for (const source of saved.presets) {
            try {
              const preset = catalog.validate(source);
              requireValue(!catalog.isBuiltin(preset.id) && !seen.has(preset.id) && typeof preset.name === 'string', 'CUSTOM_PRESET_INVALID');
              seen.add(preset.id); presets.push(preset);
            } catch (error) { this.#warnings.push(error.code || 'CUSTOM_PRESET_INVALID'); }
          }
          const validActive = catalog.isBuiltin(saved.activeId) || seen.has(saved.activeId);
          if (!validActive) this.#warnings.push('ACTIVE_PRESET_MISSING');
          this.#state = freeze({formatVersion:1, activeId:validActive?saved.activeId:catalog.defaultId, presets,avatarStyle:['minimal','simple'].includes(saved.avatarStyle)?saved.avatarStyle:'minimal'});
        }
      } catch (error) { this.#warnings.push(error.code || 'PREFERENCES_UNAVAILABLE'); }
    }

    snapshot() { return this.#state; }
    warnings() { return Object.freeze([...this.#warnings]); }
    list() { return Object.freeze([...this.#catalog.builtins(), ...this.#state.presets]); }
    #find(id) {
      const preset = this.list().find(item => item.id === id);
      requireValue(preset, 'PRESET_NOT_FOUND');
      return preset;
    }
    active() { return this.#catalog.resolve(this.#find(this.#state.activeId)); }
    shown() { return this.#preview || this.active(); }
    subscribe(listener) {
      requireValue(typeof listener === 'function', 'LISTENER_INVALID');
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    }
    #emit(type) {
      const event = freeze({type, theme:this.shown()});
      for (const listener of this.#listeners) {
        try { listener(event); }
        catch (_) { if (!this.#warnings.includes('LISTENER_FAILED')) this.#warnings.push('LISTENER_FAILED'); }
      }
    }
    #commit(next, type) {
      // Persist before changing live preferences, so a storage error rolls back.
      this.#repository.write(clone(next));
      this.#state = freeze(next);
      this.#preview = null;this.#avatarPreview=null;
      this.#emit(type);
    }
    createDraft(sourceId, name) {
      requireValue(typeof this.#idFactory === 'function', 'ID_SOURCE_REQUIRED');
      const source = this.#find(sourceId), id = this.#idFactory();
      requireValue(typeof id === 'string' && idPattern.test(id) && !this.list().some(item => item.id === id), 'PRESET_ID_INVALID');
      return this.#catalog.validate({...clone(source), id, name, sourceId});
    }
    preview(draft) {
      requireValue(!this.#catalog.isBuiltin(draft?.id), 'BUILTIN_IMMUTABLE');
      this.#preview = this.#catalog.resolve(this.#catalog.validate(draft));
      this.#emit('preview');
      return this.#preview;
    }
    previewSelection(id) {
      this.#preview=this.#catalog.resolve(this.#find(id));
      this.#emit('preview');
      return this.#preview;
    }
    avatarStyle(){return this.#avatarPreview||this.#state.avatarStyle||'minimal';}
    previewAvatarStyle(style){requireValue(['minimal','simple'].includes(style),'AVATAR_STYLE_INVALID');this.#avatarPreview=style;this.#emit('avatar-preview');}
    saveAvatarStyle(style){requireValue(['minimal','simple'].includes(style),'AVATAR_STYLE_INVALID');this.#commit({...clone(this.#state),avatarStyle:style},'avatar-saved');}
    cancelPreview() { this.#preview = null;this.#avatarPreview=null;this.#emit('preview-cancelled'); }
    saveDraft(draft, {activate = false} = {}) {
      requireValue(!this.#catalog.isBuiltin(draft?.id), 'BUILTIN_IMMUTABLE');
      const preset = this.#catalog.validate(draft);
      requireValue(typeof preset.name === 'string', 'PRESET_NAME_INVALID');
      const exists = this.#state.presets.some(item => item.id === preset.id);
      requireValue(exists || this.#state.presets.length < 32, 'PRESET_LIMIT');
      const presets = this.#state.presets.filter(item => item.id !== preset.id).concat(preset);
      this.#commit({...clone(this.#state),formatVersion:1, activeId:activate?preset.id:this.#state.activeId, presets}, 'saved');
      return this.#catalog.resolve(preset);
    }
    select(id) {
      this.#find(id);
      this.#commit({...clone(this.#state), activeId:id}, 'selected');
      return this.active();
    }
    rename(id, name) {
      requireValue(!this.#catalog.isBuiltin(id), 'BUILTIN_IMMUTABLE');
      return this.saveDraft({...clone(this.#find(id)), name});
    }
    remove(id) {
      requireValue(!this.#catalog.isBuiltin(id), 'BUILTIN_IMMUTABLE');
      this.#find(id);
      this.#commit({...clone(this.#state),formatVersion:1, activeId:this.#state.activeId===id?this.#catalog.defaultId:this.#state.activeId,
        presets:this.#state.presets.filter(item => item.id !== id)}, 'removed');
    }
  }

  // Separate local preferences: changing a theme never removes per-game choices.
  class SkinPreferences {
    constructor({assets,repository}) {
      this.assets=assets;this.repository=repository;this.state={formatVersion:1,main:{},packs:{}};
      try{const saved=repository.read();if(saved)this.state=this.validate(saved);}catch(_){/* Corrupt local preferences use safe defaults. */}
    }
    validate(value){
      requireValue(record(value)&&value.formatVersion===1&&record(value.main)&&record(value.packs),'SKINS_INVALID');
      const skins=map=>record(map)&&Object.entries(map).every(([family,id])=>Object.hasOwn(this.assets,family)&&typeof id==='string'&&idPattern.test(id));
      requireValue(skins(value.main)&&Object.keys(value.packs).length<=1024&&Object.entries(value.packs).every(([id,map])=>/^[a-z][a-z0-9_-]{0,63}$/.test(id)&&skins(map)),'SKINS_INVALID');return clone(value);
    }
    snapshot(){return freeze(clone(this.state));}
    choose(draft,family,variant,packId=null){
      requireValue(Object.hasOwn(this.assets,family)&&(variant===null||packId&&variant==='inherit'||this.assets[family].variants.includes(variant))&&(!packId||/^[a-z][a-z0-9_-]{0,63}$/.test(packId)),'SKINS_INVALID');
      const target=packId?(Object.hasOwn(draft.packs,packId)?draft.packs[packId]:(draft.packs[packId]={})):draft.main;
      if(variant===null)delete target[family];else target[family]=variant;
    }
    resetAll(draft,family,fallback){
      requireValue(Object.hasOwn(this.assets,family),'SKINS_INVALID');
      // Materialize Main so pack defaults do not reappear after resetting.
      this.choose(draft,family,draft.main[family]||fallback||this.assets[family].default);
      for(const map of Object.values(draft.packs))delete map[family];
    }
    resolve(family,{packId=null,defaults={},theme={},draft=null}={}){
      const state=draft||this.state,spec=this.assets[family];
      requireValue(spec,'SKINS_INVALID');
      const individual=Object.hasOwn(state.packs,packId)?state.packs[packId][family]:null;
      const requested=(individual==='inherit'?state.main[family]||theme[family]:individual||state.main[family]||defaults[family]||theme[family])||spec.default;
      return spec.variants.includes(requested)?requested:spec.default;
    }
    save(draft){const next=this.validate(draft);this.repository.write(clone(next));this.state=next;return this.snapshot();}
  }

  return Object.freeze({ThemeCatalog, AppearanceService, AppearanceError, SkinPreferences});
});

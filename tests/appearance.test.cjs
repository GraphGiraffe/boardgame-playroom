'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {ThemeCatalog, AppearanceService} = require('../application/appearance.js');
const presets = [require('../themes/light.json'), require('../themes/dark.json')];
const assets = require('../themes/assets.json');
const copy = value => JSON.parse(JSON.stringify(value));
function environment(saved = null) {
  let stored = copy(saved), failure = false, writes = 0, sequence = 0;
  const catalog = new ThemeCatalog({presets, assets});
  const repository = {read:()=>copy(stored), write:value=>{if(failure)throw Error('quota'); stored=copy(value);writes++;}};
  const service = new AppearanceService({catalog, repository, idFactory:()=>`custom-${++sequence}`});
  return {catalog, repository, service, stored:()=>copy(stored), writes:()=>writes, fail:value=>{failure=value;}};
}

test('built-in themes are immutable and have the same semantic slots and asset families', () => {
  const {catalog, service} = environment();
  assert.deepEqual(service.list().map(item=>item.id), ['light','dark']);
  assert.deepEqual(Object.keys(presets[0].palette), Object.keys(presets[1].palette));
  assert.deepEqual(Object.keys(presets[0].skins), Object.keys(assets));
  const messages=require('../locales/ru/themes.json');
  for(const slot of Object.keys(presets[0].palette))assert.equal(typeof messages['themes.color.'+slot],'string','Missing theme editor label: '+slot);
  const original = copy(catalog.builtin('light'));
  assert.throws(()=>{catalog.builtin('light').palette['surface.canvas']='#000000';}, TypeError);
  for(const id of ['light','dark']) {
    assert.throws(()=>service.remove(id), /BUILTIN_IMMUTABLE/);
    assert.throws(()=>service.rename(id,'Changed'), /BUILTIN_IMMUTABLE/);
    assert.throws(()=>service.saveDraft({...copy(catalog.builtin(id)),name:'Changed'}), /BUILTIN_IMMUTABLE/);
  }
  assert.deepEqual(catalog.builtin('light'), original);
});

test('copy, preview, cancel and save use independent state and explicit persistence', () => {
  const e=environment(), events=[];
  e.service.subscribe(event=>events.push(event.type));
  const draft=e.service.createDraft('dark','Ночная');
  draft.palette['surface.canvas']='#111111';
  e.service.preview(draft);
  assert.equal(e.service.shown().palette['surface.canvas'],'#111111');
  assert.equal(e.service.active().id,'light');
  assert.equal(e.writes(),0);
  e.service.cancelPreview();
  assert.equal(e.service.shown().id,'light');
  e.service.saveDraft(draft,{activate:true});
  assert.equal(e.service.active().id,draft.id);
  draft.palette['surface.canvas']='#ffffff';
  assert.equal(e.service.active().palette['surface.canvas'],'#111111');
  assert.equal(e.catalog.builtin('dark').palette['surface.canvas'],presets[1].palette['surface.canvas']);
  assert.deepEqual(events,['preview','preview-cancelled','saved']);
  assert.equal(e.stored().activeId,'custom-1');
});

test('copies of custom themes survive source modification and deletion', () => {
  const {service}=environment();
  const first=service.createDraft('light','Первая');service.saveDraft(first,{activate:true});
  const second=service.createDraft(first.id,'Вторая');service.saveDraft(second,{activate:true});
  service.rename(first.id,'Изменённая');
  service.remove(first.id);
  assert.equal(service.active().name,'Вторая');
  assert.equal(service.active().sourceId,first.id);
  service.remove(second.id);
  assert.equal(service.active().id,'light');
});

test('storage failure preserves active preset, saved state and preview', () => {
  const e=environment(), draft=e.service.createDraft('dark','Черновик');
  e.service.preview(draft);
  const before=e.service.snapshot();e.fail(true);
  assert.throws(()=>e.service.saveDraft(draft,{activate:true}), /quota/);
  assert.equal(e.service.snapshot(),before);
  assert.equal(e.service.shown().id,draft.id);
  assert.equal(e.stored(),null);
  assert.throws(()=>e.service.select('dark'), /quota/);
  assert.equal(e.service.active().id,'light');
});

test('unavailable skin resolves to default without changing saved preference', () => {
  const e=environment(), draft=e.service.createDraft('light','Скин');
  draft.skins.die='not-installed';e.service.saveDraft(draft,{activate:true});
  const active=e.service.active();
  assert.equal(active.skins.die,'classic');
  assert.deepEqual(active.unavailableSkins,[{family:'die',variant:'not-installed'}]);
  assert.equal(e.stored().presets[0].skins.die,'not-installed');
});

test('loading keeps valid custom themes, rejects corrupt ones and reports missing active preset', () => {
  const first=environment(), draft=first.service.createDraft('dark','Сохранённая');
  first.service.saveDraft(draft,{activate:true});
  const saved=first.stored();saved.presets.push({...draft,id:'broken',palette:{}});saved.activeId='gone';
  const restored=environment(saved);
  assert.deepEqual(restored.service.list().map(item=>item.id),['light','dark',draft.id]);
  assert.equal(restored.service.active().id,'light');
  assert.deepEqual(restored.service.warnings(),['PALETTE_INVALID','ACTIVE_PRESET_MISSING']);
  assert.equal(restored.writes(),0);
  assert.equal(environment({formatVersion:99,presets:[]}).service.active().id,'light');
});

test('invalid colors, unknown slots, unsafe assets and empty names are rejected', () => {
  const e=environment(), draft=e.service.createDraft('light','Valid');
  for(const color of ['red','url(https://example.invalid)','var(--x)','#fff',';color:red']) {
    const value=copy(draft);value.palette['text.primary']=color;
    assert.throws(()=>e.service.saveDraft(value), /PALETTE_INVALID/);
  }
  const extra=copy(draft);extra.palette.unexpected='#000000';
  assert.throws(()=>e.service.saveDraft(extra), /PALETTE_INVALID/);
  const asset=copy(draft);asset.skins.die='../outside';
  assert.throws(()=>e.service.saveDraft(asset), /SKINS_INVALID/);
  assert.throws(()=>e.service.rename('light',''), /BUILTIN_IMMUTABLE/);
  assert.throws(()=>e.service.saveDraft({...draft,name:' '}), /PRESET_NAME_INVALID/);
  assert.throws(()=>e.service.select('missing'), /PRESET_NOT_FOUND/);
  assert.equal(e.writes(),0);
});

test('preferences belong to each client and reload through the repository port', () => {
  const first=environment(), other=environment();
  first.service.select('dark');
  assert.equal(other.service.active().id,'light');
  const restored=environment(first.stored());
  assert.equal(restored.service.active().id,'dark');
  assert.equal(first.service.snapshot().game,undefined);
  assert.equal(first.service.snapshot().revision,undefined);
});

test('observer errors do not turn durable success into a failed preference operation', () => {
  const e=environment(), calls=[];
  e.service.subscribe(()=>{throw Error('broken consumer');});
  const unsubscribe=e.service.subscribe(event=>calls.push(event.type));
  e.service.select('dark');unsubscribe();e.service.select('light');
  assert.deepEqual(calls,['selected']);
  assert.deepEqual(e.service.warnings(),['LISTENER_FAILED']);
  assert.equal(e.stored().activeId,'light');
});

test('appearance model runs without browser APIs, time, randomness or game engine', () => {
  const context=vm.createContext({});
  vm.runInContext('Math.random=()=>{throw Error("ambient RNG");};Date.now=()=>{throw Error("ambient clock");};',context);
  vm.runInContext(fs.readFileSync(require.resolve('../application/appearance.js'),'utf8'),context);
  context.presets=copy(presets);context.assets=copy(assets);
  const active=vm.runInContext(`new PlayroomAppearance.AppearanceService({
    catalog:new PlayroomAppearance.ThemeCatalog({presets,assets}),
    repository:{read:()=>null,write:()=>{}},idFactory:()=>"custom-test"
  }).active().id`,context);
  assert.equal(active,'light');
  for(const name of ['document','window','localStorage','TabletopCore'])assert.equal(context[name],undefined);
});

test('existing theme selection previews without editing built-ins or persisting until Save',()=>{const e=environment();const before=copy(e.service.snapshot());e.service.previewSelection('dark');assert.equal(e.service.shown().id,'dark');assert.deepEqual(e.service.snapshot(),before);assert.equal(e.writes(),0);e.service.cancelPreview();assert.equal(e.service.shown().id,'light');e.service.previewSelection('dark');e.service.select('dark');assert.equal(e.stored().activeId,'dark');assert.equal(e.catalog.builtin('dark').palette['surface.canvas'],'#000000');});

test('avatar preferences migrate to characters and reject temporarily disabled geometry styles',()=>{
 const e=environment({formatVersion:1,activeId:'light',presets:[],avatarStyle:'simple'});assert.equal(e.service.avatarStyle(),'minimal');assert.equal(e.writes(),0);
 assert.throws(()=>e.service.previewAvatarStyle('simple'),/AVATAR_STYLE_INVALID/);assert.throws(()=>e.service.saveAvatarStyle('simple'),/AVATAR_STYLE_INVALID/);
 e.service.saveAvatarStyle('minimal');e.service.select('dark');assert.equal(e.stored().avatarStyle,'minimal');assert.equal(environment(e.stored()).service.avatarStyle(),'minimal');
 e.fail(true);assert.throws(()=>e.service.saveAvatarStyle('minimal'),/quota/);assert.equal(e.service.avatarStyle(),'minimal');
 const old=copy(e.catalog.builtin('light'));delete old.skins['character-face'];assert.equal(e.catalog.validate(old).skins['character-face'],'minimal');
});

test('built-in reading text keeps contrast on app and catalog surfaces',()=>{
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const theme of presets)for(const background of ['surface.canvas','surface.panel','surface.raised','surface.tile-green','surface.tile-coral','surface.tile-blue','surface.tile-gold','surface.tile-violet'])for(const text of ['text.primary','text.secondary']){const a=luminance(theme.palette[text]),b=luminance(theme.palette[background]),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(contrast>=4.5,theme.id+' '+text+' / '+background+': '+contrast.toFixed(3));}
});


test('app accent is an independent local preference with atomic persistence and backward-compatible defaults',()=>{
 const e=environment(),original=copy(e.catalog.builtin('light'));assert.equal(e.service.snapshot().accentColor,null);e.service.setAccentColor('#387BBF');assert.equal(e.stored().accentColor,'#387bbf');assert.equal(e.service.active().id,'light');assert.deepEqual(e.catalog.builtin('light'),original);e.service.select('dark');assert.equal(e.service.snapshot().accentColor,'#387bbf');assert.equal(environment(e.stored()).service.snapshot().accentColor,'#387bbf');const state=e.service.snapshot(),stored=copy(e.stored());e.fail(true);assert.throws(()=>e.service.setAccentColor('#d75245'),/quota/);assert.equal(e.service.snapshot(),state);assert.deepEqual(e.stored(),stored);e.fail(false);assert.throws(()=>e.service.setAccentColor('red'),/ACCENT_COLOR_INVALID/);e.service.setAccentColor(null);assert.equal(e.service.snapshot().accentColor,null);assert.equal(environment({formatVersion:1,activeId:'light',presets:[]}).service.snapshot().accentColor,null);const migrated=environment({formatVersion:1,activeId:'light',presets:[],fieldColor:'#387BBF'});assert.equal(migrated.service.snapshot().accentColor,'#387bbf');migrated.service.select('dark');assert.equal(migrated.stored().accentColor,'#387bbf');assert(!Object.hasOwn(migrated.stored(),'fieldColor'));assert.equal(environment({formatVersion:1,activeId:'light',presets:[],accentColor:null,fieldColor:'#387bbf'}).service.snapshot().accentColor,null);
});

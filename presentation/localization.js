// Text formatting receives authorized data; it never reads game state or the DOM.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayroomLocalization = api;
})(globalThis, function () {
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const Common=rootCommon();
  function rootCommon(){return typeof globalThis.PlayroomCommonFormat!=='undefined'?globalThis.PlayroomCommonFormat:typeof require==='function'?require('./common-format.js'):null;}
  const categories = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

  class LocalizationError extends Error {
    constructor(code, key) {
      super(code);
      this.name = 'LocalizationError';
      this.code = code;
      if (key !== undefined) this.key = key;
    }
  }

  function catalogCopy(input) {
    if (!record(input)) throw new LocalizationError('CATALOG_INVALID');
    const result = Object.create(null);
    for (const [locale, messages] of Object.entries(input)) {
      try { new Intl.PluralRules(locale); }
      catch (_) { throw new LocalizationError('LOCALE_INVALID', locale); }
      if (!record(messages)) throw new LocalizationError('CATALOG_INVALID', locale);
      const copied = Object.create(null);
      for (const [key, message] of Object.entries(messages)) {
        if (typeof message === 'string') copied[key] = message;
        else {
          if (!record(message) || !Object.hasOwn(message, 'other') ||
              Object.entries(message).some(([category, text]) => !categories.has(category) || typeof text !== 'string')) {
            throw new LocalizationError('MESSAGE_INVALID', key);
          }
          copied[key] = Object.freeze({...message});
        }
      }
      result[locale] = Object.freeze(copied);
    }
    return Object.freeze(result);
  }

  class Translator {
    #catalogs;
    #numbers=new Map(); #plurals=new Map();
    constructor({catalogs, locale = 'ru', fallback = 'ru'} = {}) {
      this.#catalogs = catalogCopy(catalogs);
      if (!Object.hasOwn(this.#catalogs, fallback)) throw new LocalizationError('FALLBACK_MISSING');
      try { new Intl.PluralRules(locale); }
      catch (_) { throw new LocalizationError('LOCALE_INVALID', locale); }
      this.locale = locale;
      this.fallback = fallback;
      Object.freeze(this);
    }

    text(key, params = {}) {
      if (typeof key !== 'string' || !record(params)) throw new LocalizationError('MESSAGE_REFERENCE_INVALID');
      const primary = this.#catalogs[this.locale];
      const source = primary && Object.hasOwn(primary, key) ? this.locale : this.fallback;
      const messages = this.#catalogs[source];
      if (!Object.hasOwn(messages, key)) throw new LocalizationError('MESSAGE_MISSING', key);
      const entry = messages[key];
      let template = entry;
      if (typeof entry !== 'string') {
        if (typeof params.count !== 'number' || !Number.isFinite(params.count)) {
          throw new LocalizationError('PLURAL_COUNT_REQUIRED', key);
        }
        const rules=this.#plurals.get(source)||new Intl.PluralRules(source);this.#plurals.set(source,rules);
        const category = rules.select(params.count);
        template = entry[category] ?? entry.other;
      }
      return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name) => {
        if (!Object.hasOwn(params, name) || !['string', 'number', 'boolean'].includes(typeof params[name]) ||
            typeof params[name] === 'number' && !Number.isFinite(params[name])) {
          throw new LocalizationError('MESSAGE_PARAMETER_INVALID', key);
        }
        if(typeof params[name]!=='number')return String(params[name]);
        const numbers=this.#numbers.get(source)||new Intl.NumberFormat(source);this.#numbers.set(source,numbers);
        return numbers.format(params[name]);
      });
    }

    format(reference) {
      if(record(reference)&&Object.keys(reference).length===1&&typeof reference.common==='string')return Common.label(reference.common,this.locale,this.fallback);
      const ancestors=new Set();
      const format=value=>{
        if(!record(value)||ancestors.has(value)||ancestors.size>=32)throw new LocalizationError('MESSAGE_REFERENCE_INVALID');
        ancestors.add(value);
        const params=value.params??{};
        if(!record(params))throw new LocalizationError('MESSAGE_REFERENCE_INVALID');
        const resolved=Object.fromEntries(Object.entries(params).map(([key,item])=>[key,record(item)?format(item):item]));
        const text=this.text(value.key,resolved);
        ancestors.delete(value);
        return text;
      };
      return format(reference);
    }

    withLocale(locale) {
      return new Translator({catalogs:this.#catalogs, locale, fallback:this.fallback});
    }

    resolve(value) {
      if (Array.isArray(value)) return value.map(item=>this.resolve(item));
      if (!record(value)) return value;
      if (typeof value.common==='string' && Object.keys(value).length===1) return Common.label(value.common,this.locale,this.fallback);
      if (typeof value.key==='string' && Object.keys(value).every(key=>key==='key'||key==='params')) return this.format(value);
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,this.resolve(item)]));
    }

    number(value, options = {}) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new LocalizationError('NUMBER_INVALID');
      return new Intl.NumberFormat(this.locale, options).format(value);
    }

    date(timestamp, options = {}) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) throw new LocalizationError('DATE_INVALID');
      return new Intl.DateTimeFormat(this.locale, {timeZone:'UTC', ...options}).format(timestamp);
    }
  }

  // Renderer labels share one validated catalog until the pack or language changes.
  function sceneText(resources,language){
    let translator,previous,locale;
    return value=>{
      if(!value?.key)return String(value??'');
      const catalogs=resources(),next=language();
      if(!translator||catalogs!==previous||next!==locale){
        translator=new Translator({catalogs:{ru:{},...catalogs},locale:next});
        previous=catalogs;locale=next;
      }
      return translator.format(value);
    };
  }
  return Object.freeze({Translator, LocalizationError,sceneText});
});

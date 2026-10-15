// Text formatting receives authorized data; it never reads game state or the DOM.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayroomLocalization = api;
})(globalThis, function () {
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
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
        const category = new Intl.PluralRules(source).select(params.count);
        template = entry[category] ?? entry.other;
      }
      return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name) => {
        if (!Object.hasOwn(params, name) || !['string', 'number', 'boolean'].includes(typeof params[name]) ||
            typeof params[name] === 'number' && !Number.isFinite(params[name])) {
          throw new LocalizationError('MESSAGE_PARAMETER_INVALID', key);
        }
        return typeof params[name] === 'number' ? new Intl.NumberFormat(source).format(params[name]) : String(params[name]);
      });
    }

    format(reference) {
      if (!record(reference)) throw new LocalizationError('MESSAGE_REFERENCE_INVALID');
      return this.text(reference.key, reference.params);
    }

    withLocale(locale) {
      return new Translator({catalogs:this.#catalogs, locale, fallback:this.fallback});
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

  return Object.freeze({Translator, LocalizationError});
});

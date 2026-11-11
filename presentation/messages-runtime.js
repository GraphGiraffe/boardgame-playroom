/* Plain text resources, shared by Web presentation and application adapters. */
(function(root,factory){const api=factory(root.PlayroomUICatalog,root.PlayroomLocalization||(typeof require==='function'?require('../presentation/localization.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomMessages=api;})(globalThis,function(catalog,Localization){
  'use strict';
  let translator=new Localization.Translator({catalogs:{ru:catalog}});
  function text(key,params={}){return translator.text(key,params);}
  function error(value){const code=value?.code||value?.message||String(value);if(Object.hasOwn(catalog,'errors.'+code))return text('errors.'+code);return /^[A-Z][A-Z0-9_]+$/.test(code)?text('errors.UNKNOWN'):String(value?.message||value);}
  return Object.freeze({text,error,get locale(){return translator.locale;},withLocale:locale=>{translator=translator.withLocale(locale);}});
});

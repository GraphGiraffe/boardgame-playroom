// Application-owned words and units. Pack IDs and rule values are never translated.
(function(root,factory){const api=factory(root.PlayroomCommonCatalogs||(typeof require==='function'?require('../locales/common.json'):{}));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCommonFormat=api;})(globalThis,function(catalogs){
 'use strict';
 const numeric=value=>typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value);
 function label(id,locale='ru',fallback='ru'){
  const text=catalogs[locale]?.[id]??catalogs[fallback]?.[id]??catalogs.ru?.[id];
  if(typeof text!=='string'){const error=Error('COMMON_TEXT_MISSING');error.code='COMMON_TEXT_MISSING';error.key=id;throw error;}return text;
 }
 function number(value,locale='ru'){
  if(!numeric(value))throw Error('COMMON_NUMBER_INVALID');
  return typeof Intl!=='undefined'&&Intl.NumberFormat?new Intl.NumberFormat(locale).format(Number(value)):String(value).replace('.',locale.startsWith('ru')?',':'.');
 }
 function quantity(value,unit,locale='ru',fallback='ru'){
  let text;
  if(Array.isArray(value)){if(value.length!==2||!value.every(numeric)||Number(value[0])>Number(value[1]))throw Error('COMMON_RANGE_INVALID');text=number(value[0],locale)+'–'+number(value[1],locale);}else text=number(value,locale);
  return label('unit.'+unit,locale,fallback).replace('{value}',text);
 }
 function value(input,{unit,locale='ru',fallback='ru'}={}){
  if(typeof input==='boolean')return label(input?'yes':'no',locale,fallback);
  if(numeric(input))return unit?quantity(input,unit,locale,fallback):number(input,locale);
  return String(input);
 }
 return Object.freeze({label,number,quantity,value,numeric});
});

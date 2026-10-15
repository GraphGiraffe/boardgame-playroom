'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {Translator}=require('../presentation/localization.js');
const ru={...require('../locales/ru/common.json'),...require('../locales/ru/themes.json')};

test('Russian plural categories come from count, including teens and compound numbers',()=>{
  const t=new Translator({catalogs:{ru}});
  for(const [count,word] of [[1,'тема'],[2,'темы'],[5,'тем'],[11,'тем'],[21,'тема'],[22,'темы'],[0,'тем']]) {
    assert.equal(t.text('themes.saved-count',{count}).split(' ').at(-1),word);
  }
  assert.equal(t.format({key:'themes.saved',params:{name:'Вечер'}}),'Тема «Вечер» сохранена.');
});

test('fallback uses its own language for grammar, not the missing primary locale',()=>{
  const en={'themes.light':'Light','items':{one:'{count} item',other:'{count} items'}};
  const t=new Translator({catalogs:{ru,en},locale:'en'});
  assert.equal(t.text('themes.light'),'Light');
  assert.equal(t.text('themes.saved-count',{count:2}),'Сохранены 2 темы');
  assert.equal(t.text('items',{count:2}),'2 items');
  assert.equal(t.withLocale('de').text('themes.dark'),'Тёмная');
  assert.equal(t.locale,'en');
});

test('catalog snapshot is immutable and parameters are text values, not executable content',()=>{
  const catalog={ru:{message:'Привет, {name}',number:'Всего: {count}'}};
  const t=new Translator({catalogs:catalog});catalog.ru.message='Changed';
  assert.equal(t.text('message',{name:'<script>noop</script>'}),'Привет, <script>noop</script>');
  // The renderer must escape this string or assign textContent, not innerHTML.
  assert.throws(()=>t.text('message',{name:{hidden:true}}), /MESSAGE_PARAMETER_INVALID/);
  assert.throws(()=>t.text('message',{}), /MESSAGE_PARAMETER_INVALID/);
  assert.throws(()=>t.text('number',{count:NaN}), /MESSAGE_PARAMETER_INVALID/);
  assert.throws(()=>t.text('__proto__'), /MESSAGE_MISSING/);
  assert.throws(()=>{t.locale='en';}, TypeError);
});

test('invalid catalogs, missing keys and plural arguments produce stable error codes',()=>{
  assert.throws(()=>new Translator({catalogs:{ru:{bad:{one:'One'}}}}), /MESSAGE_INVALID/);
  assert.throws(()=>new Translator({catalogs:{en:{}}}), /FALLBACK_MISSING/);
  const t=new Translator({catalogs:{ru}});
  assert.throws(()=>t.text('missing'), /MESSAGE_MISSING/);
  assert.throws(()=>t.text('themes.saved-count',{count:'2'}), /PLURAL_COUNT_REQUIRED/);
  assert.throws(()=>t.format(null), /MESSAGE_REFERENCE_INVALID/);
});

test('dates and numbers format without implicit local time or current clock',()=>{
  const t=new Translator({catalogs:{ru}});
  assert.equal(t.number(1234.5),new Intl.NumberFormat('ru').format(1234.5));
  assert.equal(t.date(0,{year:'numeric',month:'2-digit',day:'2-digit'}),'01.01.1970');
  assert.throws(()=>t.date(NaN), /DATE_INVALID/);
  assert.throws(()=>t.number(Infinity), /NUMBER_INVALID/);
});

test('catalogs contain all built-in theme names and work in a non-DOM client',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../presentation/localization.js'),'utf8'),context);
  context.catalogs={ru};
  assert.equal(vm.runInContext('new PlayroomLocalization.Translator({catalogs}).text("themes.light")',context),'Светлая');
  for(const id of ['light','dark']) {
    const preset=require('../themes/'+id+'.json');
    assert.equal(typeof ru[preset.nameKey],'string');
  }
  assert.equal(context.document,undefined);
  assert.equal(context.localStorage,undefined);
});

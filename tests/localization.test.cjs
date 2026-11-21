'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {Translator}=require('../presentation/localization.js');
const ru={...require('../locales/ru/common.json'),...require('../locales/ru/themes.json'),...require('../locales/ru/ui-app.json')};

test('pack metadata references resolve per locale without translating technical IDs or option values',()=>{
  const catalogs={ru:{name:'Игра',label:'Кубики',help:'Общая подсказка'},en:{name:'Game',label:'Dice'}};
  const source={name:{key:'name'},settings:{fields:[{key:'diceCount',label:{key:'label'},help:{key:'help'},default:'2',options:[{value:'2',label:{key:'label'}}]}]},file:'lang/ru.json'};
  const translator=new Translator({catalogs,locale:'en'}),resolved=translator.resolve(source);
  assert.equal(resolved.name,'Game');assert.equal(resolved.settings.fields[0].label,'Dice');assert.equal(resolved.settings.fields[0].help,'Общая подсказка');
  assert.equal(resolved.settings.fields[0].key,'diceCount');assert.equal(resolved.settings.fields[0].default,'2');assert.equal(resolved.settings.fields[0].options[0].value,'2');assert.equal(resolved.file,'lang/ru.json');assert.deepEqual(source.name,{key:'name'});
  assert.throws(()=>translator.resolve({name:{key:'missing'}}),{code:'MESSAGE_MISSING'});
});

test('Russian plural categories come from count, including teens and compound numbers',()=>{
  const t=new Translator({catalogs:{ru}});
  for(const [count,word] of [[1,'тема'],[2,'темы'],[5,'тем'],[11,'тем'],[21,'тема'],[22,'темы'],[0,'тем']]) {
    assert.equal(t.text('themes.saved-count',{count}).split(' ').at(-1),word);
  }
  assert.equal(t.format({key:'themes.saved',params:{name:'Вечер'}}),'Тема «Вечер» сохранена.');
  for(const [count,word] of [[0,'действий'],[1,'действие'],[2,'действия'],[5,'действий'],[11,'действий'],[14,'действий'],[21,'действие'],[22,'действия'],[25,'действий'],[101,'действие'],[111,'действий']]) {
    assert.equal(t.text('ui.app.action-count',{count}),count+' '+word);
  }
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


test('nested message references format after projection and reject cycles',()=>{
  const {Translator}=require('../presentation/localization.js');
  const t=new Translator({catalogs:{ru:{category:'Пара',score:'{category} · {points}'}}});
  assert.equal(t.format({key:'score',params:{category:{key:'category'},points:12}}),'Пара · 12');
  const cyclic={key:'score',params:{points:12}};cyclic.params.category=cyclic;
  assert.throws(()=>t.format(cyclic),error=>error.code==='MESSAGE_REFERENCE_INVALID');
});

test('application common words, numeric values and units are independent of pack catalogs',()=>{
 const Common=require('../presentation/common-format.js'),translator=new Translator({catalogs:{ru:{},en:{}},locale:'en'});
 assert.equal(translator.resolve({label:{common:'yes'}}).label,'Yes');assert.equal(translator.withLocale('ru').resolve({label:{common:'no'}}).label,'Нет');assert.equal(translator.format({common:'infinity'}),'∞');
 assert.equal(Common.quantity([20,40],'min','ru'),'20–40 мин');assert.equal(Common.quantity([20,40],'min','en'),'20–40 min');assert.equal(Common.value(30,{unit:'s',locale:'en'}),'30 s');assert.equal(Common.value('2',{locale:'ru'}),'2');assert.equal(Common.value(false,{locale:'ru'}),'Нет');assert.equal(Common.number(1.5,'ru'),'1,5');
 assert.throws(()=>translator.resolve({label:{common:'unknown'}}),{code:'COMMON_TEXT_MISSING'});assert.throws(()=>Common.quantity([40,20],'min'),/COMMON_RANGE_INVALID/);
});

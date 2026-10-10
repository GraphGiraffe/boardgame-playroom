'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const UI=require('../core/ui.js');
test('elements API rejects old HTML, malformed slots and invalid field geometry',()=>{
  for(const value of ['<div>old</div>',{api:1},{api:2,family:'cards',elements:{field:''}},{api:2,family:'board',elements:{field:'x',unknown:'x'}},{api:2,family:'board',fieldAspect:0,elements:{field:'x'}}])assert.throws(()=>UI.composeScene(value));
  assert.deepEqual([[320,640],[740,390],[768,1024],[1280,900]].map(([w,h])=>UI.selectLayout(w,h)),['phone-portrait','phone-landscape','tablet','desktop']);
});
test('one application compositor places synthetic game elements across phone, tablet and desktop',{timeout:60000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try{for(const [width,height] of [[320,640],[390,740],[640,280],[740,390],[768,1024],[1024,768],[1280,900]])for(const family of ['cards','board'])await t.test(`${family} ${width}×${height}`,async()=>{
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();
    try{
      await page.setContent('<div id="app"></div><div id="modal-root"></div>');
      for(const file of ['app/styles.css','core/ui.css','app/design-system.css'])await page.addStyleTag({content:fs.readFileSync(path.resolve(__dirname,'..',file),'utf8')});
      for(const file of ['core/ui.js','app/game-screen.js'])await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'..',file),'utf8')});
      await page.addStyleTag({content:'.fixture-field{width:100%;height:100%;display:grid;grid-template-columns:repeat(3,1fr);min-height:0}.fixture-card{width:64px;min-width:64px;height:91px;border:1px solid;display:block}.fixture-participants{height:30px}.fixture-hand{display:flex;gap:3px;overflow:auto;width:100%}.fixture-actions{display:flex;gap:8px}.fixture-actions button{min-width:44px;min-height:44px}'});
      await page.evaluate(family=>{
        const elements={field:'<div class="fixture-field" aria-label="Поле"><button>Поле</button><button>Поле</button><button>Поле</button></div>',status:'<span>Состояние</span>',actions:'<div class="fixture-actions"><button>Действие</button><button>Действие</button></div>',auxiliary:'<span>Подсказка</span>',...(family==='cards'?{participants:TabletopUI.helpers.opponents({players:[{name:'Вы'},{name:'Соперник'}],data:{hands:[[],Array.from({length:7},(_,id)=>({id}))]}},0,c=>'<button class="fixture-card">'+c.id+'</button>'),hand:TabletopUI.helpers.hand(Array.from({length:7},(_,i)=>'<button class="fixture-card hand-card">'+i+'</button>'),7,'','',{layout:'fan'})}:{})};
        const screen=PlayroomGameScreen.render({gameName:'Игра',state:{players:[{name:'Игрок'}],turn:0,data:{}},viewer:0,scene:TabletopUI.composeScene({api:2,family,elements}),turnText:'Ваш ход',footerAction:{command:'pause',label:'Пауза',icon:'pause'}});
        document.querySelector('#app').innerHTML=screen;PlayroomGameScreen.layoutScene(document.querySelector('#app'));
      },family);
      const errors=await page.evaluate(()=>{
        const errors=[],scene=document.querySelector('.scene'),inside=(a,b)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1,s=scene.getBoundingClientRect();
        if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
        for(const slot of document.querySelectorAll('[data-game-element]')){const r=slot.getBoundingClientRect();if(getComputedStyle(slot).display!=='none'&&!inside(s,r))errors.push('slot outside scene: '+slot.dataset.gameElement);}
        for(const button of document.querySelectorAll('.table-header button,.fixture-actions button')){const r=button.getBoundingClientRect();if(!r.width)continue;if(r.width<44||r.height<44)errors.push('small touch target');const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit!==button&&!button.contains(hit))errors.push('covered button');}
        return errors;
      });assert.deepEqual(errors,[]);
      assert.equal(await page.locator('.app-game-layout').getAttribute('data-layout-mode'),UI.selectLayout(width,height));
      const positions=await page.locator('.table-tools > button').evaluateAll(nodes=>nodes.map(n=>n.dataset.command));assert.deepEqual(positions.slice(-2),['rules','settings']);
    }finally{await context.close();}
  });}finally{await browser.close();}
});

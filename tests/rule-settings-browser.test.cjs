'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,selectChoice,readChoice}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
for(const [width,height] of [[320,740],[390,740],[740,390]])test(`screen:phone:${width>height?'landscape':'portrait'} rules ${width}×${height}: grouping, drafts and exact IDs`,{timeout:120000},async()=>{
 const {selectChoice,readChoice}=require('./browser-origin.cjs'),server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 const shots=path.join(root,'tmp_files/rules-0.18.1');fs.mkdirSync(shots,{recursive:true});
 try{
  await page.goto(server.url);
   for(const id of ['pexeso','uno','durak','gofish','oldmaid','domino','ludo','snakes','yatzy','checkers','battleship','tictactoe']){
    await page.locator('[data-start='+id+']').first().click();await page.locator('[data-command=room-rules]').click();
    const form=page.locator('#room-rules-form');
    assert(await form.evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' form fits '+width);
    assert(await form.locator('.start-options').evaluate(e=>e.closest('form').firstElementChild.contains(e)),id+' first player and order stay at the top');
    assert.equal(await form.locator('select:not([name=option-deck])').count(),0,id+' uses rails except deck');
    assert(await form.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===2),id+' visible rule grid has two columns');
    assert(await form.locator('.rule-field:visible .setting-title').evaluateAll(nodes=>nodes.every(e=>{const a=e.querySelector('.setting-title-text').getBoundingClientRect(),button=e.querySelector('.rule-help>button');if(!button)return false;const b=button.getBoundingClientRect();return b.left>=a.right-1&&b.left-a.right<=8&&Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2;})),id+' help sits beside each title');
    if(['gofish','oldmaid'].includes(id)){
     assert.deepEqual(await form.locator('[name=option-deck] option').evaluateAll(nodes=>nodes.map(e=>e.value)),['36','52']);
     if(id==='oldmaid')assert.deepEqual(await form.locator('[name=option-deck] option').allTextContents(),['35 карт','51 карта']);
    }
    if(['ludo','snakes'].includes(id)){
     const rail=form.locator('[name=option-maxRounds]');await rail.focus();await rail.press('End');
     assert.equal(await readChoice(rail),'0');assert.equal(await rail.getAttribute('aria-valuetext'),'Без ограничения');assert.equal(await form.locator('#rule-option-maxRounds-value').innerText(),'∞');
    }
    if(id==='durak'){
     assert.equal(await form.locator('[name=option-deck]').inputValue(),'54');assert(await form.locator('[data-rule-field=jokerMode]').isVisible());await form.locator('[name=option-deck]').selectOption('36');assert.equal(await form.locator('[data-rule-field=jokerMode]').isVisible(),false);await form.locator('[name=option-deck]').selectOption('54');assert(await form.locator('[data-rule-field=jokerMode]').isVisible());
    }
    if(id==='uno'){
     const before=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules));await selectChoice(form.locator('[name=preset]'),'quick');
     assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),before,'editing has no accepted-state side effects');
     const help=form.locator('[data-rule-field=preset] .rule-help>button');await help.click();assert(await page.locator('.mini-help-popover:popover-open').isVisible());await page.keyboard.press('Escape');assert(await form.isVisible(),'Escape closes help without discarding the editor');
     await page.screenshot({path:path.join(shots,`rules-uno-${width}.png`),fullPage:false});
    }
    if(id==='ludo')await page.screenshot({path:path.join(shots,`rules-ludo-${width}.png`),fullPage:false});
    await page.locator('.modal [data-command=close-modal]').click();await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-confirm-accept]').click();
   }
  await page.locator('[data-start=uno]').first().click();await page.locator('[data-command=room-rules]').click();
  const form=page.locator('#room-rules-form');assert.equal(await readChoice(form.locator('[name=preset]')),'classic','cancel did not persist quick preset');
  await selectChoice(form.locator('[name=preset]'),'quick');await selectChoice(form.locator('[name=option-unoMode]'),'auto');await selectChoice(form.locator('[name=option-endMode]'),'last');await form.evaluate(e=>e.requestSubmit());
  assert.deepEqual(await page.evaluate(()=>{const r=PlayroomAppBridge.room().rules;return [r.preset,r.options.unoMode,r.options.endMode];}),['quick','auto','last']);
  await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-confirm-accept]').click();await page.reload();await page.locator('[data-start=uno]').first().click();await page.locator('[data-command=room-rules]').click();
  assert.equal(await readChoice(page.locator('[name=preset]')),'quick');assert.equal(await readChoice(page.locator('[name=option-unoMode]')),'auto');assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('rulebooks: all games explain play before settings and show the current match values',{timeout:180000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 const close=()=>page.locator('#modal-root .modal-head [data-command=close-modal]').click();
 const shots=path.resolve(root,'../tmp_files/player-rulebooks/screenshots');fs.mkdirSync(shots,{recursive:true});
 try{
  await page.goto(process.env.PLAYROOM_URL||server.url);
  for(const id of ['mage-brawl','uno','durak','gofish','oldmaid','domino','battleship','checkers','ludo','snakes','pexeso','klondike','spider','tictactoe','yatzy']){
   await page.locator('[data-start="'+id+'"]').first().click();await page.locator('[data-command=room-rules-view]').click();
   const book=page.locator('.game-rules-help');assert(await book.locator('.rulebook-section').count()>=3,id+' has a full rulebook');
   assert(await book.evaluate(e=>e.firstElementChild.classList.contains('rules-selected-settings')&&e.children[1].classList.contains('rulebook-contents')&&e.children[2].classList.contains('rulebook-main')&&e.children[3].tagName==='HR'&&e.lastElementChild.classList.contains('rulebook-config')),id+' reading order');
   assert.equal(await page.locator('.rulebook-head h2').innerText(),'Правила',id+' concise title');
   assert.equal(await page.locator('.rulebook-toolbar button').count(),3,id+' three navigation actions');
   assert(await book.locator('.rulebook-option').evaluateAll(nodes=>nodes.every(node=>node.querySelectorAll('.rulebook-choices').length===1)),id+' consistent choices for every setting');
   const helps=book.locator('.rules-selected-settings dt .rule-help>button');
   assert.equal(await helps.count(),await book.locator('.rules-selected-settings dt').count(),id+' every selected parameter has help');
   for(let i=0;i<await helps.count();i++){
    await helps.nth(i).click();assert(await page.locator('.mini-help-popover:popover-open').isVisible(),id+' parameter help');
    assert((await page.locator('.mini-help-popover:popover-open').innerText()).trim().length>0);await page.keyboard.press('Escape');
    assert(await book.isVisible(),id+' Escape keeps rules open');
   }
   assert(await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-options]').evaluate(e=>!e.innerHTML.includes('M4 7h16M4 17h16')),id+' parameter explanations do not use settings icon');
   const originalUrl=page.url();
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-options]').click();
   await page.waitForFunction(()=>{const e=document.getElementById('rulebook-options'),b=e.closest('.modal-body');return Math.abs(e.getBoundingClientRect().top-b.getBoundingClientRect().top)<3;});
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-contents]').click();
   await book.locator('.rulebook-contents a').first().click();
   await page.waitForFunction(()=>document.activeElement?.id==='rulebook-section-0');
   await page.locator('.rulebook-toolbar [data-rulebook-jump=rulebook-top]').click();
   await page.waitForFunction(()=>document.querySelector('.modal-body').scrollTop<2);
   assert.equal(page.url(),originalUrl,id+' navigation does not change URL/back stack');
   const text=await book.innerText();assert(!/поезд|пакетный урон|Windows XP|Доступные действия подсвечиваются|[a-z-]+\.(?:rules\.\d|book\.)/.test(text),id+' no obsolete text or unresolved keys');
   assert(await book.locator('.rulebook-config .rules-mode-note').count()>0,id+' selected values');
   if(id!=='mage-brawl'){
    assert(await book.locator('.rule-art').count()>=2,id+' includes game pieces and UI examples');
    assert.equal(await book.locator('.rule-art:not([inert])').count(),0,id+' rule examples are inert');
    assert.equal(await book.locator('.rule-art [data-action]').count(),0,id+' examples cannot dispatch game commands');
   }
   for(const viewport of [{width:320,height:740},{width:390,height:740},{width:740,height:390}]){
    await page.setViewportSize(viewport);assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' fits '+viewport.width);assert(await page.locator('.rulebook-head').evaluate(e=>e.scrollWidth<=e.clientWidth+1),id+' header fits '+viewport.width);
    assert(await book.locator('.rule-art [data-size-role=card]').evaluateAll(cards=>cards.every(card=>{const b=card.getBoundingClientRect();return b.width>=30&&b.width<=61&&b.height<=90;})),id+' example cards stay compact');
    assert(await book.locator('.rule-art-row').evaluateAll(rows=>rows.every(row=>{const cards=[...row.querySelectorAll('[data-size-role=card]')].map(c=>c.getBoundingClientRect());return cards.length<2||cards.every(c=>Math.abs(c.top+c.height/2-cards[0].top-cards[0].height/2)<1);})),id+' cards in one example step stay on one row');
   }
   await page.setViewportSize({width:390,height:740});
   if(id!=='mage-brawl'){
    const figures=book.locator('.rulebook-figure');
    for(let i=0;i<await figures.count();i++){
     await figures.nth(i).scrollIntoViewIfNeeded();
     await page.screenshot({path:path.join(shots,id+'-illustrations'+(i?'-'+i:'')+'.png')});
    }
    await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));
    await figures.first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(shots,id+'-illustrations-dark.png')});
    assert(await book.locator('.rule-art').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)),id+' artwork fits in dark theme');
    await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('light'));
   }
   if(id==='mage-brawl'){
    assert(text.includes('его атаки не усиливаются'));
    assert.equal(await book.locator('.rulebook-figure').count(),23);
    assert.equal(await book.locator('.rulebook-illustration>svg').count(),23);
    assert(text.includes('В каждом — 8 фаз'));
    assert(text.includes('Летящий кулак'));
    assert.equal(await page.evaluate(()=>PlayroomAppBridge.packs.exportView('mage-brawl').rulebook.sections.length),11,'network export includes public illustrated rules');assert(text.includes('Общее число жизней'));
    await page.screenshot({path:path.join(shots,'mage-rulebook-start.png')});
    await book.locator('.rulebook-config').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'mage-rulebook-settings.png')});
   }
   await close();await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-confirm-accept]').click();
  }
  await page.locator('[data-start="mage-brawl"]').first().click();await page.locator('[data-command=room-rules]').click();
  await selectChoice(page.locator('[name=option-health]'),'6');await page.locator('#room-rules-form').evaluate(e=>e.requestSubmit());
  await page.locator('[data-command=lobby-start]').click();await page.locator('#app .table-shell').waitFor();
  await page.locator('[data-learning-choice=no]').click();
  await page.locator('#app [data-command=settings]').click();await page.locator('.settings-quick [data-command=rules]').click();
  const health=page.locator('.rulebook-option').filter({has:page.getByRole('heading',{name:'Здоровье',exact:true})});
  assert.equal((await health.locator('.rules-mode-note').innerText()).trim(),'В этой партии: 6','live match uses saved rules, not defaults');
  assert.equal(await page.locator('.rulebook-config h4').filter({hasText:'Первый игрок'}).count(),0,'simultaneous game does not offer a nonexistent setting');
  assert.equal(await page.evaluate(()=>{const e=document.createElement('div');e.innerHTML=PlayroomLobbyView.gameRulesMarkup({rules:['<b>Title</b>\n<script>bad()</script>','Legacy line'],presets:[]});return e.querySelectorAll('script,b').length;}),0,'rule text is escaped, old single-line rules supported');
  await close();await page.locator('.settings-overview').waitFor();await close();assert(await page.locator('#app .table-shell').isVisible());
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

test('illustrated rules: offline digital faces, network view and colored help in both themes',{timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
 const out=path.resolve(root,'../tmp_files/illustrated-rules/screenshots');fs.mkdirSync(out,{recursive:true});
 try{
  await page.goto(require('node:url').pathToFileURL(path.join(root,'dist/playroom-all-games.html')).href);
  await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-command=room-rules-view]').click();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);
   for(const name of ['Движения','Тайлы']){
    const section=page.locator('.rulebook-section').filter({has:page.getByRole('heading',{name,exact:true})});await section.scrollIntoViewIfNeeded();
    assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    if(name==='Тайлы')assert(await section.locator('.is-list .rulebook-figure').evaluateAll(nodes=>nodes.length===9&&nodes.every(n=>{const a=n.querySelector('.rulebook-illustration').getBoundingClientRect(),t=n.querySelector('figcaption').getBoundingClientRect();return a.right<=t.left&&t.width>0;})),'tile descriptions sit beside their artwork');
    await page.screenshot({path:path.join(out,`${theme}-${name==='Движения'?'movement':'tiles'}.png`)});
   }
  }
  assert.equal(await page.locator('.rulebook-table').count(),4,'effect comparisons use tables');
  assert(await page.locator('.rulebook-section ol').count()>0,'planning and reward steps use numbered lists');
  assert.equal(await page.evaluate(()=>{
   const definition=PlayroomAppBridge.packs.exportView('mage-brawl');const view=PlayroomSharedViews.install(definition);
   const host=document.createElement('div');host.innerHTML=PlayroomLobbyView.gameRulesMarkup({id:view.manifest.id,rules:view.rules,rulebook:view.rulebook});
   return host.querySelectorAll('.rulebook-figure').length;
  }),23,'a view-only network client can render illustrated rules without rules code');
  await page.locator('#modal-root .modal-head [data-command=close-modal]').click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(let i=2;i<8;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'bot',nickname:'Бот '+i});b.renderLobby();});
  await page.locator('[data-command=lobby-start]').click();await page.locator('[data-learning-choice=no]').click();
  // Card skins can render main/compact variants; check each card instead of counting printed variants.
  assert(await page.locator('.mage-card:visible').evaluateAll(cards=>cards.length===4&&cards.every(card=>card.querySelector('.mage-spell-art rect[stroke]'))));
  for(let direction=0;direction<4;direction++){
   if(direction)await page.locator('[data-view-key=mageDirection]').last().click();
   await page.locator('[data-command=card-help]').click();
   assert(await page.locator('.card-help-list .mage-action-diagram>g[style*=color]').count()>0,'help uses elemental colors');
   assert(await page.locator('.modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(direction===1)await page.screenshot({path:path.join(out,'dark-hand-help.png')});
   await page.locator('#modal-root .modal-head [data-command=close-modal]').click();
  }
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);assert(await page.locator('.table-shell').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test('rule changes show localized before and after values above the screen',{timeout:25000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}}),page=await context.newPage();await page.goto(server.url);await page.locator('#profile-form input').fill('Игрок');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.evaluate(()=>{
  PlayroomCatalog.fixture={settings:[{key:'announce',label:'Объявление о потоплении',options:[{value:false,label:'Нет'},{value:true,label:'Да'}]}],presetSetting:{label:'Режим',options:[{value:'classic',label:'Классический'},{value:'russian',label:'Русский'}]}};
  const room={id:'change-fixture',game:{id:'fixture'},transportMode:'online',phase:'lobby',rulesRevision:1,previousRules:{preset:'classic',options:{announce:false}},rules:{preset:'russian',options:{announce:true}},participants:[{id:'guest',rulesNotice:true}]};window.rulesNotifications=[];PlayroomLobbyView.notifyRulesChange(room,'guest',m=>{rulesNotifications.push(m);PlayroomAppBridge.toast(m);});PlayroomLobbyView.notifyRulesChange(room,'guest',m=>rulesNotifications.push(m));
 });assert.deepEqual(await page.evaluate(()=>rulesNotifications),['Режим: Классический → Русский\nОбъявление о потоплении: Нет → Да']);assert.equal(await page.locator('#toast').getAttribute('class'),'toast show');await page.waitForFunction(()=>document.querySelector('#toast').getBoundingClientRect().top<20&&Number(getComputedStyle(document.querySelector('#toast')).opacity)>.99);const box=await page.locator('#toast').boundingBox();assert(box.y<20&&box.x>=0&&box.x+box.width<=390);await page.screenshot({path:path.resolve(root,'../tmp_files/push-events-020/rules-changed.png')});
 }finally{await browser.close();await server.close();}
});

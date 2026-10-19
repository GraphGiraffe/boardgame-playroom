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
    assert(await form.locator('.rule-grid:visible').evaluateAll(nodes=>nodes.every(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===2)),id+' visible rule grid has two columns');
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
     assert.equal(await form.locator('[data-rule-field=jokerMode]').isVisible(),false);await form.locator('[name=option-deck]').selectOption('54');assert(await form.locator('[data-rule-field=jokerMode]').isVisible());
    }
    if(id==='uno'){
     const before=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules));await selectChoice(form.locator('[name=preset]'),'quick');
     assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),before,'editing has no accepted-state side effects');
     const help=form.locator('[data-rule-field=preset] .rule-help>button');await help.click();assert(await page.locator('.mini-help-popover:popover-open').isVisible());await page.keyboard.press('Escape');assert(await form.isVisible(),'Escape closes help without discarding the editor');
     await page.screenshot({path:path.join(shots,`rules-uno-${width}.png`),fullPage:false});
    }
    if(id==='ludo')await page.screenshot({path:path.join(shots,`rules-ludo-${width}.png`),fullPage:false});
    await page.locator('.modal [data-command=close-modal]').click();await page.locator('[data-command=lobby-leave]').click();
   }
  await page.locator('[data-start=uno]').first().click();await page.locator('[data-command=room-rules]').click();
  const form=page.locator('#room-rules-form');assert.equal(await readChoice(form.locator('[name=preset]')),'classic','cancel did not persist quick preset');
  await selectChoice(form.locator('[name=preset]'),'quick');await selectChoice(form.locator('[name=option-unoMode]'),'auto');await selectChoice(form.locator('[name=option-endMode]'),'last');await form.evaluate(e=>e.requestSubmit());
  assert.deepEqual(await page.evaluate(()=>{const r=PlayroomAppBridge.room().rules;return [r.preset,r.options.unoMode,r.options.endMode];}),['quick','auto','last']);
  await page.locator('[data-command=lobby-leave]').click();await page.reload();await page.locator('[data-start=uno]').first().click();await page.locator('[data-command=room-rules]').click();
  assert.equal(await readChoice(page.locator('[name=preset]')),'quick');assert.equal(await readChoice(page.locator('[name=option-unoMode]')),'auto');assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});

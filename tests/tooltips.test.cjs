'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');

test('fixed overlays share viewport coordinates with root scrollbar gutters', async () => {
  const browser=await chromium.launch({executablePath:executablePath(),headless:true,args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.setContent('<!doctype html><html><head><style>html{scrollbar-gutter:stable both-edges;scrollbar-width:thin}body{margin:0;height:1800px}*{box-sizing:border-box}#source{position:fixed;left:160px;top:140px;width:60px;height:44px}.player-panel{position:fixed;left:40px;top:320px;width:240px;height:90px;border-radius:14px}</style></head><body><button id="source" data-tooltip="Подсказка">Справка</button><div id="host" class="player-menu-overlay"><section class="player-panel"><button data-player-target="0">Игрок</button></section></div></body></html>');
    for(const file of ['core/tooltips.css','app/design-system.css'])await page.addStyleTag({path:path.join(root,file)});
    for(const file of ['platform/web/dom.js','core/tooltips.js','core/player-target.js'])await page.addScriptTag({path:path.join(root,file)});
    await page.locator('#source').focus();
    const tip=page.locator('#playroom-context-tooltip');await tip.waitFor({state:'visible'});
    const source=await page.locator('#source').boundingBox(),box=await tip.boundingBox();
    assert.ok(Math.abs(box.x+box.width/2-source.x-source.width/2)<1,`tooltip center differs from anchor: ${JSON.stringify({source,box})}`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#source').getAttribute('aria-describedby'),null);
    await page.evaluate(()=>{
      window.commits=[];
      window.targets=new PlayroomPlayerTarget({root:()=>document.querySelector('#host'),actions:()=>[{target:0,targetKind:'player',label:'Запросить'},{target:0,targetKind:'player',label:'Недоступно',disabled:true}],commit:action=>commits.push(action)});
      targets.tap(0);
    });
    const panel=await page.locator('.player-panel').boundingBox(),overlay=await page.locator('.player-target-menu').boundingBox();
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(panel[key]-overlay[key])<1,`player overlay ${key}: ${JSON.stringify({panel,overlay})}`);
    await page.locator('.player-target-menu button').first().click();
    assert.equal(await page.evaluate(()=>commits.length),1);
    await page.evaluate(()=>{document.querySelector('#host').className='';targets.tap(0);});
    const anchor=await page.locator('[data-player-target]').boundingBox(),menu=await page.locator('.player-target-menu').boundingBox();
    assert.ok(Math.abs(menu.x-Math.max(8,Math.min(anchor.x,390-menu.width-8)))<1,'ordinary menu aligns with trigger');
    assert.ok(Math.abs(menu.y-anchor.y-anchor.height-4)<1,'ordinary menu sits below trigger');
    await page.mouse.click(350,600);
    assert.equal(await page.locator('.player-target-menu').count(),0,'outside input dismisses menu');
    assert.equal(await page.locator('[data-player-target]').getAttribute('aria-expanded'),'false');
    await page.locator('#source').evaluate(el=>el.style.left='310px');
    await page.locator('#source').focus();await tip.waitFor({state:'visible'});
    const edge=await tip.boundingBox();
    assert.ok(edge.x>=12&&edge.x+edge.width<=378.5,'tooltip respects viewport margin near the edge');
    assert.equal(await page.locator('body>[data-fixed-origin-probe]').count(),1,'overlays reuse the same probe without recurring observer mutations');
    await page.evaluate(()=>PlayroomTooltips.hide());
    for(const parentKind of ['transformed portal','native dialog']){
      const point=await page.evaluate(kind=>{
        const portal=document.createElement(kind==='native dialog'?'dialog':'div');
        portal.style.cssText='position:fixed;left:0;top:550px;width:300px;height:180px';
        if(kind!=='native dialog')portal.style.transform='translate(24px,18px) scale(.8)';
        document.body.append(portal);if(kind==='native dialog')portal.showModal();
        const marker=document.createElement('span');marker.style.cssText='position:fixed;width:20px;height:10px';portal.append(marker);
        PlayroomDOM.positionFixed(marker,{left:123,top:650});
        PlayroomDOM.positionFixed(marker,{left:123,top:650});
        const rect=marker.getBoundingClientRect(),probes=portal.querySelectorAll('[data-fixed-origin-probe]').length;
        if(kind==='native dialog')portal.close();portal.remove();
        return {x:rect.x,y:rect.y,probes};
      },parentKind);
      assert.ok(Math.abs(point.x-123)<1&&Math.abs(point.y-650)<1,`${parentKind}: ${JSON.stringify(point)}`);
      assert.equal(point.probes,1,`${parentKind} reuses its probe`);
    }
    await page.evaluate(()=>{targets.destroy();PlayroomTooltips.destroy();});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Context tooltips: escaped text, keyboard ARIA, viewport bounds and lifecycle', async () => {
  const browser = await chromium.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 480 }, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setContent('<!doctype html><html lang="ru"><body style="margin:0;height:2000px"><p id="existing">Старая подпись</p><button id="top" style="position:absolute;left:2px;top:2px;width:70px;height:44px" aria-describedby="existing">Карта +4</button><button id="bottom" style="position:fixed;right:2px;bottom:2px;width:70px;height:44px">Другая карта</button><button id="touch" style="position:fixed;left:120px;top:170px;width:80px;height:44px">Телефон</button></body></html>');
    const hostile = '<img src=x onerror="alert(1)"> & обычный текст. '.repeat(3);
    await page.locator('#top').evaluate((el, value) => { el.dataset.tooltip = value; }, hostile);
    await page.locator('#bottom').evaluate(el => { el.dataset.tooltip = 'Описание у правого нижнего края: '.repeat(12); });
    await page.locator('#touch').evaluate(el => { el.dataset.tooltip = 'Подсказка кнопки на телефоне.'; });
    await page.addStyleTag({ path: path.join(root, 'core/tooltips.css') });
    await page.addScriptTag({ path: path.join(root, 'core/tooltips.js') });
    const tip = page.locator('#playroom-context-tooltip');
    await page.locator('#top').hover(); await tip.waitFor({ state: 'visible' });
    assert.equal(await tip.textContent(), hostile.trim());
    assert.equal(await tip.locator('img').count(), 0, 'text must never be parsed as HTML');
    assert.equal(await page.locator('#top').getAttribute('aria-describedby'), 'existing playroom-context-tooltip');
    await page.keyboard.press('Escape'); assert.equal(await tip.isVisible(), false);
    assert.equal(await page.locator('#top').getAttribute('aria-describedby'), 'existing');
    await page.locator('#bottom').focus(); await tip.waitFor({ state: 'visible' });
    const box = await tip.boundingBox();
    assert.ok(box.x >= 11 && box.y >= 11 && box.x + box.width <= 379 && box.y + box.height <= 469);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.mouse.click(180, 90); assert.equal(await tip.isVisible(), false, 'pointer down dismisses a tooltip');
    await page.locator('#top').focus(); await tip.waitFor({ state: 'visible' });
    await page.evaluate(() => scrollTo(0, 100)); await tip.waitFor({ state: 'hidden' });
    await page.locator('#bottom').focus(); await tip.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 320, height: 380 }); await tip.waitFor({ state: 'hidden' });
    await page.locator('#top').focus(); await tip.waitFor({ state: 'visible' });
    await page.locator('#top').evaluate(el => el.remove()); await tip.waitFor({ state: 'hidden' });
    await page.evaluate(() => { PlayroomTooltips.attach(); PlayroomTooltips.attach(); });
    await page.locator('#bottom').focus(); await tip.waitFor({ state: 'visible' });
    assert.equal(await page.locator('[role=tooltip]').count(), 1, 'attach must be idempotent');
    await page.mouse.wheel(0, 35); await tip.waitFor({ state: 'hidden' });
    for (const reason of ['blur','resize','wheel']) {
      await page.evaluate(reason => {
        const el = document.querySelector('#touch'); el.focus();
        if (reason === 'blur') el.blur();
        if (reason === 'resize') window.dispatchEvent(new Event('resize'));
        if (reason === 'wheel') window.dispatchEvent(new WheelEvent('wheel'));
      }, reason);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await tip.isVisible(), false, `${reason} cancels a queued focus tooltip`);
      await page.locator('#touch').evaluate(el => el.blur());
    }
    await page.evaluate(() => PlayroomTooltips.hide());
    const allowed = await page.locator('#touch').evaluate(el => {
      const event = new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', cancelable: true });
      el.dispatchEvent(event); el.focus();
      el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
      return !event.defaultPrevented;
    });
    assert.equal(allowed, true, 'touch gestures must remain untouched');
    await page.waitForTimeout(220); assert.equal(await tip.isVisible(), false, 'short touch does not open a tooltip before the hold threshold');
    await page.keyboard.press('Tab');
    await page.locator('#bottom').focus(); await tip.waitFor({ state: 'visible' });
    await page.evaluate(() => PlayroomTooltips.destroy());
    assert.equal(await page.locator('[role=tooltip]').count(), 0);
    await page.locator('#bottom').hover(); await page.waitForTimeout(220);
    assert.equal(await page.locator('[role=tooltip]').count(), 0, 'destroy removes delegated listeners');
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); }
});

test('touch hold: release on button activates once; release outside cancels and retains tooltip for two seconds',async()=>{
 const browser=await chromium.launch({executablePath:executablePath(),headless:true,args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:600},hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><button id="action" title="Действие кнопки" style="position:absolute;left:30px;top:180px;width:110px;height:50px">Кнопка</button><button id="other" style="position:absolute;left:230px;top:180px;width:110px;height:50px">Другая</button><button id="card" data-drag-piece="card-1" data-tooltip="Карта" style="position:absolute;left:30px;top:300px;width:70px;height:98px">Карта</button><button id="rich" data-tooltip="Переместитесь по отмеченным клеткам." data-tooltip-title="Воздух · Перемещение · 90°" style="position:absolute;left:150px;top:350px;width:180px;height:50px"><span>Чужой режим атаки и усиление</span><template data-tooltip-art><svg tabindex="0" viewBox="0 0 100 100" width="100" height="100"><g transform="rotate(90 50 50)"><path d="M10 50H90" stroke="currentColor"/></g></svg></template></button>');
  await page.evaluate(()=>{window.actions=0;window.others=0;document.querySelector('#action').onclick=()=>actions++;document.querySelector('#other').onclick=()=>others++;window.richActions=0;document.querySelector('#rich').onclick=()=>richActions++;});
  await page.addStyleTag({path:path.join(root,'core/tooltips.css')});await page.addScriptTag({path:path.join(root,'core/tooltips.js')});
  const nativeHold=browser.browserType().name()==='chromium',client=nativeHold?await context.newCDPSession(page):null,tip=page.locator('#playroom-context-tooltip');
  // Playwright exposes native held touch through Chromium CDP only. WebKit
  // checks the same pointer lifecycle explicitly, plus its real ordinary tap.
  const pointer=async(type,x,y)=>page.evaluate(({type,x,y})=>{if(type==='pointerdown')window.holdProbeTarget=document.elementFromPoint(x,y);window.holdProbePoint={x,y};const target=window.holdProbeTarget;if(!target)return;target.dispatchEvent(new PointerEvent(type,{bubbles:true,composed:true,cancelable:true,pointerId:91,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));if(type==='pointerup')target.click();},{type,x,y});
  const start=async(x,y)=>nativeHold?client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}):pointer('pointerdown',x,y);
  const move=async(x,y)=>nativeHold?client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]}):pointer('pointermove',x,y);
  const end=async()=>nativeHold?client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}):page.evaluate(()=>{const {x,y}=holdProbePoint,target=holdProbeTarget.isConnected?holdProbeTarget:document.elementFromPoint(x,y)||document.body;target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,composed:true,cancelable:true,pointerId:91,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,buttons:0}));if(holdProbeTarget.isConnected)holdProbeTarget.click();});
  await start(70,205);await tip.waitFor({state:'visible'});assert.equal(await tip.innerText(),'Действие кнопки');assert.equal(await page.evaluate(()=>actions),0);await end();
  assert.equal(await tip.isVisible(),false);assert.equal(await page.evaluate(()=>actions),1,'native compatibility click must not repeat the long-tap action');
  await start(70,205);await tip.waitFor({state:'visible'});await move(270,205);await end();
  assert.equal(await page.evaluate(()=>actions),1);assert.equal(await page.evaluate(()=>others),0,'release over another button must not activate it');
  const released=Date.now();await page.waitForTimeout(1100);assert(await tip.isVisible(),'cancelled hold remains readable');await tip.waitFor({state:'hidden',timeout:1800});assert(Date.now()-released>=1900);
  await page.touchscreen.tap(70,205);assert.equal(await page.evaluate(()=>actions),2,'ordinary tap stays immediate');assert.equal(await tip.isVisible(),false);
  await start(65,340);await page.waitForTimeout(520);assert.equal(await tip.isVisible(),false,'card drag/inspection must keep its own hold behavior');await end();
  await start(210,375);await tip.waitFor({state:'visible'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await tip.isVisible(),'rich title/art do not trigger whole-tooltip text invalidation');
  assert.equal(await tip.locator('.playroom-tooltip-title').innerText(),'Воздух · Перемещение · 90°');assert.equal(await tip.locator(':scope>span').innerText(),'Переместитесь по отмеченным клеткам.');assert.equal(await tip.locator('svg').count(),1);assert.equal(await tip.locator('svg>g').getAttribute('transform'),'rotate(90 50 50)');assert.doesNotMatch(await tip.innerText(),/Чужой режим|усиление/,'tooltip does not copy the rest of its card');
  assert(await tip.locator('.playroom-tooltip-art').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'));assert(await tip.locator('svg').evaluate(el=>{el.focus();return document.activeElement!==el&&!el.contains(document.activeElement); }),'authored art cannot acquire focus');assert.equal(await tip.evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  await end();assert.equal(await page.evaluate(()=>richActions),1,'unchanged rich hold activates exactly once');await start(210,375);await tip.waitFor({state:'visible'});
  await page.locator('#rich').evaluate(el=>el.querySelector('template').content.querySelector('g').setAttribute('transform','rotate(180 50 50)'));await tip.waitFor({state:'hidden'});await end();assert.equal(await page.evaluate(()=>richActions),1,'source art/content changes cancel the pending activation');await start(210,375);await tip.waitFor({state:'visible'});assert.equal(await tip.locator('svg>g').getAttribute('transform'),'rotate(180 50 50)','fresh hold uses the changed authored orientation');
  await page.locator('#rich').evaluate(el=>{el.dataset.tooltipTitle='Огонь · Атака · 180°';el.dataset.tooltip='Атакуйте выбранную клетку.';});await tip.waitFor({state:'hidden'});await end();assert.equal(await page.evaluate(()=>richActions),1,'changed action text/title cannot activate the replacement action');
  await start(210,375);await tip.waitFor({state:'visible'});assert.equal(await tip.locator('.playroom-tooltip-title').innerText(),'Огонь · Атака · 180°');assert.equal(await tip.locator(':scope>span').innerText(),'Атакуйте выбранную клетку.');await page.locator('#rich').evaluate(el=>el.dataset.tooltipTitle='<img src=x onerror="alert(1)">');await tip.waitFor({state:'hidden'});await page.waitForTimeout(900);await end();assert.equal(await page.evaluate(()=>richActions),1,'a title-only change cancels activation through release');
  await start(210,375);await tip.waitFor({state:'visible'});assert.equal(await tip.locator('.playroom-tooltip-title').innerText(),'<img src=x onerror="alert(1)">');assert.equal(await tip.locator('img').count(),0,'rich title remains escaped text');await page.locator('#rich').evaluate(el=>el.querySelector('template').innerHTML='<svg viewBox="0 0 100 100" width="100" height="100"><g transform="rotate(270 50 50)"><path d="M20 20H80"/></g></svg>');await tip.waitFor({state:'hidden'});await end();assert.equal(await page.evaluate(()=>richActions),1,'source art/content changes cancel the pending activation');await start(210,375);await tip.waitFor({state:'visible'});assert.equal(await tip.locator('svg').count(),1);assert.equal(await tip.locator('svg>g').getAttribute('transform'),'rotate(270 50 50)','content-only replacement invalidates the previous preview');await page.locator('#rich').evaluate(el=>el.remove());await tip.waitFor({state:'hidden'});await end();assert.equal(await page.evaluate(()=>richActions),1,'detached held source cannot activate');assert.deepEqual(errors,[]);
  await page.evaluate(()=>PlayroomTooltips.destroy());
 }finally{await context.close();await browser.close();}
});


test('DOM preparation cache is bounded, screen cancellable and never forces busy idle work',async()=>{
 const {PreparationCache}=require('../platform/web/dom.js');
 function scheduler(native=true){let id=0,busy=false;const tasks=new Map(),cancelled=[];const win={navigator:{scheduling:{isInputPending:()=>busy}},setTimeout:fn=>{tasks.set(++id,fn);return id;},clearTimeout:key=>{cancelled.push(key);tasks.delete(key);}};if(native){win.requestIdleCallback=fn=>{tasks.set(++id,fn);return id;};win.cancelIdleCallback=win.clearTimeout;}return{win,tasks,cancelled,setBusy:v=>busy=v,flush:budget=>{const [key,fn]=tasks.entries().next().value;tasks.delete(key);fn({didTimeout:true,timeRemaining:()=>budget});}};}
 const clock=scheduler(),cache=new PreparationCache({window:clock.win,limit:2,maxBytes:100});let calls=0;
 assert.equal(cache.prepare('a',()=>{calls++;return 'alpha';}),true);assert.equal(cache.prepare('a',()=>{throw Error('duplicate');}),false);assert.equal(cache.prepare('b',()=> 'beta'),true);assert.equal(clock.tasks.size,1);
 clock.flush(0);assert.equal(calls,0,'timeout does not override idle budget');clock.setBusy(true);clock.flush(10);assert.equal(calls,0);clock.setBusy(false);clock.flush(10);assert.equal(cache.get('a'),'alpha');assert.equal(calls,1);clock.flush(10);assert.equal(cache.get('b'),'beta');assert.equal(cache.prepare('a',()=> 'duplicate'),false);
 cache.get('a');cache.set('c','gamma');assert.equal(cache.get('b'),undefined,'least recently used value evicted');assert.equal(cache.get('a'),'alpha');assert.equal(cache.stats.evictions,1);assert.equal(cache.set('huge','x'.repeat(100)),false);assert.equal(cache.stats.size,2);assert.equal(cache.set('bad',()=>{}),false);assert.equal(cache.set('dom',{nodeType:1,method(){}}),false);
 let current=false;cache.prepare('invalid',()=>{calls++;return 'no';},{valid:()=>current});clock.flush(10);assert.equal(calls,1,'valid checked before factory');current=true;cache.prepare('changed',()=>{current=false;return 'stale';},{valid:()=>current});clock.flush(10);assert.equal(cache.get('changed'),undefined,'valid checked after factory');
 cache.prepare('clear-during',()=>{cache.clear();return 'stale';});clock.flush(10);assert.equal(cache.get('clear-during'),undefined);cache.prepare('cancel',()=>{calls++;return 'no';});const staleCallback=[...clock.tasks.values()][0];cache.clear();assert.equal(clock.tasks.size,0);cache.prepare('fresh',()=> 'fresh');staleCallback({timeRemaining:()=>10});assert.equal(cache.get('fresh'),undefined,'cancelled epoch cannot run a fresh screen job');clock.flush(10);assert.equal(cache.get('fresh'),'fresh');cache.clear();assert.ok(clock.cancelled.length);assert.equal(cache.stats.bytes,0);
 cache.prepare('throws',()=>{throw Error('expected');});clock.flush(10);cache.prepare('promise',()=>Promise.reject(Error('expected async')));clock.flush(10);await new Promise(resolve=>setImmediate(resolve));assert.equal(cache.stats.errors,2);assert.equal(cache.get('promise'),undefined);
 const fallback=scheduler(false),other=new PreparationCache({window:fallback.win});other.prepare('plain',()=>({label:'public',count:3}));fallback.setBusy(true);fallback.flush();assert.equal(other.stats.size,0);fallback.setBusy(false);fallback.flush();assert.deepEqual(other.get('plain'),{label:'public',count:3});assert.equal(Object.isFrozen(other.get('plain')),true,'cached plain containers cannot mutate past byte accounting');other.prepare('pending',()=> 'never');other.dispose();assert.equal(fallback.tasks.size,0);assert.equal(other.prepare('late',()=> 'no'),false);assert.equal(other.set('late','no'),false);assert.equal(other.get('plain'),undefined);
});

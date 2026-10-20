'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');

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
 const context=await browser.newContext({viewport:{width:390,height:600},hasTouch:true}),page=await context.newPage();
 try{
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><button id="action" title="Действие кнопки" style="position:absolute;left:30px;top:180px;width:110px;height:50px">Кнопка</button><button id="other" style="position:absolute;left:230px;top:180px;width:110px;height:50px">Другая</button><button id="card" data-drag-piece="card-1" data-tooltip="Карта" style="position:absolute;left:30px;top:300px;width:70px;height:98px">Карта</button>');
  await page.evaluate(()=>{window.actions=0;window.others=0;document.querySelector('#action').onclick=()=>actions++;document.querySelector('#other').onclick=()=>others++;});
  await page.addStyleTag({path:path.join(root,'core/tooltips.css')});await page.addScriptTag({path:path.join(root,'core/tooltips.js')});
  const client=await context.newCDPSession(page),tip=page.locator('#playroom-context-tooltip');
  const start=async(x,y)=>client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  const move=async(x,y)=>client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
  const end=()=>client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await start(70,205);await tip.waitFor({state:'visible'});assert.equal(await tip.innerText(),'Действие кнопки');assert.equal(await page.evaluate(()=>actions),0);await end();
  assert.equal(await tip.isVisible(),false);assert.equal(await page.evaluate(()=>actions),1,'native compatibility click must not repeat the long-tap action');
  await start(70,205);await tip.waitFor({state:'visible'});await move(270,205);await end();
  assert.equal(await page.evaluate(()=>actions),1);assert.equal(await page.evaluate(()=>others),0,'release over another button must not activate it');
  const released=Date.now();await page.waitForTimeout(1100);assert(await tip.isVisible(),'cancelled hold remains readable');await tip.waitFor({state:'hidden',timeout:1800});assert(Date.now()-released>=1900);
  await page.touchscreen.tap(70,205);assert.equal(await page.evaluate(()=>actions),2,'ordinary tap stays immediate');assert.equal(await tip.isVisible(),false);
  await start(65,340);await page.waitForTimeout(520);assert.equal(await tip.isVisible(),false,'card drag/inspection must keep its own hold behavior');await end();
  await page.evaluate(()=>PlayroomTooltips.destroy());
 }finally{await context.close();await browser.close();}
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');

test('Pointer input preserves tap, touch scrolling and drag/drop across DOM replacement', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking'] });
  async function fixture() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif}.board{height:270px;display:flex;gap:12px;align-items:center;padding:15px}.drop{width:60px;height:80px;background:#b7d6bf}.hand-track{display:flex;gap:12px;width:300px;overflow-x:auto;margin:20px;scroll-snap-type:x proximity}.piece{flex-shrink:0;width:56px;height:96px;background:#fff5da;border:1px solid #baa57e;border-radius:9px;touch-action:none}.piece span{display:block}.other{margin:20px;min-width:60px;min-height:44px}</style><div id="scene"></div><button class="other">Next tap</button>');
    await page.addStyleTag({ path: path.join(root, 'core/input.css') });
    await page.addScriptTag({ path: path.join(root, 'core/input.js') });
    await page.evaluate(() => {
      window.trace = { selects: [], commits: [], clicks: 0, other: 0, clean: [] };
      window.inputEvents = [];
      for (const type of ['touchstart','touchend','pointerdown','pointerup','click']) document.addEventListener(type, event => inputEvents.push({type,target:event.target.className,time:performance.now()}),true);
      window.enabled = true; let selected = null;
      function render() {
        document.querySelector('#scene').innerHTML = `<div class="board">${selected ? `<button class="drop" data-drop-piece="${selected}" data-action='${JSON.stringify({type:'play',card:selected,side:'left'})}'>Legal</button><button class="drop wrong" data-drop-piece="other" data-action='{"type":"play","card":"other"}'>Wrong</button><button class="drop broken" data-drop-piece="${selected}" data-action='broken'>Bad</button>` : ''}</div><div class="hand-track">${Array.from({length:9},(_,i)=>`<button class="piece" data-select="p${i}" data-drag-piece="p${i}"><span>${i}</span><span>•••</span></button>`).join('')}</div>`;
      }
      function select(id) { selected = id; window.trace.selects.push(id); render(); }
      window.render = render;
      window.input = TabletopInput.attach({ canStart: () => window.enabled, canSelect: () => window.enabled, canCommit: () => window.enabled, getSelected:()=>window.selectedOverride===undefined?selected:window.selectedOverride, select, commit(action) {
        window.trace.clean.push(!document.querySelector('.playroom-drag-ghost') && !document.documentElement.classList.contains('playroom-dragging'));
        window.trace.commits.push(action); selected = null; render();
      }});
      document.addEventListener('click', event => {
        const tile = event.target.closest('[data-select]');
        if (tile) window.trace.clicks++;
        input.handleClick(event);
        if (event.target.closest('.other')) window.trace.other++;
      });
      render();
    });
    return { page, context };
  }
  const center = async locator => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  async function mouseHold(page) {
    const p = await center(page.locator('[data-drag-piece=p0]'));
    await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.waitForTimeout(210);
    assert.equal(await page.locator('.playroom-drag-ghost').count(),1); return p;
  }
  async function touch(cdp, type, point) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: point.x, y: point.y, id: 1, radiusX: 3, radiusY: 3 }] }); }
  async function check(name, fn) { await t.test(name, async () => { const env = await fixture(); try { await fn(env.page, env.context); } finally { await env.context.close(); } }); }
  try {
    await check('Quick tap uses the native host click without a drag render', async page => {
      await page.locator('[data-drag-piece=p0]').click();
      assert.deepEqual(await page.evaluate(() => trace),{selects:['p0'],commits:[],clicks:1,other:0,clean:[]}); assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
    });
    await check('Mouse hold clones before selection replaces DOM; legal drop commits exactly once', async page => {
      await page.evaluate(()=>window.originalSource=document.querySelector('[data-drag-piece=p0]'));
      await mouseHold(page); const p=await center(page.locator('.drop').first()); await page.mouse.move(p.x,p.y,{steps:5});
      assert.equal(await page.evaluate(()=>originalSource.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),false);
      assert.equal(await page.locator('.playroom-drop-hover').count(),1);await page.mouse.up();await page.waitForFunction(()=>trace.commits.length===1);
      assert.deepEqual(await page.evaluate(()=>trace.commits),[{type:'play',card:'p0',side:'left'}]);assert.deepEqual(await page.evaluate(()=>trace.clean),[true]);assert.equal(await page.evaluate(()=>trace.clicks),0);
      await page.locator('.other').click();assert.equal(await page.evaluate(()=>trace.other),1);
    });
    await check('Five-pixel mouse motion starts dragging without waiting for hold', async page => {
      const p=await center(page.locator('[data-drag-piece=p0]'));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+8,p.y);
      assert.equal(await page.locator('.playroom-drag-ghost').count(),1);await page.mouse.move(380,820);await page.mouse.up();assert.equal(await page.evaluate(()=>trace.commits.length),0);
    });
    await check('Wrong-piece, malformed and outside targets never commit', async page => {
      for(const target of ['.wrong','.broken',null]){
        await mouseHold(page);const p=target?await center(page.locator(target)):{x:380,y:800};await page.mouse.move(p.x,p.y);await page.mouse.up();await page.waitForTimeout(30);
        assert.equal(await page.evaluate(()=>trace.commits.length),0);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
      }
    });
    await check('Escape, pointercancel, capture loss, blur and hidden document cancel cleanly', async page => {
      for(const reason of ['escape','pointercancel','capture','blur','hidden','resize']){
        await mouseHold(page);
        if(reason==='escape')await page.keyboard.press('Escape');
        else await page.evaluate(reason=>{
          if(reason==='pointercancel')document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));
          if(reason==='capture')document.documentElement.releasePointerCapture(1);
          if(reason==='blur')window.dispatchEvent(new Event('blur'));
          if(reason==='resize')window.dispatchEvent(new Event('resize'));
          if(reason==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});}
        },reason);
        await page.mouse.move(380,800);await page.mouse.up();assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal(await page.evaluate(()=>trace.commits.length),0);
      }
    });
    await check('Touch hold and vertical intention drop once, then the next real touch tap works', async(page,context)=>{
      const cdp=await context.newCDPSession(page);
      for(const mode of ['hold','vertical']){
        const p=await center(page.locator('[data-drag-piece=p0]'));await touch(cdp,'touchStart',p);
        if(mode==='hold')await page.waitForTimeout(260);else await touch(cdp,'touchMove',{x:p.x,y:p.y-18});
        assert.equal(await page.locator('.playroom-drag-ghost').count(),1);const target=await center(page.locator('.drop').first());await touch(cdp,'touchMove',target);await touch(cdp,'touchEnd',target);
        await page.waitForFunction(n=>trace.commits.length===n,mode==='hold'?1:2);
        const tap=await center(page.locator('.other'));await touch(cdp,'touchStart',tap);await touch(cdp,'touchEnd',tap);
      }
      assert.equal(await page.evaluate(()=>trace.other),2,JSON.stringify(await page.evaluate(()=>inputEvents)));assert.equal(await page.evaluate(()=>trace.clicks),0);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
    });
    await check('Horizontal touch swipes scroll the hand without selecting or playing; next tap works',async(page,context)=>{
      const cdp=await context.newCDPSession(page),p=await center(page.locator('[data-drag-piece=p2]'));await touch(cdp,'touchStart',p);
      for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x-n*25,y:p.y});await touch(cdp,'touchEnd',p);
      assert(await page.locator('.hand-track').evaluate(el=>el.scrollLeft)>60);assert.equal(await page.evaluate(()=>trace.selects.length),0);assert.equal(await page.evaluate(()=>trace.commits.length),0);
      const tap=await center(page.locator('.other'));await touch(cdp,'touchStart',tap);await touch(cdp,'touchEnd',tap);assert.equal(await page.evaluate(()=>trace.other),1);
    });
    for(const mode of ['unavailable','disabled','other-turn','gap'])await check('Any hand surface scrolls without actions: '+mode,async(page,context)=>{
      await page.setViewportSize({width:844,height:390});
      await page.addStyleTag({content:'.board{height:100px}.hand-track{touch-action:none;padding-block:8px}.other{position:fixed;right:0;top:0}'});
      await page.evaluate(mode=>{const el=document.querySelector('[data-select=p2]');
        if(mode==='unavailable'){for(const a of [...el.attributes])if(a.name.startsWith('data-'))el.removeAttribute(a.name);el.setAttribute('aria-disabled','true');}
        if(mode==='disabled')el.disabled=true;
        if(mode==='other-turn')window.enabled=false;
      },mode);
      const cdp=await context.newCDPSession(page),p=mode==='gap'?await page.locator('.hand-track').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+180,y:r.top+3};}):await center(page.locator('.piece').nth(2));
      await touch(cdp,'touchStart',p);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x-n*25,y:p.y});await touch(cdp,'touchEnd',p);
      assert(await page.locator('.hand-track').evaluate(el=>el.scrollLeft)>60,mode+' must scroll');
      assert.equal(await page.evaluate(()=>trace.selects.length+trace.commits.length),0);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
    });
    async function verticalHand(page) {
      await page.setViewportSize({width:844,height:390});
      await page.addStyleTag({content:'.board{height:150px;padding:8px}.hand-track{display:grid;grid-template-columns:repeat(3,56px);grid-auto-rows:48px;align-items:start;align-content:start;gap:0 12px;height:115px;width:204px;margin:8px;overflow-x:hidden;overflow-y:auto;touch-action:pan-y;scroll-snap-type:none}.other{position:fixed;right:10px;top:12px;margin:0}'});
      return locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+12};});
    }
    await check('Unavailable landscape hand elements scroll vertically without enabling play',async(page,context)=>{
      const point=await verticalHand(page),cdp=await context.newCDPSession(page);
      for(const mode of ['disabled','unavailable','other-turn']){
       await page.evaluate(mode=>{render();window.enabled=mode!=='other-turn';const el=document.querySelector('[data-select=p0]');if(mode==='disabled')el.disabled=true;if(mode==='unavailable'){for(const a of [...el.attributes])if(a.name.startsWith('data-'))el.removeAttribute(a.name);el.setAttribute('aria-disabled','true');}},mode);
       const p=await point(page.locator('.piece').first());await touch(cdp,'touchStart',p);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x,y:p.y-n*20});await touch(cdp,'touchEnd',p);
       assert(await page.locator('.hand-track').evaluate(el=>el.scrollTop)>60,mode);assert.equal(await page.evaluate(()=>trace.selects.length+trace.commits.length),0);
      }
    });
    await check('Landscape vertical hands scroll on drag and swipe-only cards without playing; next touch stays native',async(page,context)=>{
      const point=await verticalHand(page),cdp=await context.newCDPSession(page);
      for(const drag of [true,false]){
        await page.evaluate(drag=>{render();for(const el of document.querySelectorAll('[data-drag-piece]')){el.dataset.swipeAction=JSON.stringify({type:'play',card:el.dataset.dragPiece});if(!drag)el.removeAttribute('data-drag-piece');}},drag);
        const p=await point(page.locator('[data-select=p0]'));await touch(cdp,'touchStart',p);
        for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x,y:p.y-n*20});await touch(cdp,'touchEnd',p);
        assert(await page.locator('.hand-track').evaluate(el=>el.scrollTop)>60);assert.equal(await page.locator('.hand-track').evaluate(el=>el.scrollLeft),0);
        assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal(await page.evaluate(()=>trace.selects.length+trace.commits.length),0);
        const last=await point(page.locator('[data-select=p8]'));assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-select]')?.dataset.select,last),'p8','last row is exposed after scrolling');
        const next=await center(page.locator('.other'));await touch(cdp,'touchStart',next);await touch(cdp,'touchEnd',next);
      }
      assert.equal(await page.evaluate(()=>trace.other),2);assert.equal(await page.evaluate(()=>trace.clicks),0);
    });
    await check('Holding a landscape overflowing card still drags, cancels outside, and commits its legal target once',async(page,context)=>{
      const point=await verticalHand(page),cdp=await context.newCDPSession(page);
      for(const legal of [false,true]){
        const p=await point(page.locator('[data-drag-piece=p0]'));await touch(cdp,'touchStart',p);await page.waitForTimeout(250);
        assert.equal(await page.locator('.playroom-drag-ghost').count(),1);
        const target=legal?await center(page.locator('.drop').first()):{x:800,y:365};await touch(cdp,'touchMove',target);await touch(cdp,'touchEnd',target);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(()=>trace.commits.length),legal?1:0);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
      }
      assert.deepEqual(await page.evaluate(()=>trace.commits),[{type:'play',card:'p0',side:'left'}]);assert.deepEqual(await page.evaluate(()=>trace.clean),[true]);
      const next=await center(page.locator('.other'));await touch(cdp,'touchStart',next);await touch(cdp,'touchEnd',next);assert.equal(await page.evaluate(()=>trace.other),1);
    });
    await check('Delegated routing toggles selection, forces choices, preserves action priority and keyboard clicks',async page=>{
      await page.evaluate(()=>document.querySelector('.other').insertAdjacentHTML('afterend',`<button id="cell" data-cell="12">Cell</button><button id="forced" data-drop-select="p0">Keep p0</button><button id="immediate" data-select="p1" data-action='{"type":"play","card":"p1"}'>Quick</button>`));
      await page.locator('[data-select=p0]').click();await page.locator('[data-select=p0]').click();
      assert.deepEqual(await page.evaluate(()=>trace.selects),['p0',null]);
      await page.locator('#forced').click();await page.locator('#forced').click();
      assert.deepEqual(await page.evaluate(()=>trace.selects.slice(-2)),['p0','p0']);
      await page.locator('#cell').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>trace.selects.at(-1)),'12');
      await page.evaluate(()=>{selectedOverride=0;document.querySelector('#cell').dataset.cell='0';});await page.locator('#cell').click();assert.equal(await page.evaluate(()=>trace.selects.at(-1)),null);await page.evaluate(()=>delete window.selectedOverride);
      const count=await page.evaluate(()=>trace.selects.length);await page.locator('#immediate').focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>trace.selects.length),count);assert.deepEqual(await page.evaluate(()=>trace.commits),[{type:'play',card:'p1'}]);
    });
    await check('Host guards, disabled markers and inert containers reject preview, selection and commit',async page=>{
      await page.evaluate(()=>{window.enabled=false;document.querySelector('[data-select=p0]').setAttribute('data-hand-preview','p0');});
      const p=await center(page.locator('[data-select=p0]'));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(210);
      assert.equal(await page.locator('.playroom-drag-ghost,.is-hand-preview').count(),0);await page.mouse.up();
      await page.evaluate(()=>{enabled=true;for(const attribute of ['disabled','aria-disabled','inert']){const el=document.createElement('button');el.dataset.action='{"type":"blocked"}';el.dataset.select='blocked';if(attribute==='disabled')el.disabled=true;else el.setAttribute(attribute,attribute==='aria-disabled'?'true':'');document.body.append(el);input.handleClick({target:el});el.remove();}enabled=true;});
      assert.equal(await page.evaluate(()=>trace.selects.length+trace.commits.length),0);
    });
    await check('Swipe-only cards scroll horizontally and play upward once without drag or lost next tap',async(page,context)=>{
      await page.evaluate(()=>{for(const el of document.querySelectorAll('[data-drag-piece]')){el.dataset.swipeAction=JSON.stringify({type:'play',card:el.dataset.dragPiece});el.dataset.handPreview=el.dataset.dragPiece;el.removeAttribute('data-drag-piece');}});
      const cdp=await context.newCDPSession(page),horizontal=await center(page.locator('[data-select=p2]'));
      await touch(cdp,'touchStart',horizontal);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:horizontal.x-n*25,y:horizontal.y});await touch(cdp,'touchEnd',horizontal);
      assert(await page.locator('.hand-track').evaluate(el=>el.scrollLeft)>60);assert.equal(await page.evaluate(()=>trace.selects.length+trace.commits.length),0);
      const p=await center(page.locator('[data-select=p3]'));await touch(cdp,'touchStart',p);await touch(cdp,'touchMove',{x:p.x,y:p.y-60});
      assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal(await page.evaluate(()=>trace.selects.length),0);await touch(cdp,'touchEnd',p);
      await page.waitForFunction(()=>trace.commits.length===1);assert.deepEqual(await page.evaluate(()=>trace.commits),[{type:'play',card:'p3'}]);
      const next=await center(page.locator('.other'));await touch(cdp,'touchStart',next);await touch(cdp,'touchEnd',next);assert.equal(await page.evaluate(()=>trace.other),1);assert.equal(await page.evaluate(()=>trace.clicks),0);
    });
    await check('Swipe-only ambiguous choices select without committing; cancellation and late guards prevent actions',async(page,context)=>{
      const cdp=await context.newCDPSession(page);
      async function prepare(action=false){await page.evaluate(action=>{const el=document.querySelector('[data-select=p0]');el.removeAttribute('data-drag-piece');if(action)el.dataset.swipeAction='{"type":"play","card":"p0"}';else el.dataset.swipeSelect='p0';},action);return center(page.locator('[data-select=p0]'));}
      let p=await prepare();await touch(cdp,'touchStart',p);await touch(cdp,'touchMove',{x:p.x,y:p.y-65});await touch(cdp,'touchEnd',p);await page.waitForFunction(()=>trace.selects.length===1);
      assert.deepEqual(await page.evaluate(()=>trace.selects),['p0']);assert.equal(await page.evaluate(()=>trace.commits.length),0);
      for(const reason of ['cancel','guard']){p=await prepare(true);await touch(cdp,'touchStart',p);await touch(cdp,'touchMove',{x:p.x,y:p.y-60});if(reason==='cancel')await page.evaluate(()=>input.cancel());else await page.evaluate(()=>enabled=false);await touch(cdp,'touchEnd',p);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>trace.commits.length),0);await page.evaluate(()=>enabled=true);}
    });
    await check('Edge dragging does not create viewport overflow and destroy removes listeners',async page=>{
      await mouseHold(page);await page.mouse.move(389,843);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
      const box=await page.locator('.playroom-drag-ghost').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
      await page.evaluate(()=>input.destroy());await page.mouse.up();await page.locator('[data-drag-piece=p0]').click();assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal(await page.evaluate(()=>trace.clicks),1);
    });
  } finally { await browser.close(); }
});

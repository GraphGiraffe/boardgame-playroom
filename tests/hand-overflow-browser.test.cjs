'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const css=fs.readFileSync(path.join(__dirname,'../core/ui.css'),'utf8');

test('a hovered fanned card never obscures the next card rank after horizontal scrolling', {timeout:20000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:320,height:640},reducedMotion:'reduce'});
  try{
    // about:blank / setContent keeps this regression independent of HTTP origin,
    // installed packs and browser network permissions. The actual shared fan CSS
    // and 35-card grid are used rather than synthetic hover-only style rules.
    const cards=Array.from({length:35},(_,i)=>
      `<button class="hand-card" data-hand-preview="card-${i}"><span class="card-corner">+4</span></button>`).join('');
    await page.setContent(`<html><head><style>${css}</style><style>
      *,*::before,*::after{box-sizing:border-box}
      body{margin:0}.game-scene{width:320px;height:640px;display:flex;flex-direction:column;justify-content:flex-end}
      .own-hand{width:100%;margin-bottom:12px}.hand-card{width:64px;height:91px;padding:0;
        border:3px solid white;border-radius:8px;background:#b83232;cursor:pointer}
      .card-corner{position:absolute;top:4px;left:5px;font-size:15px;font-weight:900}
    </style></head><body><div class="game-scene"><section class="own-hand"><div class="hand-track is-fan is-long-hand"><div class="hand-fan-row" style="--fan-count:35">${cards}</div></div></section></div></body></html>`);
    await page.locator('.hand-track').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    const corner=async index=>page.locator(`[data-hand-preview="card-${index}"] .card-corner`).evaluate(el=>{
      const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
    });
    const previous=await corner(33),last=await corner(34);
    assert(last.x>previous.x&&last.x<320,'the final rank starts inside the track');
    await page.mouse.move(previous.x,previous.y);
    assert.equal(await page.locator('.hand-card:hover').getAttribute('data-hand-preview'),'card-33');
    // Before the fix card 33's raised z-index painted over card 34's rank.
    const liftedCorner=await corner(34);
    const reach=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-hand-preview]')?.dataset.handPreview,liftedCorner);
    assert.equal(reach,'card-34','the next rank must remain reachable while the previous card is hovered');
    await page.mouse.move(liftedCorner.x,liftedCorner.y);
    assert.equal(await page.locator('.hand-card:hover').getAttribute('data-hand-preview'),'card-34');
  }finally{await browser.close();}
});

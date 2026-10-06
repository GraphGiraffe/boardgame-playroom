'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..');

test('Motion effects move only public pieces and clean up at completion or cancellation',{timeout:90000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-background-networking']});
  async function check(name,run){await t.test(name,async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.scene{position:absolute;left:20px;top:20px;width:350px;height:780px;background:#ddd;--face:#d47755}.hand-track{position:absolute;left:12px;top:580px;width:320px;height:130px;display:flex;gap:12px;overflow:auto}.mini-hand{position:absolute;left:110px;top:50px;width:110px;height:46px;display:flex}.piece-back{width:30px;height:44px;background:green}.card{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;width:66px;height:98px;background:var(--face);color:white;border:4px solid #fff;border-radius:10px;box-shadow:0 3px 0 #aaa;font:700 16px sans-serif}.card span{font-size:18px}.public-card{position:absolute;left:205px;top:290px}.stock-button{position:absolute;left:35px;top:290px;width:66px;height:98px}.stock-button .piece-back{width:100%;height:100%}.die{position:absolute;left:30px;top:380px;width:50px;height:50px;background:#fff;transform:rotate(-5deg)}.token{position:absolute;width:30px;height:30px;border-radius:50%;background:#568669}.board{position:absolute;left:20px;top:180px;width:300px;height:250px}</style><main id="app"></main>');
      await page.addStyleTag({path:path.join(root,'core/motion.css')});await page.addScriptTag({path:path.join(root,'core/motion.js')});
      await page.evaluate(()=>{
        window.drawScene=(mode='before',card='c1')=>{
          const own=mode==='before'?'<button class="card" data-entity="card-c1" data-action="secret-action" id="source"><span>OWN CARD</span></button><button class="card" data-entity="card-other"><span>OTHER</span></button>':mode==='draw'?'<button class="card" data-entity="card-c1"><span>OWN CARD</span></button><button class="card" data-entity="card-new"><span>NEW</span></button>':'<button class="card" data-entity="card-other"><span>OTHER</span></button>';
          document.querySelector('#app').innerHTML=`<section class="scene"><div data-player-index="1"><div class="mini-hand"><div class="piece-back" data-secret="private-hand">HIDDEN BACK</div></div></div><button class="stock-button" data-motion-stock><span class="piece-back"></span></button><button class="card public-card" data-entity="card-${mode==='before'||mode==='draw'?'old':card}" data-action="public-action" id="destination"><span>${mode==='before'||mode==='draw'?'OLD':'PUBLIC PLAY'}</span></button><div class="hand-track">${own}</div><div class="board"><span class="token" data-entity="checker-42" style="left:${mode==='before'?20:180}px;top:${mode==='before'?180:20}px"></span></div><div class="die">⚄</div></section>`;
        };
        drawScene();
      });
      await run(page);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });}
  try{
    await check('Own played card visibly travels upward, preserves face styling and restores destination',async page=>{
      const start=await page.evaluate(()=>{
        const snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}}),from=snapshot.entities.get('card-c1').rect;
        drawScene('after');window.done=false;window.flight=PlayroomMotion.play(snapshot,{duration:420}).then(()=>done=true);const first=document.querySelector('.playroom-motion-piece[data-motion-kind=play]').getBoundingClientRect();return {origin:from,first:{y:first.y}};
      });
      const clone=page.locator('.playroom-motion-piece[data-motion-kind=play]');assert.equal(await clone.count(),1);assert.equal(await clone.getAttribute('data-entity'),null);assert.equal(await clone.getAttribute('data-action'),null);assert.equal(await clone.getAttribute('id'),null);
      assert.equal(await clone.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(212, 119, 85)');assert.match(await clone.textContent(),/PUBLIC PLAY/);
      assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'hidden');assert(start.first.y>start.origin.y-5);
      await page.waitForTimeout(120);const middle=await clone.boundingBox();assert(middle.y<start.first.y-50,'Played card must visibly leave the hand');
      assert.equal(await page.evaluate(()=>done),false);await page.evaluate(()=>flight);assert.equal(await page.locator('.playroom-motion-layer').count(),0);assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'visible');
    });
    await check('Opponent play starts at hidden hand but clones only the newly public card',async page=>{
      const origin=await page.evaluate(()=>{
        const snapshot=PlayroomMotion.capture({actor:1,viewer:0,action:{type:'play',card:'hidden-card'}});drawScene('after','hidden-card');window.flight=PlayroomMotion.play(snapshot,{duration:360});return snapshot.origin;
      });
      const clone=page.locator('.playroom-motion-piece[data-motion-kind=play]');assert.equal(await clone.count(),1);assert.equal(await clone.locator('[data-secret]').count(),0);assert.match(await clone.textContent(),/PUBLIC PLAY/);assert.doesNotMatch(await clone.textContent(),/HIDDEN BACK/);
      const b=await clone.boundingBox();assert(b.y<origin.y+100,'Opponent card must originate above the board');assert(await page.locator('.mini-hand').isVisible());await page.evaluate(()=>flight);
    });
    await check('Replay infers a newly public card without action.card',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0});drawScene('after');window.flight=PlayroomMotion.play(snap,{duration:250});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),1);await page.evaluate(()=>flight);
    });
    await check('Zero duration or unchanged state produces no overlay and resolves immediately',async page=>{
      const result=await page.evaluate(async()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');let start=performance.now();await PlayroomMotion.play(snap,{duration:0});const zero=performance.now()-start;
        const unchanged=PlayroomMotion.capture({actor:0,viewer:0});start=performance.now();await PlayroomMotion.play(unchanged,{duration:1100});return{zero,empty:performance.now()-start,layers:document.querySelectorAll('.playroom-motion-layer').length};
      });assert.equal(result.layers,0);assert(result.zero<100&&result.empty<100,JSON.stringify(result));
    });
    await check('Cancellation restores styles synchronously and resolves even after destination is detached',async page=>{
      const result=await page.evaluate(async()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');const destination=document.querySelector('.public-card');destination.style.setProperty('visibility','visible','important');
        let resolved=false;const promise=PlayroomMotion.play(snap,{duration:1100}).then(()=>resolved=true);destination.remove();PlayroomMotion.cancel();
        const sync={layers:document.querySelectorAll('.playroom-motion-layer').length,visibility:destination.style.visibility,priority:destination.style.getPropertyPriority('visibility')};await promise;return{...sync,resolved};
      });assert.deepEqual(result,{layers:0,visibility:'visible',priority:'important',resolved:true});
    });
    await check('Offscreen hand sources are clamped and flight never changes document scroll extents',async page=>{
      const result=await page.evaluate(async()=>{
        const hand=document.querySelector('.hand-track'),source=hand.querySelector('[data-entity="card-c1"]');source.style.marginLeft='900px';
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}}),from=snap.entities.get('card-c1').rect,handRect=hand.getBoundingClientRect();
        drawScene('after');const before={width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight};const promise=PlayroomMotion.play(snap,{duration:320}),sizes=[];
        await new Promise(resolve=>{function sample(){sizes.push({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight});if(document.querySelector('.playroom-motion-layer'))requestAnimationFrame(sample);else resolve();}sample();});await promise;
        return{from,hand:{x:handRect.left,right:handRect.right},before,sizes};
      });assert(result.from.x>=result.hand.x&&result.from.x+result.from.width<=result.hand.right);assert(result.sizes.every(s=>s.width===result.before.width&&s.height===result.before.height));
    });
    await check('Board token and die animate locally, and drawn own card starts at stock',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'roll'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:300});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=move]').count(),1);assert(await page.locator('.die').evaluate(el=>el.getAnimations().length)>0);assert.equal(await page.locator('.scene').evaluate(el=>getComputedStyle(el).transform),'none');await page.evaluate(()=>flight);
      await page.evaluate(()=>{drawScene();const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:250});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=draw]').count(),1);await page.evaluate(()=>flight);
    });
    await check('A final +4 play precedes four staggered hidden-opponent stock transfers',async page=>{
      await page.evaluate(()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');window.done=false;window.started=performance.now();
        window.flight=PlayroomMotion.play(snap,{duration:240,draws:[{player:1,count:4,from:'stock'}]}).then(()=>{window.elapsed=performance.now()-started;done=true;});
      });
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),1);
      const backs=page.locator('.playroom-motion-piece[data-motion-kind=draw][data-motion-player="1"]');assert.equal(await backs.count(),4);
      assert.equal(await backs.locator('[data-secret]').count(),0);assert.doesNotMatch(await backs.allTextContents().then(x=>x.join(' ')),/PUBLIC PLAY|OWN CARD/);
      const delays=await page.locator('.playroom-motion-flight[data-motion-kind=draw]').evaluateAll(nodes=>nodes.map(el=>el.getAnimations()[0].effect.getTiming().delay));assert.deepEqual(delays,[240,312,384,456]);
      await page.waitForTimeout(250);assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),0);assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal(await page.evaluate(()=>done),false);
      await page.evaluate(()=>flight);assert(await page.evaluate(()=>elapsed)>=580);assert.equal(await page.locator('.playroom-motion-layer').count(),0);
    });
    await check('An own draw travels as a back and reveals the actual card only on arrival',async page=>{
      await page.evaluate(()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');const token=document.querySelector('.token');token.style.left='20px';token.style.top='180px';
        window.flight=PlayroomMotion.play(snap,{duration:400,draws:[{player:0,count:1,from:'stock'}]});
      });
      const destination=page.locator('.scene [data-entity="card-new"]'),back=page.locator('.playroom-motion-piece[data-motion-kind=draw]');assert.equal(await back.count(),1);assert.doesNotMatch(await back.textContent(),/NEW/);assert.equal(await destination.evaluate(el=>getComputedStyle(el).visibility),'hidden');
      await page.evaluate(()=>flight);assert.equal(await destination.evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal(await page.locator('.playroom-motion-layer').count(),0);
    });
    await check('Explicit empty draw cues suppress inference and cancelling a draw chain restores every card',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:250,draws:[]});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=draw]').count(),0);await page.evaluate(()=>flight);
      const result=await page.evaluate(async()=>{
        drawScene();const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');const destination=document.querySelector('[data-entity="card-new"]');const flight=PlayroomMotion.play(snap,{duration:1100,draws:[{player:0,count:1,from:'stock'},{player:1,count:4,from:'stock'}]});PlayroomMotion.cancel();await flight;return{layers:document.querySelectorAll('.playroom-motion-layer').length,visibility:getComputedStyle(destination).visibility};
      });assert.deepEqual(result,{layers:0,visibility:'visible'});
    });
    await check('Taking table cards starts at a card-sized table anchor rather than the stock',async page=>{
      const result=await page.evaluate(()=>{
        document.querySelector('.board').setAttribute('data-motion-table','');const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'take'}});drawScene('draw');
        const token=document.querySelector('.token');token.style.left='20px';token.style.top='180px';window.flight=PlayroomMotion.play(snap,{duration:300,draws:[{player:0,count:1,from:'table'}]});
        const rect=document.querySelector('.playroom-motion-piece[data-motion-kind=draw]').getBoundingClientRect();return{table:snap.table,stock:snap.stock,actual:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
      });assert(result.actual.width<=67&&result.actual.height<=99);assert(Math.abs(result.actual.x-result.table.x)<2);assert(Math.abs(result.actual.x-result.stock.x)>30);await page.evaluate(()=>flight);
    });
    await check('A completed drag settles from its release rectangle rather than jumping back into the hand',async page=>{
      const result=await page.evaluate(()=>{
        const rect=document.querySelector('.public-card').getBoundingClientRect(),release={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'},playedFrom:release});drawScene('after');window.flight=PlayroomMotion.play(snap,{duration:180});
        const first=document.querySelector('.playroom-motion-piece[data-motion-kind=play]').getBoundingClientRect();return{release,first:{x:first.x,y:first.y},invalid:PlayroomMotion.capture({playedFrom:{x:Infinity,y:0,width:66,height:98}}).playedFrom};
      });assert(Math.abs(result.first.x-result.release.x)<2&&Math.abs(result.first.y-result.release.y)<2);assert.equal(result.invalid,null);await page.evaluate(()=>flight);
    });
  }finally{await browser.close();}
});

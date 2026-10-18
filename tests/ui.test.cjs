'use strict';

async function setRange(page,id,value){await page.locator('#'+id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);}
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
const E=require(root+'/core/engine.js');
const Session=require(root+'/core/session.js');
for(const id of ['uno','domino','durak','checkers','snakes'])require(root+'/packs/'+id+'/rules.js');
const url=process.env.PLAYROOM_URL||pathToFileURL(root+'/index.html').href;
const options=(mode='pass')=>({players:[{name:'Аня'},{name:'Борис',bot:mode==='solo'}],mode,preset:'classic',presetLabel:'Классика',seed:17});
function fixture(game='uno',mode='pass',turns=0){const s=new Session(E,game,options(mode));for(let i=0;i<turns&&s.current.status==='playing';i++)s.act(s.current.turn,E.botAction(s.current));return s.export();}
async function saved(page){return page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).export());}
async function move(page){return page.evaluate(()=>{return TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move;});}
async function resume(page){
  // With the unified «Мои партии» hub, an active local match may appear
  // in the saved-games panel rather than as a hero banner on reload.
  // Require an actual stored session and continue through either real UI path.
  if(await page.locator('.table-shell').count()){if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').click();return;}
  const banner=page.locator('.resume-banner [data-command=resume]');
  if(await banner.count())await banner.click();
  else{
    await page.locator('.side-nav [data-command=sessions]').click();
    await page.locator('.saved-games-list .saved-game[data-session-id] [data-resume-id]').first().click();
  }
  if(await page.locator('.handoff').count())await page.locator('[data-command=unlock]').click();
}
async function cardTouchPoint(card){await card.scrollIntoViewIfNeeded();return card.evaluate(el=>{const r=el.getBoundingClientRect();for(const fy of [.5,.12,.88])for(const f of [.5,.12,.88]){const p={x:r.x+r.width*f,y:r.y+r.height*fy},hit=document.elementFromPoint(p.x,p.y);if(hit===el||el.contains(hit))return p;}throw Error('No exposed card position');});}
async function exposedClick(page,card){await card.scrollIntoViewIfNeeded();const p=await cardTouchPoint(card);await page.mouse.click(p.x,p.y);}
async function clickMove(page,game){
  if(game==='checkers'){await page.locator('.checker-piece.movable').first().click();await page.locator('.checker-cell.destination').first().click();}
  else if(game==='snakes')await page.locator('.die[data-action]').first().click();
  else if(game==='uno')await page.locator('.stock-button[data-action]').click();
  else {const card=page.locator('.hand-track .is-playable').first();await card.scrollIntoViewIfNeeded();const p=await cardTouchPoint(card);await page.mouse.click(p.x,p.y);const target=page.locator('.domino-drop-target,.scene-actions [data-action]');if(!await page.locator('.handoff').count()&&await target.count())await target.first().click();}
}
function installableCounter(version='0.1.0',step=1) {
  return {format:'playroom-pack',formatVersion:1,manifest:{id:'qa-counter',name:'Счётчик',version,engineApi:3,viewApi:2,stateVersion:1,category:'board',tagline:'Пак для проверки установки',author:'QA',capabilities:{hands:false}},files:{
    'rules.js':require('./pack-fixture.cjs').rules({id:'qa-counter',name:'Счётчик',version,key:'count',step}),
    'view.js':`globalThis.PlayroomViews.register('qa-counter',(s,v,actions)=>({api:2,family:'board',className:'qa-counter-scene',elements:{field:'<div data-view-version="${version}"><output class="qa-count">'+s.data.count+'</output></div>',actions:globalThis.PlayroomViews.helpers.actionBar(actions)}}));`,
    'styles.css':`.qa-counter-scene{display:flex;justify-content:center;align-items:center}.qa-count{font-size:48px;color:${step===1?'#245440':'#a44238'}}`
  }};
}
test('Offline pack installation, updates and empty application preserve saved versions',{timeout:60000},async t=>{
  const fixtureServer=process.env.PLAYROOM_URL?.startsWith('http')?null:await serveBrowserFixture(root);
  const testUrl=fixtureServer?.url||url;
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  const choose=async bundle=>page.locator('#pack-file').setInputFiles({name:'counter.playroom-pack.json',mimeType:'application/json',buffer:Buffer.from(typeof bundle==='string'?bundle:JSON.stringify(bundle))});
  const openManager=()=>page.locator('.topbar-tools [data-command=packs]').click();
  const close=()=>page.locator('.modal [data-command=close-modal]').click();
  const add=async expected=>{await page.locator('.qa-counter-scene [data-action]').click();await page.waitForFunction(n=>document.querySelector('.qa-count')?.textContent===String(n),expected);await page.waitForSelector('.scene[aria-busy=false]');};
  try{
    await page.goto(testUrl);
    await page.evaluate(()=>{localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({motion:false,sound:false,quickPlay:false}));});await page.reload();
    await t.test('All bundled games can be removed into a persistent empty hub',async()=>{
      await openManager();
      await page.locator('[data-pack-remove]').last().click();await page.locator('[data-pack-confirm="1"]').click();
      assert((await page.locator('.pack-manager-modal .modal-body').evaluate(el=>el.scrollTop))>0,'pack list keeps its scroll after removing a lower row');
      await page.locator('[data-pack-bulk="all"]').click();await page.locator('[data-pack-confirm="1"]').click();
      await close();assert.equal(await page.locator('.game-tile').count(),0);assert.equal(await page.locator('.packs-empty-hub [data-command=packs]').count(),1);
      await page.reload();assert.equal(await page.locator('.game-tile').count(),0);assert.equal(await page.locator('.packs-empty-hub').count(),1);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    });
    await t.test('Invalid JSON and unsupported bundle produce a visible error without installing',async()=>{
      await openManager();await choose('{invalid');await page.locator('.pack-message').waitFor();assert.match(await page.locator('.pack-message').innerText(),/не удалось прочитать/i);assert.equal(await page.locator('[data-pack-install]').count(),0);
      await choose({format:'not-a-pack'});await page.waitForFunction(()=>document.querySelector('.pack-message')?.textContent.includes('Неподдерживаемый'));assert.equal(await page.locator('.pack-entry').count(),0);
    });
    await t.test('Preview does not execute code; explicit confirmation installs an offline custom game',async()=>{
      await choose(installableCounter());await page.locator('.pack-preview').waitFor();assert.match(await page.locator('.pack-trust').innerText(),/содержит код.*доверяете/s);assert.equal(await page.evaluate(()=>TabletopCore.GAMES.length),0);
      await page.locator('[data-pack-install]').click();await page.locator('.pack-entry[data-pack-id="qa-counter"]').waitFor();await close();assert.equal(await page.locator('[data-start="qa-counter"]').count(),1);
      await page.reload();assert.equal(await page.locator('[data-start="qa-counter"]').count(),1,
        'Custom pack not visible after reload: '+JSON.stringify(await page.evaluate(()=>({
          list:globalThis.PlayroomPacks?.list?.().map(x=>x.id+'@'+x.version),
          catalog:Object.keys(globalThis.PlayroomCatalog||{}),
          packs:(()=>{try{return JSON.parse(localStorage.getItem('playroom.packs.v1'))?.packs?.map(x=>x.manifest.id)}catch(e){return String(e)}})(),
          removed:(()=>{try{return JSON.parse(localStorage.getItem('playroom.packs.v1'))?.removed}catch(e){return String(e)}})(),
          app:document.getElementById('app')?.innerText.slice(0,240),
          warning:globalThis.PlayroomPackLoadError,
        })))+'; JS errors: '+JSON.stringify(errors));
      await page.locator('[data-start="qa-counter"]').first().click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await add(1);
      assert.equal((await saved(page)).packVersion,'0.1.0');await page.locator('.table-heading [data-command=home]').click();
    });
    await t.test('Update keeps old saves on exact rules and new games use the latest version',async()=>{
      await openManager();await choose(installableCounter('0.2.0',10));await page.locator('[data-pack-install]').click();assert.equal(await page.locator('.pack-entry').count(),2);
      assert.equal(await page.locator('.pack-entry[data-pack-version="0.1.0"] [data-pack-remove]').isDisabled(),false);await close();await page.reload();
      await resume(page);await add(2);assert.equal((await saved(page)).packVersion,'0.1.0');assert.equal(await page.locator('.qa-counter-scene [data-view-version]').getAttribute('data-view-version'),'0.1.0');assert.equal(await page.locator('.qa-count').evaluate(el=>getComputedStyle(el).color),'rgb(36, 84, 64)');
      await page.locator('.table-heading [data-command=home]').click();await page.locator('[data-start="qa-counter"]').first().click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await add(10);assert.equal((await saved(page)).packVersion,'0.2.0');
      await page.locator('.table-heading [data-command=home]').click();await openManager();assert.equal(await page.locator('[data-pack-remove]:disabled').count(),0);await close();
      await page.locator('.side-nav [data-command=sessions]').click();assert.equal(await page.locator('.saved-game').count(),2);
    });
    await t.test('A missing pack leaves the save intact and installing its exact version restores it',async()=>{
      const raw=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));
      await page.evaluate(()=>localStorage.removeItem('playroom.packs.v1'));await page.reload();
      await page.locator('.side-nav [data-command=sessions]').click();assert.equal(await page.locator('.saved-game').count(),2);assert.match(await page.locator('.saved-games-list').innerText(),/несовместимой версией игры 0\.2\.0/i);assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),raw);
      await page.locator('.saved-game [data-command=packs]').first().click();await choose(installableCounter('0.2.0',10));await page.locator('[data-pack-install]').click();await close();
      await page.locator('.saved-game [data-resume-id]').click();assert.equal(await page.locator('.qa-count').innerText(),'10');assert.equal(await page.locator('.qa-counter-scene [data-view-version]').getAttribute('data-view-version'),'0.2.0');assert.equal(await page.locator('.qa-count').evaluate(el=>getComputedStyle(el).color),'rgb(164, 66, 56)');
    });
    await t.test('A broken optional view cannot trap the hub after reload or prevent removal',async()=>{
      await page.locator('.table-heading [data-command=home]').click();await openManager();
      const broken=JSON.parse(JSON.stringify(installableCounter()).replaceAll('qa-counter','qa-broken'));
      broken.files['view.js']=`globalThis.PlayroomViews.register('qa-broken',()=>{throw Error('Broken table')},()=>{throw Error('Broken cover')});`;
      await choose(broken);await page.locator('[data-pack-install]').click();await close();await page.reload();
      assert.match(await page.locator('[data-game="qa-broken"] .game-cover').innerText(),/предпросмотр недоступен/i);
      assert.match(await page.evaluate(()=>PlayroomViews.render({game:'qa-broken'},0,[])),/не удалось показать игру/i);
      await openManager();await page.locator('[data-pack-remove="qa-broken"]').click();await page.locator('[data-pack-confirm="1"]').click();await close();assert.equal(await page.locator('[data-game="qa-broken"]').count(),0);
      await page.evaluate(()=>{PlayroomCatalog['qa-counter'].playerBadge=()=>{throw Error('Broken badge')};});
      await resume(page);assert.equal(await page.locator('.qa-count').innerText(),'10');assert.equal(await page.locator('.table-heading [data-command=home]').isVisible(),true);
    });
    await t.test('Removing a saved pack version requires two confirmations and removes only its history',async()=>{
      await page.locator('.table-heading [data-command=home]').click();await openManager();
      await page.locator('[data-pack-remove="qa-counter"][data-pack-version="0.2.0"]').click();
      await page.locator('[data-pack-confirm="1"]').waitFor();
      await page.locator('[data-pack-confirm="1"]').click();
      await page.locator('[data-pack-confirm="2"]').waitFor();
      await page.locator('[data-pack-confirm="2"]').click();
      await page.locator('.pack-entry[data-pack-id="qa-counter"][data-pack-version="0.2.0"]').waitFor({state:'detached'});
      await close();await page.locator('.side-nav [data-command=sessions]').click();
      assert.equal(await page.locator('.saved-game').count(),1);
    });
    assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();await fixtureServer?.close();}
});
test('Real browser UI regression and responsive checks',{timeout:180000},async t=>{
  const fixtureServer=process.env.PLAYROOM_URL?.startsWith('http')?null:await serveBrowserFixture(root);
  const storageUrl=fixtureServer?.url||url;
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  async function pageFor(savedValue=null,viewport={width:390,height:844},extra={},traceAudio=false,testUrl=url){
    const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,...extra});
    if(traceAudio)await context.addInitScript(()=>{
      window.qaAudio={calls:[],audio:null};
      Object.defineProperty(globalThis,'TabletopAudio',{configurable:true,set(Audio){
        Object.defineProperty(globalThis,'TabletopAudio',{value:Audio,writable:true,configurable:true});
        for(const method of ['sequence','play','stop']){
          const original=Audio.prototype[method];
          Audio.prototype[method]=function(...args){
            const entry={method,ids:method==='sequence'?[...args[0]]:method==='play'?[args[0]]:[],pack:args[1]?.pack??null,finished:false};
            qaAudio.audio=this;qaAudio.calls.push(entry);
            const result=original.apply(this,args);
            if(result?.then)result.then(value=>{entry.finished=true;entry.result=value;},error=>{entry.finished=true;entry.error=String(error);});
            return result;
          };
        }
      }});
    });
    await context.addInitScript(({savedValue})=>{if(sessionStorage.getItem('qa-seeded'))return;sessionStorage.setItem('qa-seeded','1');localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({motion:false,sound:false,quickPlay:false}));if(savedValue!==null)localStorage.setItem('playroom.session.v1',typeof savedValue==='string'?savedValue:JSON.stringify(savedValue));},{savedValue});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(testUrl);return {page,context,errors};
  }
  async function check(name,fn){await t.test(name,async()=>{const contexts=[];try{await fn(async(...args)=>{const env=await pageFor(...args);contexts.push(env);return env;});for(const e of contexts)assert.deepEqual(e.errors,[],'uncaught browser errors');}finally{for(const e of contexts)await e.context.close();}});}
  try{
    await check('Closing a room discards its setup and a new game starts fresh',async open=>{
      const {page}=await open();await page.locator('[data-start=uno]').click();
      await page.locator('[data-room-title]').fill('Другая комната');await page.locator('[data-room-title]').press('Tab');
      await page.locator('[data-command=room-rules]').click();await page.locator('[name=preset]').selectOption('quick');await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
      await page.locator('[data-command=lobby-leave]').click();assert.equal(await page.locator('.modal').count(),0);assert.equal(await page.evaluate(()=>PlayroomAppBridge.room()),null);
      await page.locator('[data-start=checkers]').click();assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().game.id),'checkers');
    });
    for(const game of ['uno','domino','durak','checkers','snakes'])await check('Start and play '+game+' through visible controls',async open=>{
      const hasHands=['uno','domino','durak'].includes(game),{page}=await open();
      await page.locator('[data-start='+game+']').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
      await page.locator('[data-command=room-rules]').click();assert.equal(await page.locator('[name=openHands]').count(),hasHands?1:0);
      if(hasHands)await page.locator('[name=openHands]').check();await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
      await page.locator('[data-command=room-rules-view]').click();assert.ok(await page.locator('.rules-list li').count()>0);await page.locator('.modal [data-command=close-modal]').first().click();
      assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().game.id),game);await page.locator('[data-command=lobby-start]').click();const started=await saved(page);assert.equal(started.game,game);assert.equal(started.options.openHands,hasHands);
      await clickMove(page,game);assert.ok(await move(page)>0);await page.locator('[data-command=settings]').click();await page.locator('.modal [data-command=rules]').click();assert.ok(await page.locator('.rules-list li').count()>0);await page.locator('.modal [data-command=close-modal]').first().click();
    });
    await check('Public boards switch seats without a card privacy curtain',async open=>{
      const {page}=await open(fixture('snakes'));await page.locator('[data-command=resume]').last().click();assert.equal(await page.locator('.handoff').count(),0);await page.locator('.die[data-action]').click();assert.equal(await page.locator('.handoff').count(),0);
    });
    await check('Hidden hand curtain protects each seat and reload retains the latest state',async open=>{
      // Reload persistence needs the stable HTTP/PWA origin. file:// storage
      // is browser-dependent; the other UI and layout checks still use file://.
      const {page}=await open(fixture('uno'),undefined,{},false,storageUrl);await page.locator('[data-command=resume]').last().click();assert.equal(await page.locator('.handoff').count(),1);assert.equal(await page.locator('.hand-track .uno-card').count(),0);await page.locator('[data-command=unlock]').click();assert(await page.locator('.hand-track .uno-card').count()>0);
      await clickMove(page,'uno');if(!await page.locator('.handoff').count()){const pass=page.locator('.scene-actions [data-action]').filter({hasText:'Передать'});if(await pass.count())await pass.first().click();}
      const before=await move(page);await page.reload();await resume(page);assert.equal(await move(page),before);
    });
    await check('Pause does not obscure read-only replay; slider keeps focus and live save unchanged',async open=>{
      const snapshot=fixture('uno','pass',8),{page}=await open(snapshot);await resume(page);await page.locator('.table-tools [data-command=pause]').click();await page.locator('[data-command=history]').click();assert.equal(await page.locator('.pause-cover').count(),0);
      await page.locator('#replay-range').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#replay-range').inputValue(),'0');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#replay-range').inputValue(),'1');assert.equal(await page.locator('#replay-range').evaluate(e=>e===document.activeElement),true);assert.equal(await move(page),snapshot.states.at(-1).move);
      assert.equal(await page.locator('.scene [data-action]').count(),0);await page.locator('[data-command=history-close]').click();assert.equal(await page.locator('.pause-cover').count(),1);
    });
    await check('Bots advance and pause while a dialog or replay is open',async open=>{
      const data=fixture('snakes','solo');data.states[0].turn=1;
      const {page}=await open(data);await resume(page);await page.locator('[data-command=settings]').click();await page.locator('.modal [data-command=rules]').click();const n=await move(page);await page.waitForTimeout(350);assert.equal(await move(page),n);await page.locator('.modal [data-command=close-modal]').first().click();await page.waitForFunction(n=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move>n,n);assert.equal(await move(page),n+1);
    });
    await check('Invalid save is rejected with a visible explanation and the hub remains usable',async open=>{
      const {page}=await open('{broken-json');assert.equal(await page.locator('.game-tile').count(),12);assert.match(await page.locator('body').innerText(),/не удалось восстановить/i);await page.locator('[data-start=snakes]').click();await page.locator('[data-command=lobby-start]').click();assert.equal((await saved(page)).game,'snakes');
    });
    await check('Settings persist and fullscreen enters/exits in Chromium',async open=>{
      const {page}=await open(null,undefined,{},false,storageUrl);await page.locator('[data-command=settings]').click();await setRange(page,'setting-speed',2);await setRange(page,'setting-volume',2);await page.locator('.modal [data-command=close-modal]').click();await page.reload();await page.locator('[data-command=settings]').click();assert.equal(await page.locator('#setting-speed').inputValue(),'2');assert.equal(await page.locator('#setting-volume').inputValue(),'2');await page.locator('.modal [data-command=close-modal]').click();await page.locator('[data-command=fullscreen]').click();assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);await page.locator('[data-command=fullscreen]').click();assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
    });
    await check('Sound starts muted; real offline UNO preview, volume and mute survive reload',async open=>{
      const {page}=await open(fixture('uno'),{width:390,height:844},{},true,storageUrl);
      await resume(page);await clickMove(page,'uno');await page.waitForSelector('.scene[aria-busy=false]');
      assert.equal(await move(page),1);
      assert.equal(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='play'||c.method==='sequence').length),0,'muted actions never enter playback');
      await page.locator('.table-tools [data-command=settings]').click();
      assert.equal(await page.locator('#setting-volume').inputValue(),'0');
      assert.equal(await page.locator('#setting-sound').count(),0);
      assert.equal(await page.locator('#setting-volume').isDisabled(),false);
      assert.equal(await page.locator('[data-command=sound-preview]').isDisabled(),true);
      assert.equal(await page.locator('#sound-preview option').count(),31,'26 standard cues including pass/discard/take plus five UNO effects');
      assert.equal(await page.locator('#sound-preview option[value="uno|uno.call"]').textContent(),'Выкрик UNO!');
      await setRange(page,'setting-volume',2);
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.ids[0]==='move'&&c.finished&&c.result));
      await page.getByText('Проверить звук',{exact:true}).click();
      await page.locator('#sound-preview').selectOption('uno|uno.call');
      await page.locator('[data-command=sound-preview]').click();
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.ids[0]==='uno.call'&&c.finished&&c.result));
      assert.deepEqual(await page.evaluate(()=>({context:qaAudio.audio._context.constructor.name,state:qaAudio.audio._context.state,decoded:qaAudio.audio._buffers.size,standard:qaAudio.audio.catalog().length,scoped:qaAudio.audio.catalog('uno').some(c=>c.id==='uno.call'),global:qaAudio.audio.catalog().some(c=>c.id==='uno.call')})),{context:'AudioContext',state:'running',decoded:1,standard:26,scoped:true,global:false});
      await page.evaluate(()=>PlayroomAppBridge.audio.play(['draw','success','victory'],'oldmaid'));
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.ids.join(',')==='draw,success,victory'&&c.finished&&c.result));
      await setRange(page,'setting-volume',1);
      // Observe the persisted state before reloading; distinguish a failed
      // settings write from a delayed browser navigation or a fresh context.
      await page.waitForFunction(()=>{
        const stored=JSON.parse(localStorage.getItem('playroom.settings.v1')||'{}');
        return stored.sound===true&&stored.volume===0.3;
      });
      await page.locator('.modal [data-command=close-modal]').click();await page.reload();if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').click();
      await page.locator('[data-command=settings]').click();
      assert.equal(await page.locator('#setting-volume').inputValue(),'1');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).volume),0.3);
      await setRange(page,'setting-volume',0);
      assert.equal(await page.locator('#setting-volume').isDisabled(),false);
      assert.equal(await page.locator('[data-command=sound-preview]').isDisabled(),true);
      assert.equal(await page.evaluate(()=>qaAudio.audio.enabled),false);
      await page.locator('.modal [data-command=close-modal]').click();await page.reload();if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').click();
      await page.locator('[data-command=settings]').click();
      assert.equal(await page.locator('#setting-volume').inputValue(),'0');
      assert.equal(await page.locator('#setting-sound').count(),0);
      assert.equal(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='play'||c.method==='sequence').length),0,'muted reload never starts a preview');
      assert.equal(await move(page),1,'sound preferences preserve the game');
    });
    await check('Live UNO cues play once; inspections stay silent and history exit/stop cancel real sources',async open=>{
      const data=fixture('uno'),state=data.states[0],d=state.data;
      data.options.openHands=state.openHands=true;data.options.unoMode=d.uno.mode='manual';state.turn=0;
      const pool=[...d.hands[0],...d.drawPile];
      const card=pool.splice(pool.findIndex(c=>c.color===d.color&&/^\d$/.test(c.value)),1)[0];
      const illegal=pool.splice(pool.findIndex(c=>c.color!==d.color&&c.color!=='wild'&&/^\d$/.test(c.value)&&c.value!==d.discard.at(-1).value),1)[0];
      d.hands[0]=[card,illegal];d.drawPile=pool;E.validateState(state);
      const {page}=await open(data,{width:1280,height:900},{isMobile:false,hasTouch:false},true);
      await resume(page);await page.locator('.table-tools [data-command=settings]').click();await page.locator('#setting-auto-pass').uncheck();await setRange(page,'setting-volume',2);
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.finished&&c.result));
      await page.locator('.modal [data-command=close-modal]').click();
      await page.evaluate(()=>qaAudio.calls=[]);
      await exposedClick(page,page.locator('.own-hand [data-select="'+illegal.id+'"]'));
      assert.equal(await move(page),0);assert.equal(await page.locator('.uno-drop-target[data-action]').count(),0);
      await exposedClick(page,page.locator('.own-hand [data-select="'+card.id+'"]'));
      assert.equal(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').length),0,'selection and rejected play stay silent');
      await page.locator('.uno-drop-target[data-action]').click({clickCount:2});
      await page.waitForSelector('.scene[aria-busy=false]');
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.finished&&c.result));
      assert.equal(await move(page),1);
      assert.deepEqual(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').map(c=>({ids:c.ids,pack:c.pack}))),[{ids:['move'],pack:'uno'}]);
      await page.locator('.uno-call').click();await page.waitForSelector('.scene[aria-busy=false]');
      await page.waitForFunction(()=>qaAudio.calls.some(c=>c.method==='sequence'&&c.ids[0]==='uno.call'&&c.finished&&c.result));
      const live=await saved(page);assert.equal(E.project(live.states.at(-1),0).events.at(-1).sound.id,'uno.call');assert.equal(await move(page),2);
      await exposedClick(page,page.locator('.own-hand [data-select="'+illegal.id+'"]'));
      await exposedClick(page,page.locator('.own-hand [data-select="'+illegal.id+'"]'));
      assert.deepEqual(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').map(c=>c.ids)),[['move'],['uno.call']],'rerenders cannot repeat a committed event cue');
      await page.locator('[data-command=history]').click();await page.locator('#replay-range').focus();await page.keyboard.press('Home');
      const beforeReplay=await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').length);
      await page.locator('[data-command=replay-next]').click();
      await page.waitForFunction(n=>qaAudio.calls.filter(c=>c.method==='sequence').length===n+1,beforeReplay);
      assert.deepEqual(await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').at(-1).ids),['move']);
      await page.locator('[data-command=replay-next]').click();
      await page.waitForFunction(()=>qaAudio.audio._groups.size>0&&qaAudio.calls.filter(c=>c.method==='sequence').at(-1).ids[0]==='uno.call');
      await page.locator('[data-command=history-close]').click();
      await page.waitForFunction(()=>qaAudio.calls.filter(c=>c.method==='sequence').at(-1).finished);
      assert.deepEqual(await page.evaluate(()=>({result:qaAudio.calls.filter(c=>c.method==='sequence').at(-1).result,groups:qaAudio.audio._groups.size,voices:qaAudio.audio._voices.size})),{result:false,groups:0,voices:0},'leaving history cancels the active decoded speech source');
      await page.locator('.table-tools [data-command=history]').click();await page.locator('#replay-range').focus();await page.keyboard.press('Home');
      const beforeAuto=await page.evaluate(()=>qaAudio.calls.filter(c=>c.method==='sequence').length);
      await page.locator('[data-command=replay-play]').click();
      await page.waitForFunction(n=>qaAudio.calls.filter(c=>c.method==='sequence').length>=n+2&&qaAudio.calls.filter(c=>c.method==='sequence').at(-1).ids[0]==='uno.call'&&qaAudio.audio._groups.size>0,beforeAuto).catch(async()=>assert.fail(JSON.stringify(await page.evaluate(()=>({calls:qaAudio.calls.map(c=>({method:c.method,ids:c.ids,result:c.result,finished:c.finished})),groups:qaAudio.audio._groups.size,index:document.querySelector('#replay-range')?.value,busy:document.querySelector('.scene')?.getAttribute('aria-busy')})))));
      await page.locator('[data-command=replay-play]').click();
      await page.waitForFunction(()=>qaAudio.calls.filter(c=>c.method==='sequence').at(-1).finished);
      assert.deepEqual(await page.evaluate(()=>({result:qaAudio.calls.filter(c=>c.method==='sequence').at(-1).result,groups:qaAudio.audio._groups.size,voices:qaAudio.audio._voices.size})),{result:false,groups:0,voices:0},'stop replay cancels its current source and sequence');
      assert.deepEqual(await saved(page),live,'replay sound does not change the live save');
    });
    await check('No horizontal page overflow at 320, 390, 768 and 1440 pixels; mobile settings reachable',async open=>{
      for(const [width,height] of [[320,568],[390,844],[768,1024],[844,390],[1440,900]]){
        const {page}=await open(fixture('snakes'),{width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'hub overflow '+width);await resume(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'table overflow '+width);const settings=page.locator('.table-tools [data-command=settings]');assert.equal(await settings.isVisible(),true,'settings hidden '+width);
      }
    });
    await check('Touch swipe up plays once; horizontal gesture scrolls a long single-row hand without playing',async open=>{
      const data=fixture('uno');data.options.openHands=true;data.states[0].openHands=true;
      while(data.states[0].data.hands[0].length<18)data.states[0].data.hands[0].push(data.states[0].data.drawPile.pop());
      const {page,context}=await open(data);await resume(page);const cdp=await context.newCDPSession(page),track=await page.locator('.hand-track').boundingBox();
      const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
      await touch('touchStart',track.x+track.width-35,track.y+50);await touch('touchMove',track.x+40,track.y+50);await touch('touchEnd');await page.waitForFunction(()=>document.querySelector('.hand-track').scrollLeft>0);assert(await page.locator('.hand-track').evaluate(e=>e.scrollWidth>e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1));assert(Math.abs((await page.locator('.hand-track').boundingBox()).height-track.height)<=1);assert.equal(await move(page),0);
      await page.locator('.hand-track').evaluate(e=>e.scrollLeft=0);const card=page.locator('.hand-track [data-swipe-action]').first();await card.scrollIntoViewIfNeeded();const p=await cardTouchPoint(card);await touch('touchStart',p.x,p.y);await touch('touchMove',p.x,p.y-55);await touch('touchEnd');await page.waitForTimeout(100);assert.equal(await move(page),1);
    });
    await check('A fresh touch immediately after a wild-card swipe selects its color',async open=>{
      const data=fixture('uno');data.options.openHands=true;data.states[0].openHands=true;
      const d=data.states[0].data,zone=d.hands[0].some(c=>c.value==='wild')?d.hands[0]:d.drawPile;
      const wild=zone.splice(zone.findIndex(c=>c.value==='wild'),1)[0];assert(wild);d.hands[0].unshift(wild);
      const {page,context}=await open(data);await resume(page);const cdp=await context.newCDPSession(page);
      await page.evaluate(()=>{window.touchTrace=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>touchTrace.push({type,target:e.target.closest('button')?.className,t:performance.now()}),true);});
      const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
      const p=await cardTouchPoint(page.locator('[data-select="'+wild.id+'"]'));
      await touch('touchStart',p.x,p.y);await touch('touchMove',p.x,p.y-55);await touch('touchEnd');
      const start=Date.now();
      // Input commits selection on requestAnimationFrame after pointerup.
      // CDP may acknowledge touchEnd before that frame; keep the original 400 ms assertion.
      // Resolve visibility, current coordinates and hit-testing atomically.
      // A scene rerender between waitFor(visible) and boundingBox() could
      // detach the old button and return null on slower CI runners.
      const choice=await page.waitForFunction(()=>{
        const button=document.querySelector('.color-choice');if(!button)return false;
        const r=button.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        return r.width>1&&r.height>1&&document.elementFromPoint(x,y)?.closest('.color-choice')===button?{x,y}:false;
      },null,{timeout:300});
      const point=await choice.jsonValue();
      await touch('touchStart',point.x,point.y);await touch('touchEnd');
      assert(Date.now()-start<400,'choice must occur inside the former swipe suppression window');
      // CDP may acknowledge touchEnd before Chrome dispatches its native click.
      await page.waitForFunction(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===1,{},{timeout:700}).catch(async()=>assert.fail(JSON.stringify(await page.evaluate(()=>touchTrace))));
      const trace=await page.evaluate(()=>touchTrace),click=trace.find(e=>e.type==='click'&&e.target==='color-choice');
      assert(click&&click.t-trace.find(e=>e.type==='pointerup').t<400,'native color click must occur inside the former suppression window');assert.equal(await move(page),1);
    });
  } finally {await browser.close();await fixtureServer?.close();}
});

test('Phone landscape keeps all games visible, tappable and stable across rotation', {timeout:180000}, async t=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const sizes=[[568,320],[640,280],[740,360],[844,390],[932,430],[960,540]];
  const variants=[...['open','closed'].flatMap(visibility=>[2,4].map(count=>({game:'uno',count,open:visibility==='open',name:`uno-${count}-${visibility}`}))),...['domino','durak','checkers','snakes'].map(game=>({game,count:2,open:true,name:game}))];
  function seed(spec){
    const session=new Session(E,spec.game,{mode:'pass',preset:'classic',presetLabel:'Классика',seed:17,openHands:spec.open,unoMode:'manual',players:Array.from({length:spec.count},(_,i)=>({name:['Аня','Борис','Вера','Глеб'][i]}))});
    if(spec.game==='domino'){
      for(let i=0;i<80&&session.current.status==='playing'&&(session.current.data.chain.length<7||!E.legalActions(session.current).some(a=>a.card));i++)session.act(session.current.turn,E.botAction(session.current));
      assert(session.current.data.chain.length>=7&&session.current.status==='playing');
    }
    E.validateState(session.current);return session.export();
  }
  async function open(spec,viewport){
    const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),data=seed(spec);
    await context.addInitScript(data=>{if(sessionStorage.getItem('landscape-seeded'))return;sessionStorage.setItem('landscape-seeded','1');localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({animationSpeed:'instant',sound:false,quickPlay:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(data));},data);
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await resume(page);return {page,context,errors,data};
  }
  async function visibleTable(page,game,insets={top:0,right:0,bottom:0,left:0}){
    return page.evaluate(insets=>{
      const errors=[],scene=document.querySelector('.scene').getBoundingClientRect();
      if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
      for(const selector of ['.layout-field','.layout-self','.layout-participants','.seat-group'])for(const node of document.querySelectorAll(selector)){if(!node?.getClientRects().length)continue;const r=node.getBoundingClientRect();if(r.left<scene.left-1||r.right>scene.right+1||r.top<scene.top-1||r.bottom>scene.bottom+1)errors.push('region outside '+selector);}
      for(const node of document.querySelectorAll('.table-header button')){const r=node.getBoundingClientRect();if(r.width&&r.height&&(r.width<44||r.height<44))errors.push('touch target');}
      return errors;
    },insets);
  }
  async function tapReadableCard(page,locator){
    await locator.locator(".card-corner:not(.bottom)").scrollIntoViewIfNeeded();
    const p=await locator.evaluate(el=>{
      const marker=el.querySelector('.card-corner:not(.bottom)'),r=marker.getBoundingClientRect(),p={x:r.x+r.width/2,y:r.y+r.height/2};
      const hit=document.elementFromPoint(p.x,p.y);if(hit!==el&&!el.contains(hit))throw Error('Readable card corner is covered');return p;
    });
    // Aim inside the readable strip: a point one pixel from an overlapping
    // neighbour can legitimately be retargeted by the mobile touch hit area.
    await page.touchscreen.tap(p.x,p.y);
  }
  async function playOne(page,game){
    const before=await move(page);
    if(game==='uno'){
      const c=page.locator('.own-hand .is-playable[data-select]').first();
      if(await c.count()){
        await tapReadableCard(page,c);
        assert.deepEqual(await visibleTable(page,game),[],'selected-card controls remain visible');
        const target=page.locator('.uno-drop-target[data-action],.color-choice[data-action]').first();await target.tap();
      }else await page.locator('.stock-button[data-action]').tap();
    }else if(game==='domino'){
      const c=page.locator('.own-hand .is-playable[data-select]').first(),p=await cardTouchPoint(c);await page.touchscreen.tap(p.x,p.y);
      assert.deepEqual(await visibleTable(page,game),[],'both legal table ends remain visible');await page.locator('.domino-drop-target[data-action]').first().tap();
    }else if(game==='durak')await tapReadableCard(page,page.locator('.own-hand .hand-card[data-action]').first());
    else if(game==='checkers'){await page.locator('.checker-piece.movable').first().tap();await page.locator('.checker-cell.destination').first().tap();}
    else await page.locator('.die[data-action]').tap();
    await page.waitForFunction(before=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===before+1,before);
    await page.locator('.scene[aria-busy=false]').waitFor();assert.equal(await move(page),before+1);
  }
  try{
    for(const [width,height] of sizes)for(const spec of variants)await t.test(`${spec.name} at ${width}×${height}`,async()=>{
      const {page,context,errors}=await open(spec,{width,height});
      try{
        if(process.env.PLAYROOM_CAPTURE_DIR&&(process.env.PLAYROOM_CAPTURE_ALL||width===740&&['uno-4-open','durak'].includes(spec.name)))await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`playroom-v0.11-${spec.name}-${width}x${height}.png`)});
        assert.deepEqual(await visibleTable(page,spec.game),[]);await playOne(page,spec.game);assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
    await t.test('Portrait ↔ landscape, fullscreen exit and supported safe-area insets preserve the game',async()=>{
      const spec=variants.find(v=>v.name==='uno-4-open'),{page,context,errors}=await open(spec,{width:390,height:740});
      try{
        const before=await saved(page);
        for(const viewport of [{width:390,height:740},{width:740,height:360},{width:390,height:740},{width:844,height:390}]){
          await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await visibleTable(page,'uno'),[],`rotation to ${viewport.width}×${viewport.height}`);assert.deepEqual(await saved(page),before);
        }
        await page.locator('.table-tools [data-command=settings]').tap();await page.locator('.modal [data-command=fullscreen]').tap();await page.locator('.modal [data-command=close-modal]').tap();
        await page.waitForFunction(()=>!!document.fullscreenElement||document.documentElement.classList.contains('fullscreen-fallback'));
        assert.deepEqual(await visibleTable(page,'uno'),[],'fullscreen keeps the table visible');
        await page.locator('.table-tools [data-command=settings]').tap();await page.locator('.modal [data-command=fullscreen]').tap();await page.locator('.modal [data-command=close-modal]').tap();
        await page.waitForFunction(()=>!document.fullscreenElement&&!document.documentElement.classList.contains('fullscreen-fallback'));
        const cdp=await context.newCDPSession(page);let safeArea=false;
        try{await cdp.send('Emulation.setSafeAreaInsets',{insets:{top:0,left:24,bottom:12,right:24}});safeArea=true;}catch(error){if(!/wasn't found|not found|not supported/i.test(error.message))throw error;t.diagnostic('This Chromium does not expose safe-area emulation; physical notch behavior remains unverified.');}
        if(safeArea){
          const insets=await page.evaluate(()=>{const el=document.createElement('div');el.style.cssText='position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(el);const s=getComputedStyle(el),values={top:parseFloat(s.paddingTop),right:parseFloat(s.paddingRight),bottom:parseFloat(s.paddingBottom),left:parseFloat(s.paddingLeft)};el.remove();return values;});
          assert.deepEqual(insets,{top:0,right:24,bottom:12,left:24});assert.deepEqual(await visibleTable(page,'uno',insets),[],'content stays outside emulated cutout and gesture insets');
        }
        await playOne(page,'uno');assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }finally{await browser.close();}
});

test('Modal gestures scroll their contents without moving the underlying screen', {timeout:180000}, async t=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const server=await serveBrowserFixture(root);
  try{
    for(const [width,height,touch] of [[320,740,true],[390,840,true],[740,390,true],[1440,900,false]])await t.test(`${width}×${height} ${touch?'touch':'wheel'}`,async()=>{
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
      const cdp=await context.newCDPSession(page);
      const gesture=async(x,y,delta)=>{
        if(touch){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          for(let i=1;i<=10;i++){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta*i/10}]});
            await page.waitForTimeout(20);
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }else{await page.mouse.move(x,y);await page.mouse.wheel(0,delta);}
        await page.waitForTimeout(180);
      };
      const checkDialog=async(name)=>{
        await page.evaluate(()=>scrollTo(0,120));
        const before=await page.evaluate(()=>({y:scrollY,top:document.querySelector('#app').getBoundingClientRect().top}));
        const dialog=page.locator('.modal,.lobby-countdown'),box=await dialog.boundingBox(),scroller=await dialog.locator('.modal-body').count()?dialog.locator('.modal-body'):dialog;
        const x=box.x+box.width/2,y=Math.min(box.y+box.height-40,height-35);
        assert(await dialog.evaluate(e=>{
          const head=e.querySelector('.modal-head'),body=e.querySelector('.modal-body');if(!head||!body)return true;
          const h=head.getBoundingClientRect(),b=body.getBoundingClientRect(),layer=document.createElement('div');layer.className='playroom-motion-layer';layer.style.pointerEvents='auto';document.body.appendChild(layer);
          const visible=e.contains(document.elementFromPoint(h.x+h.width/2,h.y+h.height/2));layer.remove();return visible&&b.top>=h.bottom-1;
        }),`${name}: header must stay above body and game animations`);

        await scroller.evaluate(e=>e.scrollTop=0);
        const overflow=await scroller.evaluate(e=>e.scrollHeight-e.clientHeight);
        await gesture(x,y,100);
        if(overflow>2)assert(await scroller.evaluate(e=>e.scrollTop)>0,`${name}: content must scroll`);
        // Both limits, short dialogs and the backdrop must consume gestures.
        await scroller.evaluate(e=>e.scrollTop=e.scrollHeight);await gesture(x,y,100);
        await scroller.evaluate(e=>e.scrollTop=0);await gesture(x,Math.max(box.y+40,125),-100);
        await gesture(3,height/2,100);
        assert.deepEqual(await page.evaluate(()=>({y:scrollY,top:document.querySelector('#app').getBoundingClientRect().top})),before,`${name}: background moved`);
      };
      try{
        await page.goto(server.url);
        // A desktop hub also needs an actual scrollable background to catch leaks.
        await page.evaluate(()=>document.querySelector('#app').style.minHeight='2400px');
        const screens=[['packs','[data-command=packs]'],['settings','.topbar-tools [data-command=settings]'],['help','.topbar-tools [data-command=help]'],['setup','[data-start=uno]'],['rules',null],['pairing','#network-join-button']];
        for(const [name,selector] of screens){
          if(name==='rules'){await page.locator('[data-start=uno]').first().click();await page.locator('[data-command=room-rules-view]').click();}
          else await page.locator(selector).first().click();
          await page.locator('.modal').waitFor();
          await checkDialog(name);
          await page.locator('.modal [data-command=close-modal],.modal [data-command=lobby-leave]').first().click();
          if(name==='rules')await page.locator('.modal [data-command=lobby-leave]').first().click();
          await page.evaluate(()=>scrollTo(0,0));await gesture(width/2,height/2,100);
          assert(await page.evaluate(()=>scrollY)>0,`${name}: closing must restore page scrolling`);
          await page.evaluate(()=>scrollTo(0,0));
        }
        const fs=require('node:fs'),Authority=require('../core/authority.js');
        const session=Session.restore(E,fixture()),snapshot=new Authority(session).connect(0).snapshot();
        const bundles={};require('node:vm').runInNewContext(fs.readFileSync(root+'/installed-packs.js','utf8'),bundles);const bundle=bundles.PlayroomInstalledPacks.find(item=>item.manifest.id==='uno');const def={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:['Правила UNO']};
        await page.evaluate(({snapshot,def})=>{
          snapshot.state.status='finished';
          const client={snapshot,pending:null,subscribe(){return()=>{};},send(){throw Error('No actions during modal test');}};
          window.scrollGame=PlayroomSharedViews.mount(client,def);scrollGame.render();
        },{snapshot,def});
        for(const command of ['rules','result']){
          // Keyboard activation isolates modal scrolling from table footer layout.
          if(command==='rules'){await page.locator('.network-game [data-command=settings]').first().click();await page.locator('.modal [data-shared-rules],.modal [data-quick-shortcut][data-command=rules]').first().click();}else await page.locator('.network-game [data-command='+command+']').first().press('Enter');
          await checkDialog('network '+command);
          await page.locator('.shared-modal-backdrop [data-command=close-modal]').first().click();
          await page.evaluate(()=>scrollTo(0,0));await gesture(3,height/2,100);
          assert(await page.evaluate(()=>scrollY)>0,'Shared dialog close must release scrolling: '+JSON.stringify(await page.evaluate(()=>({modal:document.querySelector('#modal-root').innerHTML,overflow:getComputedStyle(document.documentElement).overflow,app:document.querySelector('#app').getBoundingClientRect().height,scroll:document.documentElement.scrollHeight,body:getComputedStyle(document.body).overflow,curtain:document.querySelectorAll('.handoff').length}))));
          await page.evaluate(()=>scrollTo(0,0));
        }
        await page.locator('.network-game [data-command=result]').press('Enter');
        await page.evaluate(()=>scrollGame.destroy());
        assert.equal(await page.locator('.modal').count(),0);
        await page.evaluate(()=>scrollTo(0,0));await gesture(3,height/2,100);
        assert(await page.evaluate(()=>scrollY)>0,'Shared mount destroy must release scrolling');
        await page.goto(server.url);
        await page.locator('[data-start=uno]').first().click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
        await page.locator('[data-command=lobby-start]').click();await page.locator('.handoff').waitFor();
        const curtain=await page.locator('.handoff').boundingBox(),before=await page.evaluate(()=>scrollY);
        await gesture(curtain.x+5,Math.min(height-35,curtain.y+curtain.height-35),100);
        assert.equal(await page.evaluate(()=>scrollY),before,'Handoff must not scroll the background');
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
        await page.locator('.handoff [data-command=unlock]').click();
        assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
        // Use the same static overlay markup emitted by both room renderers;
        // scrolling isolation does not require connecting an authority.
        await page.goto(server.url);
        if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').click();
        if(await page.locator('.table-heading [data-command=home]').count())await page.locator('.table-heading [data-command=home]').click();
        await page.evaluate(()=>{
          document.querySelector('#app').style.minHeight='2400px';
          document.querySelector('#app').insertAdjacentHTML('beforeend','<div class="lobby-countdown" role="status" aria-live="assertive"><div><strong>3</strong><p>Игра начинается…</p></div></div>');
        });
        await checkDialog('room countdown');
        await page.evaluate(()=>{document.querySelector('.lobby-countdown').remove();scrollTo(0,0);});
        await gesture(3,height/2,100);
        assert(await page.evaluate(()=>scrollY)>0,'Countdown teardown must restore scrolling');
        assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }finally{await browser.close();await server.close();}
});

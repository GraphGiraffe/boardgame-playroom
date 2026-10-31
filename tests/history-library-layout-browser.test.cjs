'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),Core=require('../core/engine.js'),Session=require('../core/session.js');
for(const game of ['checkers','uno','domino','durak','snakes'])require(root+'/packs/'+game+'/rules.js');
function saved(game,finished=false){const s=new Session(Core,game,{seed:17,mode:'solo',preset:'classic',players:[{name:'Иван'},{name:'Мика',bot:true}]});for(let i=0;i<8&&s.current.status==='playing';i++)s.act(s.current.turn,Core.botAction(s.current));if(finished){const apply=Core.applyAction;Core.applyAction=(...args)=>{const next=apply(...args);Core.finish(next,0,'Иван побеждает');return next;};try{s.act(s.current.turn,Core.botAction(s.current));}finally{Core.applyAction=apply;}}return s.export();}
test('complete local and projected replay scenes fit beside reachable history controls',{timeout:90000},async t=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try{for(const [width,height] of [[320,640],[390,740],[740,390],[1280,720]])for(const game of ['checkers','uno','domino','durak','snakes'])await t.test(game+' '+width+'×'+height,async()=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true}),page=await context.newPage(),fixture=saved(game),errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await context.addInitScript(f=>localStorage.setItem('playroom.session.v1',JSON.stringify(f)),fixture);
      await page.goto(server.url);await page.locator('[data-command=sessions]').first().click();await page.locator('[data-resume-id]').first().click();await page.locator('.table-tools [data-command=history]').click();
      async function fits(){await page.waitForTimeout(60);const box=await page.evaluate(()=>{
        const scene=document.querySelector('.scene.replaying'),stage=scene.firstElementChild,s=scene.getBoundingClientRect(),r=stage.getBoundingClientRect(),panel=document.querySelector('.history-panel').getBoundingClientRect();
        return {overflow:document.documentElement.scrollHeight-innerHeight,stageHeight:r.height,sceneHeight:scene.clientHeight,left:r.left,right:r.right,sceneLeft:s.left,sceneRight:s.right,panelBottom:panel.bottom,height:innerHeight,zoom:stage.style.zoom,parts:[...document.querySelectorAll('.table-header,.layout-participants,.history-panel')].map(e=>({name:e.className,height:e.getBoundingClientRect().height}))};});
        assert.ok(box.overflow<=2,'history must fit the viewport '+JSON.stringify(box));assert.ok(box.stageHeight<=box.sceneHeight+2,'the complete board must fit '+JSON.stringify(box));assert.ok(box.left>=box.sceneLeft-2&&box.right<=box.sceneRight+2,'board must fit horizontally');assert.ok(box.panelBottom<=box.height,'history controls must remain visible');
        const positions=await page.evaluate(()=>{const header=document.querySelector('.table-header').getBoundingClientRect(),settings=document.querySelector('.table-tools [data-command=settings]').getBoundingClientRect(),help={width:0},back=document.querySelector('.table-heading [data-command=history-close]').getBoundingClientRect();return {header:header.height,settingsX:settings.x,helpX:help.width?help.x:settings.x-1,settingsY:settings.y,helpY:help.width?help.y:settings.y,backX:back.x,backY:back.y,target:settings.width};});
        assert.ok(positions.settingsX>positions.helpX&&Math.abs(positions.settingsY-positions.helpY)<=1,'Help and settings must stay at the right edge on one row');
        assert.ok(positions.backX<positions.helpX&&positions.backY<=positions.settingsY+1,'History return stays at the left of the same header');
        assert.ok(positions.header<=110&&positions.target>=44,'A horizontal header must retain reachable icon buttons');

      }
      await fits();
      if(width===390&&game==='checkers'){await page.setViewportSize({width:740,height:390});await fits();await page.setViewportSize({width,height});await fits();}
      if(process.env.PLAYROOM_CAPTURE_DIR&&width===390&&game==='checkers'){
        require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'history-checkers-390.png'),animations:'disabled'});
      }
      assert.equal(await page.locator('.history-panel .replay-badge:visible').count(),1);
      assert.equal(await page.locator('.table-bottom:visible').count(),0,'no duplicate event description below the board');
      await page.locator('#replay-range').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});await fits();
      await page.locator('[data-command=replay-next]').click();await fits();
      await page.evaluate(f=>{
        const s=TabletopSession.restore(TabletopCore,f),a=new SessionAuthority(s),binding=a.connect(0),client={snapshot:binding.snapshot(),pending:null,subscribe:()=>()=>{},history:i=>Promise.resolve(binding.history(i)),send:()=>Promise.reject(Error('Read only'))};
        window.qaHistory=PlayroomSharedViews.mount(client,PlayroomAppBridge.packs.exportView(s.game,s.packVersion),{readOnly:true});qaHistory.render();return qaHistory.openHistory(s.states.length-1);
      },fixture);
      await fits();assert.deepEqual(errors,[]);await page.evaluate(()=>qaHistory.destroy());
    }finally{await context.close();}
  });}finally{await browser.close();await server.close();}
});

test('saved games share icon controls and local history opens directly without advancing the match',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),fixture=saved('checkers');
  try{
    const completed={...saved('checkers',true),libraryId:'qa-finished'};
    await context.addInitScript(({fixture,completed})=>{localStorage.setItem('playroom.session.v1',JSON.stringify(fixture));localStorage.setItem('playroom.paused.v1.qa-finished',JSON.stringify(completed));},{fixture,completed});await page.goto(server.url);
    await page.evaluate(()=>{
      PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>[
        {sessionId:'qa-host',role:'host',game:'uno',packVersion:'0.2.1',revision:62,players:['Иван','Алиса'],name:'Комната Иван',updatedAt:Date.now()},
        {id:'qa-client',role:'client',game:'uno',packVersion:'0.2.1',revision:62,savedFrames:63,players:['Иван','Алиса'],name:'Комната Иван',updatedAt:Date.now()-1}
      ]};
    });
    await page.locator('[data-command=sessions]').first().click();await page.locator('[data-network-session-id="qa-host"]').waitFor();
    for(const theme of ['light','dark']){
      await page.locator('[data-command=settings]:visible').first().click();
      if(await page.locator('html').getAttribute('data-appearance-mode')!==theme)await page.locator('[data-theme-toggle]').click();
      await page.locator('#modal-root [data-command=close-modal]').first().click();
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:740});
      const geometry=await page.evaluate(()=>{
        const panel=document.querySelector('#saved-games-panel'),q=s=>panel.querySelector(s),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};},style=e=>{const s=getComputedStyle(e);return [s.fontSize,s.fontFamily,s.fontWeight,s.lineHeight];};
        return {heading:q('h1').innerText,mainType:style(document.querySelector('#hub-games-page .intro h1')),savedType:style(q('h1')),button:rect(q('[data-save-import]')),title:rect(q('h1')),count:rect(q('.saved-count')),trash:rect(q('[data-clear-games]')),overflow:document.documentElement.scrollWidth>innerWidth||[...q('.saved-filter-bar').children].some(e=>e.getBoundingClientRect().right>panel.getBoundingClientRect().right+1)};
      });
      assert.equal(await page.locator('#saved-games-panel .saved-new-game').count(),0);assert.equal(geometry.heading,'Мои партии\nИстории игр');assert.deepEqual(geometry.mainType,geometry.savedType);assert(!geometry.overflow);
      assert(geometry.button.x>=geometry.title.right-1);assert(geometry.trash.width<=36);assert(Math.abs(geometry.count.y+geometry.count.height/2-geometry.trash.y-geometry.trash.height/2)<2);
      if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'saved-heading-'+theme+'-'+width+'.png'),fullPage:true,animations:'disabled'});
    }
    }
    await page.setViewportSize({width:390,height:740});
    for(const card of await page.locator('.saved-game').all()){
      const buttons=card.locator('.saved-history,.saved-continue');assert.equal(await buttons.count(),2);
      for(const button of await buttons.all()){
        assert.equal((await button.innerText()).trim(),'');assert.ok(await button.getAttribute('aria-label'));assert.ok(await button.getAttribute('title'));
        const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'icon targets must stay touch-sized');
      }
    }
    if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'saved-games-390.png'),fullPage:true,animations:'disabled'});
    assert.equal(await page.locator('[data-session-id="qa-finished"] .saved-continue').isDisabled(),true);
    await page.locator('.saved-game:has(.saved-continue:not(:disabled)) [data-history-id]').click();await page.locator('.history-panel').waitFor();
    assert.equal(await page.locator('.scene [data-action]').count(),0);
    assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.list().find(entry=>!entry.finished).move),fixture.states.at(-1).move);
    await page.locator('[data-command=history-close]').click();assert.equal(await page.locator('.scene.replaying').count(),0);
    await page.locator('.saved-games-list').waitFor();
    await page.locator('[data-session-id="qa-finished"] [data-history-id]').click();await page.locator('.history-panel').waitFor();assert.equal(await page.locator('.table-tools [data-command=result]').count(),1);
    await page.locator('#replay-range').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
    for(const [width,height] of [[320,640],[390,740],[740,390]]){
      await page.setViewportSize({width,height});
      assert.equal(await page.locator('.table-tools [data-command=result]').count(),1);
      assert.equal(await page.locator('.table-tools [data-command=room]').count(),0);
      const box=await page.locator('.table-tools').boundingBox();assert(box.x>=0&&box.x+box.width<=width,'toolbar stays on screen');
      if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'local-finished-history-'+width+'.png')});
    }
    await page.locator('.table-tools [data-command=result]').click();assert.equal(await page.locator('.result-scores').count(),1);

  }finally{await context.close();await browser.close();await server.close();}
});


test('Hotseat library history chooses a player, preserves slider and leaves the active save untouched',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
  const history=new Session(Core,'uno',{seed:19,mode:'pass',players:[{name:'Анна'},{name:'Борис'}]});history.act(history.current.turn,Core.botAction(history.current));
  const active=saved('checkers'),archive={...history.export(),libraryId:'qa-hotseat'};
  try{
    await context.addInitScript(({active,archive})=>{localStorage.setItem('playroom.session.v1',JSON.stringify(active));localStorage.setItem('playroom.paused.v1.qa-hotseat',JSON.stringify(archive));},{active,archive});
    await page.goto(server.url);await page.locator('[data-command=sessions]').first().click();
    const raw=await page.evaluate(()=>localStorage.getItem('playroom.session.v1'));
    await page.locator('[data-history-id="qa-hotseat"]').click();await page.locator('#history-viewer').selectOption('1');
    assert.equal(await page.locator('.handoff').count(),0);assert.equal(await page.locator('.history-caption').count(),0);assert.equal(await page.locator('.scene [data-participant-role=hand]').count(),1,'Only the added offline participant uses the Hotseat role icon');
    await page.locator('#replay-range').evaluate(el=>{window.qaLocalRange=el;el.focus();el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.evaluate(()=>qaLocalRange===document.querySelector('#replay-range')&&qaLocalRange===document.activeElement),true);
    assert.match(await page.locator('.table-status').innerText(),/Начальная расстановка/);
    assert.equal(await page.locator('#history-viewer').inputValue(),'1');
    await page.locator('[data-command=replay-next]').click();assert.equal(await page.locator('#history-viewer').inputValue(),'1');
    await page.locator('[data-command=history-close]').click();await page.locator('.saved-games-list').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),raw);
  }finally{await context.close();await browser.close();await server.close();}
});

test('local and network delete dialogs share controls and delete only their chosen record',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
 try{
  await context.addInitScript(f=>{localStorage.setItem('playroom.session.v1',JSON.stringify({...f,libraryId:'delete-local'}));localStorage.setItem('playroom.paused.v1.keep-local',JSON.stringify({...f,libraryId:'keep-local'}));},saved('uno'));
  page.setDefaultTimeout(5000);page.on('pageerror',e=>console.error('Delete dialog page error:',e.message));await page.goto(server.url);
  await page.evaluate(()=>{window.deleteRows=['delete-network','keep-network'].map(id=>({id,sessionId:id,role:'client',game:'uno',packVersion:'0.4.6',revision:1,savedFrames:2,players:['Иван','Мика'],name:'Комната',updatedAt:Date.now()}));window.removed=[];
   PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>deleteRows,remove:async id=>{removed.push(id);deleteRows=deleteRows.filter(r=>'client:'+r.id!==id);}};
  });
  await page.locator('[data-command=sessions]').first().click();await page.locator('[data-delete-id="client:delete-network"]').waitFor();
  const geometry=[];
  for(const [id,network] of [['delete-local',false],['client:delete-network',true]]){
   await page.locator(`[data-delete-id="${id}"]`).click();
   assert.equal(await page.locator('#modal-root h2').innerText(),'Удалить партию?');
   assert.equal(await page.locator('#modal-root .lead').innerText().then(s=>s.includes('только на этом устройстве')),network);
   geometry.push(await page.locator('#modal-root .modal-foot').evaluate(el=>[...el.children].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))));
   if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,network?'delete-network.png':'delete-local.png')});
   await page.getByRole('button',{name:'Оставить',exact:true}).click();assert.equal(await page.locator(`[data-delete-id="${id}"]`).count(),1);
   await page.locator(`[data-delete-id="${id}"]`).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.locator(`[data-delete-id="${id}"]`).waitFor({state:'detached'});
   assert.equal(await page.locator('[data-delete-id="keep-local"]').count(),1);assert.equal(await page.locator('[data-delete-id="client:keep-network"]').count(),1);
  }
  assert.deepEqual(geometry[0],geometry[1]);assert.deepEqual(await page.evaluate(()=>removed),['client:delete-network']);
  await page.locator('[data-clear-games]').click();assert.equal(await page.locator('#modal-root h2').innerText(),'Удалить все партии');
  for(const width of [320,390]){await page.setViewportSize({width,height:740});const buttons=page.locator('.saved-clear-options .btn');assert.deepEqual(await buttons.allTextContents(),['Облако','Устройство']);assert(await buttons.evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1)&&Math.abs(nodes[0].getBoundingClientRect().y-nodes[1].getBoundingClientRect().y)<1));if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'clear-all-'+width+'.png')});}
  await page.locator('#modal-root [data-command=close-modal]').first().click();assert.equal(await page.locator('.saved-game').count(),2);
  await page.locator('[data-clear-games]').click();await page.locator('[data-clear-games-confirm]').click();await page.locator('[data-confirm-accept]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.saved-game').length===0);
  assert.deepEqual(await page.evaluate(()=>removed),['client:delete-network','client:keep-network']);
 }finally{await context.close();await browser.close();await server.close();}
});

 test('hub pages keep independent scroll positions across buttons touch and async refresh',{timeout:35000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true}),page=await context.newPage();page.setDefaultTimeout(5000);
 try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{window.qaSessionCount=18;PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>Array.from({length:qaSessionCount},(_,i)=>({id:'scroll-session-'+i,role:'client',game:'uno',revision:5,savedFrames:6,players:['Иван','Бот'],name:'Комната '+i,updatedAt:Date.now()-i}))};});
 const scroll=async value=>{await page.evaluate(value=>scrollTo(0,value),value);await page.waitForTimeout(60);return page.evaluate(()=>scrollY);};
 const games=await scroll(480);await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.locator('[data-network-session-id]').first().waitFor();const sessions=await scroll(350);await page.locator('.hub-page-tabs [data-command=home]').click();await page.waitForTimeout(450);assert(Math.abs(await page.evaluate(()=>scrollY)-games)<3,'games scroll restored');await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.waitForTimeout(450);assert(Math.abs(await page.evaluate(()=>scrollY)-sessions)<3,'sessions scroll restored after async refresh');
 const cdp=await page.context().newCDPSession(page),tap=async command=>{const box=await page.locator('.hub-page-tabs [data-command='+command+']').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);};
 await tap('home');assert(await page.locator('#hub-games-page').evaluate(el=>el.classList.contains('is-active')));assert(Math.abs(await page.evaluate(()=>scrollY)-games)<3,'touch keeps games position');await tap('sessions');assert(await page.locator('#hub-sessions-page').evaluate(el=>el.classList.contains('is-active')));assert(Math.abs(await page.evaluate(()=>scrollY)-sessions)<3,'touch keeps sessions position');await cdp.detach();
 await page.evaluate(()=>history.back());await page.waitForFunction(()=>document.querySelector('#hub-games-page')?.classList.contains('is-active'));await page.waitForTimeout(100);assert(Math.abs(await page.evaluate(()=>scrollY)-games)<3,'Back keeps games position');assert.equal(await page.evaluate(()=>history.scrollRestoration),'manual','SPA owns same-document scroll restoration');
 await page.locator('.topbar-tools [data-command=packs]').click();await page.locator('.pack-manager-modal').waitFor();await page.locator('.pack-manager-modal [data-command=close-modal]').click();const afterPacks=await scroll(610);await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.locator('.hub-page-tabs [data-command=home]').click();await page.waitForTimeout(100);assert(Math.abs(await page.evaluate(()=>scrollY)-afterPacks)<3,'switching after pack manager does not reuse old focus and reset scroll');
 for(const command of ['settings','packs','settings','packs']){await page.locator('.topbar-tools [data-command='+command+']').click();await page.locator('#modal-root .modal').waitFor();await page.evaluate(()=>dispatchEvent(new Event('playroom:cloud-saves-updated')));await page.locator('#modal-root .modal-head [data-command=close-modal]').click();assert(await page.locator('.topbar-tools [data-command='+command+']').evaluate(el=>el===document.activeElement),'focus returns to actual opener '+command);const position=await scroll(570);await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.locator('.hub-page-tabs [data-command=home]').click();await page.waitForTimeout(100);assert(Math.abs(await page.evaluate(()=>scrollY)-position)<3,'repeated modal '+command+' keeps independent scroll');}
 await page.evaluate(()=>{qaSessionCount=1;});for(const scale of [100,120]){await page.setViewportSize({width:390,height:844});await page.evaluate(scale=>PlayroomInterfaceScale.set(scale),scale);const position=await scroll(520);await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-network-session-id]').length===1);await page.locator('.hub-page-tabs [data-command=home]').click();await page.waitForTimeout(100);assert(Math.abs(await page.evaluate(()=>scrollY)-position)<3,'short page does not reset games at '+scale);for(let i=0;i<3;i++){await page.locator('.hub-page-tabs [data-command=sessions]').click();await page.locator('.hub-page-tabs [data-command=home]').click();}await page.waitForTimeout(150);assert(Math.abs(await page.evaluate(()=>scrollY)-position)<3,'rapid toggles retain position at '+scale);}

 }finally{await browser.close();await server.close();}
 });

 test('shared hub header remains reachable while both pages scroll at phone and desktop scales',{timeout:40000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const [width,height,scales]of [[390,844,[100,120]],[740,390,[100,110]],[1280,900,[100,150]]]){const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),page=await context.newPage();page.setDefaultTimeout(5000);try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>Array.from({length:18},(_,i)=>({id:'sticky-'+i,role:'client',game:'uno',revision:5,savedFrames:6,players:['Иван','Бот'],name:'Комната '+i,updatedAt:Date.now()-i}))};});
 await page.evaluate(()=>PlayroomChatState.summary([{key:'dm:header-badge-test',unread:1,invites:1,through:'0'}]));await page.locator('.topbar .chat-counter-messages').waitFor();
 for(const scale of scales){await page.evaluate(scale=>PlayroomInterfaceScale.set(scale),scale);assert.equal(await page.evaluate(()=>PlayroomInterfaceScale.applied),scale);for(const command of ['home','sessions']){await page.locator('.hub-page-tabs [data-command='+command+']').click();if(command==='sessions')await page.locator('[data-network-session-id]').first().waitFor();await page.evaluate(()=>scrollTo(0,420));await page.waitForTimeout(80);const before=await page.evaluate(()=>scrollY);assert(before>30,'page must actually scroll');assert(await page.locator('.hub-main .topbar').evaluate(el=>{const box=el.getBoundingClientRect(),scale=PlayroomInterfaceScale.applied/100,top=parseFloat(getComputedStyle(el).top)*scale;return Math.abs(box.top-top)<2&&box.right<=document.documentElement.clientWidth+1&&[...el.querySelectorAll('.icon-btn')].filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&b.contains(hit);});}),'header/actions stay visible '+width+' '+scale+' '+command);
 assert(await page.locator('.topbar .chat-counter').evaluateAll(nodes=>nodes.length===2&&nodes.every(n=>{const r=n.getBoundingClientRect(),parent=n.parentElement.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.width>0&&parent.top>=0;})),'message and invitation badges fit the viewport '+width+' '+scale+' '+command);
 await page.locator('.topbar-tools [data-command=settings]').click();await page.locator('.settings-overview').waitFor();await page.locator('.modal-head [data-command=close-modal]').click();assert(Math.abs(await page.evaluate(()=>scrollY)-before)<3,'sticky action preserves scroll after closing');
 if(process.env.PLAYROOM_CAPTURE_DIR&&width===390&&scale===120){await page.evaluate(()=>PlayroomAppearanceUI.runtime.service.select('dark'));require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'sticky-'+command+'.png'),animations:'disabled'});}
 }}
 }finally{await context.close();}}
 }finally{await browser.close();await server.close();}
 });

 test('hub header holds its viewport position during touch and both fullscreen transitions',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();page.setDefaultTimeout(5000);
 try{await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.addStyleTag({content:':root:not(:fullscreen){--hub-safe-top:24px}'});await page.evaluate(()=>{PlayroomNetworkLibrary={...PlayroomNetworkLibrary,list:async()=>Array.from({length:18},(_,i)=>({id:'moving-'+i,role:'client',game:'uno',revision:5,savedFrames:6,players:['Иван','Бот'],name:'Комната '+i,updatedAt:Date.now()-i}))};});
 const header=page.locator('.hub-main .topbar'),cdp=await context.newCDPSession(page),gesture=async()=>{await page.evaluate(()=>{window.qaHeaderSamples=[];window.qaHeaderSampling=true;const sample=()=>{const header=document.querySelector('.hub-main .topbar'),button=header.querySelector('[data-command=settings]');qaHeaderSamples.push({y:header.getBoundingClientRect().top,button:button.getBoundingClientRect().top,scroll:scrollY});if(qaHeaderSampling)requestAnimationFrame(sample);};requestAnimationFrame(sample);});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:650}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:650-i*28}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(120);const samples=await page.evaluate(()=>{qaHeaderSampling=false;return qaHeaderSamples;});assert(samples.length>8);assert(samples.some(s=>s.scroll>samples[0].scroll+20),'real gesture scrolls content');for(const key of ['y','button'])assert(Math.max(...samples.map(s=>s[key]))-Math.min(...samples.map(s=>s[key]))<.8,'header does not drift: '+key);};
 const mode=async full=>{await header.locator('[data-command=settings]').click();await page.locator('.settings-header-actions [data-command=fullscreen]').click();await page.waitForFunction(full=>!!document.fullscreenElement===full,full);await page.setViewportSize({width:390,height:full?900:844});await page.locator('.modal-head [data-command=close-modal]').click();await page.waitForTimeout(80);};
 for(const scale of [100,120]){await page.evaluate(scale=>PlayroomInterfaceScale.set(scale),scale);for(const command of ['home','sessions']){await page.locator('.hub-page-tabs [data-command='+command+']').click();if(command==='sessions')await page.locator('[data-network-session-id]').first().waitFor();await page.evaluate(()=>scrollTo(0,250));await page.waitForTimeout(60);const normal=await header.locator('[data-command=settings]').evaluate(e=>e.getBoundingClientRect().top);await gesture();await mode(true);const full=await header.locator('[data-command=settings]').evaluate(e=>e.getBoundingClientRect().top);assert(Math.abs(normal-full-24)<2,'fullscreen frees safe top');assert(await header.evaluate(e=>Math.abs(e.getBoundingClientRect().top)<.5&&e.contains(document.elementFromPoint(innerWidth/2,1))),'opaque header fills fullscreen top');if(process.env.PLAYROOM_CAPTURE_DIR){require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'fullscreen-'+command+'-'+scale+'.png')});}await gesture();await mode(false);const restored=await header.locator('[data-command=settings]').evaluate(e=>e.getBoundingClientRect().top);assert(Math.abs(normal-restored)<2,'exiting fullscreen restores header position');await gesture();if(process.env.PLAYROOM_CAPTURE_DIR){require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'normal-'+command+'-'+scale+'.png')});}}}
 await cdp.detach();
 }finally{await context.close();await browser.close();await server.close();}
 });

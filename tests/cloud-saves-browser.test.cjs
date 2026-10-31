'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const accountSyncRoute=require('./account-sync-fixture.cjs');
const out=path.resolve(__dirname,'../../tmp_files/cloud-saves-020');fs.mkdirSync(out,{recursive:true});
test('cloud saves: account opt-in, separate quota, two devices, offline retry, conflicts and compact management UI',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(process.env.PLAYROOM_BROWSER_ROOT||path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),rows=new Map(),errors=[],offline=[false,false];let enabled=false,puts=0;
 const user={id:'00000000-0000-4000-8000-000000000099',email:'cloud@example.test',is_anonymous:false};
 const snapshot=()=>({enabled,used:[...rows.values()].reduce((n,r)=>n+(r.deleted?0:Buffer.byteLength(r.file)),0),limit:10485760,entries:[...rows.values()].map(({file,...r})=>({...r,bytes:file?Buffer.byteLength(file):0}))});
 try{
  const pages=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(user=>{localStorage.setItem('playroom.cloud-auth.v1:https://geurlwivdiqboylciqhl.supabase.co',JSON.stringify({access_token:'cloud-token',refresh_token:'refresh-token',expires_at:Date.now()+3600000,user}));},user);
   await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',accountSyncRoute(async route=>{
    if(offline[i])return route.abort('internetdisconnected');
    const req=route.request(),url=req.url(),p=req.postDataJSON?.()||{};let value={},status=200;
    if(url.includes('/auth/v1/user'))value=user;
    else if(url.endsWith('/playroom_cloud_saves_rpc')){
     const a=p.p_action,d=p.p_data||{},r=rows.get(d.id);
     if(a==='get'){if(!r||r.deleted){status=400;value={message:'social:not-found'};}else value=r;}
     else if(['put','delete','enable'].includes(a)){
      if((r?.revision||0)!==d.revision){status=400;value={message:'social:conflict'};}
      else{
       if(a==='put'){puts++;rows.set(d.id,{...d,revision:d.revision+1,updated_at:new Date().toISOString(),deleted:false});}
       else if(a==='delete')Object.assign(r,{revision:r.revision+1,file:null,checksum:null,deleted:true,enabled:false});
       else Object.assign(r,{revision:r.revision+1,enabled:d.enabled});value=snapshot();
      }
     }else{if(a==='settings')enabled=d.enabled;value=snapshot();}
    }else if(url.endsWith('/playroom_push'))value={ready:false};
    else value={profile:{username:'cloud',nickname:'Облако'},friends:[],rooms:[],invitations:[],requests:[],messages:[],groups:[]};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   }));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge&&globalThis.PlayroomCloudSavesUI?.service?.loaded);pages.push(page);
  }
  const [a,b]=pages;
  await a.evaluate(async()=>{const s=new TabletopSession(TabletopCore,'tictactoe',{seed:17,mode:'pass',players:[{name:'А'},{name:'Б'}],lobbyConfig:{password:'CLOUD-SECRET',resumeToken:'CLOUD-SECRET'}});s.act(0,TabletopCore.legalActions(s.current,0)[0]);await PlayroomAppBridge.saveLibrary.activateAsync(s,'cloud-fixture');PlayroomAppBridge.showSessions();});
  assert.equal(puts,0);assert.equal(await a.locator('[data-save-export]').count(),0);await a.locator('[data-cloud-save="local:cloud-fixture"]').click();await a.locator('[data-save-export="cloud-fixture"]').waitFor();assert.equal(await a.locator('[data-cloud-action]').count(),4);assert.equal(await a.locator('.cloud-save-modal h2').innerText(),'Сохранение');
  assert.deepEqual(await a.locator('[data-cloud-action]').evaluateAll(nodes=>nodes.map(e=>e.dataset.cloudAction)),['delete','upload','download','sync']);
  assert(await a.locator('.cloud-save-actions').evaluate(e=>{const b=e.getBoundingClientRect(),buttons=[...e.children].map(n=>n.getBoundingClientRect());return Math.abs(buttons[0].left-b.left)<1&&Math.abs(buttons.at(-1).right-b.right)<1&&buttons[2].left-buttons[1].right<=10;}),'cloud deletion left, remaining group right');
  assert(await a.locator('[data-save-export]').evaluate(e=>!!e.closest('.modal-head')));assert(await a.locator('[data-save-export]').evaluate(e=>e.getBoundingClientRect().left>=e.closest('.modal-head').querySelector('h2').getBoundingClientRect().right));await a.locator('[data-save-export]').click();await a.locator('.save-transfer-modal').waitFor();await a.locator('.save-transfer-modal [data-command=close-modal]').click();await a.locator('.cloud-save-modal').waitFor();
  await a.screenshot({path:path.join(out,'manage-before-390.png')});
  await a.evaluate(()=>PlayroomAccountUI.show());await a.locator('.account-identity strong').filter({hasText:'@cloud'}).waitFor();
  assert.deepEqual(await a.locator('.account-quick-actions button').evaluateAll(nodes=>nodes.map(e=>e.dataset.accountMode||'push')),['logout','push','username','password-change']);
  assert.equal(await a.locator('.push-settings').count(),0);await a.screenshot({path:path.join(out,'account-compact-390.png')});await a.locator('[data-cloud-default]').check();await a.waitForFunction(()=>PlayroomCloudSavesUI.service.state('local:cloud-fixture')==='synced');assert.equal(puts,1);assert.equal(enabled,true);
  const uploaded=[...rows.values()][0].file;assert.equal((await a.evaluate(text=>PlayroomSaveTransfer.inspect(text).then(v=>({pack:v.pack})),uploaded)).pack,null);assert(!uploaded.includes('CLOUD-SECRET'));
  await a.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showSessions();});await a.locator('[data-cloud-save="local:cloud-fixture"][data-cloud-status=synced]').waitFor();
  await a.locator('[data-cloud-save="local:cloud-fixture"]').click();await a.screenshot({path:path.join(out,'manage-synced-390.png')});
  await a.evaluate(()=>PlayroomAppBridge.closeModal(true));await a.locator('#app [data-command=packs]').first().click();await a.locator('.pack-manager-modal [data-cloud-usage]').waitFor();assert.match(await a.locator('[data-cloud-usage]').innerText(),/\/10 МБ/);for(const width of [320,390]){await a.setViewportSize({width,height:844});
  assert(await a.locator('[data-pack-file-open]').evaluate(e=>e.getBoundingClientRect().left>=e.closest('.modal-head').querySelector('h2').getBoundingClientRect().right),'pack import is right of title');
  assert(await a.locator('.storage-usage-summary,.storage-usage-labels').evaluateAll(nodes=>nodes.every(e=>e.scrollWidth<=e.clientWidth+1)),'storage icons and values fit '+width);
  assert.equal(await a.locator('.storage-usage-summary [data-ui-icon=app]').count(),1);assert.equal(await a.locator('.storage-usage-labels [data-ui-icon=gear]').count(),1);
  const controls=a.locator('.pack-entry .pack-row-controls').first();assert.deepEqual(await controls.locator('button').evaluateAll(nodes=>nodes.map(e=>e.hasAttribute('data-pack-remove')?'delete':e.hasAttribute('data-pack-move')?e.dataset.direction==='-1'?'up':'down':e.hasAttribute('data-pack-visibility')?'eye':'star')),['delete','up','down','eye','star']);
  assert(await controls.evaluate(e=>{const r=e.getBoundingClientRect(),buttons=[...e.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return Math.abs(buttons[0].left-r.left)<=1&&Math.abs(buttons.at(-1).right-r.right)<=1&&buttons.every(b=>Math.abs(b.width-b.height)<1&&Math.abs(b.top-buttons[0].top)<1);}), 'pack actions aligned left and right on '+width);
  const favorite=controls.locator('[data-pack-favorite]'),eye=controls.locator('[data-pack-visibility]');
  assert.equal(await favorite.getAttribute('aria-pressed'),'false');assert.equal(await favorite.evaluate(e=>getComputedStyle(e.querySelector('svg')).fill),'none');
  await a.mouse.move(0,0);const neutral=await eye.evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(await controls.locator('[data-direction="1"]').evaluate(e=>getComputedStyle(e).backgroundColor),neutral,'arrows use normal button background');
  await favorite.click();assert.equal(await favorite.getAttribute('aria-pressed'),'true');assert.notEqual(await favorite.evaluate(e=>getComputedStyle(e.querySelector('svg')).fill),'none');assert.notEqual(await favorite.evaluate(e=>getComputedStyle(e).backgroundColor),neutral);await favorite.click();
  await eye.click();assert.equal(await eye.locator('[data-ui-icon=eye-off]').count(),1);assert.notEqual(await eye.evaluate(e=>getComputedStyle(e).backgroundColor),neutral);await eye.click();assert.equal(await eye.locator('[data-ui-icon=eye]').count(),1);
  await a.screenshot({path:path.join(out,'cloud-quota-'+width+'.png')});}

  await b.evaluate(async()=>{PlayroomAppBridge.showSessions();await PlayroomCloudSavesUI.refresh();});await b.locator('[data-cloud-fetch]').click();await b.locator('[data-confirm-accept]').click();await b.waitForFunction(()=>PlayroomAppBridge.saveLibrary.records().length===1);
  const bKey=await b.evaluate(()=>Object.keys(PlayroomCloudSavesUI.service.bindings).find(k=>k.startsWith('local:')));assert(bKey);
  await a.evaluate(async()=>{const l=PlayroomAppBridge.saveLibrary,s=l.open('cloud-fixture');s.act(s.current.turn,TabletopCore.legalActions(s.current,s.current.turn)[0]);await l.writeAsync(s,'cloud-fixture');PlayroomCloudSavesUI.service.dirty('local:cloud-fixture');});
  offline[0]=true;await a.context().setOffline(true);await a.evaluate(()=>PlayroomCloudSavesUI.scan());assert.equal(await a.evaluate(()=>PlayroomCloudSavesUI.service.state('local:cloud-fixture')),'pending');assert.equal(puts,1);offline[0]=false;await a.context().setOffline(false);await a.evaluate(()=>PlayroomCloudSavesUI.scan());await a.waitForFunction(()=>PlayroomCloudSavesUI.service.state('local:cloud-fixture')==='synced');assert.equal(puts,2);
  const conflict=await b.evaluate(async key=>{const l=PlayroomAppBridge.saveLibrary,s=l.open(key.slice(6));s.act(s.current.turn,TabletopCore.legalActions(s.current,s.current.turn).at(-1));await l.writeAsync(s,key.slice(6));PlayroomCloudSavesUI.service.dirty(key);try{await PlayroomCloudSavesUI.service.sync(key);return null;}catch(e){return e.code;}},bKey);assert.equal(conflict,'conflict');
  await b.locator(`[data-cloud-save="${bKey}"]`).click();await b.setViewportSize({width:320,height:740});assert(await b.locator('.cloud-save-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await b.screenshot({path:path.join(out,'conflict-320.png')});
  const downloaded=await b.evaluate(key=>PlayroomCloudSavesUI.service.download(key,{force:true}),bKey);assert.notEqual(downloaded,bKey);assert.equal(await b.evaluate(()=>PlayroomAppBridge.saveLibrary.records().length),2);assert.equal(await b.evaluate(key=>PlayroomCloudSavesUI.service.automatic(key),bKey),false);
  await a.evaluate(()=>PlayroomCloudSavesUI.service.remove('local:cloud-fixture'));assert.equal(snapshot().used,0);assert.equal(await a.evaluate(()=>PlayroomAppBridge.saveLibrary.records().length),1);
  // Exercise the actual local-game save boundary, rather than calling auto ports.
  await a.evaluate(async()=>{PlayroomAppBridge.closeModal(true);PlayroomFirstTurnGuide.setEnabled('tictactoe',false);const s=new TabletopSession(TabletopCore,'tictactoe',{seed:17,mode:'pass',openHands:true,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'А'},{name:'Б'}]});for(let i=0;i<6;i++)s.act(s.current.turn,TabletopCore.legalActions(s.current,s.current.turn)[0]);await PlayroomAppBridge.saveLibrary.activateAsync(s,'cloud-finish');PlayroomAppBridge.showSessions();});
  await a.waitForFunction(()=>PlayroomCloudSavesUI.service.state('local:cloud-finish')==='synced');await a.locator('[data-resume-id="cloud-finish"]').click();await a.locator('.table-shell [data-action]').first().click();await a.waitForFunction(()=>PlayroomCloudSavesUI.service.remoteFor('local:cloud-finish')?.summary.finished===true);await a.evaluate(()=>PlayroomCloudSavesUI.service.remove('local:cloud-finish'));
  await a.evaluate(async()=>{PlayroomAppBridge.closeModal(true);const s=new TabletopSession(TabletopCore,'tictactoe',{seed:17,mode:'pass',openHands:true,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'А'},{name:'Б'}]});await PlayroomAppBridge.saveLibrary.activateAsync(s,'cloud-menu');PlayroomAppBridge.showSessions();});
  await a.waitForFunction(()=>PlayroomCloudSavesUI.service.state('local:cloud-menu')==='synced');await a.locator('[data-resume-id="cloud-menu"]').click();await a.locator('.table-shell [data-action]').first().click();await a.waitForFunction(()=>PlayroomAppBridge.saveLibrary.list().find(e=>e.id==='cloud-menu')?.move===1);assert.equal(await a.evaluate(()=>PlayroomCloudSavesUI.service.remoteFor('local:cloud-menu').summary.move),0,'moves do not upload while playing');await a.evaluate(()=>PlayroomAppBridge.showHub());await a.waitForFunction(()=>PlayroomCloudSavesUI.service.remoteFor('local:cloud-menu')?.summary.move===1);await a.evaluate(()=>PlayroomCloudSavesUI.service.remove('local:cloud-menu'));
  await a.reload();await a.waitForFunction(()=>globalThis.PlayroomCloudSavesUI?.service?.loaded);assert.equal(await a.evaluate(()=>PlayroomCloudSavesUI.service.automatic('local:cloud-fixture')),false);
  await a.evaluate(async()=>{await PlayroomCloudSavesUI.service.upload('local:cloud-menu',{force:true});PlayroomAppBridge.showSessions();});
  const localCount=await a.evaluate(()=>PlayroomAppBridge.saveLibrary.records().length);
  await a.locator('[data-clear-games]').click();await a.locator('[data-clear-cloud-games]').click();await a.locator('[data-confirm-cancel]').click();assert(snapshot().used>0);
  await a.locator('[data-clear-cloud-games]').click();await a.locator('[data-confirm-accept]').click();await a.waitForFunction(()=>PlayroomCloudSavesUI.service.used===0);
  assert.equal(await a.evaluate(()=>PlayroomAppBridge.saveLibrary.records().length),localCount);
  await a.evaluate(()=>PlayroomCloudSavesUI.scan());assert.equal(snapshot().used,0);
  await a.evaluate(()=>PlayroomCloudSavesUI.service.upload('local:cloud-menu',{force:true}));const used=snapshot().used;
  await a.locator('[data-clear-games]').click();await a.locator('[data-clear-games-confirm]').click();await a.locator('[data-confirm-accept]').click();await a.waitForFunction(()=>PlayroomAppBridge.saveLibrary.records().length===0);assert.equal(snapshot().used,used);
  await a.locator('[data-clear-games]').click();assert.equal(await a.locator('[data-clear-games-confirm]').isDisabled(),true);await a.locator('[data-clear-cloud-games]').click();await a.locator('[data-confirm-accept]').click();await a.waitForFunction(()=>PlayroomCloudSavesUI.service.used===0);
  assert.deepEqual(errors,[]);assert([...rows.values()].every(r=>r.deleted));
 }finally{await browser.close();await server.close();}
});

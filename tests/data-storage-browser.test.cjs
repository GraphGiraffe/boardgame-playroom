'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
test('compressed installed packs shrink durable bytes and retain exact bundles across reload',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));
  await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'compressed-packs',name:'Тест',createdAt:1,updatedAt:1})));
  await page.goto(process.env.PLAYROOM_TEST_ARTIFACT||server.url);await page.locator('.game-tile').first().waitFor();
  const initial=await page.evaluate(async()=>{
   await PlayroomPacksReady;const key='playroom.packs.v1',physical=PlayroomData.getItem(key),logical=PlayroomPacks.storage.get(),size=value=>new TextEncoder().encode(value).length;
   const exports=PlayroomPacks.list().map(p=>PlayroomPacks.exportPack(p.id,p.version));
   const disk=await new Promise((resolve,reject)=>{const r=PlayroomData.db.transaction('records').objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   if(disk!==physical)throw Error('Durable bytes differ');return {physicalBytes:size(physical),logicalBytes:size(logical),usage:await PlayroomData.usage(),encoding:JSON.parse(physical).encoding,exports};
  });
  assert.equal(initial.exports.length,15);assert.equal(initial.encoding,'gzip-base64-v1');assert(initial.physicalBytes<initial.logicalBytes*0.6);assert.equal(initial.usage.packs,initial.physicalBytes);
  const snapshot=await page.evaluate(async()=>{
   const bundle=JSON.parse(JSON.stringify(PlayroomInstalledPacks.find(p=>p.manifest.id==='tictactoe')));bundle.manifest.version='0.0.1';await PlayroomPacks.install(PlayroomPacks.prepare(bundle),{activate:false});
   localStorage.setItem('playroom.pack-preferences.v1','{"favorites":["uno"]}');return PlayroomPacks.storage.get();
  });
  await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.evaluate(()=>PlayroomPacks.storage.get()),snapshot);
  assert.deepEqual(await page.evaluate(()=>PlayroomPacks.list().filter(p=>p.version!=='0.0.1').map(p=>PlayroomPacks.exportPack(p.id,p.version))),initial.exports);
  assert.equal(await page.evaluate(()=>PlayroomPacks.list().some(p=>p.id==='tictactoe'&&p.version==='0.0.1')),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.pack-preferences.v1')),'{"favorites":["uno"]}');assert.deepEqual(errors,[]);
  if(process.env.PLAYROOM_STORAGE_REPORT)require('node:fs').writeFileSync(process.env.PLAYROOM_STORAGE_REPORT,JSON.stringify({physicalBytes:initial.physicalBytes,logicalBytes:initial.logicalBytes,savedBytes:initial.logicalBytes-initial.physicalBytes,usage:initial.usage,bundles:initial.exports.length,reloadExact:true,oldVersionRetained:true},null,2)+'\n');
  await context.close();
 }finally{await browser.close();await server.close();}
});
test('durable local payloads migrate, survive failures and report their sizes',{timeout:120000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'storage-test',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false}));});
  await page.goto(process.env.PLAYROOM_TEST_ARTIFACT||server.url);await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.evaluate(async()=>{
   const legacy=new Map([['playroom.session.v1','original bytes']]);const storage={get length(){return legacy.size;},key:i=>[...legacy.keys()][i],getItem:k=>legacy.get(k)??null,removeItem:k=>legacy.delete(k)};
   const broken={open(...args){const r=indexedDB.open(...args);r.addEventListener('success',()=>{const db=r.result,transaction=db.transaction.bind(db);db.transaction=(stores,mode,...args)=>{const tx=transaction(stores,mode,...args);if(mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};});return r;}};
   const failed=new PlayroomDataStorage({name:'migration-failure',legacy:storage,indexedDB:broken});let rejected=false;try{await failed.open();}catch(_){rejected=true;}finally{failed.db?.close();}
   if(!rejected||legacy.get('playroom.session.v1')!=='original bytes')return false;
   const retried=await new PlayroomDataStorage({name:'migration-failure',legacy:storage}).open();const ok=retried.getItem('playroom.session.v1')==='original bytes'&&!legacy.size;retried.db.close();return ok;
  }),true,'failed migration preserves legacy bytes and can be retried');
  const original=await page.evaluate(async()=>{
   const library=new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks);
   const session=new TabletopSession(TabletopCore,'uno',{seed:17,mode:'solo',players:[{name:'Тест'},{name:'Бот',bot:true}]});
   const raw=library.encode(session,'migration-test');localStorage.setItem('playroom.session.v1',raw);localStorage.setItem('playroom.paused.v1.archive',raw.replace('"libraryId":"migration-test"','"libraryId":"archive"'));
   localStorage.setItem('playroom.packs.v1',PlayroomData.getItem('playroom.packs.v1'));
   await PlayroomData.queue;PlayroomData.db.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('playroom.data.v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});return raw;
  });
  await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.deepEqual(await page.evaluate(()=>({raw:PlayroomData.getItem('playroom.session.v1'),old:localStorage.getItem('playroom.session.v1'),packs:PlayroomPacks.list().length,ids:new PlayroomLibrary(()=>PlayroomData,TabletopCore,TabletopSession,PlayroomPacks).list().map(r=>r.id).sort()})),{raw:original,old:null,packs:15,ids:['archive','migration-test']});
  assert.equal(await page.evaluate(async()=>{
   const library=new PlayroomLibrary(()=>PlayroomData,TabletopCore,TabletopSession,PlayroomPacks),before=PlayroomData.getItem('playroom.session.v1'),names=PlayroomPacks.list().map(p=>p.id+'@'+p.version).join();
   const transaction=PlayroomData.db.transaction.bind(PlayroomData.db);PlayroomData.db.transaction=(stores,mode,...args)=>{const tx=transaction(stores,mode,...args);if(mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
   let failures=0;try{await library.activateAsync(library.open('migration-test'),'next');}catch(_){failures++;}try{await PlayroomPacks.remove('uno');}catch(_){failures++;}
   PlayroomData.db.transaction=transaction;
   if(failures!==2||PlayroomData.getItem('playroom.session.v1')!==before||PlayroomData.getItem('playroom.paused.v1.migration-test')!==null||PlayroomPacks.list().map(p=>p.id+'@'+p.version).join()!==names)return false;
   await library.activateAsync(library.open('migration-test'),'next');return library.current().id==='next'&&library.records().some(r=>r.id==='migration-test');
  }),true);
  assert.equal(await page.evaluate(async()=>{await PlayroomData.put('playroom.paused.v1.capacity','x'.repeat(6*1024*1024));return (await PlayroomData.usage()).saves>6*1024*1024;}),true);
  await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.paused.v1.capacity').length),6*1024*1024);
  await page.evaluate(()=>PlayroomData.transact(()=>PlayroomData.removeItem('playroom.paused.v1.capacity')));
  await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command="packs"]').click();await page.locator('.packs-v021-list [data-installed-pack]').first().waitFor();
  assert(await page.evaluate(async()=>{const usage=await PlayroomData.usage();return usage.packs===new TextEncoder().encode(PlayroomData.getItem('playroom.packs.v1')).length;}));
  assert.match(await page.locator('.packs-v021-summary small').first().innerText(),/КБ|МБ/);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('.pack-manager-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);if(process.env.PLAYROOM_STORAGE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.PLAYROOM_STORAGE_SCREENSHOTS,`storage-${width}.png`)});}
  await page.locator('#modal-root [data-command="close-modal"]').first().click();
  await page.locator('[data-hub-page=games]').click();await page.locator('[data-start="tictactoe"]').first().click();
  await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command="lobby-start"]').click();await page.locator('.table-shell').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(PlayroomData.getItem('playroom.session.v1')).game),'tictactoe','UI start publishes the new game after its durable commit');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('storage operation ownership: cancelled durable deletes preserve packs, archives and a new foreground game',{timeout:70000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 const active=selector=>page.locator('#modal-root>[data-surface-state=active]').locator(selector);
 try{
  await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'storage-owner',name:'Тест',createdAt:1,updatedAt:1})));
  await page.goto(server.url);await page.locator('.game-tile').first().waitFor();
  assert.deepEqual(await page.evaluate(async()=>{
   const library=PlayroomAppBridge.saveLibrary,session=new TabletopSession(TabletopCore,'tictactoe',{seed:19,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]});
   await library.activateAsync(session,'guard-delete');const raw=PlayroomData.getItem('playroom.session.v1'),packRaw=PlayroomData.getItem('playroom.packs.v1'),names=PlayroomPacks.list().map(item=>item.id+'@'+item.version),catalog=PlayroomCatalog.uno;
   // Invalidate at the native get success, immediately before the real durable write.
   const transaction=PlayroomData.db.transaction.bind(PlayroomData.db);let valid=true,armed=false;
   PlayroomData.db.transaction=(stores,mode,...args)=>{const tx=transaction(stores,mode,...args);if(mode==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name),get=store.get.bind(store);store.get=key=>{const request=get(key);request.addEventListener('success',()=>{if(armed)valid=false;});return request;};return store;};}return tx;};
   const guard=()=>{if(!valid)throw Object.assign(Error('cancelled'),{code:'cancelled'});};let failures=0;
   try{
    armed=true;try{await library.removeAsync('guard-delete',{guard});}catch(error){if(error.code==='cancelled')failures++;}
    valid=true;try{await PlayroomPacks.remove('uno',undefined,{guard});}catch(error){if(error.code==='cancelled')failures++;}
   }finally{PlayroomData.db.transaction=transaction;}
   const local=raw===PlayroomData.getItem('playroom.session.v1'),packs=packRaw===PlayroomData.getItem('playroom.packs.v1')&&JSON.stringify(names)===JSON.stringify(PlayroomPacks.list().map(item=>item.id+'@'+item.version))&&catalog===PlayroomCatalog.uno&&!!TabletopCore.get('uno');
   // Cursor-phase failure must roll back the initial header delete in both archive stores.
   const host=new PlayroomNetworkSessionStore({name:'guard-host-delete'}),client=new PlayroomNetworkClientHistory({name:'guard-client-delete'});
   const authority=new SessionAuthority(session,{sessionId:'guard-match',authorityEpoch:'guard-epoch'});let hostSaved,clientSaved;
   try{
    await host.create({sessionId:'guard-match',room:{id:'guard-room',name:'Guard',game:{id:session.game,version:session.packVersion}},session});
    await client.save({roomId:'guard-room',participantId:'guard-player',snapshot:authority.connect(0).snapshot()});
    for(const [store,id]of [[host,'guard-match'],[client,PlayroomNetworkClientHistory.id('guard-room','guard-player','guard-match')]]){let checks=0;try{await store.remove(id,{guard:()=>{if(++checks===2)throw Object.assign(Error('cancelled'),{code:'cancelled'});}});}catch(error){if(error.code==='cancelled')failures++;}}
    hostSaved=(await host.list()).some(item=>item.sessionId==='guard-match');clientSaved=(await client.list()).some(item=>item.roomId==='guard-room');
   }finally{authority.dispose();host.close();client.close();}
   PlayroomAppBridge.showSessions();return {failures,local,packs,hostSaved,clientSaved};
  }),{failures:4,local:true,packs:true,hostSaved:true,clientSaved:true});
  const openClear=async()=>{const management=page.locator('.saved021-management');if(!await management.evaluate(node=>node.open))await management.locator(':scope>summary').click();await management.locator('[data-clear-games]').click();await active('[data-clear-games-confirm]').waitFor();};
  const holdArchiveList=()=>page.evaluate(()=>{window.originalNetworkLibrary=PlayroomNetworkLibrary;window.PlayroomNetworkLibrary={...originalNetworkLibrary,list:()=>window.bulkListJob=new Promise(resolve=>window.releaseArchiveList=()=>resolve([]))};});
  const releaseArchiveList=()=>page.evaluate(async()=>{window.PlayroomNetworkLibrary=originalNetworkLibrary;releaseArchiveList();await bulkListJob;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await openClear();await holdArchiveList();await active('[data-clear-games-confirm]').click();await page.waitForFunction(()=>!!window.releaseArchiveList);await active('.modal-head [data-command=close-modal]').click();await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=settings]').click();await active('[data-settings-screen]').evaluate(node=>window.bulkOtherSettings=node);await releaseArchiveList();assert(await page.evaluate(()=>bulkOtherSettings===document.querySelector('[data-settings-screen]')&&PlayroomAppBridge.saveLibrary.records().some(row=>row.id==='guard-delete')));assert.equal(await active('[data-confirm-accept]').count(),0,'late archive scan cannot open a confirmation over settings');await active('.modal-head [data-command=close-modal]').click();await page.locator('[data-hub-page=sessions]').click();
  await openClear();await holdArchiveList();await page.evaluate(()=>window.releaseArchiveList=null);await active('[data-clear-games-confirm]').click();await page.waitForFunction(()=>!!window.releaseArchiveList);await page.evaluate(async()=>{const library=PlayroomAppBridge.saveLibrary;await library.activateAsync(library.open('guard-delete'),'bulk-late');});await releaseArchiveList();await active('[data-confirm-accept]').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.records().length===1);assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.records().map(row=>row.id)),['bulk-late'],'bulk delete uses pre-scan fixed targets and preserves a save created while scanning');await page.evaluate(async()=>{const library=PlayroomAppBridge.saveLibrary;await library.activateAsync(library.open('bulk-late'),'guard-delete');PlayroomAppBridge.showSessions();});
  const record=page.locator('[data-session-id=guard-delete]');await record.click();await active('[data-delete-id]').click();
  await page.evaluate(async()=>{await PlayroomData.queue;PlayroomData.queue=new Promise(resolve=>window.releaseDelete=resolve);window.beforeDelete=PlayroomData.getItem('playroom.session.v1');});
  await active('[data-delete-confirm]').click();await page.waitForFunction(()=>PlayroomData.pending>0);await active('.modal-head [data-command=close-modal]').click();
  await page.locator('[data-hub-page=games]').click();await page.locator('[data-start=tictactoe]').first().click();await active('[data-game-mode=hotseat]').click();await active('[data-command=lobby-start]').click();
  // Starting a game waits behind the cancelled operation in the same durable queue.
  await page.evaluate(()=>releaseDelete());await page.locator('.table-shell:not(.network-game)').waitFor();
  assert(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.records().some(row=>row.id==='guard-delete')),'retired confirmation cannot delete its old target');
  await page.evaluate(()=>{window.foregroundTable=document.querySelector('.table-shell');window.foregroundRaw=PlayroomData.getItem('playroom.session.v1');});
  await page.evaluate(()=>PlayroomData.queue);assert(await page.evaluate(()=>foregroundTable===document.querySelector('.table-shell')&&foregroundRaw===PlayroomData.getItem('playroom.session.v1')),'late completion preserves exact new table and save');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('upgrade notice 0.21 keeps archives and uses the shared owned surface',{timeout:45000},async()=>{
 const engine=process.env.LAB_ENGINE||'chromium',server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=engine==='webkit'?await require('playwright-core').webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 const fs=require('node:fs'),out=path.resolve(__dirname,'../../tmp_files/ux-021/upgrade-notice-021');fs.mkdirSync(out,{recursive:true});const errors=[],downloads=[],report=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'upgrade-person',name:'Игрок'})));const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.locator('[data-hub-page=profile]').click();await page.locator('[data-profile-account]').click();await page.locator('#modal-root>[data-surface-state=active] [data-command=profile-edit]').click();
  await page.locator('#local-profile-editor [name=nickname]').fill('Незавершённое имя');
  await page.evaluate(async()=>{window.upgradeParent=document.querySelector('#modal-root>[data-surface-state=active]');window.upgradeInput=document.querySelector('#local-profile-editor [name=nickname]');upgradeInput.focus();upgradeInput.setSelectionRange(2,7);window.upgradePayload=JSON.stringify({packs:[{manifest:{id:'legacy-fixture',engineApi:3},body:'original archive bytes'}]});await PlayroomPacks.storage.commit(upgradePayload);window.upgradePhysical=PlayroomData.getItem('playroom.packs.v1');localStorage.removeItem('playroom.accepted-engine-api');localStorage.setItem('playroom.upgrade-secret-fixture',JSON.stringify({safe:'preserve',access_token:'secret-token',password:'secret-password'}));window.assertUpgradeOpened=PlayroomUpgradeUI.show();});
  assert(await page.evaluate(()=>assertUpgradeOpened));assert.equal(await page.locator('dialog.appearance-dialog').count(),0);const gate=page.locator('#modal-root>[data-surface-state=active] .upgrade-notice-modal');await gate.waitFor();await page.keyboard.press('Escape');assert.equal(await gate.count(),1,'archive acknowledgement is explicit');
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});await gate.evaluate(el=>Promise.all(el.closest('[data-surface-id]').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));const box=await gate.boundingBox();assert(box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);assert(await gate.locator('[data-upgrade-export]').isVisible());assert(await gate.locator('[data-upgrade-accept]').isVisible());if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(out,engine+'-notice-'+width+'.png'),animations:'disabled'});const buttons=await gate.locator('.modal-foot button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));assert.equal(buttons.length,2);assert(buttons.every(h=>h>=44)&&Math.max(...buttons)-Math.min(...buttons)<1,JSON.stringify(buttons));report.push({width,state:'owned-gate',buttons});}
  const download=page.waitForEvent('download');await gate.locator('[data-upgrade-export]').click();const file=await download,payload=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(payload.format,'playroom-before-upgrade');assert.equal(payload.entries['playroom.packs.v1'],await page.evaluate(()=>upgradePayload));assert.deepEqual(JSON.parse(payload.entries['playroom.upgrade-secret-fixture']),{safe:'preserve'});assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.packs.v1')===upgradePhysical),true);report.push('real export preserves archive bytes and redacts credentials');
  await page.evaluate(()=>{window.upgradeDatabases=indexedDB.databases?.bind(indexedDB);Object.defineProperty(indexedDB,'databases',{configurable:true,value:()=>Promise.reject(Error('Не удалось прочитать архив'))});});await gate.locator('[data-upgrade-export]').click();await gate.locator('[data-upgrade-error]').filter({hasText:'Не удалось прочитать архив'}).waitFor();assert(await gate.locator('[data-upgrade-export]').isEnabled());assert(await gate.locator('[data-upgrade-accept]').isEnabled());report.push('archive read failure stays recoverable in its own gate');
  await page.evaluate(()=>Object.defineProperty(indexedDB,'databases',{configurable:true,value:upgradeDatabases||(()=>Promise.resolve([]))}));await gate.locator('[data-upgrade-accept]').click();await gate.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.accepted-engine-api')),'4');assert(await page.evaluate(()=>document.querySelector('#modal-root>[data-surface-state=active]')===upgradeParent&&document.querySelector('#local-profile-editor [name=nickname]')===upgradeInput&&document.activeElement===upgradeInput&&upgradeInput.selectionStart===2&&upgradeInput.selectionEnd===7));assert.equal(await page.locator('#local-profile-editor [name=nickname]').inputValue(),'Незавершённое имя');assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.packs.v1')===upgradePhysical),true);report.push('acknowledgement restores the exact previous draft without deletion');
  await page.evaluate(()=>{localStorage.removeItem('playroom.accepted-engine-api');PlayroomUpgradeUI.show();window.upgradeDownloads=0;window.upgradeURL=URL.createObjectURL;URL.createObjectURL=(...args)=>{upgradeDownloads++;return upgradeURL(...args);};Object.defineProperty(indexedDB,'databases',{configurable:true,value:()=>new Promise(resolve=>window.releaseUpgradeRead=resolve)});});await page.locator('[data-upgrade-export]').click();await page.waitForFunction(()=>!!window.releaseUpgradeRead);await page.evaluate(()=>{PlayroomAppBridge.closeModal(true);PlayroomAppBridge.showSettings();window.upgradeReplacement=document.querySelector('#modal-root>[data-surface-state=active]');releaseUpgradeRead([]);});await page.waitForFunction(()=>document.querySelector('[data-settings-screen]'));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>upgradeDownloads),0,'retired export cannot initiate a download');assert(await page.evaluate(()=>document.querySelector('#modal-root>[data-surface-state=active]')===upgradeReplacement));assert.equal(downloads.length,1);assert.deepEqual(errors,[]);report.push('retired export does not download or overwrite a replacement screen');
 }finally{fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify({report,errors,downloads:downloads.length},null,2));await browser.close();await server.close();}
});

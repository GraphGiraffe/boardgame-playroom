'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const url=process.env.PLAYROOM_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;

test('first launch requires a player name and persists it',{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});
  const page=await context.newPage();
  try{
    await page.goto(url);
    await page.locator('#profile-form').waitFor();
    assert.equal(await page.locator('.game-grid').count(),1,'Hub may render behind the required modal');
    await page.locator('#profile-form input[name=playerName]').fill('Иван');
    await page.locator('#profile-form').evaluate(form=>form.requestSubmit());
    await page.locator('#profile-form').waitFor({state:'detached'});
    const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')));
    assert.equal(profile.name,'Иван');assert.equal(profile.version,1);assert.ok(profile.id);
    await page.reload();
    assert.equal(await page.locator('#profile-form').count(),0,'Saved profile must suppress the first-run prompt');
  }finally{await context.close();await browser.close();}
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const url=process.env.PLAYROOM_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;

test('deleting the final old-pack save clears the stale recovery warning',{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}});
  const page=await context.newPage();
  try{
    await page.goto(url);
    await page.evaluate(()=>{
      localStorage.setItem('playroom.session.v1',JSON.stringify({
        game:'uno',packVersion:'0.1.0',createdAt:1712345678,updatedAt:1712345678
      }));
    });
    await page.reload();
    await page.locator('.recovery-note').waitFor();
    assert.match(await page.locator('.recovery-note').innerText(),/Не удалось восстановить/);
    await page.locator('.side-nav [data-command=sessions]').click();
    await page.locator('[data-delete-id]').first().click();
    await page.locator('[data-delete-confirm]').click();
    assert.equal(await page.locator('[data-delete-id]').count(),0);
    await page.locator('.side-nav [data-command=home]').click();
    assert.equal(await page.locator('.recovery-note').count(),0,'No stale warning after removing the broken save');
    assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.session.v1')),null);
    // Also filter startup pack-version conflicts when there are no dependent games.
    await page.evaluate(()=>{
      PlayroomPacks.warnings.push('Встроенный пакет uno@0.1.0 отличается от сохранённой версии. Для совместимости партий используется сохранённая версия.');
      globalThis.PlayroomPackLoadError=PlayroomPacks.warnings.join(' ');
    });
    await page.locator('.pack-hub-button').click();
    assert.equal(await page.locator('.pack-message').count(),0);
  }finally{await context.close();await browser.close();}
});

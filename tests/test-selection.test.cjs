'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const run=(...args)=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;return spawnSync(process.execPath,['scripts/codex/test.cjs',...args],{cwd:root,encoding:'utf8',env});};
test('granular selectors list only their small registered cases',()=>{
 for(const [selector,file]of [['ui/rules','rule-settings-browser'],['ui/settings','settings-layout-browser'],['ui/settings-help','settings-help-browser']]){
  const result=run(selector,'--list');assert.equal(result.status,0,result.stderr);assert(result.stdout.includes(file));assert(!result.stdout.includes('rc2-presentation-browser'));assert(!result.stdout.includes('uno-social'));
 }
});
test('hierarchical screen selectors filter viewport titles without adding other cases',()=>{
 const result=run('screen:phone:landscape','--list');assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('rule-settings-browser'));assert(result.stdout.includes('settings-layout-browser'));assert(!result.stdout.includes('settings-help-browser'));assert(result.stdout.includes('title pattern: ^(?:screen:phone:landscape)'));
 assert.equal(run('screen:phone:unknown','--list').status,2);
});
test('literal name filter plans one file and rejects broad or missing selectors',()=>{
 const result=run('case/rc2-presentation-browser','--name','RC7 Ludo offers','--list');assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('title contains: RC7 Ludo offers'));
 for(const args of [[],['ui','--name','anything'],['case/interface-scale','--name'],['case/interface-scale','--name',''],['case/missing','--name','anything'],['case/interface-scale,case/appearance','--name','anything']])assert.notEqual(run(...args).status,0,args.join(' '));
});
test('name filter executes only a matching test and an unmatched name cannot pass',{timeout:30000},()=>{
 const result=run('case/interface-scale','--name','interface scale validates preferences');assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/PASS — 1\//);
 const missing=run('case/interface-scale','--name','there is no such scenario');assert.notEqual(missing.status,0);assert.match(missing.stdout,/FAIL — 0\//);
});

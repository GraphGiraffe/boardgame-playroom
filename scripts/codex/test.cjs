'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const blocks=require('../../tests/blocks.cjs'),root=path.resolve(__dirname,'../..');
const profile=process.argv[2]||'all',list=process.argv[3]==='--list';
const profiles=new Set(['all',...Object.keys(blocks),...Object.values(blocks).flatMap(b=>b.cases.flatMap(c=>c.profiles))]);
if(!profiles.has(profile)||process.argv.length>4||(process.argv[3]&&!list)){
  console.error('Usage: node scripts/codex/test.cjs ['+[...profiles].join('|')+'] [--list]');process.exit(2);
}
// Refuse omissions and duplicates, including when running an app-only profile.
const registered=Object.values(blocks).flatMap(b=>b.cases.map(c=>c.file));
const actual=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs'));
if(new Set(registered).size!==registered.length||registered.length!==actual.length||actual.some(f=>!registered.includes(f))){
  console.error('Every tests/*.test.cjs scenario must belong to exactly one block in tests/blocks.cjs.');process.exit(2);
}
const selected=Object.entries(blocks).map(([id,block])=>({id,...block,cases:block.cases.filter(c=>profile==='all'||profile===id||c.profiles.includes(profile))})).filter(b=>b.cases.length);
if(list){for(const b of selected)console.log(b.id+' — '+b.label+': '+b.cases.map(c=>c.file).join(', '));process.exit(0);}
const logDir=path.join(root,'dist','test-results');fs.mkdirSync(logDir,{recursive:true});
const totals={tests:0,pass:0,fail:0,cancelled:0,skipped:0};let failed=false;
for(const block of selected){
  const log=path.join(logDir,profile+'-'+block.id+'.log'),fd=fs.openSync(log,'w');
  console.log('\n['+block.id+'] '+block.label+' — '+block.cases.length+' файлов');
  let result;try{
    // Node retains process isolation for each file and serial browser execution.
    result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...block.cases.map(c=>'tests/'+c.file)],{cwd:root,stdio:['ignore',fd,fd],env:process.env});
  }finally{fs.closeSync(fd);}
  const output=fs.readFileSync(log,'utf8'),counts={};
  for(const key of Object.keys(totals)){const match=output.match(new RegExp('^# '+key+' (\\d+)$','m'));counts[key]=match?Number(match[1]):0;totals[key]+=counts[key];}
  const ok=result.status===0&&!result.error&&counts.tests>0;
  console.log((ok?'PASS':'FAIL')+' — '+counts.pass+'/'+counts.tests+', skipped '+counts.skipped+'; '+path.relative(root,log));
  if(!ok){failed=true;console.error(result.error||result.signal||'');process.stderr.write(output);}
}
console.log('\n'+selected.length+' блоков; '+totals.tests+' проверок; pass '+totals.pass+', fail '+totals.fail+', cancelled '+totals.cancelled+', skipped '+totals.skipped);
process.exitCode=failed?1:0;

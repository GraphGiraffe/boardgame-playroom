'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const blocks=require('../../tests/blocks.cjs'),root=path.resolve(__dirname,'../..');
const args=process.argv.slice(2),list=args.includes('--list');if(list)args.splice(args.indexOf('--list'),1);
const changed=args[0]==='--changed',base=changed?(args[1]||'origin/dev'):null;
const profile=changed?'changed':args[0]||'all';
const profiles=new Set(['all',...Object.keys(blocks),...Object.values(blocks).flatMap(b=>b.cases.flatMap(c=>[c.subblock,...c.profiles,'case/'+c.file.replace(/\.test\.cjs$/,'')]))]);
const requested=profile.split(',');
if((changed?args.length>2:args.length>1)||(!changed&&requested.some(p=>!profiles.has(p)))){
  console.error('Usage: node scripts/codex/test.cjs [block/subblock[,other]|profile|--changed [base]] [--list]');process.exit(2);
}
// Refuse omissions and duplicates, including when running an app-only profile.
const registered=Object.values(blocks).flatMap(b=>b.cases.map(c=>c.file));
const actual=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs'));
if(new Set(registered).size!==registered.length||registered.length!==actual.length||actual.some(f=>!registered.includes(f))){
  console.error('Every tests/*.test.cjs scenario must belong to exactly one block in tests/blocks.cjs.');process.exit(2);
}
const includes=(c,id,selectors)=>selectors.some(p=>p==='all'||p===id||p===c.subblock||p==='case/'+c.file.replace(/\.test\.cjs$/,'')||c.profiles.includes(p));
const chosen=new Set();
if(changed){
  const paths=[...new Set((execFileSync('git',['diff','--name-only',base,'--'],{cwd:root,encoding:'utf8'})+'\n'+execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'})).trim().split('\n').filter(Boolean))];
  const rules=require('../../tests/affected.cjs');let selectors=[];
  for(const file of paths){
    const scenario=file.startsWith('tests/')?registered.find(name=>file==='tests/'+name):null;
    if(scenario){chosen.add(scenario);continue;}
    if(file.endsWith('.md')||file.startsWith('docs/'))continue;
    const matching=rules.filter(r=>r.paths.some(p=>p.endsWith('/')?file.startsWith(p):file===p));
    selectors.push(...(matching.length?matching.flatMap(r=>r.select):['all']));
  }
  for(const [id,block] of Object.entries(blocks))for(const c of block.cases)if(includes(c,id,selectors))chosen.add(c.file);
  console.log('Changed paths: '+paths.length+'; selected scenarios: '+chosen.size);
}else{
  for(const [id,block] of Object.entries(blocks))for(const c of block.cases)if(includes(c,id,requested))chosen.add(c.file);
}
const selected=Object.entries(blocks).map(([id,block])=>({id,...block,cases:block.cases.filter(c=>chosen.has(c.file))})).filter(b=>b.cases.length);
if(!selected.length){console.log('No test scenarios selected: documentation-only or no changes.');process.exit(0);}
if(list){for(const b of selected)console.log(b.id+' — '+b.label+': '+b.cases.map(c=>c.file).join(', '));process.exit(0);}
const logDir=path.join(root,'dist','test-results');fs.mkdirSync(logDir,{recursive:true});
const totals={tests:0,pass:0,fail:0,cancelled:0,skipped:0};let failed=false;
for(const block of selected){
  const log=path.join(logDir,profile.replace(/[^a-z0-9-]/gi,'-')+'-'+block.id+'.log'),fd=fs.openSync(log,'w');
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

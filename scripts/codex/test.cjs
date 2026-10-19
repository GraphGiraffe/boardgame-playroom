'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const blocks=require('../../tests/blocks.cjs'),root=path.resolve(__dirname,'../..');
const args=process.argv.slice(2),list=args.includes('--list');if(list)args.splice(args.indexOf('--list'),1);
const nameIndex=args.indexOf('--name');let testName=null;
if(nameIndex!==-1){testName=args[nameIndex+1];if(!testName?.trim()||testName.startsWith('--')){console.error('--name requires literal test title text');process.exit(2);}args.splice(nameIndex,2);}
if(!args.length){console.error('Select an explicit block, type or case; use --list to inspect it.');process.exit(2);}
const changed=args[0]==='--changed',base=changed?(args[1]||'origin/dev'):null,profile=changed?'changed':args[0]||'all',requested=profile.split(',');
const types=new Set(Object.values(blocks).flatMap(b=>b.cases.flatMap(c=>(c.types||[]).flatMap(type=>type.split(':').map((_,i,a)=>a.slice(0,i+1).join(':'))))));
const profiles=new Set(['all',...types,...Object.keys(blocks),...Object.values(blocks).flatMap(b=>b.cases.flatMap(c=>[c.subblock,...c.profiles,'case/'+c.file.replace(/\.test\.cjs$/,'')]))]);
if(testName&&(changed||requested.length!==1||!requested[0].startsWith('case/'))){console.error('--name requires exactly one case/file selector');process.exit(2);}
if((changed?args.length>2:args.length>1)||(!changed&&requested.some(p=>!profiles.has(p)))){
 console.error('Usage: node scripts/codex/test.cjs [block/subblock|type:subtype|case/file[,other]|--changed [base]] [--name "literal title text"] [--list]');process.exit(2);
}
const registered=Object.values(blocks).flatMap(b=>b.cases.map(c=>c.file)),actual=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs'));
if(new Set(registered).size!==registered.length||registered.length!==actual.length||actual.some(f=>!registered.includes(f))){console.error('Every tests/*.test.cjs scenario must belong to exactly one block in tests/blocks.cjs.');process.exit(2);}
const typeMatches=(c,type)=>(c.types||[]).some(t=>t===type||t.startsWith(type+':'));
const includes=(c,id,p)=>p==='all'||p===id||p===c.subblock||p==='case/'+c.file.replace(/\.test\.cjs$/,'')||c.profiles.includes(p)||types.has(p)&&typeMatches(c,p);
const chosen=new Set();
if(changed){
 const paths=[...new Set((execFileSync('git',['diff','--name-only',base,'--'],{cwd:root,encoding:'utf8'})+'\n'+execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'})).trim().split('\n').filter(Boolean))],rules=require('../../tests/affected.cjs');let selectors=[];
 for(const file of paths){const scenario=file.startsWith('tests/')?registered.find(name=>file==='tests/'+name):null;if(scenario){chosen.add(scenario);continue;}if(file.endsWith('.md')||file.startsWith('docs/'))continue;const matching=rules.filter(r=>r.paths.some(p=>p.endsWith('/')?file.startsWith(p):file===p));selectors.push(...(matching.length?matching.flatMap(r=>r.select):['all']));}
 for(const [id,block] of Object.entries(blocks))for(const c of block.cases)if(selectors.some(p=>includes(c,id,p)))chosen.add(c.file);
 console.log('Changed paths: '+paths.length+'; selected scenarios: '+chosen.size);
}else for(const [id,block] of Object.entries(blocks))for(const c of block.cases)if(requested.some(p=>includes(c,id,p)))chosen.add(c.file);
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),jobs=[];
for(const [id,block] of Object.entries(blocks)){
 const groups=new Map();
 for(const c of block.cases.filter(c=>chosen.has(c.file))){
  const matches=requested.filter(p=>includes(c,id,p));
  const pattern=testName?escape(testName):changed||matches.some(p=>!types.has(p))?'':'^(?:'+matches.map(escape).join('|')+')(?::|\\s)';
  if(!groups.has(pattern))groups.set(pattern,[]);groups.get(pattern).push(c);
 }
 for(const [pattern,cases]of groups)jobs.push({id,label:block.label,pattern,cases});
}
if(!jobs.length){console.log('No test scenarios selected: documentation-only or no changes.');process.exit(0);}
if(list){for(const j of jobs)console.log(j.id+' — '+j.label+': '+j.cases.map(c=>c.file).join(', ')+(testName?' — title contains: '+testName:j.pattern?' — title pattern: '+j.pattern:''));process.exit(0);}
const logDir=path.join(root,'dist','test-results');fs.mkdirSync(logDir,{recursive:true});const totals={tests:0,pass:0,fail:0,cancelled:0,skipped:0};let failed=false;
for(const [index,job]of jobs.entries()){
 const log=path.join(logDir,(profile+(testName?'-'+testName:'')).replace(/[^a-z0-9-]/gi,'-').slice(0,180)+'-'+job.id+(jobs.filter(j=>j.id===job.id).length>1?'-'+index:'')+'.log'),fd=fs.openSync(log,'w');
 console.log('\n['+job.id+'] '+job.label+' — '+job.cases.length+' файлов'+(job.pattern?' (фильтр заголовков)':''));
 let result;try{result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...(job.pattern?['--test-name-pattern='+job.pattern]:[]),...job.cases.map(c=>'tests/'+c.file)],{cwd:root,stdio:['ignore',fd,fd],env:process.env});}finally{fs.closeSync(fd);}
 const output=fs.readFileSync(log,'utf8'),counts={};
 // Node 22 reports an empty filtered file as one passing file. Require a real test title.
 const ran=output.split('\n').some(line=>line.startsWith('# Subtest: ')&&!job.cases.some(c=>line==='# Subtest: tests/'+c.file));
 for(const key of Object.keys(totals)){const match=output.match(new RegExp('^# '+key+' (\\d+)$','m'));counts[key]=ran&&match?Number(match[1]):0;totals[key]+=counts[key];}
 const ok=result.status===0&&!result.error&&counts.pass>0&&ran;
 console.log((ok?'PASS':'FAIL')+' — '+counts.pass+'/'+counts.tests+', skipped '+counts.skipped+'; '+path.relative(root,log));
 if(!ok){failed=true;console.error(result.error||result.signal||(!ran?'No matching tests executed.':''));process.stderr.write(output);}
}
console.log('\n'+new Set(jobs.map(j=>j.id)).size+' блоков; '+totals.tests+' проверок; pass '+totals.pass+', fail '+totals.fail+', cancelled '+totals.cancelled+', skipped '+totals.skipped);process.exitCode=failed?1:0;

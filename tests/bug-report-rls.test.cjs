'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),zlib=require('node:zlib'),crypto=require('node:crypto');
test('support reports: private atomic RPC, quotas, retry identity, payload limits and retention',{timeout:30000},()=>{
 const bin=process.env.PLAYROOM_PG_BIN||'/usr/lib/postgresql/18/bin',dir=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-report-pg-')),data=path.join(dir,'data');let started=false;
 const exec=(program,args)=>{const r=spawnSync(path.join(bin,program),args,{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error(program+': '+(r.stderr||r.error));return r.stdout;};
 const sql=(query,ok=true)=>{const r=spawnSync(path.join(bin,'psql'),['-h',dir,'-U',os.userInfo().username,'-d','postgres','-X','-tA','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',timeout:10000});if(ok&&r.status!==0)throw Error(r.stderr);if(!ok)assert.notEqual(r.status,0);return r.stdout.trim();};
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 const as=(id,anonymous,q)=>`set role authenticated;set request.jwt.claims='${JSON.stringify({sub:id,is_anonymous:anonymous})}';${q}`;
 const image=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(20)]).toString('base64');
 const valid=()=>({id:crypto.randomUUID(),description:'При смене темы пропали точки здоровья',context:{appVersion:'0.21.0-preview.104'},log:zlib.gzipSync('{}').toString('base64'),screenshots:[{mime:'image/webp',width:390,height:844,data:image}]});
 const submit=(who,payload,ok=true,guest=false)=>sql(as(who,guest,`select public.playroom_bug_report('submit','${JSON.stringify(payload).replaceAll("'","''")}'::jsonb);`),ok);
 try{
  exec('initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8']);exec('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h '' -k ${dir}`,'-w','start']);started=true;
  sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}');`);
  const migration=fs.readFileSync(path.join(__dirname,'../server/bug-reports.sql'),'utf8');sql(migration);sql(migration);
  const first=valid();assert(JSON.parse(submit(a,first).split('\n').at(-1)).accepted);submit(a,first);assert.equal(sql('select count(*) from public.playroom_bug_reports;'),'1');
  submit(b,first,false);submit(a,valid(),false,true);sql("set role anon;select public.playroom_bug_report('submit','{}');",false);
  for(const table of ['playroom_bug_reports','playroom_bug_screenshots'])for(const query of [`select * from public.${table}`,`delete from public.${table}`])sql(as(a,false,query),false);
  const bad=valid();bad.screenshots.push({...bad.screenshots[0],width:1281});submit(a,bad,false);assert.equal(sql('select count(*) from public.playroom_bug_reports;'),'1');assert.equal(sql('select count(*) from public.playroom_bug_screenshots;'),'1');
  const many=valid();many.screenshots=Array(4).fill(many.screenshots[0]);submit(a,many,false);
  const huge=valid();huge.log=Buffer.alloc(131073,1).toString('base64');submit(a,huge,false);
  const empty=valid();empty.description=' ';submit(a,empty,false);
  for(let i=0;i<4;i++)submit(a,valid());submit(a,valid(),false);submit(a,first);
  sql(`update public.playroom_bug_reports set created_at=now()-interval '31 days' where id='${first.id}';`);submit(b,valid());assert.equal(sql(`select count(*) from public.playroom_bug_screenshots where report_id='${first.id}';`),'0');
  sql(`delete from auth.users where id='${a}';`);assert.equal(sql('select count(*) from public.playroom_bug_reports;'),'1');assert.equal(sql('select count(*) from public.playroom_bug_screenshots;'),'1');
 }finally{if(started)try{exec('pg_ctl',['-D',data,'-m','immediate','stop']);}catch(_){}fs.rmSync(dir,{recursive:true,force:true});}
});

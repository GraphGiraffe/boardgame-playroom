'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('cloud profiles: PostgreSQL migration is repeatable and RLS separates accounts and guests',{timeout:30000},()=>{
 const bin=process.env.PLAYROOM_PG_BIN||'/usr/lib/postgresql/18/bin';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-account-pg-')),data=path.join(dir,'data');let started=false;
 const exec=(program,args)=>{const r=spawnSync(path.join(bin,program),args,{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error(program+': '+(r.stderr||r.error||r.stdout));return r.stdout;};
 const sql=(query,ok=true)=>{const r=spawnSync(path.join(bin,'psql'),['-h',dir,'-U',os.userInfo().username,'-d','postgres','-X','-tA','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',timeout:10000});if(ok&&r.status!==0)throw Error(r.stderr);if(!ok)assert.notEqual(r.status,0);return r.stdout.trim();};
 const as=(id,anonymous,query)=>`set role authenticated; set request.jwt.claims='${JSON.stringify({sub:id,is_anonymous:anonymous})}'; ${query}`;
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',g='00000000-0000-4000-8000-000000000003';
 try{
  exec('initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8']);
  exec('pg_ctl',['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-h '' -k ${dir}`,'-w','start']);started=true;
  sql(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}'),('${g}');`);
  const migration=fs.readFileSync(path.join(__dirname,'../server/supabase.sql'),'utf8');sql(migration);sql(migration);
  sql(as(a,false,`insert into public.playroom_profiles(id,nickname) values('${a}','Алиса');`));
  sql(as(b,false,`insert into public.playroom_profiles(id,nickname) values('${b}','Борис');`));
  assert(sql(as(a,false,'select count(*) from public.playroom_profiles;')).endsWith('1'));
  assert(sql(as(a,false,`select count(*) from public.playroom_profiles where id='${b}';`)).endsWith('0'));
  sql(as(a,false,`insert into public.playroom_profiles(id,nickname) values('${g}','Чужой');`),false);
  sql(as(g,true,`insert into public.playroom_profiles(id,nickname) values('${g}','Гость');`),false);
  assert(sql(as(g,true,'select count(*) from public.playroom_profiles;')).endsWith('0'));
  sql(as(a,false,`update public.playroom_profiles set nickname='Новое имя' where id='${a}';`));
  sql(as(a,false,`update public.playroom_profiles set id='${g}' where id='${a}';`),false);
  sql(as(a,false,'delete from public.playroom_profiles;'),false);
  sql('set role anon;select * from public.playroom_profiles;',false);
 }finally{if(started)exec('pg_ctl',['-D',data,'-m','fast','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
});

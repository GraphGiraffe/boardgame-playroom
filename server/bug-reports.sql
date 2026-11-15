-- Private, bounded reports. One transaction owns metadata, log and screenshots.
begin;
create table if not exists public.playroom_bug_reports (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 status text not null default 'new' check (status in ('new','reviewed','resolved')),
 description text not null check (char_length(description) between 10 and 3000),
 context jsonb not null check (jsonb_typeof(context)='object' and octet_length(context::text)<=16384),
 log_gzip bytea check (octet_length(log_gzip)<=131072),
 byte_size integer not null check (byte_size between 1 and 614400)
);
create index if not exists playroom_bug_reports_user_created on public.playroom_bug_reports(user_id,created_at desc);
create index if not exists playroom_bug_reports_created on public.playroom_bug_reports(created_at);
create table if not exists public.playroom_bug_screenshots (
 report_id uuid not null references public.playroom_bug_reports(id) on delete cascade,
 ordinal smallint not null check (ordinal between 1 and 3),
 mime text not null check (mime in ('image/webp','image/jpeg')),
 width integer not null check (width between 1 and 1280),
 height integer not null check (height between 1 and 1280),
 image bytea not null check (octet_length(image) between 12 and 147456),
 primary key (report_id,ordinal)
);
alter table public.playroom_bug_reports enable row level security;
alter table public.playroom_bug_screenshots enable row level security;
revoke all on public.playroom_bug_reports,public.playroom_bug_screenshots from public,anon,authenticated;
-- No public read policies: only the owner/admin can inspect reports.
grant select,update,delete on public.playroom_bug_reports to service_role;
grant select on public.playroom_bug_screenshots to service_role;
create or replace function public.playroom_bug_report(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); rid uuid; attachment jsonb; image_data bytea; trace bytea;
 total integer; position integer:=0; prior uuid;
begin
 if who is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 if p_action<>'submit' or octet_length(p_data::text)>850000 or jsonb_typeof(p_data) is distinct from 'object'
  or coalesce(p_data->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_data->'description') is distinct from 'string' or char_length(trim(p_data->>'description')) not between 10 and 3000
  or jsonb_typeof(p_data->'context') is distinct from 'object' or octet_length((p_data->'context')::text)>16384
  or jsonb_typeof(p_data->'screenshots') is distinct from 'array' or jsonb_array_length(p_data->'screenshots')>3
 then raise exception 'social:invalid'; end if;
 rid:=(p_data->>'id')::uuid;
 -- Serializes quota/idempotency only for the small, infrequent report endpoint.
 perform pg_catalog.pg_advisory_xact_lock(7419021);
 select r.user_id into prior from public.playroom_bug_reports r where r.id=rid;
 if found then
  if prior<>who then raise exception 'social:forbidden'; end if;
  return jsonb_build_object('id',rid,'accepted',true);
 end if;
 delete from public.playroom_bug_reports where created_at<now()-interval '30 days';
 if (select count(*) from public.playroom_bug_reports where user_id=who and created_at>now()-interval '24 hours')>=5 then raise exception 'social:rate-limit'; end if;
 if (select count(*) from public.playroom_bug_reports where created_at>now()-interval '24 hours')>=100 then raise exception 'social:quota'; end if;
 if coalesce(p_data->>'log','')<>'' then
  if char_length(p_data->>'log')>174764 then raise exception 'social:invalid'; end if;
  begin trace:=decode(p_data->>'log','base64');exception when others then raise exception 'social:invalid';end;
  if octet_length(trace) not between 18 and 131072 or substring(trace from 1 for 3)<>decode('1f8b08','hex') then raise exception 'social:invalid'; end if;
 end if;
 total:=octet_length(convert_to((p_data->'context')::text||(p_data->>'description'),'UTF8'))+coalesce(octet_length(trace),0);
 insert into public.playroom_bug_reports(id,user_id,description,context,log_gzip,byte_size)
 values(rid,who,trim(p_data->>'description'),p_data->'context',trace,greatest(total,1));
 for attachment in select value from jsonb_array_elements(p_data->'screenshots') loop
  position:=position+1;
  if attachment->>'mime' not in ('image/webp','image/jpeg') or jsonb_typeof(attachment->'data') is distinct from 'string'
   or char_length(attachment->>'data')>196608 or coalesce(attachment->>'width','') !~ '^[0-9]{1,4}$' or coalesce(attachment->>'height','') !~ '^[0-9]{1,4}$'
  then raise exception 'social:invalid'; end if;
  begin image_data:=decode(attachment->>'data','base64');exception when others then raise exception 'social:invalid';end;
  if (attachment->>'mime'='image/webp' and (substring(image_data from 1 for 4)<>convert_to('RIFF','UTF8') or substring(image_data from 9 for 4)<>convert_to('WEBP','UTF8')))
   or (attachment->>'mime'='image/jpeg' and substring(image_data from 1 for 3)<>decode('ffd8ff','hex')) then raise exception 'social:invalid'; end if;
  insert into public.playroom_bug_screenshots(report_id,ordinal,mime,width,height,image)
  values(rid,position,attachment->>'mime',(attachment->>'width')::integer,(attachment->>'height')::integer,image_data);
  total:=total+octet_length(image_data);
 end loop;
 if total>614400 or (select coalesce(sum(byte_size),0) from public.playroom_bug_reports where id<>rid)+total>104857600 then raise exception 'social:quota'; end if;
 update public.playroom_bug_reports set byte_size=total where id=rid;
 return jsonb_build_object('id',rid,'accepted',true);
end;
$$;
revoke all on function public.playroom_bug_report(text,jsonb) from public,anon,authenticated;
grant execute on function public.playroom_bug_report(text,jsonb) to authenticated;
-- Daily retention without object-storage orphans. Submission also removes expired rows.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('playroom-bug-report-retention','17 3 * * *',$job$delete from public.playroom_bug_reports where created_at<now()-interval '30 days'$job$);
 end if;
end$$;
notify pgrst,'reload schema';
commit;

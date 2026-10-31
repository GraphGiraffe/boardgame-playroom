-- Private compact saves. Account quota is serialized by the settings row lock.
begin;
create table if not exists public.playroom_cloud_save_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false
);
create table if not exists public.playroom_cloud_saves (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 revision bigint not null check(revision>0),
 checksum text,
 file text,
 summary jsonb not null default '{}'::jsonb,
 enabled boolean default null,
 updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 primary key(user_id,id),
 check(file is null or octet_length(file)<=10485760),
 check(jsonb_typeof(summary)='object' and octet_length(summary::text)<=8192),
 check((deleted and file is null) or (not deleted and file is not null and checksum ~ '^sha256:[a-f0-9]{64}$'))
);
alter table public.playroom_cloud_saves alter column enabled drop not null;
alter table public.playroom_cloud_saves alter column enabled drop default;
alter table public.playroom_cloud_save_settings enable row level security;
alter table public.playroom_cloud_saves enable row level security;
revoke all on public.playroom_cloud_save_settings,public.playroom_cloud_saves from public,anon,authenticated;
-- File writes go through the quota-checked API; never grant direct file DML.
grant select on public.playroom_cloud_saves to authenticated;
drop policy if exists cloud_save_owner on public.playroom_cloud_saves;
create policy cloud_save_owner on public.playroom_cloud_saves for all to authenticated
 using(user_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false))
 with check(user_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists cloud_save_settings_owner on public.playroom_cloud_save_settings;
create policy cloud_save_settings_owner on public.playroom_cloud_save_settings for all to authenticated
 using(user_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false))
 with check(user_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
-- A private definer is needed for quota-guarded writes while public DML stays revoked.
create schema if not exists playroom_private;
revoke all on schema playroom_private from public,anon,authenticated;
grant usage on schema playroom_private to authenticated;
create or replace function playroom_private.cloud_saves(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); sid uuid; wanted bigint; current_row public.playroom_cloud_saves;
 used bigint; bytes bigint; cap constant bigint:=10485760; result jsonb;
begin
 if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.users where id=u) then raise exception 'social:account-required'; end if;
 if p_action not in ('list','get','settings','put','delete','enable') then raise exception 'social:invalid'; end if;
 insert into public.playroom_cloud_save_settings(user_id) values(u) on conflict do nothing;
 -- Every file mutation for this account holds the same lock, including new IDs.
 perform 1 from public.playroom_cloud_save_settings where user_id=u for update;
 if p_action='settings' and p_data ? 'enabled' then
  if jsonb_typeof(p_data->'enabled')<>'boolean' then raise exception 'social:invalid'; end if;
  update public.playroom_cloud_save_settings set enabled=(p_data->>'enabled')::boolean where user_id=u;
 end if;
 if p_action in ('get','put','delete','enable') then
  begin sid:=(p_data->>'id')::uuid;wanted:=(p_data->>'revision')::bigint; exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'social:invalid'; end;
  if sid is null then raise exception 'social:invalid'; end if;
  select * into current_row from public.playroom_cloud_saves where user_id=u and id=sid;
  if p_action='get' then
   if current_row.id is null or current_row.deleted then raise exception 'social:not-found'; end if;
   return to_jsonb(current_row)-'user_id';
  end if;
  if wanted is null or wanted<>coalesce(current_row.revision,0) then raise exception 'social:conflict'; end if;
  if p_action='put' then
   if jsonb_typeof(p_data->'file') is distinct from 'string' or jsonb_typeof(p_data->'summary') is distinct from 'object' or octet_length((p_data->'summary')::text)>8192 or coalesce(p_data->>'checksum','') !~ '^sha256:[a-f0-9]{64}$' then raise exception 'social:invalid'; end if;
   bytes:=octet_length(p_data->>'file');
   select coalesce(sum(octet_length(file)),0) into used from public.playroom_cloud_saves where user_id=u and id<>sid;
   if bytes>cap or used+bytes>cap then raise exception 'social:quota'; end if;
   insert into public.playroom_cloud_saves(user_id,id,revision,checksum,file,summary,enabled)
   values(u,sid,wanted+1,p_data->>'checksum',p_data->>'file',p_data->'summary',(p_data->>'enabled')::boolean)
   on conflict(user_id,id) do update set revision=excluded.revision,checksum=excluded.checksum,file=excluded.file,summary=excluded.summary,enabled=excluded.enabled,deleted=false,updated_at=now();
  elsif p_action='delete' then
   if current_row.id is null then raise exception 'social:not-found'; end if;
   update public.playroom_cloud_saves set revision=revision+1,file=null,checksum=null,enabled=false,deleted=true,updated_at=now() where user_id=u and id=sid;
  else
   if current_row.id is null or current_row.deleted or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'social:not-found'; end if;
   update public.playroom_cloud_saves set revision=revision+1,enabled=(p_data->>'enabled')::boolean,updated_at=now() where user_id=u and id=sid;
  end if;
 end if;
 select coalesce(sum(octet_length(file)),0) into used from public.playroom_cloud_saves where user_id=u;
 -- Project metadata explicitly: do not materialize every file just to remove it.
 select jsonb_build_object('enabled',s.enabled,'used',used,'limit',cap,'entries',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'checksum',c.checksum,'summary',c.summary,'enabled',c.enabled,'updated_at',c.updated_at,'deleted',c.deleted,'bytes',coalesce(octet_length(c.file),0))) from public.playroom_cloud_saves c where c.user_id=u),'[]'::jsonb)) into result from public.playroom_cloud_save_settings s where s.user_id=u;
 return result;
end;
$$;
revoke all on function playroom_private.cloud_saves(text,jsonb) from public,anon,authenticated;
grant execute on function playroom_private.cloud_saves(text,jsonb) to authenticated;
create or replace function public.playroom_cloud_saves_rpc(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select playroom_private.cloud_saves(p_action,p_data);$$;
revoke all on function public.playroom_cloud_saves_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.playroom_cloud_saves_rpc(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

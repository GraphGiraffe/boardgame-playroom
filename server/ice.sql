-- Temporary, bounded connection diagnostics and room-scoped relay authorization.
begin;
create table if not exists public.playroom_connection_config(singleton boolean primary key default true check(singleton),diagnostics_enabled boolean not null default false);
insert into public.playroom_connection_config(singleton,diagnostics_enabled) values(true,true) on conflict do nothing;
alter table public.playroom_connection_config enable row level security;
revoke all on public.playroom_connection_config from public,anon,authenticated;
create table if not exists public.playroom_connection_traces(
 attempt_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 room_id uuid,mode text not null check(mode in ('network','online')),role text not null check(role in ('host','client','transfer')),
 result text not null check(result in ('connected','failed','cancelled')),device jsonb not null,events jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists playroom_connection_trace_time on public.playroom_connection_traces(created_at);
create index if not exists playroom_connection_trace_user on public.playroom_connection_traces(user_id,created_at desc);
alter table public.playroom_connection_traces enable row level security;
revoke all on public.playroom_connection_traces from public,anon,authenticated;
create or replace function public.playroom_ice_access(p_room_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'diagnosticsEnabled',coalesce((select diagnostics_enabled from public.playroom_connection_config where singleton),false))
 from public.playroom_cloud_rooms r where r.id=p_room_id and not r.closed and auth.uid() is not null
 and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (r.owner_id=auth.uid() or r.host_until>now() and exists(select 1 from public.playroom_room_members m where m.room_id=r.id and m.user_id=auth.uid()));
$$;
revoke all on function public.playroom_ice_access(uuid) from public,anon;
grant execute on function public.playroom_ice_access(uuid) to authenticated;
create or replace function public.playroom_connection_trace(p_room_id uuid,p_attempt_id uuid,p_mode text,p_role text,p_result text,p_device jsonb,p_events jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();clean jsonb;item jsonb;stamp integer;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 if not exists(select 1 from public.playroom_connection_config where singleton and diagnostics_enabled) then return false; end if;
 if p_mode is null or p_role is null or p_result is null or p_mode not in ('network','online') or p_role not in ('host','client','transfer') or p_result not in ('connected','failed','cancelled') or p_attempt_id is null then raise exception 'social:invalid'; end if;
 if p_mode='online' and not exists(select 1 from public.playroom_cloud_rooms r where r.id=p_room_id and (r.owner_id=me or exists(select 1 from public.playroom_room_members m where m.room_id=r.id and m.user_id=me))) then raise exception 'social:forbidden'; end if;
 if p_mode='network' and (p_room_id is not null or not exists(select 1 from public.playroom_profiles where id=me)) then raise exception 'social:forbidden'; end if;
 if p_events is null or p_device is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>48 or octet_length(p_events::text)>16384 or jsonb_typeof(p_device)<>'object' then raise exception 'social:invalid'; end if;
 delete from public.playroom_connection_traces where created_at<now()-interval '48 hours';
 if exists(select 1 from public.playroom_connection_traces where attempt_id=p_attempt_id) then return false; end if;
 if (select count(*) from public.playroom_connection_traces where user_id=me and created_at>now()-interval '1 minute')>=20 then return false; end if;
 clean:='[]'::jsonb;
 for item in select value from jsonb_array_elements(p_events) loop
  if item->>'stage' is null or item->>'stage' not in ('preparing','credentials','rendezvous','gathering','checking','admitting','connected','failed','cancelled') or coalesce(item->>'at','')!~'^[0-9]{1,6}$' then raise exception 'social:invalid'; end if;
  stamp:=(item->>'at')::integer;if stamp>180000 then raise exception 'social:invalid';end if;
  clean:=clean||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('stage',item->>'stage','at',stamp,
   'direct',case when item->>'direct' in ('searching','available','checking','selected','unused','unavailable') then item->>'direct' end,
   'stun',case when item->>'stun' in ('searching','available','checking','selected','unused','unavailable') then item->>'stun' end,
   'turn',case when item->>'turn' in ('searching','available','checking','selected','unused','unavailable') then item->>'turn' end,
   'method',case when item->>'method' in ('direct','stun','turn','unknown') then item->>'method' end,
   'protocol',case when item->>'protocol' in ('udp','tcp','tls') then item->>'protocol' end,
   'code',case when item->>'code' in ('turn-setup','turn-auth','turn-network','ice-failed','connection-timeout','transport-closed','transport-timeout','host-offline','forbidden','account-required','account-changed','room-active','not-found','network','cancelled','unknown') then item->>'code' end)));
 end loop;
 insert into public.playroom_connection_traces(attempt_id,user_id,room_id,mode,role,result,device,events)
 values(p_attempt_id,me,p_room_id,p_mode,p_role,p_result,jsonb_strip_nulls(jsonb_build_object(
 'os',case when p_device->>'os' in ('ios','android','desktop','other') then p_device->>'os' end,
 'browser',case when p_device->>'browser' in ('safari','chrome','chrome-ios','firefox','other') then p_device->>'browser' end,
 'major',case when coalesce(p_device->>'major','')~'^[0-9]{1,3}$' then (p_device->>'major')::integer end)),clean) on conflict do nothing;
 return found;
end;$$;
revoke all on function public.playroom_connection_trace(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.playroom_connection_trace(uuid,uuid,text,text,text,jsonb,jsonb) to authenticated;
-- Also prune during quiet periods when the project's scheduler is available.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('playroom-connection-trace-prune','15 * * * *','delete from public.playroom_connection_traces where created_at < now() - interval ''48 hours''');
 end if;
end$$;
notify pgrst,'reload schema';
commit;

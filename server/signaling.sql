-- Stage 3. Apply after supabase.sql and social.sql in the PlayRoom project.
-- Short-lived SDP only. Never store game state or private resume credentials here.
begin;
alter table public.playroom_cloud_rooms add column if not exists local_room_id text;
alter table public.playroom_cloud_rooms add column if not exists host_epoch uuid;
alter table public.playroom_cloud_rooms add column if not exists host_until timestamptz;
alter table public.playroom_cloud_rooms add column if not exists room_summary jsonb not null default '{}'::jsonb;
alter table public.playroom_cloud_rooms add column if not exists summary_updated_at timestamptz;
create table if not exists public.playroom_peer_bindings (
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 participant_id text not null default gen_random_uuid()::text,
 primary key(room_id,user_id), unique(room_id,participant_id)
);
create table if not exists public.playroom_signals (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 epoch uuid not null,
 offer text check(octet_length(offer)<=65536),
 answer text check(octet_length(answer)<=65536),
 expires_at timestamptz not null default now()+interval '2 minutes',
 unique(room_id,user_id)
);
-- An authenticated account may have several independent device participants.
-- Zero retains the identity of clients published before device-scoped signaling.
alter table public.playroom_peer_bindings add column if not exists device_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.playroom_signals add column if not exists device_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.playroom_peer_bindings drop constraint if exists playroom_peer_bindings_pkey;
alter table public.playroom_peer_bindings add primary key(room_id,user_id,device_id);
alter table public.playroom_signals drop constraint if exists playroom_signals_room_id_user_id_key;
create unique index if not exists playroom_signals_device on public.playroom_signals(room_id,user_id,device_id);
alter table public.playroom_peer_bindings enable row level security;
alter table public.playroom_signals enable row level security;
revoke all on public.playroom_peer_bindings,public.playroom_signals from public,anon,authenticated;
create or replace function public.playroom_signal(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 me uuid:=auth.uid(); rid uuid:=(p_data->>'roomId')::uuid;
 ep uuid:=(p_data->>'epoch')::uuid; sid uuid:=(p_data->>'id')::uuid;
 r public.playroom_cloud_rooms%rowtype; s public.playroom_signals%rowtype;
 summary jsonb; pid text; signal text; target_user uuid; device uuid:=coalesce((p_data->>'deviceId')::uuid,'00000000-0000-0000-0000-000000000000');
begin
 if me is null then raise exception 'social:account-required' using errcode='42501'; end if;
 if p_action in ('host','request') then perform public.playroom_require_online_slot(me,rid); end if;
 select * into r from public.playroom_cloud_rooms where id=rid for update;
 if not found or r.closed or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then raise exception 'social:not-found'; end if;
 -- Delete expired SDP on every use of this room, not only a scheduled cleanup job.
 delete from public.playroom_signals where room_id=rid and expires_at<=now();
 if p_action='host' then
  if me<>r.owner_id or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:forbidden'; end if;
  if ep is null or p_data->>'localRoomId' is null or char_length(p_data->>'localRoomId') not between 1 and 128 then raise exception 'social:invalid'; end if;
  if to_regclass('public.playroom_host_transfers') is not null then
   if exists(select 1 from public.playroom_host_transfers where room_id=rid and state='ready' and epoch is distinct from ep) then raise exception 'social:host-busy'; end if;
  end if;
  if r.host_until>now() and r.host_epoch<>ep then raise exception 'social:host-busy'; end if;
  if r.local_room_id is distinct from p_data->>'localRoomId' then delete from public.playroom_peer_bindings where room_id=rid; end if;
  if r.host_epoch is distinct from ep then delete from public.playroom_signals where room_id=rid; end if;
  update public.playroom_cloud_rooms set local_room_id=p_data->>'localRoomId',host_epoch=ep,host_until=now()+interval '20 seconds' where id=rid;
  return '{}'::jsonb;
 end if;
 if p_action='kick' then
  if me<>r.owner_id then raise exception 'social:forbidden'; end if;
  select user_id into target_user from public.playroom_peer_bindings where room_id=rid and participant_id=p_data->>'participantId';
  if target_user is null then raise exception 'social:not-found'; end if;
  delete from public.playroom_signals q using public.playroom_peer_bindings b where q.room_id=rid and b.room_id=rid and b.participant_id=p_data->>'participantId' and q.user_id=b.user_id and q.device_id=b.device_id;
  delete from public.playroom_peer_bindings where room_id=rid and participant_id=p_data->>'participantId';
  if target_user<>r.owner_id and not exists(select 1 from public.playroom_peer_bindings where room_id=rid and user_id=target_user) then
   delete from public.playroom_room_members where room_id=rid and user_id=target_user;
   update public.playroom_room_invites set revoked=true where room_id=rid and (used_by=target_user or target_id=target_user);
  end if;
  return '{}'::jsonb;
 end if;
 if p_action='leave' then
  delete from public.playroom_signals where room_id=rid and user_id=me and device_id=device;
  delete from public.playroom_peer_bindings where room_id=rid and user_id=me and device_id=device;
  if r.owner_id<>me and not exists(select 1 from public.playroom_peer_bindings where room_id=rid and user_id=me) then
   delete from public.playroom_room_members where room_id=rid and user_id=me;
  end if;
  return '{}'::jsonb;
 end if;
 if r.host_until is null or r.host_until<=now() then raise exception 'social:host-offline'; end if;
 if p_action='request' then
  if me=r.owner_id and device='00000000-0000-0000-0000-000000000000' then raise exception 'social:invalid'; end if;
  -- An upgrade may retain its own legacy participant; RTC resume still requires
  -- the private resume token. A second device without that local save gets a new seat.
  if p_data->>'resumeParticipantId' is not null and device<>'00000000-0000-0000-0000-000000000000'
   and not exists(select 1 from public.playroom_peer_bindings where room_id=rid and user_id=me and device_id=device) then
   update public.playroom_peer_bindings set device_id=device where room_id=rid and user_id=me
    and device_id='00000000-0000-0000-0000-000000000000' and participant_id=p_data->>'resumeParticipantId';
  end if;
  if not exists(select 1 from public.playroom_signals where room_id=rid and user_id=me and device_id=device)
   and (select count(*) from public.playroom_signals where room_id=rid)>=32 then raise exception 'social:limit'; end if;
  insert into public.playroom_signals(room_id,user_id,device_id,epoch) values(rid,me,device,r.host_epoch)
   on conflict(room_id,user_id,device_id) do update set id=gen_random_uuid(),epoch=excluded.epoch,offer=null,answer=null,expires_at=now()+interval '2 minutes' returning * into s;
  return jsonb_build_object('id',s.id,'epoch',s.epoch,'localRoomId',r.local_room_id);
 elsif p_action='poll-host' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  update public.playroom_cloud_rooms set host_until=now()+interval '20 seconds' where id=rid;
  if p_data ? 'summary' then
   summary:=p_data->'summary';
   if jsonb_typeof(summary)<>'object' or octet_length(summary::text)>16384 or jsonb_typeof(summary->'players') is distinct from 'array'
    or char_length(coalesce(summary->>'game','')) not between 1 and 80 or char_length(coalesce(summary->>'packVersion','')) not between 1 and 80
    or coalesce(summary->>'phase','') not in ('lobby','starting','playing','finished') then raise exception 'social:invalid'; end if;
   if jsonb_array_length(summary->'players')>32 or exists(select 1 from jsonb_array_elements(summary->'players') p where jsonb_typeof(p)<>'object'
    or char_length(coalesce(p->>'id','')) not between 1 and 128 or char_length(coalesce(p->>'nickname','')) not between 1 and 24
    or coalesce(p->>'role','') not in ('player','table') or coalesce(p->>'playerIndex','-1') !~ '^(-1|[0-9]|[12][0-9]|3[01])$'
    or (p->>'avatar' is not null and p->>'avatar' !~ '^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$')) then raise exception 'social:invalid'; end if;
   -- Rebuild a fixed public projection. Never persist scene, hands, commands,
   -- authority exports or private resume credentials supplied by a host.
   summary:=jsonb_build_object('game',summary->>'game','packVersion',summary->>'packVersion','phase',summary->>'phase',
    'revision',greatest(0,coalesce((summary->>'revision')::bigint,0)),'move',greatest(0,coalesce((summary->>'move')::bigint,0)),
    'turn',case when (summary->>'turn')::integer between 0 and 31 then (summary->>'turn')::integer end,
    'firstPlayer',case when (summary->>'firstPlayer')::integer between 0 and 31 then (summary->>'firstPlayer')::integer end,
    'preset',left(summary->>'preset',80),'turnNumber',greatest(0,coalesce((summary->>'turnNumber')::bigint,0)),
    'round',case when (summary#>>'{round,number}')::integer>0 then jsonb_build_object('number',(summary#>>'{round,number}')::integer,
      'kind',case when summary#>>'{round,kind}'='bout' then 'bout' else 'round' end,'limit',(summary#>>'{round,limit}')::integer) end,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','nickname',p->>'nickname','avatar',p->>'avatar',
      'role',p->>'role','bot',coalesce((p->>'bot')::boolean,false),'isHost',coalesce((p->>'isHost')::boolean,false),
      'connected',coalesce((p->>'connected')::boolean,false),'playerIndex',(p->>'playerIndex')::integer)),'[]'::jsonb) from jsonb_array_elements(summary->'players') p));
   update public.playroom_cloud_rooms set room_summary=summary,summary_updated_at=now() where id=rid and room_summary is distinct from summary;
  end if;

  if p_data ? 'known' then
   if jsonb_typeof(p_data->'known')<>'array' then raise exception 'social:invalid'; end if;
   if jsonb_array_length(p_data->'known')>32 then raise exception 'social:invalid'; end if;
  end if;
  -- The host-owned poll can bind new identities without a separate authorize RTT.
  insert into public.playroom_peer_bindings(room_id,user_id,device_id)
   select rid,q.user_id,q.device_id from public.playroom_signals q
    join public.playroom_room_members m on m.room_id=q.room_id and m.user_id=q.user_id
    where q.room_id=rid and q.epoch=ep and not exists(select 1 from public.playroom_peer_bindings b where b.room_id=rid and b.user_id=q.user_id and b.device_id=q.device_id)
   on conflict do nothing;
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'participantId',b.participant_id,
   'offer',case when q.id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb))) then null else q.offer end,
   'answer',case when q.id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb))) then null else q.answer end)
   order by q.expires_at,q.id) from public.playroom_signals q
   join public.playroom_room_members m on m.room_id=q.room_id and m.user_id=q.user_id
   join public.playroom_peer_bindings b on b.room_id=q.room_id and b.user_id=q.user_id and b.device_id=q.device_id
   where q.room_id=rid and q.epoch=ep),'[]'::jsonb);
 end if;
 if p_action='authorize' and p_data->>'userId' is not null then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  select b.participant_id into pid from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=rid and b.user_id=(p_data->>'userId')::uuid and (case when p_data ? 'participantId' then b.participant_id=p_data->>'participantId' else b.device_id='00000000-0000-0000-0000-000000000000' end);
  if pid is null then raise exception 'social:forbidden'; end if;
  -- Reuse the existing host validation: no extra heartbeat request.
  update public.playroom_room_members set active_until=now()+interval '2 minutes'
   where room_id=rid and user_id=(p_data->>'userId')::uuid
    and (active_until is null or active_until<now()+interval '1 minute');
  return jsonb_build_object('participantId',pid,'userId',p_data->>'userId');
 end if;
 select * into s from public.playroom_signals where id=sid and room_id=rid and epoch=r.host_epoch;
 if not found or (me<>r.owner_id and me<>s.user_id) then raise exception 'social:forbidden'; end if;
 if not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=s.user_id) then raise exception 'social:forbidden'; end if;
 if p_action='poll' then
  if me<>s.user_id or device<>s.device_id then raise exception 'social:forbidden'; end if;
  return jsonb_build_object('offer',s.offer,'epoch',s.epoch);
 elsif p_action='offer' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  signal:=p_data->>'signal';
  if signal is null or octet_length(signal)>65536 or (signal::jsonb)->>'type' is distinct from 'offer' or jsonb_typeof((signal::jsonb)->'sdp') is distinct from 'string' then raise exception 'social:invalid'; end if;
  if s.offer is not null and s.offer<>signal then raise exception 'social:invalid'; end if;
  update public.playroom_signals set offer=signal where id=sid;
 elsif p_action='answer' then
  if me<>s.user_id or device<>s.device_id or s.offer is null then raise exception 'social:forbidden'; end if;
  signal:=p_data->>'signal';
  if signal is null or octet_length(signal)>65536 or (signal::jsonb)->>'type' is distinct from 'answer' or jsonb_typeof((signal::jsonb)->'sdp') is distinct from 'string' then raise exception 'social:invalid'; end if;
  if s.answer is not null and s.answer<>signal then raise exception 'social:invalid'; end if;
  update public.playroom_signals set answer=signal where id=sid;
 elsif p_action='authorize' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  insert into public.playroom_peer_bindings(room_id,user_id,device_id) values(rid,s.user_id,s.device_id) on conflict do nothing;
  select participant_id into pid from public.playroom_peer_bindings where room_id=rid and user_id=s.user_id and device_id=s.device_id;
  return jsonb_build_object('userId',s.user_id,'participantId',pid);
 else raise exception 'social:invalid';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.playroom_signal(text,jsonb) from public,anon;
grant execute on function public.playroom_signal(text,jsonb) to authenticated;
commit;

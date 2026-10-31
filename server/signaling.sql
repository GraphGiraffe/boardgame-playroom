-- Stage 3. Apply after supabase.sql and social.sql in the PlayRoom project.
-- Short-lived SDP only. Never store game state or private resume credentials here.
begin;
alter table public.playroom_cloud_rooms add column if not exists local_room_id text;
alter table public.playroom_cloud_rooms add column if not exists host_epoch uuid;
alter table public.playroom_cloud_rooms add column if not exists host_until timestamptz;
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
alter table public.playroom_peer_bindings enable row level security;
alter table public.playroom_signals enable row level security;
revoke all on public.playroom_peer_bindings,public.playroom_signals from public,anon,authenticated;
create or replace function public.playroom_signal(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 me uuid:=auth.uid(); rid uuid:=(p_data->>'roomId')::uuid;
 ep uuid:=(p_data->>'epoch')::uuid; sid uuid:=(p_data->>'id')::uuid;
 r public.playroom_cloud_rooms%rowtype; s public.playroom_signals%rowtype;
 pid text; signal text;
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
 if r.host_until is null or r.host_until<=now() then raise exception 'social:host-offline'; end if;
 if p_action='request' then
  if me=r.owner_id then raise exception 'social:invalid'; end if;
  insert into public.playroom_signals(room_id,user_id,epoch) values(rid,me,r.host_epoch)
   on conflict(room_id,user_id) do update set id=gen_random_uuid(),epoch=excluded.epoch,offer=null,answer=null,expires_at=now()+interval '2 minutes' returning * into s;
  return jsonb_build_object('id',s.id,'epoch',s.epoch,'localRoomId',r.local_room_id);
 elsif p_action='poll-host' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  update public.playroom_cloud_rooms set host_until=now()+interval '20 seconds' where id=rid;
  if p_data ? 'known' then
   if jsonb_typeof(p_data->'known')<>'array' then raise exception 'social:invalid'; end if;
   if jsonb_array_length(p_data->'known')>32 then raise exception 'social:invalid'; end if;
  end if;
  -- The host-owned poll can bind new identities without a separate authorize RTT.
  insert into public.playroom_peer_bindings(room_id,user_id)
   select rid,q.user_id from public.playroom_signals q
    join public.playroom_room_members m on m.room_id=q.room_id and m.user_id=q.user_id
    where q.room_id=rid and q.epoch=ep and not exists(select 1 from public.playroom_peer_bindings b where b.room_id=rid and b.user_id=q.user_id)
   on conflict do nothing;
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'participantId',b.participant_id,
   'offer',case when q.id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb))) then null else q.offer end,
   'answer',case when q.id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb))) then null else q.answer end)
   order by q.expires_at,q.id) from public.playroom_signals q
   join public.playroom_room_members m on m.room_id=q.room_id and m.user_id=q.user_id
   join public.playroom_peer_bindings b on b.room_id=q.room_id and b.user_id=q.user_id
   where q.room_id=rid and q.epoch=ep),'[]'::jsonb);
 end if;
 if p_action='authorize' and p_data->>'userId' is not null then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  select b.participant_id into pid from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=rid and b.user_id=(p_data->>'userId')::uuid;
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
  if me<>s.user_id then raise exception 'social:forbidden'; end if;
  return jsonb_build_object('offer',s.offer,'epoch',s.epoch);
 elsif p_action='offer' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  signal:=p_data->>'signal';
  if signal is null or octet_length(signal)>65536 or (signal::jsonb)->>'type' is distinct from 'offer' or jsonb_typeof((signal::jsonb)->'sdp') is distinct from 'string' then raise exception 'social:invalid'; end if;
  if s.offer is not null and s.offer<>signal then raise exception 'social:invalid'; end if;
  update public.playroom_signals set offer=signal where id=sid;
 elsif p_action='answer' then
  if me<>s.user_id or s.offer is null then raise exception 'social:forbidden'; end if;
  signal:=p_data->>'signal';
  if signal is null or octet_length(signal)>65536 or (signal::jsonb)->>'type' is distinct from 'answer' or jsonb_typeof((signal::jsonb)->'sdp') is distinct from 'string' then raise exception 'social:invalid'; end if;
  if s.answer is not null and s.answer<>signal then raise exception 'social:invalid'; end if;
  update public.playroom_signals set answer=signal where id=sid;
 elsif p_action='authorize' then
  if me<>r.owner_id or ep is distinct from r.host_epoch then raise exception 'social:forbidden'; end if;
  insert into public.playroom_peer_bindings(room_id,user_id) values(rid,s.user_id) on conflict do nothing;
  select participant_id into pid from public.playroom_peer_bindings where room_id=rid and user_id=s.user_id;
  return jsonb_build_object('userId',s.user_id,'participantId',pid);
 else raise exception 'social:invalid';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.playroom_signal(text,jsonb) from public,anon;
grant execute on function public.playroom_signal(text,jsonb) to authenticated;
commit;

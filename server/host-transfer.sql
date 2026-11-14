-- Planned handoff only; apply after signaling.sql and online.sql.
begin;
create table if not exists public.playroom_host_transfers (
 id uuid primary key, room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 source uuid not null references auth.users(id) on delete cascade,target uuid not null references auth.users(id) on delete cascade,
 source_participant text not null,target_participant text not null,epoch uuid not null,
 state text not null check(state in ('offered','accepted','ready','committed','cancelled')),
 digest text,revision bigint,expires_at timestamptz not null default now()+interval '5 minutes',created_at timestamptz not null default now(),check(source<>target)
);
alter table public.playroom_host_transfers enable row level security;
revoke all on public.playroom_host_transfers from public,anon,authenticated;
create or replace function public.playroom_host_transfer(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid();rid uuid:=(p_data->>'roomId')::uuid;tid uuid:=(p_data->>'id')::uuid;r public.playroom_cloud_rooms%rowtype;t public.playroom_host_transfers%rowtype;target_user uuid;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 select * into r from public.playroom_cloud_rooms where id=rid for update;
 if not found or r.closed or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then raise exception 'social:forbidden'; end if;
 if p_action='check-peer' then
  if r.owner_id<>me or not exists(select 1 from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=rid and b.participant_id=p_data->>'participantId') then raise exception 'social:forbidden'; end if;
  return '{}'::jsonb;
 end if;
 if p_action='pending' then
  if me<>r.owner_id then raise exception 'social:forbidden'; end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state)) from public.playroom_host_transfers where room_id=rid and state in ('offered','accepted','ready')),'[]'::jsonb));
 end if;
 select * into t from public.playroom_host_transfers where id=tid;
 if p_action='offer' and not found then
  if r.owner_id<>me or r.host_until is null or r.host_until<=now() then raise exception 'social:forbidden'; end if;
  select b.user_id into target_user from public.playroom_peer_bindings b join public.playroom_profiles p on p.id=b.user_id join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=rid and b.participant_id=p_data->>'target';
  if target_user is null or target_user=me or coalesce(p_data->>'source','')='' or char_length(p_data->>'source')>128 then raise exception 'social:invalid'; end if;
  update public.playroom_host_transfers set state='cancelled' where room_id=rid and state in ('offered','accepted','ready') and (expires_at<=now() or epoch is distinct from r.host_epoch);
  if exists(select 1 from public.playroom_host_transfers where room_id=rid and state in ('offered','accepted','ready')) then raise exception 'social:host-busy'; end if;
  if exists(select 1 from public.playroom_peer_bindings where room_id=rid and participant_id=p_data->>'source' and user_id<>me) then raise exception 'social:forbidden'; end if;
  if not exists(select 1 from public.playroom_peer_bindings where room_id=rid and user_id=me and participant_id=p_data->>'source') then
   insert into public.playroom_peer_bindings(room_id,user_id,participant_id) values(rid,me,p_data->>'source') on conflict(room_id,user_id,device_id) do update set participant_id=excluded.participant_id;
  end if;
  insert into public.playroom_host_transfers(id,room_id,source,target,source_participant,target_participant,epoch,state) values(tid,rid,me,target_user,p_data->>'source',p_data->>'target',r.host_epoch,'offered') returning * into t;
 end if;
 if t.id is null or t.room_id<>rid or me not in (t.source,t.target) then raise exception 'social:forbidden'; end if;
 if p_action='status' then return jsonb_build_object('state',t.state,'digest',t.digest,'revision',t.revision,'owner',r.owner_id); end if;
 if p_action='cancel' and t.state='cancelled' then return jsonb_build_object('state',t.state); end if;
 if t.state='committed' then
  if p_action not in ('offer','accept','seal','ready','commit') then raise exception 'social:forbidden'; end if;
  return jsonb_build_object('state',t.state);
 end if;
 if t.expires_at<=now() or t.state='cancelled' or r.owner_id<>t.source or r.host_epoch is distinct from t.epoch then raise exception 'social:invite-invalid'; end if;
 if p_action='offer' then
  if me<>t.source or p_data->>'target'<>t.target_participant then raise exception 'social:forbidden'; end if;
 elsif p_action='accept' then
  if me<>t.target then raise exception 'social:forbidden'; end if;
  if t.state='offered' then update public.playroom_host_transfers set state='accepted' where id=tid; end if;
 elsif p_action='seal' then
  if me<>t.source or t.state not in ('accepted','ready') or coalesce(p_data->>'digest','') !~ '^sha256:[0-9a-f]{64}$' or (p_data->>'revision')::bigint<0 then raise exception 'social:forbidden'; end if;
  if t.digest is not null and (t.digest<>p_data->>'digest' or t.revision<>(p_data->>'revision')::bigint) then raise exception 'social:invalid'; end if;
  update public.playroom_host_transfers set digest=p_data->>'digest',revision=(p_data->>'revision')::bigint where id=tid;
 elsif p_action='ready' then
  if me<>t.target or t.state not in ('accepted','ready') or t.digest is null or t.digest is distinct from p_data->>'digest' or t.revision is distinct from (p_data->>'revision')::bigint then raise exception 'social:forbidden'; end if;
  update public.playroom_host_transfers set state='ready',expires_at='infinity'::timestamptz where id=tid;
 elsif p_action='cancel' then
  update public.playroom_host_transfers set state='cancelled' where id=tid;
 elsif p_action='commit' then
  if me<>t.source or t.state<>'ready' or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=t.target) then raise exception 'social:forbidden'; end if;
  update public.playroom_cloud_rooms set owner_id=t.target,host_epoch=null,host_until=null where id=rid;
  delete from public.playroom_signals where room_id=rid;
  update public.playroom_host_transfers set state='committed' where id=tid;
 else raise exception 'social:invalid'; end if;
 return jsonb_build_object('state',(select state from public.playroom_host_transfers where id=tid));
end;$$;
revoke all on function public.playroom_host_transfer(text,jsonb) from public,anon;
grant execute on function public.playroom_host_transfer(text,jsonb) to authenticated;
commit;

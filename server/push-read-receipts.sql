-- 0.21 room read receipts. Apply after existing push.sql. No message bodies.
begin;
-- Per-recipient metadata prevents delayed room Push after RTC read acknowledgements.
create table if not exists public.playroom_push_room_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 event_key text not null check(event_key ~ '^room:[0-9a-f-]{36}$'),
 created_at timestamptz not null default now(),primary key(user_id,room_id,event_key)
);
create index if not exists playroom_push_room_reads_expiry on public.playroom_push_room_reads(created_at);
alter table public.playroom_push_room_reads enable row level security;
revoke all on public.playroom_push_room_reads from public,anon,authenticated;
create or replace function public.playroom_push(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); sub jsonb:=p_data->'subscription'; ep text:=coalesce(sub->>'endpoint',p_data->>'endpoint'); key_text text; room public.playroom_cloud_rooms%rowtype; target_user uuid; author_user uuid; new_event_id uuid;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 if p_action='config' then
  return (select jsonb_build_object('publicKey',case when enabled then public_key else null end,'ready',enabled and public_key is not null,'capabilities',jsonb_build_object('roomRead',true)) from public.playroom_push_config where singleton);
 elsif p_action='remove' then
  delete from public.playroom_push_subscriptions where user_id=me and endpoint=ep;return '{}'::jsonb;
 elsif p_action='subscribe' then
  select public_key into key_text from public.playroom_push_config where singleton and enabled;
  if key_text is null then raise exception 'social:setup'; end if;
  if not coalesce(public.playroom_push_endpoint(ep),false) or coalesce(sub#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(sub#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'social:invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,7));
  if exists(select 1 from public.playroom_push_subscriptions where endpoint=ep and user_id<>me) then raise exception 'social:forbidden'; end if;
  if not exists(select 1 from public.playroom_push_subscriptions where endpoint=ep) and (select count(*) from public.playroom_push_subscriptions where user_id=me)>=8 then raise exception 'social:limit'; end if;
  insert into public.playroom_push_subscriptions(user_id,endpoint,p256dh,auth) values(me,ep,sub#>>'{keys,p256dh}',sub#>>'{keys,auth}')
   on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now();
  return '{}'::jsonb;
 elsif p_action='room-seen' then
  if jsonb_typeof(p_data->'events') is distinct from 'array' or jsonb_array_length(p_data->'events')>80 or exists(select 1 from jsonb_array_elements_text(p_data->'events') e where e !~ '^[0-9a-f]{8}-[0-9a-f-]{27}$') or not exists(select 1 from public.playroom_cloud_rooms r join public.playroom_room_members m on m.room_id=r.id and m.user_id=me where r.id=(p_data->>'roomId')::uuid and not r.closed) then raise exception 'social:forbidden';end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,14));
  if (select count(*) from public.playroom_push_room_reads where user_id=me and created_at>now()-interval '1 minute')>=600 then raise exception 'social:rate-limit';end if;
  delete from public.playroom_push_room_reads where created_at<now()-interval '2 hours';
  insert into public.playroom_push_room_reads(user_id,room_id,event_key) select me,(p_data->>'roomId')::uuid,'room:'||e from jsonb_array_elements_text(p_data->'events') e on conflict do nothing;
  delete from public.playroom_push_deliveries d using public.playroom_push_subscriptions sub where d.subscription_id=sub.id and sub.user_id=me and d.kind='room' and d.ref=p_data->>'roomId' and d.event_key in(select 'room:'||e from jsonb_array_elements_text(p_data->'events') e);
  return '{}'::jsonb;
 elsif p_action='game-state' then
  return public.playroom_push_game(p_data);
 elsif p_action='room-message' then
  select * into room from public.playroom_cloud_rooms where id=(p_data->>'roomId')::uuid and owner_id=me and not closed and host_until>now();
  if not found then raise exception 'social:forbidden'; end if;
  if coalesce(p_data->>'scope','') not in ('room','team') or jsonb_typeof(p_data->'targets')<>'array' or jsonb_array_length(p_data->'targets')>64 then raise exception 'social:invalid'; end if;
  new_event_id:=(p_data->>'eventId')::uuid;
  if new_event_id is null then raise exception 'social:invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(room.id::text,8));
  if exists(select 1 from public.playroom_push_room_events where room_id=room.id and event_id=new_event_id) then return '{}'::jsonb; end if;
  if (select count(*) from public.playroom_push_room_events where room_id=room.id and author=p_data->>'author' and created_at>now()-interval '1 minute')>=30 then raise exception 'social:rate-limit'; end if;
  select user_id into author_user from public.playroom_peer_bindings where room_id=room.id and participant_id=p_data->>'author';
  author_user:=coalesce(author_user,me);
  insert into public.playroom_push_room_events(room_id,event_id,author) values(room.id,new_event_id,p_data->>'author');
  for target_user in select distinct b.user_id from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=room.id and b.user_id<>author_user and (p_data->'targets') ? b.participant_id
   union select me where author_user<>me and coalesce((p_data->>'includeHost')::boolean,false)
  loop
   perform public.playroom_push_enqueue(target_user,'room:'||new_event_id,'room',room.id::text,'room',room.id,coalesce(room.game_name,room.name),case when p_data->>'scope'='team' then 'Новое сообщение в командном чате' else 'Новое сообщение в комнате «'||room.name||'»' end,now()+interval '1 hour');
   update public.playroom_push_deliveries set payload=payload||jsonb_build_object('scope',p_data->>'scope') where event_key='room:'||new_event_id and subscription_id in(select id from public.playroom_push_subscriptions where user_id=target_user);
  end loop;
  return '{}'::jsonb;
 elsif p_action='target' then
  -- Resolve navigation under the current user's rights, never from a push-supplied name or URL.
  if p_data->>'type'='group' then
   return (select jsonb_build_object('group',jsonb_build_object('id',g.id,'name',g.name)) from public.playroom_groups g join public.playroom_group_members m on m.group_id=g.id and m.user_id=me and m.left_at is null where g.id=(p_data->>'id')::uuid and g.closed_at is null);
  elsif p_data->>'type'='room' then
   return (select jsonb_build_object('room',jsonb_build_object('id',r.id)) from public.playroom_cloud_rooms r join public.playroom_room_members m on m.room_id=r.id and m.user_id=me where r.id=(p_data->>'id')::uuid and not r.closed);
  elsif p_data->>'type'='dm' then
   return (select jsonb_build_object('person',jsonb_build_object('userId',p.id,'nickname',p.nickname,'avatar',p.avatar,'username',p.username,'accepted',exists(select 1 from public.playroom_friendships f where f.accepted and (f.sender=me and f.recipient=p.id or f.recipient=me and f.sender=p.id)))) from public.playroom_profiles p where p.id=(p_data->>'id')::uuid and (exists(select 1 from public.playroom_friendships f where f.sender=me and f.recipient=p.id or f.sender=p.id and f.recipient=me) or exists(select 1 from public.playroom_messages m where m.sender=me and m.recipient=p.id or m.sender=p.id and m.recipient=me)));
  end if;
 end if;
 raise exception 'social:invalid';
end;$$;
revoke all on function public.playroom_push(text,jsonb) from public,anon;
grant execute on function public.playroom_push(text,jsonb) to authenticated;

create or replace function public.playroom_push_pending(d public.playroom_push_deliveries,who uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare allowed boolean;
begin
 if d.kind='host-transfer' then
  if to_regprocedure('public.playroom_push_host_pending(public.playroom_push_deliveries,uuid)') is null then return false;end if;
  execute 'select public.playroom_push_host_pending($1,$2)' into allowed using d,who;return d.expires_at>now() and coalesce(allowed,false);
 end if;
 return d.expires_at>now() and case d.kind
 when 'update' then exists(select 1 from public.playroom_push_updates u where u.id=d.ref::uuid and u.expires_at>now())
 when 'friend-request' then exists(select 1 from public.playroom_friendships f where f.id=d.ref::uuid and f.recipient=who and not f.accepted)
 when 'friend-accepted' then exists(select 1 from public.playroom_friendships f where f.id=d.ref::uuid and f.sender=who and f.accepted)
 when 'group-member' then exists(select 1 from public.playroom_groups g join public.playroom_group_members m on m.group_id=g.id where g.id=d.ref::uuid and g.closed_at is null and m.user_id=who and m.left_at is null)
 when 'invite-accepted' then exists(select 1 from public.playroom_room_invites i join public.playroom_cloud_rooms r on r.id=i.room_id where i.id=d.ref::uuid and i.used_by is not null and not r.closed and who in(r.owner_id,i.invited_by))
 when 'game' then exists(select 1 from public.playroom_push_games h join public.playroom_cloud_rooms r on r.id=h.room_id join public.playroom_room_members m on m.room_id=r.id where h.room_id=d.ref::uuid and not r.closed and m.user_id=who and h.session_id=d.payload->>'sessionId')
 when 'turn' then exists(select 1 from public.playroom_push_games h join public.playroom_cloud_rooms r on r.id=h.room_id join public.playroom_room_members m on m.room_id=r.id where h.room_id=d.ref::uuid and not r.closed and m.user_id=who and h.state='playing' and h.session_id=d.payload->>'sessionId' and h.turn_keys->>who::text=d.payload->>'turnKey')
 when 'dm' then exists(select 1 from public.playroom_messages m left join public.playroom_chat_reads r on r.reader=who and r.peer=m.sender where m.id=d.ref::bigint and m.recipient=who and m.id>coalesce(r.through_id,0))
 when 'group-invitation' then exists(select 1 from public.playroom_messages m join public.playroom_group_invites i on i.id=m.group_invitation_id join public.playroom_groups g on g.id=i.group_id where m.id=d.ref::bigint and i.target=who and i.accepted_at is null and i.declined_at is null and i.expires_at>now() and g.closed_at is null)
 when 'group' then exists(select 1 from public.playroom_group_messages m join public.playroom_group_members mem on mem.group_id=m.group_id and mem.user_id=who and mem.left_at is null join public.playroom_groups g on g.id=m.group_id where m.id=d.ref::bigint and m.id>mem.read_through and g.closed_at is null)
 when 'room' then exists(select 1 from public.playroom_cloud_rooms r join public.playroom_room_members m on m.room_id=r.id and m.user_id=who where r.id=d.ref::uuid and not r.closed) and not exists(select 1 from public.playroom_push_room_reads rr where rr.user_id=who and rr.room_id=d.ref::uuid and rr.event_key=d.event_key)
 when 'invitation' then public.playroom_invitation_state(d.ref::uuid,who) in ('active','offline') and exists(select 1 from public.playroom_room_invites i where i.id=d.ref::uuid and i.used_by is null)
 else false end;
end;$$;
commit;

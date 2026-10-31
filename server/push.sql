-- Apply after online.sql. No credentials here. Configure the public VAPID key separately.
begin;
create table if not exists public.playroom_push_config (
 singleton boolean primary key default true check(singleton), public_key text, enabled boolean not null default false
);
insert into public.playroom_push_config(singleton) values(true) on conflict do nothing;
create table if not exists public.playroom_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique, p256dh text not null, auth text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.playroom_push_deliveries (
 id bigint generated always as identity primary key,
 subscription_id uuid not null references public.playroom_push_subscriptions(id) on delete cascade,
 event_key text not null, kind text not null, ref text not null, payload jsonb not null,
 expires_at timestamptz not null, available_at timestamptz not null default now(),
 attempts integer not null default 0, lease uuid, unique(subscription_id,event_key)
);
create table if not exists public.playroom_push_room_events (
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 event_id uuid not null, author text not null, created_at timestamptz not null default now(),
 primary key(room_id,event_id)
);
alter table public.playroom_push_room_events enable row level security;
revoke all on public.playroom_push_room_events from public,anon,authenticated;
create index if not exists playroom_push_pending on public.playroom_push_deliveries(available_at,id);
alter table public.playroom_push_config enable row level security;
alter table public.playroom_push_subscriptions enable row level security;
alter table public.playroom_push_deliveries enable row level security;
revoke all on public.playroom_push_config,public.playroom_push_subscriptions,public.playroom_push_deliveries from public,anon,authenticated;

create or replace function public.playroom_push_endpoint(endpoint text) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select char_length(endpoint)<=2100 and endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#]+$';
$$;
-- Only public notification metadata is stored here, never projections or hands.
create table if not exists public.playroom_push_games (
 room_id uuid primary key references public.playroom_cloud_rooms(id) on delete cascade,
 session_id text not null, revision bigint not null, control_revision bigint not null,
 signature text not null, state text not null, targets jsonb not null, turn_keys jsonb not null default '{}'
);
alter table public.playroom_push_games enable row level security;
revoke all on public.playroom_push_games from public,anon,authenticated;
create or replace function public.playroom_push_game(p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); r public.playroom_cloud_rooms%rowtype; head public.playroom_push_games%rowtype;
 sid text:=p_data->>'sessionId'; rev bigint:=(p_data->>'revision')::bigint; cr bigint:=(p_data->>'controlRevision')::bigint;
 state text:=p_data->>'state'; signature text; recipients jsonb; players jsonb; turns jsonb:='{}'; target text; event text; lifecycle text;
begin
 select * into r from public.playroom_cloud_rooms where id=(p_data->>'roomId')::uuid and owner_id=me and not closed and host_until>now() for update;
 if not found then raise exception 'social:forbidden'; end if;
 if sid is null or char_length(sid) not between 1 and 128 or rev is null or rev<0 or cr is null or cr<0 or state is null or state not in ('playing','paused','finished') or jsonb_typeof(p_data->'players') is distinct from 'array' or jsonb_typeof(p_data->'targets') is distinct from 'array' then raise exception 'social:invalid'; end if;
 if jsonb_array_length(p_data->'players')>64 or not ((p_data->'players') @> (p_data->'targets')) then raise exception 'social:invalid'; end if;
 if not exists(select 1 from public.playroom_push_config where singleton and enabled) then return '{}'::jsonb; end if;
 select coalesce(jsonb_agg(id order by id),'[]') into players from (
  select distinct b.user_id::text id from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=r.id and (p_data->'players') ? b.participant_id
  union select me::text where (p_data->'players') ? (p_data->>'ownerParticipantId')
 ) users;
 select coalesce(jsonb_agg(id order by id),'[]') into recipients from (
  select distinct b.user_id::text id from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=r.id and (p_data->'targets') ? b.participant_id
  union select me::text where (p_data->'targets') ? (p_data->>'ownerParticipantId')
 ) users;
 if state<>'playing' then recipients:='[]'; end if;
 signature:=md5(jsonb_build_array(sid,rev,cr,state,recipients)::text);
 select * into head from public.playroom_push_games where room_id=r.id;
 if found and head.session_id=sid then
  if rev<head.revision or rev=head.revision and cr<head.control_revision or head.signature=signature then return '{}'::jsonb; end if;
  if head.state='paused' and state='playing' then lifecycle:='game-resumed';
  elsif head.state<>'finished' and state='finished' then lifecycle:='game-finished'; end if;
 else lifecycle:=case when state='finished' then 'game-finished' when coalesce((p_data->>'resumed')::boolean,false) then 'game-resumed' else 'game-started' end;
 end if;
 for target in select jsonb_array_elements_text(recipients) loop
  event:=case when head.session_id=sid and head.targets ? target then head.turn_keys->>target else null end;
  if event is null then
   event:='turn:'||r.id||':'||signature;
   perform public.playroom_push_enqueue(target::uuid,event,'turn',r.id::text,'room',r.id,coalesce(r.game_name,r.name),'Ваш ход · '||r.name,now()+interval '1 hour');
   update public.playroom_push_deliveries set payload=payload||jsonb_build_object('activity','turn','turnKey',event,'sessionId',sid) where event_key=event and subscription_id in(select id from public.playroom_push_subscriptions where user_id=target::uuid);
  end if;
  turns:=turns||jsonb_build_object(target,event);
 end loop;
 if lifecycle is not null then
  for target in select value from jsonb_array_elements_text(players) users(value) where not (recipients ? value) loop
   event:=lifecycle||':'||r.id||':'||signature;
   perform public.playroom_push_enqueue(target::uuid,event,'game',r.id::text,'room',r.id,coalesce(r.game_name,r.name),case lifecycle when 'game-started' then 'Партия началась' when 'game-resumed' then 'Партия продолжилась' else 'Партия завершена' end||' · '||r.name,now()+interval '1 hour');
   update public.playroom_push_deliveries set payload=payload||jsonb_build_object('activity',lifecycle,'sessionId',sid) where event_key=event;
  end loop;
 end if;
 insert into public.playroom_push_games(room_id,session_id,revision,control_revision,signature,state,targets,turn_keys) values(r.id,sid,rev,cr,signature,state,recipients,turns)
 on conflict(room_id) do update set session_id=excluded.session_id,revision=excluded.revision,control_revision=excluded.control_revision,signature=excluded.signature,state=excluded.state,targets=excluded.targets,turn_keys=excluded.turn_keys;
 return '{}'::jsonb;
end;$$;
revoke all on function public.playroom_push_game(jsonb) from public,anon,authenticated;

create or replace function public.playroom_push(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); sub jsonb:=p_data->'subscription'; ep text:=coalesce(sub->>'endpoint',p_data->>'endpoint'); key_text text; room public.playroom_cloud_rooms%rowtype; target_user uuid; author_user uuid; new_event_id uuid;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 if p_action='config' then
  return (select jsonb_build_object('publicKey',case when enabled then public_key else null end,'ready',enabled and public_key is not null) from public.playroom_push_config where singleton);
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

create or replace function public.playroom_push_enqueue(target uuid,event_key text,event_kind text,ref text,route_type text,route_id uuid,title text,body text,expires timestamptz) returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into public.playroom_push_deliveries(subscription_id,event_key,kind,ref,payload,expires_at)
 select s.id,event_key,event_kind,ref,jsonb_build_object('v',1,'event',event_key,'recipient',target,'type',route_type,'id',route_id,'title',left(title,80),'body',left(body,160),'expiresAt',expires),expires
 from public.playroom_push_subscriptions s where s.user_id=target on conflict do nothing;
$$;
create or replace function public.playroom_push_message() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare who text; gid uuid; target uuid; gi public.playroom_group_invites%rowtype; room public.playroom_cloud_rooms%rowtype; gm public.playroom_group_messages%rowtype;
begin
 if not exists(select 1 from public.playroom_push_config where singleton and enabled) then return new; end if;
 if tg_table_name='playroom_messages' then
  if new.kind='invitation' then return new; end if; -- Room trigger covers both direct and group invitations.
  select nickname into who from public.playroom_profiles where id=new.sender;
  if new.kind='group-invitation' then
   select * into gi from public.playroom_group_invites where id=new.group_invitation_id;
   perform public.playroom_push_enqueue(new.recipient,'dm:'||new.id,new.kind,new.id::text,'dm',new.sender,coalesce(who,'Игрок'),'Приглашение в группу «'||new.body||'»',gi.expires_at);
  else
   perform public.playroom_push_enqueue(new.recipient,'dm:'||new.id,'dm',new.id::text,'dm',new.sender,coalesce(who,'Игрок'),new.body,now()+interval '24 hours');
  end if;
 elsif tg_table_name='playroom_group_messages' then
  if new.kind='invitation' then return new; end if;
  select name into who from public.playroom_groups where id=new.group_id;
  for target in select user_id from public.playroom_group_members where group_id=new.group_id and left_at is null and user_id<>new.sender loop
   perform public.playroom_push_enqueue(target,'group:'||new.id,'group',new.id::text,'group',new.group_id,who,new.body,now()+interval '24 hours');
  end loop;
 else
  if new.target_id is null then return new; end if;
  select * into room from public.playroom_cloud_rooms where id=new.room_id;
  if new.group_message_id is null then
   target:=coalesce(new.invited_by,room.owner_id);
   if target=new.target_id then return new; end if;
   select nickname into who from public.playroom_profiles where id=target;
   perform public.playroom_push_enqueue(new.target_id,'invite:'||new.id,'invitation',new.id::text,'dm',target,coalesce(who,'Игрок'),'Приглашение в игру · '||coalesce(room.game_name,room.name),new.expires_at);
  else
   select * into gm from public.playroom_group_messages where id=new.group_message_id;
   select name into who from public.playroom_groups where id=gm.group_id;
   perform public.playroom_push_enqueue(new.target_id,'invite:'||new.id,'invitation',new.id::text,'group',gm.group_id,who,'Приглашение в игру · '||coalesce(room.game_name,room.name),new.expires_at);
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists playroom_push_message on public.playroom_messages;
create trigger playroom_push_message after insert on public.playroom_messages for each row execute function public.playroom_push_message();
drop trigger if exists playroom_push_group_message on public.playroom_group_messages;
create trigger playroom_push_group_message after insert on public.playroom_group_messages for each row execute function public.playroom_push_message();
drop trigger if exists playroom_push_invitation on public.playroom_room_invites;
create trigger playroom_push_invitation after insert on public.playroom_room_invites for each row execute function public.playroom_push_message();

-- Durable social transitions use the same subscription queue as chat events.
create or replace function public.playroom_push_activity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare who text; target uuid; gid uuid; label text; r public.playroom_cloud_rooms%rowtype; actor uuid;
begin
 if not exists(select 1 from public.playroom_push_config where singleton and enabled) then return new; end if;
 if tg_table_name='playroom_friendships' then
  if tg_op='INSERT' and not new.accepted then
   select nickname into who from public.playroom_profiles where id=new.sender;
   perform public.playroom_push_enqueue(new.recipient,'friend-request:'||new.id,'friend-request',new.id::text,'dm',new.sender,coalesce(who,'Игрок'),'Заявка в друзья',now()+interval '7 days');
  elsif tg_op='UPDATE' and new.accepted and not old.accepted then
   select nickname into who from public.playroom_profiles where id=new.recipient;
   perform public.playroom_push_enqueue(new.sender,'friend-accepted:'||new.id,'friend-accepted',new.id::text,'dm',new.recipient,coalesce(who,'Игрок'),'Заявка в друзья принята',now()+interval '24 hours');
  end if;
 elsif tg_table_name='playroom_group_members' then
  if new.left_at is not null then return new; end if;
  if tg_op='UPDATE' and old.left_at is null then return new; end if;
  select nickname into who from public.playroom_profiles where id=new.user_id;
  select name into label from public.playroom_groups where id=new.group_id and closed_at is null;
  if label is null then return new; end if;
  for target in select user_id from public.playroom_group_members where group_id=new.group_id and left_at is null and user_id<>new.user_id loop
   perform public.playroom_push_enqueue(target,'group-member:'||new.group_id||':'||md5(new.user_id::text||txid_current()::text),'group-member',new.group_id::text,'group',new.group_id,label,coalesce(who,'Игрок')||' присоединился к группе',now()+interval '24 hours');
  end loop;
 else
  if new.used_by is null or old.used_by is not null then return new; end if;
  select * into r from public.playroom_cloud_rooms where id=new.room_id and not closed;
  if not found then return new; end if;
  select nickname into who from public.playroom_profiles where id=new.used_by;
  for target in select distinct id from (values(r.owner_id),(coalesce(new.invited_by,r.owner_id))) users(id) where id<>new.used_by loop
   perform public.playroom_push_enqueue(target,'invite-accepted:'||new.id,'invite-accepted',new.id::text,'room',r.id,coalesce(r.game_name,r.name),coalesce(who,'Игрок')||' принял приглашение в «'||r.name||'»',now()+interval '1 hour');
  end loop;
 end if;
 return new;
end;$$;
drop trigger if exists playroom_push_friend on public.playroom_friendships;
create trigger playroom_push_friend after insert or update of accepted on public.playroom_friendships for each row execute function public.playroom_push_activity();
drop trigger if exists playroom_push_group_member on public.playroom_group_members;
create trigger playroom_push_group_member after insert or update of left_at on public.playroom_group_members for each row execute function public.playroom_push_activity();
drop trigger if exists playroom_push_invite_accepted on public.playroom_room_invites;
create trigger playroom_push_invite_accepted after update of used_by on public.playroom_room_invites for each row execute function public.playroom_push_activity();
revoke all on function public.playroom_push_activity() from public,anon,authenticated;

-- Important update announcements are operator-only; releases never enqueue them.
create table if not exists public.playroom_push_updates (
 id uuid primary key,version text not null unique,title text not null,body text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days'
);
alter table public.playroom_push_updates enable row level security;
revoke all on public.playroom_push_updates from public,anon,authenticated;
create or replace function public.playroom_push_announce_update(p_id uuid,p_version text,p_title text,p_body text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.playroom_push_updates%rowtype; who uuid; queued integer;
begin
 if p_id is null or coalesce(p_version,'') !~ '^[0-9]+[.][0-9]+[.][0-9]+([-.][A-Za-z0-9.-]+)?$' or char_length(p_version)>64 or char_length(trim(coalesce(p_title,''))) not between 1 and 80 or char_length(trim(coalesce(p_body,''))) not between 1 and 160 then raise exception 'Invalid update announcement'; end if;
 if not exists(select 1 from public.playroom_push_config where singleton and enabled) then raise exception 'Push disabled'; end if;
 perform pg_advisory_xact_lock(hashtextextended('playroom-important-update:'||p_version,0));
 select * into existing from public.playroom_push_updates where version=p_version or id=p_id;
 if found then
  if existing.version<>p_version or existing.title<>p_title or existing.body<>p_body then raise exception 'Announcement conflict'; end if;
  return jsonb_build_object('duplicate',true,'queued',0);
 end if;
 insert into public.playroom_push_updates(id,version,title,body) values(p_id,p_version,p_title,p_body) returning * into existing;
 for who in select distinct user_id from public.playroom_push_subscriptions loop
  perform public.playroom_push_enqueue(who,'update:'||p_id,'update',p_id::text,'update',p_id,p_title,p_body,existing.expires_at);
 end loop;
 update public.playroom_push_deliveries set payload=payload||jsonb_build_object('version',p_version) where event_key='update:'||p_id;
 select count(*) into queued from public.playroom_push_deliveries where event_key='update:'||p_id;
 return jsonb_build_object('duplicate',false,'queued',queued);
end;$$;
revoke all on function public.playroom_push_announce_update(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.playroom_push_announce_update(uuid,text,text,text) to service_role;

create or replace function public.playroom_push_pending(d public.playroom_push_deliveries,who uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select d.expires_at>now() and case d.kind
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
 when 'room' then exists(select 1 from public.playroom_cloud_rooms r join public.playroom_room_members m on m.room_id=r.id and m.user_id=who where r.id=d.ref::uuid and not r.closed)
 when 'invitation' then public.playroom_invitation_state(d.ref::uuid,who) in ('active','offline') and exists(select 1 from public.playroom_room_invites i where i.id=d.ref::uuid and i.used_by is null)
 else false end;
$$;
create or replace function public.playroom_push_claim() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb;
begin
 delete from public.playroom_push_room_events where created_at<now()-interval '24 hours';
 delete from public.playroom_push_deliveries d using public.playroom_push_subscriptions s where s.id=d.subscription_id and (d.attempts>=5 and d.available_at<=now() or not public.playroom_push_pending(d,s.user_id));
 with batch as (select d.id from public.playroom_push_deliveries d where available_at<=now() and exists(select 1 from public.playroom_push_config where singleton and enabled) order by d.id for update skip locked limit 40),
 claimed as (update public.playroom_push_deliveries d set lease=gen_random_uuid(),attempts=attempts+1,available_at=now()+interval '2 minutes' from batch where d.id=batch.id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id::text,'lease',d.lease,'payload',d.payload,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into rows from claimed d join public.playroom_push_subscriptions s on s.id=d.subscription_id;
 return rows;
end;$$;
create or replace function public.playroom_push_complete(p_id bigint,p_lease uuid,p_result text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare sub_id uuid;
begin
 select subscription_id into sub_id from public.playroom_push_deliveries where id=p_id and lease=p_lease for update;
 if not found then return; end if;
 if p_result='gone' then delete from public.playroom_push_subscriptions where id=sub_id;
 elsif p_result in ('sent','drop') then delete from public.playroom_push_deliveries where id=p_id;
 elsif p_result='retry' then update public.playroom_push_deliveries set lease=null,available_at=now()+make_interval(secs=>least(1800,30*(2^attempts)::integer)) where id=p_id;
 else raise exception 'Invalid push result'; end if;
end;$$;
revoke all on function public.playroom_push_endpoint(text),public.playroom_push_enqueue(uuid,text,text,text,text,uuid,text,text,timestamptz),public.playroom_push_message(),public.playroom_push_pending(public.playroom_push_deliveries,uuid),public.playroom_push_claim(),public.playroom_push_complete(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.playroom_push_claim(),public.playroom_push_complete(bigint,uuid,text) to service_role;
commit;

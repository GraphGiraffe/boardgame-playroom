-- PlayRoom 0.20 stage 2. Apply AFTER supabase.sql, only to the PlayRoom project.
-- Metadata only: no game state, SDP, hands, auth tokens or resume secrets.
begin;
alter table public.playroom_profiles add column if not exists username text check(username ~ '^[a-z][a-z0-9_]{2,23}$');
create unique index if not exists playroom_username_unique on public.playroom_profiles(lower(username)) where username is not null;
create table if not exists public.playroom_friendships (
 id uuid primary key default gen_random_uuid(),
 sender uuid not null references public.playroom_profiles(id) on delete cascade,
 recipient uuid not null references public.playroom_profiles(id) on delete cascade,
 accepted boolean not null default false,
 created_at timestamptz not null default now(),
 check(sender <> recipient)
);
create unique index if not exists playroom_friend_pair on public.playroom_friendships(least(sender,recipient),greatest(sender,recipient));
create table if not exists public.playroom_cloud_rooms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.playroom_profiles(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 48),
 closed boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.playroom_cloud_rooms add column if not exists local_room_id text;
create table if not exists public.playroom_room_members (
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 nickname text not null check(char_length(trim(nickname)) between 1 and 24),
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
create table if not exists public.playroom_room_invites (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.playroom_cloud_rooms(id) on delete cascade,
 target_id uuid references public.playroom_profiles(id) on delete cascade,
 token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '24 hours',
 used_by uuid references auth.users(id) on delete cascade,
 revoked boolean not null default false
);
alter table public.playroom_room_invites add column if not exists declined_at timestamptz;
create index if not exists playroom_room_members_user on public.playroom_room_members(user_id);
create index if not exists playroom_invites_room on public.playroom_room_invites(room_id);
alter table public.playroom_friendships enable row level security;
alter table public.playroom_cloud_rooms enable row level security;
alter table public.playroom_room_members enable row level security;
alter table public.playroom_room_invites enable row level security;
-- Access is exclusively through explicit projected RPC results. No table API grants.
revoke all on public.playroom_friendships,public.playroom_cloud_rooms,public.playroom_room_members,public.playroom_room_invites from public,anon,authenticated;
alter table public.playroom_room_members add column if not exists active_until timestamptz;

-- One live Online room per account; old rows retain recovery identities.
create or replace function public.playroom_require_online_slot(p_user uuid,p_room uuid default null)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('playroom:online-slot:'||p_user::text,0));
 if exists(select 1 from public.playroom_cloud_rooms q
   where not q.closed and q.id is distinct from p_room
    and (q.owner_id=p_user or exists(select 1 from public.playroom_room_members m where m.room_id=q.id and m.user_id=p_user and m.active_until>now()))
    and (to_jsonb(q) ? 'host_until')
    and ((to_jsonb(q)->>'host_until')::timestamptz>now()
     or ((to_jsonb(q)->>'host_until') is null and q.created_at>now()-interval '2 minutes')))
 then raise exception 'social:room-active'; end if;
end $$;
revoke all on function public.playroom_require_online_slot(uuid,uuid) from public,anon,authenticated;

create or replace function public.playroom_social(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 me uuid := auth.uid();
 guest boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 target uuid; rid uuid; fid uuid; token text; nick text; handle text;
 r public.playroom_cloud_rooms%rowtype;
 inv public.playroom_room_invites%rowtype;
 edge public.playroom_friendships%rowtype;
 result jsonb;
begin
 if me is null then raise exception 'social:account-required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'social:invalid'; end if;
 if guest and p_action not in ('join','list','room','leave') then raise exception 'social:account-required' using errcode='42501'; end if;
 if p_action='profile' then
  nick := trim(p_data->>'nickname');
  if nick is null or char_length(nick) not between 1 and 24 then raise exception 'social:invalid'; end if;
  if p_data ? 'username' then
   handle:=lower(trim(p_data->>'username'));
   if handle is null or handle !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'social:username-invalid'; end if;
  else select username into handle from public.playroom_profiles where id=me; end if;
  begin
   insert into public.playroom_profiles(id,nickname,username) values(me,nick,handle) on conflict(id) do update set nickname=excluded.nickname,username=excluded.username;
  exception when unique_violation then raise exception 'social:username-taken'; end;
  update public.playroom_room_members set nickname=nick where user_id=me;
  return jsonb_build_object('id',me,'nickname',nick,'username',handle);
 elsif p_action='list' then
  select jsonb_build_object(
   'profile',(select jsonb_build_object('id',id,'nickname',nickname,'username',username) from public.playroom_profiles where id=me and not guest),
   'friends',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'userId',p.id,'nickname',p.nickname,'username',p.username,'accepted',f.accepted,'incoming',f.recipient=me) order by f.created_at,f.id)
     from public.playroom_friendships f join public.playroom_profiles p on p.id=case when f.sender=me then f.recipient else f.sender end
     where (f.sender=me or f.recipient=me) and not guest),'[]'::jsonb),
   'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'roomName',q.name,'fromName',p.nickname) order by i.expires_at,i.id) from public.playroom_room_invites i join public.playroom_cloud_rooms q on q.id=i.room_id join public.playroom_profiles p on p.id=q.owner_id where i.target_id=me and not guest and not q.closed and not i.revoked and i.declined_at is null and i.used_by is null and i.expires_at>now()),'[]'::jsonb),
   'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'ownerId',q.owner_id,'available',coalesce((to_jsonb(q)->>'host_until')::timestamptz>now(),false),'hostUntil',to_jsonb(q)->>'host_until','roomCode',to_jsonb(q)->>'room_code','hasPassword',coalesce((to_jsonb(q)->>'password_enabled')::boolean,true)) order by q.created_at,q.id)
     from public.playroom_cloud_rooms q join public.playroom_room_members m on m.room_id=q.id where m.user_id=me and not q.closed),'[]'::jsonb)
  ) into result;
  return result;
 elsif p_action='search' then
  -- friend-search-v2-opt-in: literal substring, exact first, public keyset pages.
  handle:=lower(ltrim(trim(p_data->>'username'),'@'));
  if handle is null or handle !~ '^[a-z0-9_]{3,24}$' then raise exception 'social:username-invalid'; end if;
  if coalesce(p_data->>'after','')<>'' and (lower(p_data->>'after') !~ '^[a-z][a-z0-9_]{2,23}$' or strpos(lower(p_data->>'after'),handle)=0) then raise exception 'social:invalid'; end if;
  with matches as (
   select p.id,p.nickname,p.username,case when lower(p.username)=handle then 0 else 1 end as priority
   from public.playroom_profiles p join auth.users u on u.id=p.id
   where p.id<>me and not coalesce(u.is_anonymous,false) and strpos(lower(p.username),handle)>0
    and (coalesce(p_data->>'after','')='' or
     (case when lower(p.username)=handle then 0 else 1 end,lower(p.username) collate "C")>
     (case when lower(p_data->>'after')=handle then 0 else 1 end,lower(p_data->>'after') collate "C"))
   order by priority,lower(p.username) collate "C" limit 31
  ), page as (select * from matches order by priority,lower(username) collate "C" limit 30)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'username',username) order by priority,lower(username) collate "C") from page),'[]'::jsonb),
   'next',case when (select count(*) from matches)>30 then (select username from page order by priority desc,lower(username) collate "C" desc limit 1) else null end) into result;
  if p_data->>'format'='page-v2' then return result; end if;
  return result->'items';
 elsif p_action='request' then
  if p_data ? 'username' then
   select id into target from public.playroom_profiles where username=lower(ltrim(trim(p_data->>'username'),'@'));
   if target is null then raise exception 'social:not-found'; end if;
  else target := (p_data->>'userId')::uuid; end if;
  if target=me or target is null then raise exception 'social:invalid'; end if;
  if not exists(select 1 from public.playroom_profiles where id=me) then raise exception 'social:profile-required'; end if;
  if not exists(select 1 from public.playroom_profiles where id=target) then raise exception 'social:not-found'; end if;
  -- Serialize each sender's requests, including the quota check.
  perform 1 from public.playroom_profiles where id=me for update;
  if (select count(*) from public.playroom_friendships where sender=me and not accepted)>=100 then raise exception 'social:limit'; end if;
  insert into public.playroom_friendships(sender,recipient) values(me,target) on conflict do nothing;
  return '{}'::jsonb;
 elsif p_action in ('accept','remove') then
  fid := (p_data->>'id')::uuid;
  select * into edge from public.playroom_friendships where id=fid for update;
  if not found or me not in (edge.sender,edge.recipient) then raise exception 'social:not-found'; end if;
  if p_action='accept' then
   if edge.recipient<>me then raise exception 'social:forbidden' using errcode='42501'; end if;
   update public.playroom_friendships set accepted=true where id=fid;
  else delete from public.playroom_friendships where id=fid;
   -- Removing friendship also revokes unused targeted invitations between the pair.
   update public.playroom_room_invites i set revoked=true from public.playroom_cloud_rooms q
    where i.room_id=q.id and ((q.owner_id=edge.sender and i.target_id=edge.recipient) or (q.owner_id=edge.recipient and i.target_id=edge.sender));
  end if;
  return '{}'::jsonb;
 elsif p_action in ('create','lobby') then
  if not exists(select 1 from public.playroom_profiles where id=me) then raise exception 'social:profile-required'; end if;
  perform 1 from public.playroom_profiles where id=me for update;
  if p_action='lobby' then
   if p_data->>'localRoomId' is null or char_length(p_data->>'localRoomId') not between 1 and 128 then raise exception 'social:invalid'; end if;
   select id into rid from public.playroom_cloud_rooms where owner_id=me and local_room_id=p_data->>'localRoomId' and not closed;
   if found then return jsonb_build_object('id',rid); end if;
  end if;
  perform public.playroom_require_online_slot(me,null);
  nick:=trim(p_data->>'name');
  if nick is null or char_length(nick) not between 1 and 48 then raise exception 'social:invalid'; end if;
  insert into public.playroom_cloud_rooms(owner_id,name,local_room_id) values(me,nick,case when p_action='lobby' then p_data->>'localRoomId' else null end) returning * into r;
  insert into public.playroom_room_members(room_id,user_id,nickname) select r.id,me,nickname from public.playroom_profiles where id=me;
  return jsonb_build_object('id',r.id);
 elsif p_action='join' then
  token:=p_data->>'token';nick:=trim(p_data->>'nickname');
  if nick is null or char_length(nick) not between 1 and 24 then raise exception 'social:invalid'; end if;
  if p_data->>'inviteId' is not null and not guest then
   fid:=(p_data->>'inviteId')::uuid;
  elsif token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'social:invalid'; end if;
  -- Room first, invite second: same lock order as close/revoke, no oversubscription.
  select room_id into rid from public.playroom_room_invites where (fid is not null and id=fid and target_id=me) or (fid is null and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'));
  perform public.playroom_require_online_slot(me,rid);
  select * into r from public.playroom_cloud_rooms where id=rid for update;
  if not found or r.closed then raise exception 'social:invite-invalid'; end if;
  select * into inv from public.playroom_room_invites where (fid is not null and id=fid and target_id=me) or (fid is null and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex')) for update;
  if not found or inv.revoked or (to_jsonb(inv)->>'group_message_id' is null and (inv.declined_at is not null or inv.expires_at<=now())) or (inv.used_by is not null and inv.used_by<>me) or (inv.target_id is not null and inv.target_id<>me) then raise exception 'social:invite-invalid'; end if;
  -- Group-shared invitations are valid only while the recipient remains in that group.
  if to_jsonb(inv)->>'group_message_id' is not null then
   if not exists(select 1 from public.playroom_group_messages msg join public.playroom_group_members mem on mem.group_id=msg.group_id and mem.user_id=me and mem.left_at is null where msg.id=(to_jsonb(inv)->>'group_message_id')::bigint and msg.id>coalesce((to_jsonb(mem)->>'history_after')::bigint,0)) then raise exception 'social:invite-invalid'; end if;
  end if;
  -- A directed invitation authorizes its named recipient even before friendship.
  -- Same caller retry after a lost response is idempotent.
  if exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then
   update public.playroom_room_members set active_until=now()+interval '2 minutes' where room_id=rid and user_id=me;
   return jsonb_build_object('id',rid); end if;
  if inv.used_by is not null and to_jsonb(inv)->>'group_message_id' is null then raise exception 'social:invite-invalid'; end if;
  if (select count(*) from public.playroom_room_members where room_id=rid)>=32 then raise exception 'social:limit'; end if;
  insert into public.playroom_room_members(room_id,user_id,nickname,active_until) values(rid,me,nick,now()+interval '2 minutes');
  update public.playroom_room_invites set used_by=me where id=inv.id;
  return jsonb_build_object('id',rid);
 elsif p_action in ('room','invite','revoke','close','leave','kick') then
  rid := (p_data->>'roomId')::uuid;
  select * into r from public.playroom_cloud_rooms where id=rid for update;
  if found and p_action='close' and r.closed and r.owner_id=me and not guest then return '{}'::jsonb; end if;
  if not found or r.closed or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then raise exception 'social:not-found'; end if;
  if p_action='room' then
   return jsonb_build_object('id',rid,'name',r.name,'ownerId',r.owner_id,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname) order by joined_at,user_id),'[]'::jsonb) from public.playroom_room_members where room_id=rid),
    'invites',case when me=r.owner_id then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'targetId',target_id,'expiresAt',expires_at,'used',used_by is not null,'revoked',revoked) order by expires_at,id),'[]'::jsonb) from public.playroom_room_invites where room_id=rid) else '[]'::jsonb end);
  elsif p_action='leave' then
   if r.owner_id=me then raise exception 'social:owner-leave'; end if;
   delete from public.playroom_room_members where room_id=rid and user_id=me;
   return '{}'::jsonb;
  end if;
  if r.owner_id<>me or guest then raise exception 'social:forbidden' using errcode='42501'; end if;
  if p_action='close' then
   update public.playroom_cloud_rooms set closed=true where id=rid;
   update public.playroom_room_invites set revoked=true,expires_at=least(expires_at,now()) where room_id=rid;
  elsif p_action='kick' then
   target := (p_data->>'userId')::uuid;
   if target=me or target is null then raise exception 'social:invalid'; end if;
   delete from public.playroom_room_members where room_id=rid and user_id=target;
   update public.playroom_room_invites set revoked=true where room_id=rid and (used_by=target or target_id=target);
  elsif p_action='revoke' then
   update public.playroom_room_invites set revoked=true where room_id=rid and id=(p_data->>'id')::uuid;
   if not found then raise exception 'social:not-found'; end if;
  elsif p_action='invite' then
   target:=(p_data->>'userId')::uuid;
   if target is not null and not exists(select 1 from public.playroom_friendships where accepted and ((sender=me and recipient=target) or (recipient=me and sender=target))) then raise exception 'social:friend-required'; end if;
   if (select count(*) from public.playroom_room_invites where room_id=rid and not revoked and declined_at is null and used_by is null and expires_at>now())>=100 then raise exception 'social:limit'; end if;
   token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   insert into public.playroom_room_invites(room_id,target_id,token_hash) values(rid,target,encode(sha256(convert_to(token,'UTF8')),'hex')) returning * into inv;
   return jsonb_build_object('id',inv.id,'token',token,'expiresAt',inv.expires_at);
  end if;
  return '{}'::jsonb;
 end if;
 raise exception 'social:invalid';
end $$;
revoke all on function public.playroom_social(text,jsonb) from public,anon;
grant execute on function public.playroom_social(text,jsonb) to authenticated;
comment on function public.playroom_social(text,jsonb) is 'Explicit social access; private metadata only. Game authority and transport are separate.';
commit;

-- PlayRoom Online: apply after supabase.sql, social.sql and signaling.sql.
-- Discovery/passwords/presence only; no game states, Auth or resume secrets.
begin;
alter table public.playroom_cloud_rooms add column if not exists room_code text check(room_code ~ '^\d{4}$');
-- Older clients supplied device-local numbers, which could collide across hosts.
with ranked as (select id,row_number() over(partition by room_code order by created_at,id) n
 from public.playroom_cloud_rooms where not closed and room_code is not null)
update public.playroom_cloud_rooms set room_code=null where id in(select id from ranked where n>1);
create unique index if not exists playroom_active_room_code on public.playroom_cloud_rooms(room_code) where not closed and room_code is not null;
alter table public.playroom_cloud_rooms add column if not exists visibility text not null default 'hidden' check(visibility in ('all','friends','hidden'));
alter table public.playroom_cloud_rooms add column if not exists room_password text check(room_password ~ '^[A-Z2-9]{6}$');
alter table public.playroom_cloud_rooms add column if not exists password_enabled boolean not null default true;
alter table public.playroom_cloud_rooms add column if not exists allow_player_invites boolean not null default false;
alter table public.playroom_room_invites add column if not exists group_message_id bigint;
alter table public.playroom_room_invites add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.playroom_cloud_rooms add column if not exists game_name text check(char_length(game_name) between 1 and 80);
alter table public.playroom_profiles add column if not exists last_seen timestamptz;
alter table public.playroom_profiles add column if not exists avatar text;
alter table public.playroom_profiles add column if not exists activity_game text;
create table if not exists public.playroom_messages (
 id bigint generated always as identity primary key,
 sender uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 nonce uuid not null, body text not null check(char_length(body) between 1 and 2000),
 created_at timestamptz not null default now(), unique(sender,nonce), check(sender<>recipient)
);
alter table public.playroom_messages add column if not exists kind text not null default 'message' check(kind in ('message','invitation'));
alter table public.playroom_messages add column if not exists invitation_id uuid references public.playroom_room_invites(id) on delete set null;
alter table public.playroom_messages add column if not exists game_name text;
create unique index if not exists playroom_message_invitation on public.playroom_messages(invitation_id) where invitation_id is not null;
alter table public.playroom_room_invites add column if not exists created_at timestamptz not null default now();
-- Both Online and legacy directed invitations become durable conversation events.
create or replace function public.playroom_invitation_message() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare author uuid; room_name text; game_title text;
begin
 select coalesce(new.invited_by,owner_id),name,game_name into author,room_name,game_title from public.playroom_cloud_rooms where id=new.room_id;
 if new.group_message_id is null and new.target_id is not null and author<>new.target_id then
  insert into public.playroom_messages(sender,recipient,nonce,body,kind,invitation_id,created_at,game_name)
   values(author,new.target_id,new.id,room_name,'invitation',new.id,new.created_at,game_title) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.playroom_invitation_message() from public,anon,authenticated;
drop trigger if exists playroom_invitation_message on public.playroom_room_invites;
create trigger playroom_invitation_message after insert on public.playroom_room_invites for each row execute function public.playroom_invitation_message();
-- Existing invitations without a creation timestamp use the migration time.
insert into public.playroom_messages(sender,recipient,nonce,body,kind,invitation_id,created_at,game_name)
 select coalesce(i.invited_by,r.owner_id),i.target_id,i.id,r.name,'invitation',i.id,i.created_at,r.game_name
 from public.playroom_room_invites i join public.playroom_cloud_rooms r on r.id=i.room_id
 where i.group_message_id is null and i.target_id is not null and coalesce(i.invited_by,r.owner_id)<>i.target_id order by i.created_at,i.id on conflict do nothing;
create index if not exists playroom_message_pair on public.playroom_messages(least(sender,recipient),greatest(sender,recipient),id desc);
alter table public.playroom_messages enable row level security;
revoke all on public.playroom_messages from public,anon,authenticated;
create table if not exists public.playroom_chat_reads (
 reader uuid not null references auth.users(id) on delete cascade,
 peer uuid not null references auth.users(id) on delete cascade,
 through_id bigint not null default 0,
 primary key(reader,peer), check(reader<>peer)
);
alter table public.playroom_chat_reads enable row level security;
revoke all on public.playroom_chat_reads from public,anon,authenticated;
create table if not exists public.playroom_join_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), attempts integer not null default 0
);
alter table public.playroom_join_attempts enable row level security;
revoke all on public.playroom_join_attempts from public,anon,authenticated;
-- Cloud groups are independent of game rooms and survive their creator leaving.
create table if not exists public.playroom_groups (
 id uuid primary key, name text not null check(char_length(name) between 1 and 48),
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.playroom_groups add column if not exists closed_at timestamptz;
alter table public.playroom_groups add column if not exists show_history boolean not null default true;
create table if not exists public.playroom_group_members (
 group_id uuid not null references public.playroom_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(), left_at timestamptz, read_through bigint not null default 0,
 primary key(group_id,user_id)
);
alter table public.playroom_group_members add column if not exists history_after bigint not null default 0;
create table if not exists public.playroom_group_invites (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.playroom_groups(id) on delete cascade,
 sender uuid not null references auth.users(id) on delete cascade, target uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, declined_at timestamptz, check(sender<>target)
);
-- Close previously abandoned groups without deleting their history or reusing their IDs.
update public.playroom_groups g set closed_at=now() where closed_at is null
 and not exists(select 1 from public.playroom_group_members m where m.group_id=g.id and m.left_at is null);
update public.playroom_group_invites i set expires_at=least(i.expires_at,now())
 where accepted_at is null and declined_at is null
 and exists(select 1 from public.playroom_groups g where g.id=i.group_id and g.closed_at is not null);
create table if not exists public.playroom_group_messages (
 id bigint generated always as identity primary key, group_id uuid not null references public.playroom_groups(id) on delete cascade,
 sender uuid not null references auth.users(id) on delete cascade, nonce uuid not null,
 body text not null check(char_length(body) between 1 and 2000), created_at timestamptz not null default now(), unique(sender,nonce)
);
alter table public.playroom_group_messages add column if not exists room_id uuid references public.playroom_cloud_rooms(id) on delete set null;
alter table public.playroom_group_messages add column if not exists kind text not null default 'message' check(kind in ('message','invitation'));
alter table public.playroom_group_messages add column if not exists game_name text;
alter table public.playroom_room_invites drop constraint if exists playroom_room_invites_group_message_fk;
alter table public.playroom_room_invites add constraint playroom_room_invites_group_message_fk foreign key(group_message_id) references public.playroom_group_messages(id) on delete cascade;
create unique index if not exists playroom_room_invite_group_target on public.playroom_room_invites(group_message_id,target_id) where group_message_id is not null;
create index if not exists playroom_group_message_history on public.playroom_group_messages(group_id,id desc);
alter table public.playroom_groups enable row level security;
alter table public.playroom_group_members enable row level security;
alter table public.playroom_group_invites enable row level security;
alter table public.playroom_group_messages enable row level security;
revoke all on public.playroom_groups,public.playroom_group_members,public.playroom_group_invites,public.playroom_group_messages from public,anon,authenticated;
alter table public.playroom_messages drop constraint if exists playroom_messages_kind_check;
alter table public.playroom_messages add constraint playroom_messages_kind_check check(kind in ('message','invitation','group-invitation'));
alter table public.playroom_messages add column if not exists group_invitation_id uuid references public.playroom_group_invites(id) on delete set null;
create unique index if not exists playroom_message_group_invitation on public.playroom_messages(group_invitation_id) where group_invitation_id is not null;

create or replace function public.playroom_invitation_state(invite_id uuid, recipient uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select case when r.closed then 'expired' when i.group_message_id is null and i.declined_at is not null then 'declined' when i.revoked then 'revoked'
  when i.group_message_id is null and i.used_by is null and i.expires_at<=now() then 'expired'
  when recipient=r.owner_id then 'joined' when r.host_until is null or r.host_until<=now() then 'offline'
  when (i.group_message_id is null and i.used_by is not null) or exists(select 1 from public.playroom_room_members where room_id=i.room_id and user_id=recipient) then 'joined'
  else 'active' end
 from public.playroom_room_invites i join public.playroom_cloud_rooms r on r.id=i.room_id where i.id=invite_id),'expired');
$$;
revoke all on function public.playroom_invitation_state(uuid,uuid) from public,anon,authenticated;

-- Counts use server read cursors, including chats not cached on this device.
create or replace function public.playroom_unread_rpc() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('chats',coalesce((select jsonb_agg(row) from (
  select jsonb_build_object('key','dm:'||m.sender::text,'through',coalesce(max(cr.through_id),0)::text,
   'unread',count(*) filter(where m.id>coalesce(cr.through_id,0)),
   'invites',count(*) filter(where m.kind='invitation' and public.playroom_invitation_state(m.invitation_id,auth.uid()) in ('active') or m.kind='group-invitation' and gi.accepted_at is null and gi.declined_at is null and gi.expires_at>now() and gg.closed_at is null)) row
  from public.playroom_messages m left join public.playroom_chat_reads cr on cr.reader=auth.uid() and cr.peer=m.sender
  left join public.playroom_group_invites gi on gi.id=m.group_invitation_id left join public.playroom_groups gg on gg.id=gi.group_id
  where m.recipient=auth.uid() group by m.sender
  union all
  select jsonb_build_object('key','group:'||g.id::text,'through',mem.read_through::text,
   'unread',count(m.id) filter(where m.sender<>auth.uid() and m.id>mem.read_through),
   'invites',count(m.id) filter(where m.sender<>auth.uid() and m.kind='invitation' and public.playroom_invitation_state(ri.id,auth.uid()) in ('active'))) row
  from public.playroom_groups g join public.playroom_group_members mem on mem.group_id=g.id and mem.user_id=auth.uid() and mem.left_at is null
  left join public.playroom_group_messages m on m.group_id=g.id and m.id>mem.history_after left join public.playroom_room_invites ri on ri.group_message_id=m.id and ri.target_id=auth.uid()
  where g.closed_at is null group by g.id,mem.read_through
 ) q),'[]'::jsonb));
$$;
revoke all on function public.playroom_unread_rpc() from public,anon,authenticated;

create or replace function public.playroom_groups_rpc(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=auth.uid(); gid uuid:=(p_data->>'groupId')::uuid; target_user uuid; invitation public.playroom_group_invites%rowtype; group_row public.playroom_groups%rowtype; title text; body_text text; through_id bigint; rows_json jsonb; room_row public.playroom_cloud_rooms%rowtype; message_row public.playroom_group_messages%rowtype;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from public.playroom_profiles where id=me) then raise exception 'social:account-required'; end if;
 if p_action='list' then
  return jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'showHistory',g.show_history,'count',(select count(*) from public.playroom_group_members m where m.group_id=g.id and m.left_at is null)) order by g.created_at desc,g.id) from public.playroom_groups g join public.playroom_group_members m on m.group_id=g.id and m.user_id=me and m.left_at is null and g.closed_at is null),'[]'::jsonb));
 end if;
 if p_action='inbox' then
  if not p_data ? 'after' then return jsonb_build_object('cursor',coalesce((select max(msg.id) from public.playroom_group_messages msg join public.playroom_group_members mem on mem.group_id=msg.group_id and mem.user_id=me and mem.left_at is null where msg.id>mem.history_after and msg.sender<>me),0)::text,'items','[]'::jsonb); end if;
  if coalesce(p_data->>'after','') !~ '^[0-9]{1,19}$' then raise exception 'social:invalid'; end if;
  through_id:=(p_data->>'after')::bigint;
  return (with batch as (select msg.* from public.playroom_group_messages msg join public.playroom_group_members mem on mem.group_id=msg.group_id and mem.user_id=me and mem.left_at is null where msg.id>mem.history_after and msg.sender<>me and msg.id>through_id order by msg.id limit 30)
   select jsonb_build_object('cursor',coalesce(max(m.id),through_id)::text,'items',coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'body',p.nickname||': '||case when m.kind='invitation' then 'Приглашение в комнату · '||coalesce(m.game_name,'')||' · '||m.body else m.body end,'kind','group-message','invitationState',case when m.kind='invitation' then public.playroom_invitation_state((select id from public.playroom_room_invites where group_message_id=m.id and target_id=me),me) else null end,'group',jsonb_build_object('id',g.id,'name',g.name),'person',jsonb_build_object('userId','group:'||g.id::text,'nickname',g.name,'avatar',null)) order by m.id),'[]'::jsonb)) from batch m join public.playroom_groups g on g.id=m.group_id join public.playroom_profiles p on p.id=m.sender);
 end if;
 if p_action='create' then
  gid:=(p_data->>'id')::uuid; title:=trim(p_data->>'name');
  if gid is null or title is null or char_length(title) not between 1 and 48 then raise exception 'social:invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,2));
  select * into group_row from public.playroom_groups where id=gid for update;
  if found then
   if group_row.closed_at is not null or group_row.created_by<>me or group_row.name<>title or not exists(select 1 from public.playroom_group_members where group_id=gid and user_id=me and left_at is null) then raise exception 'social:forbidden'; end if;
  else
   if (select count(*) from public.playroom_groups where created_by=me and created_at>now()-interval '1 minute')>=5 or (select count(*) from public.playroom_group_members where user_id=me and left_at is null)>=100 then raise exception 'social:limit'; end if;
   insert into public.playroom_groups(id,name,created_by) values(gid,title,me) returning * into group_row;
   insert into public.playroom_group_members(group_id,user_id) values(gid,me);
  end if;
  return jsonb_build_object('id',group_row.id,'name',group_row.name,'showHistory',group_row.show_history,'count',1);
 end if;
 if p_action in ('accept','decline') then
  select * into invitation from public.playroom_group_invites where id=(p_data->>'inviteId')::uuid and target=me;
  if not found then raise exception 'social:forbidden'; end if;gid:=invitation.group_id;
 end if;
 select * into group_row from public.playroom_groups where id=gid for update;
 if not found then raise exception 'social:not-found'; end if;
 if group_row.closed_at is not null then raise exception 'social:invite-invalid'; end if;
 if p_action in ('accept','decline') then
  select * into invitation from public.playroom_group_invites where id=(p_data->>'inviteId')::uuid and target=me for update;
  if p_action='decline' then
   if invitation.accepted_at is not null then raise exception 'social:invite-invalid'; end if;
   update public.playroom_group_invites set declined_at=coalesce(declined_at,now()) where id=invitation.id;return '{}'::jsonb;
  end if;
  if invitation.declined_at is not null or invitation.expires_at<=now() then raise exception 'social:invite-invalid'; end if;
  if invitation.accepted_at is not null then
   if not exists(select 1 from public.playroom_group_members where group_id=gid and user_id=me and left_at is null) then raise exception 'social:invite-invalid'; end if;
  else
   if (select count(*) from public.playroom_group_members where group_id=gid and left_at is null)>=32 then raise exception 'social:limit'; end if;
   insert into public.playroom_group_members(group_id,user_id,history_after) values(gid,me,case when group_row.show_history then 0 else coalesce((select max(id) from public.playroom_group_messages where group_id=gid),0) end) on conflict(group_id,user_id) do update set left_at=null,joined_at=now(),history_after=excluded.history_after,read_through=greatest(public.playroom_group_members.read_through,excluded.history_after);
   -- Late members can accept still-open room invitations visible in their history.
   insert into public.playroom_room_invites(room_id,target_id,token_hash,invited_by,group_message_id)
    select msg.room_id,me,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),msg.sender,msg.id from public.playroom_group_messages msg join public.playroom_cloud_rooms r on r.id=msg.room_id
    where msg.group_id=gid and msg.kind='invitation' and msg.sender<>me and not r.closed and msg.id>(select history_after from public.playroom_group_members where group_id=gid and user_id=me) on conflict do nothing;
   update public.playroom_group_invites set accepted_at=now() where id=invitation.id;
  end if;
  return jsonb_build_object('id',group_row.id,'name',group_row.name);
 end if;
 if not exists(select 1 from public.playroom_group_members where group_id=gid and user_id=me and left_at is null) then raise exception 'social:forbidden'; end if;
 if p_action='leave' then
  update public.playroom_group_members set left_at=now() where group_id=gid and user_id=me;
  if not exists(select 1 from public.playroom_group_members where group_id=gid and left_at is null) then
   update public.playroom_groups set closed_at=now() where id=gid;
   update public.playroom_group_invites set expires_at=least(expires_at,now()) where group_id=gid and accepted_at is null and declined_at is null;
  end if;
  return '{}'::jsonb;
 elsif p_action='history' then
  if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'social:invalid'; end if;
  update public.playroom_groups set show_history=(p_data->>'enabled')::boolean where id=gid;
  return jsonb_build_object('showHistory',(p_data->>'enabled')::boolean);
 elsif p_action='info' then
  return jsonb_build_object('id',group_row.id,'name',group_row.name,'createdAt',group_row.created_at,'showHistory',group_row.show_history,'members',coalesce((select jsonb_agg(jsonb_build_object('userId',p.id,'nickname',p.nickname,'username',p.username,'avatar',p.avatar,'online',coalesce(p.last_seen>now()-interval '75 seconds',false),'accepted',exists(select 1 from public.playroom_friendships f where f.accepted and (f.sender=me and f.recipient=p.id or f.recipient=me and f.sender=p.id))) order by p.nickname,p.id) from public.playroom_group_members m join public.playroom_profiles p on p.id=m.user_id where m.group_id=gid and m.left_at is null),'[]'::jsonb));
 elsif p_action='invite' then
  target_user:=(p_data->>'userId')::uuid;
  if target_user is null or target_user=me or not exists(select 1 from public.playroom_profiles where id=target_user) then raise exception 'social:forbidden'; end if;
  if exists(select 1 from public.playroom_group_members where group_id=gid and user_id=target_user and left_at is null) then return jsonb_build_object('member',true); end if;
  select * into invitation from public.playroom_group_invites where group_id=gid and target=target_user and accepted_at is null and declined_at is null and expires_at>now() order by created_at desc limit 1;
  if found then return jsonb_build_object('id',invitation.id); end if;
  if (select count(*) from public.playroom_group_invites where sender=me and created_at>now()-interval '1 minute')>=30 then raise exception 'social:rate-limit'; end if;
  insert into public.playroom_group_invites(group_id,sender,target) values(gid,me,target_user) returning * into invitation;
  insert into public.playroom_messages(sender,recipient,nonce,body,kind,group_invitation_id) values(me,target_user,invitation.id,group_row.name,'group-invitation',invitation.id);
  return jsonb_build_object('id',invitation.id);
 elsif p_action='invite-room' then
  select * into room_row from public.playroom_cloud_rooms where id=(p_data->>'roomId')::uuid for update;
  if not found or room_row.closed or room_row.host_until is null or room_row.host_until<=now() or not exists(select 1 from public.playroom_room_members where room_id=room_row.id and user_id=me) then raise exception 'social:forbidden'; end if;
  if room_row.owner_id<>me and not room_row.allow_player_invites then raise exception 'social:invite-disabled'; end if;
  if p_data->>'id' is null then raise exception 'social:invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,3));
  select * into message_row from public.playroom_group_messages where sender=me and nonce=(p_data->>'id')::uuid;
  if found then
   if message_row.group_id<>gid or message_row.room_id is distinct from room_row.id then raise exception 'social:invalid'; end if;
   return jsonb_build_object('id',message_row.id::text);
  end if;
  if (select count(*) from public.playroom_group_messages where sender=me and created_at>now()-interval '1 minute')>=30 then raise exception 'social:rate-limit'; end if;
  if (select count(*) from public.playroom_room_invites where room_id=room_row.id and not revoked and declined_at is null and used_by is null and expires_at>now())+(select count(*) from public.playroom_group_members where group_id=gid and left_at is null and user_id<>me)>100 then raise exception 'social:limit'; end if;
  insert into public.playroom_group_messages(group_id,sender,nonce,body,kind,room_id,game_name) values(gid,me,(p_data->>'id')::uuid,room_row.name,'invitation',room_row.id,room_row.game_name) returning * into message_row;
  insert into public.playroom_room_invites(room_id,target_id,token_hash,invited_by,group_message_id)
   select room_row.id,user_id,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),me,message_row.id from public.playroom_group_members where group_id=gid and left_at is null and user_id<>me;
  return jsonb_build_object('id',message_row.id::text);
 elsif p_action='seen' then
  through_id:=(p_data->>'through')::bigint;
  if not exists(select 1 from public.playroom_group_messages where id=through_id and group_id=gid and sender<>me and id>(select history_after from public.playroom_group_members where group_id=gid and user_id=me)) then raise exception 'social:invalid'; end if;
  update public.playroom_group_members set read_through=greatest(read_through,through_id) where group_id=gid and user_id=me;return '{}'::jsonb;
 elsif p_action='send' then
  body_text:=trim(p_data->>'body');
  if body_text is null or char_length(body_text) not between 1 and 2000 or p_data->>'id' is null then raise exception 'social:invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text,3));
  if exists(select 1 from public.playroom_group_messages where sender=me and nonce=(p_data->>'id')::uuid and (group_id<>gid or body<>body_text or kind<>'message')) then raise exception 'social:invalid'; end if;
  if not exists(select 1 from public.playroom_group_messages where sender=me and nonce=(p_data->>'id')::uuid) then
   if (select count(*) from public.playroom_group_messages where sender=me and created_at>now()-interval '1 minute')>=30 then raise exception 'social:rate-limit'; end if;
   insert into public.playroom_group_messages(group_id,sender,nonce,body) values(gid,me,(p_data->>'id')::uuid,body_text);
  end if;
 elsif p_action<>'read' then raise exception 'social:invalid';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'seq',m.id,'kind',m.kind,'at',m.created_at,'authorId',m.sender,'nickname',p.nickname,'avatar',p.avatar,'mine',m.sender=me,'read',exists(select 1 from public.playroom_group_members r where r.group_id=gid and r.user_id<>m.sender and r.read_through>=m.id))||case when p_data->>'after' is null or m.id>(p_data->>'after')::bigint then jsonb_build_object('body',m.body) else '{}'::jsonb end||case when m.kind='invitation' then jsonb_build_object('roomId',m.room_id,'roomOwnerId',room_view.owner_id,'roomAvailable',not room_view.closed and room_view.host_until>now(),'roomName',m.body,'gameName',m.game_name,'inviteId',ri.id,'shared',true,'state',case when m.sender=me then case when room_view.id is null or room_view.closed then 'expired' when room_view.host_until<=now() then 'offline' else 'active' end else public.playroom_invitation_state(ri.id,me) end) else '{}'::jsonb end order by m.id),'[]'::jsonb) into rows_json
 from (select * from (select * from public.playroom_group_messages where group_id=gid and id>(select history_after from public.playroom_group_members where group_id=gid and user_id=me) and (p_data->>'before' is null or id<(p_data->>'before')::bigint) and (p_data->>'after' is null or id>(p_data->>'after')::bigint)
 order by case when p_data->>'after' is not null then id end asc,id desc limit 80) fresh
 union select msg.* from public.playroom_group_messages msg join public.playroom_cloud_rooms r on r.id=msg.room_id where msg.group_id=gid and msg.kind='invitation' and not r.closed and r.host_until>now() and p_data->>'after' is null and p_data->>'before' is null and msg.id>(select history_after from public.playroom_group_members where group_id=gid and user_id=me)
 union select * from public.playroom_group_messages where group_id=gid and id>(select history_after from public.playroom_group_members where group_id=gid and user_id=me) and p_data->>'after' is not null and id<=(p_data->>'after')::bigint and id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb)))) m join public.playroom_profiles p on p.id=m.sender left join public.playroom_room_invites ri on ri.group_message_id=m.id and ri.target_id=me left join public.playroom_cloud_rooms room_view on room_view.id=m.room_id;
 return jsonb_build_object('messages',rows_json,'older',jsonb_array_length(rows_json)>=80,'through',(select read_through::text from public.playroom_group_members where group_id=gid and user_id=me),'team',null,'roomId',gid,'historyAfter',(select history_after::text from public.playroom_group_members where group_id=gid and user_id=me));
end;$$;
revoke all on function public.playroom_groups_rpc(text,jsonb) from public,anon,authenticated;

create or replace function public.playroom_online(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 me uuid:=auth.uid(); guest boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 rid uuid:=(p_data->>'roomId')::uuid;
 r public.playroom_cloud_rooms%rowtype; code text; alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; entropy bytea;
 i integer; tries integer; nick text; payload jsonb; target uuid; invitation uuid; manager boolean; after_id bigint;
begin
 if me is null then raise exception 'social:account-required'; end if;
 if p_action='room-person' then
  if guest or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then raise exception 'social:forbidden'; end if;
  select * into r from public.playroom_cloud_rooms where id=rid and not closed;if not found then raise exception 'social:not-found'; end if;
  if coalesce((p_data->>'owner')::boolean,false) then target:=r.owner_id;
  else select b.user_id into target from public.playroom_peer_bindings b join public.playroom_room_members m on m.room_id=b.room_id and m.user_id=b.user_id where b.room_id=rid and b.participant_id=p_data->>'participantId';end if;
  select jsonb_build_object('person',jsonb_build_object('userId',p.id,'id',f.id,'nickname',p.nickname,'avatar',p.avatar,'username',p.username,'online',true,'accepted',coalesce(f.accepted,false),'requested',f.id is not null,'incoming',coalesce(f.recipient=me,false))) into payload
  from public.playroom_profiles p left join public.playroom_friendships f on (f.sender=me and f.recipient=p.id) or(f.recipient=me and f.sender=p.id) where p.id=target;
  if payload is null then raise exception 'social:not-found';end if;return payload;
 end if;
 if p_action='unread' then
  if guest then raise exception 'social:account-required'; end if;
  return public.playroom_unread_rpc()||case when rid is null then '{}'::jsonb else jsonb_build_object('roomUnavailable',not exists(select 1 from public.playroom_cloud_rooms q join public.playroom_room_members m on m.room_id=q.id and m.user_id=me where q.id=rid and not q.closed)) end;
 end if;
 if left(p_action,6)='group-' then return public.playroom_groups_rpc(substr(p_action,7),p_data); end if;
 if p_action='read-messages' then
  target:=(p_data->>'userId')::uuid;
  if guest or target is null or target=me or coalesce(p_data->>'through','') !~ '^[0-9]{1,19}$' then raise exception 'social:forbidden'; end if;
  after_id:=(p_data->>'through')::bigint;
  if not exists(select 1 from public.playroom_messages where id=after_id and sender=target and recipient=me) then raise exception 'social:forbidden'; end if;
  insert into public.playroom_chat_reads(reader,peer,through_id) values(me,target,after_id)
  on conflict(reader,peer) do update set through_id=greatest(playroom_chat_reads.through_id,excluded.through_id);
  return '{}'::jsonb;
 end if;
 if p_action='inbox' then
  if guest then raise exception 'social:account-required'; end if;
  if not p_data ? 'after' then return jsonb_build_object('cursor',coalesce((select max(id) from public.playroom_messages where recipient=me),0)::text,'items','[]'::jsonb); end if;
  if p_data->>'after' is null or p_data->>'after' !~ '^[0-9]{1,19}$' then raise exception 'social:invalid'; end if;
  after_id:=(p_data->>'after')::bigint;
  return (with batch as (select * from public.playroom_messages where recipient=me and id>after_id order by id limit 30)
   select jsonb_build_object('cursor',coalesce(max(m.id),after_id)::text,'items',coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'body',m.body,'kind',m.kind,'gameName',m.game_name,'at',m.created_at,
    'invitationState',case when m.kind='invitation' then public.playroom_invitation_state(m.invitation_id,me) when m.kind='group-invitation' then (select case when gi.accepted_at is not null then 'joined' when gi.declined_at is not null then 'declined' when gi.expires_at<=now() then 'expired' else 'active' end from public.playroom_group_invites gi where gi.id=m.group_invitation_id) else null end,
    'person',jsonb_build_object('id',f.id,'userId',p.id,'nickname',p.nickname,'username',p.username,'avatar',p.avatar,'accepted',coalesce(f.accepted,false),'requested',f.id is not null,'incoming',coalesce(f.recipient=me,false),
     'online',coalesce(f.accepted and p.last_seen>now()-interval '75 seconds',false),'game',case when f.accepted and p.last_seen>now()-interval '75 seconds' then p.activity_game else null end)) order by m.id),'[]'::jsonb))
   from batch m join public.playroom_profiles p on p.id=m.sender left join public.playroom_friendships f on (f.sender=me and f.recipient=p.id) or (f.recipient=me and f.sender=p.id));
 end if;
 if p_action in ('presence','hub') then
  if guest then raise exception 'social:account-required'; end if;
  update public.playroom_profiles set last_seen=now(),
   avatar=case when p_data->>'avatar' ~ '^[a-zA-Z0-9_-]{1,64}$' then p_data->>'avatar' else null end,
   activity_game=nullif(left(trim(p_data->>'game'),80),'') where id=me;
  if p_action='presence' then return '{}'::jsonb; end if;
  payload:=public.playroom_social('list');
  return payload || jsonb_build_object('friends',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'userId',p.id,'nickname',p.nickname,'username',p.username,'accepted',f.accepted,'incoming',f.recipient=me,'avatar',p.avatar,'game',case when f.accepted and p.last_seen>now()-interval '75 seconds' then p.activity_game else null end,'online',f.accepted and coalesce(p.last_seen>now()-interval '75 seconds',false)) order by p.nickname,p.id)
   from public.playroom_friendships f join public.playroom_profiles p on p.id=case when f.sender=me then f.recipient else f.sender end where f.sender=me or f.recipient=me),'[]'::jsonb),
   'conversations',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'userId',p.id,'nickname',p.nickname,'username',p.username,'avatar',p.avatar,'accepted',coalesce(f.accepted,false),'requested',f.id is not null,'incoming',coalesce(f.recipient=me,false),'lastMessageAt',c.at,
    'game',case when f.accepted and p.last_seen>now()-interval '75 seconds' then p.activity_game else null end,'online',coalesce(f.accepted and p.last_seen>now()-interval '75 seconds',false)) order by c.at desc,p.id)
    from (select case when sender=me then recipient else sender end other,max(created_at) at from public.playroom_messages where sender=me or recipient=me group by 1) c
    join public.playroom_profiles p on p.id=c.other left join public.playroom_friendships f on (f.sender=me and f.recipient=p.id) or (f.recipient=me and f.sender=p.id)),'[]'::jsonb));
 elsif p_action in ('chat','send-message') then
  target:=(p_data->>'userId')::uuid;
  if guest or target is null or target=me or not exists(select 1 from public.playroom_profiles where id=me) or not exists(select 1 from public.playroom_profiles where id=target) then raise exception 'social:forbidden'; end if;
  if p_action='send-message' then
   nick:=trim(p_data->>'body');
   if nick is null or char_length(nick) not between 1 and 2000 or p_data->>'nonce' is null then raise exception 'social:invalid'; end if;
   -- Serialize per-sender retries/rate checks, without locking other conversations.
   perform pg_advisory_xact_lock(hashtextextended(me::text,0));
   if exists(select 1 from public.playroom_messages where sender=me and nonce=(p_data->>'nonce')::uuid and (recipient<>target or body<>nick or kind<>'message')) then raise exception 'social:invalid'; end if;
   if not exists(select 1 from public.playroom_messages where sender=me and nonce=(p_data->>'nonce')::uuid) then
    if (select count(*) from public.playroom_messages where sender=me and kind='message' and created_at>now()-interval '1 minute')>=30 then raise exception 'social:rate-limit'; end if;
    insert into public.playroom_messages(sender,recipient,nonce,body) values(me,target,(p_data->>'nonce')::uuid,nick);
   end if;
  end if;
  return jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id::text,'mine',m.sender=me,'at',m.created_at,'kind',m.kind,'read',exists(select 1 from public.playroom_chat_reads cr where cr.reader=m.recipient and cr.peer=m.sender and cr.through_id>=m.id))||case when p_data->>'after' is null or m.id>(p_data->>'after')::bigint then jsonb_build_object('body',m.body) else '{}'::jsonb end||case when m.kind='invitation' then jsonb_build_object('roomId',inv.room_id,'roomOwnerId',room_view.owner_id,'roomAvailable',not room_view.closed and room_view.host_until>now(),'inviteId',m.invitation_id,'roomName',m.body,'gameName',m.game_name,'state',public.playroom_invitation_state(m.invitation_id,m.recipient)) when m.kind='group-invitation' then jsonb_build_object('inviteId',gi.id,'groupId',gi.group_id,'groupName',gg.name,'state',case when gi.id is null then 'expired' when gi.declined_at is not null then 'declined' when gi.accepted_at is not null then 'joined' when gi.expires_at<=now() then 'expired' else 'active' end) else '{}'::jsonb end order by m.id) from
   (select * from (select * from public.playroom_messages where least(sender,recipient)=least(me,target) and greatest(sender,recipient)=greatest(me,target) and (p_data->>'before' is null or id<(p_data->>'before')::bigint) and (p_data->>'after' is null or id>(p_data->>'after')::bigint)
 order by case when p_data->>'after' is not null then id end asc,id desc limit 80) fresh
 union select msg.* from public.playroom_messages msg where least(msg.sender,msg.recipient)=least(me,target) and greatest(msg.sender,msg.recipient)=greatest(me,target) and msg.kind='invitation' and public.playroom_invitation_state(msg.invitation_id,msg.recipient)='active' and p_data->>'after' is null and p_data->>'before' is null
 union select * from public.playroom_messages where least(sender,recipient)=least(me,target) and greatest(sender,recipient)=greatest(me,target) and p_data->>'after' is not null and id<=(p_data->>'after')::bigint and id::text in(select jsonb_array_elements_text(coalesce(p_data->'known','[]'::jsonb)))) m left join public.playroom_room_invites inv on inv.id=m.invitation_id left join public.playroom_cloud_rooms room_view on room_view.id=inv.room_id left join public.playroom_group_invites gi on gi.id=m.group_invitation_id left join public.playroom_groups gg on gg.id=gi.group_id),'[]'::jsonb),'through',coalesce((select through_id::text from public.playroom_chat_reads where reader=me and peer=target),'0'));
 elsif p_action='decline-invite' then
  if guest then raise exception 'social:forbidden'; end if;
  update public.playroom_room_invites set declined_at=coalesce(declined_at,now()) where id=(p_data->>'inviteId')::uuid and target_id=me and used_by is null and group_message_id is null;
  if not found then raise exception 'social:forbidden'; end if;
  return '{}'::jsonb;
 elsif p_action='discover' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'visibility',q.visibility,'ownerName',p.nickname,'hasPassword',q.password_enabled,'available',true,'hostUntil',q.host_until)) from
   (select c.* from public.playroom_cloud_rooms c where not c.closed and c.host_until>now() and c.room_code is not null and (c.visibility='all' or c.visibility='friends' and not guest and exists(select 1 from public.playroom_friendships f where f.accepted and ((f.sender=me and f.recipient=c.owner_id) or(f.recipient=me and f.sender=c.owner_id)))) order by c.created_at desc limit 20) q join public.playroom_profiles p on p.id=q.owner_id),'[]'::jsonb);
 elsif p_action='join-password' then
  -- Count both successful and failed attempts, committing failures as a typed result.
  insert into public.playroom_join_attempts(user_id,attempts) values(me,1) on conflict(user_id) do update set
   attempts=case when public.playroom_join_attempts.window_start<now()-interval '1 minute' then 1 else public.playroom_join_attempts.attempts+1 end,
   window_start=case when public.playroom_join_attempts.window_start<now()-interval '1 minute' then now() else public.playroom_join_attempts.window_start end returning attempts into tries;
  if tries>10 then return jsonb_build_object('error','rate-limit'); end if;
  code:=upper(trim(coalesce(p_data->>'password','')));nick:=trim(p_data->>'nickname');
  if (code<>'' and code !~ '^[A-Z2-9]{6}$') or nick is null or char_length(nick) not between 1 and 24 then return jsonb_build_object('error','room-password'); end if;
  if rid is null then
   if p_data->>'roomCode' is null or p_data->>'roomCode' !~ '^\d{4}$' then return jsonb_build_object('error','room-password'); end if;
   if (select count(*) from public.playroom_cloud_rooms where room_code=p_data->>'roomCode' and not closed and host_until>now())<>1 then return jsonb_build_object('error','room-password'); end if;
   select id into rid from public.playroom_cloud_rooms where room_code=p_data->>'roomCode' and not closed and host_until>now();
  end if;
  perform public.playroom_require_online_slot(me,rid);
  select * into r from public.playroom_cloud_rooms where id=rid for update;
  if not found or r.closed or r.room_code is null or (r.password_enabled and (r.room_password is null or r.room_password<>code)) or r.host_until<=now() or r.host_until is null then return jsonb_build_object('error','room-password'); end if;
  if not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then
   if (select count(*) from public.playroom_room_members where room_id=rid)>=32 then return jsonb_build_object('error','limit'); end if;
   insert into public.playroom_room_members(room_id,user_id,nickname) values(rid,me,nick);
  end if;
  update public.playroom_room_members set active_until=now()+interval '2 minutes' where room_id=rid and user_id=me;
  return jsonb_build_object('id',rid);
 end if;
 select * into r from public.playroom_cloud_rooms where id=rid for update;
 if not found or r.closed or not exists(select 1 from public.playroom_room_members where room_id=rid and user_id=me) then raise exception 'social:forbidden'; end if;
 manager:=r.owner_id=me and not guest;
 -- A public number is reserved by the server on first invitation setup, never by the device.
 if manager and p_action='settings' and r.room_code is null then
  perform pg_advisory_xact_lock(hashtextextended('playroom:room-number',0));
  select lpad(n::text,4,'0') into code from generate_series(0,9999) n
   where not exists(select 1 from public.playroom_cloud_rooms c where not c.closed and c.room_code=lpad(n::text,4,'0'))
   order by random() limit 1;
  if code is null then raise exception 'social:limit'; end if;
  update public.playroom_cloud_rooms set room_code=code where id=rid returning * into r;
 end if;
 if manager and p_action='settings' and p_data ? 'gameName' then
  nick:=trim(p_data->>'gameName');if nick is null or char_length(nick) not between 1 and 80 then raise exception 'social:invalid'; end if;
  update public.playroom_cloud_rooms set game_name=nick where id=rid returning * into r;
 end if;
 if not manager and (not r.allow_player_invites or p_action not in ('settings','invite','revoke')) then raise exception 'social:invite-disabled'; end if;
 if p_action='invite' then
  if guest then raise exception 'social:account-required'; end if;
  target:=(p_data->>'userId')::uuid;
  if target is null or target=me or not exists(select 1 from public.playroom_profiles where id=target) then raise exception 'social:forbidden'; end if;
  -- Retry of the same directed invitation reuses the original chat card.
  perform pg_advisory_xact_lock(hashtextextended(rid::text||':'||me::text||':'||target::text,0));
  select id into invitation from public.playroom_room_invites where room_id=rid and target_id=target and invited_by=me and group_message_id is null and not revoked and declined_at is null and used_by is null and expires_at>now() order by created_at desc limit 1;
  if invitation is not null then return jsonb_build_object('id',invitation); end if;
  if (select count(*) from public.playroom_room_invites where room_id=rid and not revoked and declined_at is null and used_by is null and expires_at>now())>=100 then raise exception 'social:limit'; end if;
  insert into public.playroom_room_invites(room_id,target_id,token_hash,invited_by) values(rid,target,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),me) returning id into invitation;
  return jsonb_build_object('id',invitation);
 elsif p_action='revoke' then
  update public.playroom_room_invites set revoked=true where room_id=rid and id=(p_data->>'id')::uuid and (manager or invited_by=me);
  if not found then raise exception 'social:forbidden'; end if;
  return '{}'::jsonb;
 elsif p_action='password-enabled' then
  if not manager or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'social:forbidden'; end if;
  if r.password_enabled is distinct from (p_data->>'enabled')::boolean then
   update public.playroom_cloud_rooms set password_enabled=(p_data->>'enabled')::boolean,room_password=null where id=rid returning * into r;
  end if;
 elsif p_action='permission' then
  if not manager or jsonb_typeof(p_data->'allowPlayerInvites') is distinct from 'boolean' then raise exception 'social:forbidden'; end if;
  update public.playroom_cloud_rooms set allow_player_invites=(p_data->>'allowPlayerInvites')::boolean where id=rid returning * into r;
  if not r.allow_player_invites then
   update public.playroom_room_invites set revoked=true where room_id=rid and invited_by is not null and invited_by<>me and used_by is null;
   update public.playroom_cloud_rooms set room_password=null where id=rid returning * into r;
  end if;
 end if;
 if p_action in ('settings','rotate','permission','password-enabled') then
  if p_action='rotate' and not r.password_enabled then raise exception 'social:invalid'; end if;
  if manager and r.password_enabled and (r.room_password is null or p_action='rotate') then
   entropy:=sha256(convert_to(gen_random_uuid()::text,'UTF8'));code:='';
   for i in 0..5 loop code:=code||substr(alphabet,(get_byte(entropy,i)&31)+1,1); end loop;
   -- Rotation always invalidates the old link, even on an unlikely random collision.
   if code=r.room_password then code:=substr(alphabet,(strpos(alphabet,substr(code,1,1))%32)+1,1)||substr(code,2); end if;
   update public.playroom_cloud_rooms set room_password=code where id=rid returning * into r;
  end if;
 elsif p_action='visibility' then
  if p_data->>'visibility' is null or p_data->>'visibility' not in ('all','friends','hidden') then raise exception 'social:invalid'; end if;
  update public.playroom_cloud_rooms set visibility=p_data->>'visibility' where id=rid returning * into r;
 else raise exception 'social:invalid'; end if;
 return jsonb_build_object('id',r.id,'roomCode',r.room_code,'password',case when r.password_enabled then r.room_password else null end,'passwordEnabled',r.password_enabled,'visibility',r.visibility,'canManage',manager,'allowPlayerInvites',r.allow_player_invites,
  'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'targetId',target_id,'expiresAt',expires_at,'used',used_by is not null,'revoked',revoked,'declined',declined_at is not null)),'[]'::jsonb) from public.playroom_room_invites where room_id=rid and (manager or invited_by=me)));
end $$;
revoke all on function public.playroom_online(text,jsonb) from public,anon;
grant execute on function public.playroom_online(text,jsonb) to authenticated;
commit;

-- Internal conversation search implementation; included in owner-applied upgrades.
-- One fixed-window abuse row per account; no query text, peer IDs or history cursors.
-- Explicit Unicode casing remains correct even when the database default is C.
do $$begin
 if current_setting('server_encoding')<>'UTF8' or not exists(select 1 from pg_catalog.pg_collation where collprovider='i') then
  raise exception 'PlayRoom chat search requires UTF8 and PostgreSQL ICU support; run server/chat-search-preflight.sql before applying this upgrade';
 end if;
end$$;
create collation if not exists public.playroom_search_unicode (provider=icu,locale='und',deterministic=true);
create table if not exists public.playroom_search_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), attempts integer not null default 0
);
alter table public.playroom_search_attempts enable row level security;
revoke all on public.playroom_search_attempts from public,anon,authenticated;
create or replace function public.playroom_conversation_search(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 me uuid:=auth.uid(); target_user uuid; gid uuid; history_start bigint; boundary bigint;
 query_text text; tries integer; hits jsonb;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from public.playroom_profiles where id=me) then raise exception 'social:account-required'; end if;
 if p_action not in ('chat-search','group-search') or jsonb_typeof(p_data->'query') is distinct from 'string' then raise exception 'social:invalid'; end if;
 query_text:=btrim(p_data->>'query');
 if char_length(query_text) not between 2 and 200 then raise exception 'social:invalid'; end if;
 if p_data ? 'before' then
  if coalesce(p_data->>'before','') !~ '^[0-9]{1,19}$' or (p_data->>'before')::numeric not between 1 and 9223372036854775807 then raise exception 'social:invalid'; end if;
  boundary:=(p_data->>'before')::bigint;
 end if;
 if p_action='chat-search' then
  target_user:=(p_data->>'userId')::uuid;
  if target_user is null or target_user=me or not exists(select 1 from public.playroom_profiles where id=target_user) then raise exception 'social:forbidden'; end if;
 else
  gid:=(p_data->>'groupId')::uuid;
  select member.history_after into history_start from public.playroom_group_members member join public.playroom_groups grp on grp.id=member.group_id
   where member.group_id=gid and member.user_id=me and member.left_at is null and grp.closed_at is null;
  if not found then raise exception 'social:forbidden'; end if;
 end if;
 insert into public.playroom_search_attempts(user_id,attempts) values(me,1) on conflict(user_id) do update set
  attempts=case when public.playroom_search_attempts.window_start<now()-interval '1 minute' then 1 else least(public.playroom_search_attempts.attempts,30)+1 end,
  window_start=case when public.playroom_search_attempts.window_start<now()-interval '1 minute' then now() else public.playroom_search_attempts.window_start end returning attempts into tries;
 -- A typed result persists the abuse count, including through aggregate RPC sections.
 if tries>30 then return jsonb_build_object('error','rate-limit'); end if;
 if p_action='chat-search' then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'at',m.created_at,'mine',m.sender=me,'kind','message','body',m.body,'authorId',m.sender,'nickname',p.nickname) order by m.id desc),'[]'::jsonb) into hits
   from (select id,created_at,sender,body from public.playroom_messages where least(sender,recipient)=least(me,target_user) and greatest(sender,recipient)=greatest(me,target_user)
    and kind='message' and (boundary is null or id<boundary) and strpos(lower(body collate public.playroom_search_unicode),lower(query_text collate public.playroom_search_unicode))>0 order by id desc limit 41) m join public.playroom_profiles p on p.id=m.sender;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'at',m.created_at,'mine',m.sender=me,'kind','message','body',m.body,'authorId',m.sender,'nickname',p.nickname) order by m.id desc),'[]'::jsonb) into hits
   from (select id,created_at,sender,body from public.playroom_group_messages where group_id=gid and id>(select member.history_after from public.playroom_group_members member join public.playroom_groups grp on grp.id=member.group_id where member.group_id=gid and member.user_id=me and member.left_at is null and grp.closed_at is null)
    and kind='message' and (boundary is null or id<boundary) and strpos(lower(body collate public.playroom_search_unicode),lower(query_text collate public.playroom_search_unicode))>0 order by id desc limit 41) m join public.playroom_profiles p on p.id=m.sender;
 end if;
 return jsonb_build_object('messages',case when jsonb_array_length(hits)>40 then hits-40 else hits end,
  'hasMore',jsonb_array_length(hits)>40,'nextBefore',case when jsonb_array_length(hits)>40 then hits->39->>'id' else null end);
end;$$;
revoke all on function public.playroom_conversation_search(text,jsonb) from public,anon,authenticated;

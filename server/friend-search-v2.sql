-- Reviewed target: PlayRoom geurlwivdiqboylciqhl. SOURCE ONLY; deployment separately authorized.
-- Changes only the search branch of the existing authenticated RPC; no table/grant changes.
begin;
do $migration$
declare original text; patched text;
begin
 original:=pg_get_functiondef('public.playroom_social(text,jsonb)'::regprocedure);
 if strpos(original,$old$ elsif p_action='search' then
  handle:=lower(ltrim(trim(p_data->>'username'),'@'));
  if handle is null or handle !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'social:username-invalid'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'username',username)) from public.playroom_profiles where username=handle and id<>me),'[]'::jsonb);
$old$)>0 then
  patched:=replace(original,$old$ elsif p_action='search' then
  handle:=lower(ltrim(trim(p_data->>'username'),'@'));
  if handle is null or handle !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'social:username-invalid'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'username',username)) from public.playroom_profiles where username=handle and id<>me),'[]'::jsonb);
$old$,$new$ elsif p_action='search' then
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
$new$);
  execute patched;
 elsif strpos(original,$new$ elsif p_action='search' then
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
$new$)=0 then
  raise exception 'Unexpected playroom_social search definition; inspect before applying';
 end if;
end $migration$;
commit;

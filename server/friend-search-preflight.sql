-- Read-only preflight on the already configured PlayRoom project geurlwivdiqboylciqhl.
-- Schema/function metadata only: never return profile rows, emails, tokens or RPC body.
select current_setting('server_version') as server_version,
 md5(pg_get_functiondef(p.oid)) as social_definition_hash,
 p.prosecdef as security_definer,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute,
 strpos(pg_get_functiondef(p.oid),'friend-search-v2-opt-in')>0 as paged_search_installed,
 strpos(pg_get_functiondef(p.oid),'where username=handle and id<>me')>0 as expected_exact_search_branch,
 (select count(*) from information_schema.columns c where c.table_schema='public' and c.table_name='playroom_profiles' and c.column_name in ('id','nickname','username'))=3 and exists(select 1 from information_schema.columns c where c.table_schema='auth' and c.table_name='users' and c.column_name='is_anonymous') as public_search_schema_ready
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='playroom_social' and pg_get_function_identity_arguments(p.oid)='p_action text, p_data jsonb';

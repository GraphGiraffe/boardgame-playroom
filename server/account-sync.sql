-- One authenticated account roundtrip, preserving the existing RPC/cursor contracts.
begin;
create or replace function public.playroom_account_sync(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; value jsonb; replies jsonb:='[]'::jsonb; code text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'social:account-required'; end if;
 if p_action<>'sync' or jsonb_typeof(p_data->'requests') is distinct from 'array' or jsonb_array_length(p_data->'requests') not between 1 and 32 or octet_length(p_data::text)>65536 then raise exception 'social:invalid'; end if;
 for item in select * from jsonb_array_elements(p_data->'requests') loop
  begin
   if coalesce(item->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$' or jsonb_typeof(item->'data') is distinct from 'object' then raise exception 'social:invalid'; end if;
   if item->>'rpc'='playroom_social' and item->>'action'='list' then value:=public.playroom_social('list',item->'data');
   elsif item->>'rpc'='playroom_online' and item->>'action' in ('unread','inbox','group-inbox','hub','group-list','group-info','chat','group-read','chat-search','group-search','settings','presence','discover','room-preview') then value:=public.playroom_online(item->>'action',item->'data');
   elsif item->>'rpc'='playroom_cloud_saves_rpc' and item->>'action'='list' then value:=public.playroom_cloud_saves_rpc('list',item->'data');
   elsif item->>'rpc'='playroom_push' and item->>'action'='config' then value:=public.playroom_push('config',item->'data');
   else raise exception 'social:invalid'; end if;
   if item->>'rpc'='playroom_online' and item->>'action' in ('chat-search','group-search') and value->>'error'='rate-limit' then
    replies:=replies||jsonb_build_array(jsonb_build_object('id',item->>'id','error',jsonb_build_object('code','rate-limit')));continue;
   end if;
   replies:=replies||jsonb_build_array(jsonb_build_object('id',item->>'id','data',value));
  exception when others then
   code:=case when sqlerrm like 'social:%' then substr(sqlerrm,8) when sqlstate in ('42P01','42703','42883') then 'setup' else 'request' end;
   replies:=replies||jsonb_build_array(jsonb_build_object('id',item->>'id','error',jsonb_build_object('code',code,'serverCode',sqlstate)));
  end;
 end loop;
 return jsonb_build_object('results',replies);
end;
$$;
revoke all on function public.playroom_account_sync(text,jsonb) from public,anon,authenticated;
grant execute on function public.playroom_account_sync(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

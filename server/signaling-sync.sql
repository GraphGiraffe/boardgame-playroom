-- Additive candidate. Apply after signaling.sql; does not change existing grants.
-- One host poll renews its lease and validates all connected RTC memberships.
begin;
create or replace function public.playroom_signal_sync(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 signals jsonb; peers jsonb; rid uuid; n integer;
begin
 if auth.uid() is null then raise exception 'social:account-required' using errcode='42501'; end if;
 if p_action is distinct from 'poll-host' then return public.playroom_signal(p_action,p_data); end if;
 if jsonb_typeof(p_data->'peers') is distinct from 'array' or (octet_length((p_data-'summary')::text)>16384 or octet_length(p_data::text)>32768) then raise exception 'social:invalid'; end if;
 n:=jsonb_array_length(p_data->'peers');if n>32 then raise exception 'social:invalid'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'peers') p where jsonb_typeof(p)<>'object'
  or (select count(*) from jsonb_object_keys(p))<>3 or not(p ?& array['id','userId','participantId'])
  or coalesce(p->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or coalesce(p->>'userId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  or coalesce(p->>'participantId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
  or (select count(distinct p->>'id') from jsonb_array_elements(p_data->'peers') p)<>n then raise exception 'social:invalid'; end if;
 -- Canonical poll owns auth, owner/epoch checks, SDP expiration and room lease.
 signals:=public.playroom_signal('poll-host',p_data);rid:=(p_data->>'roomId')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'allowed',coalesce(m.user_id is not null and b.participant_id=p."participantId",false)) order by p.id),'[]'::jsonb) into peers
 from jsonb_to_recordset(p_data->'peers') as p(id uuid,"userId" uuid,"participantId" text)
 left join public.playroom_peer_bindings b on b.room_id=rid and b.user_id=p."userId" and b.participant_id=p."participantId"
 left join public.playroom_room_members m on m.room_id=rid and m.user_id=p."userId";
 update public.playroom_room_members m set active_until=now()+interval '2 minutes'
 from jsonb_to_recordset(p_data->'peers') as p(id uuid,"userId" uuid,"participantId" text), public.playroom_peer_bindings b
 where m.room_id=rid and m.user_id=p."userId" and b.room_id=rid and b.user_id=m.user_id and b.participant_id=p."participantId"
 and (m.active_until is null or m.active_until<now()+interval '1 minute');
 return jsonb_build_object('contract',1,'signals',signals,'peers',peers);
end $$;
revoke all on function public.playroom_signal_sync(text,jsonb) from public,anon;
grant execute on function public.playroom_signal_sync(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- 0.21 planned host transfer Push. Apply AFTER push-read-receipts.sql and host-transfer.sql.
-- Only public room/transfer identities and outcome text; no party archive, secrets or SDP.
begin;
create or replace function public.playroom_push_host_transfer() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.playroom_cloud_rooms%rowtype; receiver uuid; desired_receiver uuid; activity text; caption text; event text;
begin
 if not exists(select 1 from public.playroom_push_config where singleton and enabled) then return new;end if;
 select * into r from public.playroom_cloud_rooms where id=new.room_id and not closed;if not found then return new;end if;
 if tg_op='UPDATE' and new.state=old.state then return new;end if;
 if new.state='offered' then activity:='host-transfer-offer';caption:='Предложение принять роль хоста';desired_receiver:=new.target;
 elsif new.state='accepted' then activity:='host-transfer-accepted';caption:='Передача роли хоста принята';desired_receiver:=new.source;
 elsif new.state='cancelled' and auth.uid()=new.target then activity:='host-transfer-declined';caption:='Передача роли хоста отклонена';desired_receiver:=new.source;
 elsif new.state='committed' then activity:='host-transfer-complete';caption:='Роль хоста передана';
 else return new;end if;
 event:=activity||':'||new.id;
 for receiver in select user_id from public.playroom_room_members where room_id=r.id and ((new.state='committed' and user_id in(new.source,new.target)) or (new.state<>'committed' and user_id=desired_receiver)) loop
  perform public.playroom_push_enqueue(receiver,event,'host-transfer',new.id::text,'room',r.id,r.name,caption,least(new.expires_at,now()+interval '5 minutes'));
 end loop;
 update public.playroom_push_deliveries set payload=payload||jsonb_build_object('activity',activity,'transferId',new.id) where event_key=event;
 return new;
end;$$;
revoke all on function public.playroom_push_host_transfer() from public,anon,authenticated;
drop trigger if exists playroom_push_host_transfer on public.playroom_host_transfers;
create trigger playroom_push_host_transfer after insert or update of state on public.playroom_host_transfers for each row execute function public.playroom_push_host_transfer();
create or replace function public.playroom_push_host_pending(d public.playroom_push_deliveries,who uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select d.expires_at>now() and exists(select 1 from public.playroom_host_transfers t join public.playroom_cloud_rooms r on r.id=t.room_id join public.playroom_room_members m on m.room_id=r.id and m.user_id=who where t.id=d.ref::uuid and not r.closed and case d.payload->>'activity'
  when 'host-transfer-offer' then t.target=who and t.state='offered' and t.expires_at>now()
  when 'host-transfer-accepted' then t.source=who and t.state in ('accepted','ready') and t.expires_at>now()
  when 'host-transfer-declined' then t.source=who and t.state='cancelled'
  when 'host-transfer-complete' then who in(t.source,t.target) and t.state='committed'
  else false end);
$$;
revoke all on function public.playroom_push_host_pending(public.playroom_push_deliveries,uuid) from public,anon,authenticated;
commit;

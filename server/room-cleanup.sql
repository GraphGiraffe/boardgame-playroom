-- Apply after all Online room/signaling/transfer/push migrations.
-- Keep room/invitation tombstones and chat/history; remove only transient capabilities.
begin;
create or replace function public.playroom_cleanup_closed_room() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 new.host_until:=null;new.host_epoch:=null;
 update public.playroom_room_invites set revoked=true,expires_at=least(expires_at,now()) where room_id=new.id;
 delete from public.playroom_push_deliveries d where
  (d.payload->>'type'='room' and d.payload->>'id'=new.id::text)
  or (d.kind in ('invitation','invite-accepted') and exists(select 1 from public.playroom_room_invites i where i.room_id=new.id and i.id::text=d.ref))
  or (d.kind='group' and exists(select 1 from public.playroom_group_messages m where m.room_id=new.id and m.id::text=d.ref));
 delete from public.playroom_signals where room_id=new.id;
 delete from public.playroom_peer_bindings where room_id=new.id;
 delete from public.playroom_room_members where room_id=new.id;
 delete from public.playroom_host_transfers where room_id=new.id;
 delete from public.playroom_push_games where room_id=new.id;
 delete from public.playroom_push_room_events where room_id=new.id;
 return new;
end;$$;
revoke all on function public.playroom_cleanup_closed_room() from public,anon,authenticated;
drop trigger if exists playroom_room_closed_cleanup on public.playroom_cloud_rooms;
create trigger playroom_room_closed_cleanup before update of closed on public.playroom_cloud_rooms
 for each row when (new.closed) execute function public.playroom_cleanup_closed_room();
commit;

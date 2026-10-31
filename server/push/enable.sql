-- Optional delivery wiring. Apply after push.sql and deploying the Edge Function.
-- First add playroom_push_url and playroom_push_secret in Supabase Vault.
-- The secret must match PLAYROOM_PUSH_SECRET in the Edge Function environment.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create or replace function public.playroom_push_wake() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare target text; secret text;
begin
 if not exists(select 1 from public.playroom_push_config where enabled) or not exists(select 1 from public.playroom_push_deliveries where available_at<=now()) then return; end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='playroom_push_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name='playroom_push_secret' limit 1;
 if target is null or secret is null then return; end if;
 perform net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','x-playroom-push-secret',secret),body:='{"wake":true}'::jsonb,timeout_milliseconds:=10000);
end;$$;
revoke all on function public.playroom_push_wake() from public,anon,authenticated;
create or replace function public.playroom_push_wake_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.playroom_push_wake();return null;
exception when others then
 raise warning 'PlayRoom Push wake failed; delivery remains queued';return null;
end;$$;
revoke all on function public.playroom_push_wake_trigger() from public,anon,authenticated;
drop trigger if exists playroom_push_wake on public.playroom_push_deliveries;
create trigger playroom_push_wake after insert on public.playroom_push_deliveries for each statement execute function public.playroom_push_wake_trigger();
-- Immediate asynchronous wake-up plus a minute retry sweep; no client needs to remain open.
select cron.schedule('playroom-push-retry','* * * * *','select public.playroom_push_wake();');

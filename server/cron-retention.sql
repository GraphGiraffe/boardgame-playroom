-- Apply in the PlayRoom project with pg_cron enabled.
-- Completed run history only; jobs and unfinished runs are preserved.
begin;
create or replace function public.playroom_prune_cron_history() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare affected integer;
begin
 delete from cron.job_run_details
  where end_time<now()-interval '7 days' and status in ('succeeded','failed');
 get diagnostics affected=row_count;
 return affected;
end;$$;
revoke all on function public.playroom_prune_cron_history() from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('playroom-cron-history-prune','37 3 * * *','select public.playroom_prune_cron_history();');
 end if;
end$$;
commit;

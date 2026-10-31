-- PlayRoom 0.20, stage 1. Apply in its OWN Supabase project, SQL Editor.
-- No game positions, hands, resume tokens or auth passwords are stored here.
begin;
create table if not exists public.playroom_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 24),
  created_at timestamptz not null default now()
);
alter table public.playroom_profiles enable row level security;
revoke all on public.playroom_profiles from anon, authenticated;
grant select, insert on public.playroom_profiles to authenticated;
grant update(nickname) on public.playroom_profiles to authenticated;
drop policy if exists playroom_profile_read on public.playroom_profiles;
create policy playroom_profile_read on public.playroom_profiles for select to authenticated
  using (id = (select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists playroom_profile_insert on public.playroom_profiles;
create policy playroom_profile_insert on public.playroom_profiles for insert to authenticated
  with check (id = (select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
drop policy if exists playroom_profile_update on public.playroom_profiles;
create policy playroom_profile_update on public.playroom_profiles for update to authenticated
  using (id = (select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
  with check (id = (select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
comment on table public.playroom_profiles is 'Private account profile; friend visibility is introduced by a separate migration.';
commit;

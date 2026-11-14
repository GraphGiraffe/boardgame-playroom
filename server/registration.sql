-- Registration display metadata only. Existing accounts and old clients are preserved.
begin;
create or replace function public.playroom_signup_name_available(p_username text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(lower(trim(p_username)) ~ '^[a-z][a-z0-9_]{2,23}$',false)
 and not exists(select 1 from public.playroom_profiles where username is not null and lower(username)=lower(trim(p_username)));
$$;
revoke all on function public.playroom_signup_name_available(text) from public;
grant execute on function public.playroom_signup_name_available(text) to anon,authenticated;

create or replace function public.playroom_register_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare handle text;
begin
 -- Metadata supplies a display name, never an authorization role or account id.
 if coalesce(new.is_anonymous,false) or not (coalesce(new.raw_user_meta_data,'{}'::jsonb) ? 'username') then return new; end if;
 handle:=lower(trim(new.raw_user_meta_data->>'username'));
 if handle is null or handle !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'signup:username-invalid' using errcode='22023'; end if;
 -- Same transaction as auth.users: a collision rolls back account creation.
 insert into public.playroom_profiles(id,nickname,username) values(new.id,handle,handle);
 return new;
end;
$$;
revoke all on function public.playroom_register_account() from public,anon,authenticated;
drop trigger if exists playroom_register_account on auth.users;
create trigger playroom_register_account after insert on auth.users for each row execute function public.playroom_register_account();
notify pgrst,'reload schema';
commit;

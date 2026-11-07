-- Google / Apple sign-in: give a first-time OAuth user a household.
--
-- Email sign-up creates the household in handle_new_user(), keyed off
-- raw_user_meta_data.bootstrap_family. signInWithOAuth cannot pass user
-- metadata, so OAuth users arrive with no family_members row. The client calls
-- this RPC when its own membership lookup comes back empty.
--
-- Guards (the caller can only ever bootstrap itself):
--   * auth.uid() is the only identity used; no caller-supplied ids.
--   * Only accounts linked to google/apple (raw_app_meta_data.providers, which
--     clients cannot write). Email-only users removed from a household and PIN
--     members (internal @pin.bucketmymoney.internal addresses) get nothing.
--   * Idempotent: an existing membership is returned untouched.
--   * The auth.users row is locked so concurrent calls create one household.
create or replace function public.bootstrap_oauth_household()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  u record;
  member_id uuid;
  new_family_id uuid;
  full_name text;
  first_name text;
  email_local_part text;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select id into member_id from public.family_members where user_id = uid;
  if found then
    return member_id;
  end if;

  select email, raw_app_meta_data, raw_user_meta_data
    into u
    from auth.users
   where id = uid
     for update;

  -- Serialized on the user row: re-check now that we hold the lock.
  select id into member_id from public.family_members where user_id = uid;
  if found then
    return member_id;
  end if;

  if not coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)
         ?| array['google', 'apple']
     or coalesce(u.email, '') = ''
     or u.email like '%@pin.bucketmymoney.internal' then
    raise exception 'OAuth account required' using errcode = '42501';
  end if;

  email_local_part := split_part(u.email, '@', 1);
  full_name := nullif(btrim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )), '');
  first_name := nullif(split_part(coalesce(full_name, ''), ' ', 1), '');

  insert into public.families (name, join_code)
  values (
    coalesce(first_name, nullif(email_local_part, ''), 'New') || '''s Family',
    public.generate_join_code()
  )
  returning id into new_family_id;

  insert into public.family_members (family_id, user_id, name, role, is_account_owner)
  values (
    new_family_id,
    uid,
    coalesce(full_name, nullif(email_local_part, ''), 'Admin'),
    'admin',
    true
  )
  returning id into member_id;

  return member_id;
end;
$$;

revoke all on function public.bootstrap_oauth_household() from public, anon;
grant execute on function public.bootstrap_oauth_household() to authenticated, service_role;

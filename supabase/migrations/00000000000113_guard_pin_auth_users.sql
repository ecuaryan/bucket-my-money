-- =====================================================================
-- PIN-only auth users: only the server may change their password or email
-- =====================================================================
--
-- A PIN-only member signs in through pin-login / webauthn-login, which mint a
-- session with a server-derived password (supabase/functions/_shared/session.ts).
-- GoTrue also lets ANY session holder call updateUser({ password }) on their
-- own account. Someone holding a PIN member's session for a moment (an unlocked
-- shared phone) could set a password and then sign in as that member from any
-- device with `<member id>@pin.bucketmymoney.internal` — no PIN, no lockout, no
-- join code. updateUser({ email }) would likewise start moving the account to
-- an address they control.
--
-- GoTrue writes both the user path and the admin API through the same database
-- role, so the trigger cannot tell them apart by caller. Instead the Edge
-- Functions that legitimately set a PIN-only password (session.ts lazy heal,
-- set-pin rotation) first take a single-use, short-lived ticket via
-- allow_pin_password_set (service role only). Without a ticket the update fails.
-- Email changes on PIN-only users have no legitimate client path and are always
-- refused (a future data migration can disable the trigger around itself).
-- =====================================================================

create table if not exists public.pin_password_set_tickets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.pin_password_set_tickets enable row level security;
-- No policies: service role and the security-definer functions below only.
revoke all on table public.pin_password_set_tickets from anon, authenticated;

create or replace function public.allow_pin_password_set(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.pin_password_set_tickets (user_id, expires_at)
  values (p_user_id, now() + interval '60 seconds')
  on conflict (user_id) do update set expires_at = excluded.expires_at;
$$;

revoke all on function public.allow_pin_password_set(uuid) from public;
revoke all on function public.allow_pin_password_set(uuid) from anon;
revoke all on function public.allow_pin_password_set(uuid) from authenticated;
grant execute on function public.allow_pin_password_set(uuid) to service_role;

create or replace function public.guard_pin_auth_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket_ok boolean;
begin
  if coalesce(old.email, '') not like '%@pin.bucketmymoney.internal' then
    return new;
  end if;

  if new.email is distinct from old.email
     or (
       coalesce(new.email_change, '') <> coalesce(old.email_change, '')
       and coalesce(new.email_change, '') <> ''
     )
  then
    raise exception 'PIN sign-in accounts cannot change email'
      using errcode = '42501';
  end if;

  if new.encrypted_password is distinct from old.encrypted_password then
    delete from public.pin_password_set_tickets
     where user_id = old.id
       and expires_at > now()
    returning true into v_ticket_ok;
    if v_ticket_ok is not true then
      raise exception 'PIN sign-in accounts cannot set a password'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_pin_auth_user_update() from public;
revoke all on function public.guard_pin_auth_user_update() from anon;
revoke all on function public.guard_pin_auth_user_update() from authenticated;

drop trigger if exists guard_pin_auth_user_update on auth.users;
create trigger guard_pin_auth_user_update
  before update on auth.users
  for each row execute function public.guard_pin_auth_user_update();

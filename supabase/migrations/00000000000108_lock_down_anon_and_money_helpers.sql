-- =====================================================================
-- Lock down internal money helpers and the signed-out ("anon") surface
-- (multi-household readiness review, 2026-10-23).
--
-- 1) _auto_organize_apply_line / _auto_organize_sweep_line are SECURITY DEFINER
--    helpers that trust every argument (family, owner, bucket, amount) and never
--    look at who is calling. They were EXECUTE-granted to anon and authenticated
--    by Supabase's default function privileges, so a caller who knew a bucket's
--    id and its family/owner ids could mint money (verified: one anon call added
--    $250,000 and wrote a forged transaction row). They are only ever called by
--    run_auto_organize / run_due_auto_organizes, which are SECURITY DEFINER and
--    keep working: a definer function runs with its owner's privileges.
--
-- 2) The signed-out role only needs three RPCs (the login screen). It also held
--    table-level privileges on nearly every table and EXECUTE on money RPCs;
--    row-level security happened to return nothing, but isolation depended on one
--    identity check. Now: no table privileges, and EXECUTE only on the
--    allow-list below. member_child_give_net(uuid) (a child's net give balance,
--    readable with just a member id from the roster) is no longer reachable.
--
-- 3) Future objects: new tables/functions no longer auto-grant to anon, which is
--    how this class of bug recurs. Intended anon RPCs must be granted explicitly
--    (and added to the allow-list test, tests/db/anon_surface.test.ts).
-- =====================================================================

-- 1) internal helpers: service-role / definer callers only
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('_auto_organize_apply_line', '_auto_organize_sweep_line')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- 2a) signed-out role: no table access at all
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2b) signed-out role: EXECUTE only on the login-screen RPCs
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not in ('login_roster', 'login_webauthn_options', 'member_login_methods')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke all on function %s from anon', r.sig);
  end loop;
end $$;

-- 3) future tables / functions / sequences are not auto-granted to anon
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Introspection for the guardrail test (service role only): what can anon reach?
create or replace function public.anon_exposed_surface()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'functions', coalesce((
      select jsonb_agg(p.proname order by p.proname)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prokind = 'f'
         -- trigger functions cannot be invoked as an RPC ("can only be called as
         -- a trigger"), so they are not part of the callable surface
         and p.prorettype <> 'pg_catalog.trigger'::regtype
         and has_function_privilege('anon', p.oid, 'execute')
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(c.relname order by c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'v', 'm', 'p', 'f')
         and has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.anon_exposed_surface() from public, anon, authenticated;
grant execute on function public.anon_exposed_surface() to service_role;

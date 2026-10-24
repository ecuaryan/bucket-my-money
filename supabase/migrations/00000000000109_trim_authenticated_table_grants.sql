-- =====================================================================
-- Trim table privileges the signed-in role never needs (defense in depth).
--
-- Row-level security already decides what a signed-in user can read and
-- write; none of this changes what the app can do. But Supabase grants every
-- table to `authenticated` with ALL privileges by default, so safety leaned on
-- RLS alone, and the privileges below sidestep it or would silently matter the
-- day someone adds a permissive policy by mistake:
--
-- 1) TRUNCATE ignores row-level security entirely. Nothing in the app (and no
--    PostgREST endpoint) can issue it, so nobody needs it.
-- 2) DELETE on tables that have no DELETE policy (the money ledger among them):
--    RLS already blocks it. Revoking the privilege makes that two layers.
-- 3) The transactions_client view is read-only (the app only SELECTs from it;
--    writes go through the money RPCs).
-- 4) New tables should not start out with TRUNCATE for signed-in users.
--
-- service_role (Edge Functions, definer RPCs run as owner) is untouched.
-- =====================================================================

-- 1) TRUNCATE: no client role
revoke truncate on all tables in schema public from anon, authenticated;

-- 2) DELETE only where a DELETE (or ALL) policy exists to scope it
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, 'delete')
       and not exists (
         select 1
           from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
            and p.cmd in ('DELETE', 'ALL')
       )
  loop
    execute format('revoke delete on public.%I from authenticated', r.relname);
  end loop;
end $$;

-- 3) the client view is read-only
revoke all on public.transactions_client from anon, authenticated;
grant select on public.transactions_client to authenticated;

-- 4) future tables: no TRUNCATE for client roles
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- Introspection for the guardrail test (service role only): any client-role
-- privilege this migration removed that has crept back?
create or replace function public.client_extra_privileges()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'truncate', coalesce((
      select jsonb_agg(c.relname order by c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p', 'v', 'm')
         and (has_table_privilege('authenticated', c.oid, 'truncate')
              or has_table_privilege('anon', c.oid, 'truncate'))
    ), '[]'::jsonb),
    'delete_without_policy', coalesce((
      select jsonb_agg(c.relname order by c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and has_table_privilege('authenticated', c.oid, 'delete')
         and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and p.cmd in ('DELETE', 'ALL'))
    ), '[]'::jsonb),
    'view_writes', coalesce((
      select jsonb_agg(c.relname order by c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('v', 'm')
         and (has_table_privilege('authenticated', c.oid, 'insert')
              or has_table_privilege('authenticated', c.oid, 'update')
              or has_table_privilege('authenticated', c.oid, 'delete'))
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.client_extra_privileges() from public, anon, authenticated;
grant execute on function public.client_extra_privileges() to service_role;

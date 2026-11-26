-- =====================================================================
-- Client error reports (docs/MAINTENANCE.md § Error reports).
--
-- The app reports its own crashes (uncaught errors, unhandled promise
-- rejections, render errors) through report_client_error. A daily workflow
-- (error-report.yml) posts what's new to one GitHub issue, so problems people
-- hit become fixes.
--
-- Private by design:
--   * Anonymous: no user, member or household id is stored, and the RPC runs
--     as anon even for signed-in people (the client sends no session).
--   * Scrubbed here, whatever the client sends: digits, emails, ids and
--     anything in double or curly quotes are replaced before storage, so an
--     amount or a name can't land in a report.
--   * Bounded: one row per (day, error) with a count, at most 200 rows a day,
--     kept 30 days.
-- =====================================================================

create table public.client_errors (
  id          bigint generated always as identity primary key,
  day         date        not null default (now() at time zone 'utc')::date,
  fingerprint text        not null,
  kind        text        not null check (kind in ('error', 'rejection', 'render')),
  message     text        not null,
  stack       text,
  route       text,
  app_version text,
  browser     text,
  count       integer     not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (day, fingerprint)
);

-- No client reads or writes it directly; only the definer RPC below and the
-- service role (the daily workflow).
alter table public.client_errors enable row level security;
revoke all on table public.client_errors from public, anon, authenticated;
grant all on table public.client_errors to service_role;

-- _scrub_client_error_text(text, scrub_digits): what may be stored. Ids,
-- emails and quoted text always go; digits too, except in stacks (whose line
-- and column numbers locate the code).
create or replace function public._scrub_client_error_text(p_text text, p_scrub_digits boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := p_text;
begin
  if v is null then
    return null;
  end if;
  v := regexp_replace(v, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', '<email>', 'g');
  v := regexp_replace(v, '"[^"]*"|“[^”]*”|‘[^’]*’', '"…"', 'g');
  if p_scrub_digits then
    v := regexp_replace(v, '[0-9]+([.,][0-9]+)*', '#', 'g');
  end if;
  return v;
end;
$$;

revoke all on function public._scrub_client_error_text(text, boolean) from public, anon, authenticated;

-- _scrub_client_error_stack(stack, message): a stack keeps its frames' line and
-- column numbers (they locate the code) and nothing else with digits. Chrome
-- repeats the message as the first line, so that copy is replaced first.
create or replace function public._scrub_client_error_stack(p_stack text, p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
           case when line ~ ':[0-9]+:[0-9]+\)?[[:space:]]*$'
                then public._scrub_client_error_text(line, false)
                else public._scrub_client_error_text(line, true)
           end,
           E'\n' order by n)
    from regexp_split_to_table(
           -- Only a message long enough to be that copy (a short one like "x"
           -- would mangle the frames); the per-line scrub covers the rest.
           case when char_length(btrim(p_message)) >= 8
                then replace(p_stack, btrim(p_message), '<message>')
                else p_stack
           end,
           E'\n'
         ) with ordinality as t(line, n)
$$;

revoke all on function public._scrub_client_error_stack(text, text) from public, anon, authenticated;

-- report_client_error(kind, message, stack, route, app_version, browser)
-- Never raises for bad input: a report that can't be stored is dropped.
create or replace function public.report_client_error(
  p_kind        text,
  p_message     text,
  p_stack       text default null,
  p_route       text default null,
  p_app_version text default null,
  p_browser     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day         date := (now() at time zone 'utc')::date;
  v_message     text;
  v_stack       text;
  v_route       text;
  v_fingerprint text;
begin
  if p_kind not in ('error', 'rejection', 'render') or nullif(btrim(coalesce(p_message, '')), '') is null then
    return;
  end if;

  -- Cut the raw input first, so an oversized request costs no regex work.
  v_message := left(public._scrub_client_error_text(btrim(left(p_message, 1000)), true), 300);
  v_stack := left(public._scrub_client_error_stack(left(p_stack, 8000), left(p_message, 1000)), 4000);
  -- Routes are fixed paths (no ids or codes in them); anything else is "other".
  v_route := case when left(p_route, 200) ~ '^/[a-z/-]*$' then left(p_route, 120) else 'other' end;
  -- Same error, same place: the message plus the first stack frame.
  v_fingerprint := md5(p_kind || '|' || v_message || '|' ||
                       coalesce(substring(v_stack from '[^\n]*:[0-9]+:[0-9]+[^\n]*'), ''));

  update public.client_errors
     set count = least(count + 1, 1000000), last_seen = now()
   where day = v_day and fingerprint = v_fingerprint;
  if found then
    return;
  end if;

  if (select count(*) from public.client_errors where day = v_day) >= 200 then
    return;
  end if;

  insert into public.client_errors (day, fingerprint, kind, message, stack, route, app_version, browser)
  values (
    v_day, v_fingerprint, p_kind, v_message, v_stack, v_route,
    left(regexp_replace(coalesce(p_app_version, ''), '[^0-9A-Za-z.+-]', '', 'g'), 40),
    left(public._scrub_client_error_text(p_browser, false), 60)
  )
  on conflict (day, fingerprint) do update
    set count = least(public.client_errors.count + 1, 1000000), last_seen = now();
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated, service_role;

-- Keep 30 days.
create or replace function public.cleanup_client_errors()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.client_errors where day < (now() at time zone 'utc')::date - 30;
$$;

revoke all on function public.cleanup_client_errors() from public, anon, authenticated;

select cron.schedule(
  'client-errors-cleanup',
  '15 3 * * *',
  $$ select public.cleanup_client_errors(); $$
);

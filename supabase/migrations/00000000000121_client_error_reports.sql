-- =====================================================================
-- Client error reports (docs/MAINTENANCE.md § Error reports).
--
-- The app reports its own crashes (uncaught errors, unhandled promise
-- rejections, render errors) through report_client_error, so problems people
-- hit become fixes. The owner reads them in the Supabase dashboard (table
-- client_errors); a daily workflow posts only the counts to GitHub.
--
-- Private by design:
--   * Anonymous: no user, member or household id, and only the day (no time)
--     is stored. The client calls as anon with no session.
--   * Scrubbed here, whatever the client sends: numbers (stack frames keep
--     their line:col), emails, ids, long tokens, URL user names, quoted text
--     and `=(...)` values are replaced before storage.
--   * Bounded: 30 reports an hour per address (the pre-auth limiter), one row
--     per error per day with a count, at most 200 rows a day, kept 30 days.
--   * Nothing a reporter sends is ever published.
-- =====================================================================

create table public.client_errors (
  id          bigint generated always as identity primary key,
  day         date    not null default (now() at time zone 'utc')::date,
  fingerprint text    not null,
  kind        text    not null check (kind in ('error', 'rejection', 'render')),
  count       integer not null default 1,
  message     text    not null,
  route       text,
  app_version text,
  browser     text,
  stack       text,
  unique (day, fingerprint)
);

-- No client reads or writes it directly; only the definer RPC below and the
-- service role.
alter table public.client_errors enable row level security;
revoke all on table public.client_errors from public, anon, authenticated;
grant all on table public.client_errors to service_role;

-- 30 reports an hour per address; one session sends at most 10.
insert into public.rate_limit_rules (endpoint, max_hits, window_seconds)
values ('client_error', 30, 3600);

-- _scrub_client_error_text(text, scrub_digits): what may be stored.
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
  -- Control characters 1-8 mark work in progress below; none may come in.
  v := regexp_replace(v, '[\x01-\x08]', '', 'g');
  v := regexp_replace(v, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v := regexp_replace(v, '://[^/@[:space:]]+@', '://', 'g');
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', '<email>', 'g');
  -- Keys, tokens, JWTs and other long codes.
  v := regexp_replace(v, '[A-Za-z0-9_-]{32,}(\.[A-Za-z0-9_-]+)*', '<token>', 'g');
  -- Quoted text goes, replaced by a marker (\x05) so its own quotes can't pair
  -- with anything later. Single quotes: a lone code identifier stays
  -- ("reading 'id'"). So that no quote pairs with the wrong partner,
  -- apostrophes inside words ("it's", \x04) and identifiers' quotes
  -- (\x02, \x03) are parked first and put back last.
  v := regexp_replace(v, '"[^"]*"|“[^”]*”|‘[^’]*’', E'\x05', 'g');
  v := regexp_replace(v, '([[:alnum:]])''([[:alpha:]])', E'\\1\x04\\2', 'g');
  v := regexp_replace(v, '''([A-Za-z_$][A-Za-z0-9_$.]{0,23})''', E'\x02\\1\x03', 'g');
  v := regexp_replace(v, '''[^'']*''', E'\x05', 'g');
  -- A quote left open (text cut short) loses everything after it.
  v := regexp_replace(v, '[''"“‘][^''"“‘]*$', E'\x05');
  v := regexp_replace(v, '=\([^)]*\)', '=(…)', 'g');
  if p_scrub_digits then
    -- Except React's production error codes ("error #418", "/errors/418").
    v := regexp_replace(v, '(?<![0-9])(?<!error #)(?<!/errors/)[0-9]+([.,][0-9]+)*', '#', 'g');
  end if;
  v := translate(v, E'\x02\x03\x04', '''''''');
  v := replace(v, E'\x05', '"…"');
  return v;
end;
$$;

revoke all on function public._scrub_client_error_text(text, boolean) from public, anon, authenticated;

-- _scrub_client_error_stack(stack, message): stack frames ("at f (url:1:2)",
-- "f@url:1:2") keep their line and column, which locate the code; every other
-- line is scrubbed like a message. Chrome repeats the message as line one.
create or replace function public._scrub_client_error_stack(p_stack text, p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
           case when line ~ '^[[:space:]]*at [^[:space:]].*:[0-9]+:[0-9]+\)?[[:space:]]*$'
                  or line ~ '^[^[:space:]]*@[^[:space:]]+:[0-9]+:[0-9]+[[:space:]]*$'
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
-- Never raises: a report that is invalid, over a limit, or can't be stored is
-- dropped.
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
  v_frame       text;
  v_route       text;
  v_fingerprint text;
begin
  if p_kind is null or p_kind not in ('error', 'rejection', 'render')
     or nullif(btrim(coalesce(p_message, '')), '') is null then
    return;
  end if;

  begin
    if not public.check_pre_auth_rate_limit(
      'client_error',
      public.pre_auth_client_ip(coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb))
    ) then
      return;
    end if;
  exception when others then
    return;
  end;

  -- Cut every input first, so an oversized request costs no regex work.
  v_message := left(public._scrub_client_error_text(btrim(left(p_message, 1000)), true), 300);
  v_stack := left(public._scrub_client_error_stack(left(p_stack, 8000), left(p_message, 1000)), 4000);
  -- Routes are fixed paths (no ids or codes in them); anything else is "other".
  v_route := case when left(p_route, 200) ~ '^/[a-z/-]*$' then left(p_route, 120) else 'other' end;

  -- Same error, same place: the message plus the first frame, without the
  -- build's chunk hash or line:col, so an error keeps its identity across deploys.
  v_frame := substring(v_stack from '[^\n]*:[0-9]+:[0-9]+[^\n]*');
  v_frame := regexp_replace(regexp_replace(coalesce(v_frame, ''), ':[0-9]+:[0-9]+', '', 'g'),
                            '-[A-Za-z0-9_]{6,}(\.m?js)', '\1', 'g');
  v_fingerprint := md5(p_kind || '|' || v_message || '|' || btrim(v_frame));

  update public.client_errors
     set count = least(count + 1, 1000000)
   where day = v_day and fingerprint = v_fingerprint;
  if found then
    return;
  end if;

  if (select count(*) from public.client_errors where day = v_day) >= 200 then
    return;
  end if;

  insert into public.client_errors (day, fingerprint, kind, message, route, app_version, browser, stack)
  values (
    v_day, v_fingerprint, p_kind, v_message, v_route,
    left(regexp_replace(left(coalesce(p_app_version, ''), 100), '[^0-9A-Za-z.+-]', '', 'g'), 40),
    left(public._scrub_client_error_text(left(p_browser, 200), false), 60),
    v_stack
  )
  on conflict (day, fingerprint) do update
    set count = least(public.client_errors.count + 1, 1000000);
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

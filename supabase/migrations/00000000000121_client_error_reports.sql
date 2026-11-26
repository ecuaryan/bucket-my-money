-- =====================================================================
-- Client error reports (docs/MAINTENANCE.md § Error reports).
--
-- The app reports its own crashes (uncaught errors, unhandled promise
-- rejections, render errors) through report_client_error, so problems people
-- hit become fixes. The owner reads them in the Supabase dashboard (table
-- client_errors); a daily workflow posts only the counts to GitHub.
--
-- Private by design:
--   * Anonymous: no user, member or household id, no time of day, no row id
--     to line up with anything else. The client calls as anon, no session.
--   * Scrubbed here, whatever the client sends, failing safe (when in doubt,
--     text goes): numbers, emails, ids, long tokens and codes, URL user names,
--     `=(...)` values, and everything from a quote to the end of its line.
--     Kept: a stack frame's file name and line:col, React's "error #418"
--     codes, and single-word code identifiers in single quotes ('id').
--   * Bounded: 30 reports an hour and 40 a day per address (the pre-auth
--     limiter), one row per error per day with a count, at most 200 rows a
--     day, kept 30 days.
--   * Nothing a reporter sends is ever published.
-- =====================================================================

create table public.client_errors (
  day         date    not null default (now() at time zone 'utc')::date,
  fingerprint text    not null,
  kind        text    not null check (kind in ('error', 'rejection', 'render')),
  count       integer not null default 1,
  message     text    not null,
  route       text,
  app_version text,
  browser     text,
  stack       text,
  primary key (day, fingerprint)
);

-- No client reads or writes it directly; only the definer RPC below and the
-- service role.
alter table public.client_errors enable row level security;
revoke all on table public.client_errors from public, anon, authenticated;
grant all on table public.client_errors to service_role;

-- Per address: 30 an hour, 40 a day (one session sends at most 10).
insert into public.rate_limit_rules (endpoint, max_hits, window_seconds) values
  ('client_error',     30,  3600),
  ('client_error_day', 40, 86400);

-- _scrub_client_error_text(text, mode): what may be stored.
--   'text'  messages and non-frame stack lines: everything below.
--   'frame' stack frames: digits stay in the file name and the final line:col.
--   'label' the browser label ("Safari 18 · iOS"): digits stay.
create or replace function public._scrub_client_error_text(p_text text, p_mode text)
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
  v := regexp_replace(v, '://[^/[:space:]]*@', '://', 'g');
  if p_mode = 'frame' then
    -- Safari frames are "fn@https://…", so only a real address goes here.
    v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', '<email>', 'g');
  else
    v := regexp_replace(v, '[^[:space:]@＠"''“”‘’()<>]+[@＠][^[:space:]@＠"''“”‘’()<>]+', '<email>', 'g');
  end if;
  -- Keys, tokens, JWTs; all-capital codes.
  v := regexp_replace(v, '[A-Za-z0-9_-]{32,}(\.[A-Za-z0-9_-]+)*', '<token>', 'g');
  v := regexp_replace(v, '\m[A-Z0-9]{6,}\M', '<code>', 'g');
  -- Quotes, failing safe: contractions and possessives ("it's", "Sam’s") and
  -- single-word code identifiers in single quotes ("reading 'id'") are parked
  -- behind control characters; then everything from any other quote to the
  -- end of its line goes, so a stray quote can never leave quoted text behind.
  v := regexp_replace(v, '([[:alnum:]])[''’](s|t|d|m|re|ve|ll)(?![[:alpha:]])', E'\\1\x04\\2', 'g');
  v := regexp_replace(v, '''([A-Za-z_$][A-Za-z0-9_$]{0,23})''', E'\x02\\1\x03', 'g');
  v := regexp_replace(v, '[''"“”‘’].*$', E'\x05', 'gn');
  v := regexp_replace(v, '=\(.*$', '=(…)', 'gn');
  if p_mode = 'text' then
    -- Every number, except React's production error codes.
    v := regexp_replace(v, '(?<![0-9０-９٠-٩])(?<!error #)(?<!/errors/)[0-9０-９٠-٩]+([.,][0-9０-９٠-٩]+)*', '#', 'g');
  elsif p_mode = 'frame' then
    -- Every number not in the file name or the final line:col.
    v := regexp_replace(v, '(?<![0-9])[0-9]+([.,][0-9]+)*(?![0-9])(?![A-Za-z0-9_-]*\.m?js)(?!(:[0-9]+)?\)?[[:space:]]*$)', '#', 'g');
  end if;
  v := translate(v, E'\x02\x03\x04', '''''''');
  v := replace(v, E'\x05', '"…"');
  return v;
end;
$$;

revoke all on function public._scrub_client_error_text(text, text) from public, anon, authenticated;

-- _scrub_client_error_stack(stack, message): frame lines ("at f (url:1:2)",
-- "f@url:1:2") in 'frame' mode, every other line in 'text' mode. Chrome
-- repeats the message as line one.
create or replace function public._scrub_client_error_stack(p_stack text, p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
           public._scrub_client_error_text(
             line,
             case when line ~ '^[[:space:]]*at [^[:space:]].*:[0-9]+:[0-9]+\)?[[:space:]]*$'
                    or line ~ '^[^[:space:]]*@[^[:space:]]+:[0-9]+:[0-9]+[[:space:]]*$'
                  then 'frame' else 'text' end),
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
  v_ip          text;
  v_message     text;
  v_stack       text;
  v_where       text;
  v_fingerprint text;
begin
  if p_kind is null or p_kind not in ('error', 'rejection', 'render')
     or nullif(btrim(coalesce(p_message, '')), '') is null then
    return;
  end if;

  begin
    v_ip := public.pre_auth_client_ip(coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb));
    if not public.check_pre_auth_rate_limit('client_error', v_ip)
       or not public.check_pre_auth_rate_limit('client_error_day', v_ip) then
      return;
    end if;
  exception when others then
    raise warning 'report_client_error rate limit failed: %', sqlerrm;
    return;
  end;

  -- Cut every input first, so an oversized request costs no regex work.
  v_message := left(public._scrub_client_error_text(btrim(left(p_message, 1000)), 'text'), 300);
  v_stack := left(public._scrub_client_error_stack(left(p_stack, 8000), left(p_message, 1000)), 4000);

  -- Same error, same place: the message plus the code chunk of the first frame
  -- (its base name: no build hash, function name or line:col, which change
  -- every deploy), else the first frame without its line:col.
  v_where := substring(v_stack from '/([A-Za-z0-9_]+)-[A-Za-z0-9_-]{8}\.m?js');
  if v_where is null then
    v_where := regexp_replace(coalesce(substring(v_stack from '[^\n]*:[0-9]+:[0-9]+[^\n]*'), ''), ':[0-9]+:[0-9]+', '', 'g');
  end if;
  v_fingerprint := md5(p_kind || '|' || v_message || '|' || btrim(v_where));

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
    v_day, v_fingerprint, p_kind, v_message,
    -- The app's own routes only (none holds an id or code); anything else is "other".
    case when p_route in ('/', '/login', '/login/family', '/login/forgot', '/login/reset', '/join',
                          '/kids', '/give', '/history', '/settings', '/admin')
         then p_route else 'other' end,
    case when p_app_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$' then p_app_version end,
    left(public._scrub_client_error_text(left(p_browser, 200), 'label'), 60),
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

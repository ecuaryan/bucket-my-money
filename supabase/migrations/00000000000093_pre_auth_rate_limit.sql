-- =====================================================================
-- 93. Distributed pre-auth rate limiting.
--
-- The login surface is reachable without a session: the pin-login and
-- webauthn-* Edge Functions (verify_jwt = false) AND the direct
-- anonymous RPCs login_roster / member_login_methods /
-- login_webauthn_options (migrations 73/74 — the join screen, method
-- discovery, and passkey options all call these straight from the
-- browser). Edge Functions run on many instances, so an in-memory
-- counter would be per-instance and trivially bypassed. The counter
-- lives here in Postgres, one implementation serving both paths.
--
-- Design:
--   * rate_limit_hits(limit_key, created_at) — raw hit log, one row per
--     allowed request. Pruned per key on every check, so a quiet key
--     leaves at most `limit` rows behind.
--   * rate_limit_rules(endpoint, max_hits, window_seconds) — single
--     source of truth for budgets, so edge code never hardcodes limits.
--   * check_rate_limit(key, limit, window) — low-level primitive.
--     Serializes concurrent checks on the same key with a
--     transaction-scoped advisory lock, so N simultaneous requests can't
--     all count-then-insert past the limit (a naive delete/count/insert
--     races). Validates inputs and fails CLOSED on programmer error.
--   * check_pre_auth_rate_limit(endpoint, ip) — what the Edge Functions
--     call: rule lookup + normalized key. Unknown endpoint raises (the
--     edge caller logs it and fails open, so a misconfigured endpoint
--     is loud in logs, never silently unlimited).
--   * pre_auth_rate_limit(endpoint) — what the login RPCs call first
--     thing. Reads the client IP from PostgREST's request.headers GUC,
--     fails OPEN with a warning on infrastructure errors (a rate-limit
--     hiccup must never become a family login outage), but raises a
--     friendly 'too many attempts' error when the budget is spent and
--     raises loudly on an unknown endpoint name.
--   * The three login RPCs are re-created below with the throttle as
--     their first statement. Their bodies, grants, and response shapes
--     are otherwise unchanged — same UX, same join-code flow.
--   * cleanup_rate_limit_hits() + a daily pg_cron job bounds the table
--     for keys that go quiet (belt and suspenders on top of per-key
--     pruning). One 5,000-row batch per invocation; the daily job
--     drains a large backlog across consecutive runs.
--
-- Fail-open policy: the rate limiter is abuse throttling, NOT the
-- primary control. PIN brute force is stopped by the per-member lockout
-- (record_pin_failure), join codes carry ~48 bits of entropy, and
-- WebAuthn challenges are single-use. If the limiter itself errors, we
-- log and let the request through rather than lock the family out.
--
-- Everything here is service-role/definer-only. anon and authenticated
-- get no direct access to the tables or the primitives — the RPCs they
-- call invoke the limiter with definer rights.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hit log.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  limit_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_created_idx
  on public.rate_limit_hits (limit_key, created_at);

alter table public.rate_limit_hits enable row level security;
-- No policies: only the definer functions below touch this table.
revoke all on table public.rate_limit_hits from public;
revoke all on table public.rate_limit_hits from anon;
revoke all on table public.rate_limit_hits from authenticated;

comment on table public.rate_limit_hits is
  'Raw hit log for distributed pre-auth rate limiting. Pruned per key on every check; see check_rate_limit.';

-- ---------------------------------------------------------------------
-- 2. Budgets: single source of truth shared by the Edge Functions and
--    the in-RPC throttles. Change limits here, not in code.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limit_rules (
  endpoint text primary key,
  -- Upper bounds mirror check_rate_limit's: a budget past these is a
  -- programmer error, never a real pre-auth throttle. Fail closed at
  -- the source of truth so bad values can't reach the primitive.
  max_hits int not null check (max_hits > 0 and max_hits <= 100000),
  window_seconds int not null check (window_seconds > 0 and window_seconds <= 86400)
);

alter table public.rate_limit_rules enable row level security;
-- No policies: read only through the definer functions below.
revoke all on table public.rate_limit_rules from public;
revoke all on table public.rate_limit_rules from anon;
revoke all on table public.rate_limit_rules from authenticated;

comment on table public.rate_limit_rules is
  'Per-endpoint pre-auth rate limit budgets. Consumed by check_pre_auth_rate_limit (edge) and pre_auth_rate_limit (RPC).';

-- Budgets are generous for a household behind one NAT (Ryan's 7) and
-- only bite under abuse. The login screen fans out per roster member,
-- hence the higher discovery/options budgets.
insert into public.rate_limit_rules (endpoint, max_hits, window_seconds) values
  ('pin-login',               20, 60),
  ('validate-join-code',      20, 60),
  ('webauthn-has-passkey',    60, 60),
  ('webauthn-login-options',  60, 60),
  ('webauthn-login-verify',   60, 60),
  ('login_roster',            20, 60),
  ('member_login_methods',    60, 60),
  ('login_webauthn_options',  60, 60)
on conflict (endpoint) do update set
  max_hits = excluded.max_hits,
  window_seconds = excluded.window_seconds;

-- ---------------------------------------------------------------------
-- 3. Low-level primitive: atomic check-and-record.
--
-- The advisory lock serializes concurrent checks on the SAME key, so
-- parallel requests can't all observe a stale count and blow past the
-- limit. The lock is transaction-scoped: held only for the
-- delete/count/insert below, released at commit. A single lock per
-- call means no deadlock ordering concerns; a hash collision between
-- two unrelated keys only costs a little extra serialization, never a
-- wrong answer.
-- ---------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_hits int;
begin
  -- Fail CLOSED on programmer error: a bad key or budget must never
  -- silently become "unlimited".
  if p_key is null or btrim(p_key) = '' then
    raise exception 'check_rate_limit: p_key must not be empty';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'check_rate_limit: p_limit must be positive';
  end if;
  -- Upper bounds: a budget this generous is a programmer error (or a
  -- compromised rules table), never a real pre-auth throttle. Fail
  -- closed rather than silently mint near-unlimited budgets.
  if p_limit > 100000 then
    raise exception 'check_rate_limit: p_limit exceeds maximum (100000)';
  end if;
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'check_rate_limit: p_window_seconds must be positive';
  end if;
  if p_window_seconds > 86400 then
    raise exception 'check_rate_limit: p_window_seconds exceeds maximum (86400)';
  end if;

  -- Bound the key so a hostile caller can't bloat the index.
  v_key := left(btrim(p_key), 160);

  -- Serialize with other checks on this key. Concurrent transactions
  -- queue here instead of racing through count-then-insert.
  perform pg_advisory_xact_lock(hashtext(v_key)::bigint);

  delete from public.rate_limit_hits h
   where h.limit_key = v_key
     and h.created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_hits
    from public.rate_limit_hits h
   where h.limit_key = v_key;

  if v_hits >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (limit_key) values (v_key);
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
revoke all on function public.check_rate_limit(text, int, int) from anon;
revoke all on function public.check_rate_limit(text, int, int) from authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

comment on function public.check_rate_limit(text, int, int) is
  'Atomic pre-auth rate-limit check-and-record. Service-role only; edges and login RPCs go through the wrappers below.';

-- ---------------------------------------------------------------------
-- 4. Edge-function path: check_pre_auth_rate_limit(endpoint, ip).
--
-- Called from the _shared/rateLimit.ts helper with the client IP the
-- edge extracted from the request. Returns true when the request is
-- within budget. Raises on an unknown endpoint — the edge caller logs
-- the RPC error and fails open, so a misconfigured endpoint is loud
-- in logs rather than silently unlimited.
--
-- A missing/blank IP lands in one shared 'unknown' bucket. The edge
-- always sees a real peer IP in practice, so this bucket only fills in
-- pathological cases; sharing it caps abuse from header-stripping
-- clients instead of handing each of them a fresh budget.
-- ---------------------------------------------------------------------
create or replace function public.check_pre_auth_rate_limit(
  p_endpoint text,
  p_ip text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_hits int;
  v_window_seconds int;
  v_ip text;
begin
  select r.max_hits, r.window_seconds
    into v_max_hits, v_window_seconds
    from public.rate_limit_rules r
   where r.endpoint = p_endpoint;
  if not found then
    raise exception 'Unknown pre-auth rate limit endpoint: %', p_endpoint;
  end if;

  v_ip := left(nullif(btrim(p_ip), ''), 64);
  if v_ip is null then
    v_ip := 'unknown';
  end if;

  return public.check_rate_limit(
    'preauth:' || p_endpoint || ':' || v_ip,
    v_max_hits,
    v_window_seconds
  );
end;
$$;

revoke all on function public.check_pre_auth_rate_limit(text, text) from public;
revoke all on function public.check_pre_auth_rate_limit(text, text) from anon;
revoke all on function public.check_pre_auth_rate_limit(text, text) from authenticated;
grant execute on function public.check_pre_auth_rate_limit(text, text) to service_role;

comment on function public.check_pre_auth_rate_limit(text, text) is
  'Pre-auth rate limit for Edge Functions (service-role only). Budgets come from rate_limit_rules.';

-- ---------------------------------------------------------------------
-- 5. In-RPC path: pre_auth_rate_limit(endpoint).
--
-- Called as the FIRST statement of the anonymous login RPCs. Reads the
-- client IP from PostgREST's request.headers GUC (first hop of
-- X-Forwarded-For, else X-Real-IP), so the direct-RPC login flows get
-- the same per-IP throttling as the Edge Functions with zero UX
-- change.
--
-- Fail-open on infrastructure errors (bad headers GUC, transient DB
-- issue): warn and return, letting the request through. The per-member
-- PIN lockout remains the primary brute-force control, and a
-- rate-limit hiccup must never become a family login outage. But an
-- exhausted budget raises a friendly error, and an unknown endpoint
-- name raises LOUDLY outside the fail-open block — a typo must never
-- silently disable throttling.
--
-- Not granted to anon/authenticated: the login RPCs invoke it with
-- definer rights, so it never needs to be directly callable.
-- ---------------------------------------------------------------------
create or replace function public.pre_auth_rate_limit(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_xff text;
  v_ip text := 'unknown';
  v_allowed boolean;
begin
  -- Programmer-error guard OUTSIDE the fail-open block.
  perform 1 from public.rate_limit_rules r where r.endpoint = p_endpoint;
  if not found then
    raise exception 'Unknown pre-auth rate limit endpoint: %', p_endpoint;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_xff := v_headers ->> 'x-forwarded-for';
    if v_xff is not null and nullif(btrim(split_part(v_xff, ',', 1)), '') is not null then
      v_ip := left(btrim(split_part(v_xff, ',', 1)), 64);
    else
      v_ip := coalesce(left(nullif(btrim(v_headers ->> 'x-real-ip'), ''), 64), 'unknown');
    end if;

    v_allowed := public.check_pre_auth_rate_limit(p_endpoint, v_ip);
  exception when others then
    raise warning 'pre_auth_rate_limit(%) fail-open: %', p_endpoint, sqlerrm;
    return;
  end;

  if not v_allowed then
    raise exception 'Too many attempts. Please wait a minute and try again.';
  end if;
end;
$$;

revoke all on function public.pre_auth_rate_limit(text) from public;
revoke all on function public.pre_auth_rate_limit(text) from anon;
revoke all on function public.pre_auth_rate_limit(text) from authenticated;
grant execute on function public.pre_auth_rate_limit(text) to service_role;

comment on function public.pre_auth_rate_limit(text) is
  'Per-IP throttle for the anonymous login RPCs. Fail-open on infrastructure errors; raises on exhausted budget.';

-- ---------------------------------------------------------------------
-- 6. Hook the throttle into the three anonymous login RPCs
--    (migrations 73/74). Bodies, grants, and response shapes are
--    otherwise UNCHANGED — same UX, same join-code flow.
--
-- Volatility: login_roster and member_login_methods move from stable
-- to volatile (the throttle writes hit rows, so the old promise of
-- "no DB writes" no longer holds). login_webauthn_options was already
-- volatile. These are only ever invoked as RPC endpoints, so this
-- changes nothing for callers.
-- ---------------------------------------------------------------------

-- login_roster(text): join-screen roster lookup. Body is migration 73
-- verbatim, plus the throttle as the first statement.
create or replace function public.login_roster(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_family_name text;
  v_members jsonb;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  -- Abuse throttle first: per-IP budget from rate_limit_rules.
  perform public.pre_auth_rate_limit('login_roster');

  if length(v_code) < 6 then
    return null;
  end if;

  select id, name into v_family_id, v_family_name
  from public.families
  where join_code = v_code;

  if v_family_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'role', m.role,
        'avatarUrl', m.avatar_url,
        'hasPin', (m.pin_set_at is not null),
        'pinLocked', m.pin_locked,
        'isAccountOwner', coalesce(m.is_account_owner, false),
        'hasPasskey', exists(
          select 1 from public.member_passkeys p where p.member_id = m.id
        )
      )
      order by m.created_at asc
    ),
    '[]'::jsonb
  )
  into v_members
  from public.family_members m
  where m.family_id = v_family_id
    and m.role in ('admin', 'member', 'child');

  return jsonb_build_object(
    'familyId', v_family_id,
    'familyName', v_family_name,
    'members', v_members
  );
end;
$$;

comment on function public.login_roster(text) is
  'Join-screen roster lookup. Throttled per IP via pre_auth_rate_limit; body/grant behavior otherwise unchanged from migration 73.';

revoke all on function public.login_roster(text) from public;
grant execute on function public.login_roster(text) to anon;
grant execute on function public.login_roster(text) to authenticated;
grant execute on function public.login_roster(text) to service_role;

-- member_login_methods(uuid, uuid): login method discovery. Body is
-- migration 73 verbatim, with the throttle as the first statement.
create or replace function public.member_login_methods(
  p_family_id uuid,
  p_member_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.pre_auth_rate_limit('member_login_methods');
  select jsonb_build_object(
    'exists', exists(
      select 1 from public.member_passkeys p
      where p.member_id = p_member_id and p.family_id = p_family_id
    ),
    'hasPin', exists(
      select 1 from public.family_members m
      where m.id = p_member_id
        and m.family_id = p_family_id
        and m.pin_set_at is not null
    )
  );
$$;

comment on function public.member_login_methods(uuid, uuid) is
  'Login method discovery. Throttled per IP via pre_auth_rate_limit; body/grant behavior otherwise unchanged from migration 73.';

revoke all on function public.member_login_methods(uuid, uuid) from public;
grant execute on function public.member_login_methods(uuid, uuid) to anon;
grant execute on function public.member_login_methods(uuid, uuid) to authenticated;
grant execute on function public.member_login_methods(uuid, uuid) to service_role;

-- login_webauthn_options(uuid, uuid): passkey authentication options.
-- Body is migration 74 verbatim, with the throttle as the first statement.
create or replace function public.login_webauthn_options(
  p_family_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_host text;
  v_rpid text;
  v_challenge text;
  v_creds jsonb;
  v_member_exists boolean;
begin
  -- Abuse throttle first: per-IP budget from rate_limit_rules.
  perform public.pre_auth_rate_limit('login_webauthn_options');

  -- Relying-party id from the browser Origin, matching relyingParty():
  -- localhost / 127.0.0.1 / bucketmymoney.com (+ their subdomains), apex wins.
  v_origin := current_setting('request.headers', true)::json ->> 'origin';
  if v_origin is null then
    return jsonb_build_object('error', 'Unsupported origin');
  end if;
  v_host := lower(split_part(split_part(split_part(v_origin, '//', 2), '/', 1), ':', 1));
  v_rpid := case
    when v_host = 'localhost' or v_host like '%.localhost' then 'localhost'
    when v_host = '127.0.0.1' then '127.0.0.1'
    when v_host = 'bucketmymoney.com' or v_host like '%.bucketmymoney.com'
      then 'bucketmymoney.com'
    else null
  end;
  if v_rpid is null then
    return jsonb_build_object('error', 'Unsupported origin');
  end if;

  select true into v_member_exists
  from public.family_members
  where id = p_member_id and family_id = p_family_id;
  if v_member_exists is null then
    return jsonb_build_object('error', 'Invalid credentials');
  end if;

  -- allowCredentials: the member's registered passkeys. Drop null transports
  -- (jsonb_strip_nulls) so the shape matches the @simplewebauthn output.
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', credential_id,
          'type', 'public-key',
          'transports', transports
        )
      )
    ),
    '[]'::jsonb
  )
  into v_creds
  from public.member_passkeys
  where member_id = p_member_id;

  if v_creds = '[]'::jsonb then
    return jsonb_build_object('noPasskey', true, 'error', 'No passkey on this account');
  end if;

  -- 32 random bytes (two UUIDs), base64url without padding — same encoding the
  -- library produces, and stored verbatim for webauthn-login-verify to match.
  v_challenge := translate(
    rtrim(
      encode(
        decode(translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'
      ),
      '='
    ),
    '+/',
    '-_'
  );

  delete from public.webauthn_challenges
  where member_id = p_member_id and kind = 'login';

  insert into public.webauthn_challenges (member_id, family_id, challenge, kind, expires_at)
  values (p_member_id, p_family_id, v_challenge, 'login', now() + interval '5 minutes');

  return jsonb_build_object(
    'challenge', v_challenge,
    'rpId', v_rpid,
    'allowCredentials', v_creds,
    'timeout', 60000,
    'userVerification', 'required'
  );
end;
$$;

comment on function public.login_webauthn_options(uuid, uuid) is
  'WebAuthn authentication options. Throttled per IP via pre_auth_rate_limit; body/grant behavior otherwise unchanged from migration 74.';

revoke all on function public.login_webauthn_options(uuid, uuid) from public;
grant execute on function public.login_webauthn_options(uuid, uuid) to anon;
grant execute on function public.login_webauthn_options(uuid, uuid) to authenticated;
grant execute on function public.login_webauthn_options(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7. Bounded global cleanup for keys that go quiet (belt and
--    suspenders: per-key pruning on every check already bounds active
--    keys). Runs daily via pg_cron.
-- ---------------------------------------------------------------------
create or replace function public.cleanup_rate_limit_hits()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch int;
begin
  -- Strictly bounded: exactly ONE 5,000-row batch per invocation, never
  -- more. The daily pg_cron job calls this once a day, so a large
  -- backlog drains across consecutive runs rather than in a single
  -- unbounded run — one run can never hold a long lock or bloat WAL
  -- no matter how large the table has grown (quiet keys leave rows
  -- behind until this reaches them).
  delete from public.rate_limit_hits h
   where h.ctid in (
     select h2.ctid
       from public.rate_limit_hits h2
      where h2.created_at < now() - interval '24 hours'
      limit 5000
   );
  get diagnostics v_batch = row_count;
  return v_batch;
end;
$$;

revoke all on function public.cleanup_rate_limit_hits() from public;
revoke all on function public.cleanup_rate_limit_hits() from anon;
revoke all on function public.cleanup_rate_limit_hits() from authenticated;
grant execute on function public.cleanup_rate_limit_hits() to service_role;

comment on function public.cleanup_rate_limit_hits() is
  'Deletes at most 5000 rows older than 24h per invocation. Service-role only; the daily rate-limit-hits-cleanup pg_cron job drains a backlog across runs.';

-- Idempotent schedule (migration 84 pattern): drop any previous job
-- with this name before scheduling.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'rate-limit-hits-cleanup'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'rate-limit-hits-cleanup',
  '0 3 * * *',
  $$ select public.cleanup_rate_limit_hits(); $$
);

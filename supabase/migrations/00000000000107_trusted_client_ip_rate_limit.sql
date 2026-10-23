-- =====================================================================
-- Pre-auth rate limit: key on an address the caller cannot choose.
--
-- pre_auth_rate_limit (migration 93) keyed on the FIRST entry of
-- X-Forwarded-For. On hosted Supabase the gateway APPENDS the real client
-- address to whatever the caller sent, so the first entry is attacker-chosen:
-- 30 requests with a different fake first entry each were all answered, while
-- the same 30 without it were refused from request 21 (verified against the
-- production project).
--
-- What the hosted gateway does with each client-supplied header (probed one at
-- a time against production):
--   cf-connecting-ip  rejected with HTTP 403 (Cloudflare) -> cannot be faked;
--                     otherwise carries the real client address
--   sb-forwarded-for  overwritten with the real address     -> cannot be faked
--   x-forwarded-for   fake kept, real address appended LAST -> last entry is real
--   x-real-ip         dropped / not reliably present
--   true-client-ip    passed through as sent                -> SPOOFABLE, never used
--   forwarded         dropped
--
-- So the client address is the first VALID IP among, in order:
--   1. cf-connecting-ip   2. sb-forwarded-for   3. LAST x-forwarded-for entry
--   4. x-real-ip          else 'unknown'
-- (On the local Supabase stack there is no Cloudflare, so cf-connecting-ip and
-- sb-forwarded-for are client-set there; that is a dev box, not a trust
-- boundary. The last x-forwarded-for entry is gateway-appended in both.)
-- TS mirror for the Edge Functions: supabase/functions/_shared/clientIp.ts.
--
-- Also: IPv6 addresses are keyed by their /64. A single subscriber is handed a
-- whole /64, so per-address keys would let one attacker rotate through 2^64
-- addresses. IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as that IPv4 address.
--
-- Also drops the temporary debug_request_headers() diagnostic (migration 106).
-- =====================================================================

drop function if exists public.debug_request_headers();

-- True for a bare IPv4/IPv6 address (no mask, no junk).
create or replace function public.pre_auth_is_ip(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or btrim(p_text) = '' or position('/' in p_text) > 0 then
    return false;
  end if;
  perform btrim(p_text)::inet;
  return true;
exception when others then
  return false;
end;
$$;

-- The trusted client address for a request's headers (see header comment).
create or replace function public.pre_auth_client_ip(p_headers jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_xff   text := p_headers ->> 'x-forwarded-for';
  v_parts text[];
  v_cands text[];
  v_cand  text;
begin
  v_cands := array[
    p_headers ->> 'cf-connecting-ip',
    p_headers ->> 'sb-forwarded-for'
  ];
  if v_xff is not null then
    v_parts := string_to_array(v_xff, ',');
    v_cands := v_cands || v_parts[array_length(v_parts, 1)];
  end if;
  v_cands := v_cands || (p_headers ->> 'x-real-ip');

  foreach v_cand in array v_cands loop
    v_cand := btrim(coalesce(v_cand, ''));
    if public.pre_auth_is_ip(v_cand) then
      return left(v_cand, 64);
    end if;
  end loop;
  return 'unknown';
end;
$$;

-- Edge Functions pass the address they extracted; the budget key normalizes it.
create or replace function public.check_pre_auth_rate_limit(p_endpoint text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_hits int;
  v_window_seconds int;
  v_ip text;
  v_inet inet;
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
  elsif public.pre_auth_is_ip(v_ip) then
    v_inet := v_ip::inet;
    if family(v_inet) = 6 then
      if v_ip ~* '^::ffff:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' then
        v_ip := regexp_replace(v_ip, '^::ffff:', '', 'i'); -- IPv4-mapped
      else
        v_ip := network(set_masklen(v_inet, 64))::text;    -- whole /64
      end if;
    else
      v_ip := host(v_inet);
    end if;
  end if;

  return public.check_rate_limit(
    'preauth:' || p_endpoint || ':' || v_ip,
    v_max_hits,
    v_window_seconds
  );
end;
$$;

create or replace function public.pre_auth_rate_limit(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
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
    v_ip := public.pre_auth_client_ip(coalesce(v_headers, '{}'::jsonb));
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

-- Helpers are internal: service role (tests) only. CREATE OR REPLACE kept the
-- existing grants on the two functions that already existed.
revoke all on function public.pre_auth_is_ip(text) from public, anon, authenticated;
revoke all on function public.pre_auth_client_ip(jsonb) from public, anon, authenticated;
grant execute on function public.pre_auth_is_ip(text) to service_role;
grant execute on function public.pre_auth_client_ip(jsonb) to service_role;

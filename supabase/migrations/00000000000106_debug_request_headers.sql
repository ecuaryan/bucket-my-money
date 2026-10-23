-- =====================================================================
-- TEMPORARY diagnostic — dropped again by the rate-limit fix that follows.
--
-- The pre-auth rate limit keys on the FIRST entry of X-Forwarded-For
-- (pre_auth_rate_limit, migration 93). A test against the hosted project showed
-- a caller can set that header and get a fresh budget per request. Before
-- choosing which header to trust instead, we need to see what the hosted
-- gateway actually puts in front of PostgREST; request.headers is only
-- visible inside the database, so a plain RPC cannot tell us.
--
-- Echoes back ONLY the caller's own request headers, minus credentials
-- (authorization, apikey, cookie, x-client-info). Nothing about other users
-- and no data.
-- =====================================================================

create or replace function public.debug_request_headers()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
         - 'authorization' - 'apikey' - 'cookie' - 'x-client-info'
$$;

revoke all on function public.debug_request_headers() from public;
grant execute on function public.debug_request_headers() to anon, authenticated, service_role;

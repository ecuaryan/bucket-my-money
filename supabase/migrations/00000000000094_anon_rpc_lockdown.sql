-- =====================================================================
-- Anonymous-RPC lockdown: explicitly revoke anon (and re-assert the
-- public/authenticated revokes) on internal service-role functions.
--
-- Background: migration 56 revoked PUBLIC+anon from all functions that
-- existed at the time, but later migrations only revoked
-- public/authenticated on the new claim functions — and the Supabase
-- Postgres image can explicitly grant new public-schema functions to
-- anon (see migration 92 for the record_pin_failure instance). Effective
-- grants were never tested, so this migration defensively locks down
-- every internal function with its exact signature. REVOKE of a grant
-- that doesn't exist is only a WARNING, so this is safe regardless of
-- the image's current defaults.
--
-- Functions covered (all service_role-only by design):
--   claim_stale_enrollments(timestamptz, interval, int)       — returns
--     Teller access_token (migration 81)
--   claim_stale_simplefin_connections(timestamptz, interval, int) —
--     returns SimpleFIN access_url with embedded Basic credentials
--     (migration 84) — highest risk if exposed
--   claim_stale_plaid_items(timestamptz, interval, int)        — returns
--     Plaid access_token (migration 88)
--   trigger_scheduled_balance_refresh()                       — cron
--     entry point; reads Vault secrets (migrations 81/84/88). pg_cron
--     executes it as the scheduling role (postgres), which bypasses
--     grant checks, so revoking anon cannot break the sweep.
--
-- NOT touched: login_roster(text), member_login_methods(uuid, uuid),
-- login_webauthn_options(uuid, uuid) — these three explicit anon grants
-- are intentional (credential-less login roster/method discovery).
-- member_session_lookup(uuid, uuid) and record_pin_failure(uuid, int)
-- are already fully locked down (migrations 72 and 92).
-- =====================================================================

revoke all on function public.claim_stale_enrollments(timestamptz, interval, int) from public;
revoke all on function public.claim_stale_enrollments(timestamptz, interval, int) from anon;
revoke all on function public.claim_stale_enrollments(timestamptz, interval, int) from authenticated;
grant execute on function public.claim_stale_enrollments(timestamptz, interval, int) to service_role;

revoke all on function public.claim_stale_simplefin_connections(timestamptz, interval, int) from public;
revoke all on function public.claim_stale_simplefin_connections(timestamptz, interval, int) from anon;
revoke all on function public.claim_stale_simplefin_connections(timestamptz, interval, int) from authenticated;
grant execute on function public.claim_stale_simplefin_connections(timestamptz, interval, int) to service_role;

revoke all on function public.claim_stale_plaid_items(timestamptz, interval, int) from public;
revoke all on function public.claim_stale_plaid_items(timestamptz, interval, int) from anon;
revoke all on function public.claim_stale_plaid_items(timestamptz, interval, int) from authenticated;
grant execute on function public.claim_stale_plaid_items(timestamptz, interval, int) to service_role;

revoke all on function public.trigger_scheduled_balance_refresh() from public;
revoke all on function public.trigger_scheduled_balance_refresh() from anon;
revoke all on function public.trigger_scheduled_balance_refresh() from authenticated;
grant execute on function public.trigger_scheduled_balance_refresh() to service_role;

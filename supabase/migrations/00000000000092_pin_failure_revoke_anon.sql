-- Revoke anon EXECUTE on record_pin_failure (follow-up to migration 91).
--
-- The Supabase Postgres image sets default privileges granting EXECUTE on new
-- public-schema functions explicitly to anon, authenticated, and service_role
-- (in addition to the standard PUBLIC default). Migration 91 revoked PUBLIC
-- and authenticated but not anon, so the default explicit anon grant survived
-- and unauthenticated callers could invoke this service-role-only RPC via
-- PostgREST (caught by tests/db/pin_lockout.test.ts in CI).
-- Migration 56's hardening loop revokes from both public and anon for the same
-- reason; this completes the lockdown for record_pin_failure.

revoke all on function public.record_pin_failure(uuid, int) from public;
revoke all on function public.record_pin_failure(uuid, int) from anon;
revoke all on function public.record_pin_failure(uuid, int) from authenticated;
grant execute on function public.record_pin_failure(uuid, int) to service_role;

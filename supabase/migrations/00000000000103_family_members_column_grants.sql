-- =====================================================================
-- Column-level UPDATE on family_members / families (security review).
--
-- Migration 2 granted TABLE-level UPDATE on both tables to `authenticated`,
-- gated only by admin-only RLS. Migration 75 fixed exactly this shape for
-- SELECT (a table-level grant overrides column-level rules), but UPDATE was
-- left open, so any admin could rewrite ANY column of ANY member row from the
-- browser console: pin_hash, pin_locked, role, and user_id.
--
-- user_id is the dangerous one. auth_member_id() resolves the caller with
-- `where user_id = auth.uid() limit 1`. A co-admin who pointed the owner row's
-- user_id at their own login (and cleared their own row's) would become the
-- account owner as far as the database is concerned, while the real owner's
-- login mapped to no member. The owner guard trigger only watched role and
-- is_account_owner, so it did not stop this.
--
-- Fix, in three parts:
--   1. authenticated may UPDATE only `name` on family_members (the rename UI is
--      the only client write). Role changes, PIN state and user_id are written
--      by Edge Functions / SECURITY DEFINER RPCs (service role), unaffected.
--   2. authenticated may UPDATE only `timezone` on families (Auto-bucket
--      settings). join_code rotates through rotate_family_join_code()
--      (SECURITY DEFINER); `plan` must never be self-service once plans are
--      sold.
--   3. user_id is unique, so two members can never share one login (this also
--      covers INSERT, which the admin policy still allows).
-- =====================================================================

revoke update on public.family_members from authenticated;
grant update (name) on public.family_members to authenticated;

revoke update on public.families from authenticated;
grant update (timezone) on public.families to authenticated;

create unique index family_members_user_id_key
  on public.family_members (user_id);

-- Tighten anonymous privileges on buckets.
--
-- The anon role had UPDATE on public.buckets. RLS already blocks
-- anonymous users in practice (policies require a valid auth.uid()), but
-- defense in depth: anon should never directly modify buckets.
revoke update on public.buckets from anon;

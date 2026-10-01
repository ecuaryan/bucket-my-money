-- Allow authenticated users to update bucket notes.
--
-- Migration 00000000000005_move_money locked down direct UPDATE on
-- public.buckets to only (name, owner_member_id) so that
-- allocated_amount can only change via the move_money RPC. The notes
-- column needs the same direct-update treatment as name: editable through
-- the normal bucket update path, still gated by the buckets RLS policies.
--
-- GRANT is cumulative, so this adds notes to the existing column list.
grant update (notes) on public.buckets to authenticated;

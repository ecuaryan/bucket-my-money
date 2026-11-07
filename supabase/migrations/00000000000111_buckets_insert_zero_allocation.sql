-- New buckets must start empty. Money reaches a bucket only through
-- move_money / give_money; a client-supplied allocated_amount on INSERT
-- (e.g. a negative one) would mint Unbucketed money without any cash behind it.
-- Service role (seeds, Edge Functions) bypasses RLS and is unaffected.

drop policy if exists "buckets_insert_admin_or_child_own" on public.buckets;

create policy "buckets_insert_admin_or_child_own"
  on public.buckets
  for insert
  with check (
    family_id = public.auth_family_id()
    and allocated_amount = 0
    and (
      public.auth_role() = 'admin'
      or (
        public.auth_role() = 'child'
        and owner_member_id = public.auth_member_id()
      )
    )
  );

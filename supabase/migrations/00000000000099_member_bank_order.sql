-- =====================================================================
-- Per-person order of the institution cards on the Bank tab.
--
-- Like member_bucket_order / member_bucket_groups this is purely a view
-- preference: it belongs to one member, never touches balances or other
-- members' views. Institutions have no row of their own (the Bank tab groups
-- accounts by institution name), so the key is the lower-cased institution
-- name. Institutions with no row sort after the ordered ones, in first-seen
-- order — so a newly linked bank simply appears at the bottom.
--
-- Reads are RLS-scoped to the caller; writes go through save_bank_order.
-- =====================================================================

create table public.member_bank_order (
  member_id       uuid not null references public.family_members(id) on delete cascade,
  institution_key text not null,
  display_order   int  not null,
  primary key (member_id, institution_key),
  constraint member_bank_order_key_len
    check (char_length(institution_key) between 1 and 200)
);

alter table public.member_bank_order enable row level security;

create policy member_bank_order_select_own
  on public.member_bank_order
  for select
  to authenticated
  using (member_id = public.auth_member_id());

revoke all on public.member_bank_order from public, anon, authenticated;
grant select on public.member_bank_order to authenticated;
grant all on public.member_bank_order to service_role;

-- Replace the caller's whole bank order with the given keys (top to bottom).
create or replace function public.save_bank_order(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.auth_member_id();
begin
  if v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_keys is null or coalesce(array_length(p_keys, 1), 0) > 200 then
    raise exception 'invalid bank order' using errcode = '22023';
  end if;

  delete from public.member_bank_order where member_id = v_member;

  insert into public.member_bank_order (member_id, institution_key, display_order)
  select v_member, k, ord
    from unnest(p_keys) with ordinality as t(k, ord)
   where k is not null and char_length(k) between 1 and 200
  on conflict (member_id, institution_key) do nothing;
end;
$$;

revoke all on function public.save_bank_order(text[]) from public, anon;
grant execute on function public.save_bank_order(text[]) to authenticated, service_role;

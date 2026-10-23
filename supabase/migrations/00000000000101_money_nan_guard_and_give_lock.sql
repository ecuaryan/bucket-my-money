-- =====================================================================
-- Two money-correctness hardenings (found in a security review):
--
-- 1) NaN guard. Postgres `numeric` accepts 'NaN', and NaN compares greater
--    than every number, so `p_amount <= 0` and `amount > 0` checks let it
--    through. Calling move_money(null, bucket, 'NaN') directly stored NaN in
--    buckets.allocated_amount. Every money column is numeric(14,2), which
--    already rejects +/-Infinity, so NaN is the only non-finite value to
--    block. CHECK constraints on the storage columns are the safety net: they
--    cover every present and future RPC and abort the whole call, so no
--    partial write survives. The app never sends NaN, so no UI changes.
--
-- 2) give_money sender lock. give_money locked only the recipient's
--    family_members row, so two simultaneous gives from the same child could
--    both pass the balance check and overdraw them (and a parent's
--    return_from_child, which locks the child row, did not serialize against
--    a child's own give). It now locks BOTH rows, sender and recipient, in
--    one statement ordered by id so two children giving to each other cannot
--    deadlock. Otherwise unchanged from migration 66.
-- =====================================================================

alter table public.buckets
  add constraint buckets_allocated_amount_not_nan
  check (allocated_amount <> 'NaN'::numeric);

alter table public.accounts
  add constraint accounts_current_balance_not_nan
  check (current_balance <> 'NaN'::numeric),
  add constraint accounts_pending_payment_credit_not_nan
  check (pending_payment_credit <> 'NaN'::numeric);

alter table public.transactions
  add constraint transactions_amount_not_nan
  check (amount <> 'NaN'::numeric);

alter table public.auto_organize_lines
  add constraint auto_organize_lines_amount_not_nan
  check (amount <> 'NaN'::numeric);

alter table public.bitcoin_entries
  add constraint bitcoin_entries_usd_amount_not_nan
  check (usd_amount <> 'NaN'::numeric),
  add constraint bitcoin_entries_btc_amount_not_nan
  check (btc_amount <> 'NaN'::numeric);

CREATE OR REPLACE FUNCTION public.give_money(p_to_member_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_member_id uuid := public.auth_member_id();
  v_caller_role      text := public.auth_role();
  v_caller_family    uuid := public.auth_family_id();
  v_caller_name      text;
  v_to_role          text;
  v_to_family        uuid;
  v_to_name          text;
  v_available        numeric;
  v_float_member_id uuid;
  v_from_member_balance_before numeric;
  v_from_member_balance_after numeric;
  v_to_member_balance_before numeric;
  v_to_member_balance_after numeric;
  v_float_balance_before numeric;
  v_float_balance_after numeric;
  v_transaction_id   uuid;
begin
  if v_caller_member_id is null or v_caller_family is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_to_member_id is null then
    raise exception 'recipient is required' using errcode = '22023';
  end if;

  if p_to_member_id = v_caller_member_id then
    raise exception 'cannot give to yourself' using errcode = '22023';
  end if;

  if p_note is not null and length(p_note) > 280 then
    raise exception 'note too long' using errcode = '22001';
  end if;

  select name
    into v_caller_name
    from public.family_members
   where id = v_caller_member_id;

  -- Lock sender AND recipient together, in id order (no deadlock when two
  -- children give to each other). Serializes concurrent gives from one sender
  -- and against return_from_child, so the balance check below cannot race.
  perform 1
    from public.family_members
   where id in (v_caller_member_id, p_to_member_id)
     and family_id = v_caller_family
   order by id
   for update;

  select family_id, role, name
    into v_to_family, v_to_role, v_to_name
    from public.family_members
   where id = p_to_member_id;

  if not found then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  if v_to_family <> v_caller_family then
    raise exception 'recipient not in your family' using errcode = '42501';
  end if;

  if public.member_has_linked_account(v_caller_member_id) then
    raise exception 'your linked account settles at the bank, not by giving'
      using errcode = '22023';
  end if;

  if public.member_has_linked_account(p_to_member_id) then
    raise exception 'that member has a linked bank account — settle through the bank'
      using errcode = '22023';
  end if;

  if v_caller_role in ('admin', 'member') and v_to_role in ('admin', 'member') then
    raise exception 'adults share one pool — give to a child instead' using errcode = '22023';
  end if;

  if v_caller_role in ('admin', 'member') and v_to_role = 'child' then
    v_available := public.member_float(v_caller_member_id);
    if coalesce(v_available, 0) < p_amount then
      raise exception 'insufficient float balance' using errcode = '23514';
    end if;
    v_float_member_id := v_caller_member_id;
    v_float_balance_before := v_available;
    v_to_member_balance_before := public.member_child_virtual_balance(p_to_member_id);
    v_to_member_balance_after := v_to_member_balance_before + p_amount;
  elsif v_caller_role = 'child' then
    v_available := public.member_float(v_caller_member_id);
    if coalesce(v_available, 0) < p_amount then
      raise exception 'insufficient float balance' using errcode = '23514';
    end if;
    v_from_member_balance_before := public.member_child_virtual_balance(v_caller_member_id);
    v_from_member_balance_after := v_from_member_balance_before - p_amount;
    if v_to_role = 'child' then
      v_to_member_balance_before := public.member_child_virtual_balance(p_to_member_id);
      v_to_member_balance_after := v_to_member_balance_before + p_amount;
    elsif v_to_role in ('admin', 'member') then
      v_float_member_id := p_to_member_id;
      v_float_balance_before := public.member_float(p_to_member_id);
    end if;
  end if;

  insert into public.transactions (
    family_id,
    type,
    amount,
    from_member_id,
    to_member_id,
    from_member_name,
    to_member_name,
    from_member_balance_before,
    from_member_balance_after,
    to_member_balance_before,
    to_member_balance_after,
    float_balance_before,
    float_balance_after,
    note
  ) values (
    v_caller_family,
    'give',
    p_amount,
    v_caller_member_id,
    p_to_member_id,
    v_caller_name,
    v_to_name,
    v_from_member_balance_before,
    v_from_member_balance_after,
    v_to_member_balance_before,
    v_to_member_balance_after,
    v_float_balance_before,
    null,
    p_note
  )
  returning id into v_transaction_id;

  if v_float_member_id is not null then
    v_float_balance_after :=
      public.member_float(v_float_member_id);
    update public.transactions
       set float_balance_after = v_float_balance_after
     where id = v_transaction_id;
  end if;

  return v_transaction_id;
end;
$function$

;

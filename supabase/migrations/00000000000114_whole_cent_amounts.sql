-- =====================================================================
-- Money amounts are whole cents.
--
-- Balances and transaction amounts are numeric(14,2), but the money RPCs took a
-- plain `numeric` amount. A sub-cent amount (e.g. 0.005) was then rounded
-- separately on each side of a move: moving 0.005 from a 10.00 bucket to a 0.00
-- bucket left 10.00 and 0.01, creating a cent. 0.004 rounded the transaction
-- amount to 0.00 and surfaced a raw check-constraint error.
--
-- Every money RPC now rejects an amount that isn't a whole number of cents,
-- before touching any row. Function bodies are otherwise unchanged (copied from
-- their current definitions); CREATE OR REPLACE keeps existing grants.
-- =====================================================================

create or replace function public.assert_whole_cents(p_amount numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount is not null and p_amount <> round(p_amount, 2) then
    raise exception 'amount must be a whole number of cents' using errcode = '22023';
  end if;
end;
$$;

-- Only called from inside the SECURITY DEFINER money RPCs below.
revoke all on function public.assert_whole_cents(numeric) from public, anon, authenticated;
grant execute on function public.assert_whole_cents(numeric) to service_role;

-- move_money
create or replace function public.move_money(p_from_bucket_id uuid, p_to_bucket_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_member_id uuid := public.auth_member_id();
  v_caller_role      text := public.auth_role();
  v_caller_family    uuid := public.auth_family_id();
  v_from_family      uuid;
  v_to_family        uuid;
  v_from_owner       uuid;
  v_to_owner         uuid;
  v_from_balance     numeric;
  v_from_balance_after numeric;
  v_to_balance_before numeric;
  v_to_balance_after numeric;
  v_from_name        text;
  v_to_name          text;
  v_float_before numeric;
  v_float_after numeric;
  v_transaction_id   uuid;
begin
  if v_caller_member_id is null or v_caller_family is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  perform public.assert_whole_cents(p_amount);
  if p_from_bucket_id is null and p_to_bucket_id is null then
    raise exception 'at least one bucket must be specified' using errcode = '22023';
  end if;
  if p_from_bucket_id is not distinct from p_to_bucket_id then
    raise exception 'source and destination must differ' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 280 then
    raise exception 'note too long' using errcode = '22001';
  end if;

  if p_from_bucket_id is null or p_to_bucket_id is null then
    v_float_before := public.member_float(v_caller_member_id);
  end if;

  if p_from_bucket_id is not null then
    select family_id, owner_member_id, allocated_amount, name
      into v_from_family, v_from_owner, v_from_balance, v_from_name
      from public.buckets
     where id = p_from_bucket_id
       for update;
    if not found then
      raise exception 'source bucket not found' using errcode = 'P0002';
    end if;
    if v_from_family <> v_caller_family then
      raise exception 'source bucket not in your family' using errcode = '42501';
    end if;
    if v_caller_role = 'child' and v_from_owner is distinct from v_caller_member_id then
      raise exception 'children can only move from their own buckets'
        using errcode = '42501';
    end if;
    if v_from_balance < p_amount then
      raise exception 'insufficient funds in source bucket' using errcode = '23514';
    end if;
    v_from_balance_after := v_from_balance - p_amount;
  end if;

  if p_to_bucket_id is not null then
    select family_id, owner_member_id, allocated_amount, name
      into v_to_family, v_to_owner, v_to_balance_before, v_to_name
      from public.buckets
     where id = p_to_bucket_id
       for update;
    if not found then
      raise exception 'destination bucket not found' using errcode = 'P0002';
    end if;
    if v_to_family <> v_caller_family then
      raise exception 'destination bucket not in your family' using errcode = '42501';
    end if;
    if v_caller_role = 'child' and v_to_owner is distinct from v_caller_member_id then
      raise exception 'children can only move to their own buckets'
        using errcode = '42501';
    end if;
    v_to_balance_after := v_to_balance_before + p_amount;
  end if;

  if p_from_bucket_id is not null then
    update public.buckets
       set allocated_amount = allocated_amount - p_amount
     where id = p_from_bucket_id;
  end if;
  if p_to_bucket_id is not null then
    update public.buckets
       set allocated_amount = allocated_amount + p_amount
     where id = p_to_bucket_id;
  end if;

  if p_from_bucket_id is null or p_to_bucket_id is null then
    v_float_after := public.member_float(v_caller_member_id);
  end if;

  insert into public.transactions (
    family_id,
    type,
    amount,
    from_bucket_id,
    to_bucket_id,
    from_bucket_name,
    to_bucket_name,
    from_bucket_balance_before,
    from_bucket_balance_after,
    to_bucket_balance_before,
    to_bucket_balance_after,
    float_balance_before,
    float_balance_after,
    from_member_id,
    note
  ) values (
    v_caller_family,
    'bucket_move',
    p_amount,
    p_from_bucket_id,
    p_to_bucket_id,
    v_from_name,
    v_to_name,
    v_from_balance,
    v_from_balance_after,
    v_to_balance_before,
    v_to_balance_after,
    v_float_before,
    v_float_after,
    v_caller_member_id,
    p_note
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$function$;

-- give_money
create or replace function public.give_money(p_to_member_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
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
  perform public.assert_whole_cents(p_amount);

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
$function$;

-- return_from_child
create or replace function public.return_from_child(p_from_child_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
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
  v_child_role       text;
  v_child_family     uuid;
  v_child_name       text;
  v_available        numeric;
  v_from_member_balance_before numeric;
  v_from_member_balance_after numeric;
  v_float_balance_before numeric;
  v_float_balance_after numeric;
  v_transaction_id   uuid;
begin
  if v_caller_member_id is null or v_caller_family is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_caller_role not in ('admin', 'member') then
    raise exception 'only adults can return money from a child' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  perform public.assert_whole_cents(p_amount);

  if p_from_child_id is null then
    raise exception 'child is required' using errcode = '22023';
  end if;

  if p_note is not null and length(p_note) > 280 then
    raise exception 'note too long' using errcode = '22001';
  end if;

  select name
    into v_caller_name
    from public.family_members
   where id = v_caller_member_id;

  select family_id, role, name
    into v_child_family, v_child_role, v_child_name
    from public.family_members
   where id = p_from_child_id
   for update;

  if not found then
    raise exception 'child not found' using errcode = 'P0002';
  end if;

  if v_child_family <> v_caller_family then
    raise exception 'child not in your family' using errcode = '42501';
  end if;

  if v_child_role <> 'child' then
    raise exception 'member is not a child' using errcode = '22023';
  end if;

  if public.member_has_linked_account(p_from_child_id) then
    -- Linked kid: only the VIRTUAL component (net gives) is takeable —
    -- bank cash moves at the real bank. This is the settle path for a
    -- kid who accumulated gives while unlinked and then re-linked.
    v_available := public.member_child_give_net(p_from_child_id);
    if coalesce(v_available, 0) < p_amount then
      raise exception 'amount exceeds the child''s virtual money — bank money moves at the bank'
        using errcode = '23514';
    end if;
  else
    -- Virtual kid: cap at their TOTAL balance (migration 85). Bucket
    -- labels don't shield money; the kid rebalances afterwards.
    v_available := public.member_child_virtual_balance(p_from_child_id);
    if coalesce(v_available, 0) < p_amount then
      raise exception 'amount exceeds the child''s balance' using errcode = '23514';
    end if;
  end if;

  v_from_member_balance_before := public.member_child_virtual_balance(p_from_child_id);
  v_from_member_balance_after := v_from_member_balance_before - p_amount;
  v_float_balance_before := public.member_float(v_caller_member_id);

  insert into public.transactions (
    family_id,
    type,
    amount,
    from_member_id,
    to_member_id,
    from_member_name,
    to_member_name,
    initiated_by_member_id,
    initiated_by_member_name,
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
    p_from_child_id,
    v_caller_member_id,
    v_child_name,
    v_caller_name,
    v_caller_member_id,
    v_caller_name,
    v_from_member_balance_before,
    v_from_member_balance_after,
    null,
    null,
    v_float_balance_before,
    null,
    p_note
  )
  returning id into v_transaction_id;

  v_float_balance_after := public.member_float(v_caller_member_id);
  update public.transactions
     set float_balance_after = v_float_balance_after
   where id = v_transaction_id;

  return v_transaction_id;
end;
$function$;

-- add_manual_account
create or replace function public.add_manual_account(p_amount numeric, p_label text, p_kind text DEFAULT 'cash'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_family_id uuid := public.auth_family_id();
  v_role text := public.auth_role();
  v_label text := nullif(btrim(p_label), '');
  v_id uuid;
begin
  if v_family_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_role <> 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be zero or positive' using errcode = '22023';
  end if;
  perform public.assert_whole_cents(p_amount);
  if v_label is null or length(v_label) > 60 then
    raise exception 'label required (<= 60 chars)' using errcode = '22023';
  end if;
  if p_kind not in ('cash', 'card') then
    raise exception 'kind must be cash or card' using errcode = '22023';
  end if;

  insert into public.accounts (
    family_id,
    owner_member_id,
    source,
    account_type,
    institution_name,
    account_name,
    current_balance,
    teller_account_id,
    teller_enrollment_id,
    last_synced_at
  ) values (
    v_family_id,
    null,
    'manual',
    case p_kind when 'card' then 'credit_card' else 'manual' end,
    v_label,
    v_label,
    p_amount,
    null,
    null,
    now()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- update_manual_account
create or replace function public.update_manual_account(p_account_id uuid, p_amount numeric, p_label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_family_id uuid := public.auth_family_id();
  v_role text := public.auth_role();
  v_label text := nullif(btrim(p_label), '');
begin
  if v_family_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_role <> 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be zero or positive' using errcode = '22023';
  end if;
  perform public.assert_whole_cents(p_amount);
  if v_label is null or length(v_label) > 60 then
    raise exception 'label required (<= 60 chars)' using errcode = '22023';
  end if;

  update public.accounts
     set current_balance = p_amount,
         institution_name = v_label,
         account_name = v_label,
         last_synced_at = now()
   where id = p_account_id
     and family_id = v_family_id
     and source = 'manual';

  if not found then
    raise exception 'manual source not found' using errcode = 'P0002';
  end if;
end;
$function$;

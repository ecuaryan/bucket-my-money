-- =====================================================================
-- Pending credit-card payments (docs/CREDIT_CARDS.md § Pending payments).
--
-- While a card payment is pending the bank may already have taken it from
-- checking, but the card still reports the old amount, so
-- `cash − card debt` subtracts the payment twice until it posts.
--
-- The Plaid refresh path now works out, per card, how much of its debt an
-- in-flight payment already covers (conservatively — see
-- supabase/functions/_shared/pendingCardPayments.ts) and stores it in
-- accounts.pending_payment_credit. The ledger functions subtract
-- `card_effective_debt(balance, pending)` instead of the raw balance.
--
--   accounts.pending_payment_credit  derived, ≥ 0, default 0 (= today's math)
--   plaid_account_signals            the inputs the sync derived it from
--                                    (service-role only; Edge Functions)
-- Setting pending_payment_credit back to 0 restores the old behaviour exactly.
-- =====================================================================

alter table public.accounts
  add column pending_payment_credit numeric(14,2) not null default 0
    check (pending_payment_credit >= 0);

create table public.plaid_account_signals (
  account_id  uuid primary key references public.accounts(id) on delete cascade,
  family_id   uuid not null references public.families(id) on delete cascade,
  signals     jsonb not null,
  observed_at timestamptz not null default now()
);

create index plaid_account_signals_family_idx
  on public.plaid_account_signals (family_id);

-- Same lockdown as the credential tables: RLS on, no policies, no client grants.
alter table public.plaid_account_signals enable row level security;
revoke all on public.plaid_account_signals from public, anon, authenticated;
grant all on public.plaid_account_signals to service_role;

-- Card debt after netting payments already in flight. Never below the balance
-- floor of 0 from netting alone, and a negative (credit) balance is untouched.
create or replace function public.card_effective_debt(
  p_balance numeric,
  p_pending numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select p_balance - least(coalesce(p_pending, 0), greatest(p_balance, 0));
$$;

revoke all on function public.card_effective_debt(numeric, numeric) from public, anon;
grant execute on function public.card_effective_debt(numeric, numeric) to service_role;

-- member_float: card debt is the effective (netted) debt. Otherwise identical
-- to migration 79's definition.
create or replace function public.member_float(p_member_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_family_id   uuid;
  v_role        text;
  v_cash        numeric := 0;
  v_card_debt   numeric := 0;
  v_allocated   numeric := 0;
  v_child_draw  numeric := 0;
  v_send_net    numeric := 0;
begin
  select fm.family_id, fm.role
    into v_family_id, v_role
    from public.family_members fm
   where fm.id = p_member_id;

  if not found then
    return 0;
  end if;

  if v_role in ('admin', 'member') then
    select coalesce(sum(a.current_balance), 0)
      into v_cash
      from public.accounts a
     where a.family_id = v_family_id
       and public.is_cash_account_type(a.account_type);

    select coalesce(sum(public.card_effective_debt(a.current_balance, a.pending_payment_credit)), 0)
      into v_card_debt
      from public.accounts a
     where a.family_id = v_family_id
       and public.is_credit_card_account_type(a.account_type);

    select coalesce(sum(b.allocated_amount), 0)
      into v_allocated
      from public.buckets b
     where b.family_id = v_family_id
       and (
         b.owner_member_id is null
         or exists (
           select 1
             from public.family_members fm
            where fm.id = b.owner_member_id
              and fm.role in ('admin', 'member')
         )
       );

    select coalesce(sum(public.member_child_virtual_balance(fm.id)), 0)
      into v_child_draw
      from public.family_members fm
     where fm.family_id = v_family_id
       and fm.role = 'child';

    return v_cash - v_card_debt - v_allocated - v_child_draw;
  end if;

  select coalesce(sum(a.current_balance), 0)
    into v_cash
    from public.accounts a
   where a.family_id = v_family_id
     and a.owner_member_id = p_member_id
     and public.is_cash_account_type(a.account_type);

  select coalesce(sum(b.allocated_amount), 0)
    into v_allocated
    from public.buckets b
   where b.family_id = v_family_id
     and b.owner_member_id = p_member_id;

  select coalesce(sum(
           case
             when t.to_member_id = p_member_id then t.amount
             when t.from_member_id = p_member_id then -t.amount
             else 0
           end
         ), 0)
    into v_send_net
    from public.transactions t
   where t.family_id = v_family_id
     and t.type = 'give';

  return v_cash + v_send_net - v_allocated;
end;
$$;

-- Breakdown: card_debt is the effective debt (so cash − card_debt − buckets −
-- kids = float still adds up) and card_pending_payments reports what was
-- netted, for the Breakdown line. Otherwise identical to migration 87.
create or replace function public.get_home_balance_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.auth_member_id();
  v_role text := public.auth_role();
  v_family_id uuid := public.auth_family_id();
  v_cash numeric := 0;
  v_bank_cash numeric := 0;
  v_manual_cash numeric := 0;
  v_card_debt numeric := 0;
  v_card_pending numeric := 0;
  v_allocated numeric := 0;
  v_children numeric := 0;
  v_children_json jsonb := '[]'::jsonb;
  v_float numeric := 0;
  v_bank_synced timestamptz := null;
  v_has_linked_bank boolean := false;
begin
  if v_member_id is null or v_family_id is null then
    return jsonb_build_object(
      'float', 0,
      'total_cash', 0,
      'bank_cash', 0,
      'manual_cash', 0,
      'card_debt', 0,
      'card_pending_payments', 0,
      'bucket_allocated', 0,
      'children_set_aside', 0,
      'children', '[]'::jsonb,
      'bank_last_synced_at', null,
      'has_linked_bank', false
    );
  end if;

  v_float := public.member_float(v_member_id);
  v_has_linked_bank := public.member_has_linked_account(v_member_id);

  -- Linked accounts only: a manual edit is not a refresh.
  select max(a.last_synced_at)
    into v_bank_synced
    from public.accounts a
   where a.family_id = v_family_id
     and a.source <> 'manual'
     and (
       public.is_cash_account_type(a.account_type)
       or public.is_credit_card_account_type(a.account_type)
     );

  if v_role in ('admin', 'member') then
    select coalesce(sum(a.current_balance), 0)
      into v_cash
      from public.accounts a
     where a.family_id = v_family_id
       and public.is_cash_account_type(a.account_type);

    select coalesce(sum(a.current_balance), 0)
      into v_bank_cash
      from public.accounts a
     where a.family_id = v_family_id
       and a.source <> 'manual'
       and public.is_cash_account_type(a.account_type);

    select coalesce(sum(a.current_balance), 0)
      into v_manual_cash
      from public.accounts a
     where a.family_id = v_family_id
       and a.source = 'manual'
       and public.is_cash_account_type(a.account_type);

    select coalesce(sum(public.card_effective_debt(a.current_balance, a.pending_payment_credit)), 0)
      into v_card_debt
      from public.accounts a
     where a.family_id = v_family_id
       and public.is_credit_card_account_type(a.account_type);

    -- Payments already in flight (docs/CREDIT_CARDS.md § Pending payments):
    -- the part of card debt that card_debt above already excludes.
    select coalesce(sum(least(a.pending_payment_credit, greatest(a.current_balance, 0))), 0)
      into v_card_pending
      from public.accounts a
     where a.family_id = v_family_id
       and public.is_credit_card_account_type(a.account_type);

    select coalesce(sum(b.allocated_amount), 0)
      into v_allocated
      from public.buckets b
     where b.family_id = v_family_id
       and (
         b.owner_member_id is null
         or exists (
           select 1
             from public.family_members fm
            where fm.id = b.owner_member_id
              and fm.role in ('admin', 'member')
         )
       );

    with child_lines as (
      select
        fm.id as member_id,
        fm.name,
        public.member_child_virtual_balance(fm.id) as amount,
        public.member_float(fm.id) as available_float,
        public.member_child_give_net(fm.id) as give_net
      from public.family_members fm
     where fm.family_id = v_family_id
       and fm.role = 'child'
    )
    select
      coalesce(sum(amount), 0),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'member_id', member_id,
            'name', name,
            'amount', amount,
            'available_float', available_float,
            'give_net', give_net
          )
          order by name
        ),
        '[]'::jsonb
      )
      into v_children, v_children_json
      from child_lines;

  else
    select coalesce(sum(a.current_balance), 0)
      into v_cash
      from public.accounts a
     where a.family_id = v_family_id
     and a.owner_member_id = v_member_id
     and public.is_cash_account_type(a.account_type);

    v_bank_cash := v_cash;
    v_manual_cash := 0;
    v_card_debt := 0;
    v_card_pending := 0;

    select coalesce(sum(b.allocated_amount), 0)
      into v_allocated
      from public.buckets b
     where b.family_id = v_family_id
       and b.owner_member_id = v_member_id;
  end if;

  return jsonb_build_object(
    'float', v_float,
    'total_cash', v_cash,
    'bank_cash', v_bank_cash,
    'manual_cash', v_manual_cash,
    'card_debt', v_card_debt,
    'card_pending_payments', v_card_pending,
    'bucket_allocated', v_allocated,
    'children_set_aside', v_children,
    'children', coalesce(v_children_json, '[]'::jsonb),
    'bank_last_synced_at', v_bank_synced,
    'has_linked_bank', v_has_linked_bank
  );
end;
$$;

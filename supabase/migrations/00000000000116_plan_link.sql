-- =====================================================================
-- Plan → Auto-bucket link (docs/PLAN.md § Link to Auto-bucket).
--
-- A household's plan can link ONE household Auto-bucket rule on a weekly,
-- every-2-weeks, monthly (1 day) or twice-a-month (2 days) schedule. The
-- plan then owns that rule's lines: each Buckets line becomes a rule line
-- whose per-run amount is floor(yearly / runs per year), to the cent: the
-- same math the Plan screen shows.
--
-- Guarantees, enforced in the database (not just the UI):
--   * Every plan change re-syncs the linked rule's lines in the same
--     transaction (statement triggers on plan_lines, including deletes that
--     cascade from a deleted bucket).
--   * Changing the linked rule's schedule re-syncs it, and a schedule with no
--     Plan column (or another kind/owner) is rejected while linked.
--   * Nothing but the sync may write a linked rule's lines: a stale editor or
--     another admin gets an error (guard trigger). The sync marks its own
--     writes with a transaction-local setting clients cannot reach.
--   * delete_bucket never deletes a linked rule that ends up with no lines.
-- Lock order everywhere: plans -> auto_organizes (a run locks only the rule).
-- =====================================================================

-- Runs per year for a linkable schedule; null when the schedule has no Plan column.
-- Monthly days must run every month exactly as counted: 1..28, or 0 (last day).
-- Twice a month needs two distinct days that can't land on the same date (0 and
-- 28 coincide in February).
create or replace function public.plan_rule_runs_per_year(
  p_type text,
  p_interval_count integer,
  p_interval_unit text,
  p_days_of_month integer[]
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'interval' and p_interval_unit = 'week' and p_interval_count = 1 then 52
    when p_type = 'interval' and p_interval_unit = 'week' and p_interval_count = 2 then 26
    when p_type = 'monthly' and cardinality(p_days_of_month) = 1
         and p_days_of_month[1] between 0 and 28 then 12
    when p_type = 'monthly' and cardinality(p_days_of_month) = 2
         and p_days_of_month[1] between 0 and 28
         and p_days_of_month[2] between 0 and 28
         and p_days_of_month[1] <> p_days_of_month[2]
         and not (0 = any (p_days_of_month) and 28 = any (p_days_of_month)) then 24
  end;
$$;

-- Rewrite the linked rule's lines from the plan. p_lock_plan = false only
-- from the schedule trigger, which already holds the rule's row lock (taking
-- the plan lock there would invert the lock order).
create or replace function public._plan_sync_rule(p_plan_id uuid, p_lock_plan boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule  uuid;
  v_ao    public.auto_organizes%rowtype;
  v_runs  integer;
  v_gross numeric;
begin
  if p_lock_plan then
    select auto_organize_id into v_rule from public.plans where id = p_plan_id for update;
  else
    select auto_organize_id into v_rule from public.plans where id = p_plan_id;
  end if;
  if v_rule is null then
    return;
  end if;

  select * into v_ao from public.auto_organizes where id = v_rule for update;
  v_runs := public.plan_rule_runs_per_year(
    v_ao.auto_organize_type, v_ao.interval_count, v_ao.interval_unit, v_ao.days_of_month);
  if v_runs is null or v_ao.auto_organize_kind <> 'organize' or v_ao.owner_member_id is not null then
    raise exception 'the Plan''s rule must be a household Auto-bucket that runs weekly, every 2 weeks, monthly or twice a month'
      using errcode = '22023';
  end if;

  select coalesce(sum(l.amount_cents::numeric * public.plan_periods(l.unit)), 0)
    into v_gross
    from public.plan_lines l
   where l.plan_id = p_plan_id and l.section = 'income';

  perform set_config('app.plan_sync', 'on', true);
  delete from public.auto_organize_lines where auto_organize_id = v_rule;
  insert into public.auto_organize_lines (auto_organize_id, bucket_id, amount, sort_order)
  select v_rule, x.bucket_id, x.cents / 100.0, (row_number() over (order by x.sort_order, x.id) - 1)::integer
    from (
      select l.id, l.bucket_id, l.sort_order,
             public.plan_floor_div(
               public.plan_line_yearly_units(l.unit, l.amount_cents, l.percent_bp, v_gross),
               v_runs * 10000) as cents
        from public.plan_lines l
       where l.plan_id = p_plan_id and l.section = 'buckets' and l.bucket_id is not null
    ) x
   where x.cents >= 1;
  perform set_config('app.plan_sync', 'off', true);
end;
$$;

-- Any change to plan lines re-syncs the plans it touched (one sync per plan
-- per statement; the transition table is named `changed` on each trigger).
create or replace function public._plan_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  for v_plan in select distinct plan_id from changed loop
    if exists (select 1 from public.plans where id = v_plan and auto_organize_id is not null) then
      perform public._plan_sync_rule(v_plan);
    end if;
  end loop;
  return null;
end;
$$;

create trigger plan_lines_sync_after_insert
  after insert on public.plan_lines
  referencing new table as changed
  for each statement execute function public._plan_lines_changed();
create trigger plan_lines_sync_after_update
  after update on public.plan_lines
  referencing new table as changed
  for each statement execute function public._plan_lines_changed();
create trigger plan_lines_sync_after_delete
  after delete on public.plan_lines
  referencing old table as changed
  for each statement execute function public._plan_lines_changed();

-- A linked rule's schedule (or kind/owner) changed: validate and re-sync.
create or replace function public._plan_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  select id into v_plan from public.plans where auto_organize_id = new.id;
  if v_plan is not null then
    perform public._plan_sync_rule(v_plan, false);
  end if;
  return null;
end;
$$;

create trigger auto_organizes_plan_resync
  after update of auto_organize_type, interval_count, interval_unit, days_of_month,
                  auto_organize_kind, owner_member_id
  on public.auto_organizes
  for each row execute function public._plan_rule_changed();

-- Only the plan sync writes a linked rule's lines.
create or replace function public._plan_guard_rule_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules uuid[];
begin
  if coalesce(current_setting('app.plan_sync', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_rules := case tg_op
    when 'INSERT' then array[new.auto_organize_id]
    when 'DELETE' then array[old.auto_organize_id]
    else array[old.auto_organize_id, new.auto_organize_id]
  end;
  -- A rule being deleted takes its lines with it (the rule row is already gone).
  if exists (
    select 1
      from public.plans p
      join public.auto_organizes ao on ao.id = p.auto_organize_id
     where p.auto_organize_id = any(v_rules)
  ) then
    raise exception 'this rule''s buckets and amounts are set in Plan' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger auto_organize_lines_plan_guard
  before insert or update or delete on public.auto_organize_lines
  for each row execute function public._plan_guard_rule_lines();

-- ---------------------------------------------------------------------
-- link_plan_rule(rule | null): link one household rule, or unlink (null).
-- Linking replaces the rule's lines with the plan's; unlinking leaves the
-- rule and its current lines as they are.
-- ---------------------------------------------------------------------
create or replace function public.link_plan_rule(p_auto_organize_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public._plan_admin_family();
  v_plan   uuid := public._plan_lock(v_family);
  v_ao     public.auto_organizes%rowtype;
begin
  if p_auto_organize_id is null then
    update public.plans set auto_organize_id = null, updated_at = now() where id = v_plan;
    return;
  end if;

  select * into v_ao
    from public.auto_organizes
   where id = p_auto_organize_id and family_id = v_family
     for update;
  if not found then
    raise exception 'rule not found' using errcode = '42501';
  end if;
  if v_ao.owner_member_id is not null
     or v_ao.auto_organize_kind <> 'organize'
     or public.plan_rule_runs_per_year(
          v_ao.auto_organize_type, v_ao.interval_count, v_ao.interval_unit, v_ao.days_of_month) is null then
    raise exception 'this rule can''t be linked to the Plan' using errcode = '22023';
  end if;

  update public.plans set auto_organize_id = p_auto_organize_id, updated_at = now() where id = v_plan;
  perform public._plan_sync_rule(v_plan);
end;
$$;

-- ---------------------------------------------------------------------
-- delete_bucket: unchanged except (1) the plan sync may drop the deleted
-- bucket's line from a linked rule, and (2) a linked rule left empty stays.
-- ---------------------------------------------------------------------
create or replace function public.delete_bucket(p_bucket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_family uuid := public.auth_family_id();
  v_caller_role   text := public.auth_role();
  v_member        uuid := public.auth_member_id();
  v_bucket        public.buckets%rowtype;
  v_affected      uuid[];
begin
  if v_caller_family is null or v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select *
    into v_bucket
    from public.buckets
   where id = p_bucket_id
     and family_id = v_caller_family
   for update;

  if not found then
    raise exception 'bucket not found' using errcode = 'P0002';
  end if;

  if v_caller_role = 'admin' then
    null;
  elsif v_caller_role = 'child' then
    if v_bucket.owner_member_id is distinct from v_member then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct l.auto_organize_id), '{}'::uuid[])
    into v_affected
    from public.auto_organize_lines l
    join public.auto_organizes ao on ao.id = l.auto_organize_id
   where l.bucket_id = p_bucket_id
     and ao.family_id = v_caller_family;

  -- (lock order) Take the plan, then its linked rule, before any rule line, the
  -- same order as the plan sync, so a concurrent plan edit can't deadlock with
  -- this delete's cascade into plan_lines.
  perform 1 from public.plans where family_id = v_caller_family for update;
  perform 1
     from public.auto_organizes ao
    where ao.family_id = v_caller_family
      and exists (select 1 from public.plans p where p.auto_organize_id = ao.id)
      for update;

  -- This bucket's line may belong to a rule linked to the Plan, whose lines
  -- only the plan sync may write; removing a deleted bucket is that sync's job
  -- too, so allow it here (transaction-local).
  perform set_config('app.plan_sync', 'on', true);
  delete from public.auto_organize_lines
   where bucket_id = p_bucket_id
     and auto_organize_id = any(v_affected);
  perform set_config('app.plan_sync', 'off', true);

  -- A rule left with no lines is removed, unless the Plan links it: the plan
  -- keeps its rule even when no bucket line currently sends money.
  delete from public.auto_organizes ao
   where ao.id = any(v_affected)
     and ao.family_id = v_caller_family
     and not exists (
       select 1
         from public.auto_organize_lines l
        where l.auto_organize_id = ao.id
     )
     and not exists (
       select 1 from public.plans p where p.auto_organize_id = ao.id
     );

  delete from public.auto_organizes
   where destination_bucket_id = p_bucket_id
     and family_id = v_caller_family;

  if v_bucket.allocated_amount > 0 then
    perform public.move_money(
      p_bucket_id,
      null,
      v_bucket.allocated_amount,
      'Bucket deleted'
    );
  end if;

  delete from public.buckets
   where id = p_bucket_id
     and family_id = v_caller_family;
end;
$function$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on function public.link_plan_rule(uuid) from public, anon;
grant execute on function public.link_plan_rule(uuid) to authenticated, service_role;

revoke all on function public.plan_rule_runs_per_year(text, integer, text, integer[]) from public, anon, authenticated;
revoke all on function public._plan_sync_rule(uuid, boolean) from public, anon, authenticated;
revoke all on function public._plan_lines_changed() from public, anon, authenticated;
revoke all on function public._plan_rule_changed() from public, anon, authenticated;
revoke all on function public._plan_guard_rule_lines() from public, anon, authenticated;
grant execute on function public.plan_rule_runs_per_year(text, integer, text, integer[]) to service_role;
grant execute on function public._plan_sync_rule(uuid, boolean) to service_role;

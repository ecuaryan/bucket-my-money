-- =====================================================================
-- Plan (docs/PLAN.md): a household's zero-based plan for its pay.
--
--   plans        one per family; optionally linked to one Auto-bucket rule
--                (the link and its sync land in a later migration).
--   plan_lines   income / withheld / bills / buckets lines. Each stores ONE
--                typed amount in ONE unit: integer cents for money units,
--                integer basis points for `percent` (10% = 1000). No floats.
--
-- Security model (see SECURITY WARNING in 00000000000000_initial_schema.sql):
--   * Read: RLS, family-scoped, adults only (admin + shared member). Children
--     never see the plan; it shows household income.
--   * Write: no client table privileges at all. Every write goes through the
--     SECURITY DEFINER RPCs below, which require an admin of the same family,
--     lock the family's plan row, and validate every field. Line ids from
--     another family are indistinguishable from missing ones.
--   * Internal helpers and math functions are not executable by clients.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Targets for family-scoped composite FKs: a plan can only ever point at its
-- own family's rule, and a line only at its own family's bucket.
alter table public.buckets
  add constraint buckets_id_family_unique unique (id, family_id);
alter table public.auto_organizes
  add constraint auto_organizes_id_family_unique unique (id, family_id);

create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null unique references public.families(id) on delete cascade,
  auto_organize_id uuid unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- target for plan_lines' composite FK, so a line can never point at
  -- another family's plan
  constraint plans_id_family_unique unique (id, family_id),
  constraint plans_rule_same_family_fk
    foreign key (auto_organize_id, family_id)
    references public.auto_organizes (id, family_id)
    on delete set null (auto_organize_id)
);

create table public.plan_lines (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null,
  plan_id      uuid not null,
  section      text not null
    check (section in ('income', 'withheld', 'bills', 'buckets')),
  name         text,
  unit         text not null
    check (unit in ('week', 'two_weeks', 'twice_month', 'month', 'year', 'percent')),
  amount_cents bigint
    check (amount_cents between 0 and 99999999999),      -- up to $999,999,999.99
  percent_bp   integer
    check (percent_bp between 0 and 10000),               -- 0%..100%
  bucket_id    uuid,
  paid_by      text
    check (paid_by in ('autopay', 'bill_pay', 'by_hand')),
  notes        text
    check (notes is null or char_length(notes) <= 2000),
  sort_order   integer not null default 0 check (sort_order >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint plan_lines_plan_family_fk
    foreign key (plan_id, family_id) references public.plans (id, family_id) on delete cascade,
  constraint plan_lines_bucket_same_family_fk
    foreign key (bucket_id, family_id) references public.buckets (id, family_id) on delete cascade,
  -- exactly one amount, matching the unit
  constraint plan_lines_amount_matches_unit check (
    (unit = 'percent' and percent_bp is not null and amount_cents is null)
    or (unit <> 'percent' and amount_cents is not null and percent_bp is null)
  ),
  constraint plan_lines_income_not_percent check (section <> 'income' or unit <> 'percent'),
  -- a Buckets line IS its bucket: it has the bucket and no name/notes of its own
  constraint plan_lines_bucket_shape check (
    (section = 'buckets' and bucket_id is not null and name is null and notes is null)
    or (section <> 'buckets' and bucket_id is null
        and name is not null and char_length(name) between 1 and 40
        and name ~ '[^[:space:]\u200B-\u200D\u2060\uFEFF]')
  ),
  constraint plan_lines_paid_by_section check (paid_by is null or section in ('bills', 'buckets')),
  constraint plan_lines_one_line_per_bucket unique (plan_id, bucket_id)
);

create index plan_lines_plan_section_idx on public.plan_lines (plan_id, section, sort_order);
create index plan_lines_family_idx on public.plan_lines (family_id);
create index plan_lines_bucket_idx on public.plan_lines (bucket_id) where bucket_id is not null;

comment on table public.plans is 'One zero-based pay plan per family (docs/PLAN.md).';
comment on column public.plan_lines.amount_cents is 'Typed amount in integer cents (money units only).';
comment on column public.plan_lines.percent_bp is 'Typed percent of total gross in basis points (percent unit only).';

-- ---------------------------------------------------------------------
-- RLS + privileges: adults read their own family's plan; nobody writes directly
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_lines enable row level security;

create policy plans_select_adults on public.plans
  for select to authenticated
  using (family_id = public.auth_family_id() and public.auth_role() in ('admin', 'member'));

create policy plan_lines_select_adults on public.plan_lines
  for select to authenticated
  using (family_id = public.auth_family_id() and public.auth_role() in ('admin', 'member'));

revoke all on public.plans, public.plan_lines from public, anon, authenticated;
grant select on public.plans, public.plan_lines to authenticated;
grant all on public.plans, public.plan_lines to service_role;

alter publication supabase_realtime add table public.plans;
alter publication supabase_realtime add table public.plan_lines;
alter table public.plans replica identity full;
alter table public.plan_lines replica identity full;

-- ---------------------------------------------------------------------
-- Exact integer math (mirrors src/lib/planMath.ts; shared test vectors).
-- Yearly amounts are in ten-thousandths of a cent so % lines stay exact.
-- ---------------------------------------------------------------------

-- True floor division for b > 0 (div() truncates toward zero).
create or replace function public.plan_floor_div(p_a numeric, p_b numeric)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_b <= 0 or p_a <> trunc(p_a) or p_b <> trunc(p_b) then null
    else div(p_a, p_b) - case when mod(p_a, p_b) < 0 then 1 else 0 end
  end;
$$;

create or replace function public.plan_periods(p_unit text)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case p_unit
    when 'week' then 52
    when 'two_weeks' then 26
    when 'twice_month' then 24
    when 'month' then 12
    when 'year' then 1
  end;
$$;

-- A line's yearly amount in ten-thousandths of a cent.
create or replace function public.plan_line_yearly_units(
  p_unit text,
  p_amount_cents bigint,
  p_percent_bp integer,
  p_gross_yearly_cents numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_unit = 'percent' then p_gross_yearly_cents * coalesce(p_percent_bp, 0)
    else coalesce(p_amount_cents, 0)::numeric * public.plan_periods(p_unit) * 10000
  end;
$$;

-- ---------------------------------------------------------------------
-- Internal helpers (definer RPCs only)
-- ---------------------------------------------------------------------

-- The caller's family, if the caller is an admin; otherwise an error.
create or replace function public._plan_admin_family()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.auth_family_id();
begin
  if public.auth_member_id() is null or v_family is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.auth_role() is distinct from 'admin' then
    raise exception 'only admins can change the plan' using errcode = '42501';
  end if;
  return v_family;
end;
$$;

-- The family's plan id (created on first use), locked for this transaction so
-- concurrent plan edits run one after another. Lock order everywhere:
-- plans -> auto_organizes.
create or replace function public._plan_lock(p_family_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  insert into public.plans (family_id) values (p_family_id)
  on conflict (family_id) do nothing;

  select id into v_plan
    from public.plans
   where family_id = p_family_id
     for update;
  return v_plan;
end;
$$;

-- Trim whitespace (incl. tabs/newlines and zero-width characters) from both
-- ends; null when nothing visible is left.
create or replace function public._plan_clean_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(coalesce(p_name, ''),
                   '^[[:space:]\u200B-\u200D\u2060\uFEFF]+|[[:space:]\u200B-\u200D\u2060\uFEFF]+$',
                   '', 'g'),
    '');
$$;

create or replace function public._plan_check_amount(
  p_section text,
  p_unit text,
  p_amount_cents bigint,
  p_percent_bp integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_unit is null or p_unit not in ('week', 'two_weeks', 'twice_month', 'month', 'year', 'percent') then
    raise exception 'invalid unit' using errcode = '22023';
  end if;
  if p_unit = 'percent' then
    if p_section = 'income' then
      raise exception 'income cannot be a percentage' using errcode = '22023';
    end if;
    if p_percent_bp is null or p_amount_cents is not null
       or p_percent_bp < 0 or p_percent_bp > 10000 then
      raise exception 'percent must be between 0 and 100' using errcode = '22023';
    end if;
  else
    if p_amount_cents is null or p_percent_bp is not null
       or p_amount_cents < 0 or p_amount_cents > 99999999999 then
      raise exception 'amount out of range' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- add_plan_line(...) -> line id
-- Adding the first income also adds starter Withheld lines at $0 in the
-- income's unit (docs/PLAN.md § First visit).
-- ---------------------------------------------------------------------
create or replace function public.add_plan_line(
  p_section text,
  p_unit text,
  p_amount_cents bigint default null,
  p_percent_bp integer default null,
  p_name text default null,
  p_bucket_id uuid default null,
  p_paid_by text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public._plan_admin_family();
  v_plan   uuid;
  v_name   text := public._plan_clean_name(p_name);
  v_notes  text := nullif(p_notes, '');
  v_first_income boolean;
  v_adding integer;
  v_id     uuid;
  v_order  integer;
  v_starter text;
  v_i      integer := 0;
begin
  if p_section is null or p_section not in ('income', 'withheld', 'bills', 'buckets') then
    raise exception 'invalid section' using errcode = '22023';
  end if;
  perform public._plan_check_amount(p_section, p_unit, p_amount_cents, p_percent_bp);
  if p_paid_by is not null and (p_paid_by not in ('autopay', 'bill_pay', 'by_hand')
                                or p_section not in ('bills', 'buckets')) then
    raise exception 'invalid paid_by' using errcode = '22023';
  end if;

  if p_section = 'buckets' then
    if p_bucket_id is null or v_name is not null or v_notes is not null then
      raise exception 'a bucket line takes its bucket''s name and notes' using errcode = '22023';
    end if;
  else
    if p_bucket_id is not null then
      raise exception 'only bucket lines have a bucket' using errcode = '22023';
    end if;
    if v_name is null or char_length(v_name) > 40 then
      raise exception 'name must be 1 to 40 characters' using errcode = '22023';
    end if;
    if v_notes is not null and char_length(v_notes) > 2000 then
      raise exception 'note too long' using errcode = '22001';
    end if;
  end if;

  v_plan := public._plan_lock(v_family);

  if p_section = 'buckets' then
    -- household (family-pool) bucket of this family only
    perform 1
      from public.buckets b
     where b.id = p_bucket_id
       and b.family_id = v_family
       and b.owner_member_id is null;
    if not found then
      raise exception 'bucket not found' using errcode = '42501';
    end if;
    if exists (select 1 from public.plan_lines where plan_id = v_plan and bucket_id = p_bucket_id) then
      raise exception 'bucket is already on the plan' using errcode = '23505';
    end if;
  end if;

  v_first_income := p_section = 'income'
    and not exists (
      select 1 from public.plan_lines
       where plan_id = v_plan and section in ('income', 'withheld')
    );

  -- the first income brings 8 starter lines with it
  v_adding := case when v_first_income then 9 else 1 end;
  if (select count(*) from public.plan_lines where plan_id = v_plan) + v_adding > 300 then
    raise exception 'plan line limit reached' using errcode = '54000';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_order
    from public.plan_lines
   where plan_id = v_plan and section = p_section;

  insert into public.plan_lines (
    family_id, plan_id, section, name, unit, amount_cents, percent_bp,
    bucket_id, paid_by, notes, sort_order
  ) values (
    v_family, v_plan, p_section, v_name, p_unit, p_amount_cents, p_percent_bp,
    p_bucket_id, p_paid_by, v_notes, v_order
  )
  returning id into v_id;

  if v_first_income then
    foreach v_starter in array array[
      'Federal income tax', 'State income tax', 'Social Security', 'Medicare',
      'Medical insurance', 'Dental insurance', 'Vision insurance', '401(k)'
    ] loop
      insert into public.plan_lines (family_id, plan_id, section, name, unit, amount_cents, sort_order)
      values (v_family, v_plan, 'withheld', v_starter, p_unit, 0, v_i);
      v_i := v_i + 1;
    end loop;
  end if;

  update public.plans set updated_at = now() where id = v_plan;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- set_plan_line_amount(line, unit, cents | bp)
-- The table's cell edit: the typed column becomes the line's input.
-- ---------------------------------------------------------------------
create or replace function public.set_plan_line_amount(
  p_line_id uuid,
  p_unit text,
  p_amount_cents bigint default null,
  p_percent_bp integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family  uuid := public._plan_admin_family();
  v_plan    uuid := public._plan_lock(v_family);
  v_section text;
begin
  select section into v_section
    from public.plan_lines
   where id = p_line_id and plan_id = v_plan
     for update;
  if not found then
    raise exception 'line not found' using errcode = '42501';
  end if;

  perform public._plan_check_amount(v_section, p_unit, p_amount_cents, p_percent_bp);

  update public.plan_lines
     set unit = p_unit,
         amount_cents = case when p_unit = 'percent' then null else p_amount_cents end,
         percent_bp = case when p_unit = 'percent' then p_percent_bp else null end,
         updated_at = now()
   where id = p_line_id;

  update public.plans set updated_at = now() where id = v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- update_plan_line_details(line, name, paid_by, notes)
-- The line sheet's Save. Bucket lines rename/annotate through the bucket
-- itself, so name and notes must be null for them.
-- ---------------------------------------------------------------------
create or replace function public.update_plan_line_details(
  p_line_id uuid,
  p_name text default null,
  p_paid_by text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family  uuid := public._plan_admin_family();
  v_plan    uuid := public._plan_lock(v_family);
  v_section text;
  v_name    text := public._plan_clean_name(p_name);
  v_notes   text := nullif(p_notes, '');
begin
  select section into v_section
    from public.plan_lines
   where id = p_line_id and plan_id = v_plan
     for update;
  if not found then
    raise exception 'line not found' using errcode = '42501';
  end if;

  if p_paid_by is not null and (p_paid_by not in ('autopay', 'bill_pay', 'by_hand')
                                or v_section not in ('bills', 'buckets')) then
    raise exception 'invalid paid_by' using errcode = '22023';
  end if;

  if v_section = 'buckets' then
    if v_name is not null or v_notes is not null then
      raise exception 'a bucket line takes its bucket''s name and notes' using errcode = '22023';
    end if;
  else
    if v_name is null or char_length(v_name) > 40 then
      raise exception 'name must be 1 to 40 characters' using errcode = '22023';
    end if;
    if v_notes is not null and char_length(v_notes) > 2000 then
      raise exception 'note too long' using errcode = '22001';
    end if;
  end if;

  update public.plan_lines
     set name = case when v_section = 'buckets' then null else v_name end,
         paid_by = p_paid_by,
         notes = case when v_section = 'buckets' then null else v_notes end,
         updated_at = now()
   where id = p_line_id;

  update public.plans set updated_at = now() where id = v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- delete_plan_line(line) — never touches a bucket or money
-- ---------------------------------------------------------------------
create or replace function public.delete_plan_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public._plan_admin_family();
  v_plan   uuid := public._plan_lock(v_family);
begin
  delete from public.plan_lines
   where id = p_line_id and plan_id = v_plan;
  if not found then
    raise exception 'line not found' using errcode = '42501';
  end if;
  update public.plans set updated_at = now() where id = v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- reorder_plan_lines(section, ids in new order)
-- The ids must be exactly the section's current lines.
-- ---------------------------------------------------------------------
create or replace function public.reorder_plan_lines(p_section text, p_line_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public._plan_admin_family();
  v_plan   uuid := public._plan_lock(v_family);
  v_current uuid[];
begin
  if p_section is null or p_section not in ('income', 'withheld', 'bills', 'buckets') then
    raise exception 'invalid section' using errcode = '22023';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_current
    from public.plan_lines
   where plan_id = v_plan and section = p_section;

  if p_line_ids is null
     or cardinality(p_line_ids) <> cardinality(v_current)
     or (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_line_ids) x) <> v_current then
    raise exception 'ids must be exactly the section''s lines' using errcode = '22023';
  end if;

  update public.plan_lines l
     set sort_order = o.ord - 1,
         updated_at = now()
    from unnest(p_line_ids) with ordinality as o(id, ord)
   where l.id = o.id and l.plan_id = v_plan;

  update public.plans set updated_at = now() where id = v_plan;
end;
$$;

-- ---------------------------------------------------------------------
-- A bucket line must stay a household bucket. If a bucket is given an owner
-- (it becomes someone's personal bucket), it leaves the plan.
-- ---------------------------------------------------------------------
create or replace function public._plan_drop_personal_bucket_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.plan_lines where bucket_id = new.id;
  return new;
end;
$$;

create trigger buckets_leave_plan_when_owned
  after update of owner_member_id on public.buckets
  for each row
  when (new.owner_member_id is not null and old.owner_member_id is null)
  execute function public._plan_drop_personal_bucket_lines();

-- ---------------------------------------------------------------------
-- Privileges: client RPCs for signed-in users (each checks admin itself);
-- helpers and math are definer/service-role only.
-- ---------------------------------------------------------------------
revoke all on function public.add_plan_line(text, text, bigint, integer, text, uuid, text, text) from public, anon;
revoke all on function public.set_plan_line_amount(uuid, text, bigint, integer) from public, anon;
revoke all on function public.update_plan_line_details(uuid, text, text, text) from public, anon;
revoke all on function public.delete_plan_line(uuid) from public, anon;
revoke all on function public.reorder_plan_lines(text, uuid[]) from public, anon;

grant execute on function public.add_plan_line(text, text, bigint, integer, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.set_plan_line_amount(uuid, text, bigint, integer) to authenticated, service_role;
grant execute on function public.update_plan_line_details(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.delete_plan_line(uuid) to authenticated, service_role;
grant execute on function public.reorder_plan_lines(text, uuid[]) to authenticated, service_role;

revoke all on function public._plan_admin_family() from public, anon, authenticated;
revoke all on function public._plan_lock(uuid) from public, anon, authenticated;
revoke all on function public._plan_check_amount(text, text, bigint, integer) from public, anon, authenticated;
revoke all on function public._plan_clean_name(text) from public, anon, authenticated;
revoke all on function public._plan_drop_personal_bucket_lines() from public, anon, authenticated;
revoke all on function public.plan_floor_div(numeric, numeric) from public, anon, authenticated;
revoke all on function public.plan_periods(text) from public, anon, authenticated;
revoke all on function public.plan_line_yearly_units(text, bigint, integer, numeric) from public, anon, authenticated;

grant execute on function public._plan_admin_family() to service_role;
grant execute on function public._plan_lock(uuid) to service_role;
grant execute on function public._plan_check_amount(text, text, bigint, integer) to service_role;
grant execute on function public._plan_clean_name(text) to service_role;
grant execute on function public.plan_floor_div(numeric, numeric) to service_role;
grant execute on function public.plan_periods(text) to service_role;
grant execute on function public.plan_line_yearly_units(text, bigint, integer, numeric) to service_role;

-- =====================================================================
-- Linking never silently empties a rule (docs/PLAN.md § Link to Auto-bucket).
--
-- Linking makes the plan's Buckets section the rule's lines. When that
-- section is empty, linking used to leave the rule with no lines at all.
-- Now a plan with no Buckets lines starts from the rule's: each rule line is
-- copied into the plan as a Buckets line in the column that matches the
-- rule's schedule, at its per-run amount. That column converts exactly
-- (yearly = per run x runs per year), so the sync writes back the same lines
-- and the rule moves the same money as before.
--
-- A plan that already has Buckets lines still replaces the rule's lines;
-- the app's confirm says how many are replaced, by how many.
-- =====================================================================

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
  v_unit   text;
  v_import integer;
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
  v_unit := case public.plan_rule_runs_per_year(
                   v_ao.auto_organize_type, v_ao.interval_count, v_ao.interval_unit, v_ao.days_of_month)
              when 52 then 'week'
              when 26 then 'two_weeks'
              when 24 then 'twice_month'
              when 12 then 'month'
            end;
  if v_ao.owner_member_id is not null or v_ao.auto_organize_kind <> 'organize' or v_unit is null then
    raise exception 'this rule can''t be linked to the Plan' using errcode = '22023';
  end if;

  -- Link first: the copy below then re-syncs this rule (to the same lines),
  -- never a rule the plan was linked to before.
  update public.plans set auto_organize_id = p_auto_organize_id, updated_at = now() where id = v_plan;

  if not exists (select 1 from public.plan_lines where plan_id = v_plan and section = 'buckets') then
    -- Household rules only move money into household buckets (checked when
    -- a rule runs); the filter keeps the copy inside what a plan may hold.
    select count(distinct l.bucket_id) into v_import
      from public.auto_organize_lines l
      join public.buckets b on b.id = l.bucket_id
     where l.auto_organize_id = p_auto_organize_id
       and b.family_id = v_family
       and b.owner_member_id is null;

    if v_import > 0 then
      if (select count(*) from public.plan_lines where plan_id = v_plan) + v_import > 300 then
        raise exception 'plan line limit reached' using errcode = '54000';
      end if;

      insert into public.plan_lines (family_id, plan_id, section, unit, amount_cents, bucket_id, sort_order)
      select v_family, v_plan, 'buckets', v_unit,
             (sum(l.amount) * 100)::bigint,  -- numeric(14,2): whole cents, exact
             l.bucket_id,
             (row_number() over (order by min(l.sort_order), l.bucket_id) - 1)::integer
        from public.auto_organize_lines l
        join public.buckets b on b.id = l.bucket_id
       where l.auto_organize_id = p_auto_organize_id
         and b.family_id = v_family
         and b.owner_member_id is null
       group by l.bucket_id;
    end if;
  end if;

  perform public._plan_sync_rule(v_plan);
end;
$$;

revoke all on function public.link_plan_rule(uuid) from public, anon;
grant execute on function public.link_plan_rule(uuid) to authenticated, service_role;

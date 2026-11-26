-- =====================================================================
-- Plan hardening (security review follow-ups). Two races that need two
-- admins of one household acting at the same moment, plus a size cap.
--
-- 1. A direct write to a rule's lines could slip in while the rule was being
--    linked: the guard read "not linked" before link_plan_rule committed. The
--    guard now waits on the rule row first (link_plan_rule holds it FOR
--    UPDATE), so its check sees the link. Lock order stays plans -> rules.
--
-- 2. A bucket made personal while it was being added to the plan (by
--    add_plan_line or by link_plan_rule's copy) could stay on the plan: the
--    "leave the plan" trigger ran before the add committed and found nothing.
--    The trigger now takes the family's plan lock first, so it waits for any
--    plan write in flight and then removes the line. Lock order matches
--    delete_bucket (bucket -> plans), so this adds no deadlock.
--
-- 3. Bucket notes had no length limit in the database (plan line notes cap at
--    2000). Cap them at 10,000 characters. NOT VALID: it applies to new
--    writes and never blocks this deploy on an existing note.
-- =====================================================================

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
  -- Wait for a link in flight (link_plan_rule holds the rule FOR UPDATE until
  -- it commits); the next statement then sees it.
  perform 1 from public.auto_organizes where id = any(v_rules) for share;
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

create or replace function public._plan_drop_personal_bucket_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize with plan writes (they all hold this lock), then drop the line.
  perform 1 from public.plans where family_id = new.family_id for update;
  delete from public.plan_lines where bucket_id = new.id;
  return new;
end;
$$;

revoke all on function public._plan_guard_rule_lines() from public, anon, authenticated;
revoke all on function public._plan_drop_personal_bucket_lines() from public, anon, authenticated;

alter table public.buckets
  add constraint buckets_notes_length check (notes is null or char_length(notes) <= 10000) not valid;

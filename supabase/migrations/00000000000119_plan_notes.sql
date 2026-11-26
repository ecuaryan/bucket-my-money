-- =====================================================================
-- Plan notes (docs/PLAN.md § Notes): one free-text note for the whole
-- household plan, shown under the table. For what the table can't hold,
-- like what's on autopay and where things are, so a partner can find it.
--
-- Same access as the plan: admins and shared members read it (existing RLS
-- on plans), only admins write it (set_plan_notes), kids never see it.
-- =====================================================================

alter table public.plans
  add column notes text
    constraint plans_notes_length check (notes is null or char_length(notes) <= 20000);

-- set_plan_notes(text | null): replace the household's plan notes. Blank
-- (only whitespace) clears them.
create or replace function public.set_plan_notes(p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public._plan_admin_family();
  v_plan   uuid := public._plan_lock(v_family);
  v_notes  text := case when coalesce(p_notes, '') ~ '^[[:space:]]*$' then null else p_notes end;
begin
  if v_notes is not null and char_length(v_notes) > 20000 then
    raise exception 'notes too long' using errcode = '22001';
  end if;
  update public.plans set notes = v_notes, updated_at = now() where id = v_plan;
end;
$$;

revoke all on function public.set_plan_notes(text) from public, anon;
grant execute on function public.set_plan_notes(text) to authenticated, service_role;

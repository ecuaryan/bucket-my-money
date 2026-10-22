-- =====================================================================
-- Bucket groups: purely visual, per-member grouping of the Buckets tab
-- (e.g. "Cruise", "Kids"). Like member_bucket_order, groups belong to one
-- member and never affect balances, RLS on buckets, or other members.
--
--   member_bucket_groups   one row per group a member created, plus (at most)
--                          one `is_ungrouped` row that only stores WHERE the
--                          implicit "Ungrouped" section sits among the groups.
--   member_bucket_order.group_id   which group a bucket is in (null = Ungrouped)
--
-- Collapsed/expanded state is deliberately NOT stored here: it is a per-device
-- view preference kept in localStorage (see bucketGroupCollapse.ts).
--
-- All writes go through SECURITY DEFINER RPCs; the tables are read-only to
-- clients (own rows only).
-- =====================================================================

create table public.member_bucket_groups (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.family_members(id) on delete cascade,
  name          text,
  display_order int  not null default 0,
  is_ungrouped  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint member_bucket_groups_name_len
    check (name is null or char_length(name) <= 40)
);

create index member_bucket_groups_member_idx
  on public.member_bucket_groups (member_id, display_order);

-- At most one Ungrouped position row per member.
create unique index member_bucket_groups_one_ungrouped
  on public.member_bucket_groups (member_id) where is_ungrouped;

alter table public.member_bucket_groups enable row level security;

create policy member_bucket_groups_select_own
  on public.member_bucket_groups
  for select
  to authenticated
  using (member_id = public.auth_member_id());

revoke all on public.member_bucket_groups from public, anon, authenticated;
grant select on public.member_bucket_groups to authenticated;
grant all on public.member_bucket_groups to service_role;

alter table public.member_bucket_order
  add column group_id uuid references public.member_bucket_groups(id) on delete set null;

alter publication supabase_realtime add table public.member_bucket_groups;
alter table public.member_bucket_groups replica identity full;

-- ---------------------------------------------------------------------
-- create_bucket_group(name) -> id
-- A new group lands at the bottom, right by the "New group" button, so it is
-- always in view even when the list is long. The first group also creates
-- the Ungrouped position row (holding every existing bucket) above it.
-- ---------------------------------------------------------------------
create or replace function public.create_bucket_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.auth_member_id();
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_new    uuid;
begin
  if v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'group name too long' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.member_bucket_groups
     where member_id = v_member and is_ungrouped
  ) then
    insert into public.member_bucket_groups (member_id, is_ungrouped, display_order)
    values (v_member, true, 1);
  end if;

  insert into public.member_bucket_groups (member_id, name, display_order)
  select v_member, v_name, coalesce(max(display_order), 0) + 1
    from public.member_bucket_groups
   where member_id = v_member
  returning id into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- rename_bucket_group(id, name)  — null/blank clears the name
-- ---------------------------------------------------------------------
create or replace function public.rename_bucket_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid := public.auth_member_id();
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'group name too long' using errcode = '22023';
  end if;

  update public.member_bucket_groups
     set name = v_name
   where id = p_group_id and member_id = v_member and not is_ungrouped;
  if not found then
    raise exception 'group not found' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- delete_bucket_group(id)
-- Removes only the group. Its buckets fall back to Ungrouped; no money,
-- bucket, or history row is touched. Deleting the last real group also
-- drops the Ungrouped position row (back to a plain list).
-- ---------------------------------------------------------------------
create or replace function public.delete_bucket_group(p_group_id uuid)
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

  delete from public.member_bucket_groups
   where id = p_group_id and member_id = v_member and not is_ungrouped;
  if not found then
    raise exception 'group not found' using errcode = '42501';
  end if;
  -- member_bucket_order.group_id is ON DELETE SET NULL → buckets are Ungrouped.

  if not exists (
    select 1 from public.member_bucket_groups
     where member_id = v_member and not is_ungrouped
  ) then
    delete from public.member_bucket_groups
     where member_id = v_member and is_ungrouped;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- save_bucket_layout(layout jsonb)
-- Atomically persist the whole Buckets-tab layout after a drag:
--   [ { "group_id": <uuid|null>, "bucket_ids": [<uuid>, ...] }, ... ]
-- in display order. group_id null = the Ungrouped section. Must list every
-- existing group (and Ungrouped) once and every visible bucket once.
-- Writes group order, each bucket's group, and the flat bucket order
-- (so older flat-order readers stay consistent).
-- ---------------------------------------------------------------------
create or replace function public.save_bucket_layout(p_layout jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family   uuid := public.auth_family_id();
  v_role     text := public.auth_role();
  v_member   uuid := public.auth_member_id();
  v_ungrp    uuid;
  v_entry    jsonb;
  v_gid      uuid;
  v_gids     uuid[] := '{}';
  v_bids     uuid[] := '{}';
  v_entry_b  uuid[];
  v_expected uuid[];
  v_expected_g uuid[];
  v_has_ungrouped boolean := false;
  v_idx      int := 0;
  v_flat     int := 0;
  v_b        uuid;
begin
  if v_family is null or v_member is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_layout is null or jsonb_typeof(p_layout) <> 'array' then
    raise exception 'layout must be an array' using errcode = '22023';
  end if;

  perform public.ensure_member_bucket_orders();

  select id into v_ungrp
    from public.member_bucket_groups
   where member_id = v_member and is_ungrouped;

  -- Expected: every visible bucket, every group (incl. Ungrouped row if any).
  select coalesce(array_agg(mbo.bucket_id order by mbo.bucket_id), '{}'::uuid[])
    into v_expected
    from public.member_bucket_order mbo
    join public.buckets b on b.id = mbo.bucket_id
   where mbo.member_id = v_member and b.family_id = v_family;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_expected_g
    from public.member_bucket_groups
   where member_id = v_member;

  -- First pass: validate shape and collect ids.
  for v_entry in select * from jsonb_array_elements(p_layout) loop
    if v_entry->>'group_id' is null then
      if v_has_ungrouped then
        raise exception 'ungrouped listed twice' using errcode = '22023';
      end if;
      v_has_ungrouped := true;
    else
      v_gids := v_gids || (v_entry->>'group_id')::uuid;
    end if;

    select coalesce(array_agg(x::uuid), '{}'::uuid[])
      into v_entry_b
      from jsonb_array_elements_text(coalesce(v_entry->'bucket_ids', '[]'::jsonb)) as t(x);
    v_bids := v_bids || v_entry_b;
  end loop;

  if (select coalesce(array_agg(x order by x), '{}'::uuid[]) from unnest(v_bids) as t(x))
       is distinct from v_expected then
    raise exception 'layout must include every visible bucket exactly once'
      using errcode = '22023';
  end if;

  if v_has_ungrouped and v_ungrp is not null then
    v_gids := v_gids || v_ungrp;
  end if;
  if (select coalesce(array_agg(x order by x), '{}'::uuid[]) from unnest(v_gids) as t(x))
       is distinct from v_expected_g then
    raise exception 'layout must include every group exactly once'
      using errcode = '22023';
  end if;

  if v_role = 'child' and exists (
    select 1 from public.buckets b
     where b.id = any (v_bids) and b.owner_member_id is distinct from v_member
  ) then
    raise exception 'children cannot reorder buckets' using errcode = '42501';
  end if;

  -- Second pass: write.
  for v_entry in select * from jsonb_array_elements(p_layout) loop
    v_idx := v_idx + 1;
    if v_entry->>'group_id' is null then
      v_gid := null;
      if v_ungrp is not null then
        update public.member_bucket_groups set display_order = v_idx where id = v_ungrp;
      end if;
    else
      v_gid := (v_entry->>'group_id')::uuid;
      update public.member_bucket_groups set display_order = v_idx where id = v_gid;
    end if;

    for v_b in
      select x::uuid from jsonb_array_elements_text(coalesce(v_entry->'bucket_ids', '[]'::jsonb)) as t(x)
    loop
      v_flat := v_flat + 1;
      update public.member_bucket_order
         set group_id = v_gid, display_order = v_flat
       where member_id = v_member and bucket_id = v_b;
    end loop;
  end loop;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_bucket_group(text)',
    'rename_bucket_group(uuid, text)',
    'delete_bucket_group(uuid)',
    'save_bucket_layout(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;

-- =====================================================================
-- Household limits (CONTEXT.md § Household limits).
--
-- Anyone can sign up, so one household must not be able to grow without
-- bound: a script (or a curious kid) adding members, buckets or rules in a
-- loop would bloat the database, slow the hourly Auto-bucket run and eat the
-- free tier. Each limit is far above what a real family uses.
--
-- One statement-level trigger per table counts the rows of every household
-- (or member, or rule) the statement inserted into, after the insert, and
-- rolls the statement back when one is over. That covers every path at once:
-- client inserts under RLS, SECURITY DEFINER RPCs, Edge Functions on the
-- service role, and bulk inserts.
--
-- Two inserts racing at the limit can both pass, so a household can end up a
-- row or two over. That's fine for a guard against runaway growth.
-- =====================================================================

-- _enforce_row_limit(column, max, message): AFTER INSERT ... FOR EACH STATEMENT
-- with REFERENCING NEW TABLE AS new_rows. SECURITY DEFINER so the count sees
-- every row, not only the ones the caller's RLS shows (a child sees only
-- their own buckets).
create or replace function public._enforce_row_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column  text    := tg_argv[0];
  v_max     integer := tg_argv[1]::integer;
  v_message text    := tg_argv[2];
  v_over    boolean;
begin
  execute format(
    'select exists (
       select 1
         from %1$I.%2$I t
        where t.%3$I in (select n.%3$I from new_rows n)
        group by t.%3$I
       having count(*) > $1
     )',
    tg_table_schema, tg_table_name, v_column
  )
  into v_over
  using v_max;

  if v_over then
    raise exception '%', v_message using errcode = '54000';
  end if;
  return null;
end;
$$;

revoke all on function public._enforce_row_limit() from public, anon, authenticated;

create trigger family_members_limit
  after insert on public.family_members
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('family_id', '25', 'A household can have up to 25 members.');

create trigger buckets_limit
  after insert on public.buckets
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('family_id', '500', 'A household can have up to 500 buckets.');

create trigger accounts_limit
  after insert on public.accounts
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('family_id', '100', 'A household can have up to 100 accounts.');

create trigger auto_organizes_limit
  after insert on public.auto_organizes
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('family_id', '100', 'A household can have up to 100 Auto-bucket rules.');

create trigger auto_organize_lines_limit
  after insert on public.auto_organize_lines
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('auto_organize_id', '300', 'An Auto-bucket rule can have up to 300 buckets.');

-- Counts the hidden Ungrouped row too: 51 rows is 50 named groups.
create trigger member_bucket_groups_limit
  after insert on public.member_bucket_groups
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('member_id', '51', 'You can have up to 50 groups.');

create trigger bitcoin_entries_limit
  after insert on public.bitcoin_entries
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('family_id', '2000', 'A household can have up to 2,000 Bitcoin entries.');

create trigger member_passkeys_limit
  after insert on public.member_passkeys
  referencing new table as new_rows
  for each statement
  execute function public._enforce_row_limit('member_id', '20', 'You can have up to 20 passkeys.');

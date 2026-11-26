-- Yesterday's (UTC) error report counts, as "reports|errors|new": numbers
-- only, never report text (that stays private in the Supabase dashboard).
-- "new" = errors first seen that day. See docs/MAINTENANCE.md § Error reports.
start transaction read only;

select coalesce(sum(y.count), 0) || '|' || count(*) || '|' ||
       count(*) filter (
         where not exists (
           select 1 from public.client_errors e
            where e.fingerprint = y.fingerprint and e.day < y.day
         )
       )
  from public.client_errors y
 where y.day = (now() at time zone 'utc')::date - 1;

commit;

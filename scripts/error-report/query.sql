-- Yesterday's (UTC) client errors, most frequent first, as one JSON array.
-- "new" = first seen that day. Read-only. See docs/MAINTENANCE.md § Error reports.
with yesterday as (
  select * from public.client_errors where day = (now() at time zone 'utc')::date - 1
)
select coalesce(json_agg(row_to_json(t) order by t.count desc), '[]'::json)
  from (
    select y.count, y.kind, y.message, y.stack, y.route, y.app_version, y.browser,
           not exists (
             select 1 from public.client_errors e
              where e.fingerprint = y.fingerprint and e.day < y.day
           ) as is_new
      from yesterday y
     order by y.count desc
     limit 20
  ) t;

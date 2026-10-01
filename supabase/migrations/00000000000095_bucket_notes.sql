-- Bucket notes: freeform per-bucket description of what the bucket is for
-- and what should come out of it. Nullable text; visibility inherits the
-- bucket row's RLS (children only see buckets they own, so they never
-- see notes on buckets they can't see).

alter table public.buckets
  add column notes text;

comment on column public.buckets.notes is
  'Freeform notes describing what the bucket is for.';

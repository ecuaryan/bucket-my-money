#!/usr/bin/env bash
# Proves a backup can actually be restored: decrypts it, restores it into a
# throwaway Postgres, and checks the public tables came back.
#   BACKUP_ENCRYPTION_KEY passphrase
#   BACKUP_DATABASE_URL   source database, for the table-list comparison
# Usage: scripts/backup/verify-restore.sh <backup.dump.gpg>
set -euo pipefail

file="${1:?usage: verify-restore.sh <backup.dump.gpg>}"
: "${BACKUP_ENCRYPTION_KEY:?}" "${BACKUP_DATABASE_URL:?}"

name="bmm-restore-test-$$"
work="$(mktemp -d)"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
  --decrypt --output "$work/backup.dump" "$file" 3<<<"$BACKUP_ENCRYPTION_KEY"

docker run -d --name "$name" -e POSTGRES_PASSWORD=restore-test postgres:17 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$name" pg_isready -U postgres -q && break
  sleep 1
done

# Supabase roles and the extensions schema exist on a real project but not in
# a bare Postgres; the dump's grants and defaults refer to them.
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
create role dashboard_user nologin;
create role pgbouncer nologin;
create role supabase_admin nologin;
create role supabase_auth_admin nologin;
create role supabase_etl_admin nologin;
create role supabase_functions_admin nologin;
create role supabase_privileged_role nologin;
create role supabase_read_only_user nologin;
create role supabase_realtime_admin nologin;
create role supabase_replication_admin nologin;
create role supabase_storage_admin nologin;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL

docker cp "$work/backup.dump" "$name:/backup.dump"
docker exec "$name" pg_restore -U postgres -d postgres --no-owner --clean --if-exists --exit-on-error /backup.dump

tables_sql="select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by 1"
docker exec "$name" psql -U postgres -At -c "$tables_sql" >"$work/restored.txt"
docker run --rm -e BACKUP_DATABASE_URL postgres:17 sh -c \
  'psql "$BACKUP_DATABASE_URL" -At -c "$1"' _ "$tables_sql" >"$work/source.txt"

if ! diff -u "$work/source.txt" "$work/restored.txt"; then
  echo "::error::Restored public tables differ from the source database." >&2
  exit 1
fi
count=$(wc -l <"$work/restored.txt" | tr -d ' ')
[ "$count" -gt 0 ] || { echo "::error::Restore produced no public tables." >&2; exit 1; }
echo "Restore verified: $count public tables match the source."

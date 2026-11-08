#!/usr/bin/env bash
# Encrypted logical backup of the hosted database.
#   BACKUP_DATABASE_URL   Postgres URI (Supabase session pooler)
#   BACKUP_ENCRYPTION_KEY passphrase; without it the file cannot be read
#   MIN_BYTES / MAX_BYTES size guard on the encrypted file (see backup.yml)
# Usage: scripts/backup/dump.sh <output.dump.gpg>
set -euo pipefail

out="${1:?usage: dump.sh <output.dump.gpg>}"
: "${BACKUP_DATABASE_URL:?}" "${BACKUP_ENCRYPTION_KEY:?}"
min_bytes="${MIN_BYTES:-20000}"
max_bytes="${MAX_BYTES:-200000000}"

# pg_dump runs from the postgres:17 image so the client is never older than the
# server. The URL goes in through the environment, not the command line.
# public = app data, auth = sign-ins, supabase_migrations = schema history.
docker run --rm -e BACKUP_DATABASE_URL postgres:17 sh -c \
  'pg_dump "$BACKUP_DATABASE_URL" --format=custom --no-owner \
     --schema=public --schema=auth --schema=supabase_migrations' \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-count 65011712 \
      --output "$out" 3<<<"$BACKUP_ENCRYPTION_KEY"

size=$(wc -c <"$out" | tr -d ' ')
echo "Encrypted backup: $size bytes"
if [ "$size" -lt "$min_bytes" ]; then
  echo "::error::Backup is only $size bytes (minimum $min_bytes); the dump looks empty." >&2
  exit 1
fi
if [ "$size" -gt "$max_bytes" ]; then
  echo "::error::Backup is $size bytes (maximum $max_bytes). Check for runaway growth before raising the limit." >&2
  exit 1
fi

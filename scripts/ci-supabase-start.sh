#!/usr/bin/env bash
# Start the local Supabase stack in CI, retrying when it fails.
#
# `supabase start` pulls ~10 container images; on shared GitHub runners the
# registry intermittently answers `toomanyrequests` and the whole job dies before
# a single test runs. A failed start can also leave half-created containers
# behind (the next start then fails with "port already in use"), so each retry
# first stops/removes whatever is left, then waits a little longer. Layers that
# did download are cached by Docker, so retries get further each time.
#
#   scripts/ci-supabase-start.sh "<comma-separated services to exclude>"
#
# Env: SUPABASE_START_ATTEMPTS (default 4), SUPABASE_START_BACKOFF (seconds per
# attempt, default 45 → waits 45s, 90s, 135s between attempts).
set -u

exclude="${1:?usage: ci-supabase-start.sh <services-to-exclude>}"
max_attempts="${SUPABASE_START_ATTEMPTS:-4}"
backoff="${SUPABASE_START_BACKOFF:-45}"

for attempt in $(seq 1 "$max_attempts"); do
  if supabase start --exclude "$exclude"; then
    exit 0
  fi

  echo "::warning::supabase start failed (attempt ${attempt}/${max_attempts})"
  if [ "$attempt" -eq "$max_attempts" ]; then
    break
  fi

  supabase stop --no-backup >/dev/null 2>&1 || true
  delay=$((attempt * backoff))
  echo "Retrying in ${delay}s…"
  sleep "$delay"
done

echo "::error::supabase start failed after ${max_attempts} attempts"
exit 1

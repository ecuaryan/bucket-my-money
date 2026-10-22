#!/usr/bin/env bash
# Start the local Supabase stack in CI, retrying when it fails.
#
# Why this exists: `supabase start` pulls ~10 container images, and CI runs on
# shared GitHub runners where registries intermittently answer
# `toomanyrequests` — which used to kill a job before any test ran.
#
# The key detail: the `supabase/setup-cli` action sets
# SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io for the whole job, and with that
# variable set the CLI uses ONLY that registry. Without it the CLI tries
# public.ecr.aws, then ghcr.io, then Docker Hub for every image, so one
# throttled registry no longer fails the run. We unset it for `supabase start`.
#
# On top of that, a failed start leaves half-created containers behind (the
# next start would fail with "port already in use"), so each retry first
# stops/removes them and backs off a little longer. Layers that did download
# stay cached in Docker, so retries get further each time.
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
  if env -u SUPABASE_INTERNAL_IMAGE_REGISTRY supabase start --exclude "$exclude"; then
    exit 0
  fi

  echo "::warning::supabase start failed (attempt ${attempt}/${max_attempts})"
  if [ "$attempt" -eq "$max_attempts" ]; then
    break
  fi

  env -u SUPABASE_INTERNAL_IMAGE_REGISTRY supabase stop --no-backup >/dev/null 2>&1 || true
  delay=$((attempt * backoff))
  echo "Retrying in ${delay}s…"
  sleep "$delay"
done

echo "::error::supabase start failed after ${max_attempts} attempts"
exit 1

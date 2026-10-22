#!/usr/bin/env bash
# Start the local Supabase stack in CI, retrying when it fails.
#
# `supabase start` pulls ~10 container images; on shared GitHub runners the
# registry intermittently answers `toomanyrequests` and the whole job dies before
# a single test runs. Anonymous pulls share a per-IP limit with every other
# repo on the runner network, and that limit can stay exhausted for hours — so
# plain retries aren't enough. What this script does:
#
#   1. Try `supabase start`, keeping its output.
#   2. On failure, find the image that was being pulled and `docker pull` it
#      ourselves. The Docker CLI uses the credentials from the `docker login`
#      step (the supabase CLI's own pulls are anonymous), and authenticated pulls
#      have their own limit. Docker keeps what it downloaded, so the next
#      `supabase start` finds the image locally and skips the pull.
#   3. Stop/remove half-started containers (a failed start leaves them behind;
#      the next start would then fail with "port already in use"), back off, retry.
#
#   scripts/ci-supabase-start.sh "<comma-separated services to exclude>"
#
# Env: SUPABASE_START_ATTEMPTS (default 4), SUPABASE_START_BACKOFF (seconds per
# attempt, default 45 → waits 45s, 90s, 135s between attempts),
# SUPABASE_PULL_ATTEMPTS (docker pull tries per failed start, default 3).
set -u -o pipefail

exclude="${1:?usage: ci-supabase-start.sh <services-to-exclude>}"
max_attempts="${SUPABASE_START_ATTEMPTS:-4}"
backoff="${SUPABASE_START_BACKOFF:-45}"
pull_attempts="${SUPABASE_PULL_ATTEMPTS:-3}"
log="$(mktemp)"

# The image supabase was pulling when it gave up ("Retrying after 8s: <image>").
failing_image() {
  grep -oE 'Retrying after [0-9]+s: [^[:space:]]+' "$log" | tail -1 | awk '{print $NF}'
}

pull_ourselves() {
  local image="$1" i
  for i in $(seq 1 "$pull_attempts"); do
    if docker pull "$image"; then
      return 0
    fi
    echo "docker pull ${image} failed (try ${i}/${pull_attempts})"
    [ "$i" -lt "$pull_attempts" ] && sleep $((i * 10))
  done
  return 1
}

for attempt in $(seq 1 "$max_attempts"); do
  if supabase start --exclude "$exclude" 2>&1 | tee "$log"; then
    exit 0
  fi

  echo "::warning::supabase start failed (attempt ${attempt}/${max_attempts})"

  image="$(failing_image)"
  if [ -n "$image" ]; then
    echo "Pulling ${image} directly (authenticated if docker login ran)…"
    pull_ourselves "$image" || echo "::warning::could not pull ${image} directly"
  fi

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

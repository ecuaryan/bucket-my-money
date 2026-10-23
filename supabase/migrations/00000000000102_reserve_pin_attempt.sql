-- =====================================================================
-- Reserve a PIN attempt BEFORE verifying it (found in a security review).
--
-- pin-login used to check `pin_locked`, verify the PIN, and only then record
-- a failure (record_pin_failure). The counter itself was atomic, but the
-- check-then-verify gap was not: a burst of N simultaneous guesses all read
-- `pin_locked = false`, so all N were verified before the first failure was
-- recorded. With only 10,000 possible PINs that is a real brute-force path.
--
-- reserve_pin_attempt() makes the attempt itself the atomic step. One UPDATE
-- takes the row lock, refuses if the member is already locked or out of
-- attempts, and otherwise counts the attempt (locking the member when it is
-- the last one allowed). pin-login verifies only when a row comes back, so a
-- burst can never verify more than `p_max_attempts` guesses between unlocks.
-- A correct PIN still resets the counter (done by pin-login), so normal use is
-- unchanged. record_pin_failure stays for rolling deploys (migrations run
-- before the Edge Functions that call this).
--
-- Zero rows returned = no attempt reserved (locked / exhausted / unknown id).
-- =====================================================================

create or replace function public.reserve_pin_attempt(
  p_member_id uuid,
  p_max_attempts int default 6
)
returns table (attempts int, locked boolean)
language sql
security definer
set search_path = public
as $$
  update public.family_members
     set pin_failed_attempts = coalesce(pin_failed_attempts, 0) + 1,
         pin_locked = (coalesce(pin_failed_attempts, 0) + 1) >= p_max_attempts
   where id = p_member_id
     and not pin_locked
     and coalesce(pin_failed_attempts, 0) < p_max_attempts
  returning pin_failed_attempts, pin_locked;
$$;

revoke all on function public.reserve_pin_attempt(uuid, int) from public;
revoke all on function public.reserve_pin_attempt(uuid, int) from anon;
revoke all on function public.reserve_pin_attempt(uuid, int) from authenticated;
grant execute on function public.reserve_pin_attempt(uuid, int) to service_role;

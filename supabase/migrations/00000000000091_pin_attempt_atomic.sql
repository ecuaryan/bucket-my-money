-- Atomic PIN failure recording (security: PIN lockout bypass).
--
-- pin-login previously read pin_failed_attempts, added 1 in the Edge
-- Function, and wrote the absolute value back. Parallel wrong-PIN requests
-- all read the same stale counter and overwrote each other, so N
-- concurrent guesses advanced the lockout counter by ~1 instead of N --
-- defeating the MAX_PIN_ATTEMPTS lockout. This RPC performs the increment
-- and the lock check in a single UPDATE; the row lock serializes
-- concurrent attempts, so every failed guess counts exactly once.

create or replace function public.record_pin_failure(
  p_member_id uuid,
  p_max_attempts int default 6
)
returns table (attempts int, locked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int := 0;
  v_locked boolean := false;
begin
  update public.family_members
     set pin_failed_attempts = coalesce(pin_failed_attempts, 0) + 1,
         pin_locked = (coalesce(pin_failed_attempts, 0) + 1) >= p_max_attempts
   where id = p_member_id
  returning pin_failed_attempts, pin_locked
    into v_attempts, v_locked;

  -- Unknown member id keeps the benign defaults; the caller already 401s
  -- on unknown members, so the contract stays stable.
  return query select v_attempts, v_locked;
end;
$$;

revoke all on function public.record_pin_failure(uuid, int) from public;
revoke all on function public.record_pin_failure(uuid, int) from authenticated;
grant execute on function public.record_pin_failure(uuid, int) to service_role;

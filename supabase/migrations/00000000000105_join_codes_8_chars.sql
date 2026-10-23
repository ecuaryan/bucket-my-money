-- =====================================================================
-- New join codes: 8 characters, not 12 (follow-up to migration 104).
--
-- Migration 104 fixed the real generator bugs (variable length, unusable
-- 4-5 char codes, look-alike characters, biased draws) but also lengthened
-- codes to 12. Join codes are typed and remembered by kids on shared devices,
-- and a join code alone is not a way in: it only shows the household roster and
-- allows PIN attempts, which lock after 6 tries per member (reserve_pin_attempt,
-- migration 102). Memorability wins over extra length here.
--
-- Same generator, same 31-symbol alphabet (2-9, A-Z minus I L O), same
-- unbiased rejection sampling — exactly 8 characters: 31^8 ≈ 8.5e11 ≈ 39.6
-- bits, i.e. the same strength the old generator actually delivered (~40 bits)
-- without its bugs. Codes already issued (6-8 chars from the old generator, or
-- 12 chars if rotated after migration 104) are untouched and keep working;
-- login_roster only requires length >= 6. A household gets an 8-char code the
-- next time an admin rotates it.
-- =====================================================================

create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 symbols
  c_length   constant int  := 8;
  v_code     text := '';
  v_bytes    bytea;
  v_byte     int;
  i          int;
begin
  while char_length(v_code) < c_length loop
    v_bytes := extensions.gen_random_bytes(32);
    for i in 0 .. length(v_bytes) - 1 loop
      v_byte := get_byte(v_bytes, i);
      -- 248 = 31 * 8: reject 248..255 so every symbol is equally likely.
      if v_byte < 248 then
        v_code := v_code || substr(c_alphabet, (v_byte % 31) + 1, 1);
        exit when char_length(v_code) = c_length;
      end if;
    end loop;
  end loop;
  return v_code;
end;
$$;

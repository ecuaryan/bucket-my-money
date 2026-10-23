-- =====================================================================
-- Stronger, fixed-length join codes for NEW codes (security review).
--
-- The old generator took 6 random bytes, base64-encoded them, stripped `+`
-- and `/`, kept the first 8 characters and upper-cased them. Measured over
-- 200,000 codes:
--   * only ~77% were 8 chars; ~20% were 7, ~2% were 6 (the stripped
--     characters shortened them), and ~0.16% were 4-5 chars — shorter than the
--     6-char minimum login_roster / validate-join-code enforce, so those codes
--     could never be used;
--   * lower-casing then upper-casing folded letter pairs together, so the real
--     entropy was ~5 bits/char, ~40 bits for a typical code (the comment
--     claimed ~48).
--
-- New codes: exactly 12 characters from a 31-symbol alphabet without the
-- look-alikes 0 O 1 I L (2-9, A-Z minus I L O), drawn uniformly by rejection
-- sampling (no modulo bias): ~59 bits. Existing codes are untouched and keep
-- working (login_roster only requires length >= 6); a household gets a new-style
-- code the next time an admin rotates it.
-- =====================================================================

create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 symbols
  c_length   constant int  := 12;
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

-- Mirror of relyingParty() in _shared/webauthn.ts: trust exact production
-- origins instead of every *.bucketmymoney.com subdomain.

create or replace function public.login_webauthn_options(
  p_family_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_host text;
  v_rpid text;
  v_challenge text;
  v_creds jsonb;
  v_member_exists boolean;
begin
  -- Abuse throttle first: per-IP budget from rate_limit_rules.
  perform public.pre_auth_rate_limit('login_webauthn_options');

  -- Relying-party id from the browser Origin, matching relyingParty():
  -- localhost / 127.0.0.1 (+ localhost subdomains), and the exact production
  -- origins (https only). Never a wildcard over *.bucketmymoney.com.
  v_origin := current_setting('request.headers', true)::json ->> 'origin';
  if v_origin is null then
    return jsonb_build_object('error', 'Unsupported origin');
  end if;
  v_host := lower(split_part(split_part(split_part(v_origin, '//', 2), '/', 1), ':', 1));
  v_rpid := case
    when v_host = 'localhost' or v_host like '%.localhost' then 'localhost'
    when v_host = '127.0.0.1' then '127.0.0.1'
    when v_host in ('bucketmymoney.com', 'www.bucketmymoney.com', 'app.bucketmymoney.com')
      and v_origin like 'https://%'
      then 'bucketmymoney.com'
    else null
  end;
  if v_rpid is null then
    return jsonb_build_object('error', 'Unsupported origin');
  end if;

  select true into v_member_exists
  from public.family_members
  where id = p_member_id and family_id = p_family_id;
  if v_member_exists is null then
    return jsonb_build_object('error', 'Invalid credentials');
  end if;

  -- allowCredentials: the member's registered passkeys. Drop null transports
  -- (jsonb_strip_nulls) so the shape matches the @simplewebauthn output.
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', credential_id,
          'type', 'public-key',
          'transports', transports
        )
      )
    ),
    '[]'::jsonb
  )
  into v_creds
  from public.member_passkeys
  where member_id = p_member_id;

  if v_creds = '[]'::jsonb then
    return jsonb_build_object('noPasskey', true, 'error', 'No passkey on this account');
  end if;

  -- 32 random bytes (two UUIDs), base64url without padding — same encoding the
  -- library produces, and stored verbatim for webauthn-login-verify to match.
  v_challenge := translate(
    rtrim(
      encode(
        decode(translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'
      ),
      '='
    ),
    '+/',
    '-_'
  );

  delete from public.webauthn_challenges
  where member_id = p_member_id and kind = 'login';

  insert into public.webauthn_challenges (member_id, family_id, challenge, kind, expires_at)
  values (p_member_id, p_family_id, v_challenge, 'login', now() + interval '5 minutes');

  return jsonb_build_object(
    'challenge', v_challenge,
    'rpId', v_rpid,
    'allowCredentials', v_creds,
    'timeout', 60000,
    'userVerification', 'required'
  );
end;
$$;

# Google / Apple sign-in

Login buttons (`src/features/auth/OAuthButtons.tsx`) call
`supabase.auth.signInWithOAuth` with `redirectTo = <origin>/login`. One flow
covers sign-in and sign-up.

## Behavior

- **Household bootstrap.** OAuth cannot carry the `bootstrap_family` metadata
  email sign-up uses, so a first-time user arrives with no `family_members` row.
  `auth.tsx` then calls `bootstrap_oauth_household()` (migration 110): creates the
  household + an account-owner admin, only for the caller, only when Google/Apple
  is in `app_metadata.providers`, idempotent, one household per user. Email-only
  and PIN accounts are refused (a removed admin still sees the orphan notice).
- **Existing email accounts** with the same verified email are linked to the
  OAuth identity by Supabase (same user, same household).
- **PIN, join code, kids/members:** unchanged. They use internal
  `@pin.bucketmymoney.internal` users; OAuth never touches them. An OAuth admin
  can set a PIN / passkey in Settings; `issueSessionForMember` signs them back in
  via magic-link for their real (or Apple-relay) email.
- **Settings → Admin sign-in:** OAuth-only accounts show "Signed in with Google"
  and no password reset; accounts that also have a password keep the reset button.
- **Which buttons show:** `VITE_OAUTH_PROVIDERS` (default `google`). Add `apple`
  only after Apple is enabled in Supabase.
- Apple "Hide My Email" relay addresses work as the account email.

## Dashboard setup (one time, hosted project)

Supabase → Authentication → URL Configuration: Site URL
`https://app.bucketmymoney.com`; Redirect URLs include
`https://app.bucketmymoney.com/**` and `http://localhost:5173/**`.

### Google (free)
1. Google Cloud Console → APIs & Services → OAuth consent screen: External,
   app name Bucket My Money, support email, authorized domain
   `bucketmymoney.com`, scopes `openid`, `email`, `profile`. Publish to
   production (otherwise only listed test users can sign in).
2. Credentials → Create OAuth client ID → Web application.
   Authorized JavaScript origins: `https://app.bucketmymoney.com`,
   `http://localhost:5173`.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows it on the Google provider page).
3. Supabase → Authentication → Sign In / Providers → Google: enable, paste
   Client ID + Secret.

### Apple (needs Apple Developer Program, ~$99/year)
1. App ID with Sign in with Apple; a Services ID (this is the Client ID, e.g.
   `com.bucketmymoney.web`) with domain `<project-ref>.supabase.co` and return URL
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. A Sign in with Apple key (.p8); generate the client-secret JWT from it
   (Supabase docs → Login with Apple). **Apple secrets expire every 6 months** —
   calendar a rotation.
3. Supabase → Providers → Apple: enable; Client IDs = the Services ID; Secret =
   the JWT.
4. Set `VITE_OAUTH_PROVIDERS=google,apple` in Vercel and redeploy.

### Local
`supabase/config.toml` has `[auth.external.google]` (disabled). To test the real
round trip locally, set `enabled = true`, a client id, and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, and add
`http://127.0.0.1:54321/auth/v1/callback` to the Google client. Never commit the secret.

## Hosted configuration (reference)

- **Google Cloud project:** `Bucket My Money` (id `modern-sublime-514002-q9`),
  audience External.
- **OAuth client:** authorized JavaScript origins `https://app.bucketmymoney.com`
  and `http://localhost:5173`; redirect URI
  `https://csuppogfzxuikitolmtz.supabase.co/auth/v1/callback`.
- **Publishing status.** While the consent screen is in **Testing**, only listed
  test users can sign in and the project is capped at **100 test users**. Publish
  to production (scopes are only `openid`, `email`, `profile`, so no
  verification review is expected) before onboarding anyone outside that list.
- **Privacy policy:** `site/src/pages/privacy.astro`, served at
  `https://bucketmymoney.com/privacy` (the consent screen's privacy link; the
  login page also links it). Keep it in sync per AGENTS.md.
- **Privacy contact:** `privacy@bucketmymoney.com` via Cloudflare Email Routing
  (Cloudflare → bucketmymoney.com → Email → Routing). A custom-address rule
  forwards it to the owner's Gmail; the **catch-all stays disabled**.

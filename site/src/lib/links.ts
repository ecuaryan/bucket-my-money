/**
 * Where the app lives: app.bucketmymoney.com (the marketing site is on the
 * apex). Override with PUBLIC_APP_URL for previews or local testing.
 */
const APP_URL = (import.meta.env.PUBLIC_APP_URL ?? 'https://app.bucketmymoney.com').replace(/\/$/, '')

export const SIGN_UP_URL = `${APP_URL}/signup`
export const SIGN_IN_URL = `${APP_URL}/login`

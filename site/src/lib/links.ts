/**
 * Where the app lives. Today that's bucketmymoney.com; after the domain
 * cutover (marketing site on the apex, app on a subdomain) set PUBLIC_APP_URL
 * in the site's Vercel project, e.g. https://app.bucketmymoney.com.
 */
const APP_URL = (import.meta.env.PUBLIC_APP_URL ?? 'https://bucketmymoney.com').replace(/\/$/, '')

export const SIGN_UP_URL = `${APP_URL}/signup`
export const SIGN_IN_URL = `${APP_URL}/login`

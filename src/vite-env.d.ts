/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Comma list of OAuth buttons to show: google (default), apple. */
  readonly VITE_OAUTH_PROVIDERS?: string
  readonly VITE_TELLER_APPLICATION_ID?: string
  readonly VITE_TELLER_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

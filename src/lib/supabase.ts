import { createClient } from '@supabase/supabase-js'
import {
  prepareAuthStorageOnStartup,
  supabaseAuthStorage,
} from '@/lib/authPersistence'
import { dropStaleRestoredSession } from '@/lib/activityClock'
import { resolveSupabasePublishableKey } from '@/lib/supabaseKeys'
import type { Database } from '@/types/database'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = resolveSupabasePublishableKey(import.meta.env)

if (!supabaseUrl) {
  throw new Error(
    'Missing VITE_SUPABASE_URL. Copy .env.example to .env.local and fill in your Supabase project URL.',
  )
}

prepareAuthStorageOnStartup()
// Before the client reads storage: a session from an app idle a minute or more
// must never load (background policy — see activityClock.ts).
dropStaleRestoredSession()

export const supabase = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: supabaseAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Recover from orphaned cross-tab locks instead of hanging sign-in.
      lockAcquireTimeout: 5000,
    },
  },
)

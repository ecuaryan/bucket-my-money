import { clearLocalAuthSession } from '@/lib/authStorage'
import { isPinAuthEmail, ORPHAN_MEMBER_MESSAGE, stashOrphanMemberNotice } from '@/lib/pinAuth'
import { clearSupabaseApiCache } from '@/lib/serviceWorkerCache'
import { supabase } from '@/lib/supabase'

/** PIN members go straight to sign-out; email members see the orphan notice. */
export type AbsentMembershipAction = 'pinSignOut' | 'orphanNotice'

export function absentMembershipAction(
  email: string | undefined,
): AbsentMembershipAction {
  return isPinAuthEmail(email) ? 'pinSignOut' : 'orphanNotice'
}

/** Household row is gone — end the local session for PIN sign-in. */
export async function signOutRemovedPinMember(): Promise<void> {
  stashOrphanMemberNotice(ORPHAN_MEMBER_MESSAGE)
  clearLocalAuthSession()
  clearSupabaseApiCache()
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Best effort — auth user may already be deleted server-side.
  }
}

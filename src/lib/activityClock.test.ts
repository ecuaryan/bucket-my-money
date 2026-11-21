import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// authStorage derives the token key from the project URL at import time.
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
})
import {
  ACTIVITY_HEARTBEAT_MS,
  dropStaleRestoredSession,
  isActivityStale,
  readLastActiveAt,
  recordLastActiveAt,
  registerActivityClock,
} from '@/lib/activityClock'
import { SUPABASE_AUTH_STORAGE_KEY } from '@/lib/authStorage'
import {
  BACKGROUND_SIGN_OUT_MS,
  isSessionGateActive,
  readAppHiddenAt,
  recordAppHiddenAt,
  setSessionGateActive,
} from '@/lib/backgroundSignOut'

const AUTO_SIGN_OUT_KEY = 'bucketmymoney:auto_sign_out'

function storeSession() {
  sessionStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, '{"access_token":"t"}')
}

function hasSession() {
  return sessionStorage.getItem(SUPABASE_AUTH_STORAGE_KEY) !== null
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('isActivityStale', () => {
  it('treats a never-stamped app as stale', () => {
    expect(isActivityStale(null, 1_000)).toBe(true)
  })

  it('is fresh under the threshold and stale at it', () => {
    expect(isActivityStale(0, BACKGROUND_SIGN_OUT_MS - 1)).toBe(false)
    expect(isActivityStale(0, BACKGROUND_SIGN_OUT_MS)).toBe(true)
  })
})

describe('dropStaleRestoredSession', () => {
  const now = 10 * BACKGROUND_SIGN_OUT_MS

  it('does nothing without a stored session', () => {
    expect(dropStaleRestoredSession(now)).toBe(false)
  })

  it('keeps a session the app used under a minute ago', () => {
    storeSession()
    recordLastActiveAt(now - 5_000)
    expect(dropStaleRestoredSession(now)).toBe(false)
    expect(hasSession()).toBe(true)
  })

  it('drops a session when hidden-at was erased but the app has been idle', () => {
    // The reported bug: hidden-at and the gate flag are gone, tokens remain.
    storeSession()
    recordLastActiveAt(now - 60 * 60 * 1000)
    expect(dropStaleRestoredSession(now)).toBe(true)
    expect(hasSession()).toBe(false)
    expect(sessionStorage.getItem(AUTO_SIGN_OUT_KEY)).toBe('1')
  })

  it('drops a session with no activity stamp at all', () => {
    storeSession()
    expect(dropStaleRestoredSession(now)).toBe(true)
    expect(hasSession()).toBe(false)
  })

  it('drops a session whose hidden-at is expired and clears the gate flags', () => {
    storeSession()
    recordLastActiveAt(now - 1_000)
    recordAppHiddenAt(now - 2 * BACKGROUND_SIGN_OUT_MS)
    setSessionGateActive()
    expect(dropStaleRestoredSession(now)).toBe(true)
    expect(hasSession()).toBe(false)
    expect(readAppHiddenAt()).toBe(null)
    expect(isSessionGateActive()).toBe(false)
  })
})

describe('registerActivityClock', () => {
  let unregister: (() => void) | undefined

  function register(onStale: () => void) {
    unregister = registerActivityClock(onStale)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    setVisibility('visible')
  })

  afterEach(() => {
    unregister?.()
    unregister = undefined
    vi.useRealTimers()
  })

  it('stamps while visible and on hide', () => {
    const onStale = vi.fn()
    register(onStale)
    expect(readLastActiveAt()).toBe(1_000_000)

    vi.advanceTimersByTime(ACTIVITY_HEARTBEAT_MS)
    expect(readLastActiveAt()).toBe(1_000_000 + ACTIVITY_HEARTBEAT_MS)

    vi.setSystemTime(1_000_000 + ACTIVITY_HEARTBEAT_MS + 3_000)
    setVisibility('hidden')
    expect(readLastActiveAt()).toBe(1_000_000 + ACTIVITY_HEARTBEAT_MS + 3_000)
    expect(onStale).not.toHaveBeenCalled()
  })

  it('does not stamp while hidden', () => {
    register(vi.fn())
    setVisibility('hidden')
    const hiddenStamp = readLastActiveAt()
    vi.advanceTimersByTime(5 * ACTIVITY_HEARTBEAT_MS)
    expect(readLastActiveAt()).toBe(hiddenStamp)
  })

  it('signs out on return after a minute away with a session stored', () => {
    const onStale = vi.fn()
    register(onStale)
    storeSession()
    setVisibility('hidden')

    vi.advanceTimersByTime(BACKGROUND_SIGN_OUT_MS)
    setVisibility('visible')
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('lets a short trip away through', () => {
    const onStale = vi.fn()
    register(onStale)
    storeSession()
    setVisibility('hidden')

    vi.advanceTimersByTime(BACKGROUND_SIGN_OUT_MS - 1)
    setVisibility('visible')
    expect(onStale).not.toHaveBeenCalled()
  })

  it('ignores staleness when signed out', () => {
    const onStale = vi.fn()
    register(onStale)
    setVisibility('hidden')
    vi.advanceTimersByTime(2 * BACKGROUND_SIGN_OUT_MS)
    setVisibility('visible')
    expect(onStale).not.toHaveBeenCalled()
  })
})

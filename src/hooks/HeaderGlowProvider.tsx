import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { parseBreakdownRow } from '@/lib/availableBalance'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const RED_GLOW_RGB = '248 113 113'

type HeaderGlowApi = {
  setFloat: (float: number) => void
  setAccent: (rgb: string | null) => void
}

const HeaderGlowContext = createContext<HeaderGlowApi | null>(null)

/**
 * Owns the app header's glow (`.app-header-glow`): red while Unbucketed is
 * negative on any page, or a page's own accent (Bitcoin orange) while it is
 * showing. Pages that already know the balance report it right away; the
 * provider also reads it on each navigation so pages that don't (History,
 * Settings, ...) keep the same glow instead of flipping back to green.
 */
export function HeaderGlowProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { pathname } = useLocation()
  const signedIn = auth.status === 'signedIn'
  const [float, setFloat] = useState<number | null>(null)
  const [accent, setAccent] = useState<string | null>(null)
  // Bumped on every page report, so a slower read that started earlier never
  // overwrites a fresher balance a page already reported.
  const reports = useRef(0)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    const startedAt = reports.current
    void (async () => {
      const { data, error } = await supabase.rpc('get_home_balance_breakdown')
      if (cancelled || error || reports.current !== startedAt) return
      const parsed = parseBreakdownRow(data)
      if (parsed) setFloat(parsed.float)
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn, pathname])

  const glow = accent ?? ((float ?? 0) < 0 ? RED_GLOW_RGB : null)
  useEffect(() => {
    if (!glow) return
    const root = document.documentElement
    root.style.setProperty('--header-glow-rgb', glow)
    return () => {
      root.style.removeProperty('--header-glow-rgb')
    }
  }, [glow])

  const api = useMemo(
    () => ({
      setFloat: (next: number) => {
        reports.current += 1
        setFloat(next)
      },
      setAccent,
    }),
    [],
  )

  return (
    <HeaderGlowContext.Provider value={api}>
      {children}
    </HeaderGlowContext.Provider>
  )
}

/** Report the current Unbucketed amount so the header glow reflects it at once. */
// eslint-disable-next-line react-refresh/only-export-components
export function useReportFloat(float: number | null) {
  const api = useContext(HeaderGlowContext)
  useEffect(() => {
    if (api && float !== null) api.setFloat(float)
  }, [api, float])
}

/** Override the header glow with this page's accent (an "r g b" triplet) while mounted. */
// eslint-disable-next-line react-refresh/only-export-components
export function useHeaderAccent(rgb: string | null) {
  const api = useContext(HeaderGlowContext)
  useEffect(() => {
    if (!api || !rgb) return
    api.setAccent(rgb)
    return () => api.setAccent(null)
  }, [api, rgb])
}

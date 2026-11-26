import { useEffect, useRef } from 'react'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type PostgresChangeSpec = {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  schema?: string
  table: string
  filter?: string
}

/** A change event; `new` / `old` hold the row (or just its key on DELETE). */
export type PostgresChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>

/**
 * Subscribe to Postgres changes after syncing the Realtime JWT.
 * Callers should pass a stable `channelName` and memoized `onChange`; it gets
 * the event payload, which most callers ignore (they just reload).
 */
export function usePostgresChanges(
  accessToken: string | null | undefined,
  channelName: string | null,
  specs: PostgresChangeSpec[],
  onChange: (payload: PostgresChangePayload) => void,
): void {
  const onChangeRef = useRef(onChange)

  const specsKey = JSON.stringify(specs)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!accessToken || !channelName || specs.length === 0) return

    let channel: RealtimeChannel | null = null
    let cancelled = false

    void (async () => {
      void supabase.realtime.setAuth(accessToken)
      if (cancelled) return

      let ch = supabase.channel(channelName)
      for (const spec of specs) {
        ch = ch.on(
          'postgres_changes',
          {
            event: spec.event,
            schema: spec.schema ?? 'public',
            table: spec.table,
            filter: spec.filter,
          },
          (payload: PostgresChangePayload) => {
            onChangeRef.current(payload)
          },
        )
      }

      channel = ch.subscribe((status, err) => {
        if (import.meta.env.DEV && status === 'CHANNEL_ERROR') {
          console.error(`[realtime] ${channelName}`, err)
        }
      })
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
    // specsKey replaces specs array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, channelName, specsKey])
}

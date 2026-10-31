import { useCallback, useSyncExternalStore } from 'react'
import {
  readHeroMath,
  subscribeHeroMath,
  writeHeroMath,
} from '@/lib/heroMathPref'

/** [show, setShow] for the "How this adds up" section (see heroMathPref.ts). */
export function useHeroMathPref(
  memberId: string | null,
): [boolean, (show: boolean) => void] {
  const show = useSyncExternalStore(
    subscribeHeroMath,
    () => readHeroMath(memberId),
    () => false,
  )
  const setShow = useCallback(
    (next: boolean) => {
      if (memberId) writeHeroMath(memberId, next)
    },
    [memberId],
  )
  return [show, setShow]
}

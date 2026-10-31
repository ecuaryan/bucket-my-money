// Whether the "How this adds up" section shows under the Unbucketed hero.
// Per person, per device (like Hide amounts); off unless they turned it on.

const PREFIX = 'bucketmymoney_hero_math:'
const CHANGE_EVENT = 'bucketmymoney:hero-math-pref'

function key(memberId: string): string {
  return `${PREFIX}${memberId}`
}

export function readHeroMath(memberId: string | null): boolean {
  if (!memberId) return false
  try {
    return localStorage.getItem(key(memberId)) === '1'
  } catch {
    return false
  }
}

export function writeHeroMath(memberId: string, show: boolean): void {
  try {
    if (show) localStorage.setItem(key(memberId), '1')
    else localStorage.removeItem(key(memberId))
  } catch {
    // private mode: the switch still works for this page load
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Calls `onChange` when the preference changes in this tab or another one. */
export function subscribeHeroMath(onChange: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === null || e.key.startsWith(PREFIX)) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

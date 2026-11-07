import { useState } from 'react'
import LegalLinks from '@/components/LegalLinks'
import { formatAppVersion } from '@/lib/appVersion'
import { applyAppUpdateNow } from '@/lib/pwaUpdate'
import { useAppUpdateReady } from '@/hooks/useAppUpdateReady'
import { APP_UPDATE_APPLYING_LABEL, APP_UPDATE_NOW_LABEL } from '@/lib/brand'

/** Build label for support — bottom of Settings and Admin tabs. */
export default function AppVersionFooter({ className = 'pt-6' }: { className?: string }) {
  const updateReady = useAppUpdateReady()
  const [applying, setApplying] = useState(false)

  return (
    <div className={`text-center ${className}`}>
      <LegalLinks />
      <p className="mt-2 text-xs text-zinc-600">Version {formatAppVersion()}</p>
      {updateReady ? (
        <button
          type="button"
          onClick={() => {
            setApplying(true)
            applyAppUpdateNow()
          }}
          disabled={applying}
          className="mt-1 text-xs font-medium text-emerald-500 transition hover:text-emerald-400 disabled:opacity-60"
        >
          {applying ? APP_UPDATE_APPLYING_LABEL : APP_UPDATE_NOW_LABEL}
        </button>
      ) : null}
    </div>
  )
}

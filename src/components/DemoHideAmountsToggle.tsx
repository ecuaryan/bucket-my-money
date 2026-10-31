import { useHideAmounts } from '@/lib/HideAmountsProvider'
import {
  HIDE_AMOUNTS_DETAIL,
  HIDE_AMOUNTS_LABEL,
  HIDE_AMOUNTS_PEEK_HINT,
  HIDE_AMOUNTS_SECTION_TITLE,
  HIDE_AMOUNTS_SHOW_LABEL,
} from '@/lib/brand'
import EyeOffIcon from '@/components/ui/EyeOffIcon'
import SwitchToggle from '@/components/ui/SwitchToggle'

export default function DemoHideAmountsToggle() {
  const { hidden, setHidden } = useHideAmounts()

  return (
    <section
      className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
      aria-label={HIDE_AMOUNTS_SECTION_TITLE}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <EyeOffIcon className="h-5 w-5 text-emerald-400" />
            {HIDE_AMOUNTS_SECTION_TITLE}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">{HIDE_AMOUNTS_DETAIL}</p>
          {hidden ? (
            <p className="mt-2 text-xs text-zinc-500">{HIDE_AMOUNTS_PEEK_HINT}</p>
          ) : null}
        </div>
        <SwitchToggle
          checked={hidden}
          onChange={setHidden}
          label={hidden ? HIDE_AMOUNTS_SHOW_LABEL : HIDE_AMOUNTS_LABEL}
        />
      </div>
    </section>
  )
}

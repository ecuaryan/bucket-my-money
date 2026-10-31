import SwitchToggle from '@/components/ui/SwitchToggle'
import { useHeroMathPref } from '@/hooks/useHeroMathPref'
import { useAuth } from '@/lib/auth'
import {
  FLOAT_MATH_SETTING_DETAIL,
  FLOAT_MATH_SETTING_TITLE,
} from '@/lib/brand'

export default function HeroMathSettingsCard() {
  const auth = useAuth()
  const memberId = auth.status === 'signedIn' ? (auth.member?.id ?? null) : null
  const [show, setShow] = useHeroMathPref(memberId)

  return (
    <section
      className="rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
      aria-label={FLOAT_MATH_SETTING_TITLE}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-300">
            {FLOAT_MATH_SETTING_TITLE}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">{FLOAT_MATH_SETTING_DETAIL}</p>
        </div>
        <SwitchToggle
          checked={show}
          onChange={setShow}
          label={FLOAT_MATH_SETTING_TITLE}
        />
      </div>
    </section>
  )
}

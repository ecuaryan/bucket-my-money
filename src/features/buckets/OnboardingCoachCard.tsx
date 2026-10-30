import { Link } from 'react-router-dom'
import { HERO_RADIUS, HERO_TONE_INFO } from '@/components/ui/heroTone'
import {
  BUCKETS_ADD_SOURCE_LINK_ACTION,
  ONBOARDING_COACH_ADD_SOURCE_ACTION,
  ONBOARDING_COACH_CREATE_BUCKET_ACTION,
  ONBOARDING_COACH_DISMISS_LABEL,
  ONBOARDING_COACH_SET_ASIDE_ACTION,
  ONBOARDING_COACH_STEP_ADD_SOURCE,
  ONBOARDING_COACH_STEP_CREATE_BUCKET,
  ONBOARDING_COACH_STEP_SET_ASIDE,
  ONBOARDING_COACH_TITLE,
  onboardingCoachStepBody,
} from '@/lib/brand'
import type { OnboardingCoachState } from '@/lib/onboardingCoach'

const STEP_ORDER = ['addSource', 'createBucket', 'setAside'] as const
type ActiveOnboardingStep = (typeof STEP_ORDER)[number]

const STEP_LABELS: Record<ActiveOnboardingStep, string> = {
  addSource: ONBOARDING_COACH_STEP_ADD_SOURCE,
  createBucket: ONBOARDING_COACH_STEP_CREATE_BUCKET,
  setAside: ONBOARDING_COACH_STEP_SET_ASIDE,
}

type Props = {
  state: OnboardingCoachState
  isAdmin: boolean
  adminName: string | null
  onAddSource: () => void
  onFocusCreateBucket: () => void
  onSetAside: () => void
  onDismiss: () => void
}

export default function OnboardingCoachCard({
  state,
  isAdmin,
  adminName,
  onAddSource,
  onFocusCreateBucket,
  onSetAside,
  onDismiss,
}: Props) {
  const { step, completedSteps } = state
  if (step === 'complete') return null

  const body = onboardingCoachStepBody(step, adminName, isAdmin)

  return (
    <section
      className={`${HERO_RADIUS} px-4 py-5 ${HERO_TONE_INFO}`}
      aria-label={ONBOARDING_COACH_TITLE}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-300/70">
            {ONBOARDING_COACH_TITLE}
          </p>
          <ul className="mt-3 space-y-2">
            {STEP_ORDER.map((item) => {
              const done = completedSteps.includes(item)
              const current = item === step
              return (
                <li
                  key={item}
                  className={`flex items-start gap-2 text-sm ${
                    current
                      ? 'font-medium text-sky-100'
                      : done
                        ? 'text-sky-200/50 line-through'
                        : 'text-sky-200/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      done
                        ? 'bg-sky-500/30 text-sky-200'
                        : current
                          ? 'bg-sky-500/40 text-sky-50'
                          : 'bg-sky-950/60 text-sky-300/40'
                    }`}
                  >
                    {done ? '✓' : STEP_ORDER.indexOf(item) + 1}
                  </span>
                  <span>{STEP_LABELS[item]}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-sm text-sky-200/80">{body}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-2 py-1 text-xs text-sky-300/70 transition hover:bg-sky-500/10 hover:text-sky-200"
        >
          {ONBOARDING_COACH_DISMISS_LABEL}
        </button>
      </div>

      {step === 'addSource' && isAdmin ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddSource}
            className="inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-400"
          >
            {ONBOARDING_COACH_ADD_SOURCE_ACTION}
          </button>
          <Link
            to="/admin"
            className="inline-flex rounded-lg border border-sky-500/40 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/10"
          >
            {BUCKETS_ADD_SOURCE_LINK_ACTION}
          </Link>
        </div>
      ) : null}

      {step === 'createBucket' ? (
        <button
          type="button"
          onClick={onFocusCreateBucket}
          className="mt-4 inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-400"
        >
          {ONBOARDING_COACH_CREATE_BUCKET_ACTION}
        </button>
      ) : null}

      {step === 'setAside' ? (
        <button
          type="button"
          onClick={onSetAside}
          className="mt-4 inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-400"
        >
          {ONBOARDING_COACH_SET_ASIDE_ACTION}
        </button>
      ) : null}
    </section>
  )
}

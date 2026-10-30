// Shared surface for the "hero" cards (Unbucketed, You can give, first-run
// prompts): a soft gradient, an inset edge and a faint outer glow. Positive is
// calm; negative is deeper with a brighter edge; info (onboarding) is sky.
export const HERO_RADIUS = 'rounded-[22px]'

export const HERO_TONE_POSITIVE =
  'bg-gradient-to-br from-emerald-500/[0.09] to-emerald-500/[0.03] text-emerald-300 ' +
  'shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22),inset_0_1px_0_rgba(255,255,255,0.05),0_6px_16px_-10px_rgba(52,211,153,0.35)]'

export const HERO_TONE_NEGATIVE =
  'bg-gradient-to-br from-red-500/20 to-red-500/[0.08] text-red-300 ' +
  'shadow-[inset_0_0_0_1px_rgba(248,113,113,0.45),inset_0_1px_0_rgba(255,255,255,0.06),0_6px_18px_-10px_rgba(248,113,113,0.5)]'

export const HERO_TONE_INFO =
  'bg-gradient-to-br from-sky-500/[0.09] to-sky-500/[0.03] text-sky-300 ' +
  'shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22),inset_0_1px_0_rgba(255,255,255,0.05),0_6px_16px_-10px_rgba(56,189,248,0.35)]'

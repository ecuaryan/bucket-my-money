import {
  AUTO_ORGANIZE_SECTION_TITLE,
  BUCKETS_PAGE_TAB_ACCOUNT_LABEL,
  NAV_BUCKETS_LABEL,
  PLAN_TAB_LABEL,
} from '@/lib/brand'

export type BucketsPageTab = 'buckets' | 'plan' | 'auto-bucket' | 'bank' | 'bitcoin'

export const BUCKETS_PAGE_TAB_PARAM = 'tab'

type BucketsPageTabOption = { value: BucketsPageTab; label: string }

const BUCKETS_TAB_OPTION: BucketsPageTabOption = {
  value: 'buckets',
  label: NAV_BUCKETS_LABEL,
}
const PLAN_TAB_OPTION: BucketsPageTabOption = {
  value: 'plan',
  label: PLAN_TAB_LABEL,
}
const AUTO_ORGANIZE_TAB_OPTION: BucketsPageTabOption = {
  value: 'auto-bucket',
  label: AUTO_ORGANIZE_SECTION_TITLE,
}
const ACCOUNT_TAB_OPTION: BucketsPageTabOption = {
  value: 'bank',
  label: BUCKETS_PAGE_TAB_ACCOUNT_LABEL,
}
// Flag-gated Bitcoin feature (docs/BITCOIN.md); label stays feature-local
// rather than in brand.ts so removing the feature touches nothing else.
const BITCOIN_TAB_OPTION: BucketsPageTabOption = {
  value: 'bitcoin',
  label: 'Bitcoin',
}

/**
 * Build the visible tab list. "Buckets" is always first; the optional tabs are
 * appended only when available. Plan sits right after Buckets, before the
 * Auto-bucket rule it feeds (docs/PLAN.md § Where). Adults and kids can both
 * see auto-organize; a linked child may see auto-organize and account together.
 */
export function bucketsPageTabOptions(opts: {
  showPlan?: boolean
  showAutoOrganize: boolean
  showAccount: boolean
  showBitcoin?: boolean
}): BucketsPageTabOption[] {
  const options: BucketsPageTabOption[] = [BUCKETS_TAB_OPTION]
  if (opts.showPlan) options.push(PLAN_TAB_OPTION)
  if (opts.showAutoOrganize) options.push(AUTO_ORGANIZE_TAB_OPTION)
  if (opts.showAccount) options.push(ACCOUNT_TAB_OPTION)
  if (opts.showBitcoin) options.push(BITCOIN_TAB_OPTION)
  return options
}

export function parseBucketsPageTab(
  raw: string | null | undefined,
): BucketsPageTab {
  if (raw === 'plan') return 'plan'
  if (raw === 'auto-bucket') return 'auto-bucket'
  if (raw === 'bank') return 'bank'
  if (raw === 'bitcoin') return 'bitcoin'
  return 'buckets'
}

/** Coerce URL tab to one that is available (otherwise → buckets). */
export function resolveBucketsPageTab(
  raw: string | null | undefined,
  available: { plan?: boolean; autoOrganize: boolean; account: boolean; bitcoin?: boolean },
): BucketsPageTab {
  const parsed = parseBucketsPageTab(raw)
  if (parsed === 'plan' && !available.plan) return 'buckets'
  if (parsed === 'auto-bucket' && !available.autoOrganize) return 'buckets'
  if (parsed === 'bank' && !available.account) return 'buckets'
  if (parsed === 'bitcoin' && !available.bitcoin) return 'buckets'
  return parsed
}

export function shouldShowAutoOrganizeTab(
  canSeeAutoOrganize: boolean,
  isAuthor: boolean,
  autoOrganizeTabAvailable: boolean | null,
): boolean {
  return canSeeAutoOrganize && (isAuthor || autoOrganizeTabAvailable === true)
}

/**
 * Plan shows the household's income, so children never get it. Admins always
 * do (incl. the empty state); a view-only shared member only once a plan exists.
 */
export function shouldShowPlanTab(
  role: string | null | undefined,
  planHasLines: boolean | null,
): boolean {
  if (role === 'admin') return true
  return role === 'member' && planHasLines === true
}

export function isAutoOrganizeTabAvailabilityPending(
  canSeeAutoOrganize: boolean,
  isAuthor: boolean,
  autoOrganizeTabAvailable: boolean | null,
): boolean {
  return canSeeAutoOrganize && !isAuthor && autoOrganizeTabAvailable === null
}

/** Merge tab into existing search params without dropping unrelated keys. */
export function applyBucketsPageTabToSearchParams(
  params: URLSearchParams,
  tab: BucketsPageTab,
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (tab === 'buckets') {
    next.delete(BUCKETS_PAGE_TAB_PARAM)
  } else {
    next.set(BUCKETS_PAGE_TAB_PARAM, tab)
  }
  return next
}

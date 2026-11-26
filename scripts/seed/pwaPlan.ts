import { SEED_PASSWORD } from './constants'
import { serviceClient, userClient } from './db'
import { PWA_SCREENSHOT_BUCKETS } from './pwaScreenshots'

/**
 * The demo household's Plan for the `plan.png` install screenshot and the
 * marketing site's Plan section. Every amount is chosen so Unplanned is exactly
 * $0.00: $102,000 a year gross is $8,500 a month, withholding $2,460, bills
 * $382 and buckets $5,658. Bucket names match PWA_SCREENSHOT_BUCKETS; the
 * Payday Auto-bucket rule (pwaFeatureShots.ts, 1st and 15th) is linked, so the
 * Twice a month column carries the ⚡.
 */
export const PWA_PLAN = {
  income: [
    { name: 'Jordan’s pay', yearlyCents: 6_800_000 },
    { name: 'Alex’s pay', yearlyCents: 3_400_000 },
  ],
  /** Monthly cents for the starter Withheld lines (401(k) is a % of gross). */
  withheldMonthlyCents: {
    'Federal income tax': 76_000,
    'State income tax': 30_000,
    'Social Security': 52_700,
    Medicare: 12_325,
    'Medical insurance': 28_975,
    'Dental insurance': 2_800,
    'Vision insurance': 700,
  } as Record<string, number>,
  retirementPercentBp: 500,
  bills: [
    { name: 'Internet', monthlyCents: 7_000, paidBy: 'autopay' },
    { name: 'Phone', monthlyCents: 9_500, paidBy: 'autopay' },
    { name: 'Car insurance', monthlyCents: 14_000, paidBy: 'autopay' },
    { name: 'Life insurance', monthlyCents: 4_500, paidBy: 'autopay' },
    { name: 'Streaming', monthlyCents: 3_200, paidBy: 'bill_pay' },
  ],
  buckets: [
    { bucket: '🏠 Rent', monthlyCents: 265_000 },
    { bucket: '🛒 Groceries', monthlyCents: 110_000 },
    { bucket: '⚡ Utilities', monthlyCents: 26_000 },
    { bucket: '🚗 Transportation', monthlyCents: 42_000 },
    { bucket: '🎉 Fun', monthlyCents: 30_000 },
    { bucket: '🎁 Gifts', monthlyCents: 15_000 },
    { bucket: '✈️ Travel', monthlyCents: 77_800 },
  ],
  notes:
    'Rent, internet, phone and both insurances autopay from joint checking.\n' +
    'Car insurance renews in March.\n' +
    'The will and the life insurance policy are in the fire safe.',
  linkedRule: 'Payday',
} as const

/** The screenshot's View: Compact, showing Every 2 weeks, ⚡ Twice a month and Monthly. */
export const PWA_PLAN_VIEW = {
  hiddenColumns: ['week', 'year', 'percent'],
  compact: true,
  locked: false,
} as const

/**
 * Builds the demo plan through the same admin RPCs the app uses (idempotent:
 * skips a household that already has plan lines). Run after
 * seedPwaFeatureAutoBucketRules so the Payday rule exists to link.
 */
export async function seedPwaPlan(adminEmail: string): Promise<void> {
  const admin = await userClient(adminEmail, SEED_PASSWORD)
  const svc = serviceClient()
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('seedPwaPlan: not signed in')
  const { data: member, error: memberError } = await svc
    .from('family_members')
    .select('id, family_id')
    .eq('user_id', user.id)
    .single()
  if (memberError) throw memberError

  const { count } = await svc
    .from('plan_lines')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', member.family_id)
  if ((count ?? 0) > 0) return

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn as never, args as never)
    if (error) throw new Error(`seedPwaPlan ${fn}: ${error.message}`)
    return data as unknown
  }

  for (const line of PWA_PLAN.income) {
    await rpc('add_plan_line', { p_section: 'income', p_name: line.name, p_unit: 'year', p_amount_cents: line.yearlyCents })
  }

  // The first income brought the starter Withheld lines; give them amounts.
  const { data: withheld, error: withheldError } = await svc
    .from('plan_lines')
    .select('id, name')
    .eq('family_id', member.family_id)
    .eq('section', 'withheld')
  if (withheldError) throw withheldError
  for (const line of withheld) {
    if (line.name === '401(k)') {
      await rpc('set_plan_line_amount', { p_line_id: line.id, p_unit: 'percent', p_percent_bp: PWA_PLAN.retirementPercentBp })
    } else {
      const cents = PWA_PLAN.withheldMonthlyCents[line.name ?? '']
      if (cents === undefined) throw new Error(`seedPwaPlan: no amount for ${line.name}`)
      await rpc('set_plan_line_amount', { p_line_id: line.id, p_unit: 'month', p_amount_cents: cents })
    }
  }

  for (const bill of PWA_PLAN.bills) {
    await rpc('add_plan_line', {
      p_section: 'bills',
      p_name: bill.name,
      p_unit: 'month',
      p_amount_cents: bill.monthlyCents,
      p_paid_by: bill.paidBy,
    })
  }

  const { data: buckets, error: bucketsError } = await svc
    .from('buckets')
    .select('id, name')
    .eq('family_id', member.family_id)
    .is('owner_member_id', null)
  if (bucketsError) throw bucketsError
  const bucketIdByName = new Map(buckets.map((b) => [b.name, b.id]))
  if (!PWA_SCREENSHOT_BUCKETS.every((b) => bucketIdByName.has(b.name))) {
    throw new Error('seedPwaPlan: run `npm run db:reset:seed -- pwa-screenshots` first')
  }
  for (const line of PWA_PLAN.buckets) {
    await rpc('add_plan_line', {
      p_section: 'buckets',
      p_unit: 'month',
      p_amount_cents: line.monthlyCents,
      p_bucket_id: bucketIdByName.get(line.bucket),
    })
  }

  await rpc('set_plan_notes', { p_notes: PWA_PLAN.notes })

  const { data: rule, error: ruleError } = await svc
    .from('auto_organizes')
    .select('id')
    .eq('family_id', member.family_id)
    .eq('name', PWA_PLAN.linkedRule)
    .single()
  if (ruleError) throw ruleError
  await rpc('link_plan_rule', { p_auto_organize_id: rule.id })
}

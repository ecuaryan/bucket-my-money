import { SEED_PASSWORD } from './constants'
import { serviceClient, userClient } from './db'
import { PWA_SCREENSHOT_BUCKETS } from './pwaScreenshots'

/** Auto-bucket rules shown in the marketing-site feature crop (names match PWA_SCREENSHOT_BUCKETS). */
export const PWA_FEATURE_AUTO_BUCKET_RULES = [
  {
    name: 'Payday',
    type: 'monthly',
    daysOfMonth: [1, 15],
    lines: [
      { bucket: '🏠 Rent', amount: 900 },
      { bucket: '🛒 Groceries', amount: 225 },
      { bucket: '⚡ Utilities', amount: 90 },
    ],
  },
  {
    name: 'Fun money',
    type: 'interval',
    intervalCount: 1,
    intervalUnit: 'week',
    lines: [
      { bucket: '🎉 Fun', amount: 30 },
      { bucket: '✈️ Travel', amount: 50 },
    ],
  },
] as const

/** Inserts the demo Auto-bucket rules for the pwa-screenshots admin (idempotent by rule name). */
export async function seedPwaFeatureAutoBucketRules(adminEmail: string): Promise<void> {
  const admin = await userClient(adminEmail, SEED_PASSWORD)
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('seedPwaFeatureAutoBucketRules: not signed in')

  const svc = serviceClient()
  const { data: member, error: memberError } = await svc
    .from('family_members')
    .select('id, family_id')
    .eq('user_id', user.id)
    .single()
  if (memberError) throw memberError

  const { data: buckets, error: bucketsError } = await svc
    .from('buckets')
    .select('id, name')
    .eq('family_id', member.family_id)
  if (bucketsError) throw bucketsError
  const bucketIdByName = new Map(buckets.map((b) => [b.name, b.id]))
  if (!PWA_SCREENSHOT_BUCKETS.every((b) => bucketIdByName.has(b.name))) {
    throw new Error('seedPwaFeatureAutoBucketRules: run `npm run db:reset:seed -- pwa-screenshots` first')
  }

  for (const rule of PWA_FEATURE_AUTO_BUCKET_RULES) {
    const { data: existing } = await svc
      .from('auto_organizes')
      .select('id')
      .eq('family_id', member.family_id)
      .eq('name', rule.name)
      .maybeSingle()
    if (existing) continue

    const base = {
      family_id: member.family_id,
      owner_member_id: null,
      created_by_member_id: member.id,
      name: rule.name,
      paused: false,
      auto_organize_kind: 'organize',
    }
    const { data: created, error } = await svc
      .from('auto_organizes')
      .insert(
        rule.type === 'monthly'
          ? { ...base, auto_organize_type: 'monthly', days_of_month: [...rule.daysOfMonth] }
          : {
              ...base,
              auto_organize_type: 'interval',
              start_date: '2026-01-05',
              interval_count: rule.intervalCount,
              interval_unit: rule.intervalUnit,
            },
      )
      .select('id')
      .single()
    if (error) throw error

    const { error: lineError } = await svc.from('auto_organize_lines').insert(
      rule.lines.map((line, i) => ({
        auto_organize_id: created.id,
        bucket_id: bucketIdByName.get(line.bucket)!,
        amount: line.amount,
        sort_order: i,
      })),
    )
    if (lineError) throw lineError
  }
}

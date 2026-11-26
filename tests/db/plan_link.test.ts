import { describe, expect, it } from 'vitest'
import { addMember, createAdminFamily, insertBucket, serviceClient, userClient } from './fixtures'

// Migration 116 (docs/PLAN.md § Link to Auto-bucket). A plan links one
// household rule; the plan then owns that rule's lines, kept in sync by the
// database, and nothing else may write them.

type Db = Awaited<ReturnType<typeof userClient>>

const TWICE_A_MONTH = { auto_organize_type: 'monthly', days_of_month: [5, 20] }

async function insertRule(
  familyId: string,
  createdBy: string,
  cadence: Record<string, unknown> = TWICE_A_MONTH,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await serviceClient()
    .from('auto_organizes')
    .insert({ family_id: familyId, name: 'Payday', created_by_member_id: createdBy, ...cadence, ...extra } as never)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function ruleLines(ruleId: string) {
  const { data, error } = await serviceClient()
    .from('auto_organize_lines')
    .select('bucket_id, amount, sort_order')
    .eq('auto_organize_id', ruleId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((l) => ({ bucket_id: l.bucket_id, amount: Number(l.amount) }))
}

/** Admin with a plan: $152,000.16/yr salary, three bucket lines. */
async function linkedHousehold(slug: string) {
  const family = await createAdminFamily(slug)
  const svc = serviceClient()
  const admin = await userClient(family.adminEmail, family.adminPassword)
  const car = await insertBucket(svc, family.familyId, 'Car', null)
  const giving = await insertBucket(svc, family.familyId, 'Giving', null)
  const someday = await insertBucket(svc, family.familyId, 'Someday', null)

  const add = async (args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc('add_plan_line', args as never)
    expect(error).toBeNull()
    return data as string
  }
  await add({ p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 15_200_016 })
  const carLine = await add({ p_section: 'buckets', p_unit: 'two_weeks', p_amount_cents: 4700, p_bucket_id: car })
  await add({ p_section: 'buckets', p_unit: 'percent', p_percent_bp: 100, p_bucket_id: giving }) // 1% of gross
  await add({ p_section: 'buckets', p_unit: 'month', p_amount_cents: 0, p_bucket_id: someday }) // $0: not sent

  const rule = await insertRule(family.familyId, family.adminMemberId)
  return { family, admin, svc, rule, car, giving, someday, carLine }
}

async function link(admin: Db, rule: string | null) {
  return admin.rpc('link_plan_rule', { p_auto_organize_id: rule } as never)
}

describe('link_plan_rule', () => {
  it('replaces the rule’s lines with the plan’s per-run amounts, rounded down to the cent', async () => {
    const { admin, rule, car, giving } = await linkedHousehold('link-sync')
    expect((await link(admin, rule)).error).toBeNull()
    // $47 every 2 weeks → $50.9166… per twice-a-month run → $50.91;
    // 1% of $152,000.16 → $1,520.0016 a year / 24 → $63.33. The $0 line isn't sent.
    expect(await ruleLines(rule)).toEqual([
      { bucket_id: car, amount: 50.91 },
      { bucket_id: giving, amount: 63.33 },
    ])
  })

  it('is admin-only and household-only', async () => {
    const { family, rule } = await linkedHousehold('link-roles')
    const member = await addMember(family.familyId, 'member', 'Partner')
    const child = await addMember(family.familyId, 'child', 'Kid')
    for (const caller of [
      await userClient(member.email, member.password),
      await userClient(child.email, child.password),
    ]) {
      expect((await link(caller, rule)).error?.message).toMatch(/only admins/)
    }

    // another family's admin can't link (or learn about) this rule
    const other = await linkedHousehold('link-roles-other')
    expect((await link(other.admin, rule)).error?.message).toMatch(/not found/)
    const { data } = await serviceClient().from('plans').select('auto_organize_id').eq('family_id', family.familyId).single()
    expect(data?.auto_organize_id).toBeNull()
  })

  it('refuses rules without a Plan column: kids’ rules, other kinds, other schedules', async () => {
    const { family, admin } = await linkedHousehold('link-kinds')
    const child = await addMember(family.familyId, 'child', 'Kid')
    const refused = [
      await insertRule(family.familyId, child.memberId, TWICE_A_MONTH, { owner_member_id: child.memberId }),
      await insertRule(family.familyId, family.adminMemberId, TWICE_A_MONTH, { auto_organize_kind: 'top_up' }),
      await insertRule(family.familyId, family.adminMemberId, {
        auto_organize_type: 'interval', start_date: '2026-01-02', interval_count: 3, interval_unit: 'week',
      }),
      await insertRule(family.familyId, family.adminMemberId, {
        auto_organize_type: 'interval', start_date: '2026-01-02', interval_count: 2, interval_unit: 'month',
      }),
      await insertRule(family.familyId, family.adminMemberId, { auto_organize_type: 'monthly', days_of_month: [1, 10, 20] }),
      // runs only in months that have a 31st
      await insertRule(family.familyId, family.adminMemberId, { auto_organize_type: 'monthly', days_of_month: [31] }),
      // the 28th and the last day are the same date in February
      await insertRule(family.familyId, family.adminMemberId, { auto_organize_type: 'monthly', days_of_month: [0, 28] }),
    ]
    for (const rule of refused) {
      expect((await link(admin, rule)).error?.message, rule).toMatch(/can't be linked/)
    }
  })

  it('accepts every schedule that has a Plan column', async () => {
    const { family, admin, car } = await linkedHousehold('link-cadences')
    const cases: [Record<string, unknown>, number][] = [
      [{ auto_organize_type: 'interval', start_date: '2026-01-02', interval_count: 1, interval_unit: 'week' }, 23.5],
      [{ auto_organize_type: 'interval', start_date: '2026-01-02', interval_count: 2, interval_unit: 'week' }, 47],
      [{ auto_organize_type: 'monthly', days_of_month: [0] }, 101.83], // last day of month
      [TWICE_A_MONTH, 50.91],
    ]
    for (const [cadence, carPerRun] of cases) {
      const rule = await insertRule(family.familyId, family.adminMemberId, cadence)
      expect((await link(admin, rule)).error).toBeNull()
      const lines = await ruleLines(rule)
      expect(lines.find((l) => l.bucket_id === car)?.amount).toBe(carPerRun)
    }
  })

  it('unlinking leaves the rule and its lines as they are', async () => {
    const { admin, rule } = await linkedHousehold('link-unlink')
    await link(admin, rule)
    const before = await ruleLines(rule)
    expect((await link(admin, null)).error).toBeNull()
    expect(await ruleLines(rule)).toEqual(before)
  })
})

// Migration 117: linking never silently empties a rule.
describe('linking a rule to a plan with no Buckets lines', () => {
  async function ruleWithLines(familyId: string, createdBy: string, cadence: Record<string, unknown>, lines: [string, number][]) {
    const rule = await insertRule(familyId, createdBy, cadence)
    const { error } = await serviceClient()
      .from('auto_organize_lines')
      .insert(lines.map(([bucket_id, amount], i) => ({ auto_organize_id: rule, bucket_id, amount, sort_order: i })) as never)
    expect(error).toBeNull()
    return rule
  }

  async function planBucketLines(familyId: string) {
    const { data, error } = await serviceClient()
      .from('plan_lines')
      .select('bucket_id, unit, amount_cents, sort_order')
      .eq('family_id', familyId)
      .eq('section', 'buckets')
      .order('sort_order')
    if (error) throw error
    return (data ?? []).map((l) => ({ bucket_id: l.bucket_id, unit: l.unit, amount_cents: Number(l.amount_cents) }))
  }

  /** An admin whose plan has income but no Buckets lines yet. */
  async function incomeOnly(slug: string) {
    const family = await createAdminFamily(slug)
    const svc = serviceClient()
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const { error } = await admin.rpc('add_plan_line', {
      p_section: 'income', p_name: 'Salary', p_unit: 'year', p_amount_cents: 9_000_000,
    } as never)
    expect(error).toBeNull()
    const buckets = await Promise.all(['Groceries', 'Gas', 'Fun'].map((n) => insertBucket(svc, family.familyId, n, null)))
    return { family, admin, buckets }
  }

  it('copies the rule’s lines into the plan, and the rule keeps every cent', async () => {
    const { family, admin, buckets: [groceries, gas, fun] } = await incomeOnly('link-copy')
    const rule = await ruleWithLines(family.familyId, family.adminMemberId, TWICE_A_MONTH, [
      [groceries, 433.33], [gas, 12.07], [fun, 0.01],
    ])
    const before = await ruleLines(rule)

    expect((await link(admin, rule)).error).toBeNull()
    expect(await planBucketLines(family.familyId)).toEqual([
      { bucket_id: groceries, unit: 'twice_month', amount_cents: 43333 },
      { bucket_id: gas, unit: 'twice_month', amount_cents: 1207 },
      { bucket_id: fun, unit: 'twice_month', amount_cents: 1 },
    ])
    expect(await ruleLines(rule)).toEqual(before)
  })

  it('copies into the column that matches the schedule, merging a bucket listed twice', async () => {
    const { family, admin, buckets: [groceries, gas] } = await incomeOnly('link-copy-weekly')
    const rule = await ruleWithLines(
      family.familyId,
      family.adminMemberId,
      { auto_organize_type: 'interval', start_date: '2026-01-02', interval_count: 1, interval_unit: 'week' },
      [[gas, 40], [groceries, 100], [gas, 5.01]],
    )
    expect((await link(admin, rule)).error).toBeNull()
    expect(await planBucketLines(family.familyId)).toEqual([
      { bucket_id: gas, unit: 'week', amount_cents: 4501 },
      { bucket_id: groceries, unit: 'week', amount_cents: 10000 },
    ])
    expect(await ruleLines(rule)).toEqual([
      { bucket_id: gas, amount: 45.01 },
      { bucket_id: groceries, amount: 100 },
    ])
  })

  it('a plan that has Buckets lines still replaces the rule’s, and is not changed', async () => {
    const { family, admin, car, giving } = await linkedHousehold('link-replace')
    const svc = serviceClient()
    const other = await insertBucket(svc, family.familyId, 'Other', null)
    const full = await ruleWithLines(family.familyId, family.adminMemberId, TWICE_A_MONTH, [[other, 99]])
    expect((await link(admin, full)).error).toBeNull()
    expect((await ruleLines(full)).map((l) => l.bucket_id)).toEqual([car, giving])
    expect((await planBucketLines(family.familyId)).some((l) => l.bucket_id === other)).toBe(false)
  })

  it('switching the link copies into the plan without touching the rule it was linked to', async () => {
    const { family, admin, buckets: [groceries] } = await incomeOnly('link-switch')
    const first = await insertRule(family.familyId, family.adminMemberId)
    expect((await link(admin, first)).error).toBeNull()
    const second = await ruleWithLines(family.familyId, family.adminMemberId, TWICE_A_MONTH, [[groceries, 250]])
    expect((await link(admin, second)).error).toBeNull()
    expect(await ruleLines(first)).toEqual([])
    expect(await ruleLines(second)).toEqual([{ bucket_id: groceries, amount: 250 }])
  })
})

describe('the linked rule follows the plan', () => {
  it('re-syncs on every plan change, including income behind % lines', async () => {
    const { admin, rule, car, giving, carLine } = await linkedHousehold('link-follow')
    await link(admin, rule)

    await admin.rpc('set_plan_line_amount', { p_line_id: carLine, p_unit: 'twice_month', p_amount_cents: 6000 })
    expect((await ruleLines(rule)).find((l) => l.bucket_id === car)?.amount).toBe(60)

    const { data: income } = await admin.from('plan_lines').select('id').eq('section', 'income').single()
    await admin.rpc('set_plan_line_amount', { p_line_id: income!.id, p_unit: 'year', p_amount_cents: 24_000_000 })
    expect((await ruleLines(rule)).find((l) => l.bucket_id === giving)?.amount).toBe(100) // 1% of $240k / 24

    await admin.rpc('delete_plan_line', { p_line_id: carLine })
    expect((await ruleLines(rule)).map((l) => l.bucket_id)).toEqual([giving])
  })

  it('re-syncs when the rule’s schedule changes, and refuses a schedule with no Plan column', async () => {
    const { family, admin, rule, car } = await linkedHousehold('link-schedule')
    await link(admin, rule)

    // the Auto-bucket editor updates the rule row directly
    const ok = await admin.from('auto_organizes').update({ days_of_month: [5] }).eq('id', rule)
    expect(ok.error).toBeNull()
    expect((await ruleLines(rule)).find((l) => l.bucket_id === car)?.amount).toBe(101.83) // monthly now

    const bad = await admin.from('auto_organizes').update({ days_of_month: [1, 10, 20] }).eq('id', rule)
    expect(bad.error?.message).toMatch(/weekly, every 2 weeks, monthly or twice a month/)
    const { data } = await serviceClient().from('auto_organizes').select('days_of_month').eq('id', rule).single()
    expect(data?.days_of_month).toEqual([5])
    expect(family).toBeTruthy()
  })

  it('nothing else can write a linked rule’s lines; unlinked rules are untouched by the guard', async () => {
    const { family, admin, rule, car } = await linkedHousehold('link-guard')
    await link(admin, rule)
    const before = await ruleLines(rule)

    const attempts = [
      admin.from('auto_organize_lines').delete().eq('auto_organize_id', rule),
      admin.from('auto_organize_lines').insert({ auto_organize_id: rule, bucket_id: car, amount: 1, sort_order: 9 }),
      admin.from('auto_organize_lines').update({ amount: 999 }).eq('auto_organize_id', rule),
    ]
    for (const { error } of await Promise.all(attempts)) {
      expect(error?.message).toMatch(/set in Plan/)
    }
    expect(await ruleLines(rule)).toEqual(before)

    // regression: an unlinked rule's lines are written exactly as before
    const other = await insertRule(family.familyId, family.adminMemberId)
    const insert = await admin.from('auto_organize_lines').insert({ auto_organize_id: other, bucket_id: car, amount: 5, sort_order: 0 })
    expect(insert.error).toBeNull()
    expect((await admin.from('auto_organize_lines').delete().eq('auto_organize_id', other)).error).toBeNull()
  })

  it('deleting a bucket drops its line and keeps the linked rule, even when empty', async () => {
    const { admin, rule, car, giving } = await linkedHousehold('link-delete-bucket')
    await link(admin, rule)
    expect((await admin.rpc('delete_bucket', { p_bucket_id: car })).error).toBeNull()
    expect((await ruleLines(rule)).map((l) => l.bucket_id)).toEqual([giving])
    expect((await admin.rpc('delete_bucket', { p_bucket_id: giving })).error).toBeNull()
    expect(await ruleLines(rule)).toEqual([])
    const { data } = await serviceClient().from('auto_organizes').select('id').eq('id', rule)
    expect(data).toHaveLength(1)
  })

  it('deleting the linked rule unlinks the plan and leaves it intact', async () => {
    const { family, admin, rule } = await linkedHousehold('link-delete-rule')
    await link(admin, rule)
    expect((await admin.from('auto_organizes').delete().eq('id', rule)).error).toBeNull()
    const { data: plan } = await serviceClient().from('plans').select('auto_organize_id').eq('family_id', family.familyId).single()
    expect(plan?.auto_organize_id).toBeNull()
    const { count } = await serviceClient()
      .from('plan_lines')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.familyId)
    expect(count).toBe(12) // income + 8 starters + 3 bucket lines
  })

  it('internal link helpers are not callable by clients', async () => {
    const { admin, family } = await linkedHousehold('link-private')
    const { data: plan } = await serviceClient().from('plans').select('id').eq('family_id', family.familyId).single()
    expect((await admin.rpc('_plan_sync_rule' as never, { p_plan_id: plan!.id } as never)).error?.message).toMatch(/permission denied/)
    expect(
      (await admin.rpc('plan_rule_runs_per_year' as never, { p_type: 'monthly', p_interval_count: null, p_interval_unit: null, p_days_of_month: [1] } as never)).error?.message,
    ).toMatch(/permission denied/)
  })
})

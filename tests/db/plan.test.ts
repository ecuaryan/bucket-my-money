import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { FLOOR_DIV_VECTORS, PLAN_MATH_VECTORS } from '@/lib/planMathVectors'
import { PLAN_MONEY_UNITS } from '@/lib/planMath'
import { addMember, createAdminFamily, insertBucket, serviceClient, userClient } from './fixtures'
import { requireDbEnv } from './env'

// Migration 115 (docs/PLAN.md). Adults read their own family's plan; only
// admins change it, and only through the plan RPCs. Children, other families
// and signed-out callers can neither read nor write it.

type Db = Awaited<ReturnType<typeof userClient>>

const PERMISSION_DENIED = /permission denied/

const STARTER_WITHHELD = [
  'Federal income tax',
  'State income tax',
  'Social Security',
  'Medicare',
  'Medical insurance',
  'Dental insurance',
  'Vision insurance',
  '401(k)',
]

function anonClient() {
  const { url, anonKey } = requireDbEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function householdWithPlan(slug: string) {
  const family = await createAdminFamily(slug)
  const admin = await userClient(family.adminEmail, family.adminPassword)
  const { data: incomeId, error } = await admin.rpc('add_plan_line', {
    p_section: 'income',
    p_name: 'Salary',
    p_unit: 'year',
    p_amount_cents: 12_000_000,
  })
  expect(error).toBeNull()
  return { family, admin, incomeId: incomeId as string }
}

async function lineCount(svc: Db, familyId: string): Promise<number> {
  const { count, error } = await svc
    .from('plan_lines')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
  expect(error).toBeNull()
  return count ?? 0
}

describe('plan reads', () => {
  it('admins and shared members see their own plan; children and other families see nothing', async () => {
    const { family } = await householdWithPlan('plan-read')
    const member = await addMember(family.familyId, 'member', 'Partner')
    const child = await addMember(family.familyId, 'child', 'Kid')
    const other = await createAdminFamily('plan-read-other')

    const admin = await userClient(family.adminEmail, family.adminPassword)
    const shared = await userClient(member.email, member.password)
    const kid = await userClient(child.email, child.password)
    const outsider = await userClient(other.adminEmail, other.adminPassword)

    expect((await admin.from('plan_lines').select('id')).data).toHaveLength(9) // income + 8 starters
    expect((await shared.from('plan_lines').select('id')).data).toHaveLength(9)
    expect((await shared.from('plans').select('id')).data).toHaveLength(1)

    expect((await kid.from('plan_lines').select('id')).data).toEqual([])
    expect((await kid.from('plans').select('id')).data).toEqual([])
    expect((await outsider.from('plan_lines').select('id')).data).toEqual([])
    expect((await outsider.from('plans').select('id')).data).toEqual([])

    // signed-out callers hold no table privilege at all (not just an empty RLS result)
    const anon = anonClient()
    expect((await anon.from('plan_lines').select('id')).error?.message).toMatch(PERMISSION_DENIED)
    expect((await anon.from('plans').select('id')).error?.message).toMatch(PERMISSION_DENIED)
  })
})

describe('plan writes are admin-only RPCs', () => {
  it('shared members, children and signed-out callers cannot add lines', async () => {
    const { family } = await householdWithPlan('plan-write-roles')
    const svc = serviceClient()
    const before = await lineCount(svc, family.familyId)
    const member = await addMember(family.familyId, 'member', 'Partner')
    const child = await addMember(family.familyId, 'child', 'Kid')

    const args = { p_section: 'bills', p_name: 'Sneaky', p_unit: 'month', p_amount_cents: 100 }
    for (const caller of [
      await userClient(member.email, member.password),
      await userClient(child.email, child.password),
    ]) {
      const { error } = await caller.rpc('add_plan_line', args)
      expect(error?.message).toMatch(/only admins/)
    }
    // signed-out callers can't even execute it
    expect((await anonClient().rpc('add_plan_line', args)).error?.message).toMatch(PERMISSION_DENIED)
    expect(await lineCount(svc, family.familyId)).toBe(before)
  })

  it('even an admin cannot write the tables directly', async () => {
    const { family, admin, incomeId } = await householdWithPlan('plan-write-direct')
    const { data: plan } = await admin.from('plans').select('id').single()

    // No table privilege (not merely an RLS miss): every direct write is refused.
    const writes = [
      admin.from('plan_lines').insert({
        family_id: family.familyId,
        plan_id: plan!.id,
        section: 'bills',
        name: 'Direct',
        unit: 'month',
        amount_cents: 1,
      }),
      admin.from('plan_lines').update({ amount_cents: 1 }).eq('id', incomeId),
      admin.from('plan_lines').delete().eq('id', incomeId),
      admin.from('plans').update({ auto_organize_id: null }).eq('family_id', family.familyId),
      admin.from('plans').delete().eq('family_id', family.familyId),
    ]
    for (const { error } of await Promise.all(writes)) {
      expect(error?.message).toMatch(PERMISSION_DENIED)
    }

    const { data: income } = await serviceClient()
      .from('plan_lines')
      .select('amount_cents')
      .eq('id', incomeId)
      .single()
    expect(income?.amount_cents).toBe(12_000_000)
  })

  it("another family's admin cannot touch a line, even knowing its id", async () => {
    const { incomeId } = await householdWithPlan('plan-cross-a')
    const { admin: otherAdmin } = await householdWithPlan('plan-cross-b')

    const attempts = [
      otherAdmin.rpc('set_plan_line_amount', { p_line_id: incomeId, p_unit: 'year', p_amount_cents: 1 }),
      otherAdmin.rpc('update_plan_line_details', { p_line_id: incomeId, p_name: 'Hacked' }),
      otherAdmin.rpc('delete_plan_line', { p_line_id: incomeId }),
      otherAdmin.rpc('reorder_plan_lines', { p_section: 'income', p_line_ids: [incomeId] }),
    ]
    for (const { error } of await Promise.all(attempts)) {
      expect(error).not.toBeNull()
    }

    const { data } = await serviceClient()
      .from('plan_lines')
      .select('name, amount_cents')
      .eq('id', incomeId)
      .single()
    expect(data).toEqual({ name: 'Salary', amount_cents: 12_000_000 })
  })

  it('shared members and children cannot edit, reorder or delete existing lines', async () => {
    const { family, incomeId } = await householdWithPlan('plan-member-edit')
    const member = await addMember(family.familyId, 'member', 'Partner')
    const child = await addMember(family.familyId, 'child', 'Kid')

    for (const caller of [
      await userClient(member.email, member.password),
      await userClient(child.email, child.password),
    ]) {
      const results = await Promise.all([
        caller.rpc('set_plan_line_amount', { p_line_id: incomeId, p_unit: 'year', p_amount_cents: 1 }),
        caller.rpc('update_plan_line_details', { p_line_id: incomeId, p_name: 'Changed' }),
        caller.rpc('reorder_plan_lines', { p_section: 'income', p_line_ids: [incomeId] }),
        caller.rpc('delete_plan_line', { p_line_id: incomeId }),
      ])
      for (const { error } of results) expect(error?.message).toMatch(/only admins/)
    }

    const { data } = await serviceClient()
      .from('plan_lines')
      .select('name, amount_cents')
      .eq('id', incomeId)
      .single()
    expect(data).toEqual({ name: 'Salary', amount_cents: 12_000_000 })
    expect(await lineCount(serviceClient(), family.familyId)).toBe(9)
  })
})

describe('add_plan_line', () => {
  it('adds the starter Withheld lines at $0 with the first income only', async () => {
    const { family, admin } = await householdWithPlan('plan-starters')
    const { data: withheld } = await admin
      .from('plan_lines')
      .select('name, unit, amount_cents, sort_order')
      .eq('section', 'withheld')
      .order('sort_order')
    expect(withheld?.map((l) => l.name)).toEqual(STARTER_WITHHELD)
    expect(withheld?.every((l) => l.unit === 'year' && l.amount_cents === 0)).toBe(true)

    await admin.rpc('add_plan_line', {
      p_section: 'income',
      p_name: 'Side gig',
      p_unit: 'month',
      p_amount_cents: 50_000,
    })
    expect(await lineCount(serviceClient(), family.familyId)).toBe(10)
  })

  it('rejects invalid lines', async () => {
    const { family, admin } = await householdWithPlan('plan-validate')
    const svc = serviceClient()
    const before = await lineCount(svc, family.familyId)

    const invalid: Database['public']['Functions']['add_plan_line']['Args'][] = [
      { p_section: 'income', p_name: 'Pct pay', p_unit: 'percent', p_percent_bp: 1000 },
      { p_section: 'bills', p_name: 'Over 100%', p_unit: 'percent', p_percent_bp: 10001 },
      { p_section: 'bills', p_name: 'Negative', p_unit: 'month', p_amount_cents: -1 },
      { p_section: 'bills', p_name: 'Too big', p_unit: 'month', p_amount_cents: 100_000_000_000 },
      { p_section: 'bills', p_name: 'Both', p_unit: 'month', p_amount_cents: 1, p_percent_bp: 1 },
      { p_section: 'bills', p_name: 'Bad unit', p_unit: 'fortnight', p_amount_cents: 1 },
      { p_section: 'bills', p_name: '   ', p_unit: 'month', p_amount_cents: 1 },
      { p_section: 'bills', p_name: 'x'.repeat(41), p_unit: 'month', p_amount_cents: 1 },
      { p_section: 'bills', p_name: 'Long note', p_unit: 'month', p_amount_cents: 1, p_notes: 'x'.repeat(2001) },
      { p_section: 'income', p_name: 'Paid how', p_unit: 'year', p_amount_cents: 1, p_paid_by: 'autopay' },
      { p_section: 'bills', p_name: 'Bad paid_by', p_unit: 'month', p_amount_cents: 1, p_paid_by: 'cash' },
      { p_section: 'savings', p_name: 'Bad section', p_unit: 'month', p_amount_cents: 1 },
      { p_section: 'buckets', p_unit: 'month', p_amount_cents: 1 }, // no bucket
      { p_section: 'bills', p_name: '\t\n', p_unit: 'month', p_amount_cents: 1 },
      { p_section: 'bills', p_name: '\u200B', p_unit: 'month', p_amount_cents: 1 },
      { p_section: 'bills', p_name: ' \u200B\uFEFF ', p_unit: 'month', p_amount_cents: 1 },
    ]
    for (const args of invalid) {
      const { error } = await admin.rpc('add_plan_line', args)
      expect(error, JSON.stringify(args)).not.toBeNull()
    }
    expect(await lineCount(svc, family.familyId)).toBe(before)
  })

  it('bucket lines only take a household bucket from the same family, once', async () => {
    const { family, admin } = await householdWithPlan('plan-buckets')
    const svc = serviceClient()
    const child = await addMember(family.familyId, 'child', 'Kid')
    const groceries = await insertBucket(svc, family.familyId, 'Groceries', null)
    const kidBucket = await insertBucket(svc, family.familyId, 'Kid fun', child.memberId)
    const other = await createAdminFamily('plan-buckets-other')
    const foreign = await insertBucket(svc, other.familyId, 'Not yours', null)

    const add = (bucketId: string, extra: object = {}) =>
      admin.rpc('add_plan_line', {
        p_section: 'buckets',
        p_unit: 'two_weeks',
        p_amount_cents: 40_000,
        p_bucket_id: bucketId,
        ...extra,
      })

    expect((await add(kidBucket)).error).not.toBeNull()
    expect((await add(foreign)).error).not.toBeNull()
    expect((await add(groceries, { p_name: 'Own name' })).error).not.toBeNull()
    expect((await add(groceries, { p_notes: 'Own note' })).error).not.toBeNull()

    const ok = await add(groceries, { p_paid_by: 'by_hand' })
    expect(ok.error).toBeNull()
    expect((await add(groceries)).error).not.toBeNull() // once per bucket

    const { data: line } = await svc
      .from('plan_lines')
      .select('name, notes, bucket_id, paid_by')
      .eq('id', ok.data as string)
      .single()
    expect(line).toEqual({ name: null, notes: null, bucket_id: groceries, paid_by: 'by_hand' })
  })
})

describe('add_plan_line limits and cleanup', () => {
  it('trims whitespace and invisible characters from names', async () => {
    const { admin } = await householdWithPlan('plan-trim')
    const { data: id } = await admin.rpc('add_plan_line', {
      p_section: 'bills',
      p_name: '\t Rent\u200B\n',
      p_unit: 'month',
      p_amount_cents: 1,
    })
    const { data } = await admin.from('plan_lines').select('name').eq('id', id as string).single()
    expect(data?.name).toBe('Rent')
  })

  it('caps a plan at 300 lines, counting the starter lines', async () => {
    const { family, admin } = await householdWithPlan('plan-cap') // 9 lines
    const svc = serviceClient()
    const { data: plan } = await svc.from('plans').select('id').eq('family_id', family.familyId).single()
    const filler = Array.from({ length: 290 }, (_, i) => ({
      family_id: family.familyId,
      plan_id: plan!.id,
      section: 'bills',
      name: `Bill ${i}`,
      unit: 'month',
      amount_cents: 1,
      sort_order: i,
    }))
    expect((await svc.from('plan_lines').insert(filler)).error).toBeNull() // 299

    const add = () => admin.rpc('add_plan_line', { p_section: 'bills', p_name: 'One more', p_unit: 'month', p_amount_cents: 1 })
    expect((await add()).error).toBeNull() // 300
    expect((await add()).error?.message).toMatch(/limit/)
    expect(await lineCount(svc, family.familyId)).toBe(300)
  })
})

describe('bucket lines stay household buckets of the same family', () => {
  it('the database refuses a line pointing at another family\u2019s bucket, even from the service role', async () => {
    const { family } = await householdWithPlan('plan-fk-a')
    const other = await createAdminFamily('plan-fk-b')
    const svc = serviceClient()
    const foreign = await insertBucket(svc, other.familyId, 'Theirs', null)
    const { data: plan } = await svc.from('plans').select('id').eq('family_id', family.familyId).single()

    const { error } = await svc.from('plan_lines').insert({
      family_id: family.familyId,
      plan_id: plan!.id,
      section: 'buckets',
      unit: 'month',
      amount_cents: 1,
      bucket_id: foreign,
    })
    expect(error?.message).toMatch(/foreign key/)
  })

  it('a bucket that becomes someone\u2019s personal bucket leaves the plan', async () => {
    const { family, admin } = await householdWithPlan('plan-owned')
    const svc = serviceClient()
    const bucket = await insertBucket(svc, family.familyId, 'Shared fun', null)
    const { data: lineId } = await admin.rpc('add_plan_line', {
      p_section: 'buckets',
      p_unit: 'month',
      p_amount_cents: 1,
      p_bucket_id: bucket,
    })

    expect((await svc.from('buckets').update({ owner_member_id: family.adminMemberId }).eq('id', bucket)).error).toBeNull()
    const { data } = await svc.from('plan_lines').select('id').eq('id', lineId as string)
    expect(data).toEqual([])
  })
})

describe('editing lines', () => {
  it('set_plan_line_amount moves the input to the typed unit', async () => {
    const { admin } = await householdWithPlan('plan-amount')
    const { data: billId } = await admin.rpc('add_plan_line', {
      p_section: 'bills',
      p_name: 'Giving',
      p_unit: 'month',
      p_amount_cents: 100_000,
    })

    expect((await admin.rpc('set_plan_line_amount', { p_line_id: billId as string, p_unit: 'percent', p_percent_bp: 1000 })).error).toBeNull()
    const { data } = await admin
      .from('plan_lines')
      .select('unit, amount_cents, percent_bp')
      .eq('id', billId as string)
      .single()
    expect(data).toEqual({ unit: 'percent', amount_cents: null, percent_bp: 1000 })
  })

  it('income can never become a percentage', async () => {
    const { admin, incomeId } = await householdWithPlan('plan-income-pct')
    const { error } = await admin.rpc('set_plan_line_amount', { p_line_id: incomeId, p_unit: 'percent', p_percent_bp: 500 })
    expect(error).not.toBeNull()
  })

  it('update_plan_line_details saves name, paid by and note; bucket lines keep the bucket as their name', async () => {
    const { family, admin } = await householdWithPlan('plan-details')
    const svc = serviceClient()
    const { data: billId } = await admin.rpc('add_plan_line', {
      p_section: 'bills',
      p_name: 'Mortgage',
      p_unit: 'month',
      p_amount_cents: 150_000,
    })
    const ok = await admin.rpc('update_plan_line_details', {
      p_line_id: billId as string,
      p_name: '  Home loan  ',
      p_paid_by: 'autopay',
      p_notes: 'Paid from checking on the 1st',
    })
    expect(ok.error).toBeNull()
    const { data: bill } = await admin.from('plan_lines').select('name, paid_by, notes').eq('id', billId as string).single()
    expect(bill).toEqual({ name: 'Home loan', paid_by: 'autopay', notes: 'Paid from checking on the 1st' })

    const bucket = await insertBucket(svc, family.familyId, 'Car', null)
    const { data: bucketLine } = await admin.rpc('add_plan_line', {
      p_section: 'buckets',
      p_unit: 'month',
      p_amount_cents: 10_000,
      p_bucket_id: bucket,
    })
    expect((await admin.rpc('update_plan_line_details', { p_line_id: bucketLine as string, p_name: 'Renamed' })).error).not.toBeNull()
    expect((await admin.rpc('update_plan_line_details', { p_line_id: bucketLine as string, p_paid_by: 'by_hand' })).error).toBeNull()
  })

  it('reorder_plan_lines needs exactly the section’s lines', async () => {
    const { admin } = await householdWithPlan('plan-reorder')
    const { data: rows } = await admin.from('plan_lines').select('id').eq('section', 'withheld').order('sort_order')
    const ids = rows!.map((r) => r.id)

    expect((await admin.rpc('reorder_plan_lines', { p_section: 'withheld', p_line_ids: ids.slice(1) })).error).not.toBeNull()
    expect((await admin.rpc('reorder_plan_lines', { p_section: 'withheld', p_line_ids: [...ids.slice(1), ids[1]] })).error).not.toBeNull()
    expect((await admin.rpc('reorder_plan_lines', { p_section: 'withheld', p_line_ids: [...ids.slice(1), null as unknown as string] })).error).not.toBeNull()

    const reversed = [...ids].reverse()
    expect((await admin.rpc('reorder_plan_lines', { p_section: 'withheld', p_line_ids: reversed })).error).toBeNull()
    const { data: after } = await admin.from('plan_lines').select('id').eq('section', 'withheld').order('sort_order')
    expect(after!.map((r) => r.id)).toEqual(reversed)
  })

  it('deleting a line never touches its bucket, and deleting a bucket removes its line', async () => {
    const { family, admin } = await householdWithPlan('plan-delete')
    const svc = serviceClient()
    const keep = await insertBucket(svc, family.familyId, 'Vacation', null, 250)
    const drop = await insertBucket(svc, family.familyId, 'Gym', null)
    const { data: keepLine } = await admin.rpc('add_plan_line', { p_section: 'buckets', p_unit: 'month', p_amount_cents: 1, p_bucket_id: keep })
    const { data: dropLine } = await admin.rpc('add_plan_line', { p_section: 'buckets', p_unit: 'month', p_amount_cents: 1, p_bucket_id: drop })

    expect((await admin.rpc('delete_plan_line', { p_line_id: keepLine as string })).error).toBeNull()
    const { data: bucket } = await svc.from('buckets').select('allocated_amount').eq('id', keep).single()
    expect(Number(bucket?.allocated_amount)).toBe(250)

    expect((await svc.from('buckets').delete().eq('id', drop)).error).toBeNull()
    const { data: gone } = await svc.from('plan_lines').select('id').eq('id', dropLine as string)
    expect(gone).toEqual([])
  })
})

describe('SQL plan math matches the shared vectors', () => {
  const svc = serviceClient()

  it.each(FLOOR_DIV_VECTORS)('plan_floor_div(%s, %s) = %s', async (a, b, expected) => {
    const { data, error } = await svc.rpc('plan_floor_div', { p_a: a, p_b: b } as never)
    expect(error).toBeNull()
    expect(String(data)).toBe(expected)
  })

  it.each(PLAN_MATH_VECTORS.map((v) => [v.label, v] as const))('%s', async (_label, v) => {
    const { data: yearly, error } = await svc.rpc('plan_line_yearly_units', {
      p_unit: v.unit,
      p_amount_cents: v.amountCents,
      p_percent_bp: v.percentBp,
      p_gross_yearly_cents: v.grossYearlyCents,
    } as never)
    expect(error).toBeNull()
    // JSON numbers past 2^53 lose precision on the way back, so compare as doubles here;
    // the exact check is the cells below, computed from the exact string.
    expect(Number(yearly)).toBe(Number(v.yearlyUnits))

    const periods = { week: 52, two_weeks: 26, twice_month: 24, month: 12, year: 1 }
    for (const column of PLAN_MONEY_UNITS) {
      const { data: cell } = await svc.rpc('plan_floor_div', {
        p_a: v.yearlyUnits,
        p_b: String(periods[column] * 10000),
      } as never)
      expect(String(cell)).toBe(v.cells[column])
    }
  })

  it('helpers and math are not callable by signed-in clients', async () => {
    const family = await createAdminFamily('plan-math-private')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const calls: [string, object][] = [
      ['plan_floor_div', { p_a: '1', p_b: '1' }],
      ['plan_periods', { p_unit: 'week' }],
      ['plan_line_yearly_units', { p_unit: 'week', p_amount_cents: 1, p_percent_bp: null, p_gross_yearly_cents: 1 }],
      ['_plan_admin_family', {}],
      ['_plan_lock', { p_family_id: family.familyId }],
      ['_plan_check_amount', { p_section: 'bills', p_unit: 'week', p_amount_cents: 1, p_percent_bp: null }],
      ['_plan_clean_name', { p_name: 'x' }],
    ]
    for (const [fn, args] of calls) {
      const { error } = await admin.rpc(fn as never, args as never)
      expect(error?.message, fn).toMatch(PERMISSION_DENIED)
    }
  })
})

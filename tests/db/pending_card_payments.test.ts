import { describe, expect, it } from 'vitest'
import {
  addMember,
  createAdminFamily,
  memberBalance,
  serviceClient,
  userClient,
  type Db,
} from './fixtures'

/**
 * Pending card payments (docs/CREDIT_CARDS.md § Pending payments, migration 100).
 * accounts.pending_payment_credit is the part of a card's debt an in-flight
 * payment already covers (derived by the Plaid sync); the ledger functions
 * subtract card_effective_debt(balance, pending). 0 = the original math.
 */

async function insertCard(svc: Db, familyId: string, balance: number): Promise<string> {
  const { data, error } = await svc
    .from('accounts')
    .insert({
      family_id: familyId,
      owner_member_id: null,
      source: 'plaid',
      plaid_account_id: `card_${crypto.randomUUID().slice(0, 8)}`,
      institution_name: 'Chase',
      account_name: 'Freedom card',
      account_type: 'credit_card',
      current_balance: balance,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

describe('pending card payment netting', () => {
  it('a pending payment that is already out of cash is not subtracted twice', async () => {
    const family = await createAdminFamily('pending-pay')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const svc = serviceClient()

    // Checking already dropped to 2700 (the $300 payment is pending); the
    // card still reports the full $1,200.
    await admin.rpc('add_manual_account', { p_amount: 2700, p_label: 'Checking' })
    const cardId = await insertCard(svc, family.familyId, 1200)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1500) // double-counted

    await svc.from('accounts').update({ pending_payment_credit: 300 }).eq('id', cardId)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1800) // 2700 − (1200 − 300)

    // Posting: the card's balance drops and the signal clears — same answer.
    await svc
      .from('accounts')
      .update({ current_balance: 900, pending_payment_credit: 0 })
      .eq('id', cardId)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1800)
  })

  it('zero credit leaves the original math untouched', async () => {
    const family = await createAdminFamily('pending-zero')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const svc = serviceClient()
    await admin.rpc('add_manual_account', { p_amount: 3000, p_label: 'Checking' })
    await insertCard(svc, family.familyId, 1200)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1800)
  })

  it('never nets more than the card owes, and leaves credit balances alone', async () => {
    const family = await createAdminFamily('pending-clamp')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const svc = serviceClient()
    await admin.rpc('add_manual_account', { p_amount: 1000, p_label: 'Checking' })

    const owed = await insertCard(svc, family.familyId, 400)
    await svc.from('accounts').update({ pending_payment_credit: 900 }).eq('id', owed)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1000) // debt floors at 0

    await svc.from('accounts').update({ current_balance: -50 }).eq('id', owed)
    expect(await memberBalance(svc, family.adminMemberId)).toBe(1050) // bank owes you $50
  })

  it('rejects a negative pending credit', async () => {
    const family = await createAdminFamily('pending-negative')
    const svc = serviceClient()
    const cardId = await insertCard(svc, family.familyId, 100)
    const { error } = await svc
      .from('accounts')
      .update({ pending_payment_credit: -1 })
      .eq('id', cardId)
    expect(error).not.toBeNull()
  })

  it('breakdown reports the effective debt and what was netted; kids see neither', async () => {
    const family = await createAdminFamily('pending-breakdown')
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const svc = serviceClient()
    await admin.rpc('add_manual_account', { p_amount: 3000, p_label: 'Checking' })
    const cardId = await insertCard(svc, family.familyId, 1200)
    await svc.from('accounts').update({ pending_payment_credit: 300 }).eq('id', cardId)

    const { data: adult } = await admin.rpc('get_home_balance_breakdown')
    const a = adult as Record<string, number>
    expect(Number(a.card_debt)).toBe(900)
    expect(Number(a.card_pending_payments)).toBe(300)
    // cash − card_debt − buckets − kids = float still adds up.
    expect(Number(a.total_cash) - Number(a.card_debt)).toBe(Number(a.float))

    const child = await addMember(family.familyId, 'child', 'Kid')
    const kid = await userClient(child.email, child.password)
    const { data: kidRow } = await kid.rpc('get_home_balance_breakdown')
    const k = kidRow as Record<string, number>
    expect(Number(k.card_debt)).toBe(0)
    expect(Number(k.card_pending_payments)).toBe(0)
  })

  it('clients cannot read the derivation inputs; only an admin can touch the credit', async () => {
    const family = await createAdminFamily('pending-lockdown')
    const svc = serviceClient()
    const member = await addMember(family.familyId, 'member', 'Spouse')
    const spouse = await userClient(member.email, member.password)
    const admin = await userClient(family.adminEmail, family.adminPassword)
    const cardId = await insertCard(svc, family.familyId, 500)
    await svc.from('plaid_account_signals').insert({
      account_id: cardId,
      family_id: family.familyId,
      signals: { kind: 'card' },
    })

    for (const client of [admin, spouse]) {
      const read = await client.from('plaid_account_signals').select('*')
      expect(read.data ?? []).toEqual([])
      const write = await client
        .from('plaid_account_signals')
        .insert({ account_id: cardId, family_id: family.familyId, signals: {} })
      expect(write.error).not.toBeNull()
    }

    // accounts is admin-writable under RLS (as for current_balance); a shared
    // member's direct update changes nothing.
    await spouse.from('accounts').update({ pending_payment_credit: 500 }).eq('id', cardId)
    const after = await svc
      .from('accounts')
      .select('pending_payment_credit')
      .eq('id', cardId)
      .single()
    expect(Number(after.data?.pending_payment_credit)).toBe(0)
  })
})

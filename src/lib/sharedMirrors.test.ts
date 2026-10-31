import { describe, expect, it } from 'vitest'

// Some rules live twice: once for the browser (src/lib) and once for the Edge
// Functions (supabase/functions/_shared, Deno). They are kept in sync by hand,
// so a change to one copy alone silently changes what the app shows. This runs
// the same inputs through both copies and fails if they ever disagree.
// (tests/db/account_types_mirror.test.ts checks the Postgres copy.)
import * as clientTypes from '@/lib/accountTypes'
import * as sharedTypes from '../../supabase/functions/_shared/cashAccountTypes'
import * as clientPlaid from '@/lib/plaidParse'
import * as sharedPlaid from '../../supabase/functions/_shared/plaid'
import * as clientSimpleFin from '@/lib/simplefinParse'
import * as sharedSimpleFin from '../../supabase/functions/_shared/simplefin'

/** What a call returned, or the error message it threw — so throws compare too. */
function outcome(fn: () => unknown): unknown {
  try {
    return { ok: fn() }
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) }
  }
}

const ACCOUNT_TYPE_PROBES = [
  'checking',
  'savings',
  'money_market',
  'certificate_of_deposit',
  'cash_management',
  'treasury',
  'manual',
  'cash',
  'CASH',
  'Checking',
  'credit_card',
  'CREDIT_CARD',
  'credit',
  'loan',
  'mortgage',
  'investment',
  'brokerage',
  'cd',
  '',
  null,
  undefined,
]

describe('account types: browser copy vs Edge Function copy', () => {
  it('list the same cash subtypes', () => {
    expect([...clientTypes.CASH_ACCOUNT_SUBTYPES].sort()).toEqual(
      [...sharedTypes.CASH_ACCOUNT_SUBTYPES].sort(),
    )
  })

  it.each(ACCOUNT_TYPE_PROBES.map((t) => [String(t), t]))(
    'classify %s the same',
    (_label, type) => {
      expect(clientTypes.isCashAccountType(type)).toBe(
        sharedTypes.isCashAccountType(type),
      )
      expect(clientTypes.isCreditCardAccountType(type)).toBe(
        sharedTypes.isCreditCardAccountType(type),
      )
    },
  )

  it('count every type the Plaid mapping can produce as cash or card', () => {
    // Plaid hands back `cash` for HSA / prepaid / other depository accounts.
    const cases: [string, string | null][] = [
      ['depository', 'hsa'],
      ['depository', 'prepaid'],
      ['depository', null],
      ['depository', 'checking'],
      ['depository', 'cd'],
      ['credit', 'credit card'],
    ]
    for (const [type, subtype] of cases) {
      const mapped = clientPlaid.mapPlaidAccountType(type, subtype)
      expect(
        clientTypes.isCashAccountType(mapped) ||
          clientTypes.isCreditCardAccountType(mapped),
        `${type}/${subtype} → ${mapped}`,
      ).toBe(true)
    }
  })
})

describe('Plaid helpers: browser copy vs Edge Function copy', () => {
  const mapCases: [string, string | null][] = [
    ['depository', 'checking'],
    ['depository', 'savings'],
    ['depository', 'money market'],
    ['depository', 'cd'],
    ['depository', 'cash management'],
    ['depository', 'hsa'],
    ['depository', null],
    ['credit', 'credit card'],
    ['CREDIT', null],
    ['loan', 'student'],
    ['investment', 'ira roth'],
    ['other', null],
    ['', ''],
  ]
  it.each(mapCases)('map %s / %s the same', (type, subtype) => {
    expect(clientPlaid.mapPlaidAccountType(type, subtype)).toBe(
      sharedPlaid.mapPlaidAccountType(type, subtype),
    )
  })

  const balances = [
    { current: 100, available: 90 },
    { current: null, available: 90 },
    { current: 0, available: 5 },
    { current: -12.5, available: null },
    { current: null, available: null },
    { current: Number.NaN, available: 3 },
    { current: Number.POSITIVE_INFINITY, available: 3 },
  ]
  it.each(balances.map((b) => [JSON.stringify(b), b]))(
    'pick a balance the same for %s',
    (_label, b) => {
      expect(outcome(() => clientPlaid.pickPlaidBalance(b))).toEqual(
        outcome(() => sharedPlaid.pickPlaidBalance(b)),
      )
    },
  )

  const webhooks: [string, string, string | null | undefined][] = [
    ['TRANSACTIONS', 'SYNC_UPDATES_AVAILABLE', undefined],
    ['transactions', 'DEFAULT_UPDATE', null],
    ['ITEM', 'ERROR', 'ITEM_LOGIN_REQUIRED'],
    ['ITEM', 'ERROR', 'ACCESS_NOT_GRANTED'],
    ['ITEM', 'ERROR', 'ITEM_LOCKED'],
    ['ITEM', 'ERROR', 'SOMETHING_ELSE'],
    ['ITEM', 'ERROR', undefined],
    ['ITEM', 'PENDING_EXPIRATION', undefined],
    ['ITEM', 'PENDING_DISCONNECT', undefined],
    ['ITEM', 'LOGIN_REPAIRED', undefined],
    ['ITEM', 'WEBHOOK_UPDATE_ACKNOWLEDGED', undefined],
    ['AUTH', 'AUTOMATICALLY_VERIFIED', undefined],
    ['', '', undefined],
  ]
  it.each(webhooks)('classify webhook %s / %s / %s the same', (type, code, err) => {
    expect(clientPlaid.classifyPlaidWebhook(type, code, err)).toBe(
      sharedPlaid.classifyPlaidWebhook(type, code, err),
    )
  })
})

describe('SimpleFIN helpers: browser copy vs Edge Function copy', () => {
  const urls = [
    'https://beta-bridge.simplefin.org/simplefin/claim/abc',
    'https://simplefin.org/x',
    'https://user:pw@beta-bridge.simplefin.org/simplefin',
    'https://simplefin.org:8443/x',
    'http://simplefin.org/x',
    'https://simplefin.org.evil.com/x',
    'https://simplefin.org@evil.com/x',
    'https://evil.com\\@simplefin.org/x',
    'https://SIMPLEFIN.ORG/x',
    'not a url',
    '',
  ]
  it.each(urls.map((u) => [u]))('judge the URL %s the same', (url) => {
    expect(clientSimpleFin.isSimpleFinUrl(url)).toBe(
      sharedSimpleFin.isSimpleFinUrl(url),
    )
  })

  const tokens = [
    btoa('https://beta-bridge.simplefin.org/simplefin/claim/abc123'),
    `  ${btoa('https://simplefin.org/claim/x')}  `,
    btoa('https://evil.com/claim/x'),
    btoa('http://simplefin.org/claim/x'),
    btoa('https://user:pw@simplefin.org/claim/x'),
    btoa('https://simplefin.org/claim with space'),
    '!!!not-base64!!!',
    '',
    '   ',
  ]
  it.each(tokens.map((t) => [t]))('decode the Setup Token %s the same', (token) => {
    expect(outcome(() => clientSimpleFin.decodeSetupToken(token))).toEqual(
      outcome(() => sharedSimpleFin.decodeSetupToken(token)),
    )
  })

  const balanceCases: ['cash' | 'card', string][] = [
    ['cash', '100.00'],
    ['cash', '-5.5'],
    ['card', '-500.00'],
    ['card', '25'],
    ['card', '0'],
    ['cash', ''],
    ['cash', '   '],
    ['card', 'abc'],
    ['cash', 'Infinity'],
  ]
  it.each(balanceCases)('normalize %s balance %s the same', (kind, raw) => {
    expect(outcome(() => clientSimpleFin.normalizeBalance(kind, raw))).toEqual(
      outcome(() => sharedSimpleFin.normalizeBalance(kind, raw)),
    )
  })
})

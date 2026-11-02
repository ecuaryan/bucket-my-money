import { seedAdminEmail, SEED_PIN } from './constants'
import { GOLDEN_BUCKET_NAMES } from './golden'
import {
  PWA_SCREENSHOT_ADMIN_DISPLAY_NAME,
  PWA_SCREENSHOT_BUCKETS,
  PWA_SCREENSHOT_MANUAL_SOURCE,
  PWA_SCREENSHOT_SCENARIO_ID,
  PWA_SCREENSHOT_VIRTUAL_KIDS,
  PWA_SCREENSHOT_LINKED_KIDS,
} from './pwaScreenshots'
import {
  PWA_DEMO_GIF_ADMIN_DISPLAY_NAME,
  PWA_DEMO_GIF_BANK_SOURCE,
  PWA_DEMO_GIF_SCENARIO_ID,
} from './pwaDemoGifs'
import {
  addManualSource,
  addSeedMember,
  addSeedTellerAccounts,
  assignAccountOwner,
  createSeedAdmin,
  enableFeatureFlag,
  getJoinCode,
  insertBitcoinEntry,
  insertBucket,
  moveMoney,
  giveMoney,
  serviceClient,
  setMemberPin,
  userClient,
  type SeedMember,
} from './db'
import type { SeedResult } from './print'

export const SCENARIO_IDS = [
  'solo',
  'household',
  'rebalance',
  'pin-household',
  'linked-kid',
  'admin-no-pin',
  'kid-view',
  'many-buckets',
  'history',
  'shared-only',
  'bitcoin',
  'golden',
  PWA_SCREENSHOT_SCENARIO_ID,
  PWA_DEMO_GIF_SCENARIO_ID,
] as const

export type ScenarioId = (typeof SCENARIO_IDS)[number]

export const SEED_ALL = 'all' as const

export type SeedTarget = ScenarioId | typeof SEED_ALL

export function isScenarioId(value: string): value is ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value)
}

export function isSeedTarget(value: string): value is SeedTarget {
  return value === SEED_ALL || isScenarioId(value)
}

export function listScenarios(): { id: SeedTarget; description: string }[] {
  return [
    {
      id: SEED_ALL,
      description: 'All scenarios — one family per row; sign in as <scenario>@bmm.dev',
    },
    {
      id: 'solo',
      description: 'Admin only — empty buckets, no money sources (getting started)',
    },
    {
      id: 'household',
      description:
        'Admin + shared member + kid, manual cash, buckets, allocations, send, history',
    },
    {
      id: 'rebalance',
      description: 'Admin with $200 cash and $450 in buckets (negative spending money)',
    },
    {
      id: 'pin-household',
      description: 'Like household, plus PIN 0000 on kid and shared member for family login',
    },
    {
      id: 'linked-kid',
      description: 'Kid with a manual account assigned — Send blocked, Admin assignment UI',
    },
    {
      id: 'admin-no-pin',
      description: 'Admin only, no PIN set — PIN setup in Settings',
    },
    {
      id: 'kid-view',
      description: 'Admin + kid (PIN 0000), buckets and balance — no shared member',
    },
    {
      id: 'many-buckets',
      description: 'Admin with 15 pool buckets and light allocations (scroll / reorder)',
    },
    {
      id: 'history',
      description: 'Household-style data with ~40 moves and sends for History volume',
    },
    {
      id: 'shared-only',
      description: 'Admin + shared member (PIN 0000), no kid — member sign-in and Send rules',
    },
    {
      id: 'bitcoin',
      description:
        'Bitcoin flag on — kids with BTC entries (Kids-page section, kid Bitcoin tab)',
    },
    {
      id: 'golden',
      description:
        'R + S + 5 kids (PIN 0000), six linked bank accounts ($25k each), 30 emoji buckets',
    },
    {
      id: PWA_SCREENSHOT_SCENARIO_ID,
      description:
        'Emoji buckets, green Unbucketed — sign in and run npm run pwa:screenshots for install UI PNGs',
    },
    {
      id: PWA_DEMO_GIF_SCENARIO_ID,
      description:
        'Cash in Unbucketed, no buckets — sign in and run npm run pwa:gifs for README demo GIF',
    },
  ]
}

export async function seedAllScenarios(): Promise<SeedResult[]> {
  const results: SeedResult[] = []
  for (const id of SCENARIO_IDS) {
    results.push(await seedScenario(id))
  }
  return results
}

export async function seedScenario(id: ScenarioId): Promise<SeedResult> {
  switch (id) {
    case 'solo':
      return seedSolo(id)
    case 'household':
      return seedHousehold(id, { withPins: false })
    case 'pin-household':
      return seedHousehold(id, { withPins: true })
    case 'rebalance':
      return seedRebalance(id)
    case 'linked-kid':
      return seedLinkedKid(id)
    case 'admin-no-pin':
      return seedAdminNoPin(id)
    case 'kid-view':
      return seedKidView(id)
    case 'many-buckets':
      return seedManyBuckets(id)
    case 'history':
      return seedHistory(id)
    case 'shared-only':
      return seedSharedOnly(id)
    case 'bitcoin':
      return seedBitcoin(id)
    case 'golden':
      return seedGolden(id)
    case PWA_SCREENSHOT_SCENARIO_ID:
      return seedPwaScreenshots(id)
    case PWA_DEMO_GIF_SCENARIO_ID:
      return seedPwaGifs(id)
    default: {
      const _exhaustive: never = id
      throw new Error(`Unknown scenario: ${_exhaustive}`)
    }
  }
}

async function seedPwaGifs(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin(
    'Seed · PWA GIFs',
    seedAdminEmail(id),
    { displayName: PWA_DEMO_GIF_ADMIN_DISPLAY_NAME },
  )
  await addSeedTellerAccounts(admin.familyId, [
    {
      label: PWA_DEMO_GIF_BANK_SOURCE.label,
      accountType: PWA_DEMO_GIF_BANK_SOURCE.accountType,
      balance: PWA_DEMO_GIF_BANK_SOURCE.balance,
    },
  ])
  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · PWA GIFs',
    admin,
    joinCode,
    notes: [
      '$5,000 linked bank source, no buckets — shows the Bank tab. Run npm run pwa:gifs after sign-in.',
      `Sign in at /login as ${admin.adminEmail}.`,
    ],
  }
}

async function seedSolo(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Solo', seedAdminEmail(id))
  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Solo',
    admin,
    joinCode,
    notes: [`Sign in at /login as ${admin.adminEmail}.`],
  }
}

async function seedAdminNoPin(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Admin no PIN', seedAdminEmail(id))
  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Admin no PIN',
    admin,
    joinCode,
    notes: [
      'Admin has no PIN — Household members should show the green PIN setup CTA.',
      `Sign in at /login as ${admin.adminEmail}.`,
    ],
  }
}

async function seedHousehold(
  id: ScenarioId,
  options: { withPins: boolean },
): Promise<SeedResult> {
  const label = options.withPins ? 'Seed · PIN household' : 'Seed · Household'

  const admin = await createSeedAdmin(label, seedAdminEmail(id))
  const alex = await addSeedMember(admin.familyId, 'member', 'Alex', id)
  const sam = await addSeedMember(admin.familyId, 'child', 'Sam', id)
  const members: SeedMember[] = [alex, sam]

  const pinMembers: { name: string; pin: string }[] = []
  if (options.withPins) {
    await setMemberPin(alex.memberId)
    await setMemberPin(sam.memberId)
    pinMembers.push(
      { name: alex.name, pin: SEED_PIN },
      { name: sam.name, pin: SEED_PIN },
    )
  }

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 1000)

  const svc = serviceClient()
  const groceriesId = await insertBucket(svc, admin.familyId, 'Groceries', null)
  const funId = await insertBucket(svc, admin.familyId, 'Fun', null)
  const allowanceId = await insertBucket(
    svc,
    admin.familyId,
    'Allowance',
    sam.memberId,
  )

  await moveMoney(adminClient, { fromBucketId: null, toBucketId: groceriesId, amount: 300 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: funId, amount: 100 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: allowanceId, amount: 75 })
  await giveMoney(adminClient, {
    toMemberId: sam.memberId,
    amount: 40,
    note: 'Lunch money',
  })

  const joinCode = await getJoinCode(admin.familyId)
  const notes = [
    'Home shows allocated buckets and shared spending money.',
    'History includes moves and a send with a note.',
  ]
  if (options.withPins) {
    notes.push('Use /login/family with join code, then pick Alex or Sam and enter PIN.')
  } else {
    notes.push('Set PINs from Admin → Household members when testing family login.')
  }

  return {
    scenario: id,
    familyName: label,
    admin,
    joinCode,
    members,
    pinMembers: pinMembers.length ? pinMembers : undefined,
    notes,
  }
}

async function seedLinkedKid(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Linked kid', seedAdminEmail(id))
  const sam = await addSeedMember(admin.familyId, 'child', 'Sam', id)
  await setMemberPin(sam.memberId)

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Family checking', 600)
  const kidAccountId = await addManualSource(adminClient, 'Sam savings', 150)
  await assignAccountOwner(adminClient, kidAccountId, sam.memberId)

  const svc = serviceClient()
  const allowanceId = await insertBucket(svc, admin.familyId, 'Allowance', sam.memberId)
  const spendingId = await insertBucket(svc, admin.familyId, 'Spending', sam.memberId)

  await moveMoney(adminClient, { fromBucketId: null, toBucketId: allowanceId, amount: 50 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: spendingId, amount: 25 })
  await giveMoney(adminClient, { toMemberId: sam.memberId, amount: 20, note: 'Weekend' })

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Linked kid',
    admin,
    joinCode,
    members: [sam],
    pinMembers: [{ name: sam.name, pin: SEED_PIN }],
    notes: [
      '“Sam savings” manual account is assigned to Sam — Send tab blocked when signed in as Sam.',
      'Admin → Accounts shows assignment dropdown for the kid-linked source.',
      'Use /login/family → Sam → PIN 0000 to test kid UX.',
    ],
  }
}

async function seedKidView(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Kid view', seedAdminEmail(id))
  const sam = await addSeedMember(admin.familyId, 'child', 'Sam', id)
  await setMemberPin(sam.memberId)

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 800)

  const svc = serviceClient()
  const allowanceId = await insertBucket(svc, admin.familyId, 'Allowance', sam.memberId)
  const spendingId = await insertBucket(svc, admin.familyId, 'Spending', sam.memberId)
  const savingsId = await insertBucket(svc, admin.familyId, 'Savings', sam.memberId)

  await moveMoney(adminClient, { fromBucketId: null, toBucketId: allowanceId, amount: 60 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: spendingId, amount: 35 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: savingsId, amount: 40 })
  await giveMoney(adminClient, { toMemberId: sam.memberId, amount: 15, note: 'Chores' })

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Kid view',
    admin,
    joinCode,
    members: [sam],
    pinMembers: [{ name: sam.name, pin: SEED_PIN }],
    notes: [
      'No shared member — only admin + Sam for focused kid testing.',
      'Use /login/family → Sam → PIN 0000 for Buckets, Send, and History as a kid.',
    ],
  }
}

async function seedManyBuckets(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Many buckets', seedAdminEmail(id))
  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 5000)

  const svc = serviceClient()
  const names = [
    'Rent',
    'Groceries',
    'Utilities',
    'Transport',
    'Fun',
    'Travel',
    'Gifts',
    'Health',
    'Clothing',
    'Subscriptions',
    'Education',
    'Pets',
    'Home repair',
    'Buffer',
    'Misc',
  ]

  const bucketIds: string[] = []
  for (const name of names) {
    bucketIds.push(await insertBucket(svc, admin.familyId, name, null))
  }

  for (let i = 0; i < bucketIds.length; i += 2) {
    await moveMoney(adminClient, {
      fromBucketId: null,
      toBucketId: bucketIds[i]!,
      amount: 50 + i * 10,
    })
  }

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Many buckets',
    admin,
    joinCode,
    notes: [
      '15 family-pool buckets with alternating allocations — scroll and reorder on Buckets.',
    ],
  }
}

async function seedHistory(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · History', seedAdminEmail(id))
  const alex = await addSeedMember(admin.familyId, 'member', 'Alex', id)
  const sam = await addSeedMember(admin.familyId, 'child', 'Sam', id)

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 50_000)

  const svc = serviceClient()
  const groceriesId = await insertBucket(svc, admin.familyId, 'Groceries', null)
  const funId = await insertBucket(svc, admin.familyId, 'Fun', null)
  const allowanceId = await insertBucket(svc, admin.familyId, 'Allowance', sam.memberId)

  for (let i = 1; i <= 25; i++) {
    const toBucket = i % 3 === 0 ? allowanceId : i % 2 === 0 ? funId : groceriesId
    await moveMoney(adminClient, {
      fromBucketId: null,
      toBucketId: toBucket,
      amount: 10 + (i % 7),
      note: i % 4 === 0 ? `Move batch ${i}` : undefined,
    })
  }

  for (let i = 1; i <= 15; i++) {
    await giveMoney(adminClient, {
      toMemberId: sam.memberId,
      amount: 5 + (i % 10),
      note: i % 3 === 0 ? `Allowance week ${i}` : undefined,
    })
  }

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · History',
    admin,
    joinCode,
    members: [alex, sam],
    notes: [
      '25 moves and 15 sends — History tab should have plenty of rows and mixed notes.',
      'Filter by “Sent money” and scroll to test pagination feel.',
    ],
  }
}

async function seedSharedOnly(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Shared only', seedAdminEmail(id))
  const alex = await addSeedMember(admin.familyId, 'member', 'Alex', id)
  await setMemberPin(alex.memberId)

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 2000)

  const svc = serviceClient()
  const groceriesId = await insertBucket(svc, admin.familyId, 'Groceries', null)
  const bufferId = await insertBucket(svc, admin.familyId, 'Buffer', null)

  await moveMoney(adminClient, { fromBucketId: null, toBucketId: groceriesId, amount: 400 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: bufferId, amount: 200 })

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Shared only',
    admin,
    joinCode,
    members: [alex],
    pinMembers: [{ name: alex.name, pin: SEED_PIN }],
    notes: [
      'No kids — Send recipient list is empty for admin and Alex (shared balance → kids only).',
      'Use /login/family → Alex → PIN 0000 to test shared-member Home and Buckets.',
    ],
  }
}

async function seedPwaScreenshots(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin(
    'Seed · PWA screenshots',
    seedAdminEmail(id),
    { displayName: PWA_SCREENSHOT_ADMIN_DISPLAY_NAME },
  )
  const virtualKids = await Promise.all(
    PWA_SCREENSHOT_VIRTUAL_KIDS.map((kid) =>
      addSeedMember(admin.familyId, 'child', kid.name, id),
    ),
  )
  const linkedKids = await Promise.all(
    PWA_SCREENSHOT_LINKED_KIDS.map((kid) =>
      addSeedMember(admin.familyId, 'child', kid.name, id),
    ),
  )

  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(
    adminClient,
    PWA_SCREENSHOT_MANUAL_SOURCE.label,
    PWA_SCREENSHOT_MANUAL_SOURCE.amount,
  )

  const svc = serviceClient()
  for (const bucket of PWA_SCREENSHOT_BUCKETS) {
    const bucketId = await insertBucket(svc, admin.familyId, bucket.name, null)
    await moveMoney(adminClient, {
      fromBucketId: null,
      toBucketId: bucketId,
      amount: bucket.amount,
      note: `Set aside for ${bucket.name}`,
    })
  }

  for (let i = 0; i < PWA_SCREENSHOT_VIRTUAL_KIDS.length; i++) {
    await giveMoney(adminClient, {
      toMemberId: virtualKids[i]!.memberId,
      amount: PWA_SCREENSHOT_VIRTUAL_KIDS[i]!.allowance,
      note: 'Allowance',
    })
  }

  await addSeedTellerAccounts(
    admin.familyId,
    PWA_SCREENSHOT_LINKED_KIDS.map((kid, i) => ({
      label: kid.accountLabel,
      accountType: kid.accountType,
      balance: kid.balance,
      ownerMemberId: linkedKids[i]!.memberId,
    })),
  )

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · PWA screenshots',
    admin,
    joinCode,
    members: [...virtualKids, ...linkedKids],
    notes: [
      'Buckets tab shows emoji labels and green Unbucketed — onboarding coach is complete.',
      'Kids tab has both "No linked account" and "Linked accounts" sections populated.',
      'Kids and History tabs have sample activity for install screenshots.',
      `Sign in at /login as ${admin.adminEmail}, then run npm run pwa:screenshots.`,
    ],
  }
}

async function seedBitcoin(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Bitcoin', seedAdminEmail(id))
  const sam = await addSeedMember(admin.familyId, 'member', 'Sam', id)
  const adri = await addSeedMember(admin.familyId, 'child', 'Adri', id)
  const ty = await addSeedMember(admin.familyId, 'child', 'Ty', id)
  const zac = await addSeedMember(admin.familyId, 'child', 'Zac', id)
  await setMemberPin(sam.memberId)
  await setMemberPin(adri.memberId)
  await setMemberPin(ty.memberId)
  await setMemberPin(zac.memberId)

  await enableFeatureFlag(admin.familyId, 'bitcoin')

  // Spreadsheet-like history: Adri has a mix of gains and losses, Ty has a
  // single buy, Zac has none (his Bitcoin tab must stay hidden).
  const svc = serviceClient()
  const adriEntries = [
    { purchasedOn: '2024-11-24', usdAmount: 20, btcAmount: 0.00020134 },
    { purchasedOn: '2025-04-06', usdAmount: 10, btcAmount: 0.00012743 },
    { purchasedOn: '2025-11-07', usdAmount: 15, btcAmount: 0.00014373 },
    { purchasedOn: '2026-06-05', usdAmount: 10, btcAmount: 0.00016801 },
  ]
  for (const entry of adriEntries) {
    await insertBitcoinEntry(svc, admin.familyId, adri.memberId, entry)
  }
  await insertBitcoinEntry(svc, admin.familyId, ty.memberId, {
    purchasedOn: '2025-11-14',
    usdAmount: 10,
    btcAmount: 0.00010371,
  })

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Bitcoin',
    admin,
    joinCode,
    members: [sam, adri, ty, zac],
    pinMembers: [
      { name: sam.name, pin: SEED_PIN },
      { name: adri.name, pin: SEED_PIN },
      { name: ty.name, pin: SEED_PIN },
      { name: zac.name, pin: SEED_PIN },
    ],
    notes: [
      'Bitcoin feature flag is ON for this household.',
      'Kids page shows the Bitcoin section (Adri: 4 entries, Ty: 1, Zac: none).',
      'Sam (shared member, PIN 0000) sees the section read-only — no Add/Edit/Delete.',
      'Family login as Adri or Ty (PIN 0000) → Bitcoin tab on Buckets; Zac has no tab.',
      `Sign in at /login as ${admin.adminEmail}.`,
    ],
  }
}

async function seedGolden(id: ScenarioId): Promise<SeedResult> {
  const label = 'Seed · Golden'
  const admin = await createSeedAdmin(label, seedAdminEmail(id), {
    displayName: 'R',
  })
  await setMemberPin(admin.adminMemberId)

  const shared = await addSeedMember(admin.familyId, 'member', 'S', id)
  const kids = await Promise.all(
    (['K', 'A', 'J', 'T', 'Z'] as const).map((name) =>
      addSeedMember(admin.familyId, 'child', name, id),
    ),
  )

  const pinMembers: { name: string; pin: string }[] = [
    { name: 'R', pin: SEED_PIN },
    { name: 'S', pin: SEED_PIN },
    ...kids.map((kid) => ({ name: kid.name, pin: SEED_PIN })),
  ]
  await setMemberPin(shared.memberId)
  for (const kid of kids) {
    await setMemberPin(kid.memberId)
  }

  const kidK = kids.find((kid) => kid.name === 'K')
  const kidA = kids.find((kid) => kid.name === 'A')
  if (!kidK || !kidA) throw new Error('golden seed: missing kid K or A')

  await addSeedTellerAccounts(
    admin.familyId,
    [
      { label: 'Primary checking', accountType: 'checking', balance: 25_000 },
      { label: 'Joint checking', accountType: 'checking', balance: 25_000 },
      { label: 'Bills checking', accountType: 'checking', balance: 25_000 },
      { label: 'Emergency savings', accountType: 'savings', balance: 25_000 },
      {
        label: 'K checking',
        accountType: 'checking',
        balance: 25_000,
        ownerMemberId: kidK.memberId,
      },
      {
        label: 'A savings',
        accountType: 'savings',
        balance: 25_000,
        ownerMemberId: kidA.memberId,
      },
    ],
  )

  const svc = serviceClient()
  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  for (const name of GOLDEN_BUCKET_NAMES) {
    const bucketId = await insertBucket(svc, admin.familyId, name, null)
    await moveMoney(adminClient, {
      fromBucketId: null,
      toBucketId: bucketId,
      amount: 100,
    })
  }

  for (const kidName of ['J', 'T', 'Z'] as const) {
    const kid = kids.find((member) => member.name === kidName)
    if (!kid) throw new Error(`golden seed: missing kid ${kidName}`)
    await giveMoney(adminClient, {
      toMemberId: kid.memberId,
      amount: 10_000,
      note: 'Seed allowance',
    })
  }

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: label,
    admin,
    joinCode,
    members: [shared, ...kids],
    pinMembers,
    notes: [
      '$150,000 linked bank cash (6 × $25k), 30 family-pool buckets ($100 each).',
      'J, T, and Z each have $10,000 spending money (virtual kids).',
      'K and A each have one assigned bank account (linked kids).',
      `Sign in at /login as ${admin.adminEmail} (password ${admin.adminPassword}).`,
      'Family login: join code above, then R / S / K / A / J / T / Z — PIN 0000.',
    ],
  }
}

async function seedRebalance(id: ScenarioId): Promise<SeedResult> {
  const admin = await createSeedAdmin('Seed · Rebalance', seedAdminEmail(id))
  const adminClient = await userClient(admin.adminEmail, admin.adminPassword)
  await addManualSource(adminClient, 'Checking', 200)

  const svc = serviceClient()
  const rentId = await insertBucket(svc, admin.familyId, 'Rent', null)
  const groceriesId = await insertBucket(svc, admin.familyId, 'Groceries', null)
  const bufferId = await insertBucket(svc, admin.familyId, 'Buffer', null)

  await moveMoney(adminClient, { fromBucketId: null, toBucketId: rentId, amount: 250 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: groceriesId, amount: 150 })
  await moveMoney(adminClient, { fromBucketId: null, toBucketId: bufferId, amount: 50 })

  const joinCode = await getJoinCode(admin.familyId)
  return {
    scenario: id,
    familyName: 'Seed · Rebalance',
    admin,
    joinCode,
    notes: [
      '$200 cash with $450 allocated — Home spending money should show negative (rebalance).',
    ],
  }
}

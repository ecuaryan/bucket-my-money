import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchHistoryPage,
  historyPageCursorFilter,
  isHistoryRowOlderThan,
  mergeHistoryHead,
  applyHistoryHeadRefresh,
  stripJustArrived,
} from './historyQueries'
import type { HistoryTxRow } from './historyQueries'

function queryChain() {
  const chain: {
    or: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: { data: unknown[]; error: null }) => void,
    ) => void
  } = {
    or: vi.fn(),
    eq: vi.fn(),
    then: (resolve) => resolve({ data: [], error: null }),
  }
  chain.or.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

const chain = queryChain()
const mockLimit = vi.fn(() => chain)
const mockSecondOrder = vi.fn(() => ({ limit: mockLimit }))
const mockOrder = vi.fn(() => ({ order: mockSecondOrder }))
const mockSelect = vi.fn(() => ({ order: mockOrder }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: mockSelect,
    }),
  },
}))

describe('isHistoryRowOlderThan', () => {
  it('compares created_at first', () => {
    expect(
      isHistoryRowOlderThan(
        { created_at: '2026-06-01T00:00:00Z', id: 'b' },
        { created_at: '2026-06-02T00:00:00Z', id: 'a' },
      ),
    ).toBe(true)
  })

  it('breaks ties on id when created_at matches', () => {
    const ts = '2026-06-01T00:00:00Z'
    expect(
      isHistoryRowOlderThan(
        { created_at: ts, id: '00000000-0000-4000-8000-000000000001' },
        { created_at: ts, id: '00000000-0000-4000-8000-000000000002' },
      ),
    ).toBe(true)
    expect(
      isHistoryRowOlderThan(
        { created_at: ts, id: '00000000-0000-4000-8000-000000000002' },
        { created_at: ts, id: '00000000-0000-4000-8000-000000000001' },
      ),
    ).toBe(false)
  })
})

describe('historyPageCursorFilter', () => {
  it('quotes timestamps and keeps uuid ids bare', () => {
    const cursor = {
      created_at: '2026-06-01T12:34:56+00:00',
      id: '00000000-0000-4000-8000-000000000099',
    }
    expect(historyPageCursorFilter(cursor)).toBe(
      'created_at.lt."2026-06-01T12:34:56+00:00",and(created_at.eq."2026-06-01T12:34:56+00:00",id.lt.00000000-0000-4000-8000-000000000099)',
    )
  })
})

describe('mergeHistoryHead', () => {
  const row = (id: string, created_at: string): HistoryTxRow =>
    ({ id, created_at }) as HistoryTxRow

  it('prepends new head rows and reports newly arrived ids', () => {
    const prev = [row('b', '2026-06-02T00:00:00Z'), row('a', '2026-06-01T00:00:00Z')]
    const head = [row('c', '2026-06-03T00:00:00Z'), row('b', '2026-06-02T00:00:00Z')]
    const { merged, newlyArrivedIds } = mergeHistoryHead(prev, head)
    expect(merged.map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(newlyArrivedIds).toEqual(['c'])
  })

  it('keeps paginated tail when head is unchanged', () => {
    const prev = [row('b', '2026-06-02T00:00:00Z'), row('a', '2026-06-01T00:00:00Z')]
    const head = [row('b', '2026-06-02T00:00:00Z')]
    const { merged, newlyArrivedIds } = mergeHistoryHead(prev, head)
    expect(merged.map((r) => r.id)).toEqual(['b', 'a'])
    expect(newlyArrivedIds).toEqual([])
  })
})

describe('applyHistoryHeadRefresh', () => {
  const row = (id: string, created_at: string): HistoryTxRow =>
    ({ id, created_at }) as HistoryTxRow

  it('tags only brand-new head rows for animation', () => {
    const prev = [row('b', '2026-06-02T00:00:00Z')]
    const head = [row('c', '2026-06-03T00:00:00Z'), row('b', '2026-06-02T00:00:00Z')]
    const { rows, newlyArrivedIds } = applyHistoryHeadRefresh(prev, head)
    expect(newlyArrivedIds).toEqual(['c'])
    expect(rows[0].justArrived).toBe(true)
    expect(rows[1].justArrived).toBeUndefined()
  })
})

describe('stripJustArrived', () => {
  const row = (id: string, created_at: string): HistoryTxRow =>
    ({ id, created_at }) as HistoryTxRow

  it('removes justArrived without changing other fields', () => {
    const tagged = { ...row('c', '2026-06-03T00:00:00Z'), justArrived: true as const }
    expect(stripJustArrived(tagged)).toEqual(row('c', '2026-06-03T00:00:00Z'))
    expect(stripJustArrived(row('a', '2026-06-01T00:00:00Z'))).toEqual(
      row('a', '2026-06-01T00:00:00Z'),
    )
  })
})

describe('fetchHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chain.or.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    mockLimit.mockReturnValue(chain)
    mockSecondOrder.mockReturnValue({ limit: mockLimit })
    mockOrder.mockReturnValue({ order: mockSecondOrder })
    mockSelect.mockReturnValue({ order: mockOrder })
  })

  it('applies gives filter', async () => {
    await fetchHistoryPage({ kind: 'give' }, null, 10)
    expect(chain.eq).toHaveBeenCalledWith('type', 'give')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(mockSecondOrder).toHaveBeenCalledWith('id', { ascending: false })
  })

  it('asks for the exact total with the first page only', async () => {
    await fetchHistoryPage({ kind: 'all' }, null, 10)
    expect(mockSelect).toHaveBeenLastCalledWith(expect.any(String), {
      count: 'exact',
    })

    const cursor = {
      created_at: '2026-06-01T00:00:00Z',
      id: '00000000-0000-4000-8000-000000000001',
    }
    await fetchHistoryPage({ kind: 'all' }, cursor, 50)
    expect(mockSelect).toHaveBeenLastCalledWith(expect.any(String), undefined)
  })

  it('applies bucket filter', async () => {
    await fetchHistoryPage({ kind: 'bucket', bucketId: 'bucket-1' }, null, 10)
    expect(chain.or).toHaveBeenCalledWith(
      'from_bucket_id.eq.bucket-1,to_bucket_id.eq.bucket-1',
    )
  })

  it('paginates with created_at and id cursor', async () => {
    const cursor = {
      created_at: '2026-06-01T00:00:00Z',
      id: '00000000-0000-4000-8000-000000000001',
    }
    await fetchHistoryPage({ kind: 'all' }, cursor, 50)
    expect(chain.or).toHaveBeenCalledWith(historyPageCursorFilter(cursor))
    expect(mockLimit).toHaveBeenCalledWith(50)
  })
})

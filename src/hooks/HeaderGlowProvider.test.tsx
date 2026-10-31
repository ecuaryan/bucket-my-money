import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ status: 'signedIn' }) }))
vi.mock('@/lib/availableBalance', () => ({
  parseBreakdownRow: (data: { float: number }) => ({ float: data.float }),
}))

import { supabase } from '@/lib/supabase'
import {
  HeaderGlowProvider,
  useHeaderAccent,
  useReportFloat,
} from '@/hooks/HeaderGlowProvider'

const rpc = vi.mocked(supabase.rpc)
const glow = () => document.documentElement.style.getPropertyValue('--header-glow-rgb')

function Reporter({ float, accent }: { float?: number; accent?: string }) {
  useReportFloat(float ?? null)
  useHeaderAccent(accent ?? null)
  return null
}

let root: Root
let host: HTMLDivElement

async function render(child: React.ReactNode) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <HeaderGlowProvider>{child}</HeaderGlowProvider>
      </MemoryRouter>,
    )
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  root = createRoot(host)
  rpc.mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.documentElement.style.removeProperty('--header-glow-rgb')
})

describe('HeaderGlowProvider status bar', () => {
  it('tints theme-color to the glow and restores black on unmount', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#000000'
    document.head.appendChild(meta)
    rpc.mockResolvedValue({ data: { float: -50 }, error: null } as never)
    await render(null)
    expect(meta.content).toBe('rgb(25 11 11)')
    await act(async () => root.unmount())
    expect(meta.content).toBe('#000000')
    root = createRoot(host)
    meta.remove()
  })
})

describe('HeaderGlowProvider', () => {
  it('is red when the balance read on load is negative, with no page reporting', async () => {
    rpc.mockResolvedValue({ data: { float: -50 }, error: null } as never)
    await render(null)
    expect(glow()).toBe('248 113 113')
  })

  it('stays default (unset) when the balance is not negative', async () => {
    rpc.mockResolvedValue({ data: { float: 10 }, error: null } as never)
    await render(null)
    expect(glow()).toBe('')
  })

  it('lets a page accent win over red, and hands back when it leaves', async () => {
    rpc.mockResolvedValue({ data: { float: -10 }, error: null } as never)
    await render(null)
    await render(<Reporter accent="247 147 26" />)
    expect(glow()).toBe('247 147 26')
    await render(null)
    expect(glow()).toBe('248 113 113')
  })

  it('does not let a slower read overwrite a balance a page reported meanwhile', async () => {
    let finish: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((res) => (finish = res)) as never)
    await render(null)
    await render(<Reporter float={-5} />)
    expect(glow()).toBe('248 113 113')
    await act(async () => finish({ data: { float: 10 }, error: null }))
    expect(glow()).toBe('248 113 113')
  })

  it('keeps the last known glow when the read fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } } as never)
    await render(null)
    await render(<Reporter float={-5} />)
    expect(glow()).toBe('248 113 113')
  })
})

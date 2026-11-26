import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coarseBrowser, isReportable } from '@/lib/errorReports'

describe('isReportable', () => {
  const ok = (error: unknown, stack = 'at f (https://app.test/assets/index.js:1:2)') =>
    isReportable(error, (error as Error)?.message ?? String(error), stack)

  it('keeps real app errors', () => {
    expect(ok(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(true)
  })

  it('drops noise that says nothing about the app', () => {
    expect(ok(new Error(''))).toBe(false)
    expect(ok(new Error('Script error.'))).toBe(false)
    expect(ok(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false)
    expect(ok(new TypeError('Failed to fetch'))).toBe(false)
    expect(ok(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(false)
    expect(ok(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }))).toBe(false)
    expect(ok(new Error('boom'), 'at x (chrome-extension://abc/content.js:1:1)')).toBe(false)
  })
})

describe('coarseBrowser', () => {
  it('names the browser, major version and OS, nothing more', () => {
    expect(
      coarseBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari 18 · iOS')
    expect(
      coarseBrowser(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome 131 · Android')
    expect(
      coarseBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toBe('Edge 131 · macOS')
    expect(
      coarseBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'),
    ).toBe('Chrome 131 · iOS')
    expect(coarseBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe(
      'Firefox 133 · Windows',
    )
    expect(coarseBrowser('curl/8.0')).toBe('Other')
  })
})

describe('reportError', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('sends nothing outside production builds', async () => {
    vi.stubEnv('PROD', false)
    const { reportError } = await import('@/lib/errorReports')
    reportError('error', new Error('boom'))
    vi.runAllTimers()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('in production: sends once per error, as anon, capped per session', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk_test')
    const { reportError } = await import('@/lib/errorReports')

    reportError('render', new Error('boom'), '\n    in Plan')
    reportError('render', new Error('boom'))
    vi.runAllTimers()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://db.test/rest/v1/rpc/report_client_error')
    expect(init.keepalive).toBe(true)
    expect(init.headers).toEqual({ apikey: 'pk_test', 'content-type': 'application/json' }) // no session
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ p_kind: 'render', p_message: 'boom' })
    expect(body.p_stack).toContain('in Plan')

    for (let i = 0; i < 20; i += 1) reportError('error', new Error(`other ${i}`))
    vi.runAllTimers()
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })
})

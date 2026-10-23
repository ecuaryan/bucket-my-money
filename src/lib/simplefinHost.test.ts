import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimAccessUrl,
  decodeSetupToken as decodeServer,
  isSimpleFinUrl as isSimpleFinUrlServer,
  SimpleFinApiError,
  SimpleFinSetupTokenError as ServerTokenError,
} from '../../supabase/functions/_shared/simplefin'
import {
  decodeSetupToken as decodeClient,
  isSimpleFinUrl as isSimpleFinUrlClient,
  isValidSetupToken,
  SimpleFinSetupTokenError as ClientTokenError,
} from '@/lib/simplefinParse'

// New SimpleFIN connections are restricted to simplefin.org hosts: the server
// POSTs to the pasted claim URL and then stores whatever Access URL comes back.
// The client mirror (inline validation) and the server module must agree.

const GOOD = [
  'https://beta-bridge.simplefin.org/simplefin/claim/abc123',
  'https://bridge.simplefin.org/simplefin/claim/abc123',
  'https://simplefin.org/claim/abc123',
  'https://BETA-BRIDGE.SimpleFIN.org/simplefin/claim/abc123',
]

const BAD = [
  ['another host', 'https://example.com/simplefin/claim/abc123'],
  ['suffix look-alike', 'https://simplefin.org.evil.com/claim/abc'],
  ['prefix look-alike', 'https://evilsimplefin.org/claim/abc'],
  ['host in the path', 'https://evil.com/simplefin.org/claim/abc'],
  ['host in the userinfo', 'https://simplefin.org@evil.com/claim/abc'],
  ['backslash trick', 'https://evil.com\\@simplefin.org/claim/abc'],
  ['trailing-dot host', 'https://beta-bridge.simplefin.org./claim/abc'],
  ['explicit port', 'https://beta-bridge.simplefin.org:8443/claim/abc'],
  ['embedded credentials', 'https://user:pw@beta-bridge.simplefin.org/claim/abc'],
  ['internal address', 'https://169.254.169.254/latest/meta-data/'],
  ['localhost', 'https://localhost/claim/abc'],
  ['plain http', 'http://beta-bridge.simplefin.org/claim/abc'],
] as const

describe.each([
  ['server', decodeServer, ServerTokenError, isSimpleFinUrlServer],
  ['client', decodeClient, ClientTokenError, isSimpleFinUrlClient],
])('SimpleFIN host allow-list (%s)', (_name, decode, TokenError, isUrl) => {
  it.each(GOOD)('accepts %s', (url) => {
    expect(decode(btoa(url))).toBe(url)
  })

  it.each(BAD)('rejects %s', (_label, url) => {
    expect(() => decode(btoa(url))).toThrow(TokenError)
  })

  it('isSimpleFinUrl allows Access URL credentials but not other hosts', () => {
    expect(isUrl('https://u:p@beta-bridge.simplefin.org/simplefin')).toBe(true)
    expect(isUrl('https://u:p@evil.com/simplefin')).toBe(false)
    expect(isUrl('not a url')).toBe(false)
  })
})

describe('client inline validation', () => {
  it('flags a token for another host as not a valid Setup Token', () => {
    expect(isValidSetupToken(btoa(GOOD[0]))).toBe(true)
    expect(isValidSetupToken(btoa('https://example.com/claim/abc'))).toBe(false)
  })
})

describe('claimAccessUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (body: string, status = 200) => {
    const fn = vi.fn(async () => new Response(body, { status }))
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('claims a valid token and returns the Access URL', async () => {
    const fetchFn = stubFetch('https://u:p@beta-bridge.simplefin.org/simplefin\n')
    const url = await claimAccessUrl(btoa(GOOD[0]))
    expect(url).toBe('https://u:p@beta-bridge.simplefin.org/simplefin')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe(GOOD[0])
  })

  it('never makes a request for a claim URL on another host', async () => {
    const fetchFn = stubFetch('https://u:p@beta-bridge.simplefin.org/simplefin')
    await expect(
      claimAccessUrl(btoa('https://169.254.169.254/latest/meta-data/')),
    ).rejects.toBeInstanceOf(ServerTokenError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses to store an Access URL that is not on simplefin.org', async () => {
    stubFetch('https://u:p@evil.example/simplefin')
    await expect(claimAccessUrl(btoa(GOOD[0]))).rejects.toBeInstanceOf(
      SimpleFinApiError,
    )
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchMeetingToken, TokenError } from './token.ts'

/** Never actually waits: the backoff is asserted by the argument, not by the clock. */
const noSleep = () => Promise.resolve()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const mockFetch = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** RequestInit['body'] is a union wide enough that ESLint distrusts stringifying it. */
const sentBody = (fetchMock: ReturnType<typeof mockFetch>): unknown => {
  const body = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof body !== 'string') throw new Error('expected a JSON string body')
  return JSON.parse(body)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchMeetingToken', () => {
  test('returns the token and the role the server decided', async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'host' })))

    await expect(fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })).resolves.toEqual({
      token: 'jwt-1',
      role: 'host',
    })
  })

  test('sends the host grant so the server can mint a host token', async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'host' })),
    )

    await fetchMeetingToken({
      roomId: 'abc-defg-hij',
      hostGrant: 'grant-1',
      participantId: 'p-1',
      sleep: noSleep,
    })

    expect(sentBody(fetchMock)).toEqual({
      roomId: 'abc-defg-hij',
      hostGrant: 'grant-1',
      participantId: 'p-1',
    })
  })

  test('omits the grant entirely when we do not hold one, rather than sending null', async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'guest' })),
    )

    await fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })

    expect(sentBody(fetchMock)).toEqual({ roomId: 'abc-defg-hij' })
  })

  test('anything that is not literally "host" is a guest', async () => {
    // A mangled response must not be able to promote anyone.
    mockFetch(() => Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'HOST' })))

    const result = await fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })

    expect(result.role).toBe('guest')
  })

  test('retries a transport failure and succeeds', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      if (calls < 3) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'guest' }))
    })

    await expect(fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })).resolves.toEqual({
      token: 'jwt-1',
      role: 'guest',
    })
    expect(calls).toBe(3)
  })

  test('retries a 500, which may well be a blip', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      if (calls < 2) return Promise.resolve(jsonResponse({ error: 'boom' }, 500))
      return Promise.resolve(jsonResponse({ token: 'jwt-1', role: 'guest' }))
    })

    await fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })

    expect(calls).toBe(2)
  })

  test('does NOT retry a 400, which will say the same thing every time', async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(jsonResponse({ error: 'roomId required' }, 400)),
    )

    await expect(fetchMeetingToken({ roomId: '', sleep: noSleep })).rejects.toBeInstanceOf(
      TokenError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('gives up after the attempt budget rather than hammering forever', async () => {
    const fetchMock = mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    await expect(
      fetchMeetingToken({ roomId: 'abc-defg-hij', attempts: 3, sleep: noSleep }),
    ).rejects.toBeInstanceOf(TokenError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('backs off further on each attempt', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const waits: number[] = []

    await expect(
      fetchMeetingToken({
        roomId: 'abc-defg-hij',
        attempts: 4,
        sleep: (ms) => {
          waits.push(ms)
          return Promise.resolve()
        },
      }),
    ).rejects.toThrow()

    // No wait before the first try, then a widening one.
    expect(waits).toEqual([400, 800, 1600])
  })

  test('a 200 carrying no token is a broken deployment, not bad luck', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse({ role: 'guest' })))

    await expect(fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep })).rejects.toThrow(
      /no token/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a malformed body fails cleanly instead of throwing a SyntaxError at the UI', async () => {
    mockFetch(() => Promise.resolve(new Response('not json', { status: 200 })))

    await expect(
      fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep }),
    ).rejects.toBeInstanceOf(TokenError)
  })

  test('an abort is honoured immediately and not retried', async () => {
    const fetchMock = mockFetch(() =>
      Promise.reject(new DOMException('The operation was aborted.', 'AbortError')),
    )

    await expect(
      fetchMeetingToken({ roomId: 'abc-defg-hij', sleep: noSleep }),
    ).rejects.toBeInstanceOf(DOMException)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('TokenError', () => {
  test('classifies what is worth asking again', () => {
    expect(new TokenError('transport', null).retryable).toBe(true)
    expect(new TokenError('server', 503).retryable).toBe(true)
    expect(new TokenError('refused', 400).retryable).toBe(false)
    expect(new TokenError('refused', 404).retryable).toBe(false)
  })
})

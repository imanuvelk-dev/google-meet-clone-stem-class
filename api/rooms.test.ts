import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import handler from './rooms.js'
import { createMockRequest, createMockResponse } from './_lib/testing.js'
import { verifyHostGrant } from './_lib/tokens.js'

const SECRET = 'test-secret-not-a-real-one'
const API_KEY = 'test-api-key'
const CREATED_ROOM = 'abc-defg-hij'

const stubVideoSdk = (response: { ok: boolean; status?: number; payload?: unknown }) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: () => Promise.resolve(response.payload ?? {}),
    text: () => Promise.resolve(JSON.stringify(response.payload ?? {})),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.VIDEOSDK_API_KEY = API_KEY
  process.env.VIDEOSDK_SECRET = SECRET
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.VIDEOSDK_API_KEY
  delete process.env.VIDEOSDK_SECRET
})

const post = async () => {
  const { res, statusCode, body } = createMockResponse()
  await handler(createMockRequest({ method: 'POST' }), res)
  return { status: statusCode(), body: body() as Record<string, unknown> }
}

describe('POST /api/rooms', () => {
  test('creates a room and returns its id with a host grant', async () => {
    stubVideoSdk({ ok: true, payload: { roomId: CREATED_ROOM } })

    const { status, body } = await post()

    expect(status).toBe(200)
    expect(body.roomId).toBe(CREATED_ROOM)
    expect(typeof body.hostGrant).toBe('string')
  })

  test('the returned grant makes the creator host of exactly this room', async () => {
    stubVideoSdk({ ok: true, payload: { roomId: CREATED_ROOM } })

    const { body } = await post()
    const grant = body.hostGrant as string

    expect(verifyHostGrant({ grant, roomId: CREATED_ROOM, secret: SECRET })).toBe(true)
    expect(verifyHostGrant({ grant, roomId: 'another-room', secret: SECRET })).toBe(false)
  })

  test('calls VideoSDK with an Authorization token, not a raw secret', async () => {
    const fetchMock = stubVideoSdk({ ok: true, payload: { roomId: CREATED_ROOM } })

    await post()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.videosdk.live/v2/rooms')
    expect(init.method).toBe('POST')

    const auth = (init.headers as Record<string, string>).Authorization
    // A JWT, not the secret itself.
    expect(auth).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(auth).not.toBe(SECRET)
  })

  test('an upstream failure surfaces as a gateway error, not a fake room', async () => {
    stubVideoSdk({ ok: false, status: 503, payload: { error: 'upstream exploded' } })

    const { status, body } = await post()

    expect(status).toBe(502)
    expect(body.roomId).toBeUndefined()
  })

  test('a misconfigured server fails loudly', async () => {
    delete process.env.VIDEOSDK_SECRET
    const { status } = await post()
    expect(status).toBe(500)
  })

  test('non-POST is rejected', async () => {
    const { res, statusCode } = createMockResponse()
    await handler(createMockRequest({ method: 'GET' }), res)
    expect(statusCode()).toBe(405)
  })

  test('the response never contains the secret', async () => {
    stubVideoSdk({ ok: true, payload: { roomId: CREATED_ROOM } })
    const { body } = await post()
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })
})

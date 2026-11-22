import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import handler from './token.js'
import { createMockRequest, createMockResponse } from './_lib/testing.js'
import { signHostGrant } from './_lib/tokens.js'

const SECRET = 'test-secret-not-a-real-one'
const API_KEY = 'test-api-key'
const ROOM = 'abc-defg-hij'

beforeEach(() => {
  process.env.VIDEOSDK_API_KEY = API_KEY
  process.env.VIDEOSDK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.VIDEOSDK_API_KEY
  delete process.env.VIDEOSDK_SECRET
})

const post = (body: unknown) => {
  const { res, statusCode, body: responseBody } = createMockResponse()
  handler(createMockRequest({ body }), res)
  return { status: statusCode(), body: responseBody() as Record<string, unknown> }
}

describe('POST /api/token', () => {
  test('without a host grant you get a guest token', () => {
    const { status, body } = post({ roomId: ROOM })

    expect(status).toBe(200)
    expect(body.role).toBe('guest')
    const payload = jwt.verify(body.token as string, SECRET) as jwt.JwtPayload
    expect(payload.permissions).toEqual(['ask_join'])
  })

  test('with a valid host grant you get a host token', () => {
    const hostGrant = signHostGrant({ roomId: ROOM, secret: SECRET })
    const { status, body } = post({ roomId: ROOM, hostGrant })

    expect(status).toBe(200)
    expect(body.role).toBe('host')
    const payload = jwt.verify(body.token as string, SECRET) as jwt.JwtPayload
    expect(payload.permissions).toEqual(['allow_join', 'allow_mod'])
  })

  test('a forged host grant silently degrades to guest rather than erroring', () => {
    const forged = jwt.sign({ roomId: ROOM, role: 'host' }, 'wrong-secret', { algorithm: 'HS256' })
    const { status, body } = post({ roomId: ROOM, hostGrant: forged })

    expect(status).toBe(200)
    expect(body.role).toBe('guest')
  })

  test('a host grant for another room does not grant host here', () => {
    const grantForOtherRoom = signHostGrant({ roomId: 'some-other-room', secret: SECRET })
    const { body } = post({ roomId: ROOM, hostGrant: grantForOtherRoom })

    expect(body.role).toBe('guest')
  })

  test('roomId is required', () => {
    const { status } = post({})
    expect(status).toBe(400)
  })

  test('non-POST is rejected', () => {
    const { res, statusCode } = createMockResponse()
    handler(createMockRequest({ method: 'GET' }), res)
    expect(statusCode()).toBe(405)
  })

  test('a misconfigured server fails loudly and leaks nothing', () => {
    delete process.env.VIDEOSDK_SECRET
    const { status, body } = post({ roomId: ROOM })

    expect(status).toBe(500)
    expect(JSON.stringify(body)).not.toContain(API_KEY)
  })

  test('the response never contains the secret', () => {
    const { body } = post({ roomId: ROOM })
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })
})

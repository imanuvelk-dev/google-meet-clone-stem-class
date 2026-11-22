import jwt from 'jsonwebtoken'
import { describe, expect, test } from 'vitest'
import { mintApiToken, mintMeetingToken, signHostGrant, verifyHostGrant } from './tokens.js'

const SECRET = 'test-secret-not-a-real-one'
const OTHER_SECRET = 'a-different-secret'
const API_KEY = 'test-api-key'
const ROOM = 'abc-defg-hij'

describe('hostGrant', () => {
  test('a grant we signed verifies for the room it was issued for', () => {
    const grant = signHostGrant({ roomId: ROOM, secret: SECRET })
    expect(verifyHostGrant({ grant, roomId: ROOM, secret: SECRET })).toBe(true)
  })

  test('a grant for one room does not make you host of another room', () => {
    const grant = signHostGrant({ roomId: ROOM, secret: SECRET })
    expect(verifyHostGrant({ grant, roomId: 'xyz-different-room', secret: SECRET })).toBe(false)
  })

  test('a grant signed with a different secret is rejected', () => {
    const forged = jwt.sign({ roomId: ROOM, role: 'host' }, OTHER_SECRET, { algorithm: 'HS256' })
    expect(verifyHostGrant({ grant: forged, roomId: ROOM, secret: SECRET })).toBe(false)
  })

  test('an expired grant is rejected', () => {
    const expired = jwt.sign({ roomId: ROOM, role: 'host' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    })
    expect(verifyHostGrant({ grant: expired, roomId: ROOM, secret: SECRET })).toBe(false)
  })

  test('a garbage string is rejected rather than throwing', () => {
    expect(verifyHostGrant({ grant: 'not-a-jwt', roomId: ROOM, secret: SECRET })).toBe(false)
  })

  test('a token that is valid but not a host grant is rejected', () => {
    const notAGrant = jwt.sign({ roomId: ROOM, role: 'guest' }, SECRET, { algorithm: 'HS256' })
    expect(verifyHostGrant({ grant: notAGrant, roomId: ROOM, secret: SECRET })).toBe(false)
  })
})

describe('api token', () => {
  // Used to authenticate room creation, which is not scoped to any room yet.
  test('carries the apikey and no roomId', () => {
    const token = mintApiToken({ apiKey: API_KEY, secret: SECRET })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.apikey).toBe(API_KEY)
    expect(payload.roomId).toBeUndefined()
  })

  test('carries permissions VideoSDK accepts for room creation', () => {
    const token = mintApiToken({ apiKey: API_KEY, secret: SECRET })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.permissions).toContain('allow_join')
  })
})

describe('meeting token permissions', () => {
  // These two are inverted from intuition. See CLAUDE.md: allow_join enters
  // directly (HOST), ask_join must be admitted (GUEST). Getting this backwards
  // inverts the entire lobby flow.
  test('host token carries allow_join and allow_mod', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'host', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.permissions).toEqual(['allow_join', 'allow_mod'])
    expect(payload.permissions).not.toContain('ask_join')
  })

  test('guest token carries ask_join only', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'guest', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.permissions).toEqual(['ask_join'])
    expect(payload.permissions).not.toContain('allow_mod')
  })

  test('token carries the apikey VideoSDK requires', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'guest', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.apikey).toBe(API_KEY)
  })

  test('token is scoped to the room it was minted for', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'guest', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.roomId).toBe(ROOM)
  })

  test('token is signed HS256', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'guest', roomId: ROOM })
    const header = JSON.parse(
      Buffer.from(token.split('.')[0] ?? '', 'base64url').toString(),
    ) as Record<string, unknown>

    expect(header.alg).toBe('HS256')
  })

  test('token expires quickly, since VideoSDK validates only at join time', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'guest', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    const ttlSeconds = (payload.exp ?? 0) - (payload.iat ?? 0)
    expect(ttlSeconds).toBeGreaterThan(0)
    expect(ttlSeconds).toBeLessThanOrEqual(600)
  })

  test('the meeting token is not our host grant: it never claims role', () => {
    const token = mintMeetingToken({ apiKey: API_KEY, secret: SECRET, role: 'host', roomId: ROOM })
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload

    expect(payload.role).toBeUndefined()
  })
})

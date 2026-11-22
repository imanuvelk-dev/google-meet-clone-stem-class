import jwt from 'jsonwebtoken'

export type Role = 'host' | 'guest'

/**
 * VideoSDK permission names are inverted from intuition. See CLAUDE.md.
 *   allow_join - enters the meeting directly.        This is the HOST.
 *   ask_join   - must request permission to be let in. This is the GUEST.
 *   allow_mod  - may control other participants' mic/camera.
 */
const PERMISSIONS_BY_ROLE: Record<Role, readonly string[]> = {
  host: ['allow_join', 'allow_mod'],
  guest: ['ask_join'],
}

/**
 * Tokens are validated only at join time, so a short expiry never disconnects
 * an active participant. Keep it tight: it only has to survive precall.
 */
const MEETING_TOKEN_TTL_SECONDS = 600

/** The grant has to survive reloads and a reasonable meeting, but not forever. */
const HOST_GRANT_TTL_SECONDS = 12 * 60 * 60

interface HostGrantClaims {
  roomId: string
  role: 'host'
}

/**
 * Our own JWT proving "you created this room". Never sent to VideoSDK.
 * Bearer-shaped: whoever holds it is host. See the host model in CLAUDE.md.
 */
export function signHostGrant({ roomId, secret }: { roomId: string; secret: string }): string {
  const claims: HostGrantClaims = { roomId, role: 'host' }
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: HOST_GRANT_TTL_SECONDS })
}

export function verifyHostGrant({
  grant,
  roomId,
  secret,
}: {
  grant: string
  roomId: string
  secret: string
}): boolean {
  try {
    const payload = jwt.verify(grant, secret, { algorithms: ['HS256'] })
    if (typeof payload === 'string') return false
    // Scope the grant to its room, so a grant for one meeting cannot promote
    // the holder to host of another.
    return payload.role === 'host' && payload.roomId === roomId
  } catch {
    // Forged signature, expired, or malformed. All mean "not host".
    return false
  }
}

/**
 * Authenticates management calls such as room creation, which are not scoped to
 * a room. Deliberately carries no roomId.
 */
export function mintApiToken({ apiKey, secret }: { apiKey: string; secret: string }): string {
  return jwt.sign({ apikey: apiKey, permissions: PERMISSIONS_BY_ROLE.host, version: 2 }, secret, {
    algorithm: 'HS256',
    expiresIn: MEETING_TOKEN_TTL_SECONDS,
  })
}

/** VideoSDK's meeting token. Carries the permissions and is sent to the SDK. */
export function mintMeetingToken({
  apiKey,
  secret,
  role,
  roomId,
  participantId,
}: {
  apiKey: string
  secret: string
  role: Role
  roomId: string
  participantId?: string
}): string {
  const claims = {
    apikey: apiKey,
    permissions: PERMISSIONS_BY_ROLE[role],
    version: 2,
    roomId,
    ...(participantId ? { participantId } : {}),
  }
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: MEETING_TOKEN_TTL_SECONDS })
}

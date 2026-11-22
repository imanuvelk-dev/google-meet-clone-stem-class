/**
 * Guest identity: a display name and a generated avatar colour, in localStorage.
 * No OAuth, matching Meet's guest-join path. See CLAUDE.md.
 */

const NAME_KEY = 'meet-clone:display-name'
const COLOUR_KEY = 'meet-clone:avatar-colour'

/**
 * Avatar colours. Drawn from the design's own palette rather than invented, so
 * a generated avatar cannot look foreign next to the rest of the UI.
 */
const AVATAR_COLOURS = ['#0b57d0', '#00832d', '#ea4335', '#ffba00', '#0066da', '#601410'] as const

export interface Session {
  displayName: string
  avatarColour: string
}

/** localStorage throws in private mode and when disabled. Identity is not worth crashing over. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Non-fatal: the name simply will not survive a reload.
  }
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Non-fatal: a reload simply mints a new id.
  }
}

/** Stable per name, so the same guest keeps their colour across reloads. */
export function colourFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 2147483647
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length] ?? AVATAR_COLOURS[0]
}

export function loadSession(): Session | null {
  const displayName = read(NAME_KEY)
  if (!displayName) return null
  return { displayName, avatarColour: read(COLOUR_KEY) ?? colourFor(displayName) }
}

export function saveSession(displayName: string): Session {
  const trimmed = displayName.trim()
  const session = { displayName: trimmed, avatarColour: colourFor(trimmed) }
  write(NAME_KEY, session.displayName)
  write(COLOUR_KEY, session.avatarColour)
  return session
}

const HOST_GRANT_PREFIX = 'meet-clone:host-grant:'

/**
 * The host grant proves we created this room. Keyed by room, because holding a
 * grant for one meeting must never imply host of another. See CLAUDE.md.
 */
export function saveHostGrant(roomId: string, grant: string): void {
  write(`${HOST_GRANT_PREFIX}${roomId}`, grant)
}

export function loadHostGrant(roomId: string): string | null {
  return read(`${HOST_GRANT_PREFIX}${roomId}`)
}

const PARTICIPANT_ID_KEY = 'meet-clone:participant-id'

/**
 * VideoSDK evicts participants that share an id, so this is per TAB:
 * sessionStorage, not localStorage.
 *
 * Two tabs on one meeting is the first thing anyone testing this does, and
 * localStorage would hand both the same id and have the SDK evict them in turn.
 * A reload within one tab is not a collision - the earlier connection is already
 * gone - so reusing it there is safe, and it keeps a refresh from arriving as a
 * second person.
 *
 * Note this is identity for the SDK's benefit only. The display name is what a
 * human is known by, and the host grant is what carries authority; neither is
 * derived from this.
 */
export function loadParticipantId(): string {
  const existing = readSession(PARTICIPANT_ID_KEY)
  if (existing) return existing

  const id = randomParticipantId()
  writeSession(PARTICIPANT_ID_KEY, id)
  return id
}

/**
 * randomUUID needs a secure context, and so does media capture. The fallback
 * therefore only ever runs where the app cannot work anyway; it exists so that
 * plain HTTP fails at the camera, where the cause is legible, rather than here.
 */
function randomParticipantId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

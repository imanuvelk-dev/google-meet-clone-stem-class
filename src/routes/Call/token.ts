/**
 * Fetching VideoSDK's meeting token from our own /api/token.
 *
 * The role is decided on the server, from the host grant. A client cannot ask to
 * be host: all this does is present the grant if we happen to hold one, and the
 * server's answer is taken as final. See CLAUDE.md.
 *
 * Note /api/token only exists under `vercel dev`, not plain `vite`. That is why
 * the e2e suite fakes the whole client rather than only the network.
 */

export type Role = 'host' | 'guest'

export interface MeetingToken {
  token: string
  role: Role
}

export class TokenError extends Error {
  /** Null when the request never reached the endpoint at all. */
  readonly status: number | null
  readonly retryable: boolean

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'TokenError'
    this.status = status
    // A transport failure or a 5xx may well be a blip. A 4xx will say exactly
    // the same thing however many times we ask it.
    this.retryable = status === null || status >= 500
  }
}

export interface FetchMeetingTokenOptions {
  roomId: string
  participantId?: string
  /** Ours, not VideoSDK's. Absent means guest, which is not an error. */
  hostGrant?: string
  signal?: AbortSignal
  /** Tests only, so a retry does not cost real seconds. */
  attempts?: number
  sleep?: (ms: number) => Promise<void>
}

const BACKOFF_BASE_MS = 400

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fetchMeetingToken({
  roomId,
  participantId,
  hostGrant,
  signal,
  attempts = 3,
  sleep = wait,
}: FetchMeetingTokenOptions): Promise<MeetingToken> {
  let last: unknown = new TokenError('Could not reach the meeting service', null)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1))

    try {
      return await requestToken({ roomId, participantId, hostGrant, signal })
    } catch (caught) {
      // Abandoning the join is not a failure to retry past; it is what was asked.
      if (isAbort(caught)) throw caught
      if (caught instanceof TokenError && !caught.retryable) throw caught
      last = caught
    }
  }

  throw last
}

async function requestToken({
  roomId,
  participantId,
  hostGrant,
  signal,
}: {
  roomId: string
  // Spelled `| undefined` rather than `?`: exactOptionalPropertyTypes makes
  // "may be absent" and "may be undefined" different types, and these arrive
  // already destructured, so they are the latter.
  participantId: string | undefined
  hostGrant: string | undefined
  signal: AbortSignal | undefined
}): Promise<MeetingToken> {
  let response: Response
  try {
    response = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        ...(hostGrant === undefined ? {} : { hostGrant }),
        ...(participantId === undefined ? {} : { participantId }),
      }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (caught) {
    if (isAbort(caught)) throw caught
    // fetch rejects only on a transport failure, which is precisely the case a
    // retry exists for.
    throw new TokenError('Could not reach the meeting service', null)
  }

  if (!response.ok) {
    throw new TokenError(
      `The meeting service refused the request (${response.status})`,
      response.status,
    )
  }

  let body: { token?: unknown; role?: unknown }
  try {
    body = (await response.json()) as { token?: unknown; role?: unknown }
  } catch {
    throw new TokenError('The meeting service returned a malformed response', response.status)
  }

  if (typeof body.token !== 'string' || body.token.length === 0) {
    // A 200 carrying no token is a broken deployment, not bad luck, so this is
    // deliberately built with an unretryable status.
    throw new TokenError('The meeting service returned no token', response.status)
  }

  // Anything that is not literally "host" is a guest. A mangled response must
  // not be able to promote anyone.
  return { token: body.token, role: body.role === 'host' ? 'host' : 'guest' }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

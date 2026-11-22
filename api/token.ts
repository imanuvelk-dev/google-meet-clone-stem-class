import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintMeetingToken, verifyHostGrant, type Role } from './_lib/tokens.js'

interface TokenRequestBody {
  roomId?: unknown
  hostGrant?: unknown
  participantId?: unknown
}

/**
 * Mints a VideoSDK meeting token.
 *
 * The role is decided here, on the server, from the host grant. A client cannot
 * ask to be host: it can only present a grant we signed. See CLAUDE.md.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VIDEOSDK_API_KEY
  const secret = process.env.VIDEOSDK_SECRET
  if (!apiKey || !secret) {
    // Never echo which one is missing, or any of their values.
    return res.status(500).json({ error: 'Server is not configured for VideoSDK' })
  }

  const { roomId, hostGrant, participantId } = (req.body ?? {}) as TokenRequestBody
  if (typeof roomId !== 'string' || roomId.length === 0) {
    return res.status(400).json({ error: 'roomId is required' })
  }

  // An invalid or absent grant is not an error: it just means you are a guest.
  const role: Role =
    typeof hostGrant === 'string' && verifyHostGrant({ grant: hostGrant, roomId, secret })
      ? 'host'
      : 'guest'

  const token = mintMeetingToken({
    apiKey,
    secret,
    role,
    roomId,
    ...(typeof participantId === 'string' ? { participantId } : {}),
  })

  return res.status(200).json({ token, role })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mintApiToken, signHostGrant } from './_lib/tokens.js'

const VIDEOSDK_ROOMS_URL = 'https://api.videosdk.live/v2/rooms'

/**
 * Creates a VideoSDK room. Server-side because it needs a token, and the secret
 * that signs it must never reach the bundle.
 *
 * Returns the creator's host grant alongside the room. That grant is what makes
 * creator-is-host work without a database: the client keeps it and presents it
 * to /api/token later. See CLAUDE.md.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VIDEOSDK_API_KEY
  const secret = process.env.VIDEOSDK_SECRET
  if (!apiKey || !secret) {
    return res.status(500).json({ error: 'Server is not configured for VideoSDK' })
  }

  // Room creation authenticates with a token, never the raw secret.
  const apiToken = mintApiToken({ apiKey, secret })

  let upstream: Response
  try {
    upstream = await fetch(VIDEOSDK_ROOMS_URL, {
      method: 'POST',
      headers: {
        Authorization: apiToken,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    return res.status(502).json({ error: 'Could not reach VideoSDK' })
  }

  if (!upstream.ok) {
    // Swallow the upstream body: it is not ours to forward to the client.
    return res.status(502).json({ error: 'VideoSDK rejected the room request' })
  }

  const created = (await upstream.json()) as { roomId?: unknown }
  if (typeof created.roomId !== 'string' || created.roomId.length === 0) {
    return res.status(502).json({ error: 'VideoSDK returned no roomId' })
  }

  const roomId = created.roomId
  return res.status(200).json({ roomId, hostGrant: signHostGrant({ roomId, secret }) })
}

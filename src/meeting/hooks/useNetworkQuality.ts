import { useEffect, useState } from 'react'
import { useMediaClient } from '../MediaClientContext.ts'
import type { NetworkQuality } from '../MeetingClient.ts'

/**
 * Meet warns below 3 on VideoSDK's 1-5 scale. See docs/VIDEOSDK.md.
 *
 * The worse of the two directions decides it: a good downlink does not make a
 * call usable when nobody can hear you.
 */
const WARN_BELOW = 3

export type NetworkStatus = 'testing' | 'ok' | 'poor'

export interface Network {
  status: NetworkStatus
  /** Null until the test resolves, and if it never does. */
  quality: NetworkQuality | null
}

/**
 * Runs the pre-call network test once and says whether to warn.
 *
 * A failed test resolves to 'ok', not to a warning. The real test fetches a
 * token and samples for ~5s, so it can fail for reasons that say nothing about
 * the user's connection, and crying wolf on our own error would train people to
 * ignore the banner that matters.
 */
export function useNetworkQuality(): Network {
  const client = useMediaClient()
  const [network, setNetwork] = useState<Network>({ status: 'testing', quality: null })

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const quality = await client.runPreCallTest()
        if (cancelled) return
        const poor = Math.min(quality.uplink, quality.downlink) < WARN_BELOW
        setNetwork({ status: poor ? 'poor' : 'ok', quality })
      } catch {
        // Precall must still work when the probe does not.
        if (!cancelled) setNetwork({ status: 'ok', quality: null })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [client])

  return network
}

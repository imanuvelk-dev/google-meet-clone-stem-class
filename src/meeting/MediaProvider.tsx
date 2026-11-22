import { useMemo, type ReactNode } from 'react'
import { MediaClientContext } from './MediaClientContext.ts'
import type { MediaClient } from './MeetingClient.ts'
import { VideoSdkMediaClient } from './VideoSdkMediaClient.ts'

/**
 * The swap point. Tests mount this with a FakeMediaClient; the app gets the real
 * one. Nothing below here knows which it has, and nothing above here imports
 * VideoSDK.
 */
export function MediaProvider({ client, children }: { client?: MediaClient; children: ReactNode }) {
  // Memoised so a re-render does not hand every consumer a new client and
  // restart the camera.
  const value = useMemo(() => client ?? new VideoSdkMediaClient(), [client])

  return <MediaClientContext.Provider value={value}>{children}</MediaClientContext.Provider>
}

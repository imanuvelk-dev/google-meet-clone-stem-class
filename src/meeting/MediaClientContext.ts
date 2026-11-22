import { createContext, useContext } from 'react'
import type { MediaClient } from './MeetingClient.ts'

/**
 * Split from MediaProvider.tsx so that file exports only a component, which is
 * what React Fast Refresh needs to hot-reload it reliably.
 */
export const MediaClientContext = createContext<MediaClient | null>(null)

export function useMediaClient(): MediaClient {
  const client = useContext(MediaClientContext)
  if (!client) throw new Error('useMediaClient must be used inside <MediaProvider>')
  return client
}

import { useSyncExternalStore } from 'react'
import { useCallClient } from '../CallContext.ts'

/**
 * The roster, as ids.
 *
 * Ids rather than objects on purpose. This is what the grid needs in order to
 * decide who is on which page and how many tiles fit, and it changes only when
 * someone joins or leaves. Returning participant objects would rebuild the array
 * on every mic toggle in the meeting and re-render the whole grid with it, which
 * does not survive 49 tiles.
 *
 * Each tile then reads its own participant with useParticipantView(id).
 */
export function useParticipants(): readonly string[] {
  const client = useCallClient()
  return useSyncExternalStore(client.subscribe, client.getParticipantIds)
}

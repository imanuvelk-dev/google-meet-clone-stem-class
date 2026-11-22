import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { CallParticipant, StreamKind, VideoQuality } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface ParticipantView extends CallParticipant {
  /** What WE consume of this publisher. Stepped by tile count and layout. */
  setQuality: (quality: VideoQuality) => void
  /** Paginated-away tiles pause, so an offscreen participant costs no bandwidth. */
  setStreamPaused: (kind: StreamKind, paused: boolean) => void
  /** Needs allow_mod on the token. */
  remove: () => void
}

/**
 * One participant, for one tile. Null while they are unknown or after they leave.
 *
 * Carries no isActiveSpeaker or isPinned, though both are per-participant facts.
 * They live in CallState because they are singular: the grid reads them once from
 * useCall and passes them down. Reading them here would subscribe every tile to
 * every call-level change, which is the re-render storm this hook exists to avoid.
 */
export function useParticipantView(participantId: string): ParticipantView | null {
  const client = useCallClient()

  // Stable per id, as useSyncExternalStore requires. getParticipant returns the
  // same object until that participant changes, so a tile re-renders only for
  // its own participant even though subscribe is meeting-wide.
  const getSnapshot = useCallback(
    () => client.getParticipant(participantId),
    [client, participantId],
  )
  const participant = useSyncExternalStore(client.subscribe, getSnapshot)

  const commands = useMemo(
    () => ({
      setQuality: (quality: VideoQuality) => client.setParticipantQuality(participantId, quality),
      setStreamPaused: (kind: StreamKind, paused: boolean) =>
        client.setStreamPaused(participantId, kind, paused),
      remove: () => client.removeParticipant(participantId),
    }),
    [client, participantId],
  )

  return useMemo(
    () => (participant ? { ...participant, ...commands } : null),
    [participant, commands],
  )
}

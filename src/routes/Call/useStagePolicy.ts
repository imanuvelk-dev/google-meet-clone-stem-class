import { useEffect, useRef } from 'react'
import type { VideoQuality } from '@meeting/CallClient.ts'
import { useCallClient } from '@meeting/CallContext.ts'

/**
 * What the stage asks of each publisher: how much of them to consume, and
 * whether to consume them at all.
 *
 * This lives above the tiles rather than in them, and has to. A paginated-away
 * participant has no tile, so a tile could never be the thing that pauses them -
 * the moment they stop being rendered is the moment a tile-level effect stops
 * being able to speak. So the stage, which is the thing that knows who is on
 * screen, is the thing that says so.
 *
 * Only webcam pauses. Mic never does: CallAudio sits outside the stage precisely
 * so someone on page 2 is still heard, and pausing their mic here would undo
 * that from the other end.
 */
export function useStagePolicy(
  allIds: readonly string[],
  qualityById: ReadonlyMap<string, VideoQuality>,
  localParticipantId: string | null,
): void {
  const client = useCallClient()

  // What we last told the client, so a re-render is not a fresh round of
  // commands. Both maps are ours alone and are never read during render.
  const appliedQuality = useRef(new Map<string, VideoQuality>())
  const appliedPause = useRef(new Map<string, boolean>())

  useEffect(() => {
    const live = new Set(allIds)

    for (const id of allIds) {
      // Yourself. Your camera is already in your hand: there is no publisher to
      // ask for less of, and nothing to pause that would save anyone anything.
      if (id === localParticipantId) continue

      const quality = qualityById.get(id) ?? 'low'
      const paused = !qualityById.has(id)

      if (appliedQuality.current.get(id) !== quality) {
        appliedQuality.current.set(id, quality)
        client.setParticipantQuality(id, quality)
      }

      if (appliedPause.current.get(id) !== paused) {
        appliedPause.current.set(id, paused)
        client.setStreamPaused(id, 'webcam', paused)
      }
    }

    // Someone who left must not be remembered as paused, or rejoining under the
    // same id would find us silently declining to render them.
    for (const id of [...appliedQuality.current.keys()]) {
      if (!live.has(id)) appliedQuality.current.delete(id)
    }
    for (const id of [...appliedPause.current.keys()]) {
      if (!live.has(id)) appliedPause.current.delete(id)
    }
  }, [client, allIds, qualityById, localParticipantId])
}

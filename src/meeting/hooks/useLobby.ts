import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { PendingEntry } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface Lobby {
  /** Host side. Empty for a guest. */
  pendingIds: readonly string[]
  admit: (participantId: string) => void
  deny: (participantId: string) => void
}

export function useLobby(): Lobby {
  const client = useCallClient()
  const pendingIds = useSyncExternalStore(client.subscribe, client.getPendingEntryIds)

  const commands = useMemo(
    () => ({
      admit: (participantId: string) => client.admitParticipant(participantId),
      deny: (participantId: string) => client.denyParticipant(participantId),
    }),
    [client],
  )

  return useMemo(() => ({ pendingIds, ...commands }), [pendingIds, commands])
}

export function usePendingEntry(participantId: string): PendingEntry | null {
  const client = useCallClient()
  const getSnapshot = useCallback(
    () => client.getPendingEntry(participantId),
    [client, participantId],
  )
  return useSyncExternalStore(client.subscribe, getSnapshot)
}

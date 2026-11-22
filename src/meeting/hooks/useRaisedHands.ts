import { useMemo, useSyncExternalStore } from 'react'
import { useCallClient } from '../CallContext.ts'

export interface RaisedHands {
  /** Ordered, earliest first. For the panel and the bar - never a tile. */
  ids: readonly string[]
  setRaised: (raised: boolean) => void
  lower: (participantId: string) => void
}

export function useRaisedHands(): RaisedHands {
  const client = useCallClient()
  const ids = useSyncExternalStore(client.subscribe, client.getRaisedHands)

  const commands = useMemo(
    () => ({
      setRaised: (raised: boolean) => client.setHandRaised(raised),
      lower: (participantId: string) => client.lowerParticipantHand(participantId),
    }),
    [client],
  )

  return useMemo(() => ({ ids, ...commands }), [ids, commands])
}

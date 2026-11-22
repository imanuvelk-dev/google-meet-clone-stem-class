import { useCallback } from 'react'
import { useCallClient } from '@meeting/CallContext.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useHostControls } from '@meeting/hooks/useHostControls.ts'

export function useMuteEveryone(): () => void {
  const client = useCallClient()
  const { localParticipantId } = useCall()
  const host = useHostControls()

  return useCallback(() => {
    for (const id of client.getParticipantIds()) {
      if (id === localParticipantId) continue
      const participant = client.getParticipant(id)
      if (!participant?.micOn) continue
      host.mute(id)
    }
  }, [client, localParticipantId, host])
}

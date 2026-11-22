import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useCallClient } from '../CallContext.ts'

export interface HostControls {
  isHost: boolean
  mute: (participantId: string) => void
  disableWebcam: (participantId: string) => void
  /** Asks. The target may refuse. There is deliberately no force-unmute. */
  requestMic: (participantId: string) => void
  requestWebcam: (participantId: string) => void
  remove: (participantId: string) => void
}

/**
 * A primitive snapshot, so this re-renders only when host-ness itself moves and
 * not when the active speaker changes.
 */
export function useIsHost(): boolean {
  const client = useCallClient()
  const getSnapshot = useCallback(() => client.getState().isHost, [client])
  return useSyncExternalStore(client.subscribe, getSnapshot)
}

export function useHostControls(): HostControls {
  const client = useCallClient()
  const isHost = useIsHost()

  const commands = useMemo(
    () => ({
      mute: (participantId: string) => client.muteParticipant(participantId),
      disableWebcam: (participantId: string) => client.disableParticipantWebcam(participantId),
      requestMic: (participantId: string) => client.requestParticipantMic(participantId),
      requestWebcam: (participantId: string) => client.requestParticipantWebcam(participantId),
      remove: (participantId: string) => client.removeParticipant(participantId),
    }),
    [client],
  )

  return useMemo(() => ({ isHost, ...commands }), [isHost, commands])
}

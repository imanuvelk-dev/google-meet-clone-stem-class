import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { MediaRequest } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface MediaRequests {
  micRequest: MediaRequest | null
  webcamRequest: MediaRequest | null
  acceptMic: () => void
  rejectMic: () => void
  acceptWebcam: () => void
  rejectWebcam: () => void
}

/**
 * The receiving side of a host's ask. Separate from useHostControls: this is
 * what happens TO you, not what you do to somebody else.
 */
export function useMediaRequests(): MediaRequests {
  const client = useCallClient()
  const getMic = useCallback(() => client.getState().micRequest, [client])
  const getWebcam = useCallback(() => client.getState().webcamRequest, [client])
  const micRequest = useSyncExternalStore(client.subscribe, getMic)
  const webcamRequest = useSyncExternalStore(client.subscribe, getWebcam)

  const commands = useMemo(
    () => ({
      acceptMic: () => client.acceptMicRequest(),
      rejectMic: () => client.rejectMicRequest(),
      acceptWebcam: () => client.acceptWebcamRequest(),
      rejectWebcam: () => client.rejectWebcamRequest(),
    }),
    [client],
  )

  return useMemo(
    () => ({ micRequest, webcamRequest, ...commands }),
    [micRequest, webcamRequest, commands],
  )
}

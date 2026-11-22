import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { CallState } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface Call extends CallState {
  join: () => void
  leave: () => void
  /** Terminates the meeting for everyone, not just you. */
  end: () => void
  toggleMic: () => void
  setMicEnabled: (enabled: boolean) => void
  toggleWebcam: () => void
  setWebcamEnabled: (enabled: boolean) => void
  toggleScreenShare: () => void
  setScreenShareEnabled: (enabled: boolean) => void
  changeCamera: (deviceId: string) => void
  changeMicrophone: (deviceId: string) => void
  /** Local view only. Pass null to unpin. */
  pin: (participantId: string | null) => void
}

/**
 * A primitive snapshot, so a consumer that only needs to know which participant
 * is us does not re-render when the active speaker changes. Anything rendered
 * once per participant wants this, never useCall.
 */
export function useLocalParticipantId(): string | null {
  const client = useCallClient()
  const getSnapshot = useCallback(() => client.getState().localParticipantId, [client])
  return useSyncExternalStore(client.subscribe, getSnapshot)
}

/**
 * The call itself: connection state, local media, and the commands.
 *
 * Deliberately carries no roster. Every tile subscribing to this would re-render
 * all 49 of them every time anyone touched their mic. Tiles use useParticipants
 * and useParticipantView, which change only when the thing they name changes.
 */
export function useCall(): Call {
  const client = useCallClient()
  const state = useSyncExternalStore(client.subscribe, client.getState)

  // Bound here rather than as arrow fields on every implementation, so an
  // onClick={call.leave} cannot silently lose `this`.
  const commands = useMemo(
    () => ({
      join: () => client.join(),
      leave: () => client.leave(),
      end: () => client.end(),
      toggleMic: () => client.toggleMic(),
      setMicEnabled: (enabled: boolean) => client.setMicEnabled(enabled),
      toggleWebcam: () => client.toggleWebcam(),
      setWebcamEnabled: (enabled: boolean) => client.setWebcamEnabled(enabled),
      toggleScreenShare: () => client.toggleScreenShare(),
      setScreenShareEnabled: (enabled: boolean) => client.setScreenShareEnabled(enabled),
      changeCamera: (deviceId: string) => client.changeCamera(deviceId),
      changeMicrophone: (deviceId: string) => client.changeMicrophone(deviceId),
      pin: (participantId: string | null) => client.setPinnedParticipant(participantId),
    }),
    [client],
  )

  return { ...state, ...commands }
}

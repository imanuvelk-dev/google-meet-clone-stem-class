import { loadHostGrant } from '@lib/session.ts'
import type { CallClient } from '@meeting/CallClient.ts'
import { VideoSdkCallClient } from '@meeting/VideoSdkCallClient.ts'
import { fetchMeetingToken } from './token.ts'

/**
 * Everything only the green room knows, handed to whoever builds the call.
 *
 * This is a seam of its own, above the CallClient seam. Constructing a real call
 * means fetching a token first, so a test that swapped only the client would
 * still have to reach /api/token. Swapping the whole act of creation instead
 * lets e2e drive join, failure and reconnection with no network at all.
 */
export interface CallSetup {
  meetingId: string
  name: string
  /** Unique within the meeting, or VideoSDK evicts people. See session.ts. */
  participantId: string
  micEnabled: boolean
  webcamEnabled: boolean
  /** Precall's live tracks, so the camera does not flicker off and on at join. */
  cameraStream: MediaStream | null
  microphoneStream: MediaStream | null
  signal?: AbortSignal
}

export type CreateCall = (setup: CallSetup) => Promise<CallClient>

export const createVideoSdkCall: CreateCall = async (setup) => {
  // The first and only caller of loadHostGrant. Holding one for this room is
  // what makes /api/token mint a host token (allow_join + allow_mod) instead of
  // a guest one (ask_join). Not holding one is the ordinary case, not an error.
  const hostGrant = loadHostGrant(setup.meetingId)

  const { token, role } = await fetchMeetingToken({
    roomId: setup.meetingId,
    participantId: setup.participantId,
    ...(hostGrant === null ? {} : { hostGrant }),
    ...(setup.signal === undefined ? {} : { signal: setup.signal }),
  })

  return new VideoSdkCallClient({
    meetingId: setup.meetingId,
    token,
    name: setup.name,
    participantId: setup.participantId,
    micEnabled: setup.micEnabled,
    webcamEnabled: setup.webcamEnabled,
    isHost: role === 'host',
    // MeetingProvider takes a MediaStream here, which is exactly what
    // MediaClient.createCameraTrack already returns: a direct handoff.
    ...(setup.cameraStream === null ? {} : { customCameraVideoTrack: setup.cameraStream }),
    ...(setup.microphoneStream === null
      ? {}
      : { customMicrophoneAudioTrack: setup.microphoneStream }),
  })
}

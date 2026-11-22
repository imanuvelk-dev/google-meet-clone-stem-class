import type { ComponentType, ReactNode } from 'react'
import type { Device } from './MeetingClient.ts'
import type { ReactionEmoji } from './pubsubTopics.ts'

/**
 * The in-call half of the seam, alongside MediaClient in MeetingClient.ts.
 *
 * Deliberately a second client, not an extension of MediaClient: precall runs
 * outside MeetingProvider via useMediaDevice, in-call runs inside it via
 * useMeeting. See MeetingClient.ts's header.
 *
 * MediaClient could be a plain object interface because precall only needs
 * VideoSDK's non-hook exports. In-call has no such escape hatch: useMeeting and
 * useParticipant are hooks, and a hook cannot implement an interface. So this
 * contract is a *store* (subscribe/getState, read via useSyncExternalStore) plus
 * imperative commands, and the real implementation fills the store from invisible
 * bridge components mounted inside VideoSDK's own provider. The fake fills the
 * same store directly, with no bridges and no network.
 */

/**
 * Our connection vocabulary. Not the SDK's.
 *
 * The SDK's onMeetingStateChanged type omits RECONNECTING, but its compiled
 * runtime emits it. The type is wrong, so mapping happens inside the seam
 * (connectionStateFromSdk) and the SDK's strings never reach a component.
 *
 * 'closed' and 'disconnected' are kept apart on purpose: the meeting ending for
 * everyone and you alone dropping out are different sentences to a user.
 */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closing'
  | 'closed'
  | 'disconnected'
  | 'failed'

/** What WE consume of a remote publisher, via useParticipant's setQuality. */
export type VideoQuality = 'low' | 'med' | 'high'

export type StreamKind = 'webcam' | 'mic' | 'screenShare'

/** Drives Meet's network indicator. */
export interface QualityLimitation {
  type: 'congestion' | 'bandwidth' | 'cpu'
  state: 'detected' | 'resolved'
}

/**
 * A code is an identifier, not a quantity, so ours is a string. The SDK types
 * onError's code as string and onMeetingLeft's as number, which cannot both be
 * describing the same kind of thing; coercing here costs nothing and means a
 * change on their side cannot become a runtime surprise on ours.
 */
export interface CallError {
  code: string
  message: string
}

export interface LeaveReason {
  code: string
  message: string
}

export interface CallParticipant {
  id: string
  displayName: string
  isLocal: boolean
  micOn: boolean
  webcamOn: boolean
  screenShareOn: boolean
  /** Null when the corresponding track is off. Stable while the track is unchanged. */
  webcamStream: MediaStream | null
  micStream: MediaStream | null
  screenShareStream: MediaStream | null
  handRaised: boolean
}

export interface ChatMessage {
  readonly id: string
  readonly senderId: string
  readonly senderName: string
  readonly text: string
  readonly timestamp: number
}

export interface CallReaction {
  id: string
  participantId: string
  emoji: ReactionEmoji
  timestamp: number
}

export interface PendingEntry {
  participantId: string
  name: string
  requestedAt: number
}

export interface MediaRequest {
  participantId: string | null
}

export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping'

export type TranscriptionState = 'idle' | 'starting' | 'transcribing' | 'stopping'

export interface Caption {
  id: string
  participantId: string
  participantName: string
  text: string
  timestamp: number
}

/**
 * Everything about the call that is not per-participant.
 *
 * Participants are deliberately NOT in here. A roster array that changed
 * whenever anyone's mic toggled would re-render every consumer of this state,
 * which does not hold at Meet's 49 tiles. Read participants through
 * getParticipantIds/getParticipant instead, each of which changes only when the
 * thing it names changes.
 */
export interface CallState {
  connection: ConnectionState
  meetingId: string | null
  localParticipantId: string | null
  activeSpeakerId: string | null
  /** Whoever is screen sharing. Null when nobody is. */
  presenterId: string | null
  /**
   * Local-only. Meet's pin changes your view and nobody else's, so it lives in
   * our state and never touches the SDK's pin(), which broadcasts. See CLAUDE.md.
   */
  pinnedParticipantId: string | null
  localMicOn: boolean
  localWebcamOn: boolean
  localScreenShareOn: boolean
  selectedCameraId: string | null
  selectedMicrophoneId: string | null
  qualityLimitation: QualityLimitation | null
  /** Set once the meeting is over, so post-call can say why. */
  leaveReason: LeaveReason | null
  error: CallError | null
  isHost: boolean
  entryDecision: 'allowed' | 'denied' | null
  micRequest: MediaRequest | null
  webcamRequest: MediaRequest | null
  isRecording: boolean
  recordingState: RecordingState
  transcription: TranscriptionState
  whiteboardUrl: string | null
}

export interface CallClient {
  /**
   * Mounted by CallProvider around the app's children.
   *
   * The real client can only read VideoSDK from inside VideoSDK's own provider,
   * so it needs React mounted to work at all: Host is where its bridges live.
   * The fake's Host is a passthrough, which is the whole point of the seam.
   */
  readonly Host: ComponentType<{ children: ReactNode }>

  /**
   * Store reads. Consumed via useSyncExternalStore, so snapshots are
   * referentially stable: getState returns the same object until something
   * genuinely changed, and getParticipant the same one per participant.
   *
   * Declared as properties rather than methods because they are handed to
   * useSyncExternalStore as bare references. Implementations must bind them, and
   * this shape is what says so.
   */
  readonly subscribe: (listener: () => void) => () => void
  readonly getState: () => CallState
  readonly getParticipantIds: () => readonly string[]
  readonly getParticipant: (participantId: string) => CallParticipant | null
  readonly getChatMessages: () => readonly ChatMessage[]
  readonly getChatUnreadCount: () => number
  readonly getRaisedHands: () => readonly string[]
  readonly getPendingEntryIds: () => readonly string[]
  readonly getPendingEntry: (participantId: string) => PendingEntry | null

  readonly subscribeToReactions: (listener: (reaction: CallReaction) => void) => () => void
  readonly subscribeToCaptions: (listener: (caption: Caption) => void) => () => void

  join(): void
  /** Removes only you. */
  leave(): void
  /** Terminates the meeting for everyone. */
  end(): void

  toggleMic(): void
  setMicEnabled(enabled: boolean): void
  toggleWebcam(): void
  setWebcamEnabled(enabled: boolean): void
  toggleScreenShare(): void
  setScreenShareEnabled(enabled: boolean): void

  /** In-call device lists. Named apart from precall's because the SDK's are too. */
  getCameras(): Promise<Device[]>
  getMicrophones(): Promise<Device[]>
  changeCamera(deviceId: string): void
  changeMicrophone(deviceId: string): void

  /** Local view state only. Never the SDK's pin. */
  setPinnedParticipant(participantId: string | null): void

  setParticipantQuality(participantId: string, quality: VideoQuality): void
  /** Paginated-away tiles must stop costing bandwidth. */
  setStreamPaused(participantId: string, kind: StreamKind, paused: boolean): void
  removeParticipant(participantId: string): void

  sendChatMessage(text: string): void
  markChatRead(): void
  sendReaction(emoji: ReactionEmoji): void
  setHandRaised(raised: boolean): void
  lowerParticipantHand(participantId: string): void

  admitParticipant(participantId: string): void
  denyParticipant(participantId: string): void

  muteParticipant(participantId: string): void
  disableParticipantWebcam(participantId: string): void
  requestParticipantMic(participantId: string): void
  requestParticipantWebcam(participantId: string): void
  acceptMicRequest(): void
  rejectMicRequest(): void
  acceptWebcamRequest(): void
  rejectWebcamRequest(): void

  startRecording(): void
  stopRecording(): void

  startWhiteboard(): void
  stopWhiteboard(): void

  startCaptions(): void
}

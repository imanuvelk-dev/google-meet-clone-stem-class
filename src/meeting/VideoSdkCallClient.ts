import { createElement, type ComponentType, type ReactNode } from 'react'
import type {
  CallClient,
  CallError,
  CallState,
  ConnectionState,
  LeaveReason,
  QualityLimitation,
  RecordingState,
  StreamKind,
  TranscriptionState,
  VideoQuality,
} from './CallClient.ts'
import {
  CallStore,
  type ChatMessageFacts,
  type HandRaiseFacts,
  type ParticipantFacts,
} from './CallStore.ts'
import type { Device } from './MeetingClient.ts'
import { isReactionEmoji, type HandRaiseVerb, type ReactionEmoji } from './pubsubTopics.ts'
import { VideoSdkCallHost } from './VideoSdkCallHost.tsx'

/**
 * The real CallClient: a store the bridges in VideoSdkCallHost push into.
 *
 * This file imports no VideoSDK. That is not incidental. Every VideoSDK
 * in-call API is a hook, so all contact with the SDK is confined to the bridge
 * components, and what is left here is plain state plus delegation to whatever
 * handles the bridges last attached. Which means the whole store, including the
 * connection-state mapping that the SDK's own types get wrong, is unit-testable
 * without mounting VideoSDK at all.
 */

export interface VideoSdkCallConfig {
  meetingId: string
  /** VideoSDK's short-lived meeting token, from /api/token. Not our host grant. */
  token: string
  name: string
  /** Must be unique within the meeting, or participants get evicted. */
  participantId?: string
  micEnabled: boolean
  webcamEnabled: boolean
  /**
   * Precall's live tracks, handed straight to MeetingProvider so the camera does
   * not visibly flicker off and on entering the call. MediaClient.createCameraTrack
   * already returns exactly the MediaStream the SDK wants here.
   */
  customCameraVideoTrack?: MediaStream
  customMicrophoneAudioTrack?: MediaStream
  isHost: boolean
  recordingWebhookUrl?: string
}

/** What one render of useMeeting can do. Attached by the bridge. */
export interface MeetingHandle {
  join(): void
  leave(): void
  end(): void
  toggleMic(): void
  muteMic(): void
  unmuteMic(): void
  toggleWebcam(): void
  enableWebcam(): void
  disableWebcam(): void
  toggleScreenShare(): void
  enableScreenShare(): void
  disableScreenShare(): void
  getMics(): Promise<Device[]>
  getWebcams(): Promise<Device[]>
  changeMic(deviceId: string): void
  changeWebcam(deviceId: string): void
  startRecording(webhookUrl: string | undefined): void
  stopRecording(): void
}

/** What one render of useParticipant can do. Attached per participant. */
export interface ParticipantHandle {
  setQuality(quality: VideoQuality): void
  setStreamPaused(kind: StreamKind, paused: boolean): void
  remove(): void
  disableMic(): void
  disableWebcam(): void
  requestMic(): void
  requestWebcam(): void
}

export interface ChatHandle {
  publish(text: string): void
}

export interface ReactionsHandle {
  publish(emoji: ReactionEmoji): void
}

export interface HandRaiseHandle {
  publish(verb: HandRaiseVerb, participantId: string): void
}

export interface EntryRequestHandle {
  allow(): void
  deny(): void
}

export interface MediaRequestHandle {
  accept(): void
  reject(): void
}

export interface TranscriptionHandle {
  start(): void
}

export interface WhiteboardHandle {
  start(): void
  stop(): void
}

export function recordingStateFromSdk(status: string): RecordingState | null {
  switch (status) {
    case 'RECORDING_STARTING':
      return 'starting'
    case 'RECORDING_STARTED':
      return 'recording'
    case 'RECORDING_STOPPING':
      return 'stopping'
    case 'RECORDING_STOPPED':
      return 'idle'
    default:
      return null
  }
}

export function transcriptionStateFromSdk(status: string): TranscriptionState | null {
  switch (status) {
    case 'TRANSCRIPTION_STARTING':
      return 'starting'
    case 'TRANSCRIPTION_STARTED':
      return 'transcribing'
    case 'TRANSCRIPTION_STOPPING':
      return 'stopping'
    case 'TRANSCRIPTION_STOPPED':
      return 'idle'
    default:
      return null
  }
}

/**
 * The SDK's onMeetingStateChanged is typed
 * 'CONNECTING'|'CONNECTED'|'FAILED'|'DISCONNECTED'|'CLOSING'|'CLOSED', but its
 * compiled runtime contains `if (data?.state === 'RECONNECTING')` before it
 * emits the event. The type is incomplete, not the docs, and comparing against
 * 'RECONNECTING' therefore does not typecheck against it.
 *
 * So we take a bare string and own the vocabulary on this side. This is the
 * seam earning its keep: nothing downstream ever sees the SDK's wrong union.
 *
 * An unrecognised state returns null and is ignored rather than guessed at.
 * Coercing an unknown string to 'failed' would put a false error screen in
 * front of a working meeting the first time the SDK adds a state.
 */
export function connectionStateFromSdk(state: string): ConnectionState | null {
  switch (state) {
    case 'CONNECTING':
      return 'connecting'
    case 'CONNECTED':
      return 'connected'
    case 'RECONNECTING':
      return 'reconnecting'
    case 'CLOSING':
      return 'closing'
    case 'CLOSED':
      return 'closed'
    case 'DISCONNECTED':
      return 'disconnected'
    case 'FAILED':
      return 'failed'
    default:
      return null
  }
}

export class VideoSdkCallClient extends CallStore implements CallClient {
  readonly config: VideoSdkCallConfig

  readonly Host: ComponentType<{ children: ReactNode }> = ({ children }) =>
    createElement(VideoSdkCallHost, { client: this, config: this.config, children })

  private meeting: MeetingHandle | null = null
  private readonly participantHandles = new Map<string, ParticipantHandle>()
  private chat: ChatHandle | null = null
  private reactions: ReactionsHandle | null = null
  private handRaise: HandRaiseHandle | null = null
  private readonly entryHandles = new Map<string, EntryRequestHandle>()
  private micRequestHandle: MediaRequestHandle | null = null
  private webcamRequestHandle: MediaRequestHandle | null = null
  private transcription: TranscriptionHandle | null = null
  private whiteboard: WhiteboardHandle | null = null
  private reactionSeq = 0
  private captionSeq = 0

  constructor(config: VideoSdkCallConfig) {
    super()
    this.config = config
    this.patchState({ isHost: config.isHost })
  }

  // --- Pushed in by VideoSdkCallHost. Not for anyone else. ---

  attachMeeting(handle: MeetingHandle): void {
    this.meeting = handle
  }

  syncMeetingState(
    patch: Pick<
      CallState,
      | 'meetingId'
      | 'localParticipantId'
      | 'activeSpeakerId'
      | 'presenterId'
      | 'localMicOn'
      | 'localWebcamOn'
      | 'localScreenShareOn'
      | 'selectedCameraId'
      | 'selectedMicrophoneId'
    >,
  ): void {
    this.patchState(patch)
  }

  attachParticipant(participantId: string, handle: ParticipantHandle): void {
    this.participantHandles.set(participantId, handle)
  }

  syncParticipant(facts: ParticipantFacts): void {
    this.setParticipantFacts(facts)
  }

  detachParticipant(participantId: string): void {
    this.participantHandles.delete(participantId)
    this.removeParticipantFacts(participantId)
  }

  handleConnectionState(sdkState: string): void {
    const connection = connectionStateFromSdk(sdkState)
    if (!connection) return
    this.patchState({ connection })
  }

  handleMeetingLeft(reason: LeaveReason): void {
    // Not overwritten with 'disconnected' if the meeting was already closing for
    // everyone: end() and leave() are different endings and post-call says so.
    const connection = this.getState().connection
    this.patchState({
      leaveReason: reason,
      connection: connection === 'closing' || connection === 'closed' ? 'closed' : 'disconnected',
    })
  }

  handleQualityLimitation(limitation: QualityLimitation): void {
    // Only 'detected' is a state worth showing; 'resolved' is the clearing of it.
    this.patchState({ qualityLimitation: limitation.state === 'detected' ? limitation : null })
  }

  handleError(error: CallError): void {
    this.patchState({ error })
  }

  attachChat(handle: ChatHandle): void {
    this.chat = handle
  }

  attachReactions(handle: ReactionsHandle): void {
    this.reactions = handle
  }

  attachHandRaise(handle: HandRaiseHandle): void {
    this.handRaise = handle
  }

  attachTranscription(handle: TranscriptionHandle): void {
    this.transcription = handle
  }

  attachWhiteboard(handle: WhiteboardHandle): void {
    this.whiteboard = handle
  }

  syncChat(history: readonly ChatMessageFacts[], live: readonly ChatMessageFacts[]): void {
    this.setChatLog(history, live)
  }

  syncHandRaiseLog(log: readonly HandRaiseFacts[]): void {
    this.setHandRaiseLog(log)
  }

  handleReaction(participantId: string, emoji: string, timestamp: number): void {
    if (!isReactionEmoji(emoji)) return
    this.reactionSeq += 1
    this.emitReaction({
      id: `${participantId}-${timestamp}-${this.reactionSeq}`,
      participantId,
      emoji,
      timestamp,
    })
  }

  handleEntryRequested(
    request: { participantId: string; name: string },
    handle: EntryRequestHandle,
  ): void {
    this.entryHandles.set(request.participantId, handle)
    this.setPendingEntry({
      participantId: request.participantId,
      name: request.name,
      requestedAt: Date.now(),
    })
  }

  handleEntryResponded(decision: 'allowed' | 'denied'): void {
    this.patchState({ entryDecision: decision })
  }

  handleMicRequested(participantId: string | null, handle: MediaRequestHandle): void {
    this.micRequestHandle = handle
    this.patchState({ micRequest: { participantId } })
  }

  handleWebcamRequested(participantId: string | null, handle: MediaRequestHandle): void {
    this.webcamRequestHandle = handle
    this.patchState({ webcamRequest: { participantId } })
  }

  handleRecordingState(status: string): void {
    const recordingState = recordingStateFromSdk(status)
    if (!recordingState) return
    this.patchState({ recordingState, isRecording: recordingState === 'recording' })
  }

  handleTranscriptionState(status: string): void {
    const transcription = transcriptionStateFromSdk(status)
    if (!transcription) return
    this.patchState({ transcription })
  }

  syncWhiteboardUrl(url: string | null): void {
    this.patchState({ whiteboardUrl: url })
  }

  handleCaptionText(data: {
    participantId: string
    participantName: string
    text: string
    timestamp: number
  }): void {
    this.captionSeq += 1
    this.emitCaption({
      id: `${data.participantId}-${data.timestamp}-${this.captionSeq}`,
      participantId: data.participantId,
      participantName: data.participantName,
      text: data.text,
      timestamp: data.timestamp,
    })
  }

  // --- CallClient commands. All delegate to the last attached handle. ---

  /** Call this from above CallProvider, never within it. See VideoSdkCallHost. */
  join(): void {
    this.patchState({ connection: 'connecting', error: null, leaveReason: null })
    this.meeting?.join()
  }

  leave(): void {
    this.meeting?.leave()
  }

  end(): void {
    this.meeting?.end()
  }

  toggleMic(): void {
    this.meeting?.toggleMic()
  }

  setMicEnabled(enabled: boolean): void {
    if (enabled) this.meeting?.unmuteMic()
    else this.meeting?.muteMic()
  }

  toggleWebcam(): void {
    this.meeting?.toggleWebcam()
  }

  setWebcamEnabled(enabled: boolean): void {
    if (enabled) this.meeting?.enableWebcam()
    else this.meeting?.disableWebcam()
  }

  toggleScreenShare(): void {
    this.meeting?.toggleScreenShare()
  }

  setScreenShareEnabled(enabled: boolean): void {
    if (enabled) this.meeting?.enableScreenShare()
    else this.meeting?.disableScreenShare()
  }

  async getCameras(): Promise<Device[]> {
    return (await this.meeting?.getWebcams()) ?? []
  }

  async getMicrophones(): Promise<Device[]> {
    return (await this.meeting?.getMics()) ?? []
  }

  changeCamera(deviceId: string): void {
    this.meeting?.changeWebcam(deviceId)
  }

  changeMicrophone(deviceId: string): void {
    this.meeting?.changeMic(deviceId)
  }

  /**
   * Our own state, never the SDK's pin(). The SDK's pin broadcasts
   * (pinnedParticipants is meeting-wide, onPinStateChanged carries pinnedBy), so
   * using it would let one person rearrange everyone's screen. Meet's pin does
   * not. See CLAUDE.md.
   */
  setPinnedParticipant(participantId: string | null): void {
    this.patchState({ pinnedParticipantId: participantId })
  }

  setParticipantQuality(participantId: string, quality: VideoQuality): void {
    this.participantHandles.get(participantId)?.setQuality(quality)
  }

  setStreamPaused(participantId: string, kind: StreamKind, paused: boolean): void {
    this.participantHandles.get(participantId)?.setStreamPaused(kind, paused)
  }

  removeParticipant(participantId: string): void {
    this.participantHandles.get(participantId)?.remove()
  }

  sendChatMessage(text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    this.chat?.publish(trimmed)
  }

  markChatRead(): void {
    this.markChatReadAt(this.getChatMessages().length)
  }

  sendReaction(emoji: ReactionEmoji): void {
    this.reactions?.publish(emoji)
  }

  setHandRaised(raised: boolean): void {
    const localId = this.getState().localParticipantId
    if (!localId) return
    this.publishHandRaise(raised ? 'raise' : 'lower', localId)
  }

  lowerParticipantHand(participantId: string): void {
    this.publishHandRaise('lower', participantId)
  }

  admitParticipant(participantId: string): void {
    const handle = this.entryHandles.get(participantId)
    if (!handle) return
    this.entryHandles.delete(participantId)
    try {
      handle.allow()
    } catch {
      // The guest gave up and left before the host clicked. Nothing to do and
      // nothing to say: the card clears when they arrive, and they never will.
    }
  }

  denyParticipant(participantId: string): void {
    const handle = this.entryHandles.get(participantId)
    this.entryHandles.delete(participantId)
    this.removePendingEntry(participantId)
    try {
      handle?.deny()
    } catch {
      // As admitParticipant.
    }
  }

  muteParticipant(participantId: string): void {
    this.participantHandles.get(participantId)?.disableMic()
  }

  disableParticipantWebcam(participantId: string): void {
    this.participantHandles.get(participantId)?.disableWebcam()
  }

  requestParticipantMic(participantId: string): void {
    this.participantHandles.get(participantId)?.requestMic()
  }

  requestParticipantWebcam(participantId: string): void {
    this.participantHandles.get(participantId)?.requestWebcam()
  }

  acceptMicRequest(): void {
    const handle = this.micRequestHandle
    this.micRequestHandle = null
    this.patchState({ micRequest: null })
    handle?.accept()
  }

  rejectMicRequest(): void {
    const handle = this.micRequestHandle
    this.micRequestHandle = null
    this.patchState({ micRequest: null })
    handle?.reject()
  }

  acceptWebcamRequest(): void {
    const handle = this.webcamRequestHandle
    this.webcamRequestHandle = null
    this.patchState({ webcamRequest: null })
    handle?.accept()
  }

  rejectWebcamRequest(): void {
    const handle = this.webcamRequestHandle
    this.webcamRequestHandle = null
    this.patchState({ webcamRequest: null })
    handle?.reject()
  }

  startRecording(): void {
    this.meeting?.startRecording(this.config.recordingWebhookUrl)
  }

  stopRecording(): void {
    this.meeting?.stopRecording()
  }

  startWhiteboard(): void {
    this.whiteboard?.start()
  }

  stopWhiteboard(): void {
    this.whiteboard?.stop()
  }

  startCaptions(): void {
    if (this.getState().transcription !== 'idle') return
    this.transcription?.start()
  }

  private publishHandRaise(verb: HandRaiseVerb, participantId: string): void {
    this.handRaise?.publish(verb, participantId)
  }
}

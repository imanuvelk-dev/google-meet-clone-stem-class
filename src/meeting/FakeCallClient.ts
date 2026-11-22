import type { ReactNode } from 'react'
import type {
  CallClient,
  CallError,
  ConnectionState,
  LeaveReason,
  QualityLimitation,
  RecordingState,
  StreamKind,
  TranscriptionState,
  VideoQuality,
} from './CallClient.ts'
import { CallStore, type ChatMessageFacts, type HandRaiseFacts } from './CallStore.ts'
import { createSilentStream } from './fakeMedia.ts'
import type { Device } from './MeetingClient.ts'
import type { ReactionEmoji } from './pubsubTopics.ts'

/**
 * Deterministic CallClient for tests and for driving the in-call UI with no
 * network, no camera, and no VideoSDK minutes.
 *
 * Same shape as FakeMediaClient: a constructor scenario for the starting world,
 * simulate* hooks for events a test cannot otherwise cause, and public fields
 * for the commands whose only observable effect is a call into the SDK.
 *
 * The whole point is that the states worth testing are the ones you cannot
 * stage: you cannot make a real meeting reconnect on cue, and you cannot get 20
 * people to join a CI run.
 */

const DEFAULT_CAMERAS: Device[] = [
  { deviceId: 'cam-1', label: 'FaceTime HD Camera', kind: 'camera' },
  { deviceId: 'cam-2', label: 'HD Pro Webcam C920', kind: 'camera' },
]

const DEFAULT_MICROPHONES: Device[] = [
  { deviceId: 'mic-1', label: 'MacBook Pro Microphone', kind: 'microphone' },
  { deviceId: 'mic-2', label: 'Yeti Stereo Microphone', kind: 'microphone' },
]

export interface FakeParticipant {
  id: string
  displayName: string
  isLocal?: boolean
  micOn?: boolean
  webcamOn?: boolean
  screenShareOn?: boolean
}

export interface FakeCallScenario {
  meetingId?: string
  /** Exactly one should be isLocal. Defaults to a single local participant. */
  participants?: FakeParticipant[]
  /**
   * When false, join() stops at 'connecting' and the test drives the rest with
   * simulateConnectionState. That is the only way to see the connecting UI at
   * all, since a fake that connects instantly never shows it.
   */
  autoConnect?: boolean
  joinFails?: boolean
  cameras?: Device[]
  microphones?: Device[]
  isHost?: boolean
  chatHistory?: { senderId: string; senderName: string; text: string; timestamp: number }[]
  raisedHands?: string[]
  pendingEntries?: { participantId: string; name: string }[]
  isRecording?: boolean
  whiteboardUrl?: string | null
}

const DEFAULT_PARTICIPANTS: FakeParticipant[] = [
  { id: 'local-1', displayName: 'You', isLocal: true, micOn: true, webcamOn: true },
]

/** Streams have to outlive a render or CallStore correctly sees a new identity. */
interface FakeTracks {
  webcam: MediaStreamTrack | null
  mic: MediaStreamTrack | null
  screenShare: MediaStreamTrack | null
}

export class FakeCallClient extends CallStore implements CallClient {
  /** Nothing to mount: the fake has no SDK to host. This is the seam working. */
  readonly Host = ({ children }: { children: ReactNode }) => children

  /** Exposed so tests can assert quality actually steps down as tiles multiply. */
  readonly qualityByParticipantId = new Map<string, VideoQuality>()
  /** `${participantId}:${kind}` for every paused stream. */
  readonly pausedStreams = new Set<string>()
  readonly removedParticipantIds: string[] = []
  lastCameraDeviceId: string | undefined
  lastMicrophoneDeviceId: string | undefined
  leaveCount = 0
  endCount = 0

  readonly publishedChat: string[] = []
  readonly publishedReactions: ReactionEmoji[] = []
  readonly publishedHandRaises: { participantId: string; raised: boolean }[] = []
  readonly admittedParticipantIds: string[] = []
  readonly deniedParticipantIds: string[] = []
  readonly mutedParticipantIds: string[] = []
  readonly webcamDisabledParticipantIds: string[] = []
  readonly micRequestedParticipantIds: string[] = []
  readonly webcamRequestedParticipantIds: string[] = []
  recordingStartCount = 0
  recordingStopCount = 0
  whiteboardStartCount = 0
  whiteboardStopCount = 0
  startCaptionsCount = 0

  private readonly scenario: Required<Pick<FakeCallScenario, 'autoConnect' | 'joinFails'>> &
    FakeCallScenario
  private readonly known = new Map<string, FakeParticipant>()
  private readonly tracks = new Map<string, FakeTracks>()

  private readonly chatHistoryFacts: ChatMessageFacts[] = []
  private readonly chatLiveFacts: ChatMessageFacts[] = []
  private readonly handLog: HandRaiseFacts[] = []
  private reactionSeq = 0
  private captionSeq = 0
  private clock = 1_700_000_000_000

  constructor(scenario: FakeCallScenario = {}) {
    super()
    this.scenario = {
      ...scenario,
      autoConnect: scenario.autoConnect ?? true,
      joinFails: scenario.joinFails ?? false,
    }

    // At construction, not on connect, because that is when the real client
    // knows: VideoSdkCallClient patches isHost in its own constructor from the
    // role /api/token returned before anyone joined. Deferring it here to
    // publishAll would leave isHost false while connecting, and anything
    // deriving a state from "not host yet" would fire for a host too.
    this.patchState({ isHost: this.scenario.isHost ?? true })

    for (const participant of scenario.participants ?? DEFAULT_PARTICIPANTS) {
      this.known.set(participant.id, participant)
    }

    for (const message of scenario.chatHistory ?? []) {
      this.chatHistoryFacts.push({
        senderId: message.senderId,
        senderName: message.senderName,
        message: message.text,
        timestamp: message.timestamp,
      })
    }
    for (const participantId of scenario.raisedHands ?? []) {
      this.handLog.push({ participantId, raised: true })
    }
  }

  // --- Test hooks. Events a real meeting will not produce to order. ---

  simulateConnectionState(connection: ConnectionState): void {
    this.patchState({ connection })
    if (connection === 'connected') this.publishAll()
  }

  simulateParticipantJoined(participant: FakeParticipant): void {
    this.known.set(participant.id, participant)
    this.publish(participant)
  }

  simulateParticipantLeft(participantId: string): void {
    this.known.delete(participantId)
    this.tracks.delete(participantId)
    this.removeParticipantFacts(participantId)
  }

  simulateMedia(
    participantId: string,
    media: Partial<Pick<FakeParticipant, 'micOn' | 'webcamOn' | 'screenShareOn'>>,
  ): void {
    const participant = this.known.get(participantId)
    if (!participant) throw new Error(`No such participant "${participantId}"`)

    const next = { ...participant, ...media }
    this.known.set(participantId, next)
    this.publish(next)

    // Screen share and presenterId are one fact in the product, so the fake must
    // not let them drift apart the way two independent setters would.
    if (media.screenShareOn === true) this.patchState({ presenterId: participantId })
    else if (media.screenShareOn === false && this.getState().presenterId === participantId) {
      this.patchState({ presenterId: null })
    }
  }

  simulateActiveSpeaker(participantId: string | null): void {
    this.patchState({ activeSpeakerId: participantId })
  }

  simulateQualityLimitation(limitation: QualityLimitation | null): void {
    this.patchState({
      qualityLimitation: limitation?.state === 'detected' ? limitation : null,
    })
  }

  simulateError(error: CallError): void {
    this.patchState({ error })
  }

  /** The meeting ended for everyone, as when someone calls end(). */
  simulateMeetingClosed(reason: LeaveReason): void {
    this.patchState({ connection: 'closed', leaveReason: reason })
  }

  simulateChatMessage(message: { senderId: string; senderName: string; text: string }): void {
    this.chatLiveFacts.push({
      senderId: message.senderId,
      senderName: message.senderName,
      message: message.text,
      timestamp: this.tick(),
    })
    this.flushChat()
  }

  simulateChatHistory(
    messages: readonly { senderId: string; senderName: string; text: string; timestamp: number }[],
  ): void {
    this.chatHistoryFacts.length = 0
    for (const message of messages) {
      this.chatHistoryFacts.push({
        senderId: message.senderId,
        senderName: message.senderName,
        message: message.text,
        timestamp: message.timestamp,
      })
    }
    this.flushChat()
  }

  simulateReaction(participantId: string, emoji: ReactionEmoji): void {
    this.reactionSeq += 1
    this.emitReaction({
      id: `fake-reaction-${this.reactionSeq}`,
      participantId,
      emoji,
      timestamp: this.tick(),
    })
  }

  simulateHandRaise(participantId: string, raised: boolean): void {
    this.handLog.push({ participantId, raised })
    this.setHandRaiseLog(this.handLog)
  }

  simulateEntryRequested(request: { participantId: string; name: string }): void {
    this.setPendingEntry({
      participantId: request.participantId,
      name: request.name,
      requestedAt: this.tick(),
    })
  }

  simulateEntryResponded(decision: 'allowed' | 'denied'): void {
    this.patchState({ entryDecision: decision })
  }

  simulateMicRequested(byParticipantId: string | null): void {
    this.patchState({ micRequest: { participantId: byParticipantId } })
  }

  simulateWebcamRequested(byParticipantId: string | null): void {
    this.patchState({ webcamRequest: { participantId: byParticipantId } })
  }

  simulateRecordingState(state: RecordingState): void {
    this.patchState({ recordingState: state, isRecording: state === 'recording' })
  }

  simulateWhiteboard(url: string | null): void {
    this.patchState({ whiteboardUrl: url })
  }

  simulateCaption(participantId: string, text: string): void {
    this.captionSeq += 1
    const timestamp = this.tick()
    this.emitCaption({
      id: `fake-caption-${this.captionSeq}`,
      participantId,
      participantName: this.known.get(participantId)?.displayName ?? participantId,
      text,
      timestamp,
    })
  }

  simulateTranscriptionState(state: TranscriptionState): void {
    this.patchState({ transcription: state })
  }

  // --- CallClient ---

  join(): void {
    if (this.scenario.joinFails) {
      this.patchState({ connection: 'failed' })
      return
    }

    this.patchState({
      connection: 'connecting',
      error: null,
      leaveReason: null,
      meetingId: this.scenario.meetingId ?? 'abc-defg-hij',
    })

    if (this.scenario.autoConnect) this.simulateConnectionState('connected')
  }

  leave(): void {
    this.leaveCount += 1
    this.patchState({
      connection: 'disconnected',
      leaveReason: { code: 'left', message: 'You left' },
    })
  }

  end(): void {
    this.endCount += 1
    this.patchState({
      connection: 'closed',
      leaveReason: { code: 'ended', message: 'The meeting was ended' },
    })
  }

  toggleMic(): void {
    this.setMicEnabled(!this.getState().localMicOn)
  }

  setMicEnabled(enabled: boolean): void {
    this.patchState({ localMicOn: enabled })
    this.setLocalMedia({ micOn: enabled })
  }

  toggleWebcam(): void {
    this.setWebcamEnabled(!this.getState().localWebcamOn)
  }

  setWebcamEnabled(enabled: boolean): void {
    this.patchState({ localWebcamOn: enabled })
    this.setLocalMedia({ webcamOn: enabled })
  }

  toggleScreenShare(): void {
    this.setScreenShareEnabled(!this.getState().localScreenShareOn)
  }

  setScreenShareEnabled(enabled: boolean): void {
    this.patchState({ localScreenShareOn: enabled })
    this.setLocalMedia({ screenShareOn: enabled })
  }

  getCameras(): Promise<Device[]> {
    return Promise.resolve(this.scenario.cameras ?? [...DEFAULT_CAMERAS])
  }

  getMicrophones(): Promise<Device[]> {
    return Promise.resolve(this.scenario.microphones ?? [...DEFAULT_MICROPHONES])
  }

  changeCamera(deviceId: string): void {
    this.lastCameraDeviceId = deviceId
    this.patchState({ selectedCameraId: deviceId })
  }

  changeMicrophone(deviceId: string): void {
    this.lastMicrophoneDeviceId = deviceId
    this.patchState({ selectedMicrophoneId: deviceId })
  }

  setPinnedParticipant(participantId: string | null): void {
    this.patchState({ pinnedParticipantId: participantId })
  }

  setParticipantQuality(participantId: string, quality: VideoQuality): void {
    this.qualityByParticipantId.set(participantId, quality)
  }

  setStreamPaused(participantId: string, kind: StreamKind, paused: boolean): void {
    const key = `${participantId}:${kind}`
    if (paused) this.pausedStreams.add(key)
    else this.pausedStreams.delete(key)
  }

  removeParticipant(participantId: string): void {
    this.removedParticipantIds.push(participantId)
    this.simulateParticipantLeft(participantId)
  }

  sendChatMessage(text: string): void {
    this.publishedChat.push(text)
    const localId = this.localId()
    if (!localId) return
    this.simulateChatMessage({
      senderId: localId,
      senderName: this.known.get(localId)?.displayName ?? 'You',
      text,
    })
  }

  markChatRead(): void {
    this.markChatReadAt(this.getChatMessages().length)
  }

  sendReaction(emoji: ReactionEmoji): void {
    this.publishedReactions.push(emoji)
    const localId = this.localId()
    if (!localId) return
    this.simulateReaction(localId, emoji)
  }

  setHandRaised(raised: boolean): void {
    const localId = this.localId()
    if (!localId) return
    this.publishedHandRaises.push({ participantId: localId, raised })
    this.simulateHandRaise(localId, raised)
  }

  lowerParticipantHand(participantId: string): void {
    this.publishedHandRaises.push({ participantId, raised: false })
    this.simulateHandRaise(participantId, false)
  }

  admitParticipant(participantId: string): void {
    this.admittedParticipantIds.push(participantId)
    const pending = this.getPendingEntry(participantId)
    if (!pending) return
    this.simulateParticipantJoined({ id: participantId, displayName: pending.name })
  }

  denyParticipant(participantId: string): void {
    this.deniedParticipantIds.push(participantId)
    this.removePendingEntry(participantId)
  }

  muteParticipant(participantId: string): void {
    this.mutedParticipantIds.push(participantId)
    if (this.known.has(participantId)) this.simulateMedia(participantId, { micOn: false })
  }

  disableParticipantWebcam(participantId: string): void {
    this.webcamDisabledParticipantIds.push(participantId)
    if (this.known.has(participantId)) this.simulateMedia(participantId, { webcamOn: false })
  }

  requestParticipantMic(participantId: string): void {
    this.micRequestedParticipantIds.push(participantId)
  }

  requestParticipantWebcam(participantId: string): void {
    this.webcamRequestedParticipantIds.push(participantId)
  }

  acceptMicRequest(): void {
    this.patchState({ micRequest: null })
    this.setMicEnabled(true)
  }

  rejectMicRequest(): void {
    this.patchState({ micRequest: null })
  }

  acceptWebcamRequest(): void {
    this.patchState({ webcamRequest: null })
    this.setWebcamEnabled(true)
  }

  rejectWebcamRequest(): void {
    this.patchState({ webcamRequest: null })
  }

  startRecording(): void {
    this.recordingStartCount += 1
    this.simulateRecordingState('recording')
  }

  stopRecording(): void {
    this.recordingStopCount += 1
    this.simulateRecordingState('idle')
  }

  startWhiteboard(): void {
    this.whiteboardStartCount += 1
    this.patchState({ whiteboardUrl: 'https://fake.whiteboard/local' })
  }

  stopWhiteboard(): void {
    this.whiteboardStopCount += 1
    this.patchState({ whiteboardUrl: null })
  }

  startCaptions(): void {
    if (this.getState().transcription !== 'idle') return
    this.startCaptionsCount += 1
    this.simulateTranscriptionState('transcribing')
  }

  // --- Internals ---

  private tick(): number {
    this.clock += 1000
    return this.clock
  }

  private flushChat(): void {
    this.setChatLog(this.chatHistoryFacts, this.chatLiveFacts)
  }

  private setLocalMedia(media: Partial<FakeParticipant>): void {
    const localId = this.localId()
    if (!localId) return
    this.simulateMedia(localId, media)
  }

  private localId(): string | undefined {
    for (const participant of this.known.values()) {
      if (participant.isLocal) return participant.id
    }
    return undefined
  }

  private publishAll(): void {
    const local = this.localId()

    // Screen share and presenterId are one fact in the product. simulateMedia
    // already keeps them together for a share that starts mid-call; without this,
    // a scenario that opens with someone already presenting would hand out a
    // screenShareStream that nothing is looking for, because presenterId - the
    // only thing that says a share is happening - would still be null.
    const presenter = [...this.known.values()].find((participant) => participant.screenShareOn)

    this.patchState({
      presenterId: presenter?.id ?? null,
      localParticipantId: local ?? null,
      isHost: this.scenario.isHost ?? true,
      isRecording: this.scenario.isRecording ?? false,
      recordingState: this.scenario.isRecording === true ? 'recording' : 'idle',
      whiteboardUrl: this.scenario.whiteboardUrl ?? null,
      ...(local
        ? {
            localMicOn: this.known.get(local)?.micOn ?? false,
            localWebcamOn: this.known.get(local)?.webcamOn ?? false,
            localScreenShareOn: this.known.get(local)?.screenShareOn ?? false,
          }
        : {}),
    })
    for (const participant of this.known.values()) this.publish(participant)

    if (this.handLog.length > 0) this.setHandRaiseLog(this.handLog)
    if (this.chatHistoryFacts.length > 0) this.flushChat()
    for (const entry of this.scenario.pendingEntries ?? []) {
      this.simulateEntryRequested(entry)
    }
  }

  private publish(participant: FakeParticipant): void {
    // Tracks are created once and reused. A fresh track per push would defeat
    // CallStore's identity check and re-render forever, which is exactly the
    // failure the real client can hit, so the fake must not paper over it.
    const tracks = this.tracksFor(participant)

    this.setParticipantFacts({
      id: participant.id,
      displayName: participant.displayName,
      isLocal: participant.isLocal ?? false,
      micOn: participant.micOn ?? false,
      webcamOn: participant.webcamOn ?? false,
      screenShareOn: participant.screenShareOn ?? false,
      webcamTrack: participant.webcamOn ? tracks.webcam : null,
      micTrack: participant.micOn ? tracks.mic : null,
      screenShareTrack: participant.screenShareOn ? tracks.screenShare : null,
    })
  }

  private tracksFor(participant: FakeParticipant): FakeTracks {
    const existing = this.tracks.get(participant.id)
    if (existing) {
      // Lazily filled, so a participant who turns their camera on later still
      // gets a track without holding one open from the start.
      if (participant.webcamOn && !existing.webcam) existing.webcam = firstTrack('video')
      if (participant.micOn && !existing.mic) existing.mic = firstTrack('audio')
      if (participant.screenShareOn && !existing.screenShare) {
        existing.screenShare = firstTrack('video')
      }
      return existing
    }

    const tracks: FakeTracks = {
      webcam: participant.webcamOn ? firstTrack('video') : null,
      mic: participant.micOn ? firstTrack('audio') : null,
      screenShare: participant.screenShareOn ? firstTrack('video') : null,
    }
    this.tracks.set(participant.id, tracks)
    return tracks
  }
}

function firstTrack(kind: 'video' | 'audio'): MediaStreamTrack | null {
  return createSilentStream(kind).getTracks()[0] ?? null
}

import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  usePubSub,
  useTranscription,
  useWhiteboard,
} from '@videosdk.live/react-sdk'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { StreamKind, VideoQuality } from './CallClient.ts'
import type { ChatMessageFacts, HandRaiseFacts } from './CallStore.ts'
import { isHandRaiseVerb, PERSIST, TOPICS, type ReactionEmoji } from './pubsubTopics.ts'
import type { VideoSdkCallClient, VideoSdkCallConfig } from './VideoSdkCallClient.ts'

interface RawPubSubMessage {
  senderId: string
  senderName?: string
  message: string
  timestamp?: number | string
  payload?: unknown
}

function toTimestamp(value: number | string | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

function toChatFacts(messages: readonly RawPubSubMessage[]): ChatMessageFacts[] {
  return messages.map((message) => ({
    senderId: message.senderId,
    senderName: message.senderName ?? '',
    message: message.message,
    timestamp: toTimestamp(message.timestamp),
  }))
}

function entryDecisionFrom(args: readonly unknown[]): 'allowed' | 'denied' | null {
  for (const arg of args) {
    const decision =
      typeof arg === 'string'
        ? arg
        : typeof arg === 'object' && arg !== null && 'decision' in arg
          ? (arg as { decision?: unknown }).decision
          : undefined
    if (decision === 'allowed' || decision === 'denied') return decision
  }
  return null
}

function toHandRaiseFacts(messages: readonly RawPubSubMessage[]): HandRaiseFacts[] {
  const facts: HandRaiseFacts[] = []
  for (const message of messages) {
    if (!isHandRaiseVerb(message.message)) continue
    const payload = message.payload
    const subject =
      typeof payload === 'object' && payload !== null && 'participantId' in payload
        ? (payload as { participantId?: unknown }).participantId
        : undefined
    facts.push({
      participantId: typeof subject === 'string' ? subject : message.senderId,
      raised: message.message === 'raise',
    })
  }
  return facts
}

/**
 * The only file in the project that touches VideoSDK's in-call API.
 *
 * VideoSDK exposes the call exclusively through hooks, so there is no object to
 * wrap: the only way to read a participant's streams is to call useParticipant
 * from inside a component. So the seam inverts. Instead of our client calling
 * the SDK, invisible components call the SDK and push into our client, and every
 * feature component reads our store instead. That is what these bridges are.
 *
 * Rendering one invisible bridge per participant is the intended shape, not a
 * workaround, and it is what has to hold at Meet's 49 tiles.
 *
 * The bridges push on every render and never diff. CallStore diffs. Keep it that
 * way: one place that decides what changed is testable, N places are not.
 */

export function VideoSdkCallHost({
  client,
  config,
  children,
}: {
  client: VideoSdkCallClient
  config: VideoSdkCallConfig
  children: ReactNode
}) {
  const meetingConfig = useMemo(
    () => ({
      meetingId: config.meetingId,
      name: config.name,
      micEnabled: config.micEnabled,
      webcamEnabled: config.webcamEnabled,
      debugMode: false,
      // Recommended off for one-to-one, and we do our own quality stepping via
      // setQuality rather than leaning on simulcast layers.
      multiStream: false,
      ...(config.participantId === undefined ? {} : { participantId: config.participantId }),
      ...(config.customCameraVideoTrack === undefined
        ? {}
        : { customCameraVideoTrack: config.customCameraVideoTrack }),
      ...(config.customMicrophoneAudioTrack === undefined
        ? {}
        : { customMicrophoneAudioTrack: config.customMicrophoneAudioTrack }),
    }),
    [config],
  )

  return (
    /*
     * joinWithoutUserInteraction stays off, and the reason is subtle enough to
     * be worth writing down.
     *
     * MeetingProvider configures the token in ITS mount effect, so nothing
     * inside this tree can join before then: React runs child effects first,
     * and the SDK would send `authorization: undefined` and 400. Letting the
     * SDK join itself fixes that ordering but breaks a different way - its
     * join() calls initMeeting() with no idempotency guard, and StrictMode
     * double-invokes mount effects, so every dev mount joins the same room
     * twice and one of them gets dropped.
     *
     * So Room joins instead. It sits above this provider, and a parent's effect
     * runs after every child's, which is exactly the ordering this needs.
     */
    <MeetingProvider config={meetingConfig} token={config.token} joinWithoutUserInteraction={false}>
      <MeetingBridge client={client} />
      <ChatBridge client={client} />
      <ReactionsBridge client={client} />
      <HandRaiseBridge client={client} />
      <TranscriptionBridge client={client} />
      <WhiteboardBridge client={client} />
      {children}
    </MeetingProvider>
  )
}

function MeetingBridge({ client }: { client: VideoSdkCallClient }) {
  const onMeetingStateChanged = useCallback(
    // `state` is typed as the SDK's incomplete union here, but it widens to
    // string on the way in, which is exactly why handleConnectionState takes a
    // string: RECONNECTING is emitted at runtime and absent from that union.
    ({ state }: { state: string }) => client.handleConnectionState(state),
    [client],
  )
  const onMeetingLeft = useCallback(
    (reason: { code: number; message: string }) =>
      client.handleMeetingLeft({ code: String(reason.code), message: reason.message }),
    [client],
  )
  const onQualityLimitation = useCallback(
    (limitation: { type: 'congestion' | 'bandwidth' | 'cpu'; state: 'detected' | 'resolved' }) =>
      client.handleQualityLimitation(limitation),
    [client],
  )
  const onError = useCallback(
    (error: { code: string; message: string }) =>
      client.handleError({ code: String(error.code), message: error.message }),
    [client],
  )
  const onEntryRequested = useCallback(
    (request: { participantId: string; name: string; allow: () => void; deny: () => void }) =>
      client.handleEntryRequested(
        { participantId: request.participantId, name: request.name },
        { allow: request.allow, deny: request.deny },
      ),
    [client],
  )
  const onEntryResponded = useCallback(
    (...args: unknown[]) => {
      const decision = entryDecisionFrom(args)
      if (decision) client.handleEntryResponded(decision)
    },
    [client],
  )
  const onMicRequested = useCallback(
    (data: { participantId?: string; accept: () => void; reject: () => void }) =>
      client.handleMicRequested(data.participantId ?? null, {
        accept: data.accept,
        reject: data.reject,
      }),
    [client],
  )
  const onWebcamRequested = useCallback(
    (data: { participantId?: string; accept: () => void; reject: () => void }) =>
      client.handleWebcamRequested(data.participantId ?? null, {
        accept: data.accept,
        reject: data.reject,
      }),
    [client],
  )
  const onRecordingStateChanged = useCallback(
    ({ status }: { status: string }) => client.handleRecordingState(status),
    [client],
  )

  const meeting = useMeeting({
    onMeetingStateChanged,
    onMeetingLeft,
    onQualityLimitation,
    onError,
    onEntryRequested,
    onEntryResponded,
    onMicRequested,
    onWebcamRequested,
    onRecordingStateChanged,
  })

  // No dependency array on purpose. useMeeting re-renders this component on every
  // change it knows about, and each render's closures are the only live handles
  // to it, so the push has to happen every time. CallStore turns the redundant
  // ones into no-ops.
  useEffect(() => {
    client.attachMeeting({
      join: () => meeting.join(),
      leave: () => meeting.leave(),
      end: () => meeting.end(),
      toggleMic: () => meeting.toggleMic(),
      muteMic: () => meeting.muteMic(),
      unmuteMic: () => meeting.unmuteMic(),
      toggleWebcam: () => meeting.toggleWebcam(),
      enableWebcam: () => meeting.enableWebcam(),
      disableWebcam: () => meeting.disableWebcam(),
      toggleScreenShare: () => meeting.toggleScreenShare(),
      enableScreenShare: () => meeting.enableScreenShare(),
      disableScreenShare: () => meeting.disableScreenShare(),
      /*
       * `?? []` is load-bearing. The SDK's getMics/getWebcams are
       * Promise.resolve(meeting?.getMics()), so before its meeting exists they
       * resolve undefined rather than an empty list, and mapping that throws.
       */
      getMics: async () =>
        ((await meeting.getMics()) ?? []).map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
          kind: 'microphone' as const,
        })),
      getWebcams: async () =>
        ((await meeting.getWebcams()) ?? []).map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
          kind: 'camera' as const,
        })),
      changeMic: (deviceId: string) => meeting.changeMic(deviceId),
      changeWebcam: (deviceId: string) => meeting.changeWebcam(deviceId),
      startRecording: (webhookUrl: string | undefined) => meeting.startRecording(webhookUrl),
      stopRecording: () => meeting.stopRecording(),
    })
  })

  useEffect(() => {
    client.syncMeetingState({
      meetingId: meeting.meetingId ?? null,
      localParticipantId: meeting.localParticipant?.id ?? null,
      activeSpeakerId: meeting.activeSpeakerId ?? null,
      presenterId: meeting.presenterId ?? null,
      localMicOn: meeting.localMicOn,
      localWebcamOn: meeting.localWebcamOn,
      localScreenShareOn: meeting.localScreenShareOn,
      selectedCameraId: meeting.selectedCameraDevice?.deviceId ?? null,
      selectedMicrophoneId: meeting.selectedMicrophoneDevice?.deviceId ?? null,
    })
  })

  // This SDK's participants map includes the local participant (its runtime does
  // `participants.set(localParticipant.id, localParticipant)` on join), so there
  // is no separate local bridge. Unioned anyway: a roster missing you is a worse
  // failure than a redundant Set entry.
  const participantIds = useMemo(() => {
    const ids = new Set(meeting.participants.keys())
    if (meeting.localParticipant?.id) ids.add(meeting.localParticipant.id)
    return [...ids]
  }, [meeting.participants, meeting.localParticipant])

  return (
    <>
      {participantIds.map((participantId) => (
        <ParticipantBridge key={participantId} participantId={participantId} client={client} />
      ))}
    </>
  )
}

function ChatBridge({ client }: { client: VideoSdkCallClient }) {
  const onOldMessagesReceived = useCallback(
    (old: RawPubSubMessage[]) => client.syncChat(toChatFacts(old), []),
    [client],
  )

  const { publish, messages } = usePubSub(TOPICS.chat, { onOldMessagesReceived })

  useEffect(() => {
    client.attachChat({
      publish: (text: string) => void publish(text, { persist: PERSIST[TOPICS.chat] }),
    })
  })

  useEffect(() => {
    client.syncChat([], toChatFacts(messages))
  })

  return null
}

function ReactionsBridge({ client }: { client: VideoSdkCallClient }) {
  const onMessageReceived = useCallback(
    (message: RawPubSubMessage) =>
      client.handleReaction(message.senderId, message.message, toTimestamp(message.timestamp)),
    [client],
  )

  const { publish } = usePubSub(TOPICS.reactions, { onMessageReceived })

  useEffect(() => {
    client.attachReactions({
      publish: (emoji: ReactionEmoji) =>
        void publish(emoji, { persist: PERSIST[TOPICS.reactions] }),
    })
  })

  return null
}

function HandRaiseBridge({ client }: { client: VideoSdkCallClient }) {
  const onOldMessagesReceived = useCallback(
    (old: RawPubSubMessage[]) => client.syncHandRaiseLog(toHandRaiseFacts(old)),
    [client],
  )

  const { publish, messages } = usePubSub(TOPICS.handRaise, { onOldMessagesReceived })

  useEffect(() => {
    client.attachHandRaise({
      publish: (verb, participantId) =>
        void publish(verb, { persist: PERSIST[TOPICS.handRaise] }, { participantId }),
    })
  })

  useEffect(() => {
    client.syncHandRaiseLog(toHandRaiseFacts(messages))
  })

  return null
}

function TranscriptionBridge({ client }: { client: VideoSdkCallClient }) {
  const onTranscriptionText = useCallback(
    (data: { participantId: string; participantName: string; text: string; timestamp: number }) =>
      client.handleCaptionText(data),
    [client],
  )
  const onTranscriptionStateChanged = useCallback(
    ({ status }: { status: string }) => client.handleTranscriptionState(status),
    [client],
  )

  const { startTranscription } = useTranscription({
    onTranscriptionText,
    onTranscriptionStateChanged,
  })

  useEffect(() => {
    client.attachTranscription({ start: () => void startTranscription({}) })
  })

  return null
}

function WhiteboardBridge({ client }: { client: VideoSdkCallClient }) {
  const { startWhiteboard, stopWhiteboard, whiteboardUrl } = useWhiteboard()

  useEffect(() => {
    client.attachWhiteboard({
      start: () => void startWhiteboard(),
      stop: () => void stopWhiteboard(),
    })
  })

  useEffect(() => {
    client.syncWhiteboardUrl(whiteboardUrl ?? null)
  }, [whiteboardUrl, client])

  return null
}

function ParticipantBridge({
  participantId,
  client,
}: {
  participantId: string
  client: VideoSdkCallClient
}) {
  const participant = useParticipant(participantId)

  useEffect(() => {
    client.attachParticipant(participantId, {
      setQuality: (quality: VideoQuality) => participant.setQuality(quality),
      remove: () => participant.remove(),
      disableMic: () => participant.disableMic(),
      disableWebcam: () => participant.disableWebcam(),
      requestMic: () => participant.enableMic(),
      requestWebcam: () => participant.enableWebcam(),
      setStreamPaused: (kind: StreamKind, paused: boolean) => {
        // pause/resume live on the Stream itself, so no useStream bridge is
        // needed. useStream would only add a third component per participant to
        // reach the same objects.
        const stream =
          kind === 'webcam'
            ? participant.webcamStream
            : kind === 'mic'
              ? participant.micStream
              : participant.screenShareStream
        if (!stream) return
        if (paused) stream.pause()
        else stream.resume()
      },
    })
  })

  useEffect(() => {
    client.syncParticipant({
      id: participantId,
      displayName: participant.displayName ?? '',
      isLocal: participant.isLocal,
      micOn: participant.micOn,
      webcamOn: participant.webcamOn,
      screenShareOn: participant.screenShareOn,
      // The SDK types these streams as always present; at runtime they are
      // undefined whenever the track is off.
      webcamTrack: participant.webcamStream?.track ?? null,
      micTrack: participant.micStream?.track ?? null,
      screenShareTrack: participant.screenShareStream?.track ?? null,
    })
  })

  useEffect(() => () => client.detachParticipant(participantId), [client, participantId])

  return null
}

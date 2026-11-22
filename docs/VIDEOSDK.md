# VideoSDK Facts

Verified against the official docs and SDK reference.
**Build on these; do not guess at names.**

Several are counterintuitive and have already caused errors in planning.
Decisions built on these live in [DECISIONS.md](./DECISIONS.md).

## Token permissions - read carefully

This is the opposite of what most people assume:

- **`allow_join`** - enters the meeting directly. **This is the HOST.**
- **`ask_join`** - must request permission and be admitted. **This is the GUEST.**
- **`allow_mod`** - may control other participants' mic/camera. Required for mute-all and remove.

So the host token carries `allow_join` + `allow_mod`, and the guest token carries `ask_join`.
Getting this backwards inverts the entire lobby flow.

Token payload: `apikey` (required), `permissions` (required), plus optional `version`, `roomId`, `participantId`, `roles`.
Signed HS256.
**Tokens are validated only at join time.** Expiry does not disconnect an active participant, so short expiry is safe.

## Precall vs in-meeting APIs are different

This trips people up.
Precall runs outside `MeetingProvider`, in-meeting runs inside it.

**Precall** - via `useMediaDevice`:
- `checkPermissions('audio' | 'video')` returns a Map of granted/denied
- `requestPermission()` prompts
- `getCameras()`, `getMicrophones()`, `getPlaybackDevices()`
- `createCameraVideoTrack({ cameraId, encoderConfig, optimizationMode })`
- `createMicrophoneAudioTrack({ microphoneId })`
- `runPreCallTest()` returns uplink/downlink scores 1-5
- `OnDeviceChanged` callback for hotplug

**In-meeting** - via `useMeeting`:
- `getMics()`, `getWebcams()` (note: **different names** from precall)
- `changeMic(deviceId)`, `changeWebcam(deviceId)`

Precall tracks can be handed to `MeetingProvider` via `customCameraVideoTrack` / `customMicrophoneAudioTrack` so the camera does not flicker off and on between precall and the call.

## Permission blocking is a one-way door

Once a user **blocks** camera/mic permission, the browser dialog **cannot be re-triggered programmatically**.
A "Retry" button is a dead end.
Show Meet's recovery-instructions path instead.
This makes precall's error states first-class UI, not an afterthought.

## Audio rendering - the classic bug

Audio is rendered separately from video: build a `MediaStream` from `micStream.track` into an `<audio autoPlay>` per remote participant.

**Mute the local participant's own audio element.**
Rendering your own mic back to yourself causes a feedback loop.
This is the most common bug in this area.

Also handle the rejected `play()` promise - browsers block autoplay without a user gesture.

## Verified API surface

**`useMeeting` properties:** `meetingId`, `meeting`, `localParticipant`, `mainParticipant`, `activeSpeakerId`, `participants: Map`, `presenterId`, `localMicOn`, `localWebcamOn`, `localScreenShareOn`, `selectedCameraDevice`, `selectedMicrophoneDevice`, `isRecording`, `recordingState`.

**`useMeeting` events:** `onMeetingJoined`, `onMeetingLeft(reason)`, `onParticipantJoined`, `onParticipantLeft(participant, reason)`, `onSpeakerChanged(id|null)`, `onPresenterChanged(id|null)`, `onMeetingStateChanged(state)`, `onQualityLimitation({type,state})`, `onEntryRequested`, `onEntryResponded`, `onMicRequested`, `onWebcamRequested`, `onError`, `onRecordingStateChanged`.

- `onMeetingStateChanged` states: `CONNECTING | CONNECTED | RECONNECTING | FAILED | DISCONNECTED`. This is how Meet's "Reconnecting..." banner is driven.
- `onQualityLimitation` types: `congestion | bandwidth | cpu`, states `detected | resolved`. Drives the network indicator. `cpu` is still real (encoding on a loaded machine), but it was expected to matter mainly once background blur landed, and **blur is cut**.

**`useMeeting` methods:** `join`, `leave`, `end`, `muteMic`, `unmuteMic`, `toggleMic`, `enableWebcam`, `disableWebcam`, `toggleWebcam`, `enableScreenShare`, `disableScreenShare`, `toggleScreenShare`, `getMics`, `getWebcams`, `changeMic`, `changeWebcam`, `startRecording(webhookUrl, awsDirPath, config, transcription)`, `stopRecording`, `startLivestream`, `stopLivestream`, `startHls`, `stopHls`.

**`useParticipant(id)` properties:** `displayName`, `participant`, `webcamStream`, `micStream`, `screenShareStream`, `webcamOn`, `micOn`, `screenShareOn`, `isLocal`, `isActiveSpeaker`, `mode`, `metaData`.

**`useParticipant(id)` methods:** `enableMic`, `disableMic`, `enableWebcam`, `disableWebcam`, `pin`, `unpin`, `remove`, `setQuality`, `captureImage`, `getVideoStats`, `getAudioStats`, `getShareStats`.

**Host controls semantics** (requires `allow_mod`):
- `disableMic()` / `disableWebcam()` - immediate, **no consent**.
- `enableMic()` / `enableWebcam()` - only **requests**; fires `onMicRequested` / `onWebcamRequested` on the target with `accept` / `reject`.
- **Hosts can mute but cannot force-unmute.** This mirrors Meet and falls out of the API naturally. Do not work around it.

**PubSub** - `usePubSub(topic, { onMessageReceived, onOldMessagesReceived })` -> `{ publish, messages }`
- `publish(message, { persist, sendOnly }, payload)`
- Message shape: `{ senderId, senderName, message, timestamp, topic, payload }`

**Lobby**
- `onEntryRequested({ participantId, name, allow, deny })` - fires on the **host**
- `onEntryResponded` - `"allowed" | "denied"`, fires on the **guest**.
  **Two positional arguments at runtime: `(participantId, decision)`. The `.d.ts` types one object and is wrong.**
  This file asserted the object shape until 2026-07-16, on the grounds that "the types beat the docs", and **that assertion was itself the bug**: `({ decision }) => ...` destructured `decision` off the participantId string, got `undefined`, and no guest was ever told it had been denied.
  Settled by reading the bundle, which beats both.
  The chain is `videosdk.js`'s `emit(EV_ENTRY_RESPONDED, id, decision)` -> react-sdk's `_handle_entry_responded(id, d)` -> `emit(events['entry-responded'], id, d)` -> `useStableEvent`, which applies `arguments` through untouched.
  `VideoSdkCallHost` therefore normalises both shapes rather than trusting either, the same job `connectionStateFromSdk` does for a wrong union.
  **This is the third time this file's `.d.ts`-over-bundle rule has been wrong** (`onEntryResponded`, `changeWebcam`, `onMeetingStateChanged`'s union). The `.d.ts` is hand-written and drifts. **Read the bundle.**
- **`allow`/`deny` are closures on the event**, not addressable by id afterwards. A host rendering a list of knocks must hold them. See DECISIONS.md's seam rules.
- **Nothing tells a guest it is in the lobby.** `onEntryResponded` *ends* the "Asking to be let in" screen; no event starts it, so the waiting state must be derived.
  **Settled in a live room 2026-07-16:** an `ask_join` holder does reach `CONNECTING` and stays there, so the derivation is sound.
- **Nothing at all reaches a waiting guest if the host never answers, or leaves, or the room empties.** Settled in the bundle and in two live rooms, 2026-07-16.
  There is **no `ROOM_ENDED`, no `MEETING_ENDED`, no host-left notification** anywhere in `videosdk.js` - grep it.
  `requestEntry()` is fire-and-forget: it sends `{ name }` over the socket and awaits no reply, so the ask carries no server-side timer either.
  A waiting guest has **not** called `joinRoom()`, so it never receives `MEETING_JOINED`, `newPeer` or `peerClosed`, and therefore **has no roster and cannot see whether a host exists at all.**
  **Consequence, and it is a design fact rather than a shortcut:** a guest cannot distinguish "no host present" from "host present but ignoring me". One client-side timeout honestly covers both, because to the guest they are the same event - silence. It is the only mechanism available. See DECISIONS.md's lobby-timeout entry.
- **A denied guest is not disconnected.** Verified in the bundle and in a live room.
  On `"allowed"` the room client calls `joinRoom()`; on `"denied"` it only closes a telemetry span.
  No `MEETING_LEFT`, no socket close, no state change of any kind, so the guest sits at `CONNECTING` forever.
  **The denied screen is therefore the only thing that ends that wait**, which is why the arg-shape bug above stranded people rather than merely mislabelling a screen.

**Recording status strings are NOT verified.** `onRecordingStateChanged({ status })` is real, but this file never listed `status`'s values. `recordingStateFromSdk` assumes they mirror transcription's (`RECORDING_STARTING | RECORDING_STARTED | RECORDING_STOPPING | RECORDING_STOPPED`) and returns null for anything else rather than guessing. Confirm in a live room.

**A PubSub message carries no id.** The shape is `{ senderId, senderName, message, timestamp, topic, payload }` and there is nothing stable to key a React list on, so identity has to be synthesised. `timestamp`'s clock domain (sender-local vs server) is also unestablished, so do not sort by it. See DECISIONS.md's seam rules.

## Captions and transcription - `useTranscription`, not `useMeeting`

Not part of `useMeeting`. Built 2026-07-20, after the user re-checked their VideoSDK plan and found realtime transcription available (it was not, on 2026-07-15 - see DECISIONS.md's Captions row and settled questions).

```js
const { startTranscription, stopTranscription } = useTranscription({
  onTranscriptionStateChanged, // ({ id, status }) => void
  onTranscriptionText,         // ({ participantId, participantName, text, timestamp, type }) => void
})
```

- `startTranscription({ webhookUrl?, modelConfig?, summary?, language? })` - every field is optional. We call it with **no arguments at all** (`startTranscription({})`): no webhook (`api/transcription-webhook.ts` does not exist and must not be created - it was only ever plumbing for this), no summary, `language` defaults to `'en'`.
- `onTranscriptionText`'s `type` is documented as always `'realtime'` - there is **no `isFinal`/interim distinction** in the payload. The seam treats each event as the latest text for that speaker and lets the view's rolling window handle display, rather than waiting for a finality signal that does not exist.
- `onTranscriptionStateChanged`'s `status` values are **not enumerated in the type surface**, the same gap `onRecordingStateChanged` has. `transcriptionStateFromSdk` assumes the same naming family as recording's (`TRANSCRIPTION_STARTING | TRANSCRIPTION_STARTED | TRANSCRIPTION_STOPPING | TRANSCRIPTION_STOPPED`) and returns null for anything else rather than guessing. **Unverified. Confirm the real strings in a live room.**
- Meeting-wide, not per-viewer: one `startTranscription()` call transcribes the whole room server-side, and every client gets `onTranscriptionText`. Meet's caption toggle is per-viewer local, so the app reconciles the two - see DECISIONS.md's seam-design section for how.
- There is no `stopTranscription` call anywhere in this app on purpose. See DECISIONS.md: nothing calls it, so the seam does not expose one.

**A bridge can only be proven live.** The fake path (`FakeCallClient.simulateCaption`/`simulateTranscriptionState`) exercises the store and the overlay; it says nothing about whether `TranscriptionBridge` reads the real SDK payloads correctly. Mandatory live-room check, not optional - see DECISIONS.md's "No fake can prove a bridge".

**Blur and noise suppression are CUT.** Neither package is installed and neither is used. See DECISIONS.md.

This file previously said *"Use `VBModel.meet` - there is literally a model named for our target"*, and that was **wrong in a way worth keeping as a warning**: `meet` is the name of Google's MediaPipe **selfie-segmentation model**. The resemblance to Google Meet is a coincidence, and the advice built on it routed straight through `media-processor-web`, the package this same file correctly calls deprecated.

Three further things reading the bundle showed, none of which the docs say:
- The `meet` path's model loader **silently returns on a failed fetch**, so a CDN 404 produces unsegmented video rather than an error.
- `dispose()` **fully frees only the MediaPipe path.** On the `meet` path it just nulls a reference, which undercuts the "frees GPU and WASM" claim the lifecycle rests on.
- Nothing in the plugin enforces **"desktop browsers only"**, and every capability it needs passes on modern mobile. That claim is about performance, not support.

The noise suppressor's published `main` is a **4.8MB webpack development build** with five `eval()` calls and no production build in the tarball.

**The general lesson: read the `.d.ts` and the bundle. The docs and the artifact disagree.** `onEntryResponded`'s signature and `changeWebcam`'s accepted types were both wrong here too.

## Speaker output switching - absent from VideoSDK

**Confirmed absent, and deliberately unfinished.**
`getPlaybackDevices()` only enumerates; nothing in the SDK routes output.
It needs `HTMLMediaElement.setSinkId()` applied to each audio element directly.

**Precall currently ships a speaker picker that changes nothing**: it lists devices and holds the selection in state, and that is where the selection stops.
This is deferred rather than missed.
Precall's preview is muted, so there is no audio to route and nothing to verify against; Phase 2 is the first point where the fix is real and testable.

Two traps for whoever picks it up:
- `setSinkId` is **Chromium-only** in practice and absent in Safari, so **hide the control where it cannot work** rather than shipping a picker that silently lies.
- The selection currently lives in `Precall`'s local state, so it **dies on navigation**. It has to reach the in-call audio elements, the way the host grant already survives via `src/lib/session.ts`.

See Phase 2's inherited items.

## Other essentials

- **HTTPS is required** for media capture.
- **`participantId` must be unique** within a meeting or participants get evicted.
- Call **`leave()` on unmount** of the meeting component.
- `leave()` removes you. `end()` terminates for everyone. `onMeetingLeft` fires for all participants when anyone calls `end()`.
- Room creation is `POST https://api.videosdk.live/v2/rooms` with `Authorization: <token>`, returning `roomId`. It needs the token, so **it belongs server-side**, not in the client.
- `multistream: false` is recommended for one-to-one calls.

## Reference

Docs base: https://docs.videosdk.live/react/guide/video-and-audio-calling-api-sdk/

All 18 user-provided docs have been read and their findings are summarised here.
Re-read a specific doc only when implementing that feature.

# Phase 2 - In-Call Core

**Read [CLAUDE.md](../../CLAUDE.md) first**, and the files it points at: [DECISIONS.md](../DECISIONS.md), [VIDEOSDK.md](../VIDEOSDK.md), [FIGMA.md](../FIGMA.md). None are loaded automatically.

## Status

VideoSDK APIs below are **verified against the official SDK reference**, not assumed.
Design decisions marked **Settled** were made with the user - do not revisit them.

The Figma has now been read (Phase 1 spike). See docs/FIGMA.md.
Where this plan and the Figma disagree, **the Figma wins** - raise the conflict with the user rather than guessing.

## Figma coverage - read this before you start

**The Figma covers exactly one Phase 2 screen: `Meeting` (1728x1117).**

**That frame is dark.** "Light" names the Figma *section*, not the appearance - the in-call screens are dark-only duplicates in both sections, because real Meet's in-call is dark whatever your theme. **Do not build a light in-call.** See [FIGMA.md](../FIGMA.md).

Everything else in this phase has **no design**.
That is not a gap to fill by guessing - it is a known condition of the project, and it follows the precedent already set for the landing page.

| Phase 2 surface | Source | Verified by |
|---|---|---|
| Base in-call grid | **Figma `Meeting`** | `figma:diff` |
| Presenter / screen-share layout | Live Meet | Screenshot review |
| Layout switcher | Live Meet | Screenshot review |
| Pin / spotlight view | Live Meet | Screenshot review |
| Meeting details panel | Live Meet | Screenshot review |
| Reconnecting banner | Live Meet | Screenshot review |
| Network quality indicator | Live Meet | Screenshot review |
| Post-call screen | Live Meet | Screenshot review |
| Mobile in-call | Live Meet **mobile web** | Screenshot review |

**Rules:**
- **Desktop canvas is 1728px.** Visual diffs are meaningless at any other width. Not 1440.
- **No theme is wired, and the call is an always-dark surface** using `--color-call-*` tokens. The light/dark *theme* (over the Home surfaces) stays deferred. Do not conflate the two: the call being dark is not the dark theme. Structure any new tokens semantically so the theme can be retrofitted later.
- **The Figma's mobile frames are the native iOS app** (SF Pro, iOS status bar, home indicator, 393x852). We are a browser app. Use them as **reference for spacing and hierarchy only, never as a spec to match**, and never `figma:diff` against them.
- Live-Meet-sourced screens are **not `figma:diff`-verifiable**. Do not expect them to be, and do not invent a baseline for them until the user has reviewed a screenshot.
- Never let a generated token name (`body-2`, `accent-9`) reach a component. Map to semantic names we own. See docs/FIGMA.md.

## Depends on

Phase 1, which shipped: design tokens (`src/design/tokens.css`, generated and committed), primitives, the SDK seam (`src/meeting/`), `FakeMediaClient` with scenario coverage, the `/api/token` and `/api/rooms` endpoints with the stateless host grant, the Playwright harness with Chrome fake-media flags, and `npm run figma:diff`.

Precall sits at **2.21% off** the Figma with the camera region masked.

## Inherited from Phase 1 - do these early

Two things Phase 1 deliberately did not finish.
Both are cheap now and expensive later, and the first is a **user-visible lie** in the shipped UI.

### A. The speaker picker does not route audio

**Precall renders a working speaker picker that changes nothing.**
It lists devices via `getDevices('speaker')` and holds the selection in state, and that is all.
The selection is dropped on the floor.

This was not an oversight: precall's preview is muted, so there is genuinely **no audio to route** and nothing to verify against.
Phase 2 is the first point where the fix is testable.

What it needs:

- **`HTMLMediaElement.setSinkId(deviceId)`**, applied to **every** remote participant's `<audio>` element. VideoSDK does not do output switching. `getPlaybackDevices()` only enumerates; it does not route. See docs/VIDEOSDK.md.
- **Verify support before shipping the control.** `setSinkId` is Chromium-only in practice; Safari does not implement it. A picker that silently does nothing on Safari is the bug we already have, just moved. If it is unsupported, hide the control rather than lie about it.
- **It may need permission.** `navigator.mediaDevices.selectAudioOutput()` and/or the `speaker-selection` permission policy gate it in some browsers.
- **The selection must outlive precall.** Today it is local `useState` in `Precall`, so it dies on navigation. It needs to reach the in-call audio elements: lift it into the seam (a `useSpeaker` hook or session storage), the same way the host grant already survives via `src/lib/session.ts`.
- Extend `MediaClient` with the routing call so the fake can drive it and the UI stays testable.

**Do this in task 2, where the audio elements are built.** Retrofitting output routing after the audio layer exists means touching every tile again.

### B. There are no committed visual baselines

`figma:diff` is a **local** tool: it needs Figma PNGs and a dev server, so it cannot gate CI.
Playwright's `toHaveScreenshot` is the CI gate, and **no baselines are committed**, so fidelity can currently drift without anything failing.

- **Precall desktop and mobile** have both been screenshot-reviewed with the user, and mobile was reworked and re-shown. They are ready to baseline.
- **The landing page has never been shown to the user.** It is live-Meet-sourced, so it has no Figma frame and no `figma:diff` to fall back on: a screenshot review is the *only* check it will ever get. **Show it and get approval before baselining it.**
- Add a `Meeting` baseline once that screen is reviewed.
- Baselines are machine-sensitive: generate them in one environment (ideally CI's) or they fail on every other machine. Decide this **before** committing the first one.
- **Never baseline a live-Meet-sourced screen before the user approves a screenshot.** See docs/DECISIONS.md. A baseline records whatever was there, correct or not, and then defends it.

Phase 1 left precall at 2.21%, mostly the device row and brand text sitting a few px out.
Close that **before** baselining, or the baseline enshrines the gap.

## Goal

The in-call experience: join, see and hear everyone in Meet's grid, control your media, share your screen, switch layouts, and leave.

## Settled decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Pin** | **Local-only, in our own React state. Do not use the SDK's `pin()`/`unpin()`.** | VideoSDK's pin appears to broadcast (`useMeeting.pinnedParticipants` is meeting-wide and `onPinStateChanged` carries `pinnedBy`). Google Meet's pin is local-only: it changes your view and nobody else's. Using the SDK's pin would let one user rearrange everyone's screen. |
| **Scale** | Build pagination + stream pause/resume + quality stepping from day one. Verify to ~12 participants. | Architecture must hold at Meet's 49-tile view without a rewrite, but 50 browser contexts in CI is not practical. |

## Verified VideoSDK API surface

Confirmed against the SDK reference. Build on these; do not guess at names.

**`useMeeting` properties:** `meetingId`, `meeting`, `localParticipant`, `mainParticipant`, `activeSpeakerId: string`, `participants: Map<participantId, Participant>`, `presenterId: string`, `localMicOn`, `localWebcamOn`, `localScreenShareOn`, `selectedCameraDevice`, `selectedMicrophoneDevice`, `isRecording`, `recordingState`.

**`useMeeting` events:**
- `onMeetingJoined()`
- `onMeetingLeft(reason: { code, message })`
- `onParticipantJoined(participant)`
- `onParticipantLeft(participant, reason: { code, message })`
- `onSpeakerChanged(activeSpeakerId: string | null)`
- `onPresenterChanged(presenterId: string | null)`
- `onMeetingStateChanged(state)` - `CONNECTING | CONNECTED | RECONNECTING | FAILED | DISCONNECTED`
- `onQualityLimitation({ type: "congestion"|"bandwidth"|"cpu", state: "detected"|"resolved" })`
- `onError({ code, message })`

**`useParticipant(id)` properties:** `displayName`, `participant`, `webcamStream`, `micStream`, `screenShareStream`, `webcamOn`, `micOn`, `screenShareOn`, `isLocal`, `isActiveSpeaker`, `mode`, `metaData`.

**`useParticipant(id)` methods:** `enableMic()`, `disableMic()`, `enableWebcam()`, `disableWebcam()`, `pin()`, `unpin()`, `remove()`, `setQuality("low"|"med"|"high")`, `captureImage()`, `getVideoStats()`, `getAudioStats()`, `getShareStats()`.

**Quality contradiction - resolved.** Two guides conflict; the SDK reference settles it.
`setQuality()` **does** exist on `useParticipant` and controls **what you consume**.
The PubSub `CHANGE_RESOLUTION` pattern controls **what the remote publishes**.
Phase 2 uses `setQuality()`. Leave `CHANGE_RESOLUTION` to Phase 3.

## Tasks

### 1. Meeting shell and connection lifecycle

- `/:meetingId` precall -> in-call transition. **Reuse the precall tracks** via `MeetingProvider`'s `customCameraVideoTrack` / `customMicrophoneAudioTrack` so the camera does not visibly flicker off and on.
- `MeetingProvider` config: `meetingId`, `name`, `micEnabled`, `webcamEnabled`, `participantId`, `multistream`.
- **`participantId` must be unique** within the meeting or participants get evicted.
- `join()` from `useMeeting`.
- **Connection states via `onMeetingStateChanged`:** render Meet's "Reconnecting..." banner on `RECONNECTING`, and a failure state on `FAILED` / `DISCONNECTED`. This is real Meet behaviour and the SDK gives it to us directly.
- Extend the SDK seam and `FakeMeetingClient` to cover participants, streams, and connection state, so all of the above is testable with no network.

### 2. Audio rendering - get this right or the app screeches

Audio is separate from video and easy to get wrong.

- Build a `MediaStream` from `micStream.track` and render it in an `<audio autoPlay>` element per remote participant.
- **Mute the local participant's own audio element.** Rendering your own mic back to yourself causes a feedback loop. This is the single most common bug in this area.
- Audio elements are invisible; they are not part of the tile's visual layout.
- **Autoplay policy:** browsers block autoplay audio without a user gesture. The join click normally satisfies this, but handle the rejected-play promise rather than failing silently.
- **Wire up speaker output here (inherited item A).** These audio elements are the only things `setSinkId` can be applied to, and every one of them needs it. Doing it now costs one line per element; doing it later means revisiting every tile.

**Test the feedback loop for real.** It cannot be caught by a passing assertion in jsdom, and it is the one bug in this phase that is genuinely unpleasant for whoever hits it. Assert the local element is muted in the fake suite, then confirm with two live contexts in `test:e2e:live`.

### 3. Participant tile

Per Figma. Video, name label, mic-muted indicator, avatar fallback when camera is off, speaking indicator via `isActiveSpeaker`.

Build the `MediaStream` from `webcamStream.track`.

Use **container queries** - tiles resize with their container, not the viewport.

### 4. Grid, pagination, and quality stepping

- Responsive grid matching Meet's tile arithmetic (tiles-per-row by count and aspect ratio).
- Active speaker highlight ring, driven by `activeSpeakerId` / `onSpeakerChanged`.
- **Pagination.** Cap visible tiles per page (Meet's tiled view maxes at 49) with Meet's page controls.
- **Pause offscreen streams** via `useStream`'s `pause()` / `resume()`. Un-paginated participants must not consume bandwidth.
- **Quality by visible count** per the layout guide: under 3 -> `high`, 4-6 -> `med`, over 6 -> `low`, via `setQuality()`.

Verify to ~12 participants. The architecture must hold at 49 without a rewrite.

### 5. Layout switcher

**Not in the Figma. Source from live Meet, screenshot-review with the user.**

Tiled, Spotlight, Sidebar, each with its quality profile:

- **Tiled** - grid, quality by count.
- **Spotlight** - active speaker only at `high`.
- **Sidebar** - speaker at `high`, others at `low`.

Meet's real default is "Auto". Check the live product and **ask the user** whether to include it - the Figma cannot answer this.

### 6. In-call media controls

**The API differs from precall.** Precall is `useMediaDevice`; in-call is `useMeeting`. See docs/VIDEOSDK.md.

- `toggleMic()` / `muteMic()` / `unmuteMic()`, state from `localMicOn`.
- `toggleWebcam()` / `enableWebcam()` / `disableWebcam()`, state from `localWebcamOn`.
- Device switching: **`getMics()` / `getWebcams()`** and **`changeMic(deviceId)` / `changeWebcam(deviceId)`** - note these are named differently from precall's `getMicrophones()` / `getCameras()`.
- Current device from `selectedCameraDevice` / `selectedMicrophoneDevice`.
- Remote state via `useParticipant(id)`: `micOn`, `webcamOn`.
- Control bar per Figma, with the device-picker chevron menus.

### 7. Screen share

- `toggleScreenShare()` / `enableScreenShare()` / `disableScreenShare()`.
- `presenterId` from `useMeeting`, null when nobody presents. `onPresenterChanged`.
- Render via `useParticipant(presenterId)` -> `screenShareStream` + `screenShareOn`, building a `MediaStream` from the track.
- Presenter layout: share primary, participants to the side at `low`.
- Meet's "You are presenting" state and stop-sharing affordance.
- **Handle the user cancelling the browser's native picker** - it rejects rather than throwing visibly, and a silent failure leaves the button in a wrong state.
- Handle the browser's own "Stop sharing" bar, which ends the share without going through our UI.

### 8. Pin - local only

**Settled: our own React state. Do not call the SDK's `pin()`/`unpin()`.** See the decisions table.

Pin affects the local view only: pinned participant goes primary, others to the side.
Reflect it in quality (pinned `high`, rest `low`).
Unpin restores the previous layout.

### 9. Self-view

Meet's own-tile behaviour, including minimise and reposition.
Mirrored horizontally, as Meet does.

### 10. Meeting details and copy link

**Not in the Figma. Source from live Meet, screenshot-review with the user.**

Panel with the meeting code and copy-link.
Code displays as VideoSDK's `xxx-yyy-zzz`. **Settled - no mapping to Google's format.**

### 11. Network quality indicator

Driven by **`onQualityLimitation({ type, state })`**, which reports `congestion` / `bandwidth` / `cpu` as `detected` / `resolved`.
Per-participant stats available via `getVideoStats()` / `getAudioStats()`.

Note `cpu` limitation matters more once Phase 3 adds background blur.

### 12. Keyboard shortcuts

Meet's real bindings: Ctrl+D mute, Ctrl+E camera, plus others confirmed against the live product.
**Must not fire while the user is typing in an input.**

### 13. Leave and post-call

- `leave()` removes you. `end()` terminates for everyone. `onMeetingLeft` fires for all participants when anyone calls `end()`.
- **Call `leave()` on unmount** of the meeting component.
- Post-call screen with rejoin. **Not in the Figma - source from live Meet, screenshot-review.**

### 14. Mobile

Replicate real Meet **mobile web** for the in-call layout.

**Do not match the Figma's mobile frames.** They are the native iOS app (SF Pro, iOS status bar, home indicator), which is a different product with a different layout. Reference them for spacing and hierarchy only.

Mobile web uses the system font stack. **SF Pro is never shipped.**

Screenshot review with the user before baselining.

## Verification

**The testing policy changed mid-phase, on 2026-07-15. Read it in [DECISIONS.md](../DECISIONS.md).**
**No new unit tests.** E2E sparingly, important flows only. **Verify mainly by driving the Playwright MCP browser yourself.**

**Drive it in the browser** - this is now the default for everything:
grid reflow at 1/2/4/9/20 participants, pagination, active speaker ring, local pin, layout switching, control-bar toggles, device menus, presenter layout, the reconnecting banner, the network indicator, self-view, meeting details, leave and post-call, and the whole thing on mobile.
**Report what you actually saw**, not what should happen.

**E2E specs - only these.** Each is here because it is expensive to break silently, or impossible to see by hand:
- **Local pin does not move a second context's layout.** The entire reason we rejected the SDK's broadcast pin. A regression is invisible in a single browser.
- **Two contexts join, see and hear each other, and leave** (live suite). The core promise of the app.
- **Offscreen streams actually pause** under pagination. Otherwise it is a silent bandwidth leak that looks fine.

If a flow is not on that list, drive it in the browser instead of writing a spec.

**Other gates:**
- `npm run figma:diff` **at 1728px against the `Meeting` frame only.** No other Phase 2 screen has a Figma baseline. **The frame is dark** - "Light" names the section, not the appearance (see FIGMA.md). Mask only what is inherently different (remote video), and read the diff image rather than chasing the number.
- **`toHaveScreenshot` baselines committed and failing on real regressions** (inherited item B). Prove the gate works by breaking something on purpose once. This is the one place a committed assertion still earns its keep: it is the only automatic guard on fidelity.
- **Speaker output actually routes** (inherited item A): selecting a device moves the audio, or the control is hidden where the browser cannot support it. **Verify by ear.** A passing mock proves nothing here, which is exactly why this is a browser check and not a test.
- Screenshot review with the user for every live-Meet-sourced screen (see the coverage table).
- `npm test` must still pass. **Do not add to it.**
- Manual, with your own eyes and ears: **no audio feedback loop**, quality steps down as participant count rises.

## Definition of done

Two real participants can join, see and hear each other, share screens, switch layouts, pin locally, and leave.
Reconnection is handled visibly.
The base grid matches the Figma `Meeting` frame at 1728px in Light theme.
Every live-Meet-sourced screen has been screenshot-reviewed and approved by the user.
Mobile web works and has been reviewed.
Covered by Playwright.

Plus both inherited items closed:
**the speaker picker routes audio or is hidden where it cannot**, and
**visual baselines are committed and actually fail on a regression.**

No control ships that does not do what it says.

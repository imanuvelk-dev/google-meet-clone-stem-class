# Phase 3 - Collaboration and Control

**Read [CLAUDE.md](../../CLAUDE.md) first**, and the files it points at: [DECISIONS.md](../DECISIONS.md), [VIDEOSDK.md](../VIDEOSDK.md), [FIGMA.md](../FIGMA.md). None are loaded automatically.

**DECISIONS.md, VIDEOSDK.md and FIGMA.md win over this file** where they disagree.

## Context

Phase 1 shipped the foundation (tokens, primitives, SDK seam, auth endpoints, visual-diff harness) plus landing and precall.
Phase 2 shipped the in-call shell, grid, media controls, screen share, layouts, and leave.

Phase 3 is the last phase.
It adds everything social and administrative: chat, reactions, hand raise, the participants panel, the waiting lobby, host controls, and recording.

**Four of the original thirteen tasks are cut**, each for a reason established by checking rather than assuming. Blur (8), noise suppression (9) and captions (10) are **not built**; remote quality switching (12) is YAGNI. See the tasks themselves and DECISIONS.md.

## Status - START HERE

**Phase 3 is part-built. The seam is done and committed; no feature UI exists yet.**

| Where | What |
|---|---|
| Branch | **`phase-3-collaboration`**, three commits on top of `phase-2-in-call` |
| Worktree | `.claude/worktrees/phase-3-collaboration` (git-ignored) |
| Green | `npm test` 236, `npm run test:e2e` 86, `typecheck`, `lint`, visual baseline unmoved |

Read the three commit messages before you start. They say **why**, and the code carries no comments to tell you (see CLAUDE.md's conventions - **do not add any**; rationale goes in `docs/`).

### Done

- **The whole in-call seam**, in one pass: PubSub (chat, reactions, hand raise), lobby, host controls, recording. Done together rather than per task because they rewrite the same five files and collide on the same method.
- **`FakeCallClient`** grew matching `simulate*` hooks and scenario fields, so every one of them drives with **no network**.
- **`createCall.ts`** now reads the `role` that `/api/token` has returned since Phase 1 and was dropping on the floor. `CallState.isHost` is real.

### Done since - 2026-07-16

- **The hooks layer**, copying `useCall.ts`'s idiom: `useChat` (+ `useChatUnreadCount`, kept apart so the bar's badge does not subscribe to the log), `useReactions` (`useSendReaction` + `useTileReactions`), `useRaisedHands`, `useLobby` (+ `usePendingEntry`), `useHostControls` (+ `useIsHost`, a primitive snapshot so the panel does not re-render on every active-speaker change), `useMediaRequests`, `useRecording`. **`muteAll` is deliberately NOT among them** - `src/meeting/hooks/` IS the seam, and the seam does not grow a loop over its own methods. It lives in `HostControlsMenu.tsx`.
- **The panel chrome** (`Panel.tsx`), shared by Chat and People. White, 360x1021, and the stage never learns it exists.
- **Chat, People, lobby (both sides), host controls, recording.** The six `?fake_call=` scenarios are wired.
- **A fake-fidelity bug the plan's own derivation exposed.** `FakeCallClient` set `isHost` on connect; the real client sets it in its constructor. See DECISIONS.md - do not undo it.

### Still not done

- **Task 13, mobile.** The panels go full-screen at 900px (matching the bar's existing breakpoint), but **the control bar's mobile rule hides the whole right group**, so Chat, People and Host controls are *unreachable on a phone*. Reactions and Raise hand return by themselves, because that rule matches on `aria-disabled` rather than by name. Meet uses a sheet. This is the real remaining work.
- **Screenshot review with the user** for every live-sourced surface: reactions, hand raise, both lobby screens, host controls, the REC badge and notice.

### Two things need a live room, not you

Both are in Open risks, and **one blocks task 6**:

1. **Nothing tells a guest it is in the lobby.** `onEntryResponded` *ends* the "Asking to be let in" screen; no event starts it. Whether an `ask_join` holder even reaches `CONNECTING` and stays there is unverified, and the host-absent decision hangs on this exact screen.
2. **Recording's status strings are unverified.**

### What the last agent learned, which will save you hours

**The docs and the shipped artifact disagree, repeatedly.** Three times in one phase:

- `onEntryResponded` takes **one object**, not two positional arguments. VIDEOSDK.md said otherwise; the compiler rejected it.
- `changeWebcam`/`changeMic` **already accept a `MediaStream`**. Our seam narrowed them to `deviceId`, not the SDK.
- `VBModel.meet` is named for a **segmentation model**, not for Google Meet. The docs recommended it on that coincidence, and it routed through the package they call deprecated.

**Read the `.d.ts` and the bundle in `node_modules`. They beat the guide, and they beat this file.**

## What re-verification changed

This section is kept as a record of how much the plan's assumptions moved when they were checked. **Every claim in the original three has since been overturned again**, which is the argument for checking rather than reasoning from docs.

1. ~~**Captions ARE available.**~~ The API exists. **The user's plan does not include it**, checked 2026-07-15. Task 10 is cut.
2. ~~**Blur is desktop-browser only.**~~ True as a claim, but **nothing in VideoSDK's code enforces it** and every capability probe passes on mobile, so "feature-detect and hide on mobile" was never implementable. Task 8 is cut for unrelated and worse reasons: it routes through the deprecated `media-processor-web`, swallows model-load failures, and does not fully dispose.
3. ~~**`startTranscription` requires a `webhookUrl`.**~~ Moot with captions cut.

**The lesson, which Phase 3 hit three more times:** the docs and the shipped artifact disagree. `onEntryResponded` takes one object, not two arguments - the compiler caught it. `changeWebcam` already accepts a `MediaStream`; our seam narrowed it, not the SDK. And `VBModel.meet` is named for a segmentation model, not for Google Meet. **Read the `.d.ts` and the bundle.**

## Depends on

Phase 1: tokens, primitives, SDK seam, `/api/token` + `/api/rooms` with the stateless host grant, Playwright harness, `figma:diff`.
Phase 2: in-call shell, grid, control bar, audio elements.
Phase 3's own first commits: the extended seam and fake. See Status.

The control-bar buttons you are activating already render as `PendingButton` (`ControlBar.tsx`): `control-reactions`, `control-raise-hand`, `control-people` (with a real count), `control-chat`, `control-host-controls`. **Replace them in place; do not add or remove any.** The Figma sizes its three groups (566/564/566) around all twelve controls, summing exactly to the 1696px content box with no slack, so a thirteenth control or a missing one slides the rest out of place and makes the pixel diff meaningless.

**Two of the twelve stay pending forever, and both need an honest reason rather than the shared "Available in a later version":**

- **Captions** - cut, not deferred (see task 10).
- **Activities** - breakout rooms, polls, Q&A and whiteboard are **out of scope for the whole project** (PLAN.md), so this is not coming either.

`PENDING_REASON` is currently one shared constant applied to all six. Give `PendingButton` an optional `reason` prop so those two can tell the truth while the four you are activating keep the default until you get to them.

## Settled decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Host absent** | **Guest stays in the lobby. Show Meet's "Nobody responded to your request".** | User-selected. Faithful to real Meet. See the trap below. |
| **Blur, noise suppression, captions** | **Cut. Not built.** | Each for its own reason, all established by checking. See tasks 8, 9 and 10, and DECISIONS.md. The same principle drove all three: better no control than one that cannot work honestly. |
| **Recording** | **In-call UX only.** Start/stop, REC indicator, participant notice, consent acknowledgement. File lands in the VideoSDK dashboard. | Meet saves to Drive and emails a link; we cannot replicate that, and retrieval would need a database. Replicates everything a participant actually sees during the call. |
| **Pin** | Local-only, our own React state. Do not use the SDK's `pin()`. | Carried forward from Phase 2. |

### The host-absent trap - read this before touching the lobby

"Guest stays in the lobby" is faithful, but combined with the stateless host model it has a sharp edge.

**The `hostGrant` lives only in localStorage, keyed by roomId.**
If the creator clears storage, switches browsers, or opens their own link on a phone, they lose host status.
An empty room admits nobody.
**That meeting is then permanently unenterable by anyone, forever.**

This will bite the first time someone tests in an incognito window, and it will look like a bug rather than the design.

- **Do not "fix" the lobby by making empty rooms admit people.** That is a deliberate decision, not an oversight.
- **Do not build the `?dev_host=1` hatch. It is cancelled.** This section used to prescribe it, gated on `import.meta.env.DEV` plus a build-time grep over `dist/`. **That gate could not have worked:** the role is decided on the server from a signed grant, so the hatch could never be client-only, and `import.meta.env.DEV` and `dist/` are both client-only - `api/*.ts` are Vercel functions built separately. The grep would have passed green while production shipped a hatch making any room hostable by appending a query param.
- **Nothing is blocked without it.** The fake suite mints no tokens; the live suite already seeds a real grant (`tests/e2e-live/call.live.spec.ts`) and asserts `role === 'host'`; Landing's "New meeting" saves one. To get host in dev for a room you did not create, seed the grant yourself:

```js
localStorage.setItem('meet-clone:host-grant:<roomId>', '<grant from POST /api/rooms>')
```

Full reasoning in [DECISIONS.md](../DECISIONS.md). **The trap is real; only the cure changed.**

## The Figma frames ARE pulled now - this section is history

**Done on 2026-07-16.** `Desktop / Meeting / Chat / Light` (**52:1890**) and `Desktop / Meeting / People / Light` (**52:2215**) are in `FRAMES`, and `npm run figma:pull` rendered 7/7. Figma Desktop was already connected, so this needed no separate user step after all.

What the frames turned out to contain, none of which the section below predicted:

- **The panels are white**, not dark - `#ffffff`, 360x1021 at (1352, 16). "Both frames are dark" below is true of the *stage* and wrong about the *panel*. Verified against the Dark section: 0 of 7,720,704 pixels differ, so the white is the design in both.
- **Opening a panel shrinks the stage 1696 -> 1320**, with a 16px gap. The stage needed no change to do this: it already pads itself 16, so a 360 panel with a 16 right margin lands its content box on 1320 exactly.
- **Three controls in the frames cannot be honoured** and are dropped, user-settled: Chat's "Let contributors send messages" toggle, People's "Add People", and the "Contributors" grouping. See DECISIONS.md's accepted deviations.
- **The frame's chat notice advertises message pinning**, which we do not have. The honest sentence this plan asks for turned out to live on the **`Mobile / Meeting / Chat`** frame, and that is the one we ship.

**The lesson holds again, for the fourth and fifth time in this phase: the docs and the artifact disagree, and the artifact wins.** This plan said the notice read "messages are only visible to people in the call" and that both frames were dark. Both were wrong, and only reading the render settled it.

The original text follows, for the reasoning rather than the instructions.

## ~~The Figma frames are not pulled yet - this blocks tasks 2 and 5~~

**`figma:diff` cannot run against Chat or People today.** `scripts/figma-pull.ts`'s `FRAMES` omits both, `scripts/figma-diff.ts`'s `SCREENS` contains only `precall`, and `.figma/renders/` has no chat or people PNG. The gate this plan mandates is pointed at files that do not exist.

Closing it needs **the user, not you** (Figma Desktop must be open and patched):

1. Add `Desktop / Meeting / Chat / Light` and `Desktop / Meeting / People / Light` to `FRAMES` in `scripts/figma-pull.ts`. **Check the real frame names first** with `figma-cli find` - `resolveFrameId` fails loudly on an ambiguous name, which is deliberate: both sections mirror each other and a name that omits the theme matches twice.
2. **Ask the user to run** `figma-cli connect` (Yolo Mode) and `npm run figma:pull`, then `figma-cli unpatch`.
3. Add both to `SCREENS` in `scripts/figma-diff.ts`.

**Both frames are dark.** "Light" names the *section*, not the appearance - Meet's in-call is dark whatever your theme. See FIGMA.md.

**Do not build these panels from guesswork while you wait.** `MeetingDetails` deliberately deferred its chrome for exactly this reason: the file already answers the question.

## Figma coverage - read this before you start

**The Figma covers exactly two Phase 3 screens.**
Everything else is live-Meet-sourced and screenshot-reviewed, per the settled project rule in docs/DECISIONS.md.
That is a known, accepted condition of the project - not a gap to fill by guessing, and not a reason to skip the screen.

| Surface | Source | Verified by |
|---|---|---|
| Chat panel | **Figma `Meeting / Chat`** | `figma:diff` |
| Participants panel | **Figma `Meeting / People`** | `figma:diff` |
| Reactions + picker | Live Meet | Screenshot review |
| Hand raise | Live Meet | Screenshot review |
| Lobby (knock, admit/deny) | Live Meet | Screenshot review |
| Host controls | Live Meet | Screenshot review |
| Recording indicator + notice | Live Meet | Screenshot review |

Blur, noise suppression and captions were in this table and are **cut**, so they need no source and no review.

**Rules:**
- **1728px, Light theme only.** Dark is deferred; keep new tokens semantic so it retrofits without rework.
- **The Figma's mobile frames are the native iOS app.** Reference for spacing only, never a spec, never diffed. SF Pro is never shipped.
- The two Figma frames likely show **resting states only**. Host affordances, hand-raise ordering, and the knock card are not in them - source those from live Meet.
- Never invent a `figma:diff` baseline for a live-sourced screen before the user approves a screenshot.
- Never let a generated token name (`body-2`, `accent-9`) reach a component.

## The seam you build on - this is already written

**You will not call `usePubSub`, `useMeeting` or `useParticipant`. ESLint blocks `@videosdk.live/react-sdk` outside `src/meeting/`, and that is the point:** an SDK upgrade should touch the seam and nothing else. Everything below is on `CallClient` (`src/meeting/CallClient.ts`) and works against `FakeCallClient` with no network.

**Reads** - all referentially stable. Consume via `useSyncExternalStore`, per `useParticipants.ts`.

```ts
getChatMessages(): readonly ChatMessage[]     // oldest first. NOT id-split: every consumer wants all of it
getChatUnreadCount(): number                  // own snapshot, so the badge does not subscribe the bar to the log
getRaisedHands(): readonly string[]           // ordered, earliest first. For the panel and bar - NEVER a tile
getPendingEntryIds(): readonly string[]       // host side. Empty for a guest
getPendingEntry(id): PendingEntry | null
subscribeToReactions(fn): () => void          // an EVENT channel, not a snapshot. See below
```

**On `CallState`** (read via `useCall()`): `isHost`, `entryDecision`, `micRequest`, `webcamRequest`, `isRecording`, `recordingState`.

**On `CallParticipant`** (read via `useParticipantView(id)`): **`handRaised`**. A tile reads this, never `getRaisedHands()`, so it re-renders when its own hand moves and not when anyone else's does.

**Commands**

```ts
sendChatMessage(text)   markChatRead()
sendReaction(emoji)     setHandRaised(raised)   lowerParticipantHand(id)
admitParticipant(id)    denyParticipant(id)
muteParticipant(id)     disableParticipantWebcam(id)
requestParticipantMic(id)   requestParticipantWebcam(id)
acceptMicRequest()      rejectMicRequest()      acceptWebcamRequest()   rejectWebcamRequest()
startRecording()        stopRecording()
```

### Four things about this surface that are deliberate

1. **There is no `unmuteParticipant`, and you must not add one.** Hosts can mute and cannot force-unmute. The **absence of the method is what makes the bug unwritable**; the mandated e2e is only the runtime half. The SDK's `enableMic()` does not enable anything - it *asks* - so the seam renames it `requestParticipantMic`.
2. **There is no `muteAll()`.** It is a loop over `getParticipantIds` + `muteParticipant`, and "skip yourself, skip the already-muted" is a product decision. A seam that grows a method which is a loop over its own methods has started absorbing the feature. Write the loop in the feature.
3. **Reactions are an event, not state.** A reaction has no answer to "what is this when nothing is happening", so it is delivered and never stored. The tile owns the lifetime, because the lifetime *is* the animation. Clear on `onAnimationEnd`, **not** a `setTimeout`, so `prefers-reduced-motion` (duration 0) self-cleans.
4. **`ChatMessage` has no `isLocal`.** Compare `senderId` against `localParticipantId` from `useCall()` at render. Baking it in looks tidy and is a latent bug - see DECISIONS.md.

**Before adding ANYTHING to this seam, read "The seam's design rules" in [DECISIONS.md](../DECISIONS.md).** It carries the reasoning the code is not allowed to.

### Driving it with no network

`FakeCallClient` exposes, on `window.__fakeCall` (see `tests/e2e/call.spec.ts` for the pattern):

```ts
simulateChatMessage({senderId, senderName, text})   simulateChatHistory([...])
simulateReaction(id, emoji)                          simulateHandRaise(id, raised)
simulateEntryRequested({participantId, name})        simulateEntryResponded('allowed'|'denied')
simulateMicRequested(byId)                           simulateRecordingState(state)
```

Plus assertion surfaces (`publishedChat`, `admittedParticipantIds`, `micRequestedParticipantIds`, `mutedParticipantIds`, `recordingStartCount`, ...) and `FakeCallScenario` fields (`isHost`, `chatHistory`, `raisedHands`, `pendingEntries`, `isRecording`) for the world at t=0.

**Two of these are load-bearing and must not be "simplified":**

- `simulateHandRaise` **appends to the log and folds it**, rather than setting a boolean. The derivation is the thing that can break, so a boolean-setting fake would make *"a raised hand survives a late join"* assert nothing.
- `simulateEntryRequested`'s `allow()` **joins the participant**, so *knock -> admit* traverses the real clearing path: **the roster arrival clears the card, not the click.** A fake that cleared on click would make the test pass for the wrong reason.

**You still need to add `?fake_call=` scenarios** in `src/test/fakeFromUrl.ts` to reach these from a browser: `lobby-host`, `lobby-guest`, `hands-up`, `chat-history`, `recording`, `guest`. The scenario fields exist; the URL wiring does not.

### Raw SDK facts you still need

Only for work inside `src/meeting/`. See [VIDEOSDK.md](../VIDEOSDK.md) for the full, corrected surface.

- **`allow_join` is the HOST. `ask_join` is the GUEST.** Backwards inverts the whole lobby.
- **Recording's `status` values are NOT verified.** Mapped at the seam, returning null for anything unrecognised, so a wrong guess cannot put a false REC indicator over a meeting nobody is recording.

**Captions, blur and noise suppression are cut**, so their APIs are deliberately not documented. Describing an API we chose not to use is an invitation to use it. Tasks 8 to 10 and DECISIONS.md both name what would have to change to revisit.

## Tasks

### 1. PubSub foundation - DONE

The seam, the store, the bridges and the fake are committed. The topic map is `src/meeting/pubsubTopics.ts`; `persist` lives there, per topic rather than per publish site, so it cannot drift.

**One piece remains: the hooks layer.** `src/meeting/hooks/` has no `useChat`, `useReactions`, `useRaisedHands`, `useLobby`, `useHostControls` or `useRecording`, and **nothing can reach the new store without them.** Build them first, copying `useCall.ts`'s idiom exactly: `useSyncExternalStore` for reads, commands bound in a `useMemo([client])` so an `onClick={chat.send}` cannot lose `this`.

`useReactions` is the odd one and the plan is in the seam section: `useTileReactions(participantId)` subscribes to the event channel, holds its own component state, and drops each entry on `onAnimationEnd`.

### 2. Chat - Figma `Meeting / Chat`

**Build the panel chrome first. It does not exist, and People needs it too.**

`MeetingDetails.tsx:12-22` is a popover rather than a side panel *specifically* because "the panel's chrome is shared with Chat and People, both of which DO have Figma frames that Phase 3 owns. Inventing that chrome a milestone early would mean guessing at a design the file already answers." **You are the milestone.** Read the frame, build the chrome, and consider migrating `MeetingDetails` into it.

The panel is a **sibling of `<Stage />` inside `Call.tsx`**, not a child: desktop pushes the grid, mobile is a full-screen overlay.

Then the panel per Figma: `senderName`, `message`, `timestamp`, grouped consecutive messages, Meet's "messages are only visible to people in the call" notice, and an unread badge from `getChatUnreadCount()` when closed.

`persist: true` is already set, so history reaches late joiners via `onOldMessagesReceived` with no work from you. **That is the mandated e2e.**

**The chat input needs no keyboard-shortcut work.** `useCallShortcuts.ts:8-24`'s `isTyping` was written for exactly this and is already wired. Its comment: *"the day it matters is the day someone types 'don't' into chat and mutes the room."* That day is today, and it is handled.

### 3. Reactions - live Meet

`sendReaction(emoji)`; the set is `REACTION_EMOJI` in `pubsubTopics.ts`, in Meet's order. Unknown emoji from a build we do not know are **dropped at the seam**, not rendered - a tofu box over someone's face is worse than nothing.

Floating animation over the tile, plus the picker. **Respect `prefers-reduced-motion`**, which falls out for free if you clear on `onAnimationEnd` rather than a timer.

### 4. Hand raise - live Meet

`setHandRaised(raised)`; `lowerParticipantHand(id)` for a host lowering someone else's. Tile indicator from `useParticipantView(id).handRaised`; ordering in the panel from `getRaisedHands()`.

**A raised hand survives a late join** because the log persists and the seam folds it. **That is the mandated e2e.**

Two things that look like bugs and are not:

- **No optimistic echo.** Your own raise round-trips through the log before the icon appears. An optimistic boolean plus an authoritative log is two sources of truth that will disagree on a reconnect.
- **PubSub carries no authority.** Any client can publish a `lower` for anyone. Order is advisory; the real boundary is the VideoSDK token. **Do not add a client-side `allow_mod` check** - it would read as security and not be any.

### 5. Participants panel - Figma `Meeting / People`

Uses the chrome from task 2. List, search, mic/camera state per participant, host actions, hand-raise ordering from `getRaisedHands()`.

Host affordances and hand-raise ordering are **not** in the frame - source from live Meet.

**There is no host badge, and this is settled.** Remote host-ness **is not derivable**: `useParticipant` exposes no permissions, and the only way to fake it is a self-asserted PubSub topic any client could forge. Same rule that dropped "Switch account": do not ship UI that claims to know something it cannot. Your OWN host-ness (`CallState.isHost`) is real and is what gates the host actions. See DECISIONS.md.

### 6. Waiting lobby - live Meet

**Settle the guest-side probe before building the guest half.** See Open risks: nothing tells a guest it is in the lobby, and this screen is exactly what the host-absent decision hangs on. **Do not guess it.**

**Host:** `getPendingEntryIds()` / `getPendingEntry(id)` -> Meet's "X wants to join" card, `admitParticipant` / `denyParticipant`.

**Guest:** `CallState.entryDecision` for the answer, and the "Asking to be let in" screen **derived** from `connection` + `isHost` + `entryDecision === null`, because no event announces it.

**Host absent: stay in the lobby, show "Nobody responded to your request".** Settled. **Do not "fix" this by making empty rooms admit people.**

Three behaviours are already in the seam and will look wrong until you read why (DECISIONS.md):

- **The card clears when the admitted guest arrives in the roster, not when the host clicks.** That is deliberate: `allow()` fired at a guest who already left produces no arrival, so the card correctly stays rather than vanishing into a lie.
- **Deny clears immediately**, because deny has no arrival to wait for.
- **Staleness is the view's job.** The store records `requestedAt`; your panel forgets. Keeps the clock at the edge and out of `CallStore`.

**Do NOT build a `?dev_host=1` hatch.** It is cancelled - the gate it was given could not have worked, and nothing was blocked without it. To get host in dev, seed a grant the way `tests/e2e-live/call.live.spec.ts` already does. See DECISIONS.md.

### 7. Host controls - live Meet

Gated on `CallState.isHost`, which is real now.

**Mute all is yours to write**, deliberately: loop `getParticipantIds()`, skip yourself and the already-muted, call `muteParticipant(id)`. The seam has no `muteAll()` because that policy is a product decision.

Per-participant mute / camera-off / remove. Handle the receiving side via `CallState.micRequest` / `webcamRequest` and `acceptMicRequest` / `rejectMicRequest`.

**Hosts can mute but cannot force-unmute.** There is no `unmuteParticipant` on the seam and **you must not add one** - the absence is what makes the bug unwritable. `requestParticipantMic` only asks; the target may refuse. **That is the mandated e2e.**

If two requests are in flight the later replaces the earlier, and the earlier's closures are dropped un-called. **Do not auto-reject the displaced one** - rejecting on the user's behalf is a lie about what they did. Meet shows one prompt.

### 8. Background blur - DROPPED

**User-settled 2026-07-15. Do not build. Do not revive without re-reading the shipped bundle.**

Reading the package rather than the docs sank it. `VBModel.meet` is **not** named for our target - it is Google's MediaPipe selfie-segmentation model, and the resemblance is a coincidence. It routes through `media-processor-web`, the package DECISIONS.md and VIDEOSDK.md both say is **deprecated**. Its model loader **silently returns on a failed fetch**, so a CDN 404 produces unsegmented video instead of an error. Its `dispose()` only nulls a reference on that path, which undercuts the "frees GPU and WASM" claim the whole lifecycle rests on.

Blur also needs **three third-party origins at runtime**, so it is unreachable from the fake e2e suite and degrades silently offline.

And the settled "feature-detect and hide on mobile" was **not implementable as written**: the plugin exports no support check, and every capability it needs passes on modern mobile. An honest probe would have enabled it there, against the decision.

The precall "Apply visual effects" button is removed with it. See DECISIONS.md.

### 9. Noise suppression - DROPPED

**User-settled 2026-07-15. Do not build.**

Recorded as BETA, which understated it. The published package's `main` is a **4.8MB webpack development build** whose own banner says it is "neither made for production nor for readable output", with five `eval()` calls and **no production build in the tarball**. It would force `unsafe-eval` into any CSP.

Revisit only if VideoSDK publishes a real build.

### 10. Captions - DROPPED

**The user verified their VideoSDK plan on 2026-07-15: realtime transcription is not available. This task is cancelled.**

The plan required this to be checked before building, and it was. The answer came back no, so there is nothing here to build.
No `useTranscription`, no `api/transcription-webhook.ts`, no caption overlay.
**Do not fake captions**, and do not revive this task without the user re-checking their plan.

The captions **button** stays in the control bar, disabled, carrying a truthful reason.
It is in the Figma frame, and the frame's three control groups (566/564/566) are sized around all twelve controls, so deleting it slides the rest out of place and makes the pixel diff meaningless.
A disabled button that says why is not "a control that silently does nothing" - it is the honest form of one. See `ControlBar.tsx`'s `PendingButton`.

Recorded as an accepted gap in [DECISIONS.md](../DECISIONS.md).

### 11. Recording - live Meet, in-call UX only

`startRecording()` / `stopRecording()`, REC indicator from `CallState.isRecording`, "This meeting is being recorded" notice to all participants, consent acknowledgement.

**`startRecording()` deliberately takes no arguments**, against the SDK's four. None of them is a decision a component gets to make: the webhook is deployment config, `awsDirPath` is null because the file lands in the VideoSDK dashboard by decision, and `transcription` is dropped with captions.

**Verify the status strings in a live room before shipping this.** They are unverified and assumed; the seam returns null for anything unrecognised rather than guessing, so a wrong assumption shows as a REC indicator that never appears rather than one that lies. See Open risks.

File lands in the VideoSDK dashboard. **No retrieval, no post-call link** - that needs a database. Settled.

### 12. Remote quality switching - SKIPPED

**User-confirmed 2026-07-15. Do not build.**

Phase 2 already uses `setQuality()` for what we **consume**, which saves the bandwidth that matters to us. The PubSub `CHANGE_RESOLUTION_<participantId>` half would change what a remote **publishes** - a different thing, not an alternative. **YAGNI.** Build it only if a real need appears.

Note this is the one cut task with **no new topic in `pubsubTopics.ts`**, on purpose: a topic string is a wire contract, and adding one for a feature nobody built is a contract nobody honours.

### 13. Mobile

Live Meet **mobile web** for all panels (chat, participants, reactions) - full-screen overlays, not side panels.
**Do not match the Figma's mobile frames** - they are the native iOS app. Reference for spacing only, never diffed, and SF Pro is never shipped.
Screenshot review before baselining.

`playwright.config.ts` already has a `mobile-chromium` project (Pixel 7), so the fake suite covers mobile the moment you add the scenarios.

## Verification

**Read the testing policy in [DECISIONS.md](../DECISIONS.md) first.**
No new unit tests. E2E sparingly, important flows only. **Verify mainly by driving the Playwright MCP browser yourself.**

**Drive it in the browser** (the default - do this for everything):
chat send/receive and grouping, unread badge, reactions and their animation, hand raise, participants panel, admit/deny cards, the host-absent message, mute-all, remove, the REC indicator and notice, and every panel on mobile.
**Report what you actually saw**, not what should happen.

**E2E specs - only these four**, because they are expensive to break silently and tedious to check by hand. The fake already supports all of them; you add the `?fake_call=` scenarios.

- **Chat history reaching a late joiner.** Drive `simulateChatHistory`, which feeds the history bucket rather than a pre-baked array, so the merge is actually exercised.
- **A raised hand surviving a late join.** `simulateHandRaise` appends to the log and folds it. **Do not "simplify" it into a boolean setter** - the derivation is the thing that can break, and a boolean fake would make this spec assert nothing.
- **Knock -> admit**, across two contexts. `simulateEntryRequested`'s `allow()` joins the participant, so this traverses the real clearing path: **the roster arrival clears the card, not the click.** A fake that cleared on click would pass for the wrong reason.
- **Host cannot force-unmute.** Assert `requestParticipantMic(id)` lands in `micRequestedParticipantIds` and leaves `micOn` **false**. Note the primary guarantee is not this spec - it is that `CallClient` **has no `unmuteParticipant` method**. The spec is the runtime half.

If a flow is not on that list, drive it in the browser instead of writing a spec.

**Other gates:**
- `npm run figma:diff` at 1728px, **against `Meeting / Chat` and `Meeting / People` only.** No other Phase 3 screen has a Figma baseline. Both frames are **dark** - see FIGMA.md.
- Screenshot review with the user for every live-Meet-sourced surface.
- `npm test` must still pass. Do not add to it.
- ~~Build-time grep over `dist/`~~ - the dev escape hatch is cancelled, so there is nothing to grep for. See DECISIONS.md.

## Definition of done

A host admits guests from the lobby, mutes all, and removes participants; a guest with no host present sees "Nobody responded to your request".
Participants chat with history, react, and raise hands that survive a late join.
Recording shows the REC indicator and notice; the file lands in the dashboard.
Chat and participants panels match their Figma frames at 1728px Light.
Every live-sourced surface has been screenshot-reviewed and approved.
Covered by Playwright.

**Blur, noise suppression and captions are cut, and that is a completed outcome rather than a missing one.** Each was checked and each failed on its own terms; the alternative was shipping a control that lies. The plan asked for exactly this: "raise it with the user rather than faking it."

## Open risks

- **Nothing tells a guest it is in the lobby.** `onEntryResponded` ends the "Asking to be let in" screen; no event starts it, so the state must be derived. Whether an `ask_join` holder even reaches `CONNECTING` and stays there is **unverified**, and the host-absent decision hangs on this exact screen. **Settle it in a live room before task 6.**
- **Recording's status strings are unverified.** Assumed to mirror transcription's. Mapped at the seam, returning null for anything unrecognised, so a wrong guess cannot put a false REC indicator over a meeting nobody is recording. **Confirm in a live room before shipping.**
- **The host-absent trap** - an empty room plus a lost `hostGrant` means a permanently dead meeting. **By design, and no longer mitigated in dev either**: the `?dev_host=1` hatch is cancelled. Seed a host grant instead. See DECISIONS.md.
- Real-room Playwright tests consume VideoSDK minutes.

Transcription, noise suppression and blur were all listed here as risks. All three are now **settled by being cut**, which is what a risk register is for.

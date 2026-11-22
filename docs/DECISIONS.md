# Locked Decisions

**Every agent must read this file before starting work.**
It exists so decisions already settled are not re-litigated by each new agent.

**If you disagree with a decision here, raise it with the user. Do not silently deviate.**

Several entries below say "do not fix this". They mean it.
Each one looks like a bug and is not.

Facts about the VideoSDK API live in [VIDEOSDK.md](./VIDEOSDK.md).
What the Figma contains lives in [FIGMA.md](./FIGMA.md).

## The table

| Area | Decision | Rationale |
|---|---|---|
| Stack | Vite + React + TypeScript (strict) | User-specified |
| Video | VideoSDK React SDK (`@videosdk.live/react-sdk`) | User-specified |
| Phasing | Three phases, each its own plan and review gate | Project too large for one cycle |
| Figma access | `silships/figma-cli` in **Yolo Mode**, patched only while extracting | User approved Yolo (`figma-cli connect`) over Safe Mode: it needs no manual plugin step. It patches the Figma Desktop binary, so it **breaks on every Figma update**. Run `figma-cli unpatch` when done extracting. Safe Mode (`connect --safe`) remains a valid fallback. **Do not use the Figma MCP** - user explicitly excluded it. |
| Styling | CSS Modules + generated design tokens | Exact Figma values are first-class. Avoids Tailwind arbitrary-value drift (`w-[437px]`). |
| Responsive | Desktop = Figma exactly. Mobile = replicate real Meet mobile web. | Decision stands, but its original rationale was wrong. The Figma **does** have mobile frames - they are the **native iOS app** (SF Pro, iOS status bar, home indicator, 393x852), not mobile web. We are a browser app, so the iOS frames are reference for spacing only, never a spec to match. Mobile is sourced from the live product and reviewed by screenshot before baselining. |
| Theme | **Light only.** No theme is wired. | Dark is deliberately deferred. Structure tokens semantically so it can be retrofitted without rework, but do not wire a theme. **This decision stands, but its original rationale was wrong**: only the *Home* frames exist in both Light and Dark. See FIGMA.md. |
| In-call surface | **The call is an always-dark surface, not a dark theme.** Its colours are `--color-call-*` tokens, extracted from the Meeting frame and always dark. | The Figma's in-call screens are dark-only, because real Meet's in-call is dark whatever your theme - like a video player. So "Light only" was never a statement about the call. Keeping these as call tokens rather than a theme means the deferred light/dark toggle stays deferred, and the call does not wrongly follow it later. **Do not "fix" the in-call by rendering it light.** |
| Landing page | **Source from live meet.google.com**, not Figma. | The Figma has **no landing page**. Its `Home` frames are the precall. Landing is replicated from the live product and screenshot-reviewed, like mobile. It is not `figma:diff`-verifiable - do not expect it to be. |
| Undesigned surfaces | **Replicate live Meet, screenshot-review with the user, then baseline.** Applies to every surface with no Figma frame. | The Figma covers 5 screens; roughly 16 surfaces have none. Settled with the user, extending the landing-page precedent. **This is a known, accepted condition of the project - not a gap to fill by guessing, and not a reason to skip the screen.** Each phase plan carries a coverage table. Never invent a `figma:diff` baseline for a live-sourced screen before the user has approved a screenshot. |
| Fonts | **Ship Product Sans**, 3 faces, self-hosted woff2. | The Figma uses Product Sans (not Google Sans, as originally feared) plus SF Pro on the iOS frames. User supplied Product Sans and chose to ship it, knowing it is Google's proprietary brand font and that serving it is redistribution. **This is a deliberate, user-owned risk - do not silently revert it to Roboto.** Only Regular 400 / Medium 500 / Bold 700 are used; no italics. SF Pro is never shipped: mobile web uses the system stack. |
| Icons | **Material Symbols, outlined, weight 600**, inlined as committed paths by `npm run icons:build`. | Weight **600, not the 400 default**: 400 is what the npm package is named for and what this project shipped from Phase 1 until 2026-07-16, and it renders visibly thinner than every icon the Figma draws. Measured rather than eyeballed - see the icon weight entry below. `FILL` stays **0**: the Figma's icons are outlined, and a filled set is the wrong fix. **Do not "correct" the source back to `svg-400`.** |
| Auth | Server-side `/api/token` endpoint signing short-lived JWTs | Role permissions live inside the JWT. The API secret must never reach the bundle. |
| Identity | Guest display name + generated avatar colour in localStorage. No OAuth. | Matches Meet's guest-join path. No user backend needed. |
| Entry | Landing page (`/`) replicating meet.google.com home, then precall (`/:meetingId`) | User-selected |
| **Testing** | **No new unit tests. Sparse e2e. Verify by driving the Playwright MCP browser.** See below. | User-specified, 2026-07-15. |
| Deploy | **Vercel.** `api/*.ts` default-export handlers. `vercel dev` locally. | Zero-config with Vite; dev and prod share one handler shape. Node runtime, so `jsonwebtoken` works (a Cloudflare Worker would have forced WebCrypto). |
| Host rule | **Meeting creator is host**, via a stateless signed host grant. See below. | Closest to real Meet, and the lobby needs someone to admit people. |
| Meeting code | **Show VideoSDK's `xxx-yyy-zzz` as-is.** No mapping to Google's `abc-defg-hij`. | User-selected. Do not build a code translation layer. |
| Host absent | **Guest stays in the lobby. Show "Nobody responded to your request".** An empty room admits nobody. | User-selected, faithful to real Meet. **This is deliberate, not an oversight - do not "fix" it.** See the host-absent trap below. |
| **Background blur** | **Cut. Not built.** User-settled 2026-07-15. | Was Phase 3 task 8. Reading the shipped bundle rather than the docs turned up three things: `VBModel.meet` is **not** named for our target (it is Google's MediaPipe selfie-segmentation model, a coincidence) and routes through `media-processor-web`, **the package this file says is deprecated**; its model loader **silently returns on a failed fetch**, so a CDN 404 yields unsegmented video rather than an error; and its `dispose()` only nulls a reference on that path, undercutting the "frees GPU and WASM" claim the whole lifecycle rests on. Blur also needs **three third-party origins at runtime**, so it is unreachable from the fake e2e suite and degrades silently offline. The user cut it rather than ship that. **Do not revive it without re-reading the bundle.** |
| **Blur on mobile** | **Moot. Blur is cut.** | Kept only so the reasoning is not lost: the old decision said "feature-detect and hide the control on mobile", and **that was not implementable as written.** The plugin exports no support check, and every capability it needs (WebGL2, `captureStream`, WASM, Workers) **passes on modern mobile**. An honest probe would have *enabled* blur on mobile, against the decision. VideoSDK's "desktop only" is a performance claim, not a capability one, and nothing in their code enforces it. |
| **Noise suppression** | **Cut. Not built.** User-settled 2026-07-15. | Was Phase 3 task 9. Recorded here as BETA, which understated it: the published package's `main` is a **4.8MB webpack development build** whose own banner reads "neither made for production nor for readable output", containing five `eval()` calls, with **no production build in the tarball**. It would force `unsafe-eval` into any CSP. That is a mis-published artifact, not a beta. **Do not ship it.** Revisit only if VideoSDK publishes a real build. |
| Recording | **In-call UX only.** Start/stop, REC indicator, participant notice, consent. File lands in the VideoSDK dashboard. | Meet saves to Drive and emails a link; we cannot replicate that, and retrieval would need a database. |
| Pin | **Local-only, in our own React state. Do not call the SDK's `pin()`/`unpin()`.** | VideoSDK's pin appears to **broadcast**: `useMeeting.pinnedParticipants` is meeting-wide and `onPinStateChanged` carries `pinnedBy`. Google Meet's pin is local-only - it changes your view and nobody else's. Using the SDK's pin would let one user rearrange everyone's screen. |
| **Captions** | **Built, 2026-07-20.** Meet-style bottom-center rolling overlay. Real transcription via VideoSDK's `useTranscription`, plus a fake path for e2e and demo. | The user re-checked their VideoSDK plan on 2026-07-20 and confirmed realtime transcription is now available, reopening the 2026-07-15 cut per that entry's own condition. Three shape decisions were settled with the user before building: **(1)** both the real bridge and the fake path are built, not just one; **(2)** the overlay is Meet's bottom-center rolling speaker-labeled lines, not a side panel; **(3)** the toggle is a **local view preference** - it shows or hides only your own overlay - and the first person to turn it on **auto-starts** the meeting-wide server transcription, which then runs for the rest of the session with no per-viewer stop. See the seam-design section below for how the meeting-wide server fact and the per-viewer local preference are kept apart. |
| **Host badge on remote participants** | **Dropped.** No badge in the People panel. | **Remote host-ness is not derivable.** `useParticipant` exposes `displayName`, `mode` and `metaData` and no permissions; nothing in the verified surface says whether someone else holds `allow_mod`. The only way to fake it is a self-asserted PubSub topic, which any client could forge - a badge asserting an authority it cannot check. Same rule that dropped "Switch account" and gates the speaker picker: **do not ship UI that claims to know something it cannot.** Our OWN host-ness is known and is fine - see below. |
| **Our own host-ness** | **Read `role` from `/api/token`'s response. Never decode the JWT.** | The server already decides and already says so (`api/token.ts:48` returns `{ token, role }`), and `src/routes/Call/token.ts:130` already hardens it so a mangled response cannot promote anyone. Phase 1 built the whole path; `createCall.ts` merely dropped `role` on the floor. Decoding the JWT client-side would contradict `api/token.ts`'s own rule that a client cannot ask to be host. It is a **UI affordance gate, not an authorisation check** - the authority is in the VideoSDK token and VideoSDK enforces it. |
| **`?dev_host=1`** | **Cancelled. Do not build it.** Seed a host grant instead. | The prescribed gate could not work and nothing was actually blocked. See the host-absent trap below for the full reasoning - it is the one entry here that reverses an earlier instruction in this same file. |

## Testing policy

Set by the user on 2026-07-15. **This overrides the Verification sections of any phase plan written before that date.**

1. **Do not write new unit tests (Vitest).** Existing ones stay and must keep passing (`npm test`). The bar is only on *adding*.
2. **Playwright e2e is wanted, but sparingly.** Reserve it for genuinely important flows, not broad coverage. If unsure, drive the browser instead of writing a spec.
3. **Verify mainly by driving the Playwright MCP browser yourself.** Open the app, click through it, look at it. This is the default.

**Do not let "no unit tests" become "unverified".**
Be explicit in reports about what you actually saw, what is only structural, and what needs a live room or a human's eyes and ears.

When a plan mandates a test for a **real gate**, re-home the gate rather than dropping it.
Example: "assert the dev host hatch is absent from a production build" becomes a build-time grep over `dist/`, which is not a unit test.

### The fake-mode switch is DEV-gated, and `scripts/check-dist.ts` asserts it at build time

`?fake=` and `?fake_call=` are the e2e suite's way of driving the app deterministically, and both entry points in `src/test/fakeFromUrl.ts` return `undefined` unless `import.meta.env.DEV`.
That guard is what lets the whole fake tree - `FakeMediaClient`, `FakeCallClient`, every scenario table - shake out of the production bundle.
Shipping it would be a real bug rather than a test convenience: the switch fakes the camera and, because the fake defaults `isHost` to true, hands out every host affordance on the deployed origin.
`npm run build` now ends with `tsx scripts/check-dist.ts`, which walks every file under `dist/` and fails the build if any fake canary is present.

**This is the one place a `dist/` grep is genuinely on-target, and it is not a contradiction of the `?dev_host=1` entry that rejected the same idea.**
That gate was cancelled because the thing it needed to prove absent lived in `api/token.ts`, a Vercel serverless handler which never enters `dist/` at all, so the grep could only ever have passed vacuously.
The fake-mode switch is the opposite case: it is imported by `src/main.tsx` and is bundled by Vite, so `dist/` is exactly where its presence or absence is decided.

**The gate asserts string literals, never identifiers.**
Rolldown mangles `FakeCallClient` to `Xt` and `__fakeCall` survives only as a property name if the module survives at all, so greping for a class or variable name would fail to fire on a bundle that actually shipped the fakes.
String literals - `Ada Lovelace`, `Some Other Speakers`, `Unknown fake scenario`, `MacBook Pro Speakers` - pass through minification unchanged, so they are the only reliable evidence.
Needles must be **unique to the fakes**: `is in use by another application` was tried and rejected, because `VideoSdkMediaClient.ts` raises nearly the same message and the gate fired on a clean build.

**The self-check exists because a grep for a string that no longer exists passes forever.**
Before touching `dist/`, the script re-reads each needle's source file and exits non-zero if the literal is gone, with a message saying the gate proves nothing until `NEEDLES` is updated.
This is the exact failure mode that let `--use-fake-device-for-media-capture` read as working from Phase 1 until 2026-07-15 while every test run drove the real webcam.
A silent guard is worse than no guard, so the script refuses to pass rather than refusing to notice.

Building the gate found a live leak, since fixed: the scenario tables were module-scope `const`s, so `remotes(3)`-style calls in `CALL_SCENARIOS` were side effects Rolldown would not shake, and all 20 names plus the roster builder shipped in `dist/` even though the fake clients did not.
The tables are now built inside functions called after the `DEV` check, which is why `mediaScenarios()` and `callScenarios()` are functions and not constants.
**Do not turn them back into module-scope constants.**

### The e2e suite serves itself, on its own port. Do not point it back at 5173.

Fixed 2026-07-16, after it silently tested the wrong branch.

`playwright.config.ts` used to run `npm run dev` on **5173** with `reuseExistingServer: !CI`. Both halves are hazards, and together they are a false all-clear:

- **`reuseExistingServer` reuses ANY server on that port**, and cannot tell whose it is. This repo works out of `.claude/worktrees/`, so several checkouts of different branches exist at once and every one of them runs `npm run dev` on 5173. Phase 3's suite ran green against a **`phase-2-in-call`** dev server that had no `PeoplePanel` in it - the 8 failures were the only reason anyone noticed, and they only failed because the new `?fake_call=` scenarios did not exist over there. Tests that merely *passed* against the wrong tree would have said nothing at all.
- **`npm run dev` without `--strictPort` drifts.** Vite silently takes 5174 when 5173 is busy, so even with reuse off, Playwright would wait on 5173 - somebody else's server - while its own ran unwatched on 5174.

Now: a dedicated **5273** (`E2E_PORT` to override), `--strictPort`, and `reuseExistingServer: false`. The suite always serves the working tree it was launched from, and a squatter on the port is an immediate loud failure (`http://localhost:5273 is already used`) rather than a green run against someone else's code. **Verified by reproducing it**: a vite from the main checkout parked on 5273 now stops the run dead.

The same fix is applied to `playwright.live.config.ts`, which was worse: `reuseExistingServer: true` **even on CI**, on **port 3000** - a port half the world's dev servers claim. It is now 3111 (`LIVE_PORT`), also non-reusing.

**`npm run dev` stays on 5173** and README stays correct. `figma:diff` also stays on 5173 by default, deliberately: it is a manual tool run against a dev server you started yourself, and it takes `DIFF_BASE_URL`.

The cost is a fresh vite per `npm run test:e2e` (a few seconds). That is the price of the suite knowing what it tested.

## The host model - stateless, no database

Vercel functions are stateless and we have **no database. Do not add one.**
Creator-is-host is achieved with a signed grant instead:

1. `POST /api/rooms` creates the VideoSDK room and returns `{ roomId, hostGrant }`.
2. `hostGrant` is **our own** JWT (not VideoSDK's), signed with our secret, containing `roomId` + `role: "host"`, longish expiry.
3. The client stores `hostGrant` in localStorage keyed by roomId.
4. `POST /api/token` mints a VideoSDK meeting token:
   - **With** a valid `hostGrant` for that roomId -> host token (`allow_join` + `allow_mod`).
   - **Without** one -> guest token (`ask_join`).

This survives reloads and needs no room table.
The grant is bearer-shaped: whoever holds it is host.
That is acceptable here and is how session tokens normally work.

Keep the two token types distinct in your head:
- **hostGrant** - ours, proves "you created this room", long-lived, never sent to VideoSDK.
- **meeting token** - VideoSDK's, short-lived, carries the permissions, sent to `MeetingProvider`.

### The host-absent trap - read before touching the lobby

The stateless host model and the "guest stays in the lobby" decision combine into a sharp edge.

**The `hostGrant` lives only in localStorage, keyed by roomId.**
If the creator clears storage, switches browsers, or opens their own link on a phone, they lose host status.
An empty room admits nobody.
**That meeting is then permanently unenterable by anyone, forever.**

This bites the first time someone tests in an incognito window, and it looks like a bug rather than the design.

- **Do not "fix" the lobby by making empty rooms admit people.** Deliberate and user-settled.
- **The `?dev_host=1` escape hatch was cancelled in Phase 3, not forgotten. Do not build it.**
  Seed a host grant instead (below).
- Phase 2's live suite hands **both** browser contexts the creator's host grant, so both mint host tokens. See `tests/e2e-live/README.md`. Phase 3's lobby removes the need for that fudge: the second context can now be a real guest who knocks and is admitted.

#### Why `?dev_host=1` was cancelled - user-settled, 2026-07-15

Earlier revisions of this file and the Phase 3 plan **prescribed** the hatch, gated on `import.meta.env.DEV` plus a build-time grep over `dist/`. Both were wrong, on two counts.

**1. The prescribed gate could not work, and would have been worse than no gate.**
`api/token.ts` decides the role **on the server**, by verifying a signed grant - "a client cannot ask to be host" is the whole point of the model.
So `?dev_host=1` could never be client-only: it needs `api/token.ts` to honour it.
But `import.meta.env.DEV` and `dist/` are **both client-only** - `api/*.ts` are Vercel functions, built separately (zero-config, no `vercel.json`), and `vite build` emits no server code into `dist/`.
The mandated grep would therefore have passed **green** while production shipped a hatch letting anyone append `?dev_host=1` to any meeting URL and mute, remove, or admit at will.
A gate that reports on the wrong half is a false all-clear.

**2. Nothing was actually blocked.**
The premise "or development and Playwright are blocked" is false:

| Path | Blocked without the hatch? |
|---|---|
| Fake Playwright suite | **No.** It never mints a token. There is no lobby to block on. |
| Live Playwright suite | **No.** `tests/e2e-live/call.live.spec.ts` already does `POST /api/rooms` and seeds `meet-clone:host-grant:<roomId>` via `addInitScript`, then asserts `role === 'host'`. |
| Manual dev | **No.** Landing's "New meeting" calls `saveHostGrant` (`Landing.tsx:34`). |

Only one case is genuinely blocked: opening a link you did not create, in a browser holding no grant.

**The answer to that case is to seed the grant**, exactly as the live suite already does - the real code path, no new production surface, no `ALLOW_DEV_HOST` env var to leak, and no `check-dist.ts` to maintain:

```js
// devtools, on the meeting page
localStorage.setItem('meet-clone:host-grant:<roomId>', '<grant from POST /api/rooms>')
```

**The trap itself is real and is unchanged.** A lost grant on an empty room still means a permanently dead meeting. That is the design. This entry only settles that the cure is not a hatch.

## The seam's design rules - read before adding anything to CallClient

Phase 3 added four kinds of thing to the in-call seam at once, and they are not interchangeable.
These rules are why the code is shaped as it is.
**The code carries no comments** (see CLAUDE.md's conventions), so this section is the only record. Keep it current.

### The sorting question

> **"What is this when nothing is happening?"**

If it has an answer, it is state.
Chat's is "the log so far". A raised hand's is "nobody's". **A reaction's is nothing at all.**

That is why reactions are an **event channel** (`subscribeToReactions`) and not a snapshot.
Modelling an occurrence as state forces the store to invent an expiry, which forces a clock into `CallStore`, which makes the seam the owner of animation policy and `prefers-reduced-motion` a store concern.
It would also make the same emoji twice look like one state rather than two occurrences.

### Among the things that are state

| Kind | Where | Examples |
|---|---|---|
| Singular facts about the local participant | `CallState` | `isHost`, `entryDecision`, `micRequest`, `isRecording` |
| Plural, per-participant facts | Own snapshot, **id-split** | roster, pending entries |
| Plural facts every consumer wants all of | Own snapshot, **no id-split** | the chat log |

**Why the chat log is not id-split**, though the roster is: the roster splits because each tile wants exactly one participant and the other 48 are noise. Every consumer of chat wants the whole list, so `getChatIds()` + `getChatMessage(id)` would buy nothing and cost a `useSyncExternalStore` subscription per row. Stable per-message identity plus a memoised row does the same job for free.

**Why the chat log is not in `CallState`**: the same cure as the roster, for the **mirror-image hazard**. The roster is kept out because a mic toggle would re-render all 49 tiles. Chat is kept out because a message would re-render every consumer of connection state and local media. Do not read the roster's rationale and conclude chat has the same problem; it has the opposite one, and that is what decides the id-split question above.

### `useCall` is the wrong hook inside anything rendered once per participant

Fixed 2026-08-17, in `PersonRow`.

The two rules above buy their re-render savings with **narrow selectors**, and `useCall` is the one hook that is not narrow: it subscribes to the whole of `CallState`.
So a component that calls it re-renders whenever any of the 23 fields moves, including `activeSpeakerId`, which moves every time anyone speaks.

`PersonRow` was calling it for two scalars, `localParticipantId` and `isHost`, and `PersonRow` is not memoised.
With the People panel open in a 49-participant room, every active-speaker change re-rendered all 49 rows, plus their four hook subscriptions each, to arrive at exactly the same output.
`PeoplePanel` itself subscribes only to the roster and the raised-hand queue, neither of which moves when someone talks, so the panel was correct and the rows were not.

The fix needed no new machinery: `isHost` was already available narrowly from `useHostControls`, which `PersonRow` also calls, and `useLocalParticipantId` is the same primitive-snapshot shape as `useIsHost`.
Both are `Object.is`-stable, so `useSyncExternalStore` bails out of the render entirely.

**A hook that looks like a one-line duplicate of a `useCall` field is usually the selector that makes 49 of something affordable.** Do not consolidate them away.
`useIsHost`, `useLocalParticipantId` and `useChatUnreadCount` all read as redundant and are not.

### Identity, which is where this design is most dangerous

`CallStore`'s `streamFor` is labelled "the single most dangerous line in this design" because a fresh `MediaStream` per push would spin `useSyncExternalStore` forever. It gets away with keying on the track because **the SDK hands it a stable natural key**.

**PubSub hands us nothing.** The verified message shape is `{ senderId, senderName, message, timestamp, topic, payload }` and carries **no id**. So every chat identity is *synthesised*, and the synthesis inherits that danger.

- **Key on `senderId` + `timestamp` + an occurrence counter, never the array index.** Index keys look correct until `onOldMessagesReceived` lands after live messages have appended: every row renumbers, every object rebuilds, and the panel re-renders wholesale on join. A sender-and-clock key is invariant under backfill.
- **Merge, never replace, and never shrink.** Chat arrives from two sources that disagree about completeness (`messages` and `onOldMessagesReceived`), and which one carries the backfill is not established by the docs. A replacing mutator would make that unknown load-bearing. Chat is append-only, so a keyed union is sound and lets both be wired without deciding which wins.
- **Never sort by `timestamp`.** That field's clock domain (sender-local vs server) is unverified, and a sort over an untrusted clock can reorder the log between two pushes and change array identity for nothing. Concatenate `history ++ (live minus history)`: backfilled messages predate live ones by definition.
- **Unread is a cached scalar**, not a derived filter. A primitive snapshot is `Object.is`-stable, so the badge re-renders only when the number moves.
- **`ChatMessage` carries no `isLocal`,** deliberately. Resolving it at insertion looks tidy and is a latent bug: a message is immutable once built, so a backfill arriving before `localParticipantId` is set would mark your own messages as someone else's **permanently**. The panel already reads `localParticipantId` from `useCall` and compares `senderId` at render, which costs nothing and cannot go stale.

### Hand raise is a log, not a boolean

A raise and a lower are both persisted messages, and **a host can lower someone else's hand**, so the actor (`senderId`) and the subject (`payload.participantId`) are different people. The log is the truth and the answer is a fold over it, done **once at write time in `CallStore`** - never per tile, never per read.

Two consequences that look like bugs and are not:

- **No optimistic local echo.** Your own raise round-trips through the log before the icon appears. An optimistic boolean plus an authoritative log is two sources of truth for one fact, and they will disagree on a reconnect.
- **PubSub carries no authority.** Any client can publish a `lower` for anyone. Hand order is advisory; the real boundary is the VideoSDK token. **Do not add a client-side `allow_mod` check** - it would read as security and not be any.

`handRaised` is folded into the per-participant snapshot so a tile re-renders when its own hand moves and never otherwise. The ordered queue (`getRaisedHands`) is for the panel and the bar, which genuinely want the order.

**This is the one real refactor in the phase.** `setParticipantFacts` built a participant wholly from one push; `handRaised` arrives from a different bridge, so one identity now has two transports feeding it and they funnel through a single `applyParticipant`. Keep `handRaised` out of `ParticipantFacts`: that type is the transports' input, and the participant bridge knows nothing about hands.

### Lobby knocks, and the lifetime nobody gives us

`allow`/`deny` arrive as **closures on the `onEntryRequested` event** and are not addressable afterwards, so they are held in a private map keyed by participantId, exactly like `participantHandles`. `PendingEntry` deliberately does not carry them: the snapshot's identity would become the closures' identity, and a re-delivered knock would re-render a card that had not changed.

The hard part has no precedent to copy. `participantHandles` is evicted when a bridge unmounts, which is a real signal. **A knock has no such signal, and VideoSDK documents no `onEntryRequestCancelled`.** So:

- **Do not optimistically clear the card on `admitParticipant()`.** Clear it when the admitted id **arrives in the roster**, which `CallStore` already owns both sides of. This gets a real race right for free: `allow()` fired at a guest who already left produces no arrival, so the card correctly stays rather than vanishing into a lie.
- **`denyParticipant()` clears immediately.** Deny has no arrival to wait for, and the host's own click is the signal.
- **Staleness is the view's job, not the store's.** The store records `requestedAt`; the panel forgets. This keeps the clock at the edge, consistent with reactions, and means no `setTimeout` and no injectable clock in `CallStore`.
- Wrap `allow()`/`deny()` in try/catch and swallow. Firing at a departed guest is at worst a no-op, and there is nothing the host could do about it.

### The guest's lobby timeout is 60s, it lives in the view, and it is NOT terminal

Built 2026-07-16, completing the host-absent decision above, which specified the copy "Nobody responded to your request" and had never rendered it anywhere.

**The clock is at the edge, as the staleness rule above requires.** It is a `setTimeout` in `LobbyWaiting`, the view, and `CallStore` is untouched. The guest's side needed no store change at all: the host's card has a `requestedAt` because the store owns the knock, but the guest's wait begins when its own screen mounts, so the view already holds the only clock anyone needs.

**60 seconds, and the number is a judgement call the user should feel free to overrule.**
Real Meet supplies nothing to copy, and that was checked rather than assumed: Google's own known-issues page says the Ask-to-join page **"will stall"** when the creator is absent, and Recall.ai ships its **own** 20-minute waiting-room timeout for Meet bots - which is evidence that Meet exposes no timeout of its own to rely on. So there is no product behaviour to match here, only a defensible choice.
The reasoning: a host who has not reacted to a knock within a minute is probably not going to, and a minute is about as long as anyone will stare at an unchanging screen before assuming it is broken. Meet's nearest own timers sit in the same range (2 minutes to answer its "still there?" prompt).

**Being non-terminal is what makes 60s safe, and it is the whole design.** The timeout only swaps the sentence. It does not leave, does not disconnect, and does not stop listening: `onEntryResponded` is still wired, so a host who admits at 3 minutes still lets the guest straight in. **Verified live at the shipped 60s**, host admitting long after the screen had changed. So the failure mode of picking too short a number is a slightly premature sentence, not a lost meeting. Had the screen been terminal, 60s would have been far too aggressive.
This is also why the copy is "You'll **still** join the call if someone lets you in" rather than Meet's dead-end wording: it describes what our screen actually does. Same rule as the chat panel's notice.

**One timeout covers both "no host" and "silent host" because the guest cannot tell them apart.** Not a shortcut - the SDK tells a waiting guest nothing whatsoever, and it has no roster. See VIDEOSDK.md's Lobby section. Host-left-before-responding is therefore the identical code path and needed no code: **verified live** by closing the host's tab on a live knock, and the guest timed out exactly as the silent-host case did.

**Do not "fix" this by disconnecting the guest at the timeout**, and do not move the timer into `CallStore`.

### Icon weight is 600, and the axis is `wght` - not `FILL`

Settled 2026-07-16, against a report that "the Figma's icons are bold/filled and ours are light/thin".
Half right: ours **were** too light, but nothing in the Figma is filled.

**The mechanism is not a font.** There is no variable font and no `font-variation-settings` to reach for.
`scripts/icons-build.ts` copies committed path data out of `@material-symbols/svg-<weight>/outlined` into `src/design/primitives/icon-paths.ts`, from an explicit allowlist.
So the weight axis **is the npm package name**, and the whole fix is that one `SOURCE` line plus a regenerate. No call site changes, and `Icon.tsx` does not either.

**`FILL` is 0 and must stay 0.** At a glance the Figma's `group`, `back_hand` and `call_end` read as solid, and that is what "filled" in the report meant. Enlarged from the 2x renders they are plainly outlined - `group` has a hollow ring head and an open body. A filled set would be a confident, wrong answer to a real problem.

**Weight 600 is measured, not chosen.** Ink (summed alpha-weighted luminance over a 56px window on the 2x `Meeting` render) against each candidate weight rendered at the same size and colour:

| Icon | Figma | w400 (what we shipped) | w500 | **w600** | w700 |
|---|---|---|---|---|---|
| `info` | 509 | 390 | 436 | **520** | 621 |
| `chat` | 787 | 605 | 651 | **743** | 847 |
| `lock_person` | 661 | 544 | 595 | **652** | 735 |

Our app's ink matched w400 **exactly** (390/605/544), which is what confirmed the diagnosis rather than merely fitting it.
The precall's 18px pills agree independently: `mic` reads Figma 129 vs w600 126, in `#5f6368` at 36 device px.

**Do not settle this with glyph bounding boxes.** DESIGN.md's `VECTOR` sizes (`mic` 11x14 in an 18x18 box) are rounded to whole px, and outlined and filled share a bbox exactly. Every weight from 400 to 600 "matches" inside that rounding, and an early pass was misled into 500 by it. Ink discriminates; bbox does not.

**`figma:diff` cannot see this change and is not evidence either way.** precall 1.68% -> 1.68%, chat 7.13% -> 7.12%, people 7.62% -> 7.61%. Icons are a rounding error on a 1728x1117 frame whose diff is dominated by the accepted deviations above. This is exactly the case the harness's own "read the diff image, not the number" warning is about - a real, verified fidelity fix that moves the number by 0.01%.

### Icons never shrink: `flex-shrink: 0` on the Icon primitive

Found while measuring the above, and a separate defect.
`Menu`'s trigger is a 220px-max `inline-flex` row, and an `<svg>` there takes the default `flex-shrink: 1`, so a device name longer than the Figma's ("MacBook Pro Microph..." vs "Microphone (...") squeezed the **icon** rather than only the label.
The precall mic rendered **16.9x18** instead of 18x18 - a 6% horizontal squash, which read as "thin" and partly masked the weight bug behind it.

Fixed in `Icon.module.css`, on the primitive, not at the call site: an icon is a fixed-size glyph everywhere in the app, and there is no surface where squashing one is right. Without it the weight fix still under-reads at 18px (mic 112 vs Figma 129); with both, 126 vs 129.

### The tile fills its cell. It is not locked to 840:502

Phase 2 gave `.tile` `width: min(100cqw, 100cqh * 840/502)` plus `aspect-ratio: 840/502`, and `stageLayout.ts` carried `TILE_RATIO_WIDTH/HEIGHT` saying the ratio "wins over the ratio a camera happens to publish".

**That was unfalsifiable at the time and it turned out to be wrong.** It was derived from the base `Meeting` frame, where the cell *is* 840x502 - so "lock the aspect" and "fill the cell" predict the identical pixel and nothing could tell them apart. `Meeting` was never in `figma-diff`'s `SCREENS`, so nothing ever tested it either.

Phase 3's Chat and People frames are the first states where the two predictions differ, and they disagree with the lock:

| Frame | Cell | Tile the frame draws | The lock predicts |
|---|---|---|---|
| `Meeting` | 840x502 | 840x502 | 840x502 (agrees) |
| `Meeting / Chat` | 652x502 | **652x502** | 652x390 (letterboxed) |

The tile keeps its height and narrows. So the tile fills its cell, video cover-cropped, and 840:502 was only ever the cell's ratio at 2x2 on a 1696 stage.

`height: min(100cqh, 100cqw * 502 / 652)` rather than a plain `height: 100%`, and the bound is measured rather than taste. Pure fill matches both frames but sends the **two-person** case - one row, cell 840x1021 - to a 840x1021 portrait tile. Two people is the commonest call there is and has no frame, so extrapolating "always fill" from a 1.30 cell to a 0.82 one is not supported by anything. 652:502 is the tallest ratio the design actually demonstrates, so it is the floor. Both frames still match exactly; two people get 840x647 instead of a portrait slab.

`TILE_RATIO_WIDTH/HEIGHT` are **deleted**, not corrected. Nothing imported them - CSS cannot - so they were documentation wearing a constant's clothes, and they now asserted something the frames disprove.

The `900px` breakpoint now also has a **JS copy**, in `src/design/useMediaQuery.ts` (`MOBILE_MAX_WIDTH = 900`, `useIsMobile()`): the mobile "More options" bottom sheet is a different DOM structure and a focus-trapping modal, not a restyle, so `ControlBarOptionsMenu` must branch in React and CSS cannot import the number. The two copies are kept equal by hand - change both together.

The `652:502` floor is a **desktop** floor, and it stays one. On mobile (`<= 900px`, the project's established breakpoint) the tile drops the floor and fills its cell outright - `height: 100cqh` overriding the `min(...)`, video still cover-cropped. The reason the two surfaces diverge is that they are sourced differently: the floor exists to stop the commonest **desktop** case (two people, a 0.82 cell) collapsing into a portrait slab, and it is measured off the desktop Figma. Mobile has no Figma frame - it is live-Meet-sourced, like the landing page (see the Responsive and Undesigned-surfaces rows) - and real Meet mobile web fills the viewport with portrait tiles rather than floating short landscape boxes in tall cells. A `min(100cqh, 100cqw * 502 / 652)` tile on a tall, narrow mobile cell takes only its width-derived height and the cell's `place-items: center` leaves a dead band through the middle, which is a desktop floor leaking onto a surface it was never measured for. So the override is mobile-scoped and the desktop floor is untouched: at 2/3/4 people on a 1440 or 1728 stage the tiles are pixel-identical to before, and on mobile 2 stacks as two full tiles, 4 fills a 2x2, 9 a 3x3, with the camera-off avatar still centred by `.cameraOff`.

### `isHost` is known at construction, and the fake must agree

`VideoSdkCallClient` patches `isHost` in its **constructor**, from the `role` that `/api/token` returned before anyone joined. So host-ness is known at t=0, *before* `connecting`, and it never arrives late.

`FakeCallClient` originally set it only in `publishAll()`, which runs on `connected`. That is a **fidelity bug, not a shortcut**, and it is the kind that makes a fake lie in the one direction nobody checks: `isHost` was false for the whole of `connecting` in the fake and true from the start in the real client.

It surfaced immediately. The lobby's "Asking to be let in" screen is derived from `connection` + `isHost` + `entryDecision`, because nothing announces it, and against the fake that derivation fired **for the host too** - `Room.test.tsx` caught it. Against the real client it would never have reproduced, so the bug would have been "fixed" by weakening the derivation until the test passed.

The fake now patches `isHost` in its constructor. **Do not move it back into `publishAll`.** A fake whose timing differs from the client it stands in for is worse than no fake: it fails the things that work and passes the things that do not.

### No fake can prove a bridge. Only a live room can

`FakeCallClient.simulateEntryResponded()` calls `patchState({ entryDecision })` directly, so it enters *below* `VideoSdkCallHost`.
That is correct - the fake stands in for the SDK, and the bridge is the thing that talks to the SDK - but it has a consequence worth naming, because it cost this project the denied-guest bug for a whole phase:

**Every fake test of the lobby passed while no denied guest was ever told anything.**
The bug was in `onEntryResponded`'s argument shape, which lives in the bridge, which the fake path never executes.
A green fake suite says the store and the view are right. It says **nothing** about whether the SDK's events are being read correctly, and it cannot.

So when a bridge handler is wrong, the fake suite is not merely silent: it is *reassuring*.
**Anything whose only job is to translate the SDK needs a live room, or it needs to be read out of the bundle.**
Both were done here. Neither is optional.

### Captions are an event stream, and there are two things called "captions on"

Built 2026-07-20. VideoSDK's `startTranscription` is meeting-wide - one call transcribes the whole room server-side, and every client receives `onTranscriptionText` - but Meet's caption toggle is per-viewer local. Getting this backwards would either start transcription over and over as each viewer toggled, or make one person's toggle turn captions on for everyone.

So the concept is split in two, the same way reactions and the chat log are split:

- **A caption line answers "nothing" when nothing is being said.** Same test as a reaction. So it is an event stream (`subscribeToCaptions`), not a snapshot, and `CallStore` holds no caption history.
- **"Is server transcription running?" answers "idle" when nobody has started it.** That is state, and it is meeting-wide, so it lives in `CallState.transcription`, mirroring `RecordingState` exactly.
- **"Am I showing captions?" is neither.** It is a **local view preference**, at the same altitude as `panel` and `layout` in `Call.tsx` - never in `CallState`, never shared, never the SDK's business.

The rolling window - one active line per speaker, upsert on each new caption, expire after a few seconds, cap the visible count - is the view's job, not the store's, for the same clock-at-the-edge reason reactions and lobby staleness are: putting a timer in `CallStore` would make the seam own animation policy.

`captionSeq` lives on the concrete subclasses (`VideoSdkCallClient`, `FakeCallClient`), not on `CallStore`, exactly where `reactionSeq` already lives - the store owns identity, not the identity's inputs.

**There is no `stopCaptions`.** Turning your own overlay off only hides it locally; the server keeps transcribing for whoever still has it on, and `leave()`/`end()` are what stop it happening at all. Same minimalism as "no `unmuteParticipant`" and "`startRecording()` takes no args": nothing in the product calls a stop, so the seam does not grow one.

**The toggle auto-starts transcription.** The first viewer to turn their overlay on calls `startCaptions()`, which is a no-op if `transcription` is already anything but `'idle'` - so a second viewer flipping their own toggle later does not double-start it. This costs real VideoSDK minutes for the rest of the session once anyone has turned captions on, which is accepted per the local-view-plus-auto-start decision above.

**The transcription status strings are unverified**, exactly like recording's. `transcriptionStateFromSdk` returns null for anything it does not recognise rather than guessing, so an unrecognised status leaves `transcription` wherever it was instead of lighting a false "transcribing". Confirm the real `TRANSCRIPTION_STARTING`/`STARTED`/`STOPPING`/`STOPPED` strings in a live room - see the plan's open risks, and "No fake can prove a bridge" above: the fake path proves the store and the overlay, and says nothing about whether `TranscriptionBridge` reads the SDK's real event shapes correctly.

### Rename `enableMic` at the seam

The SDK's `useParticipant(id).enableMic()` **does not enable anything: it asks**, firing `onMicRequested` on the target. That name will cause a privacy bug the first time someone reads it at speed, so the seam exposes it as `requestParticipantMic()`. This is the same job `connectionStateFromSdk` does for a wrong union, and it is why the seam exists.

**There is deliberately no `unmuteParticipant`.** Hosts can mute but cannot force-unmute. The absence of the method is what makes the bug unwritable; the mandated e2e is the runtime half. Do not add one.

**`muteAll()` stays out of the seam.** It is a loop over `getParticipantIds` + `muteParticipant`, both of which the feature already has, and "skip yourself, skip the already-muted" is a product decision. A seam that grows a method which is a loop over its own methods has started absorbing the feature.

### `startRecording()` takes no arguments

Against the SDK's `startRecording(webhookUrl, awsDirPath, config, transcription)`. None of those four is a decision a component gets to make: the webhook is deployment config, `awsDirPath` is null because the file lands in the VideoSDK dashboard by decision, and `transcription` is dropped with captions. The seam's job is to not hand a component four levers it has no basis to pull.

### `.menuList` is sized for rows of text. The reactions grid opts out

Fixed 2026-07-16. The reactions popup was 260px wide around a 188px grid, leaving 72px of dead space on its right edge and 8px of padding on the left against 80px on the right.

**The cause was a shared default, not the picker's own CSS.** `.menuList` carries `min-width: 260px` and `padding: 8px 0`, and both are right for what it was written for: every other control-bar menu is rows of text (`.menuItem`, which brings its own `10px 16px`), where a minimum width stops a one-word label rendering a sliver of a popup, and the block padding is the gap above the first row. A grid of 8 emoji at `repeat(4, 40px)` + `gap: 4px` + `padding: 8px` is **intrinsically 188px** and needs neither: it sizes itself, and it owns its own padding on all four sides. Inheriting them gave it a width it does not fill and doubled its block padding to 16px against 8px inline.

So `ControlBarMenu` grows a `menuClassName`, mirroring the `triggerClassName` it already has, and `.menuReactions` zeroes both. **The fix is the absence of the inherited rules, not a width.** A hardcoded `width: 188px` on the popup, or a negative margin, would have produced the same pixel today and gone wrong the first time `REACTION_EMOJI` changes length - the grid already derives that number and is the only thing that should.

**The picker has no Figma geometry and never did.** The file draws the bar with every menu closed: the only reactions node in it is the closed `Reaction` trigger (56x48, holding the `mood` icon). There are no emoji anywhere in the file, so **the 8 in `REACTION_EMOJI` are not a Figma count** and this was not a missing-emoji bug. The set is the wire contract (see `pubsubTopics.ts`) and is live-sourced under the Undesigned surfaces decision. Real Meet ships a different set and a 1x9 row; **if that is ever matched, change `REACTION_EMOJI` and the column count, and the panel will resize itself.**

### Both mobile-bar hiding rules are direct-child `:has`, and the aria-disabled one now proves it

Fixed 2026-08-17.

The phone bar hides two sets of controls: the ones that do not work yet, matched on `aria-disabled` so each returns on its own when it becomes real, and Reactions, Raise hand and Captions, matched by name because they do work and there is simply no room.
The by-name rule was already written as a direct-child `:has`, with a comment explaining why: the mobile options sheet renders **inside** the options menu's wrapper, which is itself a direct child of `.groupCentre`, and the sheet re-hosts `control-raise-hand` and `control-captions`, so a descendant `:has` would match that wrapper and hide the whole sheet.

The `aria-disabled` rule above it was a descendant `:has` and had the same bug waiting in it.
It currently matches nothing at all, because the only `aria-disabled` control on the bar is the non-host `control-host-controls`, which lives in `.groupRight` and is hidden wholesale on a phone.
So the rule protects nothing today and would have hidden the three-dot control the first time any **sheet row** carried `aria-disabled` - and `MobileOptionsSheet`'s recording row is exactly that row, one `aria-disabled` away, on a surface no test covers.
A control that vanishes for the second or two a recording takes to start, and cannot be reopened, is a bad way to find this out.

Narrowed rather than deleted: the mechanism is still the right one if anything in `.groupCentre` is ever legitimately disabled, and narrowing changes no pixel today.
**Rows in the sheet use the real `disabled` attribute, not `aria-disabled`.** The bar's own controls use `aria-disabled` because a disabled button cannot be focused and its tooltip would be unreachable. Do not unify those two idioms without re-reading this entry.

**The by-name half of that rule is now a marker class, `.barOptional`, and not a `data-testid` selector.** Production layout must not depend on test attributes: a testid rename is meant to be free, and while the rule read `[data-testid='control-captions']` it silently was not.
The class is applied to the **button** for Captions and Raise hand, because `Tooltip` owns its own wrapper span and takes no `className`, and to the **anchor** for Reactions, because `ControlBarMenu` renders `div.menuAnchor > button` and now accepts an `anchorClassName` (mirroring the `triggerClassName`/`menuClassName` precedent).
That is why the rule is a **pair** of selectors, `> .barOptional` and `> *:has(> .barOptional)`, and why both keep the direct-child combinator: the sheet still renders inside the options menu's wrapper, so a descendant match would hide the whole sheet.

### The in-call action list is ONE keyed record, rendered three ways

Built 2026-08-17.
Before this, `DesktopOptionsMenu` and `MobileOptionsSheet` hand-rendered overlapping action lists with **11 duplicated entries**, and they had drifted: the sheet's layout and raise-hand rows did not dismiss the sheet, its People and Chat rows opened a panel but could not close one, and the recording-busy expression was written out at both sites.
Six props also travelled `Call` -> `ControlBar` -> `ControlBarOptionsMenu`, and **four of them were dropped on the desktop branch**, which is a signature of a prop that has no business being a prop.

`src/routes/Call/callActions.ts` now owns each action once, and `src/routes/Call/CallUiContext.ts` carries the four view preferences (`layout`, `panel`, `captionsOn` and their setters) past the bar. The state itself stays in `Call.tsx`, where the panel slot is pinned (see "One stable slot in `Call.tsx`").

**`useCallActions` is called ONCE, in `ControlBar`, and the record is passed down.** It reads nine hooks; calling it in three components would triple those subscriptions for one answer.

**The record is KEYED (`{ [id]: CallAction | null }`), never an ordered list.** Each surface owns its order as a literal, because the order of rows is that surface's own design fact and they are sourced differently: the desktop popup and the sheet are live-sourced from Meet separately, the bar is Figma. A shared ordered list would force one surface's order onto the other and there would be no honest place to record why.

**`activate()` never calls `close()`.** The container closes itself iff `action.dismisses`. That single rule is what fixed the sheet's drift, and it keeps dismissal a property of the action rather than of nine call sites.

| Action | `dismisses` | Why |
|---|---|---|
| layout, fullscreen, whiteboard, recording, mute-everyone, people, chat | **true** | Each one changes something behind the surface you are standing on, so staying is staying in the way. |
| raise-hand, captions | **false** | In-place toggles whose new state the row itself shows. Closing would hide the only feedback the tap produced. |

**There is no ARIA in the type, deliberately.** `role="menuitemradio"` is only legal inside `role="menu"`, and the sheet is a `dialog`, so it uses `role="radio"` in a `radiogroup`. The current divergence is correct rather than an inconsistency, so each renderer maps `kind` to its own ARIA: `MenuRow` owns menuitem/menuitemradio, `SheetRow` owns `role="radio"` and `aria-pressed`, `BarAction` owns `aria-pressed` plus the tooltip.
Each renderer therefore lives in **its container's own file**, next to the stylesheet it uses. One shared renderer would have to import two stylesheets and would be the place every future divergence gets a boolean prop.

**Host gating is ABSENCE, not disablement.** `recording` and `mute-everyone` are `null` for a guest, and `fullscreen` is `null` when the browser has no `requestFullscreen`. Consumers skip nulls. A greyed-out host row would put a control that does nothing inside the menu the bar's own no-dead-controls rule exists to protect.

**`disabled` carries its reason or is null, and the recording-busy expression is computed once.** `recordingState === 'starting' || 'stopping'` becomes `disabled: { reason: 'Recording is changing' }` in one place.

**Rows use the real `disabled` attribute; the bar's own controls keep `aria-disabled`.** Both halves matter, for the reason in the entry directly above: `ControlBar.module.css` hides `.groupCentre > *:has(> [aria-disabled='true'])`, so an `aria-disabled` sheet row would take the three-dot control with it, while a truly `disabled` bar button could not be focused and its tooltip would be unreachable.

**`.menuItemDivided` is derived from position in the RENDERED array**, not hardcoded per row. With host gating expressed as `null`, a hardcoded divider would leave a leading rule above the first row, or none between two rows, the moment an action disappeared.

**Reactions and joining info are NOT actions, and must not become a `kind`.** The reactions grid deliberately opts out of the row rules `.menuList` supplies (see "`.menuList` is sized for rows of text"), and routing it through a generic row re-inherits exactly what that entry removed. `ReactionsPicker` and the sheet's own `reactionsRow` stay as they are, and joining info is already shared through `MeetingDetails.tsx`.

#### The test ids, and the strict-mode duplicate they prevent

`control-captions`, `control-people` and `control-chat` are asserted by `tests/e2e` and survive verbatim on the **bar's own** controls. The last two used to be *generated* from the label by `PanelButton` and are now literal strings, which is a thing worth knowing before renaming a label.

**Every sheet row is prefixed `sheet-`**: `sheet-raise-hand`, `sheet-captions`, `sheet-people`, `sheet-chat`, `sheet-layout-tiled|spotlight|sidebar`, `sheet-fullscreen`, `sheet-whiteboard`, `sheet-recording`, `sheet-mute-all`, and the badges `sheet-people-count` / `sheet-chat-unread`.
Before this, the bar and the sheet rendered `control-raise-hand`, `control-captions`, `toggle-whiteboard`, `host-toggle-recording`, `layout-*`, `people-count` and `chat-unread` **into one DOM**: the bar's centre group is only `display: none` on a phone and stays mounted, so `getByTestId('people-count')` with the sheet open was a Playwright strict-mode violation waiting for its first test.
The desktop popup keeps its own ids (`control-options`, `option-fullscreen`, `toggle-whiteboard`, `host-toggle-recording`, `layout-*`, and `host-mute-all` in `HostControlsMenu`).

#### Two intended mobile behaviour changes

- **Layout rows now dismiss the sheet.** Choosing a layout you cannot see is the whole point of the row.
- **People and Chat now toggle rather than always open.** The desktop buttons always did; the sheet's rows called `setPanel('people')` unconditionally. One action, one behaviour.

#### Rescued reasoning, previously in the JSDoc of the deleted components

- **Figma `Options` is 36x48 (`more_vert`) and the menu it opens has no Figma frame.** Meet's real overflow menu carries whiteboard, recording, layout, effects and settings. Effects and settings belong to milestones that have not landed, and listing them greyed out would put the bar's own rule - no control ships that does not do what it says - inside the menu that rule is meant to protect. So it opens with only what genuinely works, and it is built to grow.
- **Meet puts layout behind a "Change layout" dialog; ours are `menuitemradio`s.** A dialog would be a second undesigned surface to invent, and the choice is one of a set, which is what the bar's device pickers already say this way. **"Layout" is what our menu labels that group**, and the landing carousel's copy depends on it (see the landing-copy entry in Settled questions). Do not relabel the group without changing that slide.
- **Mute everyone stays out of the seam.** It is a loop over `getParticipantIds` + `muteParticipant`, and "skip yourself, skip the already-muted" is a product decision. A seam that grows a method which is a loop over its own methods has started absorbing the feature. It lives in `hostActions.ts` and reaches both surfaces as the `mute-everyone` action.
- **`HostControlsMenu` is gated on our OWN host-ness, which is real**: the server decides it and `/api/token` returns it. We never decode the JWT. This is a UI affordance gate and not an authorisation check; the authority is the VideoSDK token and VideoSDK enforces it. Its non-host branch is still the `aria-disabled` Tooltip button, unchanged.
- **The People count is real even though nothing else on that button was.** A hardcoded "3" would be the one genuinely dishonest pixel on the bar: it states a fact about who is in the call.
- **The Chat badge is absent at zero rather than showing a "0"**, and the "suppress it while the Chat panel is open" rule now lives in exactly one place, on the `chat` action.
- **The host menu's Mute everyone row stays icon-free**, which is why `MenuRow` takes `showIcon`. Rendering it like every other popup row would have added a `lock_person` glyph and the `.menuItemIcon` padding with it, and this refactor moves no pixels: the host menu is a live-sourced surface with no Figma frame, so giving it an icon is a design change and belongs in a screenshot review rather than inside a refactor. That the popup's rows all have icons and this one does not is a real inconsistency, and it was already there.

## Motion - read before touching an animation

Built 2026-07-17.
**The code carries no comments** (see CLAUDE.md's conventions), so this section is the only record. Keep it current.

The vocabulary: panels push the stage open and closed, popups scale from their anchor, buttons answer a press.
Everything collapses to near-zero under `prefers-reduced-motion`.

### The tokens live in `src/design/motion.css`, NOT `tokens.css`

`tokens.css` is generated from the Figma and is overwritten by `npm run tokens:build`.
The Figma carries no motion variables, so motion needs a hand-owned home.
`motion.css` is imported by `global.css` immediately after `tokens.css`.

Four durations: `--motion-duration-press` (100ms), `--motion-duration-enter` (200ms), `--motion-duration-exit` (150ms), `--motion-duration-tint` (150ms).
Three easings: `--motion-ease-standard`, `-decelerate` (enter), `-accelerate` (exit).

**`--motion-duration-tint` is a fourth name on purpose.**
A hover tint is neither an enter, an exit, nor a press, and `Button`, `IconButton` and `.pin` were all already on a hardcoded `0.15s`.
Folding them into `-enter` would have silently slowed every hover in the app by a third; folding them into `-press` would have sped them up.
The fourth name preserves the existing feel exactly and still obeys the invariant below.

### The token invariant: finite and cleanup-bearing only. NOTHING LOOPING may reference these

This is the sharpest edge in the whole area.

Reduced motion collapses every duration token to `1ms`, globally.
A looping animation that read a duration token would therefore run at **1ms per iteration under reduced motion**: `Spinner`'s `0.8s ... infinite` would become a 60,000rpm strobe, which is the exact harm `prefers-reduced-motion` exists to prevent.

So the names are deliberately **not** `-short`/`-long`, which would read as general-purpose and invite exactly that.
`-press`/`-enter`/`-exit`/`-tint` name a *lifecycle*, and a looping animation has none.

**Left alone on purpose**: `Spinner.module.css` (deliberately 2.4s under reduced motion, its own rationale) and `TileReactions.module.css:89` (hardcoded 2.4s).
Neither may be migrated onto the tokens.

### Reduced motion is a global collapse PLUS stated exceptions

Not "handled once, globally", which is what the plan originally said and is not quite true.

The collapse to `1ms` is global, in `motion.css`.
The one stated exception is the **press**, which is overridden locally to `transform: none` in `Button.module.css`, `IconButton.module.css` and `ControlBar.module.css`.
Nothing depends on the press's end event, so a reduced-motion user should get no movement at all rather than a 1ms movement.

### `1ms`, never `0`, and never `animation: none`

Generalised from `TileReactions.module.css:89-100`, which discovered it first.

**Cleanup depends on an animation finishing, and an animation that never runs never finishes.**
`animation: none` under reduced motion would leave every panel and every menu mounted forever, and every reaction emoji stuck on its tile.
Collapsing the duration keeps the single code path that owns each element's lifetime alive for everyone.

Verified in a real browser at `reducedMotion: 'reduce'`: all four tokens read `1ms`, the panel unmounts, menus unmount, and no reaction emoji is left on screen.

### The presence hook uses `getAnimations()`, not `onAnimationEnd`

`src/design/usePresence.ts` keeps a node mounted past the state flip, then unmounts when the element's own animations finish.

**`onAnimationEnd` could not have driven this.**
`src/design/primitives/Menu.test.tsx` asserts `queryByRole('menu')` is absent immediately after a close, in three places (lines 52, 61, 71), plus an initial-state assertion at line 25.
Tests run in jsdom, which **fires no animation events**, so an `onAnimationEnd`-driven unmount would leave the menu mounted forever and break all of them.

jsdom implements **no `getAnimations` at all** (verified against jsdom 29.1.1: no match anywhere in `node_modules/jsdom/lib`).
So `node.getAnimations?.() ?? []` is empty under test and the hook unmounts synchronously.
The existing tests pass untouched, and there is **no test-only branch in production code**.

It also kills a real bug that `onAnimationEnd` would have had: animation events **bubble**, and `PersonRow.tsx:67-75` mounts a `ControlBarMenu` *inside* `PeoplePanel`, which is inside the panel slot.
A menu's animation ending inside the panel would have bubbled to the panel and unmounted it.
`getAnimations()` is element-scoped, so the question never arises.

Interruption is handled for free: a cancelled animation rejects `.finished`, and `allSettled` absorbs it.
The live value is re-read from a ref inside the `.then`, so an open -> close -> open cannot unmount a panel that has since re-opened.

### `getAnimations()` is called WITHOUT `{ subtree: true }`

A subtree query would await **descendant** animations.
Two of those are fatal:

- A `Spinner` inside a panel loops forever, so its `.finished` never resolves and the panel would never unmount.
- The reactions picker staggers 8 emoji. Measured live: the popup's own `getAnimations()` returns **1**, and `getAnimations({ subtree: true })` returns **9**.

The element's own animation is the only one that describes the element's own lifetime.

### The desktop push is a negative margin, not a width

Animating `width`/`flex-basis` would squash the panel's own 360px contents every frame, reflowing its text mid-slide.

`margin-right` runs from `-360px` to `16px`, so the panel occupies zero width at the start (`360 + -360 = 0`) while its contents stay laid out at 360 and never reflow.
The stage's `flex: 1` absorbs the room.

`width: 360px` on `.panel` was already dead weight under `flex: 0 0 360px`, which is exactly why animating `width` would have silently done nothing.

`.body` needs `overflow: hidden` to clip the off-screen panel.
**Both axes, never `overflow-x`**: a lone `overflow-x` computes `overflow-y: auto` and creates the scroll container that `min-height: 0` exists to prevent.
Verified at 412px: `scrollWidth === clientWidth`, no horizontal scrollbar.

### One stable slot in `Call.tsx`. A kind-to-kind swap deliberately does NOT animate

`ChatPanel` and `PeoplePanel` are distinct component types, so React tears the subtree down on a swap.
Naive per-panel presence would leave the outgoing panel mounted while the incoming one entered: **two 360px panels at once**, squashing the stage.

So placement and motion live on a single slot in `Call.tsx`, and `Panel.module.css` keeps only chrome.
`usePresence` returns a **lagging kind**, not a boolean:

- `null -> kind`: mount, enter.
- `kind -> other kind`: swap contents instantly. The panel is already open, and re-sliding it is the exact glitch this work exists to remove. This is what Meet does.
- `kind -> null`: hold the last kind until the exit finishes, then unmount.

Verified live: through a Chat -> People swap the DOM holds **1 slot and 1 panel** throughout, `margin-right` stays at `16px`, and the slot reports **0 animations**.

The geometry survived the move intact: at 1728x1117 the panel measures **360x1021 at (1352, 16)** and the grid's content box is **1320** wide, which is exactly what the Chat and People frames draw.

### The panel uses `transition` + `@starting-style`. The menus use keyframes

A deliberate split, not an inconsistency.

**`transition` for the panel, because only a transition interpolates from the current value.**
Keyframes replay from their `from`, so closing and re-opening mid-slide would snap the panel to fully off-screen and re-slide it, a 360px jump.
Verified live: re-opening mid-exit resumed from `margin-right: -127px` rather than jumping.

**This is safe under the jsdom constraint only because `Element.getAnimations()` returns `CSSTransition` objects as well as `CSSAnimation` objects.**
That is the non-obvious fact the whole mixed approach rests on.
jsdom has neither, so the synchronous-unmount path is identical either way.

**Keyframes for the menus, because the reactions stagger needs `animation-delay`, which a transition cannot express.**
A 40px popup replaying on an interrupt is imperceptible, so the panel's reason to prefer a transition does not apply.

`@starting-style` needs Chrome 117+ / Safari 17.5+ / Firefox 129+.

### `transform-origin` is composed from two custom properties

```css
.menuList { transform-origin: var(--origin-x, left) var(--origin-y, bottom); }
.menuList[data-direction='down'] { --origin-y: top; }
.menuList[data-align='end']      { --origin-x: right; }
```

Two plain rules each setting the whole `transform-origin` shorthand would **stomp each other**, and `down` + `end` is live: `PersonRow.tsx:67-75` uses exactly that combination.
Verified live: it computes `260px 0px` on a 254px-wide box, which is top right.

`ControlBar.module.css` used to re-anchor the Options menu on mobile with `:has(.controlNarrow) .menuList { right: 0 }`, and that rule set `--origin-x: right` itself so the origin did not desync from the box. That rule is **gone**: on mobile the three-dot no longer opens a `.menuList` at all - it opens the bottom sheet (`MobileOptionsSheet`), so there is no popup left to re-anchor. The `data-align`/`data-direction` origin composition above still governs the desktop popup and the People-row menus, which is where it stays live.

### The press guard is two different idioms, on purpose

- **ControlBar**: `:not([aria-disabled='true'])`. That file documents at `:296-303` that it uses `aria-disabled` and never `:disabled`, because a disabled button cannot be focused and its tooltip would be unreachable. `:not(:disabled)` would therefore always match and would visibly press a control sitting at `opacity: 0.38`. Verified live: `control-captions` and `control-activities` do not press.
- **Button/IconButton**: `:not(:disabled)`, which is what those primitives actually use.

**There is no `filter` in the press.**
It does not compose: with a mouse you are always hovering while pressing, so a press filter would *replace* `ControlBar.module.css:285`'s `brightness(1.35)` and flicker, and any value tuned for the mouse reads wrong on the keyboard Space path where there is no hover.
The scale carries the press.

`Button` is scale-only with no colour change: `--color-accent-pressed` was already spent on **hover** at `Button.module.css:53`, so there is no pressed colour left, and inventing one would violate that file's own "every value via a token" header.

Menu rows get a tint and no scale, because a scaling list row looks wrong.
The tint values are `rgb()` alphas over a surface rather than tokens, which is the idiom this codebase already uses for state tints with no Figma variable (`ControlBar.module.css`'s `.reaction:hover`, `Panel.module.css`'s `.close:hover`, `IconButton.module.css:52-57`).

The `.badge` inside `.plain` scales with its parent, which is correct: measured 16px at rest and 15.36px pressed, exactly 16 x 0.96.

### `usePortrait` follows the SETTLED stage, not every frame

`TileGrid.tsx`'s `usePortrait` debounces its ResizeObserver by `SETTLE_MS` (100ms) before committing.

**This is not a nicety.**
A change of column count re-keys every row (`row.join('|')`) and therefore **remounts every tile**.
The panel's slide resizes the stage continuously, so an undebounced reading re-keys mid-slide.

Measured at 950x800 with two participants, before the fix: the grid flipped 2x1 -> 1x2 at **t=46ms, with the panel still at `margin-right: -145px`**, roughly 43% of the way in.
The tiles jumped from small-and-side-by-side to large-and-stacked in a single frame while the panel was still 140px from home.
After the fix: **one re-key at t=312ms, at `margin-right: 16px`**, with the panel fully at rest.

A re-key at rest reads as "the grid rearranged", which is what it already did before any of this work.
A re-key mid-slide reads as an explosion.

The clock is in the view, consistent with the reactions and lobby-staleness rules above.
It also fixes a pre-existing defect nobody had named: dragging a window across the portrait threshold used to thrash remounts continuously.

**Only some tile counts can flip at all.** `gridShape` is `ceil(sqrt(n))` on the long axis, so 3 and 4 and 9 give the same shape in both orientations and can never show this.
2, 5, 6, 10, 11 and 12 can.
`?fake_call=three` **cannot reproduce it** - use `two-people`.

### `ChatPanel` takes an `open` prop. Mounted is not the same as open

The panel stays mounted through its ~150ms exit, and `ChatPanel` calls `markRead()` on every arrival while mounted.
Without the prop, a message landing during the exit would be marked read as the panel slides away, and its unread badge would never appear.

The cure is not a `closing` prop threaded through `Panel`: it is that `markRead` was keying off the wrong fact.
`open` is the logical state, `rendered` is the DOM's; only the first should drive behaviour.

### `figma:diff` captures at `reducedMotion: 'reduce'`

`scripts/figma-diff.ts` launches its own chromium and gets none of `playwright.config.ts:39`'s `animations: 'disabled'`, so it depended entirely on its `TRANSITION_MS = 500` wait.
Capturing under reduced motion makes it immune to that number.

This works **only because** the 1ms-not-none idiom guarantees the reduced-motion path reaches the identical final geometry.
That makes `figma:diff` a standing proof that reduced motion renders correctly, which is otherwise hard to gate.
Verified: the numbers are identical with and without the flag.

**The motion work moved zero layout pixels.**
Measured by diffing this branch's `rendered-chat.png` against `main`'s: 1123 of 7,720,704 pixels differ, all of them inside `x 53..201, y 1069..1084`, which is the control bar's live wall clock ("8:04 PM" vs "8:02 PM", two minutes apart between runs).
`chat` 7.13% -> 7.14% and `people` 7.62% -> 7.63% are that clock and nothing else.
This is exactly the case the harness's own "read the diff image, not the number" warning is about.

## Accepted deviations from the Figma

Deliberate, user-approved differences. **Do not "fix" these.**
If `figma:diff` reports them, that is expected: read the diff image, not the number.

| Screen | Deviation | Why |
|---|---|---|
| Precall | A **"Your name" field sits in the right column**, pushing Join now and the options roughly 100px below their Figma position. | The Figma precall is an account-based design: it shows `raymonddvan@gmail.com` / Switch account and has nowhere to type a name. We have no OAuth (locked decision), so a guest must enter one. User chose the right column over the header slot, accepting that the column never pixel-matches. |
| Precall | The preview shows a flat colour, not the Figma's stock photo. | We do not have that photo, and the preview is a live camera. This region can never converge and is not a defect. |
| Precall | Our generated avatar instead of the Figma's account photo. | No OAuth, so no profile pictures. |
| Precall | **No "Apply visual effects" button** over the camera preview, though the Figma draws one. | It was blur's entry point, and blur is cut (see the table above), so it could never do anything. It had shipped since Phase 1 with **no `onClick` at all** - a control that silently did nothing, which is the one thing this project's rules forbid. **Removing it costs nothing in either check**, unlike the captions button: it sat inside `[data-testid="camera-preview"]`, which both `figma:diff` and the Playwright baseline already mask, so the Figma-geometry argument that keeps the control bar's twelve buttons does not apply here. |
| Precall | **No "Switch account" control**, though the Figma has one under `raymonddvan@gmail.com`. The header shows the guest name and avatar only. | There are no accounts to switch to. Rendering it would be a control that lies about what the app can do. User called it: "drop the switch account, it's fake." The "Your name" field is the real identity control. |
| Precall | The `<h1>` reads the **meeting code** (`design-chat`), where the Figma reads a meeting **name** ("Design Chat"). | Meeting codes display as VideoSDK's `xxx-yyy-zzz` with no mapping layer (locked decision), so we have no meeting *names* to show. The Figma depicts a product feature we deliberately do not have. **Not masked in `figma:diff`**: the title's font, size, colour and position are ours to get right, and masking the region would blind the check on all four to hide a few thousand glyph pixels. Pointing the diff harness at a prettier URL would dress the app up as something it is not. |
| In-call stage | **A lone tile in a short last row is a row-share wide (652 with a panel open), not the 840 the Chat and People frames draw.** | **The frames contradict themselves and the base frame wins.** Measured off the renders: with a panel open the top row's tiles reflow 840 -> 652, but the lone bottom tile **stays 840**. It is the only element in either frame that ignores the narrower stage, which is what an auto-layout artifact looks like - the designer narrowed the frame and one fixed-width node did not follow. The base frame's own logic settles it: there, the lone bottom tile is 840 **because** that is a 2-column row-share of a 1696 stage. Applying that same rule to a 1320 stage gives 652. Matching the frame literally would make a lone tile wider than its own row-mates, which neither Meet nor the base frame does. This is most of the residual `figma:diff` on both screens; **do not chase it.** |
| Chat panel | **No "Let contributors send messages" toggle**, though the frame draws one at y 92..140. | **PubSub carries no authority.** Any client can publish to the `CHAT` topic whatever a toggle says, so the control could not do the one thing its label promises. The same rule already forbids a client-side `allow_mod` check on hand-lowering: it would read as security and not be any. Unlike the captions button, nothing forces the geometry here - the panel is a vertical stack, not a 566/564/566 row with no slack - so the rows below simply move up. |
| Chat panel | The notice reads **"Messages can be seen only during the call by people in the call"**, where the desktop frame reads "You can pin a message to make it visible for people who join later...". | **The frame's own text advertises a feature we do not have.** We have no message pinning, so rendering it verbatim would tell every user to look for a control that does not exist - the exact failure the "Apply visual effects" button was removed for. The sentence we ship is not invented: it is Meet's own, taken from **this same Figma file's `Mobile / Meeting / Chat` frame**, and it describes precisely what our chat does. The box is consequently shorter than the frame's 96px, because the text is shorter. |
| People panel | **No "Add People" button**, though the frame draws one (135x40). | There is no directory, no OAuth and no invite path, so it could only ever open something that is not there. Identical to the dropped "Switch account": do not ship a control that lies about what the app can do. Copy link already exists in Meeting details and is the real affordance. |
| People panel | **No "Contributors" group header, count, or collapse chevron.** The list sits directly under "In the meeting". | We do not model Meet's contributor/viewer distinction, and nothing in the verified SDK surface exposes it. The frame's own header disagrees with its list anyway - it reads **1** above three people - which is a good sign it is a component default rather than a considered state. Same family as the dropped host badge: **do not ship UI that claims to know something it cannot.** |
| Chat + People panels | The panels are **white on the black call**, and use a `--color-call-panel-*` block rather than the dark `--color-call-*` one. | **Not a deviation at all - recorded here because it looks like one.** The panel really is `#ffffff` in the Figma. Verified rather than assumed: the Light and Dark sections' Chat and People frames are **pixel-identical (0 of 7,720,704 differ)**, so the white is the design in both and not an artifact of pulling the "Light" section. It is still a call token and not a theme token, for the same reason the black is: the panel is white whatever your theme, so the deferred light/dark toggle must not reach it either. |
| Precall (`figma:diff` only) | The capture **seeds a display name** into localStorage before screenshotting, so Join renders enabled. | Not masking, and not flattering the number: the Figma frame depicts a signed-in user ready to join, and an enabled Join is the ordinary state for any returning guest, reached through the same code path. An unseeded capture diffs a first-run state against a frame drawn of a returning one. Only the name is seeded; the avatar colour is still derived by the app, so the rule cannot drift. |

## Settled questions

Recorded so they are not reopened.

- **Meeting code format.** VideoSDK's `xxx-yyy-zzz` is shown as-is. Google's `abc-defg-hij` is knowingly not replicated. Do not build a mapping layer.
- **Quality switching.** Two VideoSDK guides contradict each other; the SDK reference settles it. `setQuality("low"|"med"|"high")` **does** exist on `useParticipant` and controls **what you consume**. The PubSub `CHANGE_RESOLUTION` pattern controls **what the remote publishes**. They are different things, not alternatives. See VIDEOSDK.md.
- **Realtime transcription availability.** Checked against the user's plan on 2026-07-15: **not available**, so captions were cut. Re-checked on 2026-07-20 at the user's request: **now available.** Captions were built the same day. See the Captions row above and the seam-design section below.
- **Remote quality switching (`CHANGE_RESOLUTION`).** **Not built.** YAGNI, user-confirmed 2026-07-15. Consuming at a lower quality via `setQuality()` already saves the bandwidth that matters to us. Build the publish-side half only if a real need appears.
- **Landing carousel copy deliberately departs from live Meet's wording on two slides.** User-settled 2026-07-16. Landing has no Figma frame and is sourced from the live product, so this is a departure from Meet, not from the Figma - it lives here, not in the deviations table. Slide 2 reads "go to **Layout** in the More options menu", not Meet's "Adjust view", because **Layout** is what our menu actually labels that group; the copy was changed to match the app rather than the menu relabelled. Slide 3 reads "No one can join a meeting unless invited or admitted by the host", dropping Meet's "outside your organization", because we have no organizations and no org-based access control. Both follow the same rule as the chat notice and the "Apply visual effects" button: **do not ship copy that advertises a feature the app does not have.** Do not "correct" either line back to Meet's verbatim text - that reintroduces the exact defect.

## Open risks

- **Product Sans is Google's proprietary brand font and we ship it anyway.** Deliberate, informed user decision (see the Fonts row). Serving it from `public/fonts` is redistribution, in a project that already clones Google's product and marks. The exposure is legal, not technical. Revisit before any public or commercial deployment. Do not quietly swap it out.
- **Recording's status strings are not in the verified surface.** `docs/VIDEOSDK.md` lists `onRecordingStateChanged({ status })` but not the values `status` takes. They are **assumed** to mirror transcription's (`RECORDING_STARTING | RECORDING_STARTED | ...`) and that assumption is **unverified**. Map them at the seam and return null for anything unrecognised, the way `connectionStateFromSdk` does: a new status coerced to "recording" would put a false REC indicator over a meeting nobody is recording. Confirm in a live room before shipping.
- **Transcription's status strings are assumed from the same family** (`TRANSCRIPTION_STARTING | TRANSCRIPTION_STARTED | TRANSCRIPTION_STOPPING | TRANSCRIPTION_STOPPED`) and are equally **unverified**. `transcriptionStateFromSdk` returns null for anything unrecognised, the same defensive shape as recording's mapper. The `TranscriptionBridge` itself - the `onTranscriptionText` payload shape and `startTranscription({})` succeeding with no webhook - is also unverified: no fake can prove a bridge, only a live room can. See the seam-design section above and the plan's open risks. Confirm in a live room before treating captions as done.
- ~~**Nothing tells a guest it is in the lobby.**~~ **Settled 2026-07-16** in a live room, with a real host token and a real guest token, as this entry demanded.
  An `ask_join` holder does reach `CONNECTING` and stays there, and a **denied** guest is not disconnected either, so the derived waiting state is sound and the denied screen is the only thing that ends the wait.
  The answer is written into VIDEOSDK.md's Lobby section.
  Settling it turned up the bug it had been hiding: `onEntryResponded`'s arguments arrive **positionally**, not as the object the `.d.ts` promises, so `entryDecision` never left `null` and **no denied guest was ever told**. Fixed at the seam.
- **Nothing currently gates visual fidelity in CI.** `figma:diff` is local: it needs Figma PNGs and a dev server. The CI gate is Playwright's `toHaveScreenshot`, and **no baselines are committed yet**, so fidelity can drift without anything failing. Phase 2 closes this. Baselines are machine-sensitive, so decide where they are generated before committing the first one, and never baseline a live-Meet-sourced screen the user has not approved: a baseline defends whatever it recorded, right or wrong.
- **Token names are synthesised, not authored.** `extract` invents names like `body-2`, `accent-9`. Exact in value, meaningless in intent, and they renumber as the file changes. Map them to semantic names we own; **never let a generated name reach a component.**
- **Yolo Mode patches Figma Desktop.** It breaks on every Figma update. `figma-cli unpatch` restores it.
- **Speaker output routing is unfinished** and precall currently ships a picker that changes nothing. See VIDEOSDK.md and Phase 2's inherited items.
- **Blur and noise suppression are cut**, so neither is a risk any more. See the table. Both remain permanent, accepted divergences from Meet.
- Real-room Playwright tests consume VideoSDK minutes.
- **A development-flavoured build would ship the fakes, and the trigger is `NODE_ENV`, not `--mode`.**
  `import.meta.env.DEV` derives from Vite's `isProduction`, not from the `build` command, so a build that resolves to a non-production environment sets it true and the whole fake tree survives into `dist/`.
  The result is `?fake=` live on the deployed origin, faking the camera and granting `isHost` true to anyone who appends it to a URL.
  **Measured on Vite 8.1.4, 2026-08-17, because the obvious guess was wrong**: `vite build --mode development` produced a byte-identical bundle with the fakes still shaken out, while `NODE_ENV=development vite build` shipped all 13 canaries.
  So the hazard is an inherited `NODE_ENV` in a CI or Vercel environment, which is invisible in a diff, rather than a CLI argument someone typed.
  Do not assume `--mode` is safe on a future Vite either - the coupling between mode, `NODE_ENV` and `isProduction` is Vite's to change, and both spellings are exactly what the gate is for.
  **`scripts/check-dist.ts` is the only thing that would catch either**, which is why it is chained into `npm run build` rather than left as a separate script somebody has to remember to run.

## Resolved

- **figma-cli read fidelity - tool confirmed.** The Phase 1 spike verified exact px geometry (including fractional), exact hex, full font family/size/weight/line-height, auto-layout gap/padding, and 2x PNG export. Two gaps, neither blocking: per-node `get` returns geometry only (no fill hex, no font), so extraction must go through `figma-cli extract`, not node-by-node; and `export-jsx` is broken (it needs `oxfmt` inside the CLI's own install directory). The Figma REST API is no longer needed as a fallback.

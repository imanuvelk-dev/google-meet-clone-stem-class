# Architecture deepening - the remaining candidates

**Read [CLAUDE.md](../../CLAUDE.md) first**, and the files it points at: [DECISIONS.md](../DECISIONS.md), [VIDEOSDK.md](../VIDEOSDK.md), [FIGMA.md](../FIGMA.md).
None are loaded automatically.

**DECISIONS.md wins over this file.**
Several entries there say "do not fix this" and mean it, and three of the candidates below were narrowed or inverted by exactly those entries.

This file exists because each candidate is handed to a different session.
Each section is self-sufficient: take one, do it, stop.
Do not batch two together, and do not start a second one because the first was small.

## Where this came from

An architecture review on 2026-08-17 produced six candidates, each then given its own design pass.
**Three of the six had their premise corrected by the design pass, and two of those flipped direction entirely.**
The corrections are recorded per candidate below, because the original framing is the thing a fresh reader would otherwise re-derive and act on.

## Status

| # | Candidate | State |
|---|---|---|
| 6 | Assert the fake fence at build time | **Done**, `2b2fd48`. Found a real leak on the way. |
| 1 | One keyed record for the in-call actions | **Done**, `c7e941d`. |
| 2 | Give the stage one plan function | **Open.** Strong. Do this first. |
| 4 | Bind the commands, narrow the selectors | **Half done.** The selector half shipped as `8fd5e88`. See below for what is left. |
| 3 | Pull the shared decisions into `CallStore` | **Open.** Worth doing, ships no user-visible fix. |
| 5 | Type the Host against `CallBridge` | **Open.** Needs a live room. Do it last. |

Suggested order: **2, then 4, then 3, then 5.**
2 is self-contained and touches no seam.
5 rewrites the one file no fake can prove, so it wants a live room and a calm session.

## Ground rules for every candidate here

- **Zero comments in code.** The rationale goes to `docs/DECISIONS.md`, in the same commit as the code. Several of these candidates delete comment blocks that are the only record of a decision, and other DECISIONS entries cite them. Rescuing that prose is not optional bookkeeping - skipping it makes the refactor net negative.
- **No new unit tests.** Existing ones stay green (`npm test`). Playwright e2e sparingly. Verify by driving the Playwright MCP browser yourself and report what you actually saw.
- No em dashes. One full sentence per line in Markdown. Never hand-edit generated files.
- Commit granularly, one concern each. Do not `git push`.
- Full gate before you call it done: `npx tsc -b`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`. The build now ends with `scripts/check-dist.ts` and must print its ok line.

## Facts established on 2026-08-17 that will save you a wrong turn

- **`import.meta.env.DEV` keys off `NODE_ENV`, not `--mode`.** Measured: `vite build --mode development` shakes the fakes out correctly, `NODE_ENV=development vite build` ships all of them including `__fakeCall`. The first guess was wrong and is written up in DECISIONS' Open risks.
- **The fakes are DEV-only, so a fake/client drift is not user-visible.** `fakeFromUrl.ts` returns undefined on both entry points outside DEV. Do not sell candidate 3 as a user-facing bug fix.
- **`leaveReason.message` is carried and dropped.** `PostCall.tsx` renders only `ENDINGS[kind]`. Its sole consumer is a test.
- **TypeScript does not enforce the bound-field contract.** A method satisfies a function-typed property, so `implements CallClient` passes either way. `CallClient.ts`'s comment claiming the shape enforces binding is false. Verify with one `tsc -b` before relying on it.
- **Playwright browsers may be uninstalled after a fresh `npm install`.** `npx playwright install chromium`. 93 failures that all say "Executable doesn't exist" are this, not your change.

---

# Candidate 2 - Give the stage one plan function

**Strength: strong. Do this one first.**
Largest depth gain per line changed, no CSS changes, no seam changes.

## The problem

`src/routes/Call/stageLayout.ts` is 110 lines and 12 exports, and it has no test file.
Five of its exports are one-liners (`pageCount` is one `Math.max`/`ceil`, `pageOf` is a `slice`, `arrangementFor` is 2 lines, `gridShape` is 4, `qualityForVisibleCount` is 3).

The composite decisions are not in the module. They are in `Stage.tsx:50-110`:

- the `focused` predicate is composed at the call site (`Stage.tsx:50-53`)
- `pageSize` branches in the component (`:78-79`)
- the page clamp `Math.min(requestedPage, pages - 1)` is in the component (`:84`)
- `qualityForVisibleCount` is used only on the tiled branch, while the strip branch hardcodes `'low'`/`'high'` inline (`:100-108`)

So the module is a bag of helpers plus a constant sheet, and the reasoning it exists to hold lives one file away, where it cannot be exercised without a DOM.

## Two binding amendments, both quoted from DECISIONS.md

**`portrait` and `gridShape` stay out of the plan.**
`DECISIONS.md`, "`usePortrait` follows the SETTLED stage, not every frame": *"`TileGrid.tsx`'s `usePortrait` debounces its ResizeObserver by `SETTLE_MS` (100ms) before committing"* and *"a change of column count re-keys every row and therefore remounts every tile"*.
Pulling the measurement up would put a settle-delayed re-render on the module that also owns quality and pagination.
`gridShape`/`rowsOf` stay next to the measurement in `TileGrid`.

**`COLUMN_GAP_PX` and `ROW_GAP_PX` get deleted, not moved.**
Confirmed dead: no TS importer, and the CSS carries its own numbers with its own provenance (`TileGrid.module.css:12,22`, `Stage.module.css:26,44`).
Precedent is `DECISIONS.md`'s `TILE_RATIO_WIDTH/HEIGHT` entry: *"deleted, not corrected. Nothing imported them - CSS cannot - so they were documentation wearing a constant's clothes"*.

## The interface

```ts
export type StagePrimary =
  | { kind: 'tile'; id: string }
  | { kind: 'share'; id: string }
  | { kind: 'whiteboard'; url: string }

export interface StagePlanInput {
  layout: LayoutMode
  participantIds: readonly string[]
  pinnedParticipantId: string | null
  presenterId: string | null
  whiteboardUrl: string | null
  speakerId: string | null
  requestedPage: number
}

export interface StagePlan {
  arrangement: Arrangement
  primary: StagePrimary | null
  onPage: readonly string[]
  page: number
  pages: number
  qualityById: ReadonlyMap<string, VideoQuality>
}

export function stageArrangement(
  input: Pick<StagePlanInput, 'layout' | 'pinnedParticipantId' | 'presenterId' | 'whiteboardUrl'>,
): Arrangement

export function stagePlan(input: StagePlanInput): StagePlan
```

Public after the change: `stagePlan`, `stageArrangement`, `gridShape`, `rowsOf`, plus the types and `LAYOUTS`.
Private: `MAX_TILES_PER_PAGE`, `MAX_STRIP_TILES`, `qualityForVisibleCount`, `primaryFor`, `qualityFor`.
Deleted: `pageCount`, `pageOf`, `arrangementFor`, both gap constants.

### What goes in, and what stays out

Sorted by DECISIONS.md's own rule, *"What is this when nothing is happening? If it has an answer, it is state."*
The plan is the derivation half; anything with its own answer stays state at the edge.

| Thing | In or out | Why |
|---|---|---|
| primary priority (whiteboard > pin > share > speaker) | **in** | No answer of its own. It is a fold over four facts that are each state somewhere else, and it is the most composite decision in the file. |
| the page clamp | **in** | Cannot be written correctly without `pageSize`, which is now private. Leaving it out forces `pages` back out for the caller to clamp against, which is the current leak. |
| `pageSize` branch | **in** | Pure function of `arrangement`. |
| quality map, all three branches | **in** | This is where the current split hurts most: half the policy is in the module, half inline in the component. |
| sticky speaker | **out** | "Whoever spoke last" is a real answer, held nowhere else. `activeSpeakerId` goes null between utterances and the stickiness is the memory. Stays a hook, and the during-render adjustment at `Stage.tsx:206` must not move: it is what stops a frame of the old speaker painting. |
| `requestedPage` | **out** | Its own answer. Stays `useState`. |
| `portrait` | **out** | Binding, see above. Also a DOM fact, and the plan earns its testability from being DOM-free. |

### Do not map `'med'`

`VideoQuality` is declared in `src/meeting/CallClient.ts:42`, a file we own, and DECISIONS' "Quality switching" entry settled those three literals as the wire values on purpose.
`VideoSdkCallClient` passes the value straight through, and two contract tests assert the literal.
Mapping it costs three files and two weakened contract tests and prevents nothing.
Add one sentence to the new DECISIONS entry saying the literals are deliberate, and move on.

## The memo gate - the one real hazard

`Stage.tsx:112` passes `qualityById` into an effect dependency list (`useStagePolicy.ts:61`).
Today's memo excludes `activeSpeakerId`, so in tiled arrangement a speaker change re-renders `Stage` but does **not** re-run the 49-iteration policy effect.

Keep that property with a gate in the calling hook:

```ts
const focused = stageArrangement({ layout, ...call }) !== 'tiled'
const speakerId = focused ? sticky : null
```

That is the only reason `stageArrangement` stays exported.
**It looks redundant because `primaryFor` already returns null for tiled, and it is not: it is a memo-dependency gate, not a value gate.**
Record that in DECISIONS or the next reader will delete it.

## Edit list

- `stageLayout.ts` 110 to ~120 lines, structure changes far more than size. All ~55 lines of comment come out.
- `Stage.tsx` 257 to ~215. Delete `:23-30` (local `Primary`, `NOBODY`), `:47-53`, `:59-85`, `:96-110`. Add a private `useStagePlan` hook holding `requestedPage`, the sticky speaker and the memo. `NOBODY` moves to module scope in `stageLayout.ts` and must not be constructed inside `stagePlan`.
- Every `data-testid` and `data-layout` value stays byte-identical. That is what makes the e2e suite a valid check.
- No changes to `TileGrid.tsx`, `PageControls.tsx`, `ControlBar.tsx`, `Call.tsx`, `useStagePolicy.ts`, or any CSS.
- `docs/DECISIONS.md` +~30 lines, and this part is mandatory. The deleted comments are the only record of: the `ceil(sqrt(n))` derivation and why it is not area-maximising, `MAX_STRIP_TILES = 6` and the 1021px it came from, the whiteboard > pin > share > speaker ordering, clamp-not-effect, "a strip tile is a thumbnail whatever the count", the `qualityForVisibleCount` thresholds including "three is high, not med", and that absence from the map is what pauses a stream.

## Verification

Existing coverage is real but half: `tests/e2e/call.spec.ts:227-267` (`fake_call=fifty`) pins `pages`, `page`, the slice, and the whole quality map end to end, including `expect(offPage.paused).toEqual(['remote-49:webcam'])`.
That catches a broken clamp direction, a broken slice, a wrong page size, and a lost tiled branch.

**Not covered by anything: arrangement selection, the strip's `'low'`/`'high'` rule, the primary priority ordering, the clamp on a shrinking roster, `MAX_STRIP_TILES`.**
That is precisely the half the code is moving furthest.

So drive it: `?fake=ok&fake_call=fifty` for pagination, then Spotlight and Sidebar from the options menu, then `window.__fakeCall.simulateWhiteboard`, `pin`, and `simulateParticipantLeft`.
Every uncovered case is reachable by hand with no new fake code.

Two e2e additions are justified and within policy, both in the existing `test.describe('the stage')`:

1. a share pulls Tiled into Sidebar and the whiteboard outranks a pin, plus one `pausedStreams` read while in sidebar to pin the strip rule
2. paging past the end of a shrinking meeting shows the last page, not an empty one - the only automated guard the clamp will ever have

`figma:diff` is not useful here. No pixel moves and `Meeting` is not in `SCREENS`.

## Risks

- The memo gate above. Everything else is mechanical.
- Two truthiness asymmetries exist today and must be **preserved, not fixed**: the arrangement predicate uses `whiteboardUrl !== null` while `primary` uses a truthy check, same for the pin. Normalising them inside a "pure refactor" is an untested behaviour change smuggled under a structural one.
- Do not add a lower clamp on `requestedPage`. `PageControls` disables previous at 0, so it is unreachable, and adding it stops the diff being a pure move.
- Land it in one commit. Half-landed means two live copies of the arrangement predicate, which is the state in which someone edits only one.

---

# Candidate 4 - What is left of it

**The selector half already shipped as `8fd5e88`.** Read that commit before starting.

## The premise was inverted, and this matters

The review originally said "14 of 22 hooks are shallow, delete them".
**That is wrong.** There are no binding-only hooks.
Every one also owns a `useSyncExternalStore` subscription and a narrow selector, and the narrow selector is the entire re-render strategy for a 49-tile room:

- `DECISIONS.md:171` - *"would buy nothing and cost a `useSyncExternalStore` subscription per row"*
- `:173` - *"a mic toggle would re-render all 49 tiles"*
- `:184` - *"a primitive snapshot is `Object.is`-stable, so the badge re-renders only when the number moves"*

Deleting `useChatUnreadCount` puts the control bar on the whole chat log.
Deleting `usePendingEntry` re-renders every knock card on every knock.
Deleting `useIsHost` forecloses the fix that already shipped.
**Do not delete narrow hooks.** A hook that looks like a one-line duplicate of a `useCall` field is usually the selector that makes 50 of something affordable.

## What actually shipped, and what it measured

`PersonRow` called `useCall()` for two scalars and was not memoised, and `Call.tsx` also calls `useCall()`, so the whole People subtree followed its parent on every active speaker change.
Measured in the browser at `fake_call=fifty`: **1000 `PersonRow` executions for 10 speaker changes, now 0.**
Both halves were needed - the narrow selector alone changed nothing, because the parent cascade dominated.

Note for anyone measuring this again: a wall-clock harness built on `setTimeout` is floor-bound by the clamp and cannot see the difference at all.
Count renders with a temporary counter in the component, then remove it.

## What is still open

### 1. The lint gate - do this, it is the durable part

`CLAUDE.md` says components only ever call our hooks, and three files already take the raw client: `useStagePolicy.ts:24`, `hostActions.ts:7`, `ControlBar.tsx` (now via `callActions.ts`).
`eslint.config.js:47-65` bans `@videosdk.live/react-sdk` outside `src/meeting/` and says nothing about `@meeting/CallContext.ts`, so the rule is prose that lint cannot see.

Each bypass is a missing hook, not a missing exception:

- `useStreamPolicy(): Pick<CallCommands, 'setParticipantQuality' | 'setStreamPaused'>` - about 6 lines, no subscription. `useStagePolicy` needs these for participants with no tile, so `useParticipantView(id)` cannot serve it.
- `useRosterReader(): () => readonly CallParticipant[]` - a stable non-subscribing getter. `hostActions` reads the roster imperatively **on purpose**, and `DECISIONS.md` already sanctions the shape in the mute-all entry. Only the import should change.
- `useCallDevices(): { cameras, microphones }` - move `ControlBar`'s connection-keyed async load wholesale. Its comment is pure seam knowledge: the SDK has no devices until it has a meeting.

Then add `@meeting/CallContext.ts` to the restricted paths, and update `CLAUDE.md`'s seam paragraph to say the rule is enforced rather than merely stated.

### 2. The hand-raise leftover - cheap, do it with the above

A hand raise still re-renders all 50 People rows, because every `PersonRow` calls `useRaisedHands()` only for `lower` and so subscribes to the whole queue.
Measured: 100 row executions (50 rows, doubled by StrictMode) for one raise, against 2 for a mic change.
Human-paced rather than twice a second, so it is not urgent, and the fix is a command-only hook in the same family as the three above.

### 3. Bound command fields - optional, and the weakest item in this file

Making `CallClient`'s 37 commands bound arrow fields would let the 9 `useMemo` binding wrappers collapse (about -65 lines) and give reads and writes one idiom.

Weigh it honestly before starting:

- It is **74 hand edits with no compiler check** (see the ground-rule fact above), and about 20 of the commands have no automated caller. A missed one is a `TypeError` on a click, in production only.
- Once commands are bound fields, `useCallClient()` plus a field reference is a complete working bypass, so **the lint gate must land first or this makes the seam rule easier to break than it found it.**
- If you do it: land the 37+37+37 conversion as its own commit with zero hook changes, so `npm test` proves the seam held. `useCall.test.tsx:137` ("commands survive being passed as bare references") becomes the only automated proof the mechanism exists.
- Then work the manual click list: recording start/stop, whiteboard start/stop, reactions, all four media-request accept/reject paths, `markChatRead`, `disableParticipantWebcam`, `requestParticipantWebcam`, `changeMicrophone`, the non-toggle `set*Enabled` paths, and both device pickers.

`useTranscriptionState` (`useCaptions.ts:60-64`) has zero consumers anywhere including tests. Delete it whenever you are in this file, and note it in DECISIONS so it does not read as a regression.

---

# Candidate 3 - Pull the shared decisions into `CallStore`

**Ships no user-visible fix.** The fakes are DEV-only.
The payoff is that the fake stops lying to developers and to CI, which `DECISIONS.md:304` costs at real money: *"when a bridge handler is wrong, the fake suite is not merely silent: it is reassuring"*.
Say that out loud rather than implying the seam is now safe.

## The seven drifts, already sorted

Both adapters `extend CallStore implements CallClient`, and `implements` catches shape only.
The two test files share zero bodies.

| Drift | Verdict |
|---|---|
| chat trim / empty-drop (real trims, fake does not) | **Move to base.** A rule about the chat log, same altitude as "unread is a cached scalar". |
| fake patches `localMicOn` optimistically | **Keep local. Must not move.** |
| leave/end reasons | **Split.** The connection decision moves, the payload strings stay. |
| recording jumps idle to recording in one hop | **Fix the fake.** Traverse `'starting'`. |
| `acceptMicRequest` | **Keep both.** Move only the state clear. |
| `removeParticipant` / `admitParticipant` / `startWhiteboard` mutate locally | **Never move.** |
| devices before connect (real `[]`, fake two) | **Fix the fake.** Highest value item here. |

### The two that will be got wrong

**The no-optimistic-echo rule does NOT generalise from hand raise to mic.**
Its premise is *an authoritative log* that a reconnect replays.
`localMicOn` has no log; it is a singular fact about the local participant, and the same DECISIONS table says so.
The fake's `patchState` is the transport reporting at zero latency, not the client guessing.
A base-class `setMicEnabled` that patched `localMicOn` would make the **real** client optimistic. That is the cliff.

**`removeParticipant` is the same shape as `markChatRead` and is a production defect.**
A base class that touched the roster would make the real client drop a participant the SDK has not dropped.
`admitParticipant` joining the participant is *required*, not sloppy: DECISIONS says the card clears when the admitted id arrives in the roster, and `collaboration.spec.ts:212` is built on that arrival.

**Holding that line is the entire value of this candidate.** Every pull is more tempting and more dangerous than the last. `markChatRead` is a byte-identical dedupe worth almost nothing; the next one along is a bug.

## What moves

```ts
export abstract class CallStore {
  protected constructor(isHost: boolean) { this.patchState({ isHost }) }

  sendChatMessage(text: string): void      // trims, drops empty, then publishChat
  startCaptions(): void                    // idle guard, then startServerTranscription
  markChatRead(): void
  setPinnedParticipant(participantId: string | null): void

  protected applyMeetingLeft(reason: LeaveReason): void
  protected applyQualityLimitation(limitation: QualityLimitation | null): void
  protected applyRecordingState(state: RecordingState): void   // owns isRecording
  protected applyTranscriptionState(state: TranscriptionState): void
  protected clearMediaRequest(kind: 'mic' | 'webcam'): void

  protected abstract publishChat(text: string): void
  protected abstract startServerTranscription(): void
}
```

The base constructor becomes the only writer of `isHost`, which makes DECISIONS' "isHost is known at construction, and the fake must agree" structural rather than a comment, and lets `FakeCallClient.ts:538`'s re-assertion be deleted rather than tolerated.

**The `*FromSdk` mappers do not move.** The base accepts our vocabulary only. A mapper in the base would have the fake validating strings it invents, against two unverified open risks.

**Nothing with a clock, timer or sequence counter moves.** Three separate entries forbid it. So the recording fidelity fix is synchronous (`'starting'` then `'recording'` in one call) or behind a scenario flag mirroring `autoConnect`, never timed.

## The trap that will bite a mechanical edit

`applyMeetingLeft` decides from the *current* connection.
The fake's `end()` runs while connected, so a straight delegation yields `'disconnected'` and breaks `FakeCallClient.test.ts:232`.
The fix is also the fidelity improvement: `end()` sets `'closing'` first, which is what the SDK emits before `onMeetingLeft`, then calls `applyMeetingLeft`.

## Verification

Expect **no existing test to need editing**. The drifts being fixed are ones no test asserts.
Tests that would catch a mistake: `FakeCallClient.test.ts:220-234` (the `end()` trap), `useCall.test.tsx:108-116` (the `'You left'` literal), `useCall.test.tsx:51-57` and `:137-145` (anyone deleting the fake's synchronous echo), `VideoSdkCallClient.test.ts:277-288`, `:290-298`, `:314-328`, `:340-343`.

Watch `visual.spec.ts` and `figma:diff` for the device-list fix: both gate readiness on `device-row`, and a scenario captured before connect would now be correctly empty.

Only a live room can confirm the recording and transcription status strings, that `CLOSING` precedes `onMeetingLeft`, and that `meeting.presenterId` tracks `screenShareOn`.

---

# Candidate 5 - Type the Host against `CallBridge`

**Do this last, and only with a live room available.**

## The premise was inverted

The review said 29 bridge members are public and guarded only by a comment.
The count is **25**, and they are **already unreachable**: `createCall.ts:27` erases the concrete class at the only construction site, and `CallContext.ts:9` is typed `CallClient | null`.
They appear in three files: the class, the Host, and one test file.
So hiding them from features buys nothing that is not already bought, and would cost a rewrite of a 350-line test file.

## The real hole is the mirror image

**`VideoSdkCallHost.tsx` is typed against the concrete class, so every bridge component inside `MeetingProvider` can call all 37 commands, including `join()`.**
That is the one thing that file must never do, it is the invariant restated in prose three times (`Room.tsx:54-67`, `VideoSdkCallHost.tsx:118-132`, `VideoSdkCallClient.ts:369`), and nothing prevents it.

Concrete failure: someone adds a seventh bridge, follows VideoSDK's own documented pattern of joining from inside the provider, and writes `client.join()` in a bridge effect.
It typechecks, passes `npm test`, passes the fake e2e suite, and fails **only in a live room** as `authorization: undefined` and a 400 - the exact bug `Room.tsx:56-62` records as having already shipped once.

## The change

Chosen shape: a `CallBridge` interface implemented by the same class and used as **the Host's prop type**, not exposed as a member.
Nothing becomes private. The consumer stops seeing anything else.

- New `src/meeting/CallBridge.ts` (+~190): the `CallBridge` interface, plus `VideoSdkCallConfig`, the nine handle interfaces and the three `*FromSdk` mappers moved verbatim out of `VideoSdkCallClient.ts`.
- `VideoSdkCallClient.ts` 563 to ~430: delete `:35-182`, re-import, `implements CallClient, CallBridge`. **Method bodies must be byte-identical. This is a move, not a rewrite.**
- `VideoSdkCallHost.tsx`: eight prop annotations become `bridge: CallBridge`, prop renamed `client` to `bridge` at 26 call sites. All 26 existing calls still typecheck; what stops compiling is any new `bridge.join()`, `bridge.leave()`, `bridge.getState()`.
- Group the interface by transport, not by verb prefix. `attachChat` next to `syncChat` is the readable unit and makes "which bridge is missing a push" answerable by eye.

Side effects worth having: the module cycle between client and Host disappears, and `CallBridge` has **no readers on it at all**, so "the bridges push blindly and never diff" stops being a comment and becomes the shape of the interface.

## Explicitly rejected

- **A `simulate` namespace on the fake.** It would assert a symmetry `DECISIONS.md:295` says does not exist - the fake enters *below* the Host, and a shared vocabulary would imply a green `simulateEntryResponded` says something about `onEntryResponded`, which is the false reassurance that hid the denied-guest bug for a phase. It also breaks ~35 sites, including Playwright specs that fail at runtime with no compile error.
- **A join handle that "only exists above the provider".** React has no altitude type, and the real precondition is that `MeetingProvider`'s mount effect has run, which no handle can witness.

## Verification

Test churn should be **7 lines across 2 files**: an import path in `VideoSdkCallClient.test.ts` and five `client=` to `bridge=` prop renames in `VideoSdkCallHost.test.tsx`.
**If you find yourself editing assertions, you have taken a different option than this one. Stop.**

Run `npx tsc -b` before `npm test`: a green typecheck means all 26 Host call sites and 33 test call sites still resolve, which is most of the correctness of a pure type move.
The load-bearing test is `VideoSdkCallHost.test.tsx:156` ("re-rendering the bridges does not notify anyone").

**Live room is not optional here.** Two handler pairs typecheck as each other: `handleMicRequested`/`handleWebcamRequested` have identical signatures on adjacent lines, and `syncChat(history, live)` versus `syncChat([], live)` compiles either way and breaks backfill ordering silently.
Two real browsers: join both, host admits a knocking guest, host mutes the guest, guest raises and host lowers, one caption line with the right speaker label, deny a second guest and confirm they are told, then host ends and confirm post-call says ended and not disconnected.
Diff those four handler lines by eye at the end.

If a live room is not available this week, do not start this one.

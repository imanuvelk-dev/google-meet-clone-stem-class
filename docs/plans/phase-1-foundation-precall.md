# Phase 1 - Foundation, Design System, Landing, Precall

**Read [CLAUDE.md](../../CLAUDE.md) first**, and the files it points at: [DECISIONS.md](../DECISIONS.md), [VIDEOSDK.md](../VIDEOSDK.md), [FIGMA.md](../FIGMA.md). None are loaded automatically.

**DECISIONS.md, VIDEOSDK.md and FIGMA.md win over this file.** The spike (Task 1) has run and rewrote several assumptions below. Where they disagree, those files are current.

## Goal

Establish the four things that are painful to retrofit (token pipeline, auth endpoint, SDK seam, visual-diff harness), and prove they work by shipping the landing page and precall green room.

## Figma coverage - established by the spike

| Phase 1 surface | Source | Verified by |
|---|---|---|
| Precall / green room | **Figma `Home`** (1728x1117, Light) | `figma:diff` |
| Precall, mic muted | **Figma `Home / Muted`** | `figma:diff` |
| Landing page | Live meet.google.com | Screenshot review |
| Mobile (both) | Live Meet **mobile web** | Screenshot review |

- **`Home` is the precall, not a landing page.** The Figma has no landing page at all.
- **Desktop canvas is 1728px.** Not 1440. Diffs are meaningless at any other width.
- **Light theme only.** Dark exists and is deferred; keep tokens semantic so it retrofits without rework.
- **The Figma's mobile frames are the native iOS app** (SF Pro, 393x852, iOS status bar). Reference for spacing only, never a spec. SF Pro is never shipped.

## Out of scope

In-call UI, grid, screen share, chat, reactions, hand raise, participant control, lobby, blur, noise suppression, captions, recording.
All land in Phase 2 or 3.
Dark theme is deferred.

## Tasks

### 1. Spike - DONE, findings in docs/FIGMA.md

Kept for the record. Outcome:

- **figma-cli confirmed.** Exact px (including fractional), exact hex, full font metrics, auto-layout gap/padding, 2x PNG. The Figma REST API fallback is not needed.
- **Yolo Mode** (`figma-cli connect`), not Safe Mode - user's call. It patches Figma Desktop and **breaks on every Figma update**; run `figma-cli unpatch` when done extracting.
- **Font is Product Sans**, not Google Sans as feared. User supplied it and chose to ship it, knowing it is Google's proprietary brand font. **Deliberate, user-owned risk - do not silently revert to Roboto.**
- Two tool gaps, neither blocking: per-node `get` returns geometry only, so extract via `figma-cli extract`, not node-by-node; `export-jsx` is broken.
- **The file has zero variables and zero component sets.** `export css` and `export dtcg` emit nothing. Tokens come from `extract`'s synthesised block.

### 2. Scaffold

Vite + React + TS strict, ESLint + Prettier, path aliases, Vitest, Playwright.
`.figma/` gitignored.
**HTTPS in dev** (`vite --https` or mkcert) since media capture requires it.

### 3. Extraction and tokens

- `scripts/figma-pull.ts` runs `figma-cli extract` -> `.figma/` (gitignored): DESIGN.md with its token block, plus 2x PNG renders per frame.
- **Map synthesised names onto semantic names we own**, then generate `src/design/tokens.css` + `tokens.d.ts`. **Committed**, so CI and teammates need neither Figma nor the patch.
- Document the refresh process in the README, including `figma-cli unpatch`.

**This is a real mapping step, not a passthrough.** The file has no variables, so `extract` invents names like `body-2`, `text-primary-5`, `accent-9`. They are exact in value but meaningless in intent, and they **renumber as the file changes**. Deciding what a colour *means* is the one place a human belongs in this pipeline.

**Never let a generated name reach a component.**

Extract **dark values too** and structure tokens semantically, so dark retrofits without rework. Do not wire a theme.

Tokens hold values only. Layout stays in component CSS.

### 4. Fonts

Self-host **Product Sans** woff2, 3 faces only: Regular 400, Medium 500, Bold 700. No italics.
`font-display: swap`, preload the faces used above the fold.

**SF Pro is never shipped.** It appears only on the Figma's iOS frames. Mobile web uses the system stack.

### 5. Primitives

Button, IconButton, Tooltip, Menu, Avatar, Spinner - built from tokens, per Figma `Home`.
Meet uses Material Symbols for icons; confirm which set the Figma actually references.

### 6. Token endpoint (Vercel)

`api/*.ts` default-export handlers. `vercel dev` locally, so dev and prod share one handler shape.

**No database. The host model is stateless - see docs/DECISIONS.md.**

`api/rooms.ts`:
- `POST https://api.videosdk.live/v2/rooms` with `Authorization: <token>`, returns `roomId`.
- Also mints a `hostGrant` (our own JWT: `roomId` + `role: "host"`, longish expiry).
- Returns `{ roomId, hostGrant }`. Client stores the grant in localStorage keyed by roomId.

`api/token.ts`:
- Mints a VideoSDK meeting token, HS256, signed with `VIDEOSDK_SECRET`.
- **With** a valid `hostGrant` for that roomId -> host token: `allow_join` + `allow_mod`.
- **Without** -> guest token: `ask_join`.
- **Verify the permission names against docs/VIDEOSDK.md - they are inverted from intuition.**
- Short expiry (validated only at join time, so this is safe).

**`VIDEOSDK_SECRET` is server-only. Never `VITE_`-prefixed** - that would ship it in the bundle.

Unit tests: both role paths, grant signature rejection, wrong-roomId grant rejection, expiry.
**Historical - these already exist and must keep passing. Do not add new unit tests**; the policy changed on 2026-07-15. See [DECISIONS.md](../DECISIONS.md).

Phase 1 only exercises the guest path, but ship both now so Phase 3's lobby does not force a refactor of the join plumbing from sync to async.

### 7. Routing

`/` landing, `/:meetingId` precall.

### 8. Landing page

**Not in the Figma. Source from live meet.google.com, screenshot-review with the user.**
The Figma's `Home` frames are the precall, not a landing page.
**This screen is not `figma:diff`-verifiable** - do not expect it to be, and do not baseline it before the user has approved a screenshot.

"New meeting" and "Enter a code or link", per the live product.
"New meeting" calls `api/rooms`, stores the returned `hostGrant`, and redirects to `/:meetingId`.
Arriving via a link means no grant, so that user is a guest. That is the whole host rule.

Meeting codes display as VideoSDK's `xxx-yyy-zzz`. **Settled - do not build a mapping to Google's format.**

### 9. Precall / green room

**In the Figma: `Home` and `Home / Muted` (1728x1117, Light). These are the `figma:diff`-verifiable screens, and the whole point of Phase 1.**

Uses `useMediaDevice` (**not** `useMeeting` - see docs/VIDEOSDK.md):

- Camera preview via `createCameraVideoTrack`
- Mic/camera toggles, with mic level meter
- Device pickers: `getCameras()`, `getMicrophones()`, `getPlaybackDevices()`
- Permission states via `checkPermissions()` / `requestPermission()`
- Display-name entry, persisted to localStorage
- Join button
- `runPreCallTest()` network check -> Meet's warning banner on poor uplink/downlink
- `OnDeviceChanged` for hotplug

**Hand the precall tracks to `MeetingProvider` via `customCameraVideoTrack` / `customMicrophoneAudioTrack`** so the camera does not flicker off and on when entering the call.

**Speaker picker:** VideoSDK does not document output switching beyond `getPlaybackDevices()`. Likely needs `HTMLMediaElement.setSinkId()`. Verify early.

### 10. Error states - first-class, not an afterthought

Precall is mostly error states:

- Permission **denied** vs **blocked**. Once blocked, the browser dialog **cannot be re-triggered programmatically** - a "Retry" button is a dead end. Show Meet's recovery-instructions path.
- No devices present.
- Device unplugged mid-preview (`OnDeviceChanged`).
- Device in use by another app.
- Token endpoint failure -> retry with backoff, then a clear failure state.
- Invalid/malformed meeting code.

### 11. SDK adapter and fake

`MeetingClient.ts` interface, `VideoSdkClient.ts`, `FakeMeetingClient.ts`, provider swap.

**The seam is at our own hook layer**, since VideoSDK is hook-based. Components call `useParticipants` / `useLocalMedia`, never VideoSDK hooks directly. See CLAUDE.md (Architecture).

### 12. Playwright harness

- Chrome fake-media flags; two-context fixture for later phases.
- `toHaveScreenshot` visual diffs **at 1728px** (the real canvas width - not 1440).
- `scripts/figma-diff.ts` - pixelmatch of rendered screenshot vs the 2x Figma PNG, reported as a percentage. Applies to `Home` and `Home / Muted` only.

### 13. Mobile

Replicate real Meet **mobile web** for landing and precall.

**Do not match the Figma's mobile frames.** They are the native iOS app (SF Pro, iOS status bar, home indicator), a different product. Reference them for spacing and hierarchy only.

Mobile web uses the system font stack. **SF Pro is never shipped.**

Present screenshots to the user for review, then baseline once approved.

## Verification

- `npm run figma:pull` produces tokens and 2x renders from the live file.
- `npm run dev` -> landing -> precall shows real camera preview; device pickers switch devices; denying permission shows the correct state; blocking shows recovery instructions rather than a dead retry.
- `npm test` - token signing (both roles), grant rejection, adapter, fake. **These already exist and must keep passing. Do not add new unit tests** - the policy changed on 2026-07-15, see [DECISIONS.md](../DECISIONS.md).
- `npm run test:e2e` - landing->precall flow, device switching, permission states, visual diffs, against the fake.
- `npm run test:e2e:live` - token fetch and a real join.
- `npm run figma:diff` - **at 1728px Light, against `Home` and `Home / Muted` only.** The landing page has no Figma baseline.
- Screenshot review with the user: landing page, and both mobile screens.
- Confirm `figma-cli unpatch` restores Figma Desktop, and that a clean checkout builds with **no Figma access and no patch**.

## Definition of done

Precall matches the Figma `Home` and `Home / Muted` frames at 1728px in Light theme.
The landing page and both mobile screens have been screenshot-reviewed and approved by the user.
Every error state above is handled.
Tokens are generated, semantically named, and committed - no generated name (`body-2`, `accent-9`) reaches a component.
Product Sans is self-hosted, 3 faces, no italics.
The token endpoint issues both role shapes.
The fake client can drive the UI with no network.
A clean checkout builds without Figma.
Covered by Playwright.

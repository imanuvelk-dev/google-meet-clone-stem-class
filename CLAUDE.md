# Google Meet Clone - Project Context

A pixel-perfect Google Meet clone as a browser app, using Vite + React + TypeScript and the VideoSDK Video Calling SDK.
The UI is sourced from a Figma file. Verification is done by driving the browser.

Target: desktop browser matching Figma exactly, plus a real mobile-web responsive layout.

## Read these before you start - not optional

This file is only an index.
**The decisions, the API facts, and the design findings live in the files below, and they are not loaded automatically.**
Open them.

| File | What it holds | Why you cannot skip it |
|---|---|---|
| **[docs/DECISIONS.md](./docs/DECISIONS.md)** | Every locked decision, with rationale. The host model. Accepted deviations from the Figma. The testing policy. | This exists so settled decisions are not re-litigated by each new agent. **Several entries say "do not fix this" and mean it - each one looks like a bug and is not.** If you disagree with a decision, raise it with the user. Do not silently deviate. |
| **[docs/VIDEOSDK.md](./docs/VIDEOSDK.md)** | Verified API surface, and the gotchas. | Several facts are **counterintuitive and have already caused errors**. `allow_join` is the HOST, not the guest. Precall and in-meeting use different method names for the same job. Captions are not on `useMeeting`. Guessing at names here costs hours. |
| **[docs/FIGMA.md](./docs/FIGMA.md)** | What the Figma actually contains, and the token pipeline. | The canvas is **1728px, not 1440**. `Home` is the **precall, not a landing page**. The in-call frames are **dark-only**. The mobile frames are the **native iOS app**, not mobile web. Every one of these has already misled someone. |
| **[docs/plans/](./docs/plans/)** | The three phase plans, and their Figma coverage tables. | Phases 1 to 3 are built. The plans are history now, not instructions, but they carry the coverage tables. |
| **[docs/plans/architecture-deepening.md](./docs/plans/architecture-deepening.md)** | The open refactors, one section each, each self-sufficient. | **If you were handed a candidate number, this is your file.** Three of the six candidates had their premise corrected by a design pass, so the original framing is recorded next to each one. Take one section, do it, stop. |

## Testing - read the policy in DECISIONS.md

Short version, set by the user on 2026-07-15:

1. **Do not write new unit tests.** Existing ones stay green (`npm test`). The bar is only on *adding*.
2. **Playwright e2e sparingly** - important flows only, not broad coverage.
3. **Verify by driving the Playwright MCP browser yourself.** Open the app, click through it, look at it. This is the default.

**Do not let "no unit tests" become "unverified".**
Report what you actually saw, what is only structural, and what needs a live room or a human's eyes and ears.

Commands:
- `npm run test:e2e` - Playwright against the fake clients. No network.
- `npm run test:e2e:live` - small real-SDK suite. **Keep it small; it burns VideoSDK minutes.**
- `npm run figma:diff` - pixel deviation of a rendered screen vs its Figma PNG. Local only; needs a dev server.

Playwright uses Chrome fake-media flags so two contexts can join one room without real webcams:
`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, optionally `--use-file-for-fake-video-capture`.

**It is `-stream`, not `-capture`.** There is no `--use-fake-device-for-media-capture` switch.
Chrome ignores unknown switches silently, so the misspelling this project shipped from Phase 1 until 2026-07-15 read as working while **every test run drove the real webcam and microphone**.
Enumerating settles it: the wrong spelling lists `FaceTime HD Camera`, the right one lists `fake_device_0`.
The smoke test now asserts the camera is actually fake, rather than merely present - the old version passed on any machine with a webcam and would only ever have failed on CI, which has no camera.

## Architecture

```
src/
  design/
    tokens.css              # GENERATED from Figma - never hand-edit
    tokens.d.ts             # generated types
    primitives/             # Button, IconButton, Tooltip, Menu, Avatar...
  meeting/                  # the SDK seam - see below
    hooks/                  # useParticipants, useLocalMedia, useDevices...
  routes/
    Landing/                # live-Meet-sourced, no Figma frame
    Precall/                # green room - Figma `Home`
    Call/                   # in-call - Figma `Meeting`, always dark
  lib/
    session.ts              # display name + avatar colour, localStorage
api/
  token.ts                  # mints VideoSDK meeting tokens (host if hostGrant present, else guest)
  rooms.ts                  # creates rooms, returns { roomId, hostGrant }
scripts/
  figma-pull.ts             # extract tokens + PNG renders
  figma-diff.ts             # rendered screenshot vs Figma PNG
```

### The SDK seam - important

VideoSDK's React SDK is hook-based (`MeetingProvider`, `useMeeting`, `useParticipant`, `usePubSub`), which resists wrapping in a plain object interface.

**So the seam is at our own hook layer, not below it.**
Components only ever call our hooks.
Those delegate either to VideoSDK or to the fake clients' store.
Tests swap the provider at the root.

**Do not let VideoSDK hooks leak into feature components.**
An SDK upgrade should touch `src/meeting/` and nothing else.

## Conventions

- **No em dashes** anywhere. Use a plain dash.
- In long Markdown files, put each full sentence on its own line.
- **Never write any comments in the code**
- **Never hand-edit generated files** (`tokens.css`, `tokens.d.ts`).
- **Never let a generated token name** (`body-2`, `accent-9`) reach a component. Map to semantic names we own.
- **Never prefix secrets with `VITE_`.** That ships them in the bundle. `VIDEOSDK_SECRET` is server-only.
- Test IDs: `data-testid` in kebab-case.
- Prefer container queries over viewport media queries for participant tiles, which resize with their container rather than the window.

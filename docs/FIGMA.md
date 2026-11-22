# What the Figma Actually Contains

Established by the Phase 1 spike against the live file, corrected by Phase 2.
**Trust this over any assumption in the plans.**

Decisions built on these findings live in [DECISIONS.md](./DECISIONS.md).

## The frames

The Meet page holds **2 sections (Light, Dark) x 5 frames**, each with a desktop and a mobile artboard:

| Frame | Desktop | Mobile | What it really is |
|---|---|---|---|
| `Home` | 1728x1117 | 393x852 | **The precall / green room.** Not a landing page. |
| `Home / Muted` | 1728x1117 | 393x852 | Precall with mic muted. |
| `Meeting` | 1728x1117 | 393x852 | In-call (Phase 2). **Dark. See below.** |
| `Meeting / Chat` | 1728x1117 | 393x852 | In-call with chat open (Phase 3). **Dark.** |
| `Meeting / People` | 1728x1117 | 393x852 | In-call with participants open (Phase 3). **Dark.** |

- **Desktop canvas is 1728px wide, not 1440.** Visual diffs are meaningless at any other width.
- **There is no landing page.** Searches for "New meeting", "Enter a code", "code or link" return nothing.
- **Mobile frames are the native iOS app**, not mobile web. Reference for spacing only, never a spec, never diffed against. SF Pro is never shipped.
- **Everything else in the project has no design.** Roughly 16 surfaces. See the Undesigned surfaces decision.

## "Light/Dark" is only true of the Home frames - the in-call screens are dark-only

Established in Phase 2 by pixel-comparing the exports.
**This corrects the original spike's assumption that every screen exists in both themes.**

- **The Home frames are genuine Light/Dark pairs.** `Desktop / Home / Light` vs `/ Dark`: 1,621,253 of 1,930,176 pixels differ, mean luminance 238.4 vs 43.7.
- **The Meeting frames are not pairs. They are pixel-identical dark duplicates.** `Desktop / Meeting / Light` vs `/ Dark`: **0 of 1,930,176 pixels differ**, both at mean luminance 80.5. Same for `Meeting / Chat`. `Mobile / Meeting`'s two copies differ only by a mic badge (muted vs unmuted), and both are dark.

This is **not sloppiness in the file - it is the real product.**
Google Meet's in-call screen is dark whatever your theme, the way a video player is.
So the designer put the same dark in-call design in both sections, correctly.

Consequences, and they matter:

- **"Light theme only" does not mean "build the in-call light."** There is no light in-call design to build. The Meeting screen is dark, and `figma:diff` against it is a diff against a dark frame. A plan that says "Meeting (1728x1117, Light)" is naming the *section*, not the appearance.
- **The call is a dark surface, not a dark theme.** Its colours live in `--color-call-*` tokens that are always dark. The dark *theme* (a light/dark toggle over the Home surfaces) remains deferred and unwired. Do not conflate them.
- **We renamed the Meeting frames.** They were all named `Desktop / Meeting` etc. in *both* sections, so `figma-pull`'s exact-name match returned whichever Figma listed first - a coin flip that could silently pull the Dark section's frame. They now carry `/ Light` and `/ Dark` like the Home frames, the suffix naming the **section**, not the appearance. `resolveFrameId` now **fails loudly** on an ambiguous name instead of picking the first.
- **Phase 3 inherits this exactly.** `Meeting / Chat` and `Meeting / People` are dark-only duplicates too, and are already renamed
(verified on the pull: their Light and Dark frames differ by **0 of 7,720,704 pixels**).
- **But "the Meeting frames are dark" is about the STAGE, not everything on it.** The Chat and People **panels are `#ffffff`** - a white card, 360x1021 at (1352, 16), floating on the black call. That is not a Light-section artifact: the pixel-identity above is the proof, since the Dark section draws the same white panel. So the call surface is black *and* the panel on it is white, both regardless of theme, and both are `--color-call-*` tokens (`--color-call-panel-*` for the panel). **Do not "fix" the panel by rendering it dark**, and do not read this as the deferred theme leaking in.

## No variables. Component sets exist, but `extract` cannot see them.

The file has **zero variables**, and 18 of 22 text styles are hardcoded.

`figma-cli export css` and `export dtcg` therefore **emit nothing**.
Tokens come from `figma-cli extract`'s synthesised token block, not from real Figma variables.

**It has 13 component sets, not zero.** `extract` reports "0 component sets" and DESIGN.md prints "_no component sets found_", and both are wrong - the tool cannot see them.
`In Call Controls` is one of them, with all four of its variants, and reading it live is how the in-call mic and camera states were built rather than guessed.
Use `figma-cli eval` to reach them; `figma-cli get` returns geometry only.

**`extract` also does not descend into INSTANCE children.**
Colours that occur only inside an instance were missing from its palette entirely: `#f9dedc` (the muted button face) and `#8e918f` (the chevron when on) occur 12 and 6 times in the file and appeared zero times.
That matters because `tokens:build` verifies every mapped value against that palette, so it rejected colours sitting in plain sight on the Meeting frame - and the tempting way out of that error is to hand-edit `tokens.css`, which is the one thing this pipeline exists to prevent.
`figma-pull.ts` now reads every solid fill back out of Figma and completes the palette before `tokens:build` sees it.

**Consequence:** `extract` invents names like `body-2`, `text-primary-5`, `accent-9`.
They are exact in value but meaningless in intent, and **they renumber as the file changes**.
Map them to semantic names we own.
**Never let a generated name reach a component** - a Figma edit would silently rewire the UI.

## Design token pipeline

1. Figma Desktop open with the duplicated Meet file, connected via `figma-cli connect` (Yolo Mode).
2. `npm run figma:pull` runs `figma-cli extract` into `.figma/` (gitignored): DESIGN.md with a machine-readable token block, plus PNG renders per frame.
3. A build step maps those synthesised tokens onto **our** semantic names and generates `src/design/tokens.css` and types.
4. `tokens.css` **is committed** so CI and teammates do not need Figma access, and so the Figma patch is not a prerequisite for building.
5. Regenerate and diff to catch drift.

Step 3 is a **real mapping step, not a passthrough**, because the file has no variables.
That mapping is the one place a human decides what a colour *means*.

Tokens hold **values** (colours, radii, spacing, type ramp).
Layout and responsiveness live in component CSS via media and container queries.
**Do not put layout in tokens.**

## Reference links

Our duplicated copy - **this is the one open in Figma Desktop**:
https://www.figma.com/design/QI7o5Y9nfKTqmOKsM2vAap/Product-UIs-Part-1--Gmail--Slack--Google-Meet--and-Google-Docs--Community---Copy-

Original community file:
https://www.figma.com/design/kEXLAF1GbpB37qQqEpQ59H/Product-UIs-Part-1--Gmail--Slack--Google-Meet--and-Google-Docs--Community-?node-id=70-9326

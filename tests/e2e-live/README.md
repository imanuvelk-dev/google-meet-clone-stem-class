# The live suite

Real VideoSDK rooms, real media, two browsers.
Everything else belongs in `tests/e2e/` against the fake.

```bash
npm run test:e2e:live
```

## It burns VideoSDK minutes

That is why it is one test.
It joins one room twice and asserts everything against that single meeting.
**Adding a test here means adding a join.**
Before you add one, ask whether the fake suite can prove it - it usually can.

## What it needs

Real credentials in `.env`:

```
VIDEOSDK_API_KEY=...
VIDEOSDK_SECRET=...
```

Server-only. **Never prefix them with `VITE_`** - that ships them in the bundle.
Without them the server exits immediately and says so, rather than failing later as an unexplained 500.

## Why it does not use `vercel dev`

`api/token` and `api/rooms` are Vercel handlers, so plain `vite` does not serve them, and the config used to start `vercel dev`.
`vercel dev` demands an interactive Vercel device-code login before it serves anything, which no CI and no fresh clone can answer.

So `server.ts` serves the app through Vite in middleware mode and dispatches `/api/*` to the same default-exported handlers Vercel calls.
It is not a Vercel emulator and must not become one.
VideoSDK is what this suite tests; Vercel's dev emulator is not.

## Both contexts are handed the same host grant

A second browser joining a room it did not create gets a guest token (`ask_join`) and waits at "connecting" forever, because Phase 2 has no lobby to admit it.
Both contexts therefore share the creator's host grant and both mint host tokens.

The grant is bearer-shaped by design and is not the SDK's notion of identity, so this is sound: `participantId` is per-tab `sessionStorage`, so the two contexts still get distinct ids and cannot evict each other.
The test asserts both halves rather than trusting them.

## The fake-media flag is spelled differently here

This suite passes `--use-fake-device-for-media-stream`.
The rest of the project passes `--use-fake-device-for-media-capture`, **which is not a Chrome switch**: it is silently ignored, and the browser opens the real camera and microphone.

Check it yourself - launch Chromium with each and call `enumerateDevices()`.
The `-capture` spelling lists real hardware; this one lists `fake_device_0`.

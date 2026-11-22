import { defineConfig, devices } from '@playwright/test'

/**
 * Real-SDK suite against live VideoSDK rooms.
 * KEEP IT SMALL - it burns VideoSDK minutes. Most coverage belongs in
 * playwright.config.ts against the fake.
 *
 * Needs VIDEOSDK_API_KEY and VIDEOSDK_SECRET, because it serves the real api/
 * handlers. See tests/e2e-live/server.ts for why that is not `vercel dev`.
 */
const port = Number(process.env.LIVE_PORT ?? 3111)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  // One test, and it is a whole two-party meeting: two joins, a screen share and
  // a leave, each waiting on a real server rather than a fake.
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'live-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            /*
             * NOT --use-fake-device-for-media-capture, which is what the rest of
             * the project passes and what CLAUDE.md documents. That is not a
             * Chrome switch. Chrome ignores unknown switches silently, so it
             * reads as working while the browser opens the real webcam and mic.
             * Verified here by enumerateDevices: with the -capture spelling it
             * lists "FaceTime HD Camera"; with this one, "fake_device_0".
             *
             * This suite depends on the difference twice over. The fake mic emits
             * a tone, which is the only reason "they hear each other" can mean
             * anything; and CI has no camera at all.
             */
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            // getDisplayMedia opens a native picker no test can click. This
            // answers it, and is the only reason screen share is testable here.
            '--auto-select-desktop-capture-source=Entire screen',
          ],
        },
      },
    },
  ],
  webServer: {
    // Not `npm run dev:vercel`: `vercel dev` demands an interactive Vercel login
    // before it will serve anything, which no CI and no fresh clone can answer.
    command: 'npx tsx tests/e2e-live/server.ts',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { LIVE_PORT: String(port) },
  },
})

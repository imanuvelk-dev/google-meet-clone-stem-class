import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against FakeCallClient and FakeMediaClient: fast, deterministic, no network.
 * The real-SDK suite lives in playwright.live.config.ts and burns VideoSDK minutes.
 */

/*
 * -stream, not -capture. Chrome has no ...-for-media-capture switch and ignores
 * unknown ones in silence, so the misspelling we shipped read as working while
 * every run drove the real webcam and microphone. Enumerating proves it: the
 * wrong spelling lists "FaceTime HD Camera", the right one "fake_device_0".
 */
const fakeMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
]

const port = Number(process.env.E2E_PORT ?? 5273)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial on CI for stable screenshots; Playwright's default parallelism locally.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],
  expect: {
    // Fidelity gate. Anti-aliasing differs across machines, so allow a hair of
    // per-pixel drift but keep the total budget tight.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The Figma desktop frames are 1728x1117. Visual diffs are meaningless
        // at any other width, so this must track the Figma canvas exactly.
        viewport: { width: 1728, height: 1117 },
        launchOptions: { args: fakeMediaArgs },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: fakeMediaArgs },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

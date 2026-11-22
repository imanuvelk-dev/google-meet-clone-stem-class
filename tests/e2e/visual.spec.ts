import { expect, test } from '@playwright/test'

/**
 * The fidelity gate.
 *
 * figma:diff cannot do this job: it needs Figma PNGs and a dev server, so it is
 * a local tool that answers "how far are we from the design?". These baselines
 * answer a different question -- "did this change move something nobody meant to
 * move?" -- and they are the only check that runs unattended.
 *
 * Baselines are generated on macOS and committed. They WILL fail on any other
 * platform, because font rasterisation and anti-aliasing are not portable. That
 * is a known, accepted trade-off, not a bug to work around by loosening the
 * threshold: see the README. Whoever adds CI regenerates them there.
 *
 * Only screens the user has actually approved belong here. A baseline defends
 * whatever it recorded, so baselining an unreviewed screen freezes a guess into
 * a test that then fails whenever anyone corrects it. Precall (desktop and
 * mobile) was reviewed and approved in Phase 1. The landing page has never been
 * shown to anyone, and it is live-Meet-sourced, so it has no figma:diff to fall
 * back on either -- it is deliberately absent here until the user sees it.
 */
test.describe('visual baselines', () => {
  test('precall', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')

    // The device pickers are the last thing to populate, so they mark the point
    // the layout has stopped moving. On mobile they are hidden but present.
    await expect(page.getByTestId('device-row')).toBeAttached()
    await page.evaluate(() => document.fonts.ready)

    // Chrome's fake camera is a moving pattern, so the preview never matches
    // itself twice. Masked for the same reason figma:diff masks it: it is the
    // one region that cannot be deterministic, not a region we are hiding.
    await expect(page).toHaveScreenshot('precall.png', {
      mask: [page.getByTestId('camera-preview')],
    })
  })
})

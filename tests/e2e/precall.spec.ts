import { expect, test } from '@playwright/test'

test.describe('precall', () => {
  test('camera and mic start live, not muted', async ({ page }) => {
    // Regression: the fake produced a hand-rolled audio track, which Chrome
    // rejects, so the mic appeared permanently muted. jsdom could not catch it.
    await page.goto('/abc-defg-hij?fake=ok')

    await expect(page.getByTestId('toggle-microphone')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('toggle-camera')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the preview actually shows video frames', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    const video = page.getByTestId('preview-video')
    await expect(video).toBeVisible()

    // A black or absent stream would still render an element, so assert the
    // video has real dimensions and is playing.
    const state = await video.evaluate((element: HTMLVideoElement) => ({
      width: element.videoWidth,
      hasStream: element.srcObject !== null,
    }))
    expect(state.hasStream).toBe(true)
    expect(state.width).toBeGreaterThan(0)
  })

  test('mic toggles to muted and back', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    const mic = page.getByTestId('toggle-microphone')

    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'false')
  })

  test('blocked permission shows recovery instructions and NO retry button', async ({ page }) => {
    // The one-way door. A retry button here would provably do nothing.
    await page.goto('/abc-defg-hij?fake=blocked')

    await expect(page.getByTestId('media-error-permission-blocked')).toBeVisible()
    await expect(page.getByTestId('media-error-recovery-hint')).toBeVisible()
    await expect(page.getByTestId('media-error-retry')).toHaveCount(0)
  })

  test('denied permission offers a retry, since it can still be re-prompted', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=denied')

    await expect(page.getByTestId('media-error-permission-denied')).toBeVisible()
    await expect(page.getByTestId('media-error-retry')).toBeVisible()
  })

  test('no devices is its own state, not a generic error', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=no-devices')
    await expect(page.getByTestId('media-error-no-devices')).toBeVisible()
  })

  test('a device held by another app says so', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=in-use')
    await expect(page.getByTestId('media-error-device-in-use')).toBeVisible()
  })

  test('a blocked mic still gives a camera preview', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=mic-blocked')

    await expect(page.getByTestId('preview-video')).toBeVisible()
    await expect(page.getByTestId('toggle-microphone')).toHaveAttribute('aria-pressed', 'true')
  })

  test('device picker lists and switches cameras', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')

    await expect(page.getByTestId('device-row')).toBeVisible()

    await page.getByRole('button', { name: 'Camera', exact: true }).click()
    await expect(page.getByRole('menuitemradio')).toHaveCount(2)
    await page.getByRole('menuitemradio', { name: 'HD Pro Webcam C920' }).click()

    await expect(page.getByRole('button', { name: 'Camera', exact: true })).toContainText(
      'HD Pro Webcam C920',
    )
  })

  test('mobile keeps Join reachable without scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only')

    await page.goto('/abc-defg-hij?fake=ok')
    await page.getByTestId('display-name-input').fill('Zishan')

    // The one action you came for must not be below the fold.
    const join = page.getByTestId('join-button')
    const box = await join.boundingBox()
    const viewport = page.viewportSize()

    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  })

  test('mobile puts the meeting title above the preview', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile layout only')

    await page.goto('/abc-defg-hij?fake=ok')

    const title = await page.getByRole('heading', { level: 1 }).boundingBox()
    const preview = await page.getByTestId('camera-preview').boundingBox()

    expect(title!.y).toBeLessThan(preview!.y)
  })

  test('exactly one h1, on both layouts', async ({ page }) => {
    // The title moves between columns by grid area rather than being rendered
    // twice and hidden per breakpoint, which would put two page headings in the
    // accessibility tree.
    await page.goto('/abc-defg-hij?fake=ok')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test('a poor connection warns before you join', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=poor-network')

    await expect(page.getByTestId('network-warning')).toBeVisible()
    // Warning, not a blocker: a bad connection is still a joinable one.
    await page.getByTestId('display-name-input').fill('Zishan')
    await expect(page.getByTestId('join-button')).toBeEnabled()
  })

  test('a healthy connection says nothing at all', async ({ page }) => {
    // The banner is worth nothing if it is always there. The pre-call test
    // resolves asynchronously, so assert after the page has settled rather than
    // catching the gap before it would have appeared.
    await page.goto('/abc-defg-hij?fake=ok')
    await expect(page.getByTestId('device-row')).toBeAttached()

    await expect(page.getByTestId('network-warning')).toHaveCount(0)
  })

  test('join is disabled until a name is entered', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')

    await expect(page.getByTestId('join-button')).toBeDisabled()
    await page.getByTestId('display-name-input').fill('Zishan')
    await expect(page.getByTestId('join-button')).toBeEnabled()
  })
})

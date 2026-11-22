import { expect, test } from '@playwright/test'

test('landing loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('landing')).toBeVisible()
})

test('precall loads with a camera preview', async ({ page }) => {
  await page.goto('/abc-defg-hij?fake=ok')
  await expect(page.getByTestId('precall')).toBeVisible()
  await expect(page.getByTestId('preview-video')).toBeVisible()
})

test('the camera Chrome hands us is a fake one, not the real webcam', async ({ page }) => {
  /*
   * This asserted only that SOME videoinput existed, which is true of any
   * machine with a webcam. It passed for two months while the flag was
   * misspelled and every run drove the real camera, and it would have failed on
   * CI, which has no camera at all - the one place it was supposed to help.
   *
   * Labels need a granted permission to be readable, hence getUserMedia first.
   */
  await page.goto('/')
  const cameras = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    const devices = await navigator.mediaDevices.enumerateDevices()
    stream.getTracks().forEach((track) => track.stop())
    return devices.filter((d) => d.kind === 'videoinput').map((d) => d.label)
  })

  expect(cameras.length).toBeGreaterThan(0)
  expect(cameras.every((label) => /fake/i.test(label))).toBe(true)
})

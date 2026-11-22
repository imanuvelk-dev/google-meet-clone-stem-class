import { expect, test } from '@playwright/test'

/**
 * Captions is a Phase-plan-mandated flow: the overlay's rolling lines and its
 * on/off toggle are the two things that break silently and are tedious to check
 * by eye every time. Everything else about the overlay's pixels is verified by
 * hand in a browser, per the testing policy.
 *
 * `?fake=` turns fake mode on and picks the media scenario; `?fake_call=`
 * picks the call scenario. Both are needed: without `?fake=`, Join would fall
 * through to the real client and hit /api/token and VideoSDK.
 */

type Page = import('@playwright/test').Page

/**
 * Desktop only, same reason as collaboration.spec.ts: the control bar hides its
 * entire centre group's newly-real controls under 900px, and captions joined
 * reactions and raise-hand there the moment it stopped being aria-disabled.
 * Task 13 owns the mobile sheet; delete this once that lands.
 */
test.skip(
  ({ isMobile }) => isMobile === true,
  'Captions is unreachable on mobile until task 13 builds the sheet',
)

const join = async (page: Page, name = 'Zishan') => {
  await page.getByTestId('display-name-input').fill(name)
  await page.getByTestId('join-button').click()
}

interface FakeCallHandle {
  simulateCaption: (participantId: string, text: string) => void
}

const fakeCall = (page: Page) =>
  page.evaluateHandle(() => {
    const client = (window as unknown as { __fakeCall?: unknown }).__fakeCall
    if (!client) throw new Error('No fake call client on window. Did the join succeed?')
    return client as FakeCallHandle
  })

const captionLines = (page: Page) =>
  page
    .getByTestId('captions-overlay')
    .evaluate((overlay) =>
      [...overlay.querySelectorAll('p')].map((row) =>
        (row.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
      ),
    )

test.describe('captions', () => {
  test('toggling on shows speaker-labeled rolling lines, and toggling off hides them', async ({
    page,
  }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=captions')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    const toggle = page.getByTestId('control-captions')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('captions-overlay')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    const handle = await fakeCall(page)
    await handle.evaluate((client) => client.simulateCaption('remote-1', 'hello there'))
    await expect.poll(() => captionLines(page)).toHaveLength(1)
    expect((await captionLines(page))[0]).toContain('Ada Lovelace')
    expect((await captionLines(page))[0]).toContain('hello there')

    await handle.evaluate((client) => client.simulateCaption('local-1', 'hi back'))
    await expect.poll(() => captionLines(page)).toHaveLength(2)
    const lines = await captionLines(page)
    expect(lines.some((line) => line.startsWith('You') && line.includes('hi back'))).toBe(true)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('captions-overlay')).toHaveCount(0)
  })
})

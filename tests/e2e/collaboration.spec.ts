import { expect, test } from '@playwright/test'

/**
 * Phase 3's four mandated flows, against the fake call client.
 *
 * Four and no more, by the plan: everything else in the phase - the reactions
 * animation, the picker, the host-absent message, mute-all, the REC indicator,
 * every panel on mobile - is driven in a browser by hand instead. These four
 * are here because each one breaks silently and is tedious to check by eye.
 *
 * `?fake=` turns fake mode on and picks the media scenario; `?fake_call=` picks
 * the call scenario. Both are needed: without `?fake=`, Join would fall through
 * to the real client and hit /api/token and VideoSDK.
 */

type Page = import('@playwright/test').Page

/**
 * Desktop only, and that is a statement about the product rather than the test.
 *
 * Three of these four reach a panel through Chat or People, and the control bar
 * hides its entire right group under 900px: on a phone those buttons do not
 * exist to click. That is deliberate and current - the bar's mobile rule is
 * marked provisional, and Meet puts these behind a sheet on mobile web, which
 * task 13 owns and nobody has built.
 *
 * Skipped with a reason rather than quietly passing a desktop-shaped assertion
 * on a phone. When task 13 lands the sheet, delete this and let them run.
 */
test.skip(
  ({ isMobile }) => isMobile === true,
  'Chat and People are unreachable on mobile until task 13 builds the sheet',
)

const join = async (page: Page, name = 'Zishan') => {
  await page.getByTestId('display-name-input').fill(name)
  await page.getByTestId('join-button').click()
}

/**
 * The fake's simulate* hooks and assertion surfaces, which `?fake_call=` parks
 * on window in DEV.
 *
 * A scenario describes the world at time zero. A backfill landing after you
 * joined, or a hand going down, happens afterwards, and this is the only way to
 * make it happen on cue.
 */
interface FakeCallHandle {
  simulateChatMessage: (message: { senderId: string; senderName: string; text: string }) => void
  simulateChatHistory: (
    messages: readonly { senderId: string; senderName: string; text: string; timestamp: number }[],
  ) => void
  simulateHandRaise: (participantId: string, raised: boolean) => void
  getParticipant: (participantId: string) => { micOn: boolean } | null
  readonly micRequestedParticipantIds: readonly string[]
  readonly admittedParticipantIds: readonly string[]
}

const fakeCall = (page: Page) =>
  page.evaluateHandle(() => {
    const client = (window as unknown as { __fakeCall?: unknown }).__fakeCall
    // Never silently: a test that quietly simulated nothing would pass by
    // asserting on a world that never changed.
    if (!client) throw new Error('No fake call client on window. Did the join succeed?')
    return client as FakeCallHandle
  })

/** The rendered log, oldest first. Sender and text per row, so order is assertable. */
const chatRows = (page: Page) =>
  page
    .getByTestId('chat-log')
    .evaluate((log) =>
      [...log.querySelectorAll('li')].map((row) =>
        (row.textContent ?? '').replaceAll(/\s+/g, ' ').trim(),
      ),
    )

/**
 * Chat history reaching a late joiner.
 *
 * The merge is the thing under test, not the rendering. Chat arrives from two
 * sources that disagree about completeness - live `messages` and the
 * `onOldMessagesReceived` backfill - and which one carries the history is not
 * established by the docs, so the store merges rather than replaces. This drives
 * `simulateChatHistory`, which feeds the history bucket, rather than leaning on
 * the scenario's time-zero array: a pre-baked array arrives before anything is
 * live and so never exercises the merge at all.
 */
test.describe('chat history', () => {
  test('a backfill landing after a live message merges instead of replacing it', async ({
    page,
  }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=chat-history')
    await join(page)
    await page.getByTestId('control-chat').click()
    await expect(page.getByTestId('chat-panel')).toBeVisible()

    // The scenario's history, which reached us purely by joining late.
    await expect.poll(() => chatRows(page)).toHaveLength(3)
    expect((await chatRows(page)).join('\n')).toContain(
      'Morning - starting a couple of minutes late.',
    )

    const handle = await fakeCall(page)

    // A live message, appended after the history was already on screen.
    await handle.evaluate((client) =>
      client.simulateChatMessage({
        senderId: 'remote-2',
        senderName: 'Grace Hopper',
        text: 'Here now.',
      }),
    )
    await expect.poll(() => chatRows(page)).toHaveLength(4)

    // Now the backfill lands late, carrying one message nobody had yet. This is
    // the ordering hazard the store exists to survive: a replacing mutator would
    // drop the live message, and an index-keyed log would renumber every row.
    await handle.evaluate((client) =>
      client.simulateChatHistory([
        {
          senderId: 'remote-1',
          senderName: 'Ada Lovelace',
          text: 'Sent this before you arrived.',
          timestamp: 1_699_999_999_000,
        },
        {
          senderId: 'remote-1',
          senderName: 'Ada Lovelace',
          text: 'Morning - starting a couple of minutes late.',
          timestamp: 1_700_000_000_000,
        },
        {
          senderId: 'remote-1',
          senderName: 'Ada Lovelace',
          text: 'Grabbing the deck now.',
          timestamp: 1_700_000_001_000,
        },
        {
          senderId: 'remote-2',
          senderName: 'Grace Hopper',
          text: 'No rush, still joining.',
          timestamp: 1_700_000_002_000,
        },
      ]),
    )

    // Five, not four: the log never shrinks. Backfilled messages come first by
    // definition, and the live one is still last rather than lost or duplicated.
    await expect.poll(() => chatRows(page)).toHaveLength(5)
    const rows = await chatRows(page)
    expect(rows[0]).toContain('Sent this before you arrived.')
    expect(rows[4]).toContain('Here now.')
  })
})

/**
 * A raised hand surviving a late join.
 *
 * Hand raise is a log, not a boolean: a raise and a lower are both persisted
 * messages, and the answer is a fold over the log. The fake appends and folds
 * exactly as the store does, which is why this asserts anything at all - a
 * boolean-setting fake would make the derivation untested.
 */
test.describe('hand raise', () => {
  test('hands raised before you arrived are up when you join, and fold back down', async ({
    page,
  }) => {
    // remote-2 raised first, so it must sort above remote-1 in the panel.
    await page.goto('/abc-defg-hij?fake=ok&fake_call=hands-up')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    // Survived the late join: neither raise happened while we were watching.
    await expect(page.getByTestId('participant-hand-remote-1')).toBeVisible()
    await expect(page.getByTestId('participant-hand-remote-2')).toBeVisible()

    await page.getByTestId('control-people').click()
    await expect(page.getByTestId('people-panel')).toBeVisible()

    // Order is the assertion, and it comes from the log rather than the roster.
    const order = await page
      .getByTestId('people-list')
      .evaluate((list) =>
        [...list.querySelectorAll('li')].map((row) =>
          (row as HTMLElement).dataset.testid?.replace('person-', ''),
        ),
      )
    expect(order.slice(0, 2)).toEqual(['remote-2', 'remote-1'])

    // A lower is another entry in the same log, so the fold has to run again.
    // Only remote-1's hand moves: the tile reads its own handRaised, not the queue.
    const handle = await fakeCall(page)
    await handle.evaluate((client) => client.simulateHandRaise('remote-1', false))

    await expect(page.getByTestId('participant-hand-remote-1')).toBeHidden()
    await expect(page.getByTestId('participant-hand-remote-2')).toBeVisible()
  })
})

/**
 * Knock -> admit.
 *
 * The card clears when the admitted guest ARRIVES IN THE ROSTER, not when the
 * host clicks. That is deliberate: allow() fired at a guest who already left
 * produces no arrival, so the card correctly stays rather than vanishing into a
 * lie. The fake's allow() joins the participant, so clicking admit here
 * traverses the real clearing path - a fake that cleared on click would make
 * this pass for the wrong reason.
 */
test.describe('the lobby', () => {
  test('admitting a knock clears its card only once the guest is in the roster', async ({
    page,
  }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=lobby-host')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    await expect(page.getByTestId('lobby-knock-knock-1')).toBeVisible()
    await expect(page.getByTestId('lobby-knock-knock-2')).toBeVisible()
    await expect(page.getByTestId('participant-tile-knock-1')).toHaveCount(0)

    await page.getByTestId('lobby-admit-knock-1').click()

    // The arrival is what the clearing hangs on, so it is asserted rather than
    // assumed: the card going away with nobody in the roster would be the bug.
    await expect(page.getByTestId('participant-tile-knock-1')).toBeVisible()
    await expect(page.getByTestId('lobby-knock-knock-1')).toHaveCount(0)

    // The other knock is untouched. Admitting is per-participant, and a card
    // list that cleared wholesale would still have passed everything above.
    await expect(page.getByTestId('lobby-knock-knock-2')).toBeVisible()

    const handle = await fakeCall(page)
    expect(await handle.evaluate((client) => [...client.admittedParticipantIds])).toEqual([
      'knock-1',
    ])
  })
})

/**
 * A host cannot force-unmute.
 *
 * The PRIMARY guarantee is not this spec: it is that CallClient has no
 * `unmuteParticipant` method at all, which is what makes the bug unwritable. The
 * SDK's enableMic() does not enable anything - it asks, firing onMicRequested on
 * the target - so the seam renames it requestParticipantMic, and this is the
 * runtime half of that rename.
 *
 * Driven through the menu rather than by calling the client, so what is under
 * test is the app's only available path. Calling requestParticipantMic from the
 * test and then asserting it landed would only prove the fake records its own
 * arguments.
 */
test.describe('host controls', () => {
  test('asking a muted participant to unmute does not unmute them', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=nine')
    await join(page)
    await page.getByTestId('control-people').click()
    await expect(page.getByTestId('people-panel')).toBeVisible()

    const handle = await fakeCall(page)
    expect(await handle.evaluate((client) => client.getParticipant('remote-1')?.micOn)).toBe(false)

    await page.getByTestId('person-menu-remote-1').click()
    await page.getByTestId('person-ask-unmute-remote-1').click()

    // The request went out...
    await expect
      .poll(async () => handle.evaluate((client) => [...client.micRequestedParticipantIds]))
      .toEqual(['remote-1'])

    // ...and changed nothing about their microphone. The target decides, and
    // there is no path from here that could decide for them: the seam has no
    // unmuteParticipant, which is the primary guarantee. This is its runtime
    // half - that the method we DO have only asks.
    expect(await handle.evaluate((client) => client.getParticipant('remote-1')?.micOn)).toBe(false)
    await expect(page.getByTestId('person-muted-remote-1')).toBeVisible()
  })
})

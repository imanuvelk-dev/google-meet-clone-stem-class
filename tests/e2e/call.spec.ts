import { expect, test } from '@playwright/test'

/**
 * The precall -> in-call transition, against the fake call client.
 *
 * `?fake=` turns fake mode on and picks the media scenario; `?fake_call=` picks
 * the call scenario. Both are needed: without `?fake=`, Join would fall through
 * to the real client and hit /api/token and VideoSDK.
 */

type Page = import('@playwright/test').Page

const join = async (page: Page, name = 'Zishan') => {
  await page.getByTestId('display-name-input').fill(name)
  await page.getByTestId('join-button').click()
}

/**
 * The fake's simulate* hooks, which `?fake_call=` parks on window in DEV.
 *
 * A scenario describes the world at time zero. Someone joining mid-call or
 * muting happens afterwards, and this is the only way to make it happen on cue.
 */
interface FakeCallHandle {
  simulateParticipantJoined: (participant: {
    id: string
    displayName: string
    micOn?: boolean
    webcamOn?: boolean
  }) => void
  simulateMedia: (id: string, media: { micOn?: boolean; webcamOn?: boolean }) => void
}

const fakeCall = (page: Page) =>
  page.evaluateHandle(() => {
    const client = (window as unknown as { __fakeCall?: unknown }).__fakeCall
    // Never silently: a test that quietly simulated nothing would pass by
    // asserting on a world that never changed.
    if (!client) throw new Error('No fake call client on window. Did the join succeed?')
    return client as FakeCallHandle
  })

const addLateJoiner = async (page: Page, id = 'late-1') => {
  const handle = await fakeCall(page)
  await handle.evaluate((client, participantId) => {
    client.simulateParticipantJoined({
      id: participantId,
      displayName: 'Grace Hopper',
      micOn: true,
      webcamOn: true,
    })
  }, id)
}

const simulateMedia = async (page: Page, id: string, media: { micOn?: boolean }) => {
  const handle = await fakeCall(page)
  await handle.evaluate((client, args) => client.simulateMedia(args.id, args.media), { id, media })
}

/**
 * Makes play() reject exactly as Chrome's autoplay policy makes it reject, and
 * parks __unblockPlay on window to put it back.
 *
 * Swaps the property descriptor rather than saving the method: a bare reference
 * to HTMLMediaElement.prototype.play is an unbound method, and restoring the
 * descriptor is closer to what is meant anyway - the original is never called by
 * this script, only reinstated.
 */
const blockAutoplay = (context: import('@playwright/test').BrowserContext) =>
  context.addInitScript(() => {
    const real = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: () => {
        const error = new Error('play() failed because the user did not interact first')
        error.name = 'NotAllowedError'
        return Promise.reject(error)
      },
    })
    ;(window as unknown as { __unblockPlay?: () => void }).__unblockPlay = () => {
      if (real) Object.defineProperty(HTMLMediaElement.prototype, 'play', real)
    }
  })

/**
 * The device pickers, on whichever viewport is running.
 *
 * The row is shown inline under the preview on both desktop and mobile.
 */
const openDeviceRow = async (page: Page) => {
  const deviceRow = page.getByTestId('device-row')
  await expect(deviceRow).toBeVisible()
  return deviceRow
}

test.describe('joining', () => {
  test('the Join button actually enters the call', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)

    await expect(page.getByTestId('call')).toBeVisible()
    await expect(page.getByTestId('precall')).toBeHidden()
  })

  test('the URL does not change on join, as real Meet does not', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    expect(new URL(page.url()).pathname).toBe('/abc-defg-hij')
  })

  test('the camera keeps running across the transition', async ({ page }) => {
    // The whole reason precall and the call share a route. A real browser is the
    // only place this is provable: jsdom has no media capture at all.
    await page.goto('/abc-defg-hij?fake=ok')

    const before = await page.getByTestId('preview-video').evaluate((video: HTMLVideoElement) => {
      const stream = video.srcObject as MediaStream | null
      const track = stream?.getVideoTracks()[0]
      if (!track) throw new Error('precall had no camera track to hand over')
      // Park it where the next evaluate can find it after precall is gone.
      ;(window as unknown as { handedOver?: MediaStreamTrack }).handedOver = track
      return track.readyState
    })
    expect(before).toBe('live')

    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    const after = await page.evaluate(
      () => (window as unknown as { handedOver?: MediaStreamTrack }).handedOver?.readyState,
    )
    expect(after).toBe('live')
  })

  test('joining is disabled until a name is entered', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')

    await expect(page.getByTestId('join-button')).toBeDisabled()
    await page.getByTestId('display-name-input').fill('Zishan')
    await expect(page.getByTestId('join-button')).toBeEnabled()
  })

  test('the connecting state is shown before the meeting is up', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=slow-connect')
    await join(page)

    await expect(page.getByTestId('call-connecting')).toBeVisible()
    await expect(page.getByTestId('stage')).toBeHidden()
  })

  test('a dead token endpoint says so instead of hanging', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=token-fails')
    await join(page)

    await expect(page.getByTestId('join-failed')).toBeVisible()
  })

  test('a failed join can go back to a still-live green room', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=token-fails')
    await join(page)
    await expect(page.getByTestId('join-failed')).toBeVisible()

    await page.getByTestId('join-failed-back').click()

    // The tracks were never handed over, so the preview must still be playing.
    const preview = page.getByTestId('preview-video')
    await expect(preview).toBeVisible()
    const width = await preview.evaluate((video: HTMLVideoElement) => video.videoWidth)
    expect(width).toBeGreaterThan(0)
  })

  test('a failed connection lands on the failure screen', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=join-fails')
    await join(page)

    await expect(page.getByTestId('post-call')).toBeVisible()
    await expect(page.getByText('Could not connect to the meeting')).toBeVisible()
  })
})

test.describe('in the call', () => {
  test('the call surface is dark, not the light precall theme', async ({ page }) => {
    // The in-call screen is an always-dark SURFACE, not a dark theme. Rendering
    // it light would be a real regression. See CLAUDE.md.
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    const background = await page
      .getByTestId('call')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(background).toBe('rgb(0, 0, 0)')
  })

  test('leaving reaches the post-call screen', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)
    await page.getByTestId('leave-button').click()

    await expect(page.getByTestId('post-call')).toBeVisible()
    await expect(page.getByText('You left the meeting')).toBeVisible()
  })

  test('post-call can return to the home screen', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)
    await page.getByTestId('leave-button').click()
    await page.getByTestId('return-home').click()

    await expect(page.getByTestId('landing')).toBeVisible()
  })
})

/**
 * The stage. One spec, and the plan names it: a paginated-away participant whose
 * stream is still flowing is a silent bandwidth leak that looks completely fine
 * on screen, so it is the one thing here that cannot be caught by driving the
 * browser and looking at it.
 *
 * Everything else about the grid was verified by eye at 1, 2, 4, 9, 20 and 50
 * participants. A spec asserting a tile count would only restate the arithmetic.
 */
test.describe('the stage', () => {
  test('paginated-away participants stop costing bandwidth', async ({ page }) => {
    // Fifty: the local participant plus 49 remotes, which is one more than Meet's
    // 49-tile page holds. The 50th is the whole point.
    await page.goto('/abc-defg-hij?fake=ok&fake_call=fifty')
    await join(page)
    await expect(page.getByTestId('tile-grid')).toBeVisible()

    await expect(page.getByTestId('page-counter')).toHaveText('1 / 2')

    const offPage = await page.evaluate(() => {
      const client = (window as unknown as { __fakeCall?: FakeCallStreams }).__fakeCall
      if (!client) throw new Error('No fake call client on window. Did the join succeed?')
      const onScreen = [...document.querySelectorAll('[data-testid^="participant-tile-"]')].map(
        (tile) => (tile as HTMLElement).dataset.testid?.replace('participant-tile-', ''),
      )
      return {
        onScreen: onScreen.length,
        // The mic is deliberately absent: CallAudio sits outside the stage so a
        // paginated-away participant is still heard, and pausing their mic here
        // would undo that from the other end.
        paused: [...client.pausedStreams],
      }
    })

    expect(offPage.onScreen).toBe(49)
    expect(offPage.paused).toEqual(['remote-49:webcam'])

    // And resuming is not a one-way door: paging to them has to undo it, or the
    // leak becomes a participant who is permanently frozen.
    await page.getByTestId('page-next').click()
    await expect(page.getByTestId('page-counter')).toHaveText('2 / 2')

    const secondPage = await page.evaluate(() => {
      const client = (window as unknown as { __fakeCall?: FakeCallStreams }).__fakeCall
      return [...client!.pausedStreams].sort()
    })

    expect(secondPage).not.toContain('remote-49:webcam')
    expect(secondPage).toHaveLength(48)
  })
})

interface FakeCallStreams {
  pausedStreams: Set<string>
}

/**
 * The one M7 spec, and it is here for a reason the others are not: it guards a
 * requirement that cannot fail today and will fail silently later.
 *
 * The call has no text input yet - chat is Phase 3 - so the typing guard is
 * currently unreachable by hand. The day someone adds a composer, a missing
 * guard means typing "don't" mutes the room mid-sentence: nothing looks broken,
 * nothing throws, and the person typing has no idea why they went quiet. So the
 * input is injected rather than waited for. Everything else about the shortcuts
 * was driven in a browser instead.
 */
test.describe('keyboard shortcuts', () => {
  const mediaState = (page: Page) =>
    page.evaluate(() => {
      const client = (window as unknown as { __fakeCall?: FakeCallMedia }).__fakeCall
      if (!client) throw new Error('No fake call client on window. Did the join succeed?')
      const state = client.getState()
      return { micOn: state.localMicOn, webcamOn: state.localWebcamOn }
    })

  test('Ctrl+D mutes and Ctrl+E stops the camera', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()
    expect(await mediaState(page)).toEqual({ micOn: true, webcamOn: true })

    await page.keyboard.press('ControlOrMeta+d')
    await expect.poll(async () => (await mediaState(page)).micOn).toBe(false)

    await page.keyboard.press('ControlOrMeta+e')
    await expect.poll(async () => (await mediaState(page)).webcamOn).toBe(false)
  })

  test('typing in an input never fires them', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    // Stands in for Phase 3's chat composer. Delete this line, not the test,
    // once there is a real input in the call to focus.
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'typing-probe'
      document.body.append(input)
      input.focus()
    })

    await page.keyboard.press('ControlOrMeta+d')
    await page.keyboard.press('ControlOrMeta+e')

    // Unchanged from the joined-on state: had the guard leaked, both would be off.
    expect(await mediaState(page)).toEqual({ micOn: true, webcamOn: true })

    // And the listener is alive, so it was the guard that stopped it rather than
    // a handler that had quietly stopped working.
    await page.evaluate(() => document.getElementById('typing-probe')?.remove())
    await page.keyboard.press('ControlOrMeta+d')
    await expect.poll(async () => (await mediaState(page)).micOn).toBe(false)
  })
})

interface FakeCallMedia {
  getState: () => { localMicOn: boolean; localWebcamOn: boolean }
}

/**
 * Audio. Every assertion here reads real browser state - element.paused,
 * element.muted, element.sinkId, the live MediaStreamTrack - because a mock
 * that confirms we called our own setter proves nothing about whether anyone can
 * hear anything. What a browser still cannot answer is covered in the report and
 * in the M9 live suite: see the note on the autoplay flag below.
 */
test.describe('audio', () => {
  const audioState = (page: import('@playwright/test').Page, testId: string) =>
    page.getByTestId(testId).evaluate((element: HTMLAudioElement) => {
      const stream = element.srcObject as MediaStream | null
      const track = stream?.getAudioTracks()[0]
      return {
        muted: element.muted,
        paused: element.paused,
        sinkId: element.sinkId,
        trackKind: track?.kind ?? null,
        trackState: track?.readyState ?? null,
      }
    })

  test('a remote participant gets a live, playing audio element', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    const state = await audioState(page, 'participant-audio-remote-1')

    // paused:false is the load-bearing one. It is the browser saying playback
    // actually started, rather than us saying we asked for it.
    expect(state).toMatchObject({
      muted: false,
      paused: false,
      trackKind: 'audio',
      trackState: 'live',
    })
  })

  test('your own microphone is never played back at you', async ({ page }) => {
    // The feedback loop, which is the one bug in this milestone that is genuinely
    // unpleasant for whoever hits it. The local participant has a live mic track
    // in this scenario, so the absence of an element is a real result: there is
    // something to play and we deliberately do not play it.
    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()
    await expect(page.getByTestId('participant-audio-remote-1')).toBeAttached()

    await expect(page.getByTestId('participant-audio-local-1')).toHaveCount(0)
    // Nothing anywhere on the page is playing the local mic back, however it got
    // there. Scoped by count rather than by testid so a future tile that renders
    // its own audio cannot slip past this.
    await expect(page.locator('audio')).toHaveCount(1)
  })

  test('a participant who joins mid-call becomes audible', async ({ page }) => {
    await page.goto('/abc-defg-hij?fake=ok')
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()
    await expect(page.locator('audio')).toHaveCount(0)

    await addLateJoiner(page)

    await expect(page.getByTestId('participant-audio-late-1')).toBeAttached()
    expect(await audioState(page, 'participant-audio-late-1')).toMatchObject({
      muted: false,
      paused: false,
      trackState: 'live',
    })
  })

  test('a muted participant has no audio element, and gets one when they unmute', async ({
    page,
  }) => {
    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('participant-audio-remote-1')).toBeAttached()

    await simulateMedia(page, 'remote-1', { micOn: false })
    await expect(page.getByTestId('participant-audio-remote-1')).toHaveCount(0)

    await simulateMedia(page, 'remote-1', { micOn: true })
    await expect(page.getByTestId('participant-audio-remote-1')).toBeAttached()
    expect(await audioState(page, 'participant-audio-remote-1')).toMatchObject({ paused: false })
  })

  test('the speaker chosen in precall routes the call audio', async ({ page }) => {
    // The inherited Phase 1 lie, disproved end to end: a click in the green room,
    // through the store, across the precall -> call transition, onto an element
    // that did not exist when the choice was made.
    //
    // element.sinkId is Chromium reporting which output it is actually using. It
    // is the strongest evidence available without ears, and it is not a mock:
    // Chromium rejects any id that is not a real device, which is exactly why
    // this scenario ships 'default' rather than the usual fake 'speaker-1'.
    await page.goto('/abc-defg-hij?fake=speaker-routing&fake_call=two-people')

    const deviceRow = await openDeviceRow(page)
    await deviceRow.getByRole('button', { name: 'Speakers' }).click()
    await page.getByRole('menuitemradio', { name: 'System Default Speakers' }).click()
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    await expect
      .poll(async () => (await audioState(page, 'participant-audio-remote-1')).sinkId)
      .toBe('default')
  })

  test('a participant who joins after the choice comes out of the chosen speaker', async ({
    page,
  }) => {
    // Routing is per element and elements outlive nothing: someone joining ten
    // minutes later must not come out of the wrong speaker.
    await page.goto('/abc-defg-hij?fake=speaker-routing')

    const deviceRow = await openDeviceRow(page)
    await deviceRow.getByRole('button', { name: 'Speakers' }).click()
    await page.getByRole('menuitemradio', { name: 'System Default Speakers' }).click()
    await join(page)
    await expect(page.getByTestId('call')).toBeVisible()

    await addLateJoiner(page)

    await expect
      .poll(async () => (await audioState(page, 'participant-audio-late-1')).sinkId)
      .toBe('default')
  })

  test('blocked audio says so, and the prompt actually recovers it', async ({ browser }) => {
    /*
     * The one test here that simulates rather than observes, and the seam is
     * chosen deliberately.
     *
     * Chrome's autoplay policy cannot be provoked in this flow: user activation
     * is sticky per document, and Join is a real click, so by the time any audio
     * exists the page is permanently activated. The suite also launches with
     * --autoplay-policy=no-user-gesture-required, so a passing e2e proves nothing
     * about real autoplay either way.
     *
     * So play() is made to reject exactly as the policy makes it reject. What is
     * under test is what we do with that rejection - that it is noticed at all,
     * and that the way out works - not the policy itself. That the rejection
     * looks like this in the wild is the part only a real blocked browser can
     * confirm.
     */
    const context = await browser.newContext()
    await blockAutoplay(context)
    const page = await context.newPage()

    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)

    // Silence with nothing saying why is the failure being prevented: the call
    // would look completely normal and nobody would be audible.
    await expect(page.getByTestId('audio-blocked')).toBeVisible()

    // Standing in for the user granting it, so the click that follows is the one
    // that has to do the work.
    await page.evaluate(() => (window as unknown as { __unblockPlay: () => void }).__unblockPlay())
    await page.getByTestId('audio-blocked-allow').click()

    await expect(page.getByTestId('audio-blocked')).toBeHidden()
    expect(await audioState(page, 'participant-audio-remote-1')).toMatchObject({ paused: false })

    await context.close()
  })

  test('the prompt stays until sound genuinely works', async ({ browser }) => {
    // Dismissing on the attempt rather than on the outcome would put us back to a
    // silent call with nothing saying why, which is the whole failure this path
    // exists to prevent.
    const context = await browser.newContext()
    await blockAutoplay(context)
    const page = await context.newPage()

    await page.goto('/abc-defg-hij?fake=ok&fake_call=two-people')
    await join(page)
    await expect(page.getByTestId('audio-blocked')).toBeVisible()

    // Never unblocked, so the retry genuinely fails.
    await page.getByTestId('audio-blocked-allow').click()

    await expect(page.getByTestId('audio-blocked')).toBeVisible()

    await context.close()
  })

  test('the speaker picker is hidden where the browser cannot route output', async ({
    browser,
  }) => {
    // Safari has no setSinkId, and it is typed in lib.dom, so it compiles fine
    // and then does nothing. Chromium cannot be made to be Safari, so the nearest
    // honest thing is to take setSinkId away and prove the UI notices.
    // Detection is a runtime read of the prototype, which is the same read
    // Safari fails.
    const context = await browser.newContext()
    await context.addInitScript(() => {
      // @ts-expect-error - removing a lib.dom method is the whole point.
      delete HTMLMediaElement.prototype.setSinkId
    })
    const page = await context.newPage()

    await page.goto('/abc-defg-hij?fake=ok')
    const deviceRow = await openDeviceRow(page)

    // The other two pickers still stand, so this is the speaker control being
    // withheld rather than the row failing to render.
    await expect(deviceRow.getByRole('button', { name: 'Speakers' })).toHaveCount(0)
    await expect(deviceRow.getByRole('button', { name: 'Microphone' })).toBeVisible()
    await expect(deviceRow.getByRole('button', { name: 'Camera' })).toBeVisible()

    await context.close()
  })
})

test.describe('fake scenarios', () => {
  test('an unknown call scenario throws rather than faking something else', async ({ page }) => {
    // A typo silently falling back to a working call would make a test pass for
    // the wrong reason.
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/abc-defg-hij?fake=ok&fake_call=nonsense')

    await expect.poll(() => errors.join('\n')).toContain('Unknown fake call scenario')
  })

  test('fake_call without fake refuses to run against a real room', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/abc-defg-hij?fake_call=ok')

    await expect.poll(() => errors.join('\n')).toContain('fake_call needs fake=')
  })
})

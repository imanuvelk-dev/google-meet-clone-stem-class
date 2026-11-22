import { expect, test, type APIRequestContext, type Browser, type Locator } from '@playwright/test'

/**
 * Two real browsers, one real VideoSDK room.
 *
 * This is the whole live suite, and it is deliberately ONE test. Every join costs
 * VideoSDK minutes, so things that could be separate tests are separate
 * assertions on one meeting instead. Adding a test here means adding a join.
 * Before you do, ask whether the fake suite can prove it - it usually can, and
 * only these cannot:
 *
 * - Two independent clients exchanging real media. The fake's contexts never meet.
 * - That a remote track carries sound. The fake has no audio.
 * - That the speaker picker routes. The fake has no sink.
 * - That pin does not broadcast. Two fake contexts are unconnected, so that test
 *   would pass even if we called the SDK's broadcasting pin() - passing for the
 *   wrong reason, which is worse than not testing it.
 * - That the bridges do not loop against the real SDK's re-render cadence.
 *
 * Needs real credentials. See tests/e2e-live/server.ts.
 */

const JOIN_TIMEOUT = 45_000

interface Room {
  roomId: string
  hostGrant: string
}

interface Participant {
  page: import('@playwright/test').Page
  participantId: string
  errors: string[]
  speakerId: string | null
}

async function createRoom(request: APIRequestContext): Promise<Room> {
  const response = await request.post('/api/rooms')
  expect(
    response.ok(),
    'POST /api/rooms failed. The live suite needs real VIDEOSDK_API_KEY and VIDEOSDK_SECRET in .env.',
  ).toBe(true)
  return (await response.json()) as Room
}

/**
 * A second browser joining a room it did not create gets a guest token
 * (`ask_join`) and sits at "connecting" forever: Phase 2 has no lobby, so nobody
 * can admit it. So both contexts are handed the SAME host grant, and both mint
 * host tokens (`allow_join`) and walk straight in.
 *
 * Sound rather than a fudge, because the grant is bearer-shaped by design -
 * whoever holds it is host - and it is NOT the SDK's notion of identity.
 * participantId is per-tab sessionStorage, so two contexts still get distinct
 * ids and cannot evict each other. Both halves are asserted rather than trusted:
 * the roles here, the ids in the test.
 */
async function join(
  browser: Browser,
  room: Room,
  name: string,
  { pickSpeaker = false } = {},
): Promise<Participant> {
  const context = await browser.newContext()
  await context.addInitScript(
    ([roomId, grant]) => localStorage.setItem(`meet-clone:host-grant:${roomId}`, grant ?? ''),
    [room.roomId, room.hostGrant],
  )

  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(`/${room.roomId}`)
  await page.getByTestId('display-name-input').fill(name)

  // Precall decides what the call is handed. A muted join would make the whole
  // audio half of this test assert on a stream nobody is sending.
  await expect(page.getByTestId('toggle-microphone')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('toggle-camera')).toHaveAttribute('aria-pressed', 'false')

  let speakerId: string | null = null
  if (pickSpeaker) speakerId = await chooseNonDefaultSpeaker(page)

  const token = page.waitForResponse('**/api/token')
  await page.getByTestId('join-button').click()

  const { role } = (await (await token).json()) as { role: string }
  expect(role, 'Both contexts must hold the host grant, or the second one blocks forever.').toBe(
    'host',
  )

  await expect(page.getByTestId('stage')).toBeVisible({ timeout: JOIN_TIMEOUT })

  const participantId = await page.evaluate(() =>
    sessionStorage.getItem('meet-clone:participant-id'),
  )
  expect(participantId).toBeTruthy()

  return { page, participantId: participantId ?? '', errors, speakerId }
}

/**
 * The speaker picker, driven for real, in the one place it is offered.
 *
 * Deliberately not the first entry: that is the default sink, and routing TO the
 * default proves nothing about routing. Chrome's fake devices provide two
 * further outputs, so there is always something real to move the audio to.
 */
async function chooseNonDefaultSpeaker(page: import('@playwright/test').Page): Promise<string> {
  const picker = page.getByRole('button', { name: 'Speakers' })
  await expect(
    picker,
    'setSinkId is supported in Chromium, so the picker must be here.',
  ).toBeVisible()
  await picker.click()

  const options = page.getByRole('menuitemradio')
  await expect(options.nth(1)).toBeVisible()
  await options.nth(1).click()

  const chosen = await page.evaluate(() => localStorage.getItem('meet-clone:speaker-device'))
  expect(chosen, 'Picking a speaker must record a device id.').toBeTruthy()
  expect(chosen).not.toBe('default')
  return chosen ?? ''
}

/**
 * Whether a remote track is carrying sound, not merely whether it exists.
 *
 * An <audio> element with a live track is what the fake suite can already
 * assert, and a live track that decodes to silence looks identical from the DOM.
 * So this taps the element's own stream with an AnalyserNode and reads the
 * waveform. Chrome's fake capture device emits a tone, so a working pipeline
 * peaks near 1.0 and a dead one reads flat zero.
 *
 * It does NOT prove a speaker moved. Nothing in a headless browser can. It
 * proves the audio arrived, decoded, and reached the graph the sink hangs off,
 * which is the last observable point before the hardware.
 */
async function peakAmplitude(audio: Locator): Promise<number> {
  return audio.evaluate(async (element: HTMLAudioElement) => {
    const stream = element.srcObject as MediaStream | null
    if (!stream) return 0

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    context.createMediaStreamSource(stream).connect(analyser)

    const samples = new Float32Array(analyser.fftSize)
    let peak = 0
    // The fake device beeps rather than holding a tone, so a single read can
    // land in a gap. This waits for sound, and only concludes silence after long
    // enough for several beeps to have been missed.
    const deadline = Date.now() + 6_000
    while (Date.now() < deadline && peak < 0.05) {
      analyser.getFloatTimeDomainData(samples)
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    await context.close()
    return peak
  })
}

test('two participants join one real room, see and hear each other, share, and leave', async ({
  browser,
  request,
}) => {
  const room = await createRoom(request)
  const ada = await join(browser, room, 'Ada Lovelace', { pickSpeaker: true })
  const grace = await join(browser, room, 'Grace Hopper')

  expect(
    ada.participantId,
    'One participantId in two contexts means VideoSDK evicts one of them. It is per-tab sessionStorage precisely to stop that.',
  ).not.toBe(grace.participantId)

  await test.step('they see each other', async () => {
    for (const [viewer, other] of [
      [ada, grace],
      [grace, ada],
    ] as const) {
      await expect(viewer.page.getByTestId(`participant-tile-${other.participantId}`)).toBeVisible({
        timeout: JOIN_TIMEOUT,
      })
      await expect(
        viewer.page.getByTestId(`participant-tile-${viewer.participantId}`),
      ).toBeVisible()
    }
  })

  await test.step('they hear each other, and never themselves', async () => {
    const remote = ada.page.getByTestId(`participant-audio-${grace.participantId}`)
    await expect(remote).toBeAttached({ timeout: JOIN_TIMEOUT })

    expect(
      await remote.evaluate((element: HTMLAudioElement) => {
        const [track] = (element.srcObject as MediaStream).getAudioTracks()
        return { kind: track?.kind, readyState: track?.readyState, muted: element.muted }
      }),
    ).toEqual({ kind: 'audio', readyState: 'live', muted: false })

    expect(
      await peakAmplitude(remote),
      "Grace's track reached Ada but carried no sound.",
    ).toBeGreaterThan(0.05)

    // The feedback loop from the other end. CallAudio filters the local
    // participant out of the list, so the element must not exist at all; the
    // muted attribute is the second, independent lock behind this one.
    await expect(ada.page.getByTestId(`participant-audio-${ada.participantId}`)).toHaveCount(0)
  })

  await test.step('the speaker chosen in precall routes the call audio', async () => {
    // The whole inherited item, end to end: a choice made outside MeetingProvider,
    // surviving into a call that is rendered inside it, landing on an element
    // that did not exist when it was made. A mock proves none of that.
    await expect(ada.page.getByTestId(`participant-audio-${grace.participantId}`)).toHaveJSProperty(
      'sinkId',
      ada.speakerId,
    )
  })

  await test.step('pin is local and only local', async () => {
    await ada.page.getByTestId(`participant-tile-${grace.participantId}`).hover()
    await ada.page.getByTestId(`participant-pin-${grace.participantId}`).click()
    // Which arrangement a pin lands in is the layout code's business and it has
    // changed once already. That it is no longer the grid is the whole claim.
    await expect(ada.page.getByTestId('stage')).not.toHaveAttribute('data-layout', 'tiled')

    // The reason this suite exists. The SDK's pin() broadcasts, so wiring it up
    // would rearrange Grace's screen from Ada's click. Two fake contexts are not
    // connected to each other, so a fake test passes either way.
    //
    // The wait IS the assertion: proving an event did not arrive means giving it
    // time to arrive, and the assertion below would pass on the first frame
    // regardless.
    await grace.page.waitForTimeout(3_000)
    await expect(grace.page.getByTestId('stage')).toHaveAttribute('data-layout', 'tiled')

    await ada.page.getByTestId(`participant-pin-${grace.participantId}`).click()
    await expect(ada.page.getByTestId('stage')).toHaveAttribute('data-layout', 'tiled')
  })

  await test.step('a screen share reaches the other side', async () => {
    await ada.page.getByTestId('toggle-screen-share').click()

    await expect(ada.page.getByTestId('presenting-card')).toBeVisible({ timeout: JOIN_TIMEOUT })
    // Not the presenting-card's twin: this is Ada's actual screen, decoded in
    // another browser.
    await expect(grace.page.getByTestId(`share-video-${ada.participantId}`)).toBeVisible({
      timeout: JOIN_TIMEOUT,
    })

    await ada.page.getByTestId('toggle-screen-share').click()
    await expect(grace.page.getByTestId('stage')).toHaveAttribute('data-layout', 'tiled', {
      timeout: JOIN_TIMEOUT,
    })
  })

  await test.step('leaving is visible to everyone', async () => {
    await ada.page.getByTestId('leave-button').click()
    await expect(ada.page.getByTestId('post-call')).toBeVisible()
    await expect(grace.page.getByTestId(`participant-tile-${ada.participantId}`)).toHaveCount(0, {
      timeout: JOIN_TIMEOUT,
    })
  })

  // The bridges push into CallStore on every render with no dependency array,
  // and CallStore diffs so the push does not become another render. That guard
  // is only exercised by the real SDK's re-render cadence, which the fake does
  // not reproduce, and when it fails React says so in exactly these words.
  for (const { page, errors } of [ada, grace]) {
    expect(errors.filter((error) => error.includes('Maximum update depth'))).toEqual([])
    await page.close()
  }
})

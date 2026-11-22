import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FakeCallClient, type FakeCallScenario } from '@meeting/FakeCallClient.ts'
import { FakeMediaClient } from '@meeting/FakeMediaClient.ts'
import { MediaProvider } from '@meeting/MediaProvider.tsx'
import type { CallSetup, CreateCall } from './createCall.ts'
import { Room } from './Room.tsx'

const MEETING_ID = 'abc-defg-hij'

interface Harness {
  scenario?: FakeCallScenario
  /** Stands in for a dead /api/token, which is the real way this fails. */
  createFails?: boolean
  onLocation?: (pathname: string) => void
}

const setup = ({ scenario = {}, createFails = false, onLocation }: Harness = {}) => {
  /** What Room asked for. The handoff is only assertable from here. */
  const setups: CallSetup[] = []
  let client: FakeCallClient | null = null

  const createCall: CreateCall = (callSetup) => {
    setups.push(callSetup)
    if (createFails) return Promise.reject(new Error('no token'))

    client = new FakeCallClient({
      meetingId: callSetup.meetingId,
      participants: [
        { id: 'local-1', displayName: callSetup.name, isLocal: true, micOn: true, webcamOn: true },
      ],
      ...scenario,
    })
    return Promise.resolve(client)
  }

  const view = render(
    <MediaProvider client={new FakeMediaClient()}>
      <MemoryRouter initialEntries={[`/${MEETING_ID}`]}>
        {onLocation ? <LocationProbe onLocation={onLocation} /> : null}
        <Routes>
          <Route path="/:meetingId" element={<Room createCall={createCall} />} />
        </Routes>
      </MemoryRouter>
    </MediaProvider>,
  )

  return { setups, view, callClient: () => client }
}

function LocationProbe({ onLocation }: { onLocation: (pathname: string) => void }) {
  onLocation(useLocation().pathname)
  return null
}

const joinAs = async (name: string) => {
  const user = userEvent.setup()
  await waitFor(() => expect(screen.getByTestId('preview-video')).toBeInTheDocument())
  await user.type(screen.getByTestId('display-name-input'), name)
  await user.click(screen.getByTestId('join-button'))
  return user
}

const tracksOf = (setup: CallSetup | undefined) => [
  ...(setup?.cameraStream?.getTracks() ?? []),
  ...(setup?.microphoneStream?.getTracks() ?? []),
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('Room', () => {
  test('joining swaps precall for the call', async () => {
    setup()
    await joinAs('Zishan')

    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())
    expect(screen.queryByTestId('precall')).not.toBeInTheDocument()
  })

  test('the URL never changes on join, as real Meet does not', async () => {
    const seen: string[] = []
    setup({ onLocation: (pathname) => seen.push(pathname) })
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    expect([...new Set(seen)]).toEqual([`/${MEETING_ID}`])
  })

  test('hands precall’s live tracks to the call, so the camera does not flicker', async () => {
    // The reason precall and the call are one route at all. Arriving null here
    // means MeetingProvider re-acquires the camera and the user sees it blink.
    const { setups } = setup()
    await joinAs('Zishan')

    await waitFor(() => expect(setups).toHaveLength(1))
    expect(setups[0]?.cameraStream?.getVideoTracks()).toHaveLength(1)
    expect(setups[0]?.microphoneStream?.getAudioTracks()).toHaveLength(1)
  })

  test('the handed-over tracks are still live once in the call', async () => {
    const { setups } = setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    expect(tracksOf(setups[0]).map((track) => track.readyState)).toEqual(['live', 'live'])
  })

  test('joins under the name that was typed, and persists it', async () => {
    const { setups } = setup()
    await joinAs('Ada Lovelace')

    await waitFor(() => expect(setups).toHaveLength(1))
    expect(setups[0]?.name).toBe('Ada Lovelace')
    expect(localStorage.getItem('meet-clone:display-name')).toBe('Ada Lovelace')
  })

  test('carries a participantId, without which VideoSDK evicts people', async () => {
    const { setups } = setup()
    await joinAs('Zishan')

    await waitFor(() => expect(setups).toHaveLength(1))
    expect(setups[0]?.participantId).toBeTruthy()
    expect(setups[0]?.participantId).toBe(sessionStorage.getItem('meet-clone:participant-id'))
  })

  test('carries precall’s mic and camera state, so a muted join stays muted', async () => {
    const { setups } = setup()
    await joinAs('Zishan')

    await waitFor(() => expect(setups).toHaveLength(1))
    expect(setups[0]?.micEnabled).toBe(true)
    expect(setups[0]?.webcamEnabled).toBe(true)
  })

  test('shows the connecting state before the meeting is up', async () => {
    // autoConnect:false on purpose. FakeCallClient.join() is synchronous, so an
    // auto-connecting fake never renders this state and the test would pass
    // without proving anything.
    setup({ scenario: { autoConnect: false } })
    await joinAs('Zishan')

    await waitFor(() => expect(screen.getByTestId('call-connecting')).toBeInTheDocument())
    expect(screen.queryByTestId('stage')).not.toBeInTheDocument()
  })

  test('reaches the meeting once connected', async () => {
    setup()
    await joinAs('Zishan')

    await waitFor(() => expect(screen.getByTestId('stage')).toBeInTheDocument())
    // The Figma puts the meeting's name in the bar's left group, beside the
    // clock. We have codes rather than names, so the code is what lands there.
    expect(screen.getByTestId('call-meeting-name')).toHaveTextContent(MEETING_ID)
  })

  test('reconnecting raises Meet’s banner without ending the call', async () => {
    const { callClient } = setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    callClient()?.simulateConnectionState('reconnecting')

    await waitFor(() => expect(screen.getByTestId('reconnecting-banner')).toBeInTheDocument())
    expect(screen.getByTestId('call')).toBeInTheDocument()
  })

  test('a healthy call shows no banner, which is what makes the banner mean anything', async () => {
    setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('stage')).toBeInTheDocument())

    expect(screen.queryByTestId('reconnecting-banner')).not.toBeInTheDocument()
  })

  test('leaving ends the call and says you left', async () => {
    const { callClient } = setup()
    const user = await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    await user.click(screen.getByTestId('leave-button'))

    await waitFor(() => expect(screen.getByTestId('post-call')).toBeInTheDocument())
    expect(screen.getByText('You left the meeting')).toBeInTheDocument()
    expect(callClient()?.leaveCount).toBe(1)
  })

  test('being dropped is NOT the same sentence as leaving', async () => {
    const { callClient } = setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    callClient()?.simulateConnectionState('disconnected')

    await waitFor(() => expect(screen.getByText('You have been disconnected')).toBeInTheDocument())
  })

  test('the meeting ending for everyone is NOT the same sentence as dropping', async () => {
    const { callClient } = setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    callClient()?.simulateMeetingClosed({ code: 'ended', message: 'The meeting ended' })

    await waitFor(() => expect(screen.getByText('The meeting has ended')).toBeInTheDocument())
  })

  test('a failed join says so rather than sitting on a dead call screen', async () => {
    setup({ scenario: { joinFails: true } })
    await joinAs('Zishan')

    await waitFor(() => expect(screen.getByTestId('post-call')).toBeInTheDocument())
    expect(screen.getByText('Could not connect to the meeting')).toBeInTheDocument()
  })

  test('the call’s tracks are stopped once it is over', async () => {
    // Nothing else can: the call took ownership of them from useLocalMedia at
    // join, and useLocalMedia has permanently given up the right to stop them.
    const { setups } = setup()
    const user = await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())
    const tracks = tracksOf(setups[0])

    await user.click(screen.getByTestId('leave-button'))

    await waitFor(() => expect(screen.getByTestId('post-call')).toBeInTheDocument())
    expect(tracks.map((track) => track.readyState)).toEqual(['ended', 'ended'])
  })

  test('StrictMode does not join, leave and rejoin the meeting', async () => {
    // The reason join sits in <Call> and leave sits in Room. StrictMode
    // double-invokes mount effects, so the obvious join()/return-leave() pair
    // would tear down and rebuild a real meeting on every dev mount.
    let client: FakeCallClient | null = null
    const joins = vi.fn()
    const createCall: CreateCall = ({ meetingId }) => {
      client = new FakeCallClient({ meetingId })
      vi.spyOn(client, 'join').mockImplementation(function (this: FakeCallClient) {
        joins()
        this.simulateConnectionState('connected')
      })
      return Promise.resolve(client)
    }

    render(
      <StrictMode>
        <MediaProvider client={new FakeMediaClient()}>
          <MemoryRouter initialEntries={[`/${MEETING_ID}`]}>
            <Routes>
              <Route path="/:meetingId" element={<Room createCall={createCall} />} />
            </Routes>
          </MemoryRouter>
        </MediaProvider>
      </StrictMode>,
    )
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    expect(joins).toHaveBeenCalledTimes(1)
    expect((client as FakeCallClient | null)?.leaveCount).toBe(0)
  })

  test('unmounting the route leaves the meeting', async () => {
    const { view, callClient } = setup()
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())

    view.unmount()

    expect(callClient()?.leaveCount).toBe(1)
  })

  test('unmounting before ever joining leaves nothing, and does not throw', async () => {
    // StrictMode runs this cleanup on mount, when there is no client at all.
    const { view } = setup()
    await waitFor(() => expect(screen.getByTestId('preview-video')).toBeInTheDocument())

    expect(() => view.unmount()).not.toThrow()
  })

  test('leaving mid-token-fetch aborts it, rather than retrying at nobody', async () => {
    // fetchMeetingToken retries with a widening backoff. Without this signal it
    // would keep asking for seconds after the user has gone, and honour the
    // abort is the only way it learns to stop.
    const setups: CallSetup[] = []
    const createCall: CreateCall = (callSetup) => {
      setups.push(callSetup)
      return new Promise<FakeCallClient>(() => {
        // Never settles: a token fetch still in flight.
      })
    }

    const view = render(
      <MediaProvider client={new FakeMediaClient()}>
        <MemoryRouter initialEntries={[`/${MEETING_ID}`]}>
          <Routes>
            <Route path="/:meetingId" element={<Room createCall={createCall} />} />
          </Routes>
        </MemoryRouter>
      </MediaProvider>,
    )
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('call-joining')).toBeInTheDocument())
    expect(setups[0]?.signal?.aborted).toBe(false)

    view.unmount()

    expect(setups[0]?.signal?.aborted).toBe(true)
  })

  test('a token failure keeps the green room alive so Join can be tried again', async () => {
    setup({ createFails: true })
    const user = await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('join-failed')).toBeInTheDocument())

    await user.click(screen.getByTestId('join-failed-back'))

    await waitFor(() => expect(screen.getByTestId('precall')).toBeInTheDocument())
    expect(screen.getByTestId('join-button')).toBeEnabled()
  })

  test('a failed join leaves the tracks owned, so leaving the page still stops them', async () => {
    // Ownership only moves once the client exists. Releasing on the way IN
    // instead would strand these: useLocalMedia would no longer stop them and
    // Room would not know it had them, so the camera light would outlive the
    // page. Unmounting is what makes that visible.
    const { setups, view } = setup({ createFails: true })
    await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('join-failed')).toBeInTheDocument())
    const tracks = tracksOf(setups[0])
    expect(tracks.map((track) => track.readyState)).toEqual(['live', 'live'])

    view.unmount()

    expect(tracks.map((track) => track.readyState)).toEqual(['ended', 'ended'])
  })

  test('retrying after a token failure builds a fresh call', async () => {
    let failNext = true
    const setups: CallSetup[] = []
    const createCall: CreateCall = (callSetup) => {
      setups.push(callSetup)
      if (failNext) {
        failNext = false
        return Promise.reject(new Error('no token'))
      }
      return Promise.resolve(new FakeCallClient({ meetingId: callSetup.meetingId }))
    }

    render(
      <MediaProvider client={new FakeMediaClient()}>
        <MemoryRouter initialEntries={[`/${MEETING_ID}`]}>
          <Routes>
            <Route path="/:meetingId" element={<Room createCall={createCall} />} />
          </Routes>
        </MemoryRouter>
      </MediaProvider>,
    )

    const user = await joinAs('Zishan')
    await waitFor(() => expect(screen.getByTestId('join-failed')).toBeInTheDocument())
    await user.click(screen.getByTestId('join-failed-back'))
    await user.click(screen.getByTestId('join-button'))

    await waitFor(() => expect(screen.getByTestId('call')).toBeInTheDocument())
    expect(setups).toHaveLength(2)
  })
})

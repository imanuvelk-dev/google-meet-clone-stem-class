import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { VideoSdkCallClient } from './VideoSdkCallClient.ts'
import { VideoSdkCallHost } from './VideoSdkCallHost.tsx'

/**
 * The bridge mechanism itself, against a stand-in for VideoSDK.
 *
 * This is the one test file that mounts the real bridges. It exists for a single
 * failure that nothing else can catch: the bridges push into the store on every
 * render, so if the store ever hands back a new snapshot for unchanged input,
 * consumers re-render forever. That bug does not show up in the fake, does not
 * show up in a type, and in a live room shows up as the browser locking solid.
 *
 * VideoSDK is mocked rather than mounted because its hooks need a real socket.
 * What is under test here is our side of the seam, not theirs.
 */

interface SdkWorld {
  meeting: Record<string, unknown>
  participants: Map<string, Record<string, unknown>>
  callbacks: Record<string, ((...args: never[]) => void) | undefined>
  /** Proves a rerender actually reached the bridges, so the loop test cannot pass vacuously. */
  renderCount: number
  pubsub: Map<string, { messages: unknown[]; published: unknown[] }>
}

const sdk = vi.hoisted((): SdkWorld => ({
  meeting: {},
  participants: new Map(),
  callbacks: {},
  renderCount: 0,
  pubsub: new Map(),
}))

vi.mock('@videosdk.live/react-sdk', () => ({
  MeetingProvider: ({ children }: { children: React.ReactNode }) => children,
  useMeeting: (callbacks: Record<string, () => void>) => {
    Object.assign(sdk.callbacks, callbacks)
    return sdk.meeting
  },
  useParticipant: (participantId: string) => {
    sdk.renderCount += 1
    return sdk.participants.get(participantId)
  },
  usePubSub: (topic: string) => {
    // A fresh array per render, deliberately: usePubSub makes no stability
    // promise, and the store is what has to absorb that. A stable array here
    // would let a store that re-renders forever pass this file's whole point.
    const topicState = sdk.pubsub.get(topic) ?? { messages: [], published: [] }
    sdk.pubsub.set(topic, topicState)
    return {
      publish: (message: unknown, _options?: unknown, payload?: unknown) =>
        topicState.published.push({ message, payload }),
      messages: [...topicState.messages],
    }
  },
  useTranscription: () => ({ startTranscription: vi.fn() }),
  useWhiteboard: () => ({
    startWhiteboard: vi.fn(),
    stopWhiteboard: vi.fn(),
    whiteboardUrl: null,
  }),
}))

const CONFIG = {
  meetingId: 'abc-defg-hij',
  token: 'test-token',
  name: 'Ada',
  micEnabled: true,
  webcamEnabled: true,
  isHost: false,
}

const sdkParticipant = (id: string, overrides: Record<string, unknown> = {}) => ({
  displayName: id,
  isLocal: id === 'local-1',
  micOn: true,
  webcamOn: true,
  screenShareOn: false,
  webcamStream: undefined,
  micStream: undefined,
  screenShareStream: undefined,
  setQuality: vi.fn(),
  remove: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  sdk.participants.clear()
  sdk.callbacks = {}
  sdk.renderCount = 0
  sdk.participants.set('local-1', sdkParticipant('local-1'))
  sdk.participants.set('remote-1', sdkParticipant('remote-1'))
  sdk.meeting = {
    meetingId: 'abc-defg-hij',
    localParticipant: { id: 'local-1' },
    // This SDK's participants map includes the local participant.
    participants: new Map([
      ['local-1', { id: 'local-1' }],
      ['remote-1', { id: 'remote-1' }],
    ]),
    activeSpeakerId: null,
    presenterId: undefined,
    localMicOn: true,
    localWebcamOn: true,
    localScreenShareOn: false,
    selectedCameraDevice: undefined,
    selectedMicrophoneDevice: undefined,
    join: vi.fn(),
    leave: vi.fn(),
    end: vi.fn(),
    toggleMic: vi.fn(),
    muteMic: vi.fn(),
    unmuteMic: vi.fn(),
    toggleWebcam: vi.fn(),
    enableWebcam: vi.fn(),
    disableWebcam: vi.fn(),
    toggleScreenShare: vi.fn(),
    enableScreenShare: vi.fn(),
    disableScreenShare: vi.fn(),
    getMics: vi.fn(() => Promise.resolve([])),
    getWebcams: vi.fn(() => Promise.resolve([])),
    changeMic: vi.fn(),
    changeWebcam: vi.fn(),
  }
})

const mount = () => {
  const client = new VideoSdkCallClient(CONFIG)
  const view = render(
    <VideoSdkCallHost client={client} config={CONFIG}>
      <div data-testid="app" />
    </VideoSdkCallHost>,
  )
  return { client, view }
}

describe('VideoSdkCallHost', () => {
  test('the bridges fill the store with the roster', () => {
    const { client } = mount()

    expect(client.getParticipantIds()).toEqual(['local-1', 'remote-1'])
    expect(client.getParticipant('remote-1')?.displayName).toBe('remote-1')
    expect(client.getParticipant('local-1')?.isLocal).toBe(true)
  })

  test('meeting state reaches the store', () => {
    const { client } = mount()

    expect(client.getState().meetingId).toBe('abc-defg-hij')
    expect(client.getState().localParticipantId).toBe('local-1')
    expect(client.getState().localMicOn).toBe(true)
  })

  test('re-rendering the bridges does not notify anyone', () => {
    // The loop guard, end to end. The bridges push unconditionally on every
    // render; only CallStore's diffing stops that becoming an infinite loop.
    const { client, view } = mount()
    const listener = vi.fn()
    client.subscribe(listener)

    for (let index = 0; index < 5; index += 1) {
      view.rerender(
        <VideoSdkCallHost client={client} config={CONFIG}>
          <div data-testid="app" />
        </VideoSdkCallHost>,
      )
    }

    expect(sdk.renderCount).toBeGreaterThan(2)
    expect(listener).not.toHaveBeenCalled()
  })

  test('a participant object survives re-renders with its identity intact', () => {
    const { client, view } = mount()
    const before = client.getParticipant('remote-1')

    view.rerender(
      <VideoSdkCallHost client={client} config={CONFIG}>
        <div data-testid="app" />
      </VideoSdkCallHost>,
    )

    expect(client.getParticipant('remote-1')).toBe(before)
  })

  test("the SDK's undefined streams become our nulls", () => {
    // The SDK types webcamStream as always present, but it is undefined whenever
    // the track is off. A tile keying off truthiness would render a dead <video>.
    const { client } = mount()

    expect(client.getParticipant('remote-1')?.webcamStream).toBeNull()
  })

  test('a live track becomes a stable MediaStream', () => {
    const track = { kind: 'video', id: 'track-1' } as MediaStreamTrack
    sdk.participants.set(
      'remote-1',
      sdkParticipant('remote-1', { webcamStream: { track, pause: vi.fn(), resume: vi.fn() } }),
    )
    const { client, view } = mount()
    const stream = client.getParticipant('remote-1')?.webcamStream

    expect(stream).not.toBeNull()
    view.rerender(
      <VideoSdkCallHost client={client} config={CONFIG}>
        <div data-testid="app" />
      </VideoSdkCallHost>,
    )

    expect(client.getParticipant('remote-1')?.webcamStream).toBe(stream)
  })

  test('RECONNECTING from the SDK reaches our state', () => {
    // The SDK's own type does not admit this state, but its runtime emits it.
    // This is the seam translating, and the reason Meet's banner can exist.
    const { client } = mount()

    act(() => sdk.callbacks.onMeetingStateChanged?.({ state: 'RECONNECTING' } as never))

    expect(client.getState().connection).toBe('reconnecting')
  })

  test('a participant leaving unmounts their bridge and drops them', () => {
    const { client, view } = mount()

    sdk.meeting.participants = new Map([['local-1', { id: 'local-1' }]])
    sdk.participants.delete('remote-1')
    view.rerender(
      <VideoSdkCallHost client={client} config={CONFIG}>
        <div data-testid="app" />
      </VideoSdkCallHost>,
    )

    expect(client.getParticipantIds()).toEqual(['local-1'])
    expect(client.getParticipant('remote-1')).toBeNull()
  })

  test('per-participant commands reach the SDK through the attached handle', () => {
    const { client } = mount()

    client.setParticipantQuality('remote-1', 'low')

    expect(sdk.participants.get('remote-1')?.setQuality).toHaveBeenCalledWith('low')
  })

  test('pausing a stream calls pause on the SDK stream itself', () => {
    // pause/resume live on the Stream object, so no useStream bridge is needed.
    const pause = vi.fn()
    const resume = vi.fn()
    sdk.participants.set(
      'remote-1',
      sdkParticipant('remote-1', {
        webcamStream: { track: { kind: 'video' } as MediaStreamTrack, pause, resume },
      }),
    )
    const { client } = mount()

    client.setStreamPaused('remote-1', 'webcam', true)
    expect(pause).toHaveBeenCalled()

    client.setStreamPaused('remote-1', 'webcam', false)
    expect(resume).toHaveBeenCalled()
  })

  test('meeting commands reach the SDK', () => {
    const { client } = mount()

    client.join()
    client.toggleMic()

    expect(sdk.meeting.join).toHaveBeenCalled()
    expect(sdk.meeting.toggleMic).toHaveBeenCalled()
  })

  test('children render inside the SDK provider', () => {
    const { view } = mount()
    expect(view.getByTestId('app')).toBeInTheDocument()
  })
})

import { describe, expect, test, vi } from 'vitest'
import type { MeetingHandle, ParticipantHandle } from './VideoSdkCallClient.ts'
import { connectionStateFromSdk, VideoSdkCallClient } from './VideoSdkCallClient.ts'

/**
 * The real client, tested without VideoSDK.
 *
 * That is possible because the SDK lives entirely in VideoSdkCallHost's bridges,
 * and everything here is the store they push into. So the diffing that stops the
 * render loop, and the connection mapping that the SDK's own types get wrong,
 * are both covered by fast unit tests rather than by a live room.
 */

const CONFIG = {
  meetingId: 'abc-defg-hij',
  token: 'test-token',
  name: 'Ada',
  micEnabled: true,
  webcamEnabled: true,
  isHost: false,
}

/**
 * The mocks are kept as loose fields beside the handle, not reached back through
 * it: `expect(handle.join)` reads as an unbound method to the linter, and
 * silencing that rule across the suite would cost more than a second reference.
 */
const meetingHandle = () => {
  const calls = {
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
    changeMic: vi.fn(),
    changeWebcam: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }
  const handle: MeetingHandle = {
    ...calls,
    getMics: () => Promise.resolve([{ deviceId: 'mic-1', label: 'Mic', kind: 'microphone' }]),
    getWebcams: () => Promise.resolve([{ deviceId: 'cam-1', label: 'Cam', kind: 'camera' }]),
  }
  return { handle, calls }
}

const participantHandle = () => {
  const calls = {
    setQuality: vi.fn(),
    setStreamPaused: vi.fn(),
    remove: vi.fn(),
    disableMic: vi.fn(),
    disableWebcam: vi.fn(),
    requestMic: vi.fn(),
    requestWebcam: vi.fn(),
  }
  const handle: ParticipantHandle = { ...calls }
  return { handle, calls }
}

const MEETING_STATE = {
  meetingId: 'abc-defg-hij',
  localParticipantId: 'local-1',
  activeSpeakerId: null,
  presenterId: null,
  localMicOn: true,
  localWebcamOn: true,
  localScreenShareOn: false,
  selectedCameraId: null,
  selectedMicrophoneId: null,
}

const facts = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  displayName: id,
  isLocal: false,
  micOn: true,
  webcamOn: true,
  screenShareOn: false,
  webcamTrack: null,
  micTrack: null,
  screenShareTrack: null,
  ...overrides,
})

describe('connectionStateFromSdk', () => {
  test('maps RECONNECTING, which the SDK emits but does not declare', () => {
    // The SDK's .d.ts union is CONNECTING|CONNECTED|FAILED|DISCONNECTED|CLOSING|
    // CLOSED, yet its compiled runtime tests `data?.state === 'RECONNECTING'`
    // before emitting. The type is wrong. If this ever breaks, Meet's
    // Reconnecting banner silently never shows.
    expect(connectionStateFromSdk('RECONNECTING')).toBe('reconnecting')
  })

  test('maps every state the SDK declares', () => {
    expect(connectionStateFromSdk('CONNECTING')).toBe('connecting')
    expect(connectionStateFromSdk('CONNECTED')).toBe('connected')
    expect(connectionStateFromSdk('FAILED')).toBe('failed')
    expect(connectionStateFromSdk('DISCONNECTED')).toBe('disconnected')
  })

  test('keeps CLOSING and CLOSED distinct from disconnection', () => {
    // The meeting ending for everyone is not you dropping out, and post-call
    // says different things about each.
    expect(connectionStateFromSdk('CLOSING')).toBe('closing')
    expect(connectionStateFromSdk('CLOSED')).toBe('closed')
  })

  test('an unknown state is ignored rather than guessed at', () => {
    // Coercing an unknown string to 'failed' would put an error screen in front
    // of a working meeting the first time the SDK adds a state.
    expect(connectionStateFromSdk('SOMETHING_NEW')).toBeNull()
    expect(connectionStateFromSdk('')).toBeNull()
  })
})

describe('VideoSdkCallClient', () => {
  test('an unknown connection state leaves the previous one standing', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.handleConnectionState('CONNECTED')

    client.handleConnectionState('SOMETHING_NEW')

    expect(client.getState().connection).toBe('connected')
  })

  test('reconnecting reaches the store from the SDK string', () => {
    const client = new VideoSdkCallClient(CONFIG)

    client.handleConnectionState('RECONNECTING')

    expect(client.getState().connection).toBe('reconnecting')
  })

  test('pushing the same meeting state twice notifies once', () => {
    // The bridges push on every render and never diff. If this fails, every
    // consumer re-renders on every SDK render, forever.
    const client = new VideoSdkCallClient(CONFIG)
    const listener = vi.fn()
    client.subscribe(listener)

    client.syncMeetingState(MEETING_STATE)
    client.syncMeetingState(MEETING_STATE)
    client.syncMeetingState(MEETING_STATE)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('pushing the same participant twice notifies once', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.syncParticipant(facts('remote-1'))
    const listener = vi.fn()
    client.subscribe(listener)

    client.syncParticipant(facts('remote-1'))
    client.syncParticipant(facts('remote-1'))

    expect(listener).not.toHaveBeenCalled()
  })

  test('a participant object keeps its identity while unchanged', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.syncParticipant(facts('remote-1'))
    const before = client.getParticipant('remote-1')

    client.syncParticipant(facts('remote-1'))

    expect(client.getParticipant('remote-1')).toBe(before)
  })

  test('the same track pushed again keeps the same MediaStream', () => {
    // A fresh MediaStream per push is the render loop. The track is the identity.
    const client = new VideoSdkCallClient(CONFIG)
    const track = fakeTrack()
    client.syncParticipant(facts('remote-1', { webcamTrack: track }))
    const before = client.getParticipant('remote-1')?.webcamStream

    client.syncParticipant(facts('remote-1', { webcamTrack: track }))

    expect(client.getParticipant('remote-1')?.webcamStream).toBe(before)
  })

  test('a changed track produces a new MediaStream', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.syncParticipant(facts('remote-1', { webcamTrack: fakeTrack() }))
    const before = client.getParticipant('remote-1')?.webcamStream

    client.syncParticipant(facts('remote-1', { webcamTrack: fakeTrack() }))

    expect(client.getParticipant('remote-1')?.webcamStream).not.toBe(before)
  })

  test('a genuine change does notify', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.syncParticipant(facts('remote-1'))
    const listener = vi.fn()
    client.subscribe(listener)

    client.syncParticipant(facts('remote-1', { micOn: false }))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(client.getParticipant('remote-1')?.micOn).toBe(false)
  })

  test('detaching a participant drops them from the roster', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.syncParticipant(facts('remote-1'))

    client.detachParticipant('remote-1')

    expect(client.getParticipantIds()).toEqual([])
    expect(client.getParticipant('remote-1')).toBeNull()
  })

  test('commands delegate to the attached meeting', () => {
    const client = new VideoSdkCallClient(CONFIG)
    const { handle, calls } = meetingHandle()
    client.attachMeeting(handle)

    client.join()
    client.toggleMic()
    client.setMicEnabled(false)
    client.setWebcamEnabled(true)
    client.toggleScreenShare()
    client.changeCamera('cam-2')
    client.leave()

    expect(calls.join).toHaveBeenCalled()
    expect(calls.toggleMic).toHaveBeenCalled()
    expect(calls.muteMic).toHaveBeenCalled()
    expect(calls.enableWebcam).toHaveBeenCalled()
    expect(calls.toggleScreenShare).toHaveBeenCalled()
    expect(calls.changeWebcam).toHaveBeenCalledWith('cam-2')
    expect(calls.leave).toHaveBeenCalled()
  })

  test('commands before the bridge has mounted are dropped, not thrown', () => {
    // The bridge attaches in an effect, so a command can genuinely arrive first.
    // Crashing the call over a click that landed a frame early would be worse.
    const client = new VideoSdkCallClient(CONFIG)

    expect(() => {
      client.toggleMic()
      client.leave()
    }).not.toThrow()
  })

  test('join marks the call connecting before the SDK answers', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.attachMeeting(meetingHandle().handle)

    client.join()

    expect(client.getState().connection).toBe('connecting')
  })

  test('join clears the errors of a previous attempt', () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.attachMeeting(meetingHandle().handle)
    client.handleError({ code: '3001', message: 'nope' })
    client.handleMeetingLeft({ code: '4001', message: 'gone' })

    client.join()

    expect(client.getState().error).toBeNull()
    expect(client.getState().leaveReason).toBeNull()
  })

  test('leaving reports disconnection; a closing meeting reports closure', () => {
    const left = new VideoSdkCallClient(CONFIG)
    left.handleConnectionState('CONNECTED')
    left.handleMeetingLeft({ code: '4001', message: 'You left' })
    expect(left.getState().connection).toBe('disconnected')
    expect(left.getState().leaveReason?.message).toBe('You left')

    const closed = new VideoSdkCallClient(CONFIG)
    closed.handleConnectionState('CLOSING')
    closed.handleMeetingLeft({ code: '4002', message: 'Meeting ended' })
    expect(closed.getState().connection).toBe('closed')
  })

  test('quality limitation is state only while detected', () => {
    const client = new VideoSdkCallClient(CONFIG)

    client.handleQualityLimitation({ type: 'cpu', state: 'detected' })
    expect(client.getState().qualityLimitation?.type).toBe('cpu')

    client.handleQualityLimitation({ type: 'cpu', state: 'resolved' })
    expect(client.getState().qualityLimitation).toBeNull()
  })

  test('per-participant commands delegate to that participant', () => {
    const client = new VideoSdkCallClient(CONFIG)
    const { handle, calls } = participantHandle()
    client.attachParticipant('remote-1', handle)

    client.setParticipantQuality('remote-1', 'low')
    client.setStreamPaused('remote-1', 'webcam', true)
    client.removeParticipant('remote-1')

    expect(calls.setQuality).toHaveBeenCalledWith('low')
    expect(calls.setStreamPaused).toHaveBeenCalledWith('webcam', true)
    expect(calls.remove).toHaveBeenCalled()
  })

  test('pin never reaches the SDK', () => {
    // The SDK's pin broadcasts meeting-wide (pinnedParticipants is meeting-wide
    // and onPinStateChanged carries pinnedBy). Meet's pin changes your view
    // alone, so ours is state and touches no handle at all. See CLAUDE.md.
    const client = new VideoSdkCallClient(CONFIG)
    const { handle, calls } = participantHandle()
    client.attachParticipant('remote-1', handle)

    client.setPinnedParticipant('remote-1')

    expect(client.getState().pinnedParticipantId).toBe('remote-1')
    expect(calls.setQuality).not.toHaveBeenCalled()
    // There is no pin on the handle to call even by accident.
    expect(handle).not.toHaveProperty('pin')
  })

  test('device lists come back in our shape, not the SDK one', async () => {
    const client = new VideoSdkCallClient(CONFIG)
    client.attachMeeting(meetingHandle().handle)

    expect(await client.getCameras()).toEqual([{ deviceId: 'cam-1', label: 'Cam', kind: 'camera' }])
    expect(await client.getMicrophones()).toEqual([
      { deviceId: 'mic-1', label: 'Mic', kind: 'microphone' },
    ])
  })

  test('device lists before the bridge mounts are empty, not a crash', () => {
    const client = new VideoSdkCallClient(CONFIG)
    return expect(client.getCameras()).resolves.toEqual([])
  })
})

let trackCount = 0
function fakeTrack(): MediaStreamTrack {
  trackCount += 1
  return { kind: 'video', id: `track-${trackCount}` } as MediaStreamTrack
}

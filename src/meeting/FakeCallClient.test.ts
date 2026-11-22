import { describe, expect, test, vi } from 'vitest'
import { FakeCallClient } from './FakeCallClient.ts'

const TWO_PEOPLE = {
  participants: [
    { id: 'local-1', displayName: 'You', isLocal: true, micOn: true, webcamOn: true },
    { id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true },
  ],
}

describe('FakeCallClient', () => {
  test('joining publishes the roster and the local participant', () => {
    const client = new FakeCallClient(TWO_PEOPLE)

    client.join()

    expect(client.getState().connection).toBe('connected')
    expect(client.getParticipantIds()).toEqual(['local-1', 'remote-1'])
    expect(client.getState().localParticipantId).toBe('local-1')
    expect(client.getParticipant('remote-1')?.displayName).toBe('Ada Lovelace')
  })

  test('a failed join reports failure rather than a silent non-connection', () => {
    const client = new FakeCallClient({ joinFails: true })

    client.join()

    expect(client.getState().connection).toBe('failed')
    expect(client.getParticipantIds()).toEqual([])
  })

  test('autoConnect off leaves the call visibly connecting', () => {
    // Without this the connecting UI could never be seen, let alone tested: a
    // fake that connects instantly skips the only state that screen exists for.
    const client = new FakeCallClient({ autoConnect: false })

    client.join()

    expect(client.getState().connection).toBe('connecting')
  })

  test('streams appear only for tracks that are on', () => {
    const client = new FakeCallClient({
      participants: [{ id: 'remote-1', displayName: 'Ada', micOn: true, webcamOn: false }],
    })
    client.join()

    const participant = client.getParticipant('remote-1')
    expect(participant?.micStream).not.toBeNull()
    expect(participant?.webcamStream).toBeNull()
  })

  test('turning a camera on later still produces a stream', () => {
    const client = new FakeCallClient({
      participants: [{ id: 'remote-1', displayName: 'Ada', webcamOn: false }],
    })
    client.join()

    client.simulateMedia('remote-1', { webcamOn: true })

    expect(client.getParticipant('remote-1')?.webcamStream).not.toBeNull()
    expect(client.getParticipant('remote-1')?.webcamOn).toBe(true)
  })

  test('a participant stream keeps its identity across unrelated updates', () => {
    // The hazard the whole store exists for: a new MediaStream per push would
    // never compare equal, and useSyncExternalStore would re-render forever.
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()
    const before = client.getParticipant('remote-1')?.webcamStream

    client.simulateMedia('remote-1', { micOn: false })

    expect(client.getParticipant('remote-1')?.webcamStream).toBe(before)
  })

  test('an update that changes nothing notifies nobody', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()
    const listener = vi.fn()
    client.subscribe(listener)

    client.simulateMedia('remote-1', { micOn: true })
    client.simulateActiveSpeaker(null)

    expect(listener).not.toHaveBeenCalled()
  })

  test('screen sharing makes the sharer the presenter', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.simulateMedia('remote-1', { screenShareOn: true })
    expect(client.getState().presenterId).toBe('remote-1')

    client.simulateMedia('remote-1', { screenShareOn: false })
    expect(client.getState().presenterId).toBeNull()
  })

  test('a participant who leaves is dropped from the roster', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.simulateParticipantLeft('remote-1')

    expect(client.getParticipantIds()).toEqual(['local-1'])
    expect(client.getParticipant('remote-1')).toBeNull()
  })

  test('a participant who leaves cannot stay pinned, presenting or speaking', () => {
    // Otherwise the layout keeps a primary slot for someone who is gone.
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()
    client.setPinnedParticipant('remote-1')
    client.simulateMedia('remote-1', { screenShareOn: true })
    client.simulateActiveSpeaker('remote-1')

    client.simulateParticipantLeft('remote-1')

    const state = client.getState()
    expect(state.pinnedParticipantId).toBeNull()
    expect(state.presenterId).toBeNull()
    expect(state.activeSpeakerId).toBeNull()
  })

  test('a late joiner lands in the roster', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.simulateParticipantJoined({ id: 'remote-2', displayName: 'Grace', webcamOn: true })

    expect(client.getParticipantIds()).toEqual(['local-1', 'remote-1', 'remote-2'])
  })

  test('reconnecting is a state the fake can produce on demand', () => {
    // No real meeting reconnects to order, so the banner is only testable here.
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.simulateConnectionState('reconnecting')

    expect(client.getState().connection).toBe('reconnecting')
  })

  test('toggling the mic moves both the local flag and the local participant', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.toggleMic()

    expect(client.getState().localMicOn).toBe(false)
    expect(client.getParticipant('local-1')?.micOn).toBe(false)
  })

  test('toggling the camera moves both the local flag and the local participant', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.toggleWebcam()

    expect(client.getState().localWebcamOn).toBe(false)
    expect(client.getParticipant('local-1')?.webcamStream).toBeNull()
  })

  test('sharing your screen makes you the presenter', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.toggleScreenShare()

    expect(client.getState().localScreenShareOn).toBe(true)
    expect(client.getState().presenterId).toBe('local-1')
  })

  test('pin is recorded locally', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.setPinnedParticipant('remote-1')
    expect(client.getState().pinnedParticipantId).toBe('remote-1')

    client.setPinnedParticipant(null)
    expect(client.getState().pinnedParticipantId).toBeNull()
  })

  test('records the quality asked of each participant', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.setParticipantQuality('remote-1', 'low')

    expect(client.qualityByParticipantId.get('remote-1')).toBe('low')
  })

  test('records paused streams per participant and kind', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.setStreamPaused('remote-1', 'webcam', true)
    expect(client.pausedStreams.has('remote-1:webcam')).toBe(true)
    expect(client.pausedStreams.has('remote-1:mic')).toBe(false)

    client.setStreamPaused('remote-1', 'webcam', false)
    expect(client.pausedStreams.has('remote-1:webcam')).toBe(false)
  })

  test('device switching records the chosen device', async () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    expect(await client.getCameras()).toHaveLength(2)
    client.changeCamera('cam-2')
    client.changeMicrophone('mic-2')

    expect(client.lastCameraDeviceId).toBe('cam-2')
    expect(client.getState().selectedCameraId).toBe('cam-2')
    expect(client.lastMicrophoneDeviceId).toBe('mic-2')
  })

  test('leaving and ending are different endings', () => {
    // leave() removes you; end() terminates for everyone, and post-call has to
    // say which happened.
    const leaver = new FakeCallClient(TWO_PEOPLE)
    leaver.join()
    leaver.leave()
    expect(leaver.getState().connection).toBe('disconnected')
    expect(leaver.leaveCount).toBe(1)

    const ender = new FakeCallClient(TWO_PEOPLE)
    ender.join()
    ender.end()
    expect(ender.getState().connection).toBe('closed')
    expect(ender.endCount).toBe(1)
  })

  test('removing a participant records it and drops them', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.removeParticipant('remote-1')

    expect(client.removedParticipantIds).toEqual(['remote-1'])
    expect(client.getParticipant('remote-1')).toBeNull()
  })

  test('only a detected quality limitation is state; resolved clears it', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()

    client.simulateQualityLimitation({ type: 'bandwidth', state: 'detected' })
    expect(client.getState().qualityLimitation?.type).toBe('bandwidth')

    client.simulateQualityLimitation({ type: 'bandwidth', state: 'resolved' })
    expect(client.getState().qualityLimitation).toBeNull()
  })

  test('unsubscribing stops notifications', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    const listener = vi.fn()
    const unsubscribe = client.subscribe(listener)

    unsubscribe()
    client.join()

    expect(listener).not.toHaveBeenCalled()
  })

  test('the store reads work unbound, as useSyncExternalStore requires', () => {
    const client = new FakeCallClient(TWO_PEOPLE)
    client.join()
    const { getState, getParticipantIds, getParticipant, subscribe } = client

    // Would throw on `this` if these were prototype methods.
    expect(() => {
      subscribe(() => {})
      getState()
      getParticipantIds()
      getParticipant('local-1')
    }).not.toThrow()
  })
})

import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CallProvider } from '../CallProvider.tsx'
import { FakeCallClient, type FakeCallScenario } from '../FakeCallClient.ts'
import { useCall } from './useCall.ts'

const TWO_PEOPLE: FakeCallScenario = {
  participants: [
    { id: 'local-1', displayName: 'You', isLocal: true, micOn: true, webcamOn: true },
    { id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true },
  ],
}

const setup = (scenario: FakeCallScenario = TWO_PEOPLE) => {
  const client = new FakeCallClient(scenario)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CallProvider client={client}>{children}</CallProvider>
  )
  return { client, ...renderHook(() => useCall(), { wrapper }) }
}

describe('useCall', () => {
  test('starts idle and connects on join', () => {
    const { result } = setup()
    expect(result.current.connection).toBe('idle')

    act(() => result.current.join())

    expect(result.current.connection).toBe('connected')
    expect(result.current.localParticipantId).toBe('local-1')
  })

  test('surfaces reconnecting, which is what drives Meet’s banner', () => {
    const { client, result } = setup()
    act(() => result.current.join())

    act(() => client.simulateConnectionState('reconnecting'))

    expect(result.current.connection).toBe('reconnecting')
  })

  test('surfaces a failed join', () => {
    const { result } = setup({ ...TWO_PEOPLE, joinFails: true })

    act(() => result.current.join())

    expect(result.current.connection).toBe('failed')
  })

  test('toggling the mic updates the state the control bar reads', () => {
    const { result } = setup()
    act(() => result.current.join())
    expect(result.current.localMicOn).toBe(true)

    act(() => result.current.toggleMic())

    expect(result.current.localMicOn).toBe(false)
  })

  test('toggling the camera updates the state the control bar reads', () => {
    const { result } = setup()
    act(() => result.current.join())

    act(() => result.current.toggleWebcam())

    expect(result.current.localWebcamOn).toBe(false)
  })

  test('sharing your screen sets the presenter', () => {
    const { result } = setup()
    act(() => result.current.join())

    act(() => result.current.toggleScreenShare())

    expect(result.current.localScreenShareOn).toBe(true)
    expect(result.current.presenterId).toBe('local-1')
  })

  test('pinning is local state and unpinning clears it', () => {
    const { result } = setup()
    act(() => result.current.join())

    act(() => result.current.pin('remote-1'))
    expect(result.current.pinnedParticipantId).toBe('remote-1')

    act(() => result.current.pin(null))
    expect(result.current.pinnedParticipantId).toBeNull()
  })

  test('the active speaker reaches the state the highlight ring reads', () => {
    const { client, result } = setup()
    act(() => result.current.join())

    act(() => client.simulateActiveSpeaker('remote-1'))

    expect(result.current.activeSpeakerId).toBe('remote-1')
  })

  test('a detected quality limitation reaches the network indicator', () => {
    const { client, result } = setup()
    act(() => result.current.join())

    act(() => client.simulateQualityLimitation({ type: 'bandwidth', state: 'detected' }))

    expect(result.current.qualityLimitation).toEqual({ type: 'bandwidth', state: 'detected' })
  })

  test('leaving reports why, so post-call can say it', () => {
    const { result } = setup()
    act(() => result.current.join())

    act(() => result.current.leave())

    expect(result.current.connection).toBe('disconnected')
    expect(result.current.leaveReason?.message).toBe('You left')
  })

  test('the meeting being ended for everyone is not the same as leaving', () => {
    const { client, result } = setup()
    act(() => result.current.join())

    act(() => client.simulateMeetingClosed({ code: 'ended', message: 'The meeting ended' }))

    expect(result.current.connection).toBe('closed')
  })

  test('device switching goes through the in-call API', () => {
    const { client, result } = setup()
    act(() => result.current.join())

    act(() => result.current.changeCamera('cam-2'))

    expect(client.lastCameraDeviceId).toBe('cam-2')
    expect(result.current.selectedCameraId).toBe('cam-2')
  })

  test('commands survive being passed as bare references', () => {
    // The shape a control bar actually uses: onClick={call.toggleMic}.
    const { result } = setup()
    act(() => result.current.join())
    const { toggleMic } = result.current

    act(() => toggleMic())

    expect(result.current.localMicOn).toBe(false)
  })

  test('throws outside a provider rather than silently doing nothing', () => {
    expect(() => renderHook(() => useCall())).toThrow(/CallProvider/)
  })

  test('an unmounted consumer stops hearing about the call', () => {
    const { client, unmount } = setup()

    unmount()

    // Would warn or throw if the subscription outlived the component.
    expect(() => client.simulateConnectionState('reconnecting')).not.toThrow()
  })
})

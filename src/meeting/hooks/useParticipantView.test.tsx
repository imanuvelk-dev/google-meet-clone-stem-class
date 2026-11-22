import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CallProvider } from '../CallProvider.tsx'
import { FakeCallClient, type FakeCallScenario } from '../FakeCallClient.ts'
import { useParticipantView } from './useParticipantView.ts'

const THREE_PEOPLE: FakeCallScenario = {
  participants: [
    { id: 'local-1', displayName: 'You', isLocal: true, micOn: true, webcamOn: true },
    { id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true },
    { id: 'remote-2', displayName: 'Grace Hopper', micOn: false, webcamOn: false },
  ],
}

const setup = (participantId: string, scenario: FakeCallScenario = THREE_PEOPLE) => {
  const client = new FakeCallClient(scenario)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CallProvider client={client}>{children}</CallProvider>
  )
  return { client, ...renderHook(() => useParticipantView(participantId), { wrapper }) }
}

describe('useParticipantView', () => {
  test('is null for someone who is not in the meeting', () => {
    const { client, result } = setup('nobody')
    act(() => client.join())

    expect(result.current).toBeNull()
  })

  test('gives a tile its name, media state and streams', () => {
    const { client, result } = setup('remote-1')

    act(() => client.join())

    expect(result.current?.displayName).toBe('Ada Lovelace')
    expect(result.current?.micOn).toBe(true)
    expect(result.current?.webcamStream).not.toBeNull()
    expect(result.current?.isLocal).toBe(false)
  })

  test('a camera-off participant has no webcam stream, so the tile falls back to an avatar', () => {
    const { client, result } = setup('remote-2')

    act(() => client.join())

    expect(result.current?.webcamOn).toBe(false)
    expect(result.current?.webcamStream).toBeNull()
  })

  test('knows the local participant is local, so the tile can mirror and mute itself', () => {
    const { client, result } = setup('local-1')

    act(() => client.join())

    expect(result.current?.isLocal).toBe(true)
  })

  test('follows its own participant turning their camera off', () => {
    const { client, result } = setup('remote-1')
    act(() => client.join())

    act(() => client.simulateMedia('remote-1', { webcamOn: false }))

    expect(result.current?.webcamStream).toBeNull()
  })

  test('goes null when its participant leaves', () => {
    const { client, result } = setup('remote-1')
    act(() => client.join())

    act(() => client.simulateParticipantLeft('remote-1'))

    expect(result.current).toBeNull()
  })

  test('does not re-render when a different participant changes', () => {
    // The scale property this hook exists for. subscribe is meeting-wide, so
    // without a per-participant snapshot every tile would re-render on every
    // change anyone made, 49 times over.
    let renders = 0
    const client = new FakeCallClient(THREE_PEOPLE)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CallProvider client={client}>{children}</CallProvider>
    )
    renderHook(
      () => {
        renders += 1
        return useParticipantView('remote-1')
      },
      { wrapper },
    )
    act(() => client.join())
    const afterJoin = renders

    act(() => client.simulateMedia('remote-2', { webcamOn: true }))
    act(() => client.simulateActiveSpeaker('remote-2'))

    expect(renders).toBe(afterJoin)
  })

  test('setting quality reaches the client, which is how the grid steps it by count', () => {
    const { client, result } = setup('remote-1')
    act(() => client.join())

    act(() => result.current?.setQuality('low'))

    expect(client.qualityByParticipantId.get('remote-1')).toBe('low')
  })

  test('pausing a stream reaches the client, which is how offscreen tiles stop costing bandwidth', () => {
    const { client, result } = setup('remote-1')
    act(() => client.join())

    act(() => result.current?.setStreamPaused('webcam', true))
    expect(client.pausedStreams.has('remote-1:webcam')).toBe(true)

    act(() => result.current?.setStreamPaused('webcam', false))
    expect(client.pausedStreams.has('remote-1:webcam')).toBe(false)
  })

  test('removing reaches the client', () => {
    const { client, result } = setup('remote-1')
    act(() => client.join())

    act(() => result.current?.remove())

    expect(client.removedParticipantIds).toEqual(['remote-1'])
  })

  test('carries no pin or speaker state, which belong to the call', () => {
    // Both are per-participant facts but singular ones. Reading them here would
    // subscribe every tile to every call-level change.
    const { client, result } = setup('remote-1')
    act(() => client.join())

    expect(result.current).not.toHaveProperty('isPinned')
    expect(result.current).not.toHaveProperty('isActiveSpeaker')
  })
})

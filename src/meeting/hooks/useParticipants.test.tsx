import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CallProvider } from '../CallProvider.tsx'
import { FakeCallClient, type FakeCallScenario } from '../FakeCallClient.ts'
import { useParticipants } from './useParticipants.ts'

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
  return { client, ...renderHook(() => useParticipants(), { wrapper }) }
}

const crowd = (count: number): FakeCallScenario => ({
  participants: [
    { id: 'local-1', displayName: 'You', isLocal: true, micOn: true, webcamOn: true },
    ...Array.from({ length: count }, (_, index) => ({
      id: `remote-${index}`,
      displayName: `Person ${index}`,
      micOn: true,
      webcamOn: true,
    })),
  ],
})

describe('useParticipants', () => {
  test('is empty before joining', () => {
    const { result } = setup()
    expect(result.current).toEqual([])
  })

  test('lists everyone once joined, local participant included', () => {
    const { client, result } = setup()

    act(() => client.join())

    expect(result.current).toEqual(['local-1', 'remote-1'])
  })

  test('grows when someone joins', () => {
    const { client, result } = setup()
    act(() => client.join())

    act(() => client.simulateParticipantJoined({ id: 'remote-2', displayName: 'Grace' }))

    expect(result.current).toEqual(['local-1', 'remote-1', 'remote-2'])
  })

  test('shrinks when someone leaves', () => {
    const { client, result } = setup()
    act(() => client.join())

    act(() => client.simulateParticipantLeft('remote-1'))

    expect(result.current).toEqual(['local-1'])
  })

  test('holds a roster the size of Meet’s tiled view', () => {
    // Meet's tiled view maxes at 49. The architecture has to hold there without
    // a rewrite even though CI will only ever verify a dozen live contexts.
    const { client, result } = setup(crowd(48))

    act(() => client.join())

    expect(result.current).toHaveLength(49)
  })

  test('does not re-render when someone toggles their mic', () => {
    // The reason this hook returns ids and not participants. If the roster
    // rebuilt on every media change, all 49 tiles would re-render with it.
    let renders = 0
    const client = new FakeCallClient(TWO_PEOPLE)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CallProvider client={client}>{children}</CallProvider>
    )
    renderHook(
      () => {
        renders += 1
        return useParticipants()
      },
      { wrapper },
    )
    act(() => client.join())
    const afterJoin = renders

    act(() => client.simulateMedia('remote-1', { micOn: false }))
    act(() => client.simulateActiveSpeaker('remote-1'))

    expect(renders).toBe(afterJoin)
  })

  test('the roster keeps its identity while nobody comes or goes', () => {
    const { client, result } = setup()
    act(() => client.join())
    const before = result.current

    act(() => client.simulateMedia('remote-1', { webcamOn: false }))

    expect(result.current).toBe(before)
  })
})

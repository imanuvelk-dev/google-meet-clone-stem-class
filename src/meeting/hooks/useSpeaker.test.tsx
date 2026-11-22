import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SpeakerContext } from '../SpeakerContext.ts'
import { SpeakerStore } from '../speaker.ts'
import { useSpeaker } from './useSpeaker.ts'

const setup = (store = new SpeakerStore({ supported: true })) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SpeakerContext.Provider value={store}>{children}</SpeakerContext.Provider>
  )
  return { store, ...renderHook(() => useSpeaker(), { wrapper }) }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useSpeaker', () => {
  test('reports the browser default until something is chosen', () => {
    const { result } = setup()
    expect(result.current.deviceId).toBeNull()
    expect(result.current.supported).toBe(true)
  })

  test('selecting a speaker updates what the picker shows', () => {
    const { result } = setup()

    act(() => result.current.select('speaker-2'))

    expect(result.current.deviceId).toBe('speaker-2')
  })

  test('reports lack of support, which is the signal to hide the control', () => {
    // Not decoration. A picker that silently does nothing in Safari is the
    // inherited bug, not the fix for it. See CLAUDE.md.
    const { result } = setup(new SpeakerStore({ supported: false }))

    expect(result.current.supported).toBe(false)
  })

  test('registering an audio element routes it', () => {
    const { result } = setup()
    const element = document.createElement('audio')
    const setSinkId = vi.fn(() => Promise.resolve())
    element.setSinkId = setSinkId
    act(() => result.current.select('speaker-2'))

    act(() => {
      result.current.register(element)
    })

    expect(setSinkId).toHaveBeenCalledWith('speaker-2')
  })

  test('works with no provider, because precall sits outside CallProvider', () => {
    // The selection is made in precall and used in the call, so requiring a
    // provider would split it in two.
    expect(() => renderHook(() => useSpeaker())).not.toThrow()
  })

  test('a selection made elsewhere reaches this consumer', () => {
    const { store, result } = setup()

    act(() => store.select('speaker-3'))

    expect(result.current.deviceId).toBe('speaker-3')
  })
})

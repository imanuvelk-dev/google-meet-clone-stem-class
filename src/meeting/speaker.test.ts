import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SpeakerStore } from './speaker.ts'

/**
 * The inherited Phase 1 item: precall ships a speaker picker that routes nothing.
 * These cover the two ways that can stay broken - the selection not reaching the
 * audio elements, and the control appearing where the browser cannot honour it.
 */

/**
 * jsdom implements no setSinkId at all, which is also true of Safari. Assigning
 * one here is the only way to observe routing; whether it EXISTS is the separate
 * question that `supported` answers, covered on its own below.
 *
 * The mock is returned alongside rather than read back off the element, because
 * `expect(element.setSinkId)` reads as an unbound method to the linter.
 */
const audioElement = (setSinkId = vi.fn(() => Promise.resolve())) => {
  const element = document.createElement('audio')
  element.setSinkId = setSinkId
  return { element, setSinkId }
}

beforeEach(() => {
  localStorage.clear()
})

describe('SpeakerStore', () => {
  test('routes the chosen device to every registered element', () => {
    // Every remote participant has their own audio element, and setSinkId is
    // per element. Missing one means one participant out of the wrong speaker.
    const store = new SpeakerStore({ supported: true })
    const first = audioElement()
    const second = audioElement()
    store.register(first.element)
    store.register(second.element)

    store.select('speaker-2')

    expect(first.setSinkId).toHaveBeenCalledWith('speaker-2')
    expect(second.setSinkId).toHaveBeenCalledWith('speaker-2')
  })

  test('routes an element that mounts after the choice was made', () => {
    // Tiles come and go. A participant joining after you picked a speaker must
    // not come out of the wrong one.
    const store = new SpeakerStore({ supported: true })
    store.select('speaker-2')

    const { element, setSinkId } = audioElement()
    store.register(element)

    expect(setSinkId).toHaveBeenCalledWith('speaker-2')
  })

  test('does not route where the browser cannot', () => {
    // Safari has no setSinkId. Calling it anyway would throw; the honest move is
    // to publish supported:false so the picker never renders.
    const store = new SpeakerStore({ supported: false })
    const { element, setSinkId } = audioElement()
    store.register(element)

    store.select('speaker-2')

    expect(store.getState().supported).toBe(false)
    expect(setSinkId).not.toHaveBeenCalled()
  })

  test('survives a device that vanished between choosing and using it', () => {
    const store = new SpeakerStore({ supported: true })
    const { element } = audioElement(vi.fn(() => Promise.reject(new Error('NotFoundError'))))
    store.register(element)

    // The browser stays on the default, which is the right outcome.
    expect(() => store.select('gone')).not.toThrow()
  })

  test('an unregistered element stops being routed to', () => {
    const store = new SpeakerStore({ supported: true })
    const { element, setSinkId } = audioElement()
    store.register(element)()

    store.select('speaker-2')

    expect(setSinkId).not.toHaveBeenCalledWith('speaker-2')
    expect(store.registeredCount).toBe(0)
  })

  test('the choice outlives the page, so it survives precall to call', () => {
    // It is made outside MeetingProvider and used inside it. Local state in
    // either one dies on navigation, which is where it dies today.
    new SpeakerStore({ supported: true }).select('speaker-2')

    expect(new SpeakerStore({ supported: true }).getState().deviceId).toBe('speaker-2')
  })

  test('selecting the default clears the stored choice', () => {
    const store = new SpeakerStore({ supported: true })
    store.select('speaker-2')

    store.select(null)

    expect(new SpeakerStore({ supported: true }).getState().deviceId).toBeNull()
  })

  test('notifies subscribers, and only on a real change', () => {
    const store = new SpeakerStore({ supported: true })
    const listener = vi.fn()
    store.subscribe(listener)

    store.select('speaker-2')
    store.select('speaker-2')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('unsubscribing stops notifications', () => {
    const store = new SpeakerStore({ supported: true })
    const listener = vi.fn()
    store.subscribe(listener)()

    store.select('speaker-2')

    expect(listener).not.toHaveBeenCalled()
  })

  test('a broken localStorage does not take the call with it', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })

    const store = new SpeakerStore({ supported: true })
    expect(() => store.select('speaker-2')).not.toThrow()
    expect(store.getState().deviceId).toBe('speaker-2')

    getItem.mockRestore()
    setItem.mockRestore()
  })

  test('detects support from the browser when not told', () => {
    // jsdom has no setSinkId, exactly like Safari, so detection must say so.
    expect(new SpeakerStore().getState().supported).toBe(false)
  })
})

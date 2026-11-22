import { beforeEach, describe, expect, test } from 'vitest'
import { loadParticipantId } from './session.ts'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('loadParticipantId', () => {
  test('is stable within a tab, so a reload does not arrive as a second person', () => {
    expect(loadParticipantId()).toBe(loadParticipantId())
  })

  test('lives in sessionStorage, not localStorage', () => {
    // The distinction IS the uniqueness guarantee. localStorage would hand two
    // tabs on one meeting the same id, and VideoSDK evicts on collision.
    const id = loadParticipantId()

    expect(sessionStorage.getItem('meet-clone:participant-id')).toBe(id)
    expect(localStorage.getItem('meet-clone:participant-id')).toBeNull()
  })

  test('a fresh tab gets a fresh id', () => {
    const first = loadParticipantId()
    sessionStorage.clear()

    expect(loadParticipantId()).not.toBe(first)
  })

  test('mints something unique enough to key a meeting on', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      sessionStorage.clear()
      ids.add(loadParticipantId())
    }

    expect(ids.size).toBe(100)
  })
})

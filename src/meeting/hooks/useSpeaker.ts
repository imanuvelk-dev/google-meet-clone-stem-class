import { useContext, useSyncExternalStore } from 'react'
import { SpeakerContext } from '../SpeakerContext.ts'
import type { SpeakerState } from '../speaker.ts'

export interface Speaker extends SpeakerState {
  select: (deviceId: string | null) => void
  /**
   * Called by each remote participant's <audio> element. Returns an unregister.
   * Routing is per element, so nothing is routed until they register.
   */
  register: (element: HTMLMediaElement) => () => void
}

/**
 * Speaker output. Works inside the call and outside it, because the choice is
 * made in precall and used in the call. See speaker.ts.
 *
 * `supported` is not decoration. Hide the picker when it is false: setSinkId does
 * not exist in Safari, and a picker that silently does nothing is the bug we
 * inherited, not the fix for it.
 */
export function useSpeaker(): Speaker {
  const store = useContext(SpeakerContext)
  const state = useSyncExternalStore(store.subscribe, store.getState)

  return { ...state, select: store.select, register: store.register }
}

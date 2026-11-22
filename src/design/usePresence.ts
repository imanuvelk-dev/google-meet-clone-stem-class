import { useEffect, useRef, useState, type RefObject } from 'react'

export type PresenceState = 'entering' | 'exiting'

export interface Presence<T, E extends HTMLElement> {
  rendered: T | null
  state: PresenceState
  ref: RefObject<E | null>
}

export function usePresence<T, E extends HTMLElement = HTMLDivElement>(
  value: T | null,
): Presence<T, E> {
  const [rendered, setRendered] = useState<T | null>(value)
  const ref = useRef<E | null>(null)
  const latest = useRef<T | null>(value)

  if (value !== null && value !== rendered) setRendered(value)

  const state: PresenceState = value === null ? 'exiting' : 'entering'

  useEffect(() => {
    latest.current = value
    if (value !== null || rendered === null) return

    const animations = ref.current?.getAnimations?.() ?? []
    if (animations.length === 0) {
      setRendered(null)
      return
    }

    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (latest.current === null) setRendered(null)
    })
  }, [value, rendered])

  return { rendered, state, ref }
}

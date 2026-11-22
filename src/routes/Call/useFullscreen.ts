import { useEffect, useState } from 'react'

export interface Fullscreen {
  active: boolean
  toggle: () => void
  supported: boolean
}

export function useFullscreen(): Fullscreen {
  const [active, setActive] = useState(() => document.fullscreenElement !== null)

  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  return {
    active,
    toggle,
    supported: typeof document.documentElement.requestFullscreen === 'function',
  }
}

import { useEffect } from 'react'

export interface CallShortcuts {
  toggleMic: () => void
  toggleWebcam: () => void
}

/**
 * Whether the keystroke belongs to whatever the user is typing into.
 *
 * Chat and the rename field arrive in Phase 3, so today this can only ever
 * return false in the call itself. It is here now because the day it matters is
 * the day someone types "don't" into chat and mutes the room - a bug that
 * arrives silently, in a file nobody is looking at, months from now.
 *
 * isContentEditable covers the rich-text case; closest() covers a keystroke that
 * landed on a child of one.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('[contenteditable]:not([contenteditable="false"])')) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Meet's real bindings: Ctrl+D mute, Ctrl+E camera.
 *
 * metaKey as well as ctrlKey, because Meet binds Cmd on macOS. Both collide with
 * a browser default - Ctrl/Cmd+D bookmarks, Ctrl+E opens search in Chrome - so
 * preventDefault is not optional here; without it, muting also drops a bookmark
 * dialog over the call. Meet takes the same keys and does the same thing.
 *
 * Shift and Alt are required to be absent, or Ctrl+Shift+D (Chrome's "bookmark
 * all tabs") would silently mute you as well.
 */
export function useCallShortcuts({ toggleMic, toggleWebcam }: CallShortcuts): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      if (event.repeat || isTyping(event.target)) return

      // event.key, not event.code: 'd' is where the D is on this layout, which is
      // what the user was told to press. event.code would be QWERTY's position.
      const key = event.key.toLowerCase()
      if (key === 'd') {
        event.preventDefault()
        toggleMic()
      } else if (key === 'e') {
        event.preventDefault()
        toggleWebcam()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleMic, toggleWebcam])
}

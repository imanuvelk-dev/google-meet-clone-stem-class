import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { usePresence } from '@design/usePresence.ts'
import styles from './ControlBar.module.css'

export interface ControlBarMenuProps {
  /** Accessible name of the menu and its trigger. */
  label: string
  /** Widened like React's own className: CSS Modules resolve to string | undefined. */
  triggerClassName: string | undefined
  triggerContent: ReactNode
  triggerTestId?: string | undefined
  menuClassName?: string | undefined
  anchorClassName?: string | undefined
  /** 'end' for triggers near the right edge, where a left-aligned popup overflows. */
  align?: 'start' | 'end'
  /**
   * 'down' for a trigger that is NOT on the floor of the viewport.
   *
   * The default opens upward because this was written for the control bar, where
   * up is the only direction there is. A People row is near the TOP of a panel,
   * and upward put its menu above the list's own top edge, where the list's
   * overflow clipped it away entirely: the host action was unreachable rather
   * than merely ugly.
   */
  direction?: 'up' | 'down'
  /** Menu contents. `close` is passed so an item can dismiss on activation. */
  children: (close: () => void) => ReactNode
}

/**
 * A popup anchored to a control-bar button, opening upward.
 *
 * Not the Menu primitive. Menu is precall's device picker: its trigger is a
 * labelled pill naming the current device, painted in the light --color-surface
 * palette. On this bar the triggers are a 40x48 chevron zone tinted by mute
 * state and a 36x48 dot button, over an always-dark surface. Teaching one
 * component every one of those faces would mean props that swap its whole
 * appearance - a worse component than two that each mean something.
 *
 * The semantics ARE Menu's, deliberately: role="menu", opens upward, Escape
 * and outside-click dismiss. Those are what a user feels, and they should not
 * differ between precall and the call.
 *
 * The popup itself has no Figma frame - the frame is drawn with every menu
 * closed - so it follows live Meet on the call surface and still needs a
 * screenshot review. See the Undesigned surfaces decision in docs/DECISIONS.md.
 */
export function ControlBarMenu({
  label,
  triggerClassName,
  triggerContent,
  triggerTestId,
  menuClassName,
  anchorClassName,
  align = 'start',
  direction = 'up',
  children,
}: ControlBarMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const { rendered, state, ref } = usePresence(open ? true : null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Escape must land you back on the trigger, or focus falls to the body
      // and a keyboard user has to tab in from the top of the page again.
      containerRef.current?.querySelector('button')?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={containerRef}
      className={anchorClassName ? `${styles.menuAnchor} ${anchorClassName}` : styles.menuAnchor}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid={triggerTestId}
      >
        {triggerContent}
      </button>

      {rendered ? (
        <div
          ref={ref}
          id={menuId}
          role="menu"
          aria-label={label}
          className={menuClassName ? `${styles.menuList} ${menuClassName}` : styles.menuList}
          data-align={align}
          data-direction={direction}
          data-state={state}
          inert={state === 'exiting'}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

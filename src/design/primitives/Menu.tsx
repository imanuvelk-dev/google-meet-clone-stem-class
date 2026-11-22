import { useEffect, useId, useRef, useState } from 'react'
import { usePresence } from '../usePresence.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './icon-paths.ts'
import styles from './Menu.module.css'

export interface MenuItem {
  id: string
  label: string
}

export interface MenuProps {
  /** Accessible name, e.g. "Microphone". Not rendered: the Figma shows only the device. */
  label: string
  items: MenuItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  icon?: IconName
  className?: string
}

/**
 * The precall device picker.
 *
 * menuitemradio rather than menuitem: picking a camera is choosing one of a set,
 * and the checked state is what tells you which one you are on.
 */
export function Menu({ label, items, selectedId, onSelect, icon, className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const { rendered, state, ref } = usePresence(open ? true : null)

  const selected = items.find((item) => item.id === selectedId)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={[styles.menu, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {icon ? <Icon name={icon} size={18} /> : null}
        <span className={styles.triggerLabel}>{selected?.label ?? label}</span>
        <Icon name="arrow_drop_down" size={18} />
      </button>

      {rendered ? (
        <div
          ref={ref}
          id={menuId}
          role="menu"
          aria-label={label}
          className={styles.list}
          data-state={state}
          inert={state === 'exiting'}
        >
          {items.length === 0 ? (
            // A trigger that opens onto nothing reads as broken. "No devices"
            // is a real precall state and deserves to be said out loud.
            <p className={styles.empty}>No devices found</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === selectedId}
                className={styles.item}
                onClick={() => {
                  onSelect(item.id)
                  setOpen(false)
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

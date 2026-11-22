import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { usePresence } from '@design/usePresence.ts'
import styles from './BottomSheet.module.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  label: string
  restoreFocusRef: RefObject<HTMLElement | null>
  children: ReactNode
}

export function BottomSheet({ open, onClose, label, restoreFocusRef, children }: BottomSheetProps) {
  const { rendered, state, ref } = usePresence<boolean, HTMLDivElement>(open ? true : null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) return
    const sheet = ref.current
    sheet?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !sheet) return
      const focusables = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusables.length === 0) {
        event.preventDefault()
        sheet.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === sheet)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, ref, onClose])

  useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (wasOpen.current) {
      wasOpen.current = false
      restoreFocusRef.current?.focus()
    }
  }, [open, restoreFocusRef])

  if (!rendered) return null

  return (
    <div className={styles.root} data-state={state}>
      <div className={styles.scrim} data-state={state} onClick={onClose} data-testid="sheet-scrim" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={styles.sheet}
        data-state={state}
        data-testid="options-sheet"
      >
        {children}
      </div>
    </div>
  )
}

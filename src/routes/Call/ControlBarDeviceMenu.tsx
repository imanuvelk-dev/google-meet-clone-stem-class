import { Icon, type MenuItem } from '@design/primitives/index.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import styles from './ControlBar.module.css'

export interface ControlBarDeviceMenuProps {
  /** Accessible name of the thing being picked, e.g. "Microphone". */
  label: string
  items: MenuItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Tints the chevron zone with the control's on/off state. */
  className?: string | undefined
  triggerTestId?: string | undefined
}

/**
 * The chevron half of an In Call Controls pill, and the device list it opens.
 *
 * menuitemradio rather than menuitem, as in precall: picking a camera is
 * choosing one of a set, and the checked state is what says which one you are
 * on.
 */
export function ControlBarDeviceMenu({
  label,
  items,
  selectedId,
  onSelect,
  className,
  triggerTestId,
}: ControlBarDeviceMenuProps) {
  return (
    <ControlBarMenu
      label={`${label} options`}
      triggerClassName={[styles.chevron, className].filter(Boolean).join(' ')}
      triggerContent={<Icon name="keyboard_arrow_up" size={20} />}
      triggerTestId={triggerTestId}
    >
      {(close) =>
        items.length === 0 ? (
          // A trigger that opens onto nothing reads as broken. Losing every
          // camera mid-call is a real state and deserves to be said out loud.
          <p className={styles.menuEmpty}>No devices found</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === selectedId}
              className={styles.menuItem}
              onClick={() => {
                onSelect(item.id)
                close()
              }}
            >
              {item.label}
            </button>
          ))
        )
      }
    </ControlBarMenu>
  )
}

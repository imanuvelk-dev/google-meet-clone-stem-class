import { Icon } from '@design/primitives/index.ts'
import { useIsMobile } from '@design/useMediaQuery.ts'
import type { CallAction, CallActionId, CallActions } from './callActions.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import { MobileOptionsSheet } from './MobileOptionsSheet.tsx'
import styles from './ControlBar.module.css'

export interface ControlBarOptionsMenuProps {
  actions: CallActions
}

const MENU_TEST_IDS: Record<CallActionId, string> = {
  layout: 'layout',
  fullscreen: 'option-fullscreen',
  whiteboard: 'toggle-whiteboard',
  recording: 'host-toggle-recording',
  'mute-everyone': 'host-mute-all',
  'raise-hand': 'option-raise-hand',
  captions: 'option-captions',
  people: 'option-people',
  chat: 'option-chat',
}

const MENU_ORDER: readonly CallActionId[] = ['layout', 'fullscreen', 'whiteboard', 'recording']

export function MenuRow({
  action,
  divided,
  close,
  showIcon = true,
}: {
  action: CallAction
  divided: boolean
  close: () => void
  showIcon?: boolean
}) {
  if (action.kind === 'choice') {
    return (
      <div
        role="group"
        aria-label={action.label}
        className={divided ? styles.menuItemDivided : undefined}
      >
        <p className={styles.menuLabel}>{action.label}</p>
        {action.options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="menuitemradio"
            aria-checked={option.selected}
            className={[styles.menuItem, styles.menuItemIcon].join(' ')}
            onClick={() => {
              option.select()
              if (action.dismisses) close()
            }}
            data-testid={`${MENU_TEST_IDS[action.id]}-${option.id}`}
          >
            <Icon name={option.icon} size={20} />
            {option.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={[
        styles.menuItem,
        showIcon ? styles.menuItemIcon : '',
        divided ? styles.menuItemDivided : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={action.disabled !== null}
      onClick={() => {
        action.activate()
        if (action.dismisses) close()
      }}
      data-testid={MENU_TEST_IDS[action.id]}
    >
      {showIcon ? <Icon name={action.icon} size={20} /> : null}
      {action.label}
    </button>
  )
}

export function ControlBarOptionsMenu({ actions }: ControlBarOptionsMenuProps) {
  const isMobile = useIsMobile()

  if (isMobile) return <MobileOptionsSheet actions={actions} />

  return <DesktopOptionsMenu actions={actions} />
}

function DesktopOptionsMenu({ actions }: ControlBarOptionsMenuProps) {
  const rows = MENU_ORDER.map((id) => actions[id]).filter(
    (action): action is CallAction => action !== null,
  )

  return (
    <ControlBarMenu
      label="More options"
      triggerClassName={styles.controlNarrow}
      triggerContent={<Icon name="more_vert" size={24} />}
      triggerTestId="control-options"
    >
      {(close) => (
        <>
          {rows.map((action, index) => (
            <MenuRow key={action.id} action={action} divided={index > 0} close={close} />
          ))}
        </>
      )}
    </ControlBarMenu>
  )
}

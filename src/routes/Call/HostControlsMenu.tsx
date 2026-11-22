import { Icon, Tooltip } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import type { CallActions } from './callActions.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import { MenuRow } from './ControlBarOptionsMenu.tsx'
import styles from './ControlBar.module.css'

export function HostControlsMenu({ actions }: { actions: CallActions }) {
  const { isHost } = useCall()
  const muteEveryone = actions['mute-everyone']

  if (!isHost) {
    return (
      <Tooltip content="Only the meeting host can use these">
        <button
          type="button"
          className={styles.plain}
          aria-label="Host controls"
          aria-disabled="true"
          data-testid="control-host-controls"
        >
          <Icon name="lock_person" size={24} />
        </button>
      </Tooltip>
    )
  }

  return (
    <ControlBarMenu
      label="Host controls"
      triggerClassName={styles.plain}
      triggerTestId="control-host-controls"
      triggerContent={<Icon name="lock_person" size={24} />}
      align="end"
    >
      {(close) => (
        <>
          {muteEveryone ? (
            <MenuRow action={muteEveryone} divided={false} close={close} showIcon={false} />
          ) : null}
        </>
      )}
    </ControlBarMenu>
  )
}

import { useRef, useState } from 'react'
import { Icon } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useSendReaction } from '@meeting/hooks/useReactions.ts'
import { REACTION_EMOJI } from '@meeting/pubsubTopics.ts'
import { BottomSheet } from './BottomSheet.tsx'
import type { CallAction, CallActionId, CallActions } from './callActions.ts'
import { JoiningInfo } from './MeetingDetails.tsx'
import controlStyles from './ControlBar.module.css'
import styles from './BottomSheet.module.css'

const SHEET_TEST_IDS: Record<CallActionId, string> = {
  layout: 'sheet-layout',
  fullscreen: 'sheet-fullscreen',
  whiteboard: 'sheet-whiteboard',
  recording: 'sheet-recording',
  'mute-everyone': 'sheet-mute-all',
  'raise-hand': 'sheet-raise-hand',
  captions: 'sheet-captions',
  people: 'sheet-people',
  chat: 'sheet-chat',
}

const SHEET_TOGGLES: readonly CallActionId[] = ['raise-hand', 'captions']
const SHEET_PANELS: readonly CallActionId[] = ['people', 'chat']
const SHEET_TOOLS: readonly CallActionId[] = [
  'fullscreen',
  'whiteboard',
  'recording',
  'mute-everyone',
]

function SheetRow({ action, close }: { action: CallAction; close: () => void }) {
  if (action.kind === 'choice') {
    return (
      <div className={styles.section} role="radiogroup" aria-label={action.label}>
        <p className={styles.sectionLabel}>{action.label}</p>
        {action.options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.selected}
            className={styles.item}
            onClick={() => {
              option.select()
              if (action.dismisses) close()
            }}
            data-testid={`${SHEET_TEST_IDS[action.id]}-${option.id}`}
          >
            <Icon name={option.icon} size={24} />
            <span className={styles.itemLabel}>{option.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={styles.item}
      aria-pressed={action.kind === 'toggle' ? action.on : undefined}
      disabled={action.disabled !== null}
      onClick={() => {
        action.activate()
        if (action.dismisses) close()
      }}
      data-testid={SHEET_TEST_IDS[action.id]}
    >
      <Icon name={action.icon} size={24} />
      <span className={styles.itemLabel}>{action.label}</span>
      {action.badge ? (
        <span className={styles.itemBadge} data-testid={`sheet-${action.badge.testId}`}>
          {action.badge.count}
        </span>
      ) : null}
    </button>
  )
}

export function MobileOptionsSheet({ actions }: { actions: CallActions }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const call = useCall()
  const sendReaction = useSendReaction()

  const close = () => setOpen(false)

  const rows = (ids: readonly CallActionId[]) =>
    ids.map((id) => {
      const action = actions[id]
      if (action === null) return null
      return <SheetRow key={id} action={action} close={close} />
    })

  const layout = actions.layout

  return (
    <div className={controlStyles.menuAnchor}>
      <button
        ref={triggerRef}
        type="button"
        className={controlStyles.controlNarrow}
        aria-label="More options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid="control-options"
      >
        <Icon name="more_vert" size={24} />
      </button>

      <BottomSheet open={open} onClose={close} label="More options" restoreFocusRef={triggerRef}>
        <div className={styles.grabber} aria-hidden="true" />

        <div className={styles.reactionsRow} role="group" aria-label="Reactions">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactionButton}
              aria-label={`React with ${emoji}`}
              onClick={() => {
                sendReaction(emoji)
                close()
              }}
              data-testid={`reaction-${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {rows(SHEET_TOGGLES)}

        <div className={styles.section}>{rows(SHEET_PANELS)}</div>

        <div className={styles.section}>
          <JoiningInfo meetingId={call.meetingId} className={styles.joiningInfo} />
        </div>

        {layout ? <SheetRow action={layout} close={close} /> : null}

        <div className={styles.section}>{rows(SHEET_TOOLS)}</div>
      </BottomSheet>
    </div>
  )
}

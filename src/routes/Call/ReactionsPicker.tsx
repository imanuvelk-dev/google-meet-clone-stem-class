import type { CSSProperties } from 'react'
import { Icon } from '@design/primitives/index.ts'
import { useSendReaction } from '@meeting/hooks/useReactions.ts'
import { REACTION_EMOJI } from '@meeting/pubsubTopics.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import styles from './ControlBar.module.css'

/**
 * Live-sourced from Meet: the frame draws this menu closed and cannot show it.
 *
 * The set and its order are REACTION_EMOJI in pubsubTopics.ts, which is the wire
 * contract. Anything not in it is dropped at the seam rather than rendered - a
 * tofu box over someone's face is worse than nothing.
 */
export function ReactionsPicker() {
  const sendReaction = useSendReaction()

  return (
    <ControlBarMenu
      label="Reactions"
      triggerClassName={styles.controlWide}
      triggerTestId="control-reactions"
      triggerContent={<Icon name="mood" size={24} />}
      menuClassName={styles.menuReactions}
      anchorClassName={styles.barOptional}
    >
      {(close) => (
        <div className={styles.reactions} role="none">
          {REACTION_EMOJI.map((emoji, index) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              className={styles.reaction}
              style={{ '--stagger-index': index } as CSSProperties}
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
      )}
    </ControlBarMenu>
  )
}

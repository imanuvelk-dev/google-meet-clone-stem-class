import { Button } from '@design/primitives/index.ts'
import type { CallEnding, CallEndingKind } from './Call.tsx'
import styles from './PostCall.module.css'

interface Ending {
  title: string
  description: string | null
  /**
   * The label on the way back in, or null where there is nothing to go back to.
   *
   * Null for `ended` on purpose. Someone called end(), which terminates the
   * meeting for everyone and deactivates the room, so a Rejoin here would be a
   * button that fails every time it is pressed. Meet does not offer one either.
   */
  rejoinLabel: string | null
}

/**
 * The four endings, kept as four sentences.
 *
 * 'left' and 'dropped' are the same SDK state and different things to the person
 * it happened to, which is the whole reason Call remembers which one it was.
 */
const ENDINGS: Record<CallEndingKind, Ending> = {
  left: {
    title: 'You left the meeting',
    description: null,
    rejoinLabel: 'Rejoin',
  },
  dropped: {
    title: 'You have been disconnected',
    description: 'Your connection to the meeting was lost.',
    rejoinLabel: 'Rejoin',
  },
  ended: {
    title: 'The meeting has ended',
    description: 'The meeting was ended for everyone.',
    rejoinLabel: null,
  },
  failed: {
    title: 'Could not connect to the meeting',
    description: 'Check your connection and try again.',
    rejoinLabel: 'Try again',
  },
}

export interface PostCallProps {
  ending: CallEnding
  /** Starts a fresh camera and mic and joins again. Absent where there is no way back. */
  onRejoin: () => void
  onReturnHome: () => void
}

/**
 * What is left after the call. Not in the Figma: sourced from live Meet, and
 * screenshot-review material rather than diff material.
 *
 * Meet also carries a feedback card and a "your meeting is safe" panel here.
 * Neither is built: one needs somewhere to send feedback, and the other would be
 * a claim about our security posture rather than a copy of Google's.
 */
export function PostCall({ ending, onRejoin, onReturnHome }: PostCallProps) {
  const { title, description, rejoinLabel } = ENDINGS[ending.kind]

  return (
    <div className={styles.screen} data-testid="post-call">
      <h1 className={styles.title}>{title}</h1>
      {description === null ? null : <p className={styles.description}>{description}</p>}

      <div className={styles.actions}>
        {rejoinLabel === null ? null : (
          <Button variant="filled" onClick={onRejoin} data-testid="rejoin">
            {rejoinLabel}
          </Button>
        )}
        <Button
          variant="text"
          className={styles.secondary}
          onClick={onReturnHome}
          data-testid="return-home"
        >
          Return to home screen
        </Button>
      </div>
    </div>
  )
}

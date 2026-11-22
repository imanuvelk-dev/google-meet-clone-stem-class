import { Button, Icon } from '@design/primitives/index.ts'
import type { MediaErrorReason } from '@meeting/MeetingClient.ts'
import styles from './MediaErrorState.module.css'

export interface MediaErrorStateProps {
  reason: MediaErrorReason
  onRetry: () => void
}

interface Copy {
  title: string
  body: string
  /**
   * Whether retrying can possibly help. When it cannot, we must not offer it:
   * a button that provably does nothing is worse than no button.
   */
  retryable: boolean
}

const COPY: Record<MediaErrorReason, Copy> = {
  'permission-blocked': {
    title: 'Camera and microphone are blocked',
    body: 'Click the blocked camera icon in your browser’s address bar, allow access, then reload this page.',
    // The one-way door. Once blocked, the browser will not show its dialog
    // again no matter what we call, so Retry is a dead end. See CLAUDE.md.
    retryable: false,
  },
  'permission-denied': {
    title: 'Allow camera and microphone access',
    body: 'Your browser needs permission before others can see and hear you.',
    retryable: true,
  },
  'no-devices': {
    title: 'No camera or microphone found',
    body: 'Connect a device and try again. You can still join and listen.',
    retryable: true,
  },
  'device-in-use': {
    title: 'Your camera is in use',
    body: 'Another app may be using it. Close that app, then try again.',
    retryable: true,
  },
  unknown: {
    title: 'Something went wrong',
    body: 'We could not start your camera.',
    retryable: true,
  },
}

/**
 * Shown in place of the camera preview. Precall is mostly error states, so these
 * are first-class screens rather than a generic toast.
 */
export function MediaErrorState({ reason, onRetry }: MediaErrorStateProps) {
  const copy = COPY[reason]

  return (
    <div className={styles.state} role="alert" data-testid={`media-error-${reason}`}>
      <Icon name={reason === 'no-devices' ? 'videocam_off' : 'error'} size={32} />
      <p className={styles.title}>{copy.title}</p>
      <p className={styles.body}>{copy.body}</p>

      {copy.retryable ? (
        <Button variant="filled" onClick={onRetry} data-testid="media-error-retry">
          Try again
        </Button>
      ) : (
        // Deliberately not a button. The recovery lives in browser chrome we
        // cannot reach from script.
        <p className={styles.hint} data-testid="media-error-recovery-hint">
          Then reload the page.
        </p>
      )}
    </div>
  )
}

import { useRecording } from '@meeting/hooks/useRecording.ts'
import styles from './RecordingBadge.module.css'

/**
 * Live-sourced from Meet: a red dot and REC, top-left over the stage.
 *
 * Reads isRecording, never recordingState. The seam maps the SDK's status
 * strings and returns null for anything it does not recognise, because those
 * strings are UNVERIFIED - so an unknown status leaves this absent rather than
 * putting a REC over a meeting nobody is recording. See the plan's open risks.
 */
export function RecordingBadge() {
  const { isRecording } = useRecording()
  if (!isRecording) return null

  return (
    <p className={styles.badge} role="status" data-testid="recording-badge">
      <span className={styles.dot} aria-hidden="true" />
      REC
    </p>
  )
}

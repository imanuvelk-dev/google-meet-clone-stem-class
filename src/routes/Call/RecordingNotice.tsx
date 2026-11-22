import { useState } from 'react'
import { useRecording } from '@meeting/hooks/useRecording.ts'
import styles from './RecordingNotice.module.css'

/**
 * Meet's consent notice. Live-sourced: recording has no Figma frame.
 *
 * Acknowledgement is deliberately local component state and is NOT published.
 * Consent here is being TOLD, not asked - the recording is already running and
 * nothing a participant clicks stops it. Broadcasting an "I agreed" would state
 * a fact about a person that we would then have to honour, and we cannot.
 *
 * Keyed on the recording's identity rather than a once-per-session flag: a
 * second recording is a second thing to be told about, so dismissing the first
 * must not silence the next one.
 */
export function RecordingNotice() {
  const { isRecording } = useRecording()
  const [acknowledged, setAcknowledged] = useState(false)
  const [announced, setAnnounced] = useState(isRecording)

  // Adjusted during render rather than in an effect. React documents this shape
  // for "reset state when a value changes": it re-renders before committing, so
  // it costs nothing, where an effect would paint a stale card first and then
  // cascade a second render to correct it.
  if (announced !== isRecording) {
    setAnnounced(isRecording)
    if (!isRecording) setAcknowledged(false)
  }

  if (!isRecording || acknowledged) return null

  return (
    <div
      className={styles.notice}
      role="alertdialog"
      aria-labelledby="recording-notice-title"
      data-testid="recording-notice"
    >
      <h2 className={styles.title} id="recording-notice-title">
        This meeting is being recorded
      </h2>
      <p className={styles.description}>
        Make sure everyone is aware. The recording is saved to the meeting organiser&rsquo;s
        VideoSDK dashboard.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setAcknowledged(true)}
          data-testid="recording-notice-dismiss"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

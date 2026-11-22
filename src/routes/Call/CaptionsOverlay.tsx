import { useCall } from '@meeting/hooks/useCall.ts'
import { useCaptions } from '@meeting/hooks/useCaptions.ts'
import styles from './CaptionsOverlay.module.css'

export function CaptionsOverlay() {
  const lines = useCaptions()
  const { localParticipantId } = useCall()

  if (lines.length === 0) return null

  return (
    <div className={styles.overlay} role="status" data-testid="captions-overlay">
      {lines.map((line) => (
        <p key={line.participantId} className={styles.line}>
          <span className={styles.speaker}>
            {line.participantId === localParticipantId ? 'You' : line.participantName}
          </span>
          <span className={styles.text}>{line.text}</span>
        </p>
      ))}
    </div>
  )
}

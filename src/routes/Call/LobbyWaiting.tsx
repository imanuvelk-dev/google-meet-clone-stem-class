import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import styles from './LobbyWaiting.module.css'

/**
 * The guest's side of the lobby. Live-sourced from Meet.
 *
 * Host absent is not a failure and must not be "fixed": an empty room admits
 * nobody, deliberately, so the ask simply goes unanswered. See DECISIONS.md's
 * host-absent trap.
 */

export const LOBBY_RESPONSE_TIMEOUT_MS = 60_000

export function LobbyWaiting() {
  const { entryDecision } = useCall()
  const navigate = useNavigate()
  const [unanswered, setUnanswered] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setUnanswered(true), LOBBY_RESPONSE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  if (entryDecision === 'denied') {
    return (
      <div className={styles.screen} data-testid="lobby-denied">
        <h2 className={styles.title}>You can&rsquo;t join this call</h2>
        <p className={styles.description}>Someone in the call denied your request to join.</p>
      </div>
    )
  }

  if (unanswered) {
    return (
      <div className={styles.screen} data-testid="lobby-unanswered">
        <h2 className={styles.title}>Nobody responded to your request</h2>
        <p className={styles.description}>
          You&rsquo;ll still join the call if someone lets you in.
        </p>
        <div className={styles.actions}>
          <Button
            variant="filled"
            onClick={() => void navigate('/')}
            data-testid="lobby-return-home"
          >
            Return to home screen
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen} data-testid="lobby-waiting">
      <h2 className={styles.title}>Asking to be let in</h2>
      <p className={styles.description}>You&rsquo;ll join the call when someone lets you in.</p>
    </div>
  )
}

import { useLobby, usePendingEntry } from '@meeting/hooks/useLobby.ts'
import styles from './LobbyKnocks.module.css'

/**
 * The host's side of the lobby. Live-sourced from Meet.
 *
 * The card clears when the admitted guest ARRIVES IN THE ROSTER, not when the
 * host clicks: allow() fired at a guest who already left produces no arrival, so
 * the card correctly stays rather than vanishing into a lie. The store owns both
 * sides of that. Deny clears immediately, having no arrival to wait for.
 *
 * requestedAt is deliberately not read here. Staleness is the view's job and the
 * store records the time so the clock stays at the edge - but forgetting is the
 * honest default until there is a design for what stale looks like.
 */
function Knock({ participantId }: { participantId: string }) {
  const entry = usePendingEntry(participantId)
  const { admit, deny } = useLobby()
  if (!entry) return null

  return (
    <li className={styles.card} data-testid={`lobby-knock-${participantId}`}>
      <p className={styles.name}>{entry.name} wants to join this call</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.deny}
          onClick={() => deny(participantId)}
          data-testid={`lobby-deny-${participantId}`}
        >
          Deny entry
        </button>
        <button
          type="button"
          className={styles.admit}
          onClick={() => admit(participantId)}
          data-testid={`lobby-admit-${participantId}`}
        >
          Admit
        </button>
      </div>
    </li>
  )
}

export function LobbyKnocks() {
  const { pendingIds } = useLobby()
  if (pendingIds.length === 0) return null

  return (
    <ul className={styles.stack} data-testid="lobby-knocks">
      {pendingIds.map((id) => (
        <Knock key={id} participantId={id} />
      ))}
    </ul>
  )
}

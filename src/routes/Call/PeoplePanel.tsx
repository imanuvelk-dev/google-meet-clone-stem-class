import { useMemo, useState } from 'react'
import { Icon } from '@design/primitives/index.ts'
import { useParticipants } from '@meeting/hooks/useParticipants.ts'
import { useRaisedHands } from '@meeting/hooks/useRaisedHands.ts'
import { Panel } from './Panel.tsx'
import { PersonRow } from './PersonRow.tsx'
import styles from './PeoplePanel.module.css'

/**
 * Figma `Desktop / Meeting / People / Light` (52:2215) > People 360x1021.
 *
 * Three things the frame draws are deliberately absent, all user-settled:
 *
 * - "Add People". There is no directory and no OAuth, so it could only ever
 *   open something that is not there. Same rule that dropped Switch account.
 * - The "Contributors" group and its count. We do not model contributor vs
 *   viewer, and the frame's own header disagrees with its list anyway: it reads
 *   1 above three people.
 * - A host badge on anyone but you. Remote host-ness is not derivable; the only
 *   way to fake it is a self-asserted PubSub topic any client could forge. Your
 *   OWN "Meeting host" label is real and is kept.
 *
 * See DECISIONS.md's accepted deviations.
 */
export function PeoplePanel({ onClose }: { onClose: () => void }) {
  const participantIds = useParticipants()
  const { ids: raisedHands } = useRaisedHands()
  const [query, setQuery] = useState('')

  // Hands first in the order they went up, then roster order. Ordering is a view
  // concern and the order is advisory anyway - PubSub carries no authority - so
  // it is derived here rather than stored.
  const ordered = useMemo(() => {
    const raised = raisedHands.filter((id) => participantIds.includes(id))
    const rest = participantIds.filter((id) => !raised.includes(id))
    return [...raised, ...rest]
  }, [participantIds, raisedHands])

  return (
    <Panel title="People" testId="people-panel" onClose={onClose}>
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Icon name="search" size={24} />
        </span>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for people"
          aria-label="Search for people"
          data-testid="people-search"
        />
      </div>

      <p className={styles.sectionTitle}>In the meeting</p>

      <ul className={styles.list} data-testid="people-list">
        {ordered.map((id) => (
          <PersonRow key={id} participantId={id} query={query} />
        ))}
      </ul>
    </Panel>
  )
}

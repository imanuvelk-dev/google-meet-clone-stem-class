import { memo } from 'react'
import { Avatar, Icon } from '@design/primitives/index.ts'
import { useLocalParticipantId } from '@meeting/hooks/useCall.ts'
import { useHostControls } from '@meeting/hooks/useHostControls.ts'
import { useParticipantView } from '@meeting/hooks/useParticipantView.ts'
import { useRaisedHands } from '@meeting/hooks/useRaisedHands.ts'
import { colourFor } from '../../lib/session.ts'
import { ControlBarMenu } from './ControlBarMenu.tsx'
import styles from './PeoplePanel.module.css'

/**
 * Figma `.../People / Light` > Person 308x56. Host actions and the hand are not
 * in the frame - it draws a resting state - and are live-sourced from Meet.
 *
 * There is no unmute action and there must never be one. Hosts can mute and
 * cannot force-unmute: requestMic only ASKS, and the target may refuse. The
 * absence of unmuteParticipant on the seam is what makes that bug unwritable.
 *
 * memo, for the same reason as ParticipantTile: Call re-renders on every active
 * speaker change and this panel holds up to 50 of these. Props are primitives,
 * so the shallow compare holds, and useParticipantView then re-renders one row
 * when that person changes.
 */
export const PersonRow = memo(function PersonRow({
  participantId,
  query,
}: {
  participantId: string
  query: string
}) {
  const participant = useParticipantView(participantId)
  const localParticipantId = useLocalParticipantId()
  const host = useHostControls()
  const { lower } = useRaisedHands()

  if (!participant) return null

  const { displayName, micOn, handRaised } = participant
  if (query && !displayName.toLowerCase().includes(query.trim().toLowerCase())) return null

  const isSelf = participantId === localParticipantId
  // Our own host-ness only. Remote host-ness is not derivable - see PeoplePanel.
  const subtitle = isSelf && host.isHost ? 'Meeting host' : null

  return (
    <li className={styles.person} data-testid={`person-${participantId}`}>
      <Avatar name={displayName} color={colourFor(displayName)} size={32} />

      <span className={styles.personName}>
        <span className={styles.personLabel}>
          {displayName}
          {isSelf ? ' (You)' : ''}
        </span>
        {subtitle ? <span className={styles.personSubtitle}>{subtitle}</span> : null}
      </span>

      {handRaised ? (
        <span
          className={styles.hand}
          role="img"
          aria-label={`${displayName} raised their hand`}
          data-testid={`person-hand-${participantId}`}
        >
          <Icon name="back_hand" size={18} />
        </span>
      ) : null}

      {micOn ? null : (
        <span
          className={styles.personMuted}
          role="img"
          aria-label={`${displayName} is muted`}
          data-testid={`person-muted-${participantId}`}
        >
          <Icon name="mic_off" size={18} />
        </span>
      )}

      {host.isHost && !isSelf ? (
        <ControlBarMenu
          label={`More actions for ${displayName}`}
          triggerClassName={styles.personMore}
          triggerTestId={`person-menu-${participantId}`}
          triggerContent={<Icon name="more_vert" size={18} />}
          align="end"
          direction="down"
        >
          {(close) => (
            <>
              {micOn ? (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    host.mute(participantId)
                    close()
                  }}
                  data-testid={`person-mute-${participantId}`}
                >
                  Mute
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    host.requestMic(participantId)
                    close()
                  }}
                  data-testid={`person-ask-unmute-${participantId}`}
                >
                  Ask to unmute
                </button>
              )}
              {handRaised ? (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    lower(participantId)
                    close()
                  }}
                  data-testid={`person-lower-${participantId}`}
                >
                  Lower hand
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  host.remove(participantId)
                  close()
                }}
                data-testid={`person-remove-${participantId}`}
              >
                Remove from call
              </button>
            </>
          )}
        </ControlBarMenu>
      ) : null}
    </li>
  )
})

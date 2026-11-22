import { memo } from 'react'
import { Avatar, Icon, IconButton } from '@design/primitives/index.ts'
import { colourFor } from '@lib/session.ts'
import { useParticipantView } from '@meeting/hooks/useParticipantView.ts'
import { TileReactions } from './TileReactions.tsx'
import { VideoSurface } from './VideoSurface.tsx'
import styles from './ParticipantTile.module.css'

export interface ParticipantTileProps {
  participantId: string
  /** From CallState, passed down. Reading it here would subscribe every tile to it. */
  isActiveSpeaker: boolean
  isPinned: boolean
  isLocal: boolean
  /** Reports the current state back, so the stage's handler need not close over it. */
  onTogglePin: (participantId: string, wasPinned: boolean) => void
}

/**
 * One person, per Figma node I64:2563;64:2104 - 840x502, radius 24, name at the
 * bottom left, mute badge at the top right, avatar in the middle when the camera
 * is off.
 *
 * memo'd, and it earns it. The stage re-renders on any call-level change - the
 * active speaker moving is enough - and without this every one of up to 49 tiles
 * would re-render with it. Props are primitives and one stable callback, so
 * memo's shallow compare actually holds; useParticipantView then re-renders this
 * tile alone when this participant changes.
 */
export const ParticipantTile = memo(function ParticipantTile({
  participantId,
  isActiveSpeaker,
  isPinned,
  isLocal,
  onTogglePin,
}: ParticipantTileProps) {
  const participant = useParticipantView(participantId)

  // Gone between the roster naming them and this rendering. A hole is better
  // than a tile with nobody in it.
  if (!participant) return null

  /*
   * handRaised comes off the participant snapshot, never getRaisedHands(). The
   * folded boolean re-renders this tile when THIS hand moves; the ordered queue
   * changes identity whenever anyone's does, so reading it here would re-render
   * all 49 tiles every time one person raises. The queue is the panel's and the
   * bar's - they genuinely want the order. See DECISIONS.md.
   *
   * It is deliberately not a prop either: the stage would have to read the queue
   * to pass it, which is the same storm one level up.
   */
  const { displayName, micOn, webcamOn, webcamStream, handRaised } = participant

  return (
    <div
      className={styles.tile}
      // Not aria-pressed on a ring: the speaking state is decoration over
      // information a screen reader gets from the audio itself.
      data-active-speaker={isActiveSpeaker || undefined}
      data-testid={`participant-tile-${participantId}`}
    >
      {webcamOn && webcamStream ? (
        <>
          <VideoSurface
            stream={webcamStream}
            mirrored={isLocal}
            testId={`participant-video-${participantId}`}
          />
          {/* Figma: the image fill carries a second SOLID black fill at 10%. */}
          <div className={styles.scrim} aria-hidden="true" />
        </>
      ) : (
        /*
         * Figma (I64:2563;64:2125): the camera-off tile is the participant's own
         * avatar photo, blown up and blurred behind a 45% black wash, with the
         * avatar itself at 80px in the middle.
         *
         * We have a generated colour, not a photo - no OAuth, the accepted
         * deviation precall already carries - and blurring a flat colour is a
         * no-op. Deriving the backdrop from the avatar colour was tried and is
         * wrong on every axis: it puts the disc on a darker shade of itself, so
         * the one thing the tile exists to show stops reading, and it lands
         * further from the frame's own pixels (a warm #4b3833) than a neutral
         * does. So the backdrop is the tile's surface, and the avatar keeps its
         * colour - which is also what real Meet does.
         */
        <div className={styles.cameraOff} data-testid={`participant-avatar-${participantId}`}>
          <Avatar
            name={displayName}
            color={colourFor(displayName)}
            // Figma: 80px on an 840x502 tile. Expressed against the tile's own
            // height so it shrinks with the tile rather than at breakpoints, and
            // floored where an initial would stop being legible.
            size="clamp(20px, 16cqh, 80px)"
          />
        </div>
      )}

      {micOn ? null : (
        /*
         * Figma: `Muted` (I64:2563;64:2104;60:19), 28px circle inset 10px from
         * the top right, black at 40%, white mic_off inside.
         *
         * One deliberate difference: the frame blends this badge with OVERLAY,
         * which reads on the light photo it was drawn over and composites to
         * nothing over a dark one - a muted person on a camera-off tile would
         * have no muted badge at all. The blend is dropped so the indicator works
         * on every background. Report-worthy, not a licence: this is the one
         * diffable screen in the phase.
         */
        <div
          className={styles.muted}
          role="img"
          aria-label={`${displayName} is muted`}
          data-testid={`participant-muted-${participantId}`}
        >
          <Icon name="mic_off" size={18} />
        </div>
      )}

      {/* Figma: 16px Product Sans Bold, white, 16px in from the left and bottom. */}
      <p className={styles.name} data-testid={`participant-name-${participantId}`}>
        {displayName}
      </p>

      {/*
        Local only, and never the SDK's pin(). Meet's pin changes your view and
        nobody else's; the SDK's broadcasts. useCall().pin routes to our own
        state. See DECISIONS.md.
      */}
      <IconButton
        icon={isPinned ? 'keep_off' : 'keep'}
        label={isPinned ? `Unpin ${displayName}` : `Pin ${displayName}`}
        variant="overlay"
        className={[styles.pin, isPinned ? styles.pinActive : null].filter(Boolean).join(' ')}
        onClick={() => onTogglePin(participantId, isPinned)}
        data-testid={`participant-pin-${participantId}`}
      />

      {handRaised ? (
        /*
         * Live Meet, no Figma frame. Shaped as the mute badge's twin so the two
         * read as one family of tile state, and placed bottom right - see the CSS.
         *
         * role="img", matching the mute badge: the raised state is real
         * information, and a hand icon alone conveys none of it to a screen
         * reader. The People panel carries the order; this only carries the fact.
         */
        <div
          className={styles.handRaised}
          role="img"
          aria-label={`${displayName} has their hand raised`}
          data-testid={`participant-hand-${participantId}`}
        >
          <Icon name="back_hand" size={18} />
        </div>
      ) : null}

      <TileReactions participantId={participantId} />
    </div>
  )
})

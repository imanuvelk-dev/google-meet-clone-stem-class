import { useTileReactions } from '@meeting/hooks/useReactions.ts'
import styles from './TileReactions.module.css'

export interface TileReactionsProps {
  participantId: string
}

/**
 * Reactions floating over one tile, per live Meet. No Figma frame draws these.
 *
 * Not memo'd, deliberately: this subscribes to the reaction channel itself, so
 * it re-renders on its own participant's reactions and on nothing else. Wrapping
 * it would only add a compare to a component whose props never change.
 *
 * Each entry is cleared on `onAnimationEnd`, never a timer. That is the whole
 * reason the seam hands us an event channel rather than state: a reaction's
 * lifetime IS its animation, so the CSS owns the clock. `prefers-reduced-motion`
 * then falls out for free - the duration collapses and the animation self-cleans.
 * A `setTimeout` would leak under reduced motion, where nothing is animating.
 */
export function TileReactions({ participantId }: TileReactionsProps) {
  const { reactions, dismiss } = useTileReactions(participantId)

  if (reactions.length === 0) return null

  return (
    <div
      className={styles.layer}
      /*
       * The same emoji cannot be announced without a live region, and a live
       * region per tile means up to 49 of them competing over one call. That is
       * a per-call announcement's job, not a tile's, so the layer is decorative
       * here rather than silently unreadable.
       */
      aria-hidden="true"
    >
      {reactions.map((reaction) => (
        /*
         * reaction.id, never the array index. The store synthesised the id
         * precisely so the same emoji twice is two occurrences: index keys would
         * hand the second one the first one's still-running animation, and the
         * pair would read as a single reaction.
         */
        <span
          key={reaction.id}
          className={styles.reaction}
          onAnimationEnd={() => dismiss(reaction.id)}
          data-testid={`participant-reaction-${participantId}`}
        >
          {reaction.emoji}
        </span>
      ))}
    </div>
  )
}

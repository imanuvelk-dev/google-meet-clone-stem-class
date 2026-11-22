import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CallReaction } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'
import type { ReactionEmoji } from '../pubsubTopics.ts'

export interface TileReactions {
  reactions: readonly CallReaction[]
  /** Call from onAnimationEnd. Never a timer: reduced motion sets duration 0. */
  dismiss: (reactionId: string) => void
}

export function useSendReaction(): (emoji: ReactionEmoji) => void {
  const client = useCallClient()
  return useMemo(() => (emoji: ReactionEmoji) => client.sendReaction(emoji), [client])
}

export function useTileReactions(participantId: string): TileReactions {
  const client = useCallClient()
  const [reactions, setReactions] = useState<readonly CallReaction[]>([])

  useEffect(
    () =>
      client.subscribeToReactions((reaction) => {
        if (reaction.participantId !== participantId) return
        setReactions((current) => [...current, reaction])
      }),
    [client, participantId],
  )

  const dismiss = useCallback((reactionId: string) => {
    setReactions((current) => current.filter((reaction) => reaction.id !== reactionId))
  }, [])

  return useMemo(() => ({ reactions, dismiss }), [reactions, dismiss])
}

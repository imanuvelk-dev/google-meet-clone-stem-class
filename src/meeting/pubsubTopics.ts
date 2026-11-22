export const TOPICS = {
  chat: 'CHAT',
  reactions: 'REACTIONS',
  handRaise: 'HAND_RAISE',
} as const

export type Topic = (typeof TOPICS)[keyof typeof TOPICS]

export const PERSIST: Record<Topic, boolean> = {
  [TOPICS.chat]: true,
  [TOPICS.handRaise]: true,
  [TOPICS.reactions]: false,
}

export const REACTION_EMOJI = ['👍', '🎉', '❤️', '😂', '😮', '😢', '🙏', '👏'] as const

export type ReactionEmoji = (typeof REACTION_EMOJI)[number]

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value)
}

export type HandRaiseVerb = 'raise' | 'lower'

export interface HandRaisePayload {
  participantId: string
}

export function isHandRaiseVerb(value: string): value is HandRaiseVerb {
  return value === 'raise' || value === 'lower'
}

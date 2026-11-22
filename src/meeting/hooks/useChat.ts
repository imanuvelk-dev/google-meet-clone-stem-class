import { useMemo, useSyncExternalStore } from 'react'
import type { ChatMessage } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface Chat {
  messages: readonly ChatMessage[]
  unreadCount: number
  send: (text: string) => void
  markRead: () => void
}

export function useChat(): Chat {
  const client = useCallClient()
  const messages = useSyncExternalStore(client.subscribe, client.getChatMessages)
  const unreadCount = useSyncExternalStore(client.subscribe, client.getChatUnreadCount)

  const commands = useMemo(
    () => ({
      send: (text: string) => client.sendChatMessage(text),
      markRead: () => client.markChatRead(),
    }),
    [client],
  )

  return useMemo(() => ({ messages, unreadCount, ...commands }), [messages, unreadCount, commands])
}

/**
 * The badge alone. Kept apart from useChat so the control bar does not subscribe
 * to the whole log to render a number.
 */
export function useChatUnreadCount(): number {
  const client = useCallClient()
  return useSyncExternalStore(client.subscribe, client.getChatUnreadCount)
}

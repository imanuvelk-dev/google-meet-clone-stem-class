import { memo, useEffect, useRef, useState } from 'react'
import { Icon } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useChat } from '@meeting/hooks/useChat.ts'
import type { ChatMessage } from '@meeting/CallClient.ts'
import { Panel } from './Panel.tsx'
import styles from './ChatPanel.module.css'

/**
 * Figma `Desktop / Meeting / Chat / Light` (52:1890) > Chat 360x1021.
 *
 * Two things the frame draws are deliberately absent, both user-settled:
 *
 * - The "Let contributors send messages" toggle. PubSub carries no authority -
 *   any client can publish to CHAT whatever a toggle says - so it would be a
 *   control that claims a power we do not have. Same rule that dropped Switch
 *   account and the remote host badge.
 * - The frame's own notice text, which advertises pinning a message. We have no
 *   pinning. The sentence rendered instead is Meet's, taken from this same
 *   file's Mobile / Meeting / Chat frame, and describes what we actually do.
 *
 * See DECISIONS.md's accepted deviations.
 */
const NOTICE = 'Messages can be seen only during the call by people in the call'

const timeOf = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Memoised per message, and keyed on the id the store synthesised. A backfill
 * landing after live messages renumbers nothing, so these do not rebuild.
 */
const Row = memo(function Row({
  message,
  isLocal,
  grouped,
}: {
  message: ChatMessage
  isLocal: boolean
  grouped: boolean
}) {
  return (
    <li className={grouped ? `${styles.row} ${styles.grouped}` : styles.row}>
      {grouped ? null : (
        <p className={styles.meta}>
          <span className={styles.sender}>{isLocal ? 'You' : message.senderName}</span>
          <span className={styles.time}>{timeOf(message.timestamp)}</span>
        </p>
      )}
      <p className={styles.text}>{message.text}</p>
    </li>
  )
})

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { messages, send, markRead } = useChat()
  const { localParticipantId } = useCall()
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLOListElement>(null)

  // Open means read. Runs on every arrival too, because a message landing in an
  // open panel has been seen.
  useEffect(() => {
    if (!open) return
    markRead()
  }, [open, markRead, messages.length])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages.length])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    send(text)
    setDraft('')
  }

  const composer = (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {/* An <input>, so useCallShortcuts' isTyping already stops Ctrl+D from
          muting the room while someone types "don't". */}
      <input
        className={styles.input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Send a message"
        aria-label="Send a message"
        data-testid="chat-input"
      />
      <button
        type="submit"
        className={styles.send}
        aria-label="Send message"
        disabled={draft.trim().length === 0}
        data-testid="chat-send"
      >
        <Icon name="send" size={24} />
      </button>
    </form>
  )

  return (
    <Panel title="In-call messages" testId="chat-panel" onClose={onClose} footer={composer}>
      <p className={styles.notice} data-testid="chat-notice">
        {NOTICE}
      </p>
      <ol className={styles.log} ref={logRef} data-testid="chat-log">
        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : undefined
          return (
            <Row
              key={message.id}
              message={message}
              // Compared at render, never baked into the message: a backfill
              // arriving before localParticipantId is set would mark your own
              // messages as someone else's permanently.
              isLocal={message.senderId === localParticipantId}
              grouped={previous?.senderId === message.senderId}
            />
          )
        })}
      </ol>
    </Panel>
  )
}

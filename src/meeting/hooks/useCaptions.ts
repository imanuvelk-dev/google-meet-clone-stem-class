import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Caption, TranscriptionState } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

const LINE_EXPIRY_MS = 5_000
const MAX_LINES = 3

export interface CaptionLine {
  participantId: string
  participantName: string
  text: string
  updatedAt: number
}

export function useCaptions(): readonly CaptionLine[] {
  const client = useCallClient()
  const [lines, setLines] = useState<readonly CaptionLine[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const expire = (participantId: string) => {
      timers.current.delete(participantId)
      setLines((current) => current.filter((line) => line.participantId !== participantId))
    }

    const onCaption = (caption: Caption) => {
      const existing = timers.current.get(caption.participantId)
      if (existing) clearTimeout(existing)
      timers.current.set(
        caption.participantId,
        setTimeout(() => expire(caption.participantId), LINE_EXPIRY_MS),
      )

      setLines((current) => {
        const without = current.filter((line) => line.participantId !== caption.participantId)
        return [
          ...without,
          {
            participantId: caption.participantId,
            participantName: caption.participantName,
            text: caption.text,
            updatedAt: caption.timestamp,
          },
        ].slice(-MAX_LINES)
      })
    }

    const unsubscribe = client.subscribeToCaptions(onCaption)
    const activeTimers = timers.current
    return () => {
      unsubscribe()
      for (const timer of activeTimers.values()) clearTimeout(timer)
      activeTimers.clear()
    }
  }, [client])

  return lines
}

export function useTranscriptionState(): TranscriptionState {
  const client = useCallClient()
  const getTranscription = useCallback(() => client.getState().transcription, [client])
  return useSyncExternalStore(client.subscribe, getTranscription)
}

export function useStartCaptions(): () => void {
  const client = useCallClient()
  return useCallback(() => client.startCaptions(), [client])
}

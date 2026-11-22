import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useCallClient } from '../CallContext.ts'

export interface Whiteboard {
  whiteboardUrl: string | null
  isActive: boolean
  start: () => void
  stop: () => void
}

export function useWhiteboard(): Whiteboard {
  const client = useCallClient()
  const getWhiteboardUrl = useCallback(() => client.getState().whiteboardUrl, [client])
  const whiteboardUrl = useSyncExternalStore(client.subscribe, getWhiteboardUrl)

  const commands = useMemo(
    () => ({
      start: () => client.startWhiteboard(),
      stop: () => client.stopWhiteboard(),
    }),
    [client],
  )

  return useMemo(
    () => ({ whiteboardUrl, isActive: whiteboardUrl !== null, ...commands }),
    [whiteboardUrl, commands],
  )
}

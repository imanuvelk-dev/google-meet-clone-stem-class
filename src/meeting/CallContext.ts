import { createContext, useContext } from 'react'
import type { CallClient } from './CallClient.ts'

/**
 * Split from CallProvider.tsx so that file exports only a component, which is
 * what React Fast Refresh needs to hot-reload it reliably. Mirrors
 * MediaClientContext.
 */
export const CallClientContext = createContext<CallClient | null>(null)

export function useCallClient(): CallClient {
  const client = useContext(CallClientContext)
  if (!client) throw new Error('useCallClient must be used inside <CallProvider>')
  return client
}

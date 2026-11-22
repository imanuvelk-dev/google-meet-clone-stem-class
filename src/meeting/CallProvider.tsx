import type { ReactNode } from 'react'
import type { CallClient } from './CallClient.ts'
import { CallClientContext } from './CallContext.ts'

/**
 * The swap point for the call. Tests mount this with a FakeCallClient; the app
 * mounts it with a VideoSdkCallClient.
 *
 * Unlike MediaProvider, `client` is required and has no default. A real call
 * cannot be constructed without a token, meeting id and display name, so a
 * default-constructed client would be a client that cannot join. Whoever knows
 * those values builds the client and memoises it, exactly as MediaProvider
 * memoises its own: a new client per render would rejoin the meeting.
 */
export function CallProvider({ client, children }: { client: CallClient; children: ReactNode }) {
  const Host = client.Host

  return (
    <CallClientContext.Provider value={client}>
      <Host>{children}</Host>
    </CallClientContext.Provider>
  )
}

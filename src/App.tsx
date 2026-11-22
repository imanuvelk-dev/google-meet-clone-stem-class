import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { MediaProvider } from '@meeting/MediaProvider.tsx'
import type { MediaClient } from '@meeting/MeetingClient.ts'
import { Room } from '@routes/Call/Room.tsx'
import type { CreateCall } from '@routes/Call/createCall.ts'
import { Landing } from '@routes/Landing/Landing.tsx'

/**
 * `mediaClient` and `createCall` are the test seams: e2e mounts the app with
 * fakes so the UI can be driven with no camera, no network, and no VideoSDK
 * minutes.
 *
 * /:meetingId is ONE route covering precall and the call. Joining swaps the view
 * in place and never changes the URL, as real Meet does, and as the precall
 * tracks require. See Room.tsx.
 */
export default function App({
  mediaClient,
  createCall,
}: { mediaClient?: MediaClient; createCall?: CreateCall } = {}) {
  return (
    <MediaProvider {...(mediaClient ? { client: mediaClient } : {})}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/:meetingId" element={<Room {...(createCall ? { createCall } : {})} />} />
        </Routes>
      </BrowserRouter>
    </MediaProvider>
  )
}

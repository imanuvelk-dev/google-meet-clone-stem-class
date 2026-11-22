import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/global.css'
import App from './App.tsx'
import { fakeCallFromUrl, fakeClientFromUrl } from './test/fakeFromUrl.ts'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found in index.html')

// Both return undefined in production, so the real clients are the only path there.
const mediaClient = fakeClientFromUrl()
const createCall = fakeCallFromUrl()

createRoot(rootElement).render(
  <StrictMode>
    <App {...(mediaClient ? { mediaClient } : {})} {...(createCall ? { createCall } : {})} />
  </StrictMode>,
)

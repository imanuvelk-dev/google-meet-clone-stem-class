import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { apiMiddleware, hasVideoSdkCredentials } from '../../scripts/lib/dev-api.ts'

/**
 * The app plus api/, on one origin and its own port, for the live suite.
 *
 * The /api dispatch itself is shared with the dev server - see
 * scripts/lib/dev-api.ts, which explains why neither can just use `vercel dev`.
 * This file only adds what the suite needs on top: a fixed port, and refusing
 * to start without credentials.
 */

const PORT = Number(process.env.LIVE_PORT ?? 3111)
const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

if (existsSync(resolvePath('../../.env'))) process.loadEnvFile(resolvePath('../../.env'))

if (!hasVideoSdkCredentials()) {
  // Loudly, and before a browser opens. Without this the suite fails as a
  // 500 from /api/rooms three layers down, which reads as a broken test.
  console.error(
    'The live suite needs real VideoSDK credentials.\n' +
      'Set VIDEOSDK_API_KEY and VIDEOSDK_SECRET in .env (see .env.example).\n' +
      'They are server-only. Never prefix them with VITE_.',
  )
  process.exit(1)
}

const vite = await createViteServer({
  server: { middlewareMode: true, port: PORT },
  appType: 'spa',
})

const serveApi = apiMiddleware()

const server = createServer((req, res) => {
  if (!serveApi(req, res)) vite.middlewares(req, res)
})

server.listen(PORT, () => console.log(`Live-suite server on http://localhost:${PORT}`))


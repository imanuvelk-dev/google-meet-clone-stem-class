import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { apiMiddleware, hasVideoSdkCredentials, MISSING_CREDENTIALS } from './scripts/lib/dev-api.ts'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Serves api/* in dev.
 *
 * Without this, `npm run dev` is plain vite, which does not know api/ exists:
 * every call 404s, so New meeting cannot create a room and Join cannot mint a
 * token. The app then reports "Check your connection and try again", which
 * sends you looking in the wrong place entirely.
 *
 * `vercel dev` is the alternative and is not a usable one: it demands an
 * interactive device-code login before serving anything.
 */
function devApi(): Plugin {
  return {
    name: 'meet-clone:dev-api',
    apply: 'serve',
    configureServer(server) {
      if (existsSync(resolvePath('./.env'))) process.loadEnvFile(resolvePath('./.env'))
      if (!hasVideoSdkCredentials()) server.config.logger.warn(`\n${MISSING_CREDENTIALS}\n`)

      const serveApi = apiMiddleware(
        (specifier) =>
          server.ssrLoadModule(specifier) as Promise<{
            default: (req: unknown, res: unknown) => unknown
          }>,
      )
      server.middlewares.use((req, res, next) => {
        if (!serveApi(req, res)) next()
      })
    },
  }
}

/**
 * Media capture needs a secure context. `localhost` already qualifies, so plain
 * `npm run dev` works for camera and mic on this machine. HTTPS matters when
 * reaching the dev server over the LAN, which is how mobile web gets tested.
 * Generate a pair with:
 *   mkcert -install && mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost <lan-ip>
 * `certs/` is gitignored, and without it we fall back to HTTP.
 */
const httpsConfig = (() => {
  const key = resolvePath('./certs/key.pem')
  const cert = resolvePath('./certs/cert.pem')
  if (!existsSync(key) || !existsSync(cert)) return undefined
  return { key: readFileSync(key), cert: readFileSync(cert) }
})()

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      '@design': resolvePath('./src/design'),
      '@meeting': resolvePath('./src/meeting'),
      '@routes': resolvePath('./src/routes'),
      '@lib': resolvePath('./src/lib'),
    },
  },
  server: {
    port: 5173,
    host: true,
    ...(httpsConfig ? { https: httpsConfig } : {}),
  },
})

import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'

/**
 * Serves api/* the way Vercel does, for local dev and the live suite.
 *
 * The endpoints are Vercel handlers, so production serves them and plain `vite`
 * does not. `vercel dev` would, but it insists on an interactive device-code
 * login before it serves anything, which no CI and no fresh clone can answer.
 *
 * It is not a Vercel emulator and must not grow into one. It passes the two
 * pieces of the request the handlers actually read (method, JSON body) and the
 * three pieces of the response they actually write (status, json, setHeader).
 */

type Handler = (req: unknown, res: unknown) => unknown

type LoadModule = (specifier: string) => Promise<{ default: Handler }>

const nodeImport: LoadModule = (specifier) =>
  import(specifier) as Promise<{ default: Handler }>

// Resolved against this file, not the caller: the two callers sit at different
// depths, and a caller-supplied resolver silently pointed outside the repo.
const ROUTES: Record<string, string> = {
  '/api/rooms': '../../api/rooms.ts',
  '/api/token': '../../api/token.ts',
}

const resolveHandler = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export function hasVideoSdkCredentials(): boolean {
  return Boolean(process.env.VIDEOSDK_API_KEY && process.env.VIDEOSDK_SECRET)
}

export const MISSING_CREDENTIALS =
  'VIDEOSDK_API_KEY and VIDEOSDK_SECRET are missing from .env, so /api/rooms and\n' +
  '/api/token cannot mint anything and joining will fail. See .env.example.\n' +
  'They are server-only. Never prefix them with VITE_.\n' +
  'The UI still runs without them: append ?fake=ok to any meeting URL.'

/**
 * Returns null for anything that is not an api/* route, so the caller can hand
 * the request on to Vite.
 */
export function apiMiddleware(
  loadModule: LoadModule = nodeImport,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const loaded = new Map<string, Promise<Handler>>()

  return (req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? ''
    const modulePath = ROUTES[path]
    if (!modulePath) return false

    let handler = loaded.get(path)
    if (!handler) {
      handler = loadModule(resolveHandler(modulePath)).then((m) => m.default)
      loaded.set(path, handler)
    }
    void serve(handler, req, res)
    return true
  }
}

async function serve(
  handler: Promise<Handler>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const vercelReq = Object.assign(req, { body: await readJsonBody(req), query: {} })
    await (await handler)(vercelReq, asVercelResponse(res))
  } catch (error) {
    console.error(`${req.url ?? ''} threw`, error)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'The handler threw' }))
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    // Vercel leaves req.body undefined on unparseable input rather than
    // throwing, and the handlers already treat a missing body as a 400.
    return undefined
  }
}

/** Vercel's res is a node res with these added. The handlers use no others. */
function asVercelResponse(res: ServerResponse) {
  return Object.assign(res, {
    status(code: number) {
      res.statusCode = code
      return this
    },
    json(body: unknown) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
      return this
    },
  })
}

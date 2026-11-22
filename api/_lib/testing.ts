import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CapturedResponse {
  res: VercelResponse
  statusCode: () => number
  body: () => unknown
}

/**
 * Minimal stand-in for Vercel's res. Captures status and JSON payload so
 * handlers can be exercised as plain functions, with no server to boot.
 */
export function createMockResponse(): CapturedResponse {
  let statusCode = 200
  let body: unknown

  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(payload: unknown) {
      body = payload
      return this
    },
    setHeader() {
      return this
    },
    end() {
      return this
    },
  } as unknown as VercelResponse

  return { res, statusCode: () => statusCode, body: () => body }
}

export function createMockRequest({
  method = 'POST',
  body = {},
}: {
  method?: string
  body?: unknown
} = {}): VercelRequest {
  return { method, body, headers: {}, query: {} } as unknown as VercelRequest
}

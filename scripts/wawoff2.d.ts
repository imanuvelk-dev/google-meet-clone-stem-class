/**
 * wawoff2 ships no types. Only the surface we use, typed honestly, so
 * fonts-build stays under strict rather than degrading to `any`.
 */
declare module 'wawoff2' {
  export function compress(input: Uint8Array): Promise<Uint8Array>
  export function decompress(input: Uint8Array): Promise<Uint8Array>
}

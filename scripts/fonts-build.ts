/**
 * Converts the Product Sans TTFs to woff2.
 *
 * The Figma only ever uses Regular 400, Medium 500, and Bold 700 - no italics,
 * no Thin/Light/Black. Shipping the other nine faces would cost ~1.2MB of
 * payload for glyphs nothing renders.
 *
 * Sources live in fonts-src/, NOT public/. Everything in public/ is copied
 * verbatim into the build, so source TTFs kept there would ship to every
 * visitor alongside the woff2 that replaced them.
 *
 * Run: npm run fonts:build
 * The generated woff2 are committed, so a clone can build without the sources.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compress } from 'wawoff2'

const SOURCE_DIR = join(import.meta.dirname, '..', 'fonts-src')
const OUTPUT_DIR = join(import.meta.dirname, '..', 'public', 'fonts')

/** Only the faces the design actually references. */
const FACES = ['ProductSans-Regular.ttf', 'ProductSans-Medium.ttf', 'ProductSans-Bold.ttf']

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`

async function main() {
  const present = new Set(await readdir(SOURCE_DIR))
  const missing = FACES.filter((face) => !present.has(face))
  if (missing.length > 0) {
    console.error(`Missing source fonts in fonts-src/: ${missing.join(', ')}`)
    process.exit(1)
  }

  let ttfTotal = 0
  let woff2Total = 0

  for (const face of FACES) {
    const ttf = await readFile(join(SOURCE_DIR, face))
    const woff2 = Buffer.from(await compress(ttf))
    const outName = face.replace(/\.ttf$/, '.woff2')
    await writeFile(join(OUTPUT_DIR, outName), woff2)

    ttfTotal += ttf.byteLength
    woff2Total += woff2.byteLength
    console.log(`${face} ${kb(ttf.byteLength)} -> ${outName} ${kb(woff2.byteLength)}`)
  }

  console.log(`\nTotal: ${kb(ttfTotal)} -> ${kb(woff2Total)}`)
}

await main()

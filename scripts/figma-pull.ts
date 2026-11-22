/**
 * Pulls everything we need out of the live Figma file into .figma/ (gitignored).
 *
 * Prerequisites: Figma Desktop open with the duplicated Meet file, connected via
 *   figma-cli connect        (Yolo Mode - patches Figma; run `figma-cli unpatch` after)
 *   figma-cli connect --safe (Safe Mode - needs the FigCli plugin running)
 *
 * Writes:
 *   .figma/DESIGN.md          full node tree, palette, type scale, token block
 *   .figma/renders/*.png      2x renders, the baseline for `npm run figma:diff`
 *
 * Then run `npm run tokens:build` to regenerate src/design/tokens.css.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, '.figma')
const RENDER_DIR = join(OUT_DIR, 'renders')
const PAGE = 'Meet'

/**
 * Frames we pull. Named, not ID'd: Figma node IDs change as the file is
 * edited, but these names are the design's own vocabulary.
 *
 * Light only - the dark THEME is deferred. See CLAUDE.md.
 *
 * `Desktop / Meeting / Light` is a deliberate wrinkle: it names the frame in
 * the Light section, but the design it holds is dark. Meet's in-call screen is
 * dark whatever your theme, so the Light and Dark sections hold pixel-identical
 * copies of it (verified: 0 of 1930176 pixels differ). The name tracks the
 * section; the darkness is the design. See CLAUDE.md.
 *
 * The `/ Light` and `/ Dark` suffixes on the Meeting frames were added by us.
 * Without them both sections' frames were named `Desktop / Meeting`, and
 * resolveFrameId's exact match returned whichever came first - a coin flip that
 * would silently pull the wrong section's frame.
 */
const FRAMES = [
  'Desktop / Home / Light',
  'Desktop / Home / Muted / Light',
  'Mobile / Home / Light',
  'Mobile / Home / Muted / Light',
  'Desktop / Meeting / Light',
  'Desktop / Meeting / Chat / Light',
  'Desktop / Meeting / People / Light',
]

const figma = (args: string[]) => execFileSync('figma-cli', args, { encoding: 'utf8' })

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/**
 * `find` prints "70:9843 [FRAME] Mobile / Meeting / People" per match.
 *
 * Ambiguity is fatal, not first-wins. The Light and Dark sections mirror each
 * other, so a name that omits the theme matches twice and the old first-match
 * silently picked whichever Figma listed first. That is how you diff a Light UI
 * against a Dark frame and spend a day believing the layout regressed.
 */
function resolveFrameId(name: string): string | null {
  const output = figma(['find', name])
  const ids: string[] = []
  for (const line of output.split('\n')) {
    const match = /^(\d+:\d+)\s+\[FRAME\]\s+(.+?)\s*$/.exec(line)
    if (match && match[2] === name && match[1]) ids.push(match[1])
  }
  if (ids.length > 1) {
    console.error(
      `Frame name "${name}" is ambiguous: ${ids.join(', ')}. ` +
        'Rename the frames so each is unique (see the Meeting frames for the convention).',
    )
    process.exit(1)
  }
  return ids[0] ?? null
}

/**
 * Every solid fill hex on the page, read straight from Figma.
 *
 * `figma-cli extract` does NOT descend into INSTANCE children, so its palette
 * silently omits any colour that only ever occurs inside an instance. That is
 * not a rare corner: the in-call mic and camera are instances of `In Call
 * Controls`, so #f9dedc (the muted button face) and #8e918f (the chevron when
 * on) exist 12 and 6 times in the file and appear in the palette zero times.
 *
 * Proven rather than assumed. #601410 sits on the instance's own fill AND on a
 * vector inside it; the palette counts 6, which is exactly the outer half.
 *
 * This matters because tokens:build verifies every mapped value against that
 * palette and fails when it cannot find one. An incomplete palette does not
 * make the build lax, it makes it reject colours that are demonstrably there,
 * which is worse: it pushes the next person into hand-editing tokens.css.
 */
function readAllFillHexes(): string[] {
  const script = `(() => {
    const hex = (c) => '#' + [c.r, c.g, c.b]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
    const page = figma.root.children.find((p) => p.name === ${JSON.stringify(PAGE)})
    if (!page) return '[]'
    const found = new Set()
    for (const node of page.findAll(() => true)) {
      const fills = node.fills
      if (!fills || fills === figma.mixed) continue
      for (const fill of fills) {
        if (fill.type === 'SOLID' && fill.visible !== false) found.add(hex(fill.color))
      }
    }
    return JSON.stringify([...found])
  })()`

  const output = figma(['eval', script])
  const match = /\[[^\]]*\]/.exec(output)
  return match ? (JSON.parse(match[0]) as string[]) : []
}

/**
 * Merges the fills extract missed into DESIGN.md's design-tokens block.
 *
 * tokens:build matches on VALUE, never on these names - extract synthesises
 * them by usage frequency and they renumber on every pull, which is the whole
 * reason token-map.json exists. So the names added here only have to be inert.
 */
function completePalette(markdown: string, hexes: string[]): { markdown: string; added: number } {
  const block = /```json design-tokens\s*\n([\s\S]*?)```/.exec(markdown)
  if (!block?.[1]) return { markdown, added: 0 }

  const tokens = JSON.parse(block[1]) as { color?: Record<string, string> }
  const color = tokens.color ?? {}
  const known = new Set(Object.values(color).map((v) => v.toLowerCase()))

  let added = 0
  for (const hex of hexes) {
    if (known.has(hex.toLowerCase())) continue
    color[`instance-fill-${++added}`] = hex
  }
  if (added === 0) return { markdown, added: 0 }

  tokens.color = color
  const replaced = '```json design-tokens\n' + JSON.stringify(tokens, null, 2) + '\n```'
  return { markdown: markdown.replace(block[0], replaced), added }
}

async function main() {
  await mkdir(RENDER_DIR, { recursive: true })

  try {
    figma(['status'])
  } catch {
    console.error(
      'Cannot reach Figma. Open the Meet file in Figma Desktop and run `figma-cli connect`.',
    )
    process.exit(1)
  }

  console.log('Extracting design...')
  const designMd = join(OUT_DIR, 'DESIGN.md')
  figma(['extract', designMd, '--pages', PAGE])

  const { markdown, added } = completePalette(await readFile(designMd, 'utf8'), readAllFillHexes())
  if (added > 0) {
    await writeFile(designMd, markdown)
    console.log(`  + ${added} fills extract missed inside instances`)
  }

  let exported = 0
  for (const frame of FRAMES) {
    const id = resolveFrameId(frame)
    if (!id) {
      // Loud, but not fatal: a renamed frame should not block the token pull.
      console.warn(`  ! frame not found, skipped: ${frame}`)
      continue
    }
    figma(['export', 'node', id, '-o', join(RENDER_DIR, `${slug(frame)}.png`), '-s', '2'])
    console.log(`  ${frame} -> ${slug(frame)}.png`)
    exported += 1
  }

  console.log(`\nDESIGN.md + ${exported}/${FRAMES.length} renders in .figma/`)
  console.log('Next: npm run tokens:build')
}

await main()

/**
 * Generates src/design/tokens.css and tokens.d.ts from the extracted Figma
 * design tokens, via the semantic map in token-map.json.
 *
 * Run: npm run tokens:build   (figma:pull must have run at least once)
 *
 * The generated files are committed, so CI and teammates build without Figma
 * access and without the Yolo-mode patch.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildTokensCss,
  buildTokensDts,
  buildTypographyCss,
  parseDesignTokens,
  type TokenMap,
} from './lib/design-tokens.ts'

const ROOT = join(import.meta.dirname, '..')
const DESIGN_MD = join(ROOT, '.figma', 'DESIGN.md')
const TOKEN_MAP = join(ROOT, 'scripts', 'token-map.json')
const OUT_DIR = join(ROOT, 'src', 'design')

async function main() {
  let markdown: string
  try {
    markdown = await readFile(DESIGN_MD, 'utf8')
  } catch {
    console.error(
      `No ${DESIGN_MD}.\nRun \`npm run figma:pull\` first, with Figma Desktop connected.`,
    )
    process.exit(1)
  }

  const tokens = parseDesignTokens(markdown)
  const rawMap = JSON.parse(await readFile(TOKEN_MAP, 'utf8')) as Record<string, unknown>

  // $-prefixed keys are documentation, not tokens.
  const map: TokenMap = Object.fromEntries(
    Object.entries(rawMap).filter(
      (entry): entry is [string, string] =>
        !entry[0].startsWith('$') && typeof entry[1] === 'string',
    ),
  )

  // The typography map is nested, since a type style is four values, not one.
  const rawTypography = (rawMap.$typography ?? {}) as Record<string, unknown>
  const typographyMap = Object.fromEntries(
    Object.entries(rawTypography).filter(
      (entry): entry is [string, string] =>
        !entry[0].startsWith('$') && typeof entry[1] === 'string',
    ),
  )

  const css = buildTokensCss(tokens, map).replace(
    /\n}\n$/,
    `\n\n${buildTypographyCss(tokens.typography, typographyMap)}\n}\n`,
  )

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'tokens.css'), css)
  await writeFile(join(OUT_DIR, 'tokens.d.ts'), buildTokensDts(map))

  const colours = Object.keys(map).filter((n) => n.startsWith('color-')).length
  const radii = Object.keys(map).filter((n) => n.startsWith('radius-')).length
  const styles = Object.keys(typographyMap).length
  console.log(
    `tokens.css: ${colours} colours, ${radii} radii, ${styles} type styles, verified against Figma.`,
  )
}

await main()

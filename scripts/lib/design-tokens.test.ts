import { describe, expect, test } from 'vitest'
import {
  buildTokensCss,
  buildTypographyCss,
  normalizeFontFace,
  parseDesignTokens,
} from './design-tokens.ts'

const DESIGN_MD = `# DESIGN.md

## 3. Color

| Token | Hex |
|---|---|
| accent | \`#0b57d0\` |

## 12. Machine-readable tokens

\`\`\`json design-tokens
{
  "$schema": "design-tokens.v1",
  "color": {
    "background": "#ffffff",
    "accent": "#0b57d0"
  },
  "radius": {
    "radius-lg-7": "100px"
  }
}
\`\`\`
`

describe('parseDesignTokens', () => {
  test('reads the machine-readable block out of DESIGN.md', () => {
    const tokens = parseDesignTokens(DESIGN_MD)

    expect(tokens.color).toEqual({ background: '#ffffff', accent: '#0b57d0' })
    expect(tokens.radius).toEqual({ 'radius-lg-7': '100px' })
  })

  test('throws when the block is missing, rather than emitting empty tokens', () => {
    // Silently generating an empty tokens.css would look like a working build
    // and break every component downstream.
    expect(() => parseDesignTokens('# DESIGN.md\n\nNo tokens here.')).toThrow(/design-tokens/)
  })

  test('throws on malformed JSON rather than swallowing it', () => {
    const broken = '```json design-tokens\n{ "color": { \n```'
    expect(() => parseDesignTokens(broken)).toThrow()
  })
})

describe('normalizeFontFace', () => {
  // Figma encodes weight into the family name and reports every face as 400.
  // Emitting that verbatim would ask for weight 400 of a family our @font-face
  // never declares, and the browser would silently synthesise the wrong weight.
  test('maps the Medium face onto weight 500 of the real family', () => {
    expect(normalizeFontFace('Product Sans Medium', 400)).toEqual({
      family: 'Product Sans',
      weight: 500,
    })
  })

  test('keeps a plain family as-is and trusts its weight', () => {
    expect(normalizeFontFace('Product Sans', 700)).toEqual({
      family: 'Product Sans',
      weight: 700,
    })
  })

  test('a plain family at 400 stays regular', () => {
    expect(normalizeFontFace('Product Sans', 400)).toEqual({
      family: 'Product Sans',
      weight: 400,
    })
  })

  test('Bold in the family name wins over a 400 weight', () => {
    expect(normalizeFontFace('Product Sans Bold', 400)).toEqual({
      family: 'Product Sans',
      weight: 700,
    })
  })

  test('SF Pro is never emitted: it is Apple-licensed and we do not ship it', () => {
    // The iOS frames use it. Mobile web gets the system stack instead.
    expect(normalizeFontFace('SF Pro Text', 400).family).toBe('system-ui')
  })

  test('Roboto survives, since it is open and genuinely used', () => {
    expect(normalizeFontFace('Roboto', 400).family).toBe('Roboto')
  })
})

describe('buildTypographyCss', () => {
  const typography = {
    h1: { fontFamily: 'Product Sans', fontSize: 28, fontWeight: 400, lineHeight: 36 },
    body: { fontFamily: 'Product Sans Medium', fontSize: 14, fontWeight: 400, lineHeight: 20 },
  }

  test('emits size, weight and line height under our semantic name', () => {
    const css = buildTypographyCss(typography, { 'text-display': 'h1' })

    expect(css).toContain('--text-display-size: 28px;')
    expect(css).toContain('--text-display-line-height: 36px;')
    expect(css).toContain('--text-display-weight: 400;')
  })

  test('normalises the family so Medium becomes weight 500 of the real family', () => {
    const css = buildTypographyCss(typography, { 'text-body': 'body' })

    expect(css).toContain('--text-body-weight: 500;')
    expect(css).toContain("--text-body-family: 'Product Sans'")
  })

  test('fails when a mapped style is missing, rather than emitting nothing', () => {
    expect(() => buildTypographyCss(typography, { 'text-body': 'does-not-exist' })).toThrow(
      /does-not-exist/,
    )
  })
})

describe('buildTokensCss', () => {
  const tokens = { color: { background: '#ffffff', accent: '#0b57d0' }, radius: {}, typography: {} }

  test('emits our semantic name bound to the Figma value', () => {
    const css = buildTokensCss(tokens, { 'color-accent-primary': '#0b57d0' })

    expect(css).toContain('--color-accent-primary: #0b57d0;')
  })

  test('never emits generated Figma names, which renumber as the file changes', () => {
    const css = buildTokensCss(tokens, { 'color-accent-primary': '#0b57d0' })

    expect(css).not.toContain('--accent')
    expect(css).not.toContain('--background')
  })

  test('marks the file as generated so nobody hand-edits it', () => {
    const css = buildTokensCss(tokens, { 'color-accent-primary': '#0b57d0' })
    expect(css).toMatch(/GENERATED|generated/)
  })

  test('fails when a mapped value no longer exists in Figma', () => {
    // This is the drift alarm. If a colour is retired or edited in Figma, the
    // build must stop rather than silently ship a stale hex.
    expect(() => buildTokensCss(tokens, { 'color-accent-primary': '#ff0000' })).toThrow(/#ff0000/)
  })

  test('drift error names the token, so the fix is obvious', () => {
    expect(() => buildTokensCss(tokens, { 'color-accent-primary': '#ff0000' })).toThrow(
      /color-accent-primary/,
    )
  })
})

/**
 * Reports how far a rendered screen is from its Figma frame, as a percentage.
 *
 * Run: npm run figma:diff            (all diffable screens)
 *      npm run figma:diff -- precall (one)
 *
 * Requires `npm run figma:pull` for the Figma PNGs and a dev server for the
 * renders, so it is a local fidelity tool rather than a CI gate. CI's gate is
 * Playwright's toHaveScreenshot, which compares against committed baselines.
 *
 * Not every screen is diffable. The landing page has no Figma frame at all, so
 * it is screenshot-reviewed instead. See CLAUDE.md.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const ROOT = join(import.meta.dirname, '..')
const RENDER_DIR = join(ROOT, '.figma', 'renders')

interface Screen {
  name: string
  /** The .figma/renders PNG produced by figma:pull. */
  figma: string
  /** Path the dev server serves. */
  route: string
  width: number
  height: number
  /**
   * Regions that can never converge, found by selector so they track the
   * layout instead of being hardcoded pixel boxes.
   *
   * The camera preview is the big one: the Figma frame contains a stock photo
   * and we render a live camera. It is 740x416 of a 1728x1117 frame, about 16%
   * of the image, so leaving it in means the score is ~entirely the photo and
   * says nothing about the layout we control.
   *
   * Masking is a real risk: mask too much and the diff flatters us. So mask by
   * the element's own box, and only where the difference is inherent rather
   * than a defect we could fix.
   */
  ignore?: string[]
  /**
   * Display name to seed into localStorage before the page loads.
   *
   * Not a mask and not a cheat: the frames depict a signed-in user who is ready
   * to join, and precall gates Join on having a name. A fresh browser has no
   * session, so an unseeded capture renders the first-run state and diffs it
   * against a frame drawn of a returning one -- the pale Join button that comes
   * out is a real difference between two different states, not a fidelity
   * problem. Seeding puts the app in the state the frame actually depicts,
   * through the same code path a returning user takes.
   */
  session?: string
  /**
   * Test ids to click, in order, once the page has loaded.
   *
   * Precall needed none: it is the landing state of its own route, so `route`
   * was the whole lever. The in-call frames are not reachable that way -- they
   * sit behind a Join click and a panel-open click, and no URL expresses that.
   * Inventing a param that deep-links into them would mean shipping a switch in
   * the app whose only caller is this script.
   *
   * Clicks rather than an arbitrary setup callback, because that is all these
   * screens actually need, and a callback would invite the harness to start
   * staging states the app cannot reach on its own. Playwright's click already
   * waits for actionability, so each step waits for the last one to land.
   */
  click?: string[]
  /**
   * Must be visible before the screenshot is taken. Hard-exits if it is not.
   *
   * The guard for `click`, and it is not optional in spirit: every `ignore`
   * selector here resolves whether or not the panel ever opened, so a click that
   * silently did nothing would screenshot a closed panel and report it as a
   * layout regression rather than as a broken harness.
   */
  ready?: string
}

/** Clicked in both in-call screens: precall's Join, then the panel's own button. */
const JOIN = '[data-testid="join-button"]'

const SCREENS: Screen[] = [
  {
    name: 'precall',
    figma: 'desktop-home-light.png',
    route: '/design-chat?fake=ok',
    width: 1728,
    height: 1117,
    // The Figma's stock photo vs our live camera. Inherent, not a defect.
    ignore: ['[data-testid="camera-preview"]'],
    session: 'Raymond Van',
  },
  /*
   * Both in-call frames draw the same roster -- you muted with the camera on,
   * Lucy Xu camera-off, Kimberly Reynolds camera-on -- which is exactly what the
   * `three` scenario models, so both diff against it with only the panel
   * differing.
   *
   * Only the two camera-on tiles are masked. The frames fill them with stock
   * photography and we render a fake camera pattern, the same inherent
   * difference precall's preview carries. Lucy Xu's camera-off tile is
   * deliberately NOT masked: its backdrop and avatar are ours to get right, and
   * ParticipantTile already carries the reasoning for why it looks as it does.
   */
  {
    name: 'chat',
    figma: 'desktop-meeting-chat-light.png',
    route: '/design-chat?fake=ok&fake_call=three',
    width: 1728,
    height: 1117,
    ignore: [
      '[data-testid="participant-video-local-1"]',
      '[data-testid="participant-video-remote-2"]',
    ],
    session: 'Raymond Van',
    click: [JOIN, '[data-testid="control-chat"]'],
    ready: '[data-testid="chat-panel"]',
  },
  {
    name: 'people',
    figma: 'desktop-meeting-people-light.png',
    route: '/design-chat?fake=ok&fake_call=three',
    width: 1728,
    height: 1117,
    ignore: [
      '[data-testid="participant-video-local-1"]',
      '[data-testid="participant-video-remote-2"]',
    ],
    session: 'Raymond Van',
    click: [JOIN, '[data-testid="control-people"]'],
    ready: '[data-testid="people-panel"]',
  },
]

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Figma exports at 2x, so renders must be captured at 2x to compare at all. */
const SCALE = 2

/** Long enough for a panel to finish sliding in. Only paid by `ready` screens. */
const TRANSITION_MS = 500

async function loadPng(path: string): Promise<PNG> {
  return PNG.sync.read(await readFile(path))
}

const BASE_URL = process.env.DIFF_BASE_URL ?? 'http://localhost:5173'

/** Captures the live screen at the Figma's own size and 2x scale. */
async function capture(screen: Screen, outputPath: string): Promise<Box[]> {
  const browser = await chromium.launch({
    // It is -stream, not -capture. Chrome ignores unknown switches silently, so
    // the misspelling this file shipped with read as working while every capture
    // opened the real camera and microphone. playwright.config.ts was corrected
    // on 2026-07-15; this script was missed. See CLAUDE.md.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  try {
    const page = await browser.newPage({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: SCALE,
      reducedMotion: 'reduce',
    })
    if (screen.session) {
      // Only the name: the app derives the avatar colour from it, and copying
      // that rule into the harness would let the two drift apart.
      await page.addInitScript(
        (name: string) => localStorage.setItem('meet-clone:display-name', name),
        screen.session,
      )
    }
    await page.goto(`${BASE_URL}${screen.route}`, { waitUntil: 'networkidle' })

    for (const selector of screen.click ?? []) await page.locator(selector).click()

    if (screen.click?.length) {
      // A click leaves the pointer on the button, which pops its tooltip and
      // holds it open for the screenshot. The frame has no tooltip, so leaving it
      // there would diff a hover state against a resting one -- an artifact this
      // script would have created and then measured. Parked at the top-left,
      // which is the meeting clock and has nothing to hover.
      await page.mouse.move(0, 0)
    }

    if (screen.ready) {
      // Not an expect(): this is a script, and a screenshot of the wrong state is
      // worse than no screenshot at all -- it would be read as a fidelity number.
      await page.locator(screen.ready).waitFor({ state: 'visible' })
      // Panels transition in. Screenshotting mid-slide would move every pixel
      // right of the grid and report it as deviation.
      await page.waitForTimeout(TRANSITION_MS)
    }

    // Fonts must be in before we measure text. Typed via a cast: this callback
    // runs in the browser, but scripts/ typecheck under the Node project.
    await page.evaluate('document.fonts.ready')
    await page.screenshot({ path: outputPath })

    const boxes: Box[] = []
    for (const selector of screen.ignore ?? []) {
      const box = await page.locator(selector).first().boundingBox()
      if (!box) {
        // A mask that silently fails to resolve would leave the region in the
        // diff and look like a layout regression.
        console.error(`Ignore selector "${selector}" matched nothing on ${screen.name}.`)
        process.exit(1)
      }
      boxes.push(box)
    }
    return boxes
  } catch (error) {
    console.error(
      `Could not capture ${screen.name} from ${BASE_URL}. Is \`npm run dev\` running?\n${String(error)}`,
    )
    process.exit(1)
  } finally {
    await browser.close()
  }
}

function report(name: string, ratio: number, diffPath: string) {
  const percent = (ratio * 100).toFixed(2)
  const verdict = ratio < 0.01 ? 'PASS' : ratio < 0.05 ? 'CLOSE' : 'FAIL'
  console.log(`${verdict}  ${name.padEnd(16)} ${percent}% of pixels differ  -> ${diffPath}`)
}

async function diffScreen(screen: Screen): Promise<number> {
  const figmaPath = join(RENDER_DIR, screen.figma)
  if (!existsSync(figmaPath)) {
    console.error(`Missing ${screen.figma}. Run \`npm run figma:pull\` with Figma connected.`)
    process.exit(1)
  }

  const renderedPath = join(RENDER_DIR, `rendered-${screen.name}.png`)
  const ignored = await capture(screen, renderedPath)

  const [figma, rendered] = await Promise.all([loadPng(figmaPath), loadPng(renderedPath)])

  if (figma.width !== rendered.width || figma.height !== rendered.height) {
    // Comparing different-sized images would silently produce a meaningless
    // number, so refuse rather than resize.
    console.error(
      `${screen.name}: size mismatch. Figma ${figma.width}x${figma.height}, ` +
        `rendered ${rendered.width}x${rendered.height}. ` +
        `Capture at ${screen.width}x${screen.height} @${SCALE}x.`,
    )
    process.exit(1)
  }

  // Paint masked regions the same flat colour in both, so they contribute zero
  // difference. Their area is then removed from the denominator too: leaving it
  // in would quietly shrink the percentage and flatter every future change.
  let maskedPixels = 0
  for (const box of ignored) {
    fill(figma, box)
    maskedPixels += fill(rendered, box)
  }

  const diff = new PNG({ width: figma.width, height: figma.height })
  const differing = pixelmatch(figma.data, rendered.data, diff.data, figma.width, figma.height, {
    threshold: 0.2,
  })

  const diffPath = join(RENDER_DIR, `diff-${screen.name}.png`)
  await writeFile(diffPath, PNG.sync.write(diff))

  const comparable = figma.width * figma.height - maskedPixels
  const ratio = differing / comparable
  report(screen.name, ratio, diffPath)
  if (maskedPixels > 0) {
    const percentMasked = ((maskedPixels / (figma.width * figma.height)) * 100).toFixed(1)
    // Never let a mask be silent. A quietly excluded region reads as coverage.
    console.log(
      `      (${percentMasked}% masked as inherently different: ${screen.ignore?.join(', ')})`,
    )
  }
  return ratio
}

/** Flattens a region in both images. Returns the pixel count it covered. */
function fill(image: PNG, box: Box): number {
  const left = Math.round(box.x * SCALE)
  const top = Math.round(box.y * SCALE)
  const right = Math.min(Math.round((box.x + box.width) * SCALE), image.width)
  const bottom = Math.min(Math.round((box.y + box.height) * SCALE), image.height)

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (image.width * y + x) << 2
      image.data[offset] = 0
      image.data[offset + 1] = 0
      image.data[offset + 2] = 0
      image.data[offset + 3] = 255
    }
  }
  return (right - left) * (bottom - top)
}

async function main() {
  const requested = process.argv[2]
  const screens = requested ? SCREENS.filter((s) => s.name === requested) : SCREENS

  if (screens.length === 0) {
    console.error(`Unknown screen "${requested}". Known: ${SCREENS.map((s) => s.name).join(', ')}`)
    process.exit(1)
  }

  for (const screen of screens) await diffScreen(screen)

  console.log(
    '\nA render will never hit 0%: the Figma frame contains a stock photo and an\n' +
      'account avatar we do not have. Read the diff PNG, do not chase the number.',
  )
}

await main()

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

interface Needle {
  needle: string
  source: string
}

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')

const NEEDLES: Needle[] = [
  { needle: 'Ada Lovelace', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'Anita Borg', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'Unknown fake scenario', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'Unknown fake call scenario', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'the call fake only exists in fake mode', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'Fake token failure', source: 'src/test/fakeFromUrl.ts' },
  { needle: '__fakeCall', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'speaker-routing', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'Some Other Speakers', source: 'src/test/fakeFromUrl.ts' },
  { needle: 'No such participant', source: 'src/meeting/FakeCallClient.ts' },
  { needle: 'HD Pro Webcam C920', source: 'src/meeting/FakeMediaClient.ts' },
  { needle: 'Yeti Stereo Microphone', source: 'src/meeting/FakeMediaClient.ts' },
  { needle: 'MacBook Pro Speakers', source: 'src/meeting/FakeMediaClient.ts' },
]

function fail(lines: string[]): never {
  console.error(lines.join('\n'))
  process.exit(1)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function selfCheck(): void {
  const sources = new Map<string, string>()
  const missing: string[] = []

  for (const { needle, source } of NEEDLES) {
    let text = sources.get(source)
    if (text === undefined) {
      try {
        text = readFileSync(join(ROOT, source), 'utf8')
      } catch {
        fail([
          `check-dist: cannot read ${source}, which NEEDLES claims to canary.`,
          'The gate proves nothing until NEEDLES is updated to point at the file the fakes now live in.',
        ])
      }
      sources.set(source, text)
    }
    if (!text.includes(needle)) missing.push(`  "${needle}" is no longer in ${source}`)
  }

  if (missing.length > 0) {
    fail([
      'check-dist: THIS GATE CURRENTLY PROVES NOTHING.',
      'Each needle below was greped for in dist/ but no longer exists in the source it came from,',
      'so the grep would pass forever regardless of what the bundle contains.',
      ...missing,
      '',
      'Fix: update NEEDLES in scripts/check-dist.ts to string literals that still exist in the fakes.',
      'See docs/DECISIONS.md, testing policy, for why this self-check is here.',
    ])
  }
}

function main(): void {
  try {
    if (!statSync(DIST).isDirectory()) throw new Error('not a directory')
  } catch {
    fail(['check-dist: dist/ is missing. Run this after vite build.'])
  }

  selfCheck()

  const files = walk(DIST)
  const hits: string[] = []

  for (const file of files) {
    const text = readFileSync(file, 'latin1')
    for (const { needle } of NEEDLES) {
      if (text.includes(needle)) hits.push(`  ${relative(ROOT, file)} contains "${needle}"`)
    }
  }

  if (hits.length > 0) {
    fail([
      'check-dist: THE DEV-ONLY TEST DOUBLES REACHED THE PRODUCTION BUNDLE.',
      '',
      ...hits,
      '',
      'The ?fake= switch is meant to be dead code in production: it fakes the camera and',
      'grants isHost, so shipping it is a real bug, not a test convenience. Something broke the',
      'import.meta.env.DEV guard in src/test/fakeFromUrl.ts or the tree-shaking that depends on it -',
      'a module-scope call to the fake factories, or a build run with --mode development.',
      'See docs/DECISIONS.md, testing policy.',
    ])
  }

  console.log(
    `check-dist: ok - ${String(NEEDLES.length)} fake-mode canaries absent from ${String(files.length)} files in dist/`,
  )
}

main()

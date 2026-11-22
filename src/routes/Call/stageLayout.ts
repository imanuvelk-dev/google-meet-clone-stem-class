import type { IconName } from '@design/primitives/index.ts'
import type { VideoQuality } from '@meeting/CallClient.ts'

/**
 * The stage's arithmetic, kept out of the components so it can be reasoned about
 * without a DOM. Every constant here is measured from the Figma Meeting frame
 * (42:6675) rather than chosen, and each one names the node it came from.
 */

/** Figma: `grid` (I64:2563;58:1190) is a column with gap 17; each `row` is a row with gap 16. */
export const COLUMN_GAP_PX = 16
export const ROW_GAP_PX = 17

/** Meet's tiled view maxes out at 49. Beyond that, people paginate. */
export const MAX_TILES_PER_PAGE = 49

/**
 * The side strip in the pinned and presenting layouts.
 *
 * Not from the Figma - it has no frame for either layout. Six is what fits the
 * 1021px stage at the strip's width without scrolling, and a strip that scrolls
 * would hide participants from the pause policy, which only knows about pages.
 */
export const MAX_STRIP_TILES = 6

/**
 * Meet's "Auto" is deliberately absent: it is an undocumented heuristic, so ours
 * would be a guess wearing Meet's label. Settled with the user.
 */
export type LayoutMode = 'tiled' | 'spotlight' | 'sidebar'

export interface LayoutOption {
  mode: LayoutMode
  label: string
  icon: IconName
}

export const LAYOUTS: LayoutOption[] = [
  { mode: 'tiled', label: 'Tiled', icon: 'grid_view' },
  { mode: 'spotlight', label: 'Spotlight', icon: 'account_box' },
  { mode: 'sidebar', label: 'Sidebar', icon: 'view_sidebar' },
]

export type Arrangement = 'tiled' | 'spotlight' | 'sidebar'

/**
 * A pin or a share pulls Tiled into Sidebar: both say one thing is worth looking
 * at, and a grid of equals has no way to say so. An explicit Spotlight or Sidebar
 * is already focused and is never overridden.
 */
export function arrangementFor(layout: LayoutMode, focused: boolean): Arrangement {
  if (layout !== 'tiled') return layout
  return focused ? 'sidebar' : 'tiled'
}

export interface GridShape {
  cols: number
  rows: number
}

/**
 * Tiles per row, by count and by which way round the stage is.
 *
 * ceil(sqrt(n)) on the stage's long axis reproduces every tile count Meet's own
 * "maximum tiles" control offers - 6 as 3x2, 9 as 3x3, 16 as 4x4, 30 as 6x5, 49
 * as 7x7 - and gives 2x2 for three people, which is what the Figma frame draws.
 *
 * It is deliberately not an area-maximising search over the container. At this
 * stage's 1.66 aspect, maximising area would stack two people one above the
 * other rather than side by side, because two full-width 16:9 tiles really are
 * bigger than two half-width ones. Meet still puts them side by side, so Meet is
 * not maximising area, and neither are we.
 */
export function gridShape(count: number, portrait: boolean): GridShape {
  if (count <= 1) return { cols: 1, rows: 1 }

  const major = Math.ceil(Math.sqrt(count))
  const minor = Math.ceil(count / major)

  return portrait ? { cols: minor, rows: major } : { cols: major, rows: minor }
}

/** Rows of ids, in roster order. A short last row is centred by the CSS, per the Figma. */
export function rowsOf<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols))
  return rows
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function pageOf<T>(items: readonly T[], page: number, pageSize: number): readonly T[] {
  return items.slice(page * pageSize, page * pageSize + pageSize)
}

/**
 * What we consume of each publisher, by how many of them are on screen.
 *
 * The thresholds are VideoSDK's own layout guidance. Three is high rather than
 * med: the guide says "under 3" and "4-6", which leaves 3 unnamed, and a 3-tile
 * grid gives each publisher a third of a 1728px stage - the case the frame
 * itself draws, and not a case for degrading.
 */
export function qualityForVisibleCount(count: number): VideoQuality {
  if (count <= 3) return 'high'
  if (count <= 6) return 'med'
  return 'low'
}

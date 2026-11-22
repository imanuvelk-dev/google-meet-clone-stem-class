import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ParticipantTile, type ParticipantTileProps } from './ParticipantTile.tsx'
import { gridShape, rowsOf } from './stageLayout.ts'
import styles from './TileGrid.module.css'

export interface TileGridProps {
  participantIds: readonly string[]
  activeSpeakerId: string | null
  pinnedParticipantId: string | null
  localParticipantId: string | null
  onTogglePin: ParticipantTileProps['onTogglePin']
}

/**
 * Meet's tiled view, per Figma node I64:2563;58:1190 - rows of equal height, the
 * last one centred when it is short.
 *
 * Rows are real elements rather than a CSS grid's implicit ones because the
 * short-row centring the frame draws (one 840px tile at x=428 of 1696) is what a
 * flex row with justify-content: center does for free, and what a grid needs
 * per-item column arithmetic to fake.
 */
export function TileGrid({
  participantIds,
  activeSpeakerId,
  pinnedParticipantId,
  localParticipantId,
  onTogglePin,
}: TileGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const portrait = usePortrait(ref)

  const { cols } = gridShape(participantIds.length, portrait)
  const rows = rowsOf(participantIds, cols)

  return (
    <div
      ref={ref}
      className={styles.grid}
      // The count is the one thing CSS cannot work out for itself, so it is the
      // one thing handed to it. Everything else is derived in the stylesheet.
      style={{ '--cols': cols } as CSSProperties}
      data-testid="tile-grid"
      data-cols={cols}
      data-rows={rows.length}
    >
      {rows.map((row) => (
        // Keyed by who is in it, not by index: a row's identity is its
        // occupants, and an index key would re-key every tile below a departure.
        <div key={row.join('|')} className={styles.row}>
          {row.map((id) => (
            <div key={id} className={styles.cell}>
              <ParticipantTile
                participantId={id}
                isActiveSpeaker={id === activeSpeakerId}
                isPinned={id === pinnedParticipantId}
                isLocal={id === localParticipantId}
                onTogglePin={onTogglePin}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Which way round the stage is, so the grid can turn 3x2 into 2x3 on a narrow
 * window rather than serving letterbox slots.
 *
 * Measured rather than queried: the column count decides the DOM's row structure,
 * so it has to exist in JS before render, and a container query can only reach
 * CSS. The first paint assumes landscape, which is the desktop case and the one
 * the Figma draws; a portrait stage corrects once the observer settles.
 *
 * It follows the SETTLED stage, not every intermediate frame: a change of column
 * count re-keys every row and remounts every tile, so a mid-animation reading
 * would do that in the middle of the panel's slide. See DECISIONS.md's Motion
 * section.
 */
const SETTLE_MS = 100

function usePortrait(ref: React.RefObject<HTMLElement | null>): boolean {
  const [portrait, setPortrait] = useState(false)

  useEffect(() => {
    const element = ref.current
    // jsdom has no ResizeObserver and no layout to observe. Falling back to
    // landscape there is not a compromise: it is the assumption the frame is
    // drawn at, and a stage's shape is a thing only a real browser has.
    if (!element || typeof ResizeObserver === 'undefined') return

    let timer: ReturnType<typeof setTimeout> | undefined

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (!box || box.width === 0 || box.height === 0) return
      const next = box.height > box.width
      clearTimeout(timer)
      timer = setTimeout(() => setPortrait(next), SETTLE_MS)
    })
    observer.observe(element)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref])

  return portrait
}

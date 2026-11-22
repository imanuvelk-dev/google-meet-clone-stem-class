import { IconButton } from '@design/primitives/index.ts'
import type { Arrangement } from './stageLayout.ts'
import styles from './PageControls.module.css'

/**
 * Meet's page controls. Not in the Figma - the frame draws three people, and
 * three people never paginate - so this follows the live product and is
 * screenshot-review material, not diff material.
 */
export function PageControls({
  page,
  pages,
  layout,
  onChange,
}: {
  page: number
  pages: number
  /** Tiled floats these over the grid's edges; the strip stacks them under it. */
  layout: Arrangement
  onChange: (page: number) => void
}) {
  return (
    <div
      className={[styles.controls, layout === 'tiled' ? styles.overGrid : styles.underStrip].join(
        ' ',
      )}
      data-testid="page-controls"
    >
      <IconButton
        icon="arrow_back"
        label="Previous page"
        variant="overlay"
        className={styles.button}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        data-testid="page-previous"
      />
      {/*
        role="status": the tiles change under you when the page does, and the
        count is the only thing that says where you have landed.
      */}
      <span className={styles.counter} role="status" data-testid="page-counter">
        {`${page + 1} / ${pages}`}
      </span>
      <IconButton
        icon="arrow_forward"
        label="Next page"
        variant="overlay"
        className={styles.button}
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
        data-testid="page-next"
      />
    </div>
  )
}

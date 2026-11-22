import { Icon } from '@design/primitives/index.ts'
import type { QualityLimitation } from '@meeting/CallClient.ts'
import styles from './NetworkIndicator.module.css'

/**
 * `cpu` is not a network problem and must not say it is. It means this machine
 * cannot keep up, which is a different thing to do something about. It was
 * expected to start mattering once Phase 3 added background blur; blur was cut,
 * so it now only fires for encoding on a loaded machine. See DECISIONS.md.
 */
const MESSAGES: Record<QualityLimitation['type'], string> = {
  congestion: 'Your network connection is unstable',
  bandwidth: 'Your network connection is unstable',
  cpu: 'Your device is running low on resources',
}

/**
 * Meet's network indicator, driven by onQualityLimitation. Not in the Figma: the
 * frame draws a healthy call. Live-sourced, so screenshot-review material.
 *
 * The seam only ever holds a limitation while it is 'detected' - a 'resolved'
 * clears it to null - so there is nothing to render until something is wrong,
 * which is exactly Meet's behaviour.
 */
export function NetworkIndicator({ limitation }: { limitation: QualityLimitation | null }) {
  if (!limitation) return null

  return (
    <p className={styles.indicator} role="status" data-testid="network-indicator">
      <Icon name="signal_cellular_alt" size={20} />
      {MESSAGES[limitation.type]}
    </p>
  )
}

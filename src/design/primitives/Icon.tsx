import styles from './Icon.module.css'
import { ICON_PATHS, ICON_VIEW_BOX, type IconName } from './icon-paths.ts'

export type { IconName }

export interface IconProps {
  name: IconName
  /** Rendered px. Material Symbols are designed on a 24px grid. */
  size?: number
  className?: string
}

/**
 * Material Symbols glyph, inlined. No icon font is fetched at runtime, so icons
 * cannot flash in late or fail behind a CSP.
 *
 * Decorative by default: an icon inside a labelled control must not be
 * announced twice. Controls carry their own accessible name.
 */
export function Icon({ name, size = 24, className }: IconProps) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      width={size}
      height={size}
      viewBox={ICON_VIEW_BOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

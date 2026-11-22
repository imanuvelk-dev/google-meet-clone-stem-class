import type { CSSProperties } from 'react'
import styles from './Avatar.module.css'

export interface AvatarProps {
  name: string
  /** Background colour, from the session's generated identity. */
  color: string
  /**
   * A number is px. A CSS length is passed through, so a caller can size this
   * against something the layout only knows at paint time - a call tile's avatar
   * scales with the tile via container units, not at breakpoints.
   */
  size?: number | string
}

/**
 * Guest avatar: an initial on a generated colour. We have no OAuth and so no
 * profile pictures, which matches Meet's guest-join path.
 */
export function Avatar({ name, color, size = 32 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      // Through a custom property rather than width/height/font-size directly:
      // the initial's size is derived from the box in CSS, and only CSS can do
      // that arithmetic when the box is given in units it has to resolve itself.
      style={{ '--avatar-size': typeof size === 'number' ? `${size}px` : size, backgroundColor: color } as CSSProperties}
      // The name is already rendered as text beside every avatar we show, so
      // announcing it here would just repeat it.
      aria-hidden="true"
      data-testid="avatar"
    >
      {initialOf(name)}
    </span>
  )
}

function initialOf(name: string): string {
  // Intl-safe first character: [...str] splits by code point, so an emoji or an
  // astral-plane name does not become half a surrogate pair.
  const trimmed = name.trim()
  return trimmed ? ([...trimmed][0] ?? '?').toUpperCase() : '?'
}

import { cloneElement, useId, useState, type ReactElement } from 'react'
import styles from './Tooltip.module.css'

export interface TooltipProps {
  /** The tooltip text. Also the accessible description of the child. */
  content: string
  children: ReactElement<{ 'aria-describedby'?: string | undefined }>
  placement?: 'top' | 'bottom'
}

/**
 * Hover/focus tooltip.
 *
 * Shows on focus as well as hover: a tooltip only a mouse can reach is not a
 * tooltip for everyone. The text is a description, never the control's only
 * name, so a control still announces itself with the tooltip closed.
 */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {/*
        The description has to be wired onto the CHILD, not merely rendered
        nearby: an aria-describedby-less tooltip is decoration a screen reader
        never reaches, which for our disabled controls would hide the only
        explanation of why they refuse. Pointed at the tooltip only while it
        exists, since describedby at a missing id resolves to nothing.
      */}
      {cloneElement(children, { 'aria-describedby': visible ? id : undefined })}
      {visible ? (
        <span role="tooltip" id={id} className={`${styles.tooltip} ${styles[placement]}`}>
          {content}
        </span>
      ) : null}
    </span>
  )
}

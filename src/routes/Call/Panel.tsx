import type { ReactNode } from 'react'
import { Icon } from '../../design/primitives/index.ts'
import styles from './Panel.module.css'

export interface PanelProps {
  title: string
  testId: string
  onClose: () => void
  children: ReactNode
  /** Chat's composer. Sits outside .body so the log scrolls under it. */
  footer?: ReactNode
}

export function Panel({ title, testId, onClose, children, footer }: PanelProps) {
  return (
    <aside className={styles.panel} data-testid={testId} aria-label={title}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          data-testid={`${testId}-close`}
        >
          <Icon name="close" size={24} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </aside>
  )
}

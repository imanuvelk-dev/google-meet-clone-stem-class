import styles from './Spinner.module.css'

export interface SpinnerProps {
  size?: number
  /** Announced to screen readers. Null for a purely decorative spinner. */
  label?: string | null
}

export function Spinner({ size = 24, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      data-testid="spinner"
    />
  )
}

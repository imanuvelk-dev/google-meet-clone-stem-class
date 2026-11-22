import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon.tsx'
import styles from './IconButton.module.css'

export type IconButtonVariant = 'standard' | 'overlay' | 'danger'
export type IconButtonSize = 'medium' | 'large'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /**
   * Required. The icon itself is aria-hidden, so without this the control is
   * announced as an unlabelled button.
   */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
}

export function IconButton({
  icon,
  label,
  variant = 'standard',
  size = 'medium',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[styles.iconButton, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size === 'large' ? 24 : 20} />
    </button>
  )
}

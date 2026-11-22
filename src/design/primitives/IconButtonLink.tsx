import type { AnchorHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon.tsx'
import type { IconButtonSize, IconButtonVariant } from './IconButton.tsx'
import styles from './IconButton.module.css'

export interface IconButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: IconName
  label: string
  href: string
  variant?: IconButtonVariant
  size?: IconButtonSize
}

export function IconButtonLink({
  icon,
  label,
  variant = 'standard',
  size = 'medium',
  className,
  ...rest
}: IconButtonLinkProps) {
  return (
    <a
      aria-label={label}
      title={label}
      className={[styles.iconButton, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size === 'large' ? 24 : 20} />
    </a>
  )
}

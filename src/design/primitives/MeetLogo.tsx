export interface MeetLogoProps {
  size?: number
}

export function MeetLogo({ size = 32 }: MeetLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M6 10h12v12H6z" fill="var(--color-brand-blue)" />
      <path d="M18 14l8-5v14l-8-5z" fill="var(--color-brand-green)" />
      <path d="M6 10h6l-6 6z" fill="var(--color-brand-yellow)" />
      <path d="M12 22h6v-4l-6 4z" fill="var(--color-brand-red)" />
    </svg>
  )
}
